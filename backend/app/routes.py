# ---------------------------------------------------------------------------
# Standard library
# ---------------------------------------------------------------------------
import os
import sys
import io
import json
import hmac
import math
import uuid
import html
import time
import random
import base64
import shutil
import hashlib
import textwrap
import asyncio
import subprocess
import tempfile
import threading
import traceback
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Union
from app.services import parse_iso_datetime
from app.session_store import get_session, set_session, delete_session as delete_cached_session
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from interview_graphs import run_followup_graph

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ---------------------------------------------------------------------------
# Third-party
# ---------------------------------------------------------------------------
import bcrypt
import jwt
import requests
import cloudinary
import cloudinary.uploader
import cloudinary.api
import cloudinary.utils
import edge_tts
import pypdf
from bson import ObjectId

def process_temp_cloudinary_upload(temp_url: str, collection_name: str, field_name: str):
    if not temp_url or not temp_url.startswith("temp://"):
        return
    import os
    import cloudinary.uploader
    from mongo_db import interviews_collection, interview_sessions_collection
    filename = temp_url.replace("temp://", "")
    temp_path = os.path.join(os.getcwd(), "temp_uploads", filename)
    
    if os.path.exists(temp_path):
        try:
            with open(temp_path, "rb") as f:
                content_bytes = f.read()
            upload_res = cloudinary.uploader.upload(
                content_bytes,
                resource_type="raw",
                folder="jds" if "jd" in field_name.lower() else "resumes",
                public_id=filename
            )
            secure_url = upload_res.get("secure_url")
            
            if collection_name == "interviews":
                interviews_collection.update_many({field_name: temp_url}, {"$set": {field_name: secure_url}})
            elif collection_name == "interview_sessions":
                interview_sessions_collection.update_many({field_name: temp_url}, {"$set": {field_name: secure_url}})
        except Exception as e:
            print(f"Background upload failed: {e}")
        finally:
            try:
                os.remove(temp_path)
            except:
                pass

MAIN_LOOP = None

def broadcast_profile_update(admin_id: str, company_id: str, credits: int = None, login_enabled: bool = None, extra: dict = None):
    from redis_manager import manager
    import json
    import asyncio
    
    payload = {
        "type": "profile_update",
        "admin_id": str(admin_id),
        "company_id": str(company_id or ""),
    }
    if credits is not None:
        payload["credits"] = credits
    if login_enabled is not None:
        payload["login_enabled"] = login_enabled
    if extra:
        payload.update(extra)
        
    async def _send():
        if manager.redis:
            await manager.redis.publish("dashboard:updates", json.dumps(payload))
        else:
            await manager.broadcast_dashboard(payload)
            
    global MAIN_LOOP
    if MAIN_LOOP and MAIN_LOOP.is_running():
        asyncio.run_coroutine_threadsafe(_send(), MAIN_LOOP)
    else:
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(_send(), loop)
            else:
                loop.run_until_complete(_send())
        except RuntimeError:
            asyncio.run(_send())

from bson.errors import InvalidId
from docx import Document
from dotenv import load_dotenv
from groq import AsyncGroq

def process_temp_cloudinary_upload(temp_url: str, collection_name: str, field_name: str):
    if not temp_url or not temp_url.startswith("temp://"):
        return
    import os
    import cloudinary.uploader
    filename = temp_url.replace("temp://", "")
    temp_path = os.path.join(os.getcwd(), "temp_uploads", filename)
    
    if os.path.exists(temp_path):
        try:
            with open(temp_path, "rb") as f:
                content_bytes = f.read()
            upload_res = cloudinary.uploader.upload(
                content_bytes,
                resource_type="raw",
                folder="jds" if "jd" in field_name.lower() else "resumes",
                public_id=filename
            )
            secure_url = upload_res.get("secure_url")
            
            if collection_name == "interviews":
                interviews_collection.update_many({field_name: temp_url}, {"$set": {field_name: secure_url}})
            elif collection_name == "interview_sessions":
                interview_sessions_collection.update_many({field_name: temp_url}, {"$set": {field_name: secure_url}})
        except Exception as e:
            print(f"Background upload failed: {e}")
        finally:
            try:
                os.remove(temp_path)
            except:
                pass
from pydantic import BaseModel, validator, Field
from starlette.background import BackgroundTask

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile,
    WebSocket, WebSocketDisconnect, BackgroundTasks, Header
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# ---------------------------------------------------------------------------
# Internal / project
# ---------------------------------------------------------------------------
from ai_client import chat_completion, extract_json, current_session_id
from analyze_answer import analyze_answer
from coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from redis_manager import manager
import transcription
from routes import voice_routes
from mongo_db import client as mongo_client

from .models import *
from .database import *
from .config import *
from . import omni_dimension_client
from .services import *
from app.live_monitoring_security import (
    MONITORING_SCOPE,
    admin_can_access_session,
    create_monitoring_token,
    decode_monitoring_token,
    validate_snapshot_dataurl,
)
from app.candidate_auth import require_active_candidate

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

candidate_monitoring_security = HTTPBearer(auto_error=False)


def _create_candidate_monitoring_token(link_id: str, interview_id: str, duration_minutes: int) -> str:
    """Issue a short-lived token that can only publish telemetry for one session."""
    return create_monitoring_token(
        JWT_SECRET_KEY,
        ALGORITHM,
        link_id,
        interview_id,
        duration_minutes,
    )


def _validate_candidate_monitoring_token(token: str, link_id: str) -> Dict[str, Any]:
    try:
        payload = decode_monitoring_token(JWT_SECRET_KEY, ALGORITHM, token, link_id)
    except (jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired monitoring token") from exc

    session = interview_sessions_collection.find_one(
        {"link_id": link_id},
        {
            "link_id": 1,
            "interview_id": 1,
            "company_id": 1,
            "created_by": 1,
            "status": 1,
            "is_deactivated": 1,
        },
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("is_deactivated") or session.get("status") != "started":
        raise HTTPException(status_code=403, detail="This interview session is not active")

    token_interview_id = str(payload.get("interview_id") or "")
    session_interview_id = str(session.get("interview_id") or "")
    if token_interview_id and session_interview_id and not hmac.compare_digest(token_interview_id, session_interview_id):
        raise HTTPException(status_code=403, detail="Monitoring token is no longer valid for this interview")
    return session


def _require_candidate_session(
    credentials: Optional[HTTPAuthorizationCredentials],
    *,
    link_id: Optional[str] = None,
    interview_id: Optional[str] = None,
    allow_completed: bool = False,
) -> Dict[str, Any]:
    """Authorize a candidate operation against the session-scoped bearer token."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Candidate session token is required")

    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired candidate session token") from exc

    token_link_id = str(payload.get("link_id") or "")
    token_interview_id = str(payload.get("interview_id") or "")
    if payload.get("scope") != MONITORING_SCOPE or not token_link_id:
        raise HTTPException(status_code=401, detail="Invalid candidate session token scope")
    if link_id and not hmac.compare_digest(token_link_id, str(link_id)):
        raise HTTPException(status_code=403, detail="Candidate token does not match this session")
    if interview_id and not hmac.compare_digest(token_interview_id, str(interview_id)):
        raise HTTPException(status_code=403, detail="Candidate token does not match this interview")

    session = interview_sessions_collection.find_one(
        {"link_id": token_link_id},
        {"link_id": 1, "interview_id": 1, "status": 1, "is_deactivated": 1},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("is_deactivated"):
        raise HTTPException(status_code=403, detail="This interview session is deactivated")

    session_interview_id = str(session.get("interview_id") or "")
    if session_interview_id and not hmac.compare_digest(token_interview_id, session_interview_id):
        raise HTTPException(status_code=403, detail="Candidate token is no longer valid for this interview")

    allowed_statuses = {"started", "completed"} if allow_completed else {"started"}
    if session.get("status") not in allowed_statuses:
        raise HTTPException(status_code=403, detail="This interview session is not active")
    return session


def _require_admin_session_access(session: Dict[str, Any], current_admin: Dict[str, Any]) -> None:
    """Enforce tenant isolation and per-recruiter ownership for normal admins."""
    role = current_admin.get("role")
    if role == "master":
        return
    if session.get("company_id") != current_admin.get("company_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    if role == "admin" and str(session.get("created_by") or "") != str(current_admin.get("admin_id") or ""):
        raise HTTPException(status_code=403, detail="Access denied to another recruiter's interview")


def _get_authorized_live_session(link_id: str, current_admin: Dict[str, Any]) -> Dict[str, Any]:
    """Authorize live-monitoring access with tenant isolation."""
    role = current_admin.get("role")
    if role not in {"admin", "super_admin", "master"}:
        raise HTTPException(status_code=403, detail="Live monitoring access is required")

    session = interview_sessions_collection.find_one(
        {"link_id": link_id},
        {"link_id": 1, "company_id": 1, "created_by": 1, "status": 1},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not admin_can_access_session(current_admin, session):
        raise HTTPException(status_code=403, detail="Access denied to this session")
    return session


def _decode_dashboard_websocket_admin(token: str) -> Dict[str, str]:
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        admin_id = str(payload.get("sub") or "")
        role = str(payload.get("role") or "")
        if not admin_id or role not in {"admin", "super_admin", "master"}:
            raise ValueError("Invalid dashboard role")
        admin_doc = admins_collection.find_one(
            {"_id": ObjectId(admin_id)},
            {"company_id": 1, "role": 1, "login_enabled": 1},
        )
        if not admin_doc or admin_doc.get("login_enabled") is False:
            raise ValueError("Account is unavailable")
        return {
            "admin_id": admin_id,
            "role": str(admin_doc.get("role") or role),
            "company_id": str(admin_doc.get("company_id") or payload.get("company_id") or ""),
        }
    except (jwt.PyJWTError, ValueError, TypeError, InvalidId) as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired dashboard token") from exc


@router.get("/admin/last-error")
def get_last_error(current_admin: dict = Depends(get_current_admin_details)):
    return LAST_422_ERROR or {"status": "no errors"}

@router.get("/api/plans")
def get_plans():
    plans_list = []
    try:
        plans_cursor = plans_collection.find({})
        for p in plans_cursor:
            if p.get("plan_name", "").lower() == "owner":
                continue
            plans_list.append({
                "id": str(p["_id"]),
                "plan_name": p.get("plan_name", "Unknown Plan"),
                "credits": p.get("credits_granted", 0),
                "price": p.get("price", 0),
                "features": p.get("features", []),
                "summary": p.get("summary", "")
            })
    except Exception as e:
        print(f"[API Plans] MongoDB error: {e}. Falling back to default plans.")
    
    # Fallback to in-memory PLAN_DEFINITIONS if MongoDB collection is empty
    if not plans_list:
        for key, plan in PLAN_DEFINITIONS.items():
            if key == "owner":
                continue
            plans_list.append({
                "id": key,
                "plan_name": plan["label"],
                "credits": plan["credits_granted"],
                "price": plan["price"],
                "features": plan["features"],
                "summary": plan["summary"]
            })
            
    return {"status": "success", "data": plans_list}

class RazorpayOrderRequest(BaseModel):
    plan_name: str
    amount_inr: float
    credits: int


# Startup functions (to be called by main.py lifespan)
def startup_event_cloudinary():
    global CLOUDINARY_CLEANUP_STARTED
    if not CLOUDINARY_CLEANUP_STARTED:
        import threading
        threading.Thread(target=cloudinary_cleanup_loop, daemon=True).start()
        CLOUDINARY_CLEANUP_STARTED = True


# In-memory storage (replace with database in production)
    # interviews = {}


def sync_session_status(session: dict, current_time: datetime = None) -> str:
    """
    Computes the accurate status of an interview session, updating the DB if it has expired.
    Returns the final status string (e.g., 'pending', 'started', 'completed', 'expired').
    """
    if current_time is None:
        current_time = datetime.now(timezone.utc)
        
    status = session.get("status", "pending")
    if session.get("is_deactivated", False):
        return status

    # Check pending expiration
    if status == "pending" and session.get("expires_at"):
        try:
            exp_dt = datetime.fromisoformat(session["expires_at"].replace('Z', '+00:00'))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if current_time > exp_dt:
                status = "expired"
                if "_id" in session:
                    interview_sessions_collection.update_one({"_id": session["_id"]}, {"$set": {"status": "expired"}})
                session["status"] = status
        except Exception:
            pass
            
    # Check started expiration
    elif status == "started":
        time_ref_str = session.get("started_at") or session.get("created_at")
        if time_ref_str:
            try:
                time_ref = datetime.fromisoformat(time_ref_str.replace('Z', '+00:00'))
                if time_ref.tzinfo is None:
                    time_ref = time_ref.replace(tzinfo=timezone.utc)
                duration_mins = int(session.get("interview_duration") or 30)
                buffer_mins = max(120, duration_mins * 2)
                if (current_time - time_ref).total_seconds() > (buffer_mins * 60):
                    status = "expired"
                    if "_id" in session:
                        interview_sessions_collection.update_one({"_id": session["_id"]}, {"$set": {"status": "expired"}})
                    session["status"] = status
            except Exception:
                pass
                
    return status
def get_or_create_candidate(name: str) -> str:
    row = candidates_collection.find_one({"name": name})

    if row:
        return str(row["_id"])

    custom_id = get_next_sequence_value("candidate", "CAN")
    result = candidates_collection.insert_one({
        "name": name,
        "custom_id": custom_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return str(result.inserted_id)


def load_interview_from_db(interview_id: str) -> Optional[Dict[str, Any]]:
    row = interviews_collection.find_one({"id": interview_id})
    if not row:
        return None

    try:
        loaded_questions = json.loads(row.get("questions", "[]"))
    except Exception:
        loaded_questions = []

    interview = {
        "id": interview_id,
        "source": row.get("source"),
        "profile_text": row.get("profile_text", ""),
        "questions": loaded_questions,
        "answers": {},
        "created_at": row.get("created_at"),
        "coding_round": row.get("coding_round"),
        "case_study_round": row.get("case_study_round"),
    }
    set_session(interview_id, interview)
    return interview


def get_interview_or_404(interview_id: str) -> Dict[str, Any]:
    interview = get_session(interview_id) or load_interview_from_db(interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


def get_answer_history(interview_id: str) -> List[Dict[str, Any]]:
    return list(answers_collection.find({"interview_id": interview_id}).sort("question_id", 1))


def build_answer_summary(answers_data: List[Dict[str, Any]]) -> str:
    if not answers_data:
        return "No completed verbal answers were found."

    blocks = []
    for item in answers_data[-5:]:
        answer_text = (item.get("answer_text") or "").strip()
        if len(answer_text) > 280:
            answer_text = answer_text[:280].rstrip() + "..."
        blocks.append(
            f"Question: {item.get('question_text', '')}\n"
            f"Answer: {answer_text}\n"
            f"AI Score: {item.get('ai_score', 0)}"
        )
    return "\n\n".join(blocks)


def persist_coding_round(interview_id: str, coding_round: Dict[str, Any]) -> None:
    interview = get_session(interview_id)
    if interview:
        interview["coding_round"] = coding_round
        set_session(interview_id, interview)
    interviews_collection.update_one(
        {"id": interview_id},
        {"$set": {"coding_round": coding_round}},
        upsert=False,
    )


def build_coding_test_payload(coding_round: Dict[str, Any]) -> Dict[str, Any]:
    task = coding_round.get("task", {})
    test_cases = task.get("test_cases", [])
    visible = [case for case in test_cases if case.get("visible")]
    hidden = [case for case in test_cases if not case.get("visible")]
    return {
        "visible_cases": [
            {
                "id": case.get("id"),
                "input": case.get("input"),
                "output": case.get("expected"),
            }
            for case in visible[:3]
        ],
        "hidden_case_count": len(hidden[:4]),
        "total_case_count": len(test_cases[:7]),
    }


@router.post("/generate-next-question")
def api_gen_next_question(
    req: NextQuestionRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    if not get_session(req.interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")
        
    interview = get_session(req.interview_id)
    followup_streak = interview.get("followup_streak", 0)

    # ── BUGFIX: Prevent Follow-ups from hijacking the interview ──
    # Find current question and evaluate skip conditions BEFORE calling the AI
    current_idx = -1
    for i, q in enumerate(interview["questions"]):
        if int(q["id"]) == req.current_question_id:
            current_idx = i
            break
            
    if current_idx == -1:
        raise HTTPException(status_code=400, detail="Current question ID not found")
        
    current_q = interview["questions"][current_idx]
    q_type = current_q.get("type", "").lower()
    q_cat = current_q.get("category", "").lower()
    
    # 1. Skip follow-ups for Intros, Custom Questions, Closing, and existing Follow-ups
    if "self-intro" in q_type or "introduction" in q_type:
        return {"skip_followup": True, "reason": "Skip follow-up for intro"}
    if "follow-up" in q_type or "jd-based" in q_type:
        return {"skip_followup": True, "reason": "Already a follow-up"}
    if "custom" in q_cat:
        return {"skip_followup": True, "reason": "Skip follow-up for custom questions"}
    if "closing" in q_cat or "future" in q_cat or "closing" in q_type:
        return {"skip_followup": True, "reason": "Skip follow-up for closing"}

    # 2. Check if we already have a follow-up (avoid infinite expansion if re-running)
    if current_idx + 1 < len(interview["questions"]):
         next_q = interview["questions"][current_idx+1]
         if "follow-up" in next_q.get("type", "").lower() or "jd-based" in next_q.get("type", "").lower():
             return {"skip_followup": True, "reason": "Next question is already a follow-up"}

    
    try:
        # Generate the question
        language = interview.get("language", "English")
        new_question = run_followup_graph(
            req.answer_text, 
            interview.get("profile_text", ""),
            interview.get("job_description", ""),
            req.current_question_id,
            followup_streak,
            language
        )
        
        if followup_streak >= 3:
            interview["followup_streak"] = 0
        else:
            interview["followup_streak"] = followup_streak + 1

    except Exception as e:
        # If API fails, return a 503 so frontend catches it and moves to next pre-generated question
        raise HTTPException(status_code=503, detail="AI generation failed")
    
    # Assign the inserted follow-up ID explicitly
    new_question["id"] = int(current_q["id"]) + 1
    
    # Shift IDs of subsequent questions to make room for the new follow-up
    for q in interview["questions"][current_idx+1:]:
        q["id"] = int(q["id"]) + 1
             
    interview["questions"].insert(current_idx + 1, new_question)
    
    try:
        # Update DB first to prevent partial persistence
        interviews_collection.update_one(
            {"id": req.interview_id}, 
            {"$set": {"questions": json.dumps(interview["questions"])}}
        )
        # If DB succeeds, update fast-cache
        set_session(req.interview_id, interview)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save follow-up question")
        
    return new_question


@router.post("/parse-resume")
async def parse_resume(
    file: UploadFile = File(...),
    source: str = Form("resume"),
    upload_to_cloud: bool = Form(False)
):
    ALLOWED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and TXT are allowed for security reasons.")
    
    if getattr(file, "size", 0) and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
    try:
        print(f"Uploading file with source: {source}, upload_to_cloud: {upload_to_cloud}")

        # Read file content
        content = file.file.read()

        # Extract text based on file type
        content_str = extract_text_from_file(content, file.filename)

        if not content_str.strip():
            raise HTTPException(status_code=400, detail="No readable text found in the file")

        file_url = None
        if upload_to_cloud:
            import cloudinary.uploader
            try:
                # Seek back to 0 before uploading
                file.file.seek(0)
                upload_res = cloudinary.uploader.upload(
                    file.file,
                    resource_type="raw",
                    folder="jds" if source == 'jd' else "resumes",
                    public_id=f"{uuid.uuid4().hex[:8]}_{file.filename}"
                )
                file_url = upload_res.get("secure_url")
            except Exception as e:
                print(f"Cloudinary upload failed: {e}")
                # We do not fail the whole process if upload fails, just continue without URL

        if source == "jd":
            return {
                "text": content_str.strip(),
                "file_url": file_url
            }

        # Generate interview ID
        interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        # Analyze the resume
        import asyncio
        from starlette.concurrency import run_in_threadpool
        try:
            profile_analysis = await asyncio.wait_for(
                run_in_threadpool(analyze_resume_or_jd, content_str), 
                timeout=15.0
            )
        except asyncio.TimeoutError:
            profile_analysis = {"error": "Analysis timed out"}
        except Exception as e:
            profile_analysis = {"error": str(e)}

        # Generate questions
        questions = generate_mock_questions(content_str, source)

        if not questions:
            raise HTTPException(status_code=400, detail="Failed to generate questions")

        # Store interview data (RAM)
        set_session(interview_id, {
            "id": interview_id,
            "source": source,
            "profile_text": content_str[:5000], # Store more text
            "profile_analysis": profile_analysis,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Store interview data (DB)
        try:
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content_str[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "file_url": file_url
            })
        except Exception as db_e:
            print(f" DB Save Error: {db_e}")


        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")

@router.post("/start-interview")
@router.post("/start-interview/")
async def start_interview(
    content: str = Form(...),
    source: str = Form("resume")
):
    try:
        print(f"Starting interview with source: {source}")

        interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        # ✅ STEP-3.2 → AI ANALYSIS (CORRECT PLACE)
        import asyncio
        from starlette.concurrency import run_in_threadpool
        try:
            profile_analysis = await asyncio.wait_for(
                run_in_threadpool(analyze_resume_or_jd, content), 
                timeout=15.0
            )
        except asyncio.TimeoutError:
            profile_analysis = {"error": "Analysis timed out"}
        except Exception as e:
            profile_analysis = {"error": str(e)}

        # Generate questions based on Source (Resume vs JD)
        questions = generate_mock_questions(content, source)

        if not questions:
            raise HTTPException(status_code=400, detail="Failed to generate questions")

        # ✅ STEP-3.3 → STORE ANALYSIS HERE (RAM)
        set_session(interview_id, {
            "id": interview_id,
            "source": source,
            "profile_text": content[:5000],
            "profile_analysis": profile_analysis,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Store interview data (DB)
        try:
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        except Exception as db_e:
            print(f" DB Save Error: {db_e}")

        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import asyncio
from collections import defaultdict
_question_generation_locks = defaultdict(asyncio.Lock)

@router.post("/generate-more-questions")
@router.post("/generate-more-questions/")
async def generate_more_questions_endpoint(
    interview_id: str = Form(...),
    asked_question_ids: str = Form(""),
    count: int = Form(5),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """
    Generate additional questions for an interview session when the candidate
    finishes all questions but still has time left on the clock.
    Returns only NEW questions not already asked.
    """
    _require_candidate_session(credentials, interview_id=interview_id)
    try:
        from starlette.concurrency import run_in_threadpool

        async with _question_generation_locks[interview_id]:
            # Fetch session from RAM or DB
            session = get_session(interview_id)
            if not session:
                row = interviews_collection.find_one({"id": interview_id})
                if row:
                    try:
                        session_row = interview_sessions_collection.find_one({"interview_id": interview_id}) or {}
                        loaded_questions = json.loads(row.get("questions", "[]"))
                        session = {
                            "id": interview_id,
                            "source": row.get("source"),
                            "profile_text": row.get("profile_text", ""),
                            "questions": loaded_questions,
                            "answers": {},
                            "industry": row.get("industry") or row.get("industry_type") or session_row.get("industry") or session_row.get("industry_type") or "General",
                            "interview_type": row.get("interview_type") or session_row.get("interview_type") or "Technical",
                            "language": row.get("language") or session_row.get("language") or "English"
                        }
                        set_session(interview_id, session)
                    except Exception:
                        pass

            if not session:
                raise HTTPException(status_code=404, detail="Interview session not found")
            profile_text = session.get("profile_text", "")
            source = session.get("source", "resume")
            existing_questions = session.get("questions", [])

            # Parse IDs of already-asked questions to avoid repeats
            asked_ids = set()
            if asked_question_ids:
                for aid in asked_question_ids.split(","):
                    aid = aid.strip()
                    if aid:
                        asked_ids.add(str(aid))

            already_asked_texts = {
                str(q.get("question") or q.get("text") or "").lower().strip()
                for q in existing_questions
                if str(q.get("id", "")) in asked_ids or asked_ids == set()
            }

            # Generate a new batch of questions — request extra to survive duplicate filtering
            new_questions = await run_in_threadpool(
                generate_mock_questions,
                text=profile_text,
                source=source,
                num_questions=count + 8,
                interview_type=session.get("interview_type", "Technical"),
                industry=session.get("industry", "General"),
                language=session.get("language", "English")
            )

            # Filter out questions already asked (text-similarity check)
            fresh_questions = []
            for q in new_questions:
                q_text = str(q.get("question") or q.get("text") or "").lower().strip()
                is_duplicate = any(
                    q_text in asked or asked in q_text
                    for asked in already_asked_texts
                    if len(asked) > 10  # skip very short strings
                )
                if not is_duplicate:
                    fresh_questions.append(q)
                if len(fresh_questions) >= count:
                    break

            # Assign fresh IDs starting after the last existing question
            start_id = len(existing_questions) + 1
            for i, q in enumerate(fresh_questions):
                q["id"] = start_id + i
                q["text"] = q.get("question") or q.get("text") or ""
                q["type"] = q.get("type") or "Interview"

            # Persist the newly generated questions back to session and DB
            session["questions"].extend(fresh_questions)
            set_session(interview_id, session)
            interviews_collection.update_one(
                {"id": interview_id},
                {"$set": {"questions": json.dumps(session["questions"])}}
            )

            return {
                "status": "success",
                "questions": fresh_questions,
                "count": len(fresh_questions)
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /generate-more-questions: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate more questions. Please try again later.")

@router.get("/interview/{interview_id}/question/{question_id}")

def get_question(interview_id: str, question_id: int):
    # Restore from DB if not in RAM
    if not get_session(interview_id):
        row = interviews_collection.find_one({"id": interview_id})
        if row:
            print(f" Restoring interview {interview_id} from DB...")
            try:
                loaded_questions = json.loads(row.get("questions", "[]"))
                set_session(interview_id, {
                    "id": interview_id,
                    "source": row.get("source"),
                    "profile_text": row.get("profile_text"),
                    "questions": loaded_questions,
                    "answers": {},
                    "created_at": row.get("created_at")
                })
            except Exception as e:
                print(f"Restore failed: {e}")
    
    if not get_session(interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    
    interview = get_session(interview_id)
    # Ensure ID comparison works (cast both to int)
    question = next((q for q in interview["questions"] if int(q["id"]) == int(question_id)), None)
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    return {
        "current_question": question,  # This key must match what your HTML looks for
        "total_questions": len(interview["questions"]),
        "interview_id": interview_id
    }
# Add this import at the top

@router.post("/upload-answer")
def upload_answer(
    interview_id: str = Form(...),
    question_id: int = Form(...),
    video: UploadFile = File(...)
):
    # Endpoint is incomplete and not used by the current frontend.
    # Return 501 Not Implemented instead of causing syntax or runtime errors.
    raise HTTPException(status_code=501, detail="Upload answer with video is not implemented yet.")

def sync_session_to_application(link_id: str):
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        if not session:
            return
            
        app_id = session.get("application_id")
        candidate_email = session.get("candidate_email")
        company_id = session.get("company_id")
        
        app_record = None
        if app_id:
            from bson import ObjectId
            try:
                app_record = job_applications_collection.find_one({"_id": ObjectId(app_id)})
            except:
                pass
                
        if not app_record and candidate_email and company_id:
            jobs = list(jobs_collection.find({"company_id": company_id}))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            app_record = job_applications_collection.find_one({
                "email": {"$regex": f"^{candidate_email.strip()}$", "$options": "i"},
                "job_id": {"$in": job_ids}
            })
            
        if app_record:
            avg_score = session.get("avg_score")
            if avg_score is None:
                interview_id = session.get("interview_id")
                if interview_id:
                    answers = list(answers_collection.find({"interview_id": interview_id}))
                    scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
                    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
                    
            strengths = session.get("strengths_summary") or ""
            weaknesses = session.get("weaknesses_summary") or ""
            feedback = ""
            if strengths or weaknesses:
                feedback = f"Strengths:\n{strengths}\n\nWeaknesses:\n{weaknesses}"
                
            update_fields = {
                "hireiq_interview_status": session.get("status") or "completed",
                "hireiq_score": avg_score or 0.0,
                "hireiq_feedback": feedback,
                "hireiq_resume_text": session.get("resume_text", ""),
                "hireiq_job_description_text": session.get("job_description_text", ""),
                "hireiq_recommendation": session.get("overall_recommendation") or "No recommendation",
                "hireiq_completion_time": session.get("updated_at") or session.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "hireiq_final_result": session.get("decision") or "pending",
                "detected_accent": session.get("detected_accent") or "Unknown"
            }
            
            if session.get("status") == "completed":
                if avg_score is not None:
                    update_fields["score"] = avg_score
                if session.get("decision"):
                    update_fields["decision"] = session["decision"]
                    
            job_applications_collection.update_one(
                {"_id": app_record["_id"]},
                {"$set": update_fields}
            )
            print(f"✅ Synced HireIQ interview {link_id} status to application {app_record['_id']}.")
    except Exception as e:
        print(f"⚠️ Error syncing interview to application: {e}")

@router.get("/interview/{interview_id}/summary")
def get_interview_summary(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Get a summary of the interview including all questions and answers."""
    _require_candidate_session(credentials, interview_id=interview_id, allow_completed=True)
    if not get_session(interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    
    interview = get_session(interview_id)
    return {
        "interview_id": interview_id,
        "source": interview["source"],
        "created_at": interview["created_at"],
        "total_questions": len(interview["questions"]),
        "questions_answered": len(interview["answers"]),
        "questions": interview["questions"],
        "answers": interview["answers"]
    }


class ChatRequest(BaseModel):
    message: str
@router.post("/chat")
def chat(req: ChatRequest, current_admin: dict = Depends(get_current_admin_details)):
    try:
        reply = chat_completion(
            messages=[
                {"role": "system", "content": "You are a helpful interview assistant. Keep responses short."},
                {"role": "user", "content": req.message}
            ],
            model="openai/gpt-4o-mini"
        )
        return {"reply": reply}
    except Exception as e:
        logger.exception("Admin chat completion failed")
        return {"reply": "Sorry, I am currently unavailable."}

class AnswerRequest(BaseModel):
    interview_id: str
    candidate_name: str
    question_id: int
    question_text: str
    answer_text: str
    


@router.post("/save-answer")
def save_answer(
    interview_id: str = Form(...),
    question_id: str = Form(...),
    question_text: str = Form(...),
    answer_text: str = Form(...),
    candidate_name: str = Form("Candidate"),
    time_spent_seconds: str = Form("0"),
    time_limit_seconds: str = Form("120"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    candidate_session = _require_candidate_session(credentials, interview_id=interview_id)
    current_session_id.set(interview_id)
    from app.answer_service import persist_answer_and_enqueue_scoring

    try:
        result = persist_answer_and_enqueue_scoring(
            interview_id=interview_id,
            question_id=question_id,
            question_text=question_text,
            answer_text=answer_text,
            candidate_name=candidate_session.get("candidate_name") or candidate_name,
            time_spent_seconds=time_spent_seconds,
            time_limit_seconds=time_limit_seconds,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return {
        **result,
        "ai_score": None,
        "message": "Answer saved. Scoring is running in the background.",
    }

    print(f"⚡ Instant save for Q{question_id} ➝ AI scoring in background...")

    # ── STEP 1: Get context (fast — RAM first) ──────────────────────────────
    context = ""
    language = "English"
    try:
        row = interviews_collection.find_one({"id": interview_id})
        if row:
            source = row.get("source", "Resume")
            profile_text = row.get("profile_text", "")
            context = f"Candidate's {source}: {profile_text}"
            language = row.get("language", "English")
    except Exception as e:
        print(f" Context fetch error: {e}")

    # ── STEP 2: Save to MongoDB INSTANTLY with pending status ───────────────
    try:
        t_spent = int(float(time_spent_seconds)) if time_spent_seconds.lower() != 'nan' else 0
    except:
        t_spent = 0
        
    try:
        t_limit = int(float(time_limit_seconds)) if time_limit_seconds.lower() != 'nan' else 120
    except:
        t_limit = 120

    answers_collection.delete_many({"interview_id": interview_id, "question_id": question_id})
    answers_collection.insert_one({
        "interview_id": interview_id,
        "question_id": question_id,
        "question_text": question_text,
        "answer_text": answer_text,
        "ai_score": None,
        "content_score": None,
        "relevance_score": None,
        "time_score": None,
        "time_spent_seconds": t_spent,
        "time_limit_seconds": t_limit,
        "ai_feedback": "Scoring in progress...",
        "ai_keywords": "",
        "corrected_answer": "Scoring in progress...",
        "scoring_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # ── STEP 3: Fire AI scoring in a Celery background task ──────────────────
    from app import tasks
    tasks.score_answer_task.delay(
        interview_id=interview_id,
        question_id=question_id,
        question_text=question_text,
        answer_text=answer_text,
        context=context,
        time_spent_seconds=t_spent,
        time_limit_seconds=t_limit,
        language=language
    )

    # ── STEP 4: Return INSTANTLY to the candidate ───────────────────────────
    return {
        "status": "saved",
        "scoring_status": "pending",
        "ai_score": None,
        "message": "Answer saved! Scoring is running in the background."
    }



# ─── NEW: Save Behavioral / Proctoring Metrics per Question ───────────────────
class BehavioralData(BaseModel):
    interview_id: str
    question_id: str
    wpm: float = 0
    pause_count: int = 0
    filler_count: int = 0
    time_spent_seconds: int = 0
    keyword_match_pct: float = 0
    tab_switches: int = 0
    face_alerts: int = 0
    noise_alerts: int = 0

@router.post("/save-behavioral-data")
def save_behavioral_data(
    data: BehavioralData,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Saves per-question behavioral and proctoring metrics"""
    _require_candidate_session(credentials, interview_id=data.interview_id, allow_completed=True)
    try:
        # Check if this is a case study question
        is_case_study = False
        idx = -1
        if "cs_" in str(data.question_id):
            is_case_study = True
            try:
                idx = int(str(data.question_id).replace("cs_", ""))
            except:
                pass

        if is_case_study and idx >= 0:
            interview = interviews_collection.find_one({"id": data.interview_id})
            if interview and "case_study_round" in interview:
                answers = interview["case_study_round"].get("answers", [])
                if idx < len(answers):
                    if answers[idx] is None:
                        answers[idx] = {}

                    answers[idx]["wpm"] = data.wpm
                    answers[idx]["pause_count"] = data.pause_count
                    answers[idx]["filler_count"] = data.filler_count
                    answers[idx]["time_spent_seconds"] = data.time_spent_seconds
                    answers[idx]["tab_switches"] = data.tab_switches
                    answers[idx]["face_alerts"] = data.face_alerts
                    answers[idx]["noise_alerts"] = data.noise_alerts

                    interviews_collection.update_one(
                        {"id": data.interview_id},
                        {"$set": {"case_study_round.answers": answers}}
                    )

        else:
            update_fields = {
                "wpm": data.wpm,
                "pause_count": data.pause_count,
                "filler_count": data.filler_count,
                "keyword_match_pct": data.keyword_match_pct,
                "tab_switches": data.tab_switches,
                "face_alerts": data.face_alerts,
                "noise_alerts": data.noise_alerts
            }

            # Preserve existing time if the frontend sends the default value.
            if data.time_spent_seconds and data.time_spent_seconds > 0:
                update_fields["time_spent_seconds"] = data.time_spent_seconds

            answers_collection.update_many(
                {"interview_id": data.interview_id, "question_id": data.question_id},
                {"$set": update_fields}
            )
        return {"status": "ok"}
    except Exception as e:
        print(f"Behavioral save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CodingRoundStartRequest(BaseModel):
    interview_id: str

class CodingRoundCheckpointRequest(BaseModel):
    interview_id: str
    code: str = ""
    explanation: str = ""
    language: str = "python"


class CodingRoundSubmitRequest(CodingRoundCheckpointRequest):
    pass


class CodingRoundRunRequest(CodingRoundCheckpointRequest):
    pass


class CodingRoundObserveRequest(CodingRoundCheckpointRequest):
    pass


@router.post("/coding-round/start")
async def start_coding_round(
    req: CodingRoundStartRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    import asyncio
    from fastapi.concurrency import run_in_threadpool

    interview = get_interview_or_404(req.interview_id)
    answers_data = get_answer_history(req.interview_id)

    existing_round = interview.get("coding_round") or {}
    if existing_round.get("task"):
        return {
            "interview_id": req.interview_id,
            "coding_round": existing_round,
            "tests": build_coding_test_payload(existing_round),
            "resumed": True,
        }

    interview_type = interview.get("interview_type", "Technical")
    profile_text = interview.get("profile_text", "")

    # Get industry from the session
    link_id = interview.get("link_id", "")
    session = interview_sessions_collection.find_one({"link_id": link_id}) if link_id else None
    industry = (session or {}).get("industry", "General")

    # generate_coding_task calls an LLM (blocking I/O) — run it off the event loop
    task = await run_in_threadpool(
        generate_coding_task, profile_text, answers_data, interview_type, industry
    )

    coding_round = {
        "status": "active",
        "task": task,
        "answer_summary": build_answer_summary(answers_data),
        "language": task.get("recommended_language", "python"),
        "latest_code": "",
        "latest_explanation": "",
        "latest_feedback": "",
        "checkpoints": [],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    persist_coding_round(req.interview_id, coding_round)
    return {
        "interview_id": req.interview_id,
        "coding_round": coding_round,
        "tests": build_coding_test_payload(coding_round),
        "resumed": False,
    }


# ── CASE STUDY ROUND (Non-Technical) ─────────────────────────────────────────

class CaseStudyStartRequest(BaseModel):
    interview_id: str

class CaseStudyAnswerRequest(BaseModel):
    interview_id: str
    question_index: int
    answer_text: str

def _generate_case_study_questions_ai(job_description: str, num_questions: int, profile_text: str = "", industry: str = "General", language: str = "English") -> list:
    """Generate case study questions using AI based on JD skills."""
    system_prompt = f"""You are an expert HR interviewer who creates deep, scenario-based case study questions for the '{industry}' industry.
    
    CRITICAL REQUIREMENT: You MUST generate the questions and scenarios STRICTLY in the {language} language. Do NOT use English unless {language} is English.
    
You must return ONLY a valid JSON array of objects. Each object must have:
- "scenario": A detailed real-world business scenario (3-5 sentences) situated in the '{industry}' industry that places the candidate in a specific situation
- "question": The specific question asking what the candidate would do
- "skill_tested": The key skill being evaluated (e.g., "Team Management", "Conflict Resolution")
- "evaluation_criteria": Array of 3-4 things to look for in the answer

IMPORTANT: Do NOT ask coding or technical questions. Focus on leadership, management, communication, problem-solving, and business strategy scenarios relevant to the '{industry}' sector."""

    user_prompt = f"""Based on the following Job Description, create exactly {num_questions} scenario-based case study questions.

Job Description:
{job_description[:1500]}

{f'Candidate Profile: {profile_text[:500]}' if profile_text else ''}

Extract key non-technical skills from the JD (like team management, stakeholder communication, project planning, conflict resolution, etc.) and create realistic business scenarios that test those skills.

Each scenario should describe a specific situation the candidate might face in this role, and ask them to write their strategy/approach.

Return ONLY a JSON array. Example format:
[
  {{
    "scenario": "You have just joined as a Project Manager and discover that two senior team members have a long-standing disagreement about the project architecture...",
    "question": "How would you handle this situation to ensure project delivery stays on track while maintaining team morale?",
    "skill_tested": "Conflict Resolution & Team Management",
    "evaluation_criteria": ["Problem identification", "Stakeholder management", "Communication strategy", "Resolution approach"]
  }}
]"""

    try:
        from ai_client import chat_completion
        response_text = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        # Extract JSON array from response
        import json, re
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            questions = json.loads(json_match.group())
            if isinstance(questions, list) and len(questions) > 0:
                validated_questions = []
                for q in questions:
                    # Normalize keys to handle AI inconsistencies
                    norm_q = {str(k).lower(): v for k, v in q.items()}
                    
                    scenario = norm_q.get("scenario") or norm_q.get("situation", "")
                    question_text = norm_q.get("question") or norm_q.get("task", "")
                    skill = norm_q.get("skill_tested", "Scenario")
                    eval_criteria = norm_q.get("evaluation_criteria", [])
                    
                    if scenario and question_text:
                        validated_questions.append({
                            "scenario": scenario,
                            "question": question_text,
                            "skill_tested": skill,
                            "evaluation_criteria": eval_criteria
                        })
                        
                if validated_questions:
                    return validated_questions[:num_questions]
    except Exception as e:
        print(f"[CASE STUDY] AI generation failed: {e}")
    
    return None  # Signal to use offline fallback


def _generate_case_study_questions_offline(job_description: str, num_questions: int, industry: str = "General", language: str = "English") -> list:
    """Generate offline case study questions by extracting skills from JD."""
    jd_lower = job_description.lower()
    
    # Map of skills to scenario templates
    from industry_fallback_data import INDUSTRY_CASE_STUDIES
    # Try to get specific industry scenarios first
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_CASE_STUDIES
            lang_cases = OFFLINE_LANGUAGE_CASE_STUDIES.get(language, [])
            if lang_cases:
                import random
                selected = random.sample(lang_cases, min(num_questions, len(lang_cases)))
                results = []
                for idx, c in enumerate(selected):
                    sep = "।" if "।" in c else "."
                    parts = c.split(sep, 1)
                    if len(parts) > 1 and parts[1].strip():
                        scenario = parts[0].strip() + sep
                        question = parts[1].strip()
                    else:
                        scenario = c
                        question = c
                    results.append({
                        "id": str(idx + 1),
                        "scenario": scenario,
                        "question": question,
                        "skill_tested": "Scenario",
                        "difficulty": "Medium",
                        "time_limit": 300,
                        "evaluation_criteria": ["Analysis", "Problem Solving", "Communication"]
                    })
                return results
        except ImportError:
            pass

    industry_cases = INDUSTRY_CASE_STUDIES.get(industry)
    if industry_cases:
        skill_scenarios = industry_cases
    else:
        skill_scenarios = {
            "team management": {
                "scenario": f"You are leading a cross-functional team in the {industry} sector. Two senior team members have conflicting ideas on how to approach a major project phase, leading to delays and low morale.",
                "question": "How would you mediate this conflict and get the team back on track?",
                "skill_tested": "Conflict Resolution & Leadership",
                "evaluation_criteria": ["Neutral mediation", "Focus on project goals", "Active listening", "Clear decision-making"]
            },
            "project planning": {
                "scenario": f"Your {industry} project has just lost 20% of its budget due to company-wide cuts, but the delivery deadline remains the same. The client still expects all core features.",
                "question": "How do you re-plan the project delivery and communicate this to the stakeholders?",
                "skill_tested": "Project Management & Communication",
                "evaluation_criteria": ["Prioritization/MVP focus", "Resource reallocation", "Transparent communication", "Risk management"]
            },
            "stakeholder management": {
                "scenario": f"A key stakeholder in your {industry} project keeps changing their requirements late in the development cycle, causing scope creep and team frustration.",
                "question": "What is your strategy to manage these changes without damaging the client relationship?",
                "skill_tested": "Stakeholder Management & Scope Control",
                "evaluation_criteria": ["Change management process", "Setting boundaries", "Impact analysis communication", "Relationship building"]
            },
            "agile delivery": {
                "scenario": f"You are transitioning a traditional waterfall team to Agile methodologies for a critical {industry} product release. The team is highly resistant to daily standups and sprint planning.",
                "question": "How do you drive Agile adoption while ensuring the product release is not delayed?",
                "skill_tested": "Change Management & Agile Methodologies",
                "evaluation_criteria": ["Iterative adoption", "Focus on value", "Addressing concerns", "Team coaching"]
            },
            "risk management": {
                "scenario": f"Two weeks before a major {industry} product launch, you discover a critical compliance issue that might delay the release by a month. Leadership is pushing to launch anyway.",
                "question": "How do you handle the situation with leadership and your team?",
                "skill_tested": "Risk Management & Integrity",
                "evaluation_criteria": ["Impact analysis", "Risk mitigation strategies", "Courageous communication", "Alternative solutions"]
            },
            "communication": {
                "scenario": "Your company is going through a major organizational restructuring. You need to communicate changes to your team that will affect their roles, reporting structure, and some may face relocation.",
                "question": "How would you plan and execute this communication? What would you say, when, and how would you handle the emotional responses?",
                "skill_tested": "Communication & Change Management",
                "evaluation_criteria": ["Empathy", "Transparency", "Timing", "Follow-up support"]
            },
            "problem solving": {
                "scenario": "A critical production system has failed during peak business hours. The technical team estimates 4-6 hours for a fix, but the business impact is $50,000 per hour. There's a workaround that is 80% effective but can be deployed in 30 minutes.",
                "question": "Walk through your decision-making process. What would you do, who would you involve, and how would you communicate to stakeholders?",
                "skill_tested": "Problem Solving & Decision Making",
                "evaluation_criteria": ["Analytical thinking", "Risk assessment", "Communication under pressure", "Decision speed"]
            },
            "project": {
                "scenario": "You are managing a project that is 3 weeks behind schedule and 15% over budget. The client is expecting a demo next week, and your best developer just submitted their resignation.",
                "question": "What is your action plan to address these simultaneous challenges and deliver a successful outcome?",
                "skill_tested": "Project Management & Crisis Handling",
                "evaluation_criteria": ["Prioritization", "Resource management", "Client management", "Contingency planning"]
            },
            "negotiation": {
                "scenario": "A key vendor has informed you that they are increasing their prices by 40% effective next quarter. This vendor provides a critical component for your product, and switching vendors would take 6 months.",
                "question": "How would you approach this negotiation? What alternatives would you explore, and what would your strategy be?",
                "skill_tested": "Negotiation & Vendor Management",
                "evaluation_criteria": ["Negotiation tactics", "Alternative exploration", "Cost-benefit analysis", "Relationship management"]
            },
            "agile": {
                "scenario": "Your team has been using Waterfall methodology but management wants to transition to Agile. Half the team is excited, but the other half is resistant to change. You have a major release in 2 months.",
                "question": "How would you plan and execute this transition while maintaining productivity and team cohesion?",
                "skill_tested": "Agile Transformation & Change Management",
                "evaluation_criteria": ["Change management", "Training approach", "Gradual adoption strategy", "Measuring success"]
            },
            "client": {
                "scenario": "An important client has escalated a complaint to your CEO about the quality of service they have been receiving. Your investigation reveals that the client's expectations were never properly documented, and your team has been delivering what they understood.",
                "question": "How would you resolve this situation with the client, prevent it from happening again, and address any internal process gaps?",
                "skill_tested": "Client Relationship Management",
                "evaluation_criteria": ["Client empathy", "Root cause analysis", "Process improvement", "Relationship recovery"]
            },
            "budget": {
                "scenario": "You have been asked to reduce your department's operating budget by 20% without laying off any employees. Current expenses include software licenses, training programs, travel, and contractor costs.",
                "question": "Present your strategy for achieving this budget reduction while maintaining team productivity and morale.",
                "skill_tested": "Budget Management & Optimization",
                "evaluation_criteria": ["Financial analysis", "Creative solutions", "Impact assessment", "Prioritization"]
            }
        }
    
    # Find matching skills from JD
    matched_questions = []
    for skill_key, question_data in skill_scenarios.items():
        if skill_key in jd_lower:
            matched_questions.append(question_data)
    
    # If not enough matches, add generic ones
    all_questions = list(skill_scenarios.values())
    for q in all_questions:
        if q not in matched_questions:
            matched_questions.append(q)
        if len(matched_questions) >= num_questions:
            break
    
    return matched_questions[:num_questions]


@router.post("/case-study/start")
async def start_case_study_round(
    req: CaseStudyStartRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    
    # Check if case study round already exists
    existing = interview.get("case_study_round")
    if existing and existing.get("questions"):
        return {
            "interview_id": req.interview_id,
            "case_study_round": existing,
            "resumed": True,
        }
    
    job_description = interview.get("job_description", "") or interview.get("profile_text", "")
    profile_text = interview.get("profile_text", "")
    
    # Get the number of questions and industry from the session
    link_id = interview.get("link_id", "")
    session = interview_sessions_collection.find_one({"link_id": link_id}) if link_id else None
    num_questions = (session or {}).get("case_study_count", 3) or 3
    num_questions = max(1, min(8, num_questions))
    industry = (session or {}).get("industry", "General")
    language = interview.get("language", "English")
    
    # Try AI first, fall back to offline
    import asyncio
    questions = await asyncio.to_thread(_generate_case_study_questions_ai, job_description, num_questions, profile_text, industry, language)
    if not questions:
        print(f"[CASE STUDY] Using offline fallback for {num_questions} questions")
        questions = await asyncio.to_thread(_generate_case_study_questions_offline, job_description, num_questions, industry, language)
        
    # Normalize question shape
    normalized_questions = []
    for idx, q in enumerate(questions):
        text = q.get('text') or q.get('scenario') or q.get('question') or ''
        normalized_questions.append({
            "id": q.get("id") or f"cs_{idx}",
            "type": "case_study",
            "text": text,
            **q
        })
        normalized_questions[-1]["text"] = text # Ensure text is strictly set
    questions = normalized_questions
    
    case_study_round = {
        "status": "active",
        "questions": questions,
        "answers": [None] * len(questions),
        "current_question": 0,
        "total_questions": len(questions),
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    
    interviews_collection.update_one(
        {"id": req.interview_id},
        {"$set": {"case_study_round": case_study_round}}
    )
    if get_session(req.interview_id):
        interview = get_session(req.interview_id)
        if interview:
            interview["case_study_round"] = case_study_round
            set_session(req.interview_id, interview)
    
    return {
        "interview_id": req.interview_id,
        "case_study_round": case_study_round,
        "resumed": False,
    }


@router.post("/case-study/submit-answer")
def submit_case_study_answer(
    req: CaseStudyAnswerRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    case_study = interview.get("case_study_round")
    if not case_study:
        raise HTTPException(status_code=400, detail="Case study round not started")
    
    answers = case_study.get("answers", [])
    if 0 <= req.question_index < len(answers):
        answers[req.question_index] = {
            "answer_text": req.answer_text,
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }
    
    interviews_collection.update_one(
        {"id": req.interview_id},
        {"$set": {
            "case_study_round.answers": answers,
            "case_study_round.current_question": req.question_index + 1
        }}
    )
    
    return {"status": "saved", "question_index": req.question_index}

@router.get("/coding-round/{interview_id}")
def get_coding_round(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=interview_id, allow_completed=True)
    interview = get_interview_or_404(interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round:
        raise HTTPException(status_code=404, detail="Coding round not started")
    return {"interview_id": interview_id, "coding_round": coding_round, "tests": build_coding_test_payload(coding_round)}


def _run_coding_feedback(req: CodingRoundCheckpointRequest, feedback_mode: str) -> Dict[str, Any]:
    interview = get_interview_or_404(req.interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round or not coding_round.get("task"):
        raise HTTPException(status_code=400, detail="Coding round not started")

    latest_code = req.code or ""
    latest_explanation = req.explanation or ""
    unchanged = (
        latest_code.strip() == (coding_round.get("latest_code", "") or "").strip()
        and latest_explanation.strip() == (coding_round.get("latest_explanation", "") or "").strip()
        and coding_round.get("latest_feedback")
        and feedback_mode == "checkpoint"
    )
    if unchanged:
        return {
            "interview_id": req.interview_id,
            "coding_round": coding_round,
            "feedback": coding_round.get("latest_feedback"),
            "cached": True,
        }

    feedback = run_coding_round(
        task=coding_round["task"],
        answer_summary=coding_round.get("answer_summary", ""),
        code=latest_code,
        explanation=latest_explanation,
        language=req.language,
        prior_feedback=coding_round.get("latest_feedback", ""),
        feedback_mode=feedback_mode,
    )

    checkpoint = {
        "at": datetime.now(timezone.utc).isoformat(),
        "language": req.language,
        "code_length": len(latest_code),
        "explanation_length": len(latest_explanation),
        "feedback": feedback,
        "mode": feedback_mode,
    }

    # Automatically run tests on the final submitted code so the admin can see the test results
    if feedback_mode == "final" and latest_code.strip():
        try:
            from .services import run_code_against_tests
            run_result = run_code_against_tests(latest_code, coding_round["task"], req.language or "python")
            coding_round["latest_run"] = {
                "at": checkpoint["at"],
                **run_result,
            }
        except Exception as e:
            print(f"Auto-eval execution failed: {e}")

    coding_round["latest_code"] = latest_code
    coding_round["latest_explanation"] = latest_explanation
    coding_round["language"] = req.language
    coding_round["latest_feedback"] = feedback
    coding_round["updated_at"] = checkpoint["at"]
    coding_round.setdefault("checkpoints", []).append(checkpoint)
    if feedback_mode == "final":
        coding_round["status"] = "completed"
        coding_round["final_evaluation"] = feedback
        coding_round["completed_at"] = checkpoint["at"]

    persist_coding_round(req.interview_id, coding_round)
    return {
        "interview_id": req.interview_id,
        "coding_round": coding_round,
        "feedback": feedback,
        "cached": False,
    }


@router.post("/coding-round/checkpoint")
def coding_round_checkpoint(
    req: CodingRoundCheckpointRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    return _run_coding_feedback(req, "checkpoint")


@router.post("/coding-round/submit")
def coding_round_submit(
    req: CodingRoundSubmitRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    return _run_coding_feedback(req, "final")


@router.post("/coding-round/run")
def coding_round_run(
    req: CodingRoundRunRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round or not coding_round.get("task"):
        raise HTTPException(status_code=400, detail="Coding round not started")
    result = run_code_against_tests(req.code or "", coding_round["task"], req.language or "python")
    coding_round["latest_code"] = req.code or ""
    coding_round["latest_explanation"] = req.explanation or coding_round.get("latest_explanation", "")
    coding_round["language"] = req.language or "python"
    coding_round["latest_run"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    persist_coding_round(req.interview_id, coding_round)
    return {
        "interview_id": req.interview_id,
        "run_result": result,
        "tests": build_coding_test_payload(coding_round),
    }


@router.post("/coding-round/observe")
def coding_round_observe(
    req: CodingRoundObserveRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round or not coding_round.get("task"):
        raise HTTPException(status_code=400, detail="Coding round not started")

    observation = observe_coding_intent(
        task=coding_round["task"],
        code=req.code or "",
        explanation=req.explanation or "",
        language=req.language or "python",
    )
    coding_round["last_observation"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        **observation,
    }
    persist_coding_round(req.interview_id, coding_round)
    return {"interview_id": req.interview_id, "observation": observation}

@router.get("/interview/{interview_id}/ai-summary")
def interview_ai_summary(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=interview_id, allow_completed=True)
    answers = answers_collection.find({"interview_id": interview_id, "ai_score": {"$ne": None}})
    scores = [a.get("ai_score", 0) for a in answers]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0

    return {
        "interview_id": interview_id,
        "average_score": avg_score,
        "total_questions": len(scores)
    }

from pydantic import BaseModel
class InterviewAlert(BaseModel):
    type: str
    message: str

from fastapi import Request
import json

@router.post("/interview/{interview_id}/alert")
async def log_interview_alert(
    interview_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, link_id=interview_id)
    try:
        body_bytes = await request.body()
        data = json.loads(body_bytes)
        alert_type = data.get("type", "warning")
        alert_message = data.get("message", "Unknown alert")
    except Exception:
        # Fallback if invalid JSON
        alert_type = "warning"
        alert_message = "Invalid alert data received"
        
    interview_sessions_collection.update_one(
        {"link_id": interview_id},
        {"$push": {"alerts": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": alert_type,
            "message": alert_message
        }}}
    )
    return {"status": "success"}

# ─── Helper: Generate AI Summary (Recommendation + S&W) ─────────────────────
def generate_interview_summary(candidate_name: str, answers_data: list) -> dict:
    """
    Generate interview summary via typed_ai_layer (type-safe, compressed, token-optimized).
    """
    # Priority 0: LangGraph Layer
    try:
        from interview_graphs import run_summary_graph
        result = run_summary_graph(candidate_name, answers_data)
        if result and "recommendation" in result:
            return result
    except ImportError:
        pass
    except Exception as e:
        print(f"[interview_graphs] summary failed, falling back: {e}")

    # Priority 1: Typed AI layer (type-safe validated output)
    try:
        from typed_ai_layer import generate_summary as _typed_summary
        result = _typed_summary(candidate_name, answers_data)
        if result and "recommendation" in result:
            return result
    except Exception as e:
        print(f"[typed_ai_layer] summary failed, using direct call: {e}")

    # ── Direct fallback (original logic) ──────────────────────────────────
    if not answers_data:
        return {
            "recommendation": "No Data",
            "strengths": "No answers provided.",
            "weaknesses": "No answers provided."
        }

    avg = sum(a.get("ai_score", 0) or 0 for a in answers_data) / len(answers_data)

    # TOKEN SAVE: Send compressed feedback instead of full answer text
    compressed_qa = "\n".join(
        f"Q{i+1}: {a.get('question_text','')[:120]}\n"
        f"Score: {a.get('ai_score', 0)}/100 | "
        f"Feedback: {(a.get('ai_feedback') or '')[:200]}"
        for i, a in enumerate(answers_data)
    )

    SYSTEM = (
        "You are a senior hiring manager. Analyze interview performance and return ONLY valid JSON. "
        "No markdown, no explanation."
    )
    USER = f"""Candidate: {candidate_name}
Average Score: {avg:.1f}/100

Interview Summary (Compressed):
{compressed_qa}

Return JSON with keys: recommendation (one of: Strong Hire, Hire, Borderline, No Hire),
strengths (2-3 sentences), weaknesses (2-3 sentences),
communication_score (0-100), communication_reasoning,
skills_score (0-100), skills_reasoning,
competencies_score (0-100), competencies_reasoning,
personality_score (0-100), personality_reasoning,
culture_fit_score (0-100), culture_fit_reasoning,
job_success_score (0-100), job_success_reasoning,
detected_accent (short string)."""

    prompt = USER  # kept for backward compat

    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": USER}
            ],
            model="openai/gpt-4o-mini",
            temperature=0.1,
        )
        res = extract_json(raw)
        if res: return res
        raise Exception("Invalid JSON returned")
    except Exception as e:
        print(f"Summary generation error: {e}")
        # Fallback from score
        if avg >= 75:
            rec = "Strong Hire"
        elif avg >= 55:
            rec = "Hire"
        elif avg >= 35:
            rec = "Borderline"
        else:
            rec = "No Hire"
        return {
            "recommendation": rec,
            "strengths": "Summary generation failed — please review individual scores.",
            "weaknesses": "Summary generation failed — please review individual scores.",
            "communication_score": int(avg),
            "communication_reasoning": "N/A",
            "skills_score": int(avg),
            "skills_reasoning": "N/A",
            "competencies_score": int(avg),
            "competencies_reasoning": "N/A",
            "personality_score": int(avg),
            "personality_reasoning": "N/A",
            "culture_fit_score": int(avg),
            "culture_fit_reasoning": "N/A",
            "job_success_score": int(avg),
            "job_success_reasoning": "N/A",
            "detected_accent": "Unknown"
        }


from pydantic import BaseModel, root_validator
class AgentFlowItem(BaseModel):
    context_title: str
    context_body: str
    is_enabled: bool = True
    title: Optional[str] = None
    instruction: Optional[str] = None
    body: Optional[str] = None

    @root_validator(pre=True)
    def normalize_legacy_fields(cls, values):
        if values.get('context_title') is None and values.get('title') is not None:
            values['context_title'] = values.get('title')
        if values.get('context_body') is None:
            if values.get('instruction') is not None:
                values['context_body'] = values.get('instruction')
            elif values.get('body') is not None:
                values['context_body'] = values.get('body')
        if values.get('is_enabled') is None:
            values['is_enabled'] = values.get('enabled', True)
        return values

class UpdateAgentFlowRequest(BaseModel):
    flow: List[AgentFlowItem]


def _normalize_text_field(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    if isinstance(value, bool):
        return ""
    return str(value)


def normalize_agent_flow_read_item(item: Dict[str, Any]) -> Dict[str, Any]:
    context_title = item.get("context_title") if item.get("context_title") is not None else item.get("title", "")
    context_body = item.get("context_body") if item.get("context_body") is not None else item.get("body", item.get("instruction", ""))
    return {
        "context_title": _normalize_text_field(context_title),
        "context_body": _normalize_text_field(context_body),
        "is_enabled": bool(item.get("is_enabled", item.get("enabled", True))),
    }


def normalize_agent_flow_write_item(item: Dict[str, Any]) -> Dict[str, Any]:
    title = item.get("context_title") if item.get("context_title") is not None else item.get("title", "")
    body = item.get("context_body") if item.get("context_body") is not None else item.get("body", item.get("instruction", ""))
    return {
        "title": _normalize_text_field(title),
        "body": _normalize_text_field(body),
        "is_enabled": bool(item.get("is_enabled", item.get("enabled", True))),
    }

@router.get("/admin/agent-flow")
def get_agent_flow(current_admin: dict = Depends(require_role("super_admin"))):
    from app.config import get_omni_dimension_api_key, get_omni_agent_id
    import requests
    from pathlib import Path
    # Prefer a local flow file when present so admin UI reflects local edits immediately.
    local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
    if local_path.exists():
        try:
            data = json.loads(local_path.read_text(encoding='utf-8'))
            if data:
                normalized = [normalize_agent_flow_read_item(item) for item in data]
                return {"success": True, "flow": normalized}
        except Exception as e:
            logger.warning(f"[agent-flow] Warning: failed to read local flow: {e}")
    api_key = get_omni_dimension_api_key()
    agent_id_value = get_omni_agent_id()
    if not api_key:
        raise HTTPException(status_code=500, detail="OMNI_DIMENSION_API_KEY is not set and no local flow available.")

    if not agent_id_value:
        raise HTTPException(status_code=500, detail="OMNI_AGENT_ID is not configured.")

    agent_id = agent_id_value
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        res = requests.get(f"https://backend.omnidim.io/api/v1/agents/{agent_id}", headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            agent_obj = data.get("agent") or {}
            top_level = data.get("context_breakdown")
            if top_level is not None:
                flow_data = top_level
            elif agent_obj.get("context_breakdown") is not None:
                flow_data = agent_obj["context_breakdown"]
            else:
                flow_data = []
            normalized_flow = [normalize_agent_flow_read_item(item) for item in flow_data]
            return {"success": True, "flow": normalized_flow}
        else:
            print(f"[Omnidimension] GET agent flow failed [status={res.status_code}]")
            # If upstream fails, fall back to local flow file
            local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
            if local_path.exists():
                try:
                    data = json.loads(local_path.read_text(encoding='utf-8'))
                    return {"success": True, "flow": data}
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"Failed to read local flow: {e}")
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch agent flow from upstream API.")
    except HTTPException:
        raise
    except Exception as e:
        # On unexpected exception, try local fallback
        local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
        if local_path.exists():
            try:
                data = json.loads(local_path.read_text(encoding='utf-8'))
                return {"success": True, "flow": data}
            except Exception:
                pass
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/admin/agent-flow")
def update_agent_flow(
    req: UpdateAgentFlowRequest,
    current_admin: dict = Depends(require_role("super_admin")),
):
    from app.config import get_omni_dimension_api_key, get_omni_agent_id
    import requests
    from pathlib import Path
    agent_id_value = get_omni_agent_id()
    if not agent_id_value:
        raise HTTPException(status_code=500, detail="OMNI_AGENT_ID is not configured.")

    agent_id = agent_id_value
    payload = {
        "context_breakdown": [normalize_agent_flow_write_item(item.dict()) for item in req.flow]
    }

    api_key = get_omni_dimension_api_key()
    if not api_key:
        logger.warning("[agent-flow] OMNI_DIMENSION_API_KEY not configured; saving local flow only.")
        try:
            local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
            local_path.write_text(json.dumps(payload.get('context_breakdown', []), indent=2, ensure_ascii=False), encoding='utf-8')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to persist local flow: {e}")
        return {"success": True, "message": "Local flow saved; Omnidimension sync skipped because OMNI_DIMENSION_API_KEY is not configured."}

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    
    # We only send the context_breakdown (conversational flow)
    
    omni_url = f"https://backend.omnidim.io/api/v1/agents/{agent_id}"
    try:
        logger.info("[agent-flow] OmniDimension sync request: method=PUT url=%s agent_id=%s", omni_url, agent_id)
        logger.info("[agent-flow] OmniDimension authorization configured: %s", bool(api_key))
        logger.info("[agent-flow] OmniDimension request body: %s", json.dumps(payload, ensure_ascii=False))
        res = requests.put(omni_url, headers=headers, json=payload, timeout=10)
        logger.info("[agent-flow] OmniDimension response status: %s", res.status_code)
        logger.info("[agent-flow] OmniDimension response body: %s", res.text)
        if res.status_code == 200:
            # persist locally as well
            try:
                local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
                local_path.write_text(json.dumps(payload.get('context_breakdown', []), indent=2, ensure_ascii=False), encoding='utf-8')
            except Exception as e:
                print(f"[agent-flow] Warning: failed to persist local flow: {e}")
            return {"success": True, "message": "Agent flow updated successfully."}
        else:
            print(f"[Omnidimension] PUT agent flow failed [status={res.status_code}]")
            # try to persist locally and return success if local save succeeds
            try:
                local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
                local_path.write_text(json.dumps(payload.get('context_breakdown', []), indent=2, ensure_ascii=False), encoding='utf-8')
                return {"success": True, "message": "Upstream failed but local flow updated."}
            except Exception:
                raise HTTPException(status_code=res.status_code, detail="Failed to update agent flow on upstream API and failed to save locally.")
    except HTTPException:
        raise
    except Exception as e:
        # attempt local save on unexpected error
        try:
            local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
            local_path.write_text(json.dumps(payload.get('context_breakdown', []), indent=2, ensure_ascii=False), encoding='utf-8')
            return {"success": True, "message": "Local flow updated (upstream error)."}
        except Exception:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/interview/{link_id}")
def get_interview_details(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if link_id.startswith("ai_call_"):
        # This is an AI Call Mock Session!
        app_id = link_id.replace("ai_call_", "")
        from bson import ObjectId
        try:
            app = job_applications_collection.find_one({"_id": ObjectId(app_id)})
        except Exception:
            app = None
        if not app:
            # Fallback search by omni_call_id
            app = job_applications_collection.find_one({"omni_call_id": app_id})
        if not app:
            raise HTTPException(status_code=404, detail="AI Call candidate not found")
        if current_admin.get("role") != "master":
            job = jobs_collection.find_one({"job_id": app.get("job_id")}, {"company_id": 1, "admin_id": 1})
            if not job or str(job.get("company_id") or "") != str(current_admin.get("company_id") or ""):
                raise HTTPException(status_code=403, detail="Access denied to this candidate")
            if current_admin.get("role") == "admin" and str(job.get("admin_id") or "") != str(current_admin.get("admin_id") or ""):
                raise HTTPException(status_code=403, detail="Access denied to this candidate")
            
        interactions = app.get("omni_call_details", {}).get("interactions", [])
        answers = []
        if interactions:
            for idx, interaction in enumerate(interactions):
                speaker = interaction.get("speaker", "Bot")
                text = interaction.get("text", "")
                answers.append({
                    "question_id": idx + 1,
                    "question_text": f"Segment {idx + 1} ({speaker})",
                    "answer_text": text,
                    "ai_score": app.get("score") or 0.0,
                    "content_score": app.get("score") or 0.0,
                    "relevance_score": app.get("score") or 0.0,
                    "time_score": 100,
                    "time_spent_seconds": 0,
                    "time_limit_seconds": 60,
                    "ai_feedback": "Outbound AI Call interaction.",
                    "corrected_answer": "N/A",
                    "wpm": 0.0,
                    "pause_count": 0,
                    "filler_count": 0,
                    "keyword_match_pct": 0.0,
                    "tab_switches": 0,
                    "face_alerts": 0,
                    "noise_alerts": 0,
                    "behavioral_stats": {
                        "filler_words_count": 0,
                        "pauses_count": 0,
                        "face_not_visible_count": 0
                    }
                })
        elif app.get("transcript"):
            lines = app.get("transcript", "").split("\n")
            for idx, line in enumerate(lines):
                if not line.strip():
                    continue
                speaker = "Bot"
                text = line
                if ":" in line:
                    parts = line.split(":", 1)
                    speaker = parts[0].strip()
                    text = parts[1].strip()
                answers.append({
                    "question_id": idx + 1,
                    "question_text": f"Segment {idx + 1} ({speaker})",
                    "answer_text": text,
                    "ai_score": app.get("score") or 0.0,
                    "content_score": app.get("score") or 0.0,
                    "relevance_score": app.get("score") or 0.0,
                    "time_score": 100,
                    "time_spent_seconds": 0,
                    "time_limit_seconds": 60,
                    "ai_feedback": "Outbound AI Call interaction.",
                    "corrected_answer": "N/A",
                    "wpm": 0.0,
                    "pause_count": 0,
                    "filler_count": 0,
                    "keyword_match_pct": 0.0,
                    "tab_switches": 0,
                    "face_alerts": 0,
                    "noise_alerts": 0,
                    "behavioral_stats": {
                        "filler_words_count": 0,
                        "pauses_count": 0,
                        "face_not_visible_count": 0
                    }
                })

        # Mock dimensions
        score = app.get("score") or 0.0
        
        # Calculate actual duration from Omni Call
        omni_duration_str = app.get("omni_call_details", {}).get("duration", "0m 0s")
        total_mins = 0.0
        try:
            m_part = omni_duration_str.split("m")[0].strip() if "m" in omni_duration_str else "0"
            s_part = omni_duration_str.split("m")[1].replace("s", "").strip() if "m" in omni_duration_str else "0"
            total_mins = int(m_part) + int(s_part) / 60.0
            total_mins = round(total_mins, 1)
        except Exception:
            total_mins = 0.0
            
        response_payload = {
            "interview_id": link_id,
            "actual_interview_id": "mock_ai_call",
            "candidate_id": f"CAN{str(app['_id'])[:4].upper()}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "date": app.get("applied_at") or app.get("updated_at"),
            "source": "AI Calling Agent",
            "avg_score": score,
            "overall_recommendation": app.get("interest") or "Interested",
            "strengths_summary": "Marked as Interested during outbound AI call.",
            "weaknesses_summary": "N/A",
            "communication_score": score,
            "communication_reasoning": "Communication assessed via outbound AI calling agent.",
            "skills_score": score,
            "skills_reasoning": "Skills assessed via outbound AI calling agent.",
            "competencies_score": score,
            "competencies_reasoning": "N/A",
            "personality_score": score,
            "personality_reasoning": "N/A",
            "culture_fit_score": score,
            "culture_fit_reasoning": "N/A",
            "job_success_score": score,
            "job_success_reasoning": "N/A",
            "detected_accent": "English",
            "recording_url": app.get("omni_call_details", {}).get("recording_url"),
            "screen_recording_url": None,
            "completion_reason": "normal",
            "integrity": {
                "total_tab_switches": 0,
                "total_face_alerts": 0,
                "total_noise_alerts": 0,
                "total_time_minutes": total_mins
            },
            "admin_notes": app.get("admin_notes", ""),
            "alerts": [],
            "answers": answers,
            "started_at": app.get("applied_at") or app.get("updated_at") or app.get("created_at")
        }
        return response_payload

    # 1. Fetch session metadata
    session_data = interview_sessions_collection.find_one({"link_id": link_id})
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    candidate_name = session_data.get("candidate_name")
    created_at = session_data.get("created_at")
    jd = session_data.get("job_description")
    actual_interview_id = session_data.get("interview_id")
    saved_rec = session_data.get("overall_recommendation")
    saved_str = session_data.get("strengths_summary")
    saved_wk = session_data.get("weaknesses_summary")
    saved_avg = session_data.get("avg_score")
    saved_comm = session_data.get("communication_score")
    saved_comm_reason = session_data.get("communication_reasoning")
    saved_skills = session_data.get("skills_score")
    saved_skills_reason = session_data.get("skills_reasoning")
    saved_comp = session_data.get("competencies_score")
    saved_comp_reason = session_data.get("competencies_reasoning")
    saved_pers = session_data.get("personality_score")
    saved_pers_reason = session_data.get("personality_reasoning")
    saved_cult = session_data.get("culture_fit_score")
    saved_cult_reason = session_data.get("culture_fit_reasoning")
    saved_job = session_data.get("job_success_score")
    saved_job_reason = session_data.get("job_success_reasoning")
    saved_accent = session_data.get("detected_accent")
    current_status = session_data.get("status")
    candidate_email = session_data.get("candidate_email")


    def get_url_from_raw_path(rpath):
        if not rpath: return None
        if rpath.startswith("cloudinary-authenticated://"):
            public_id = rpath.split("://", 1)[1]
            signed_url, _ = cloudinary.utils.cloudinary_url(
                public_id,
                resource_type="video",
                type="authenticated",
                secure=True,
                sign_url=True,
            )
            return signed_url
        if rpath.startswith("http"): return rpath
        
        raw_path_fixed = rpath.replace("\\", "/")
        idx = raw_path_fixed.find("uploads/")
        
        if idx != -1: 
            relative_path = raw_path_fixed[idx:]
            if os.path.exists(rpath):
                return relative_path
            else:
                # If running locally, the file might be on the production server
                return "https://ai-adaptive-interview-1hsw.onrender.com/" + relative_path
                
        print(f"Recording file not found on disk: {rpath}")
        return None

    recording_url = None
    screen_recording_url = None
    
    raw_path = session_data.get("recording_path")
    raw_screen_path = session_data.get("screen_recording_path")
    
    if actual_interview_id:
        rec_row = interviews_collection.find_one({"id": actual_interview_id})
        if rec_row:
            if not raw_path and rec_row.get("recording_path"):
                raw_path = rec_row["recording_path"]
            if not raw_screen_path and rec_row.get("screen_recording_path"):
                raw_screen_path = rec_row["screen_recording_path"]
                
    recording_url = get_url_from_raw_path(raw_path)
    screen_recording_url = get_url_from_raw_path(raw_screen_path)

    results = []
    
    # Calculate integrity totals from the violations array, as it accurately tracks all events
    # even if the interview terminates before any questions are answered.
    violations = session_data.get("violations", [])
    total_tab_switches = sum(1 for v in violations if v.get("type") == "tab_switch")
    total_face_alerts = sum(1 for v in violations if v.get("type") not in ("tab_switch", "noise_alert"))
    total_noise_alerts = sum(1 for v in violations if v.get("type") == "noise_alert")
    
    total_time = 0
    # Note: if all per-question time_spent_seconds are 0 (old records pre-fix),
    # we fall back to session-level timestamps below after the answers loop.

    if actual_interview_id:
        rows = answers_collection.find({"interview_id": actual_interview_id}).sort("question_id", 1)
        for row in rows:
            tab_sw = row.get("tab_switches") or 0
            face_al = row.get("face_alerts") or 0
            noise_al = row.get("noise_alerts") or 0
            # We no longer sum these from answers since we pull directly from the violations array
            # total_tab_switches += tab_sw
            # total_face_alerts += face_al
            # total_noise_alerts += noise_al
            total_time += (row.get("time_spent_seconds") or 0)
            results.append({
                "question_id": row.get("question_id"),
                "question_text": row.get("question_text"),
                "answer_text": row.get("answer_text") or "(No answer yet)",
                "ai_score": row.get("ai_score"),
                "content_score": row.get("content_score"),
                "relevance_score": row.get("relevance_score"),
                "time_score": row.get("time_score"),
                "time_spent_seconds": row.get("time_spent_seconds") or 0,
                "time_limit_seconds": row.get("time_limit_seconds"),
                "ai_feedback": row.get("ai_feedback") or "No feedback provided",
                "corrected_answer": row.get("corrected_answer") or "N/A",
                "wpm": round(row.get("wpm") or 0, 1),
                "pause_count": row.get("pause_count") or 0,
                "filler_count": row.get("filler_count") or 0,
                "keyword_match_pct": round(row.get("keyword_match_pct") or 0, 1),
                "tab_switches": tab_sw,
                "face_alerts": face_al,
                "noise_alerts": noise_al
            })

    # ── Timestamp-based fallback for older sessions where time_spent_seconds was not stored ──
    # If total_time is still 0 after reading all answers, calculate from session timestamps.
    if total_time == 0:
        try:
            started_str  = session_data.get("started_at")
            finished_str = (session_data.get("completed_at")
                            or session_data.get("updated_at")
                            or session_data.get("submitted_at"))

            print(f"⏱️ Duration fallback check | link_id={link_id} | started_at={started_str} | finished_str(before ans)={finished_str} | interview_id={actual_interview_id}")

            # For old sessions with no completed_at, use the created_at of the LAST answer
            if started_str and not finished_str and actual_interview_id:
                last_ans = answers_collection.find_one(
                    {"interview_id": actual_interview_id},
                    sort=[("created_at", -1)]
                )
                if last_ans:
                    finished_str = last_ans.get("created_at")
                    print(f"⏱️ Using last answer created_at as finish time: {finished_str}")

            if started_str and finished_str:
                started_dt  = datetime.fromisoformat(started_str.replace("Z", "+00:00"))
                finished_dt = datetime.fromisoformat(finished_str.replace("Z", "+00:00"))
                delta_secs  = (finished_dt - started_dt).total_seconds()
                print(f"⏱️ Calculated duration: {delta_secs:.0f}s = {delta_secs/60:.1f} min")
                if delta_secs > 0:
                    total_time = int(delta_secs)
            else:
                print(f"⏱️ Cannot compute fallback duration: started_str={started_str}, finished_str={finished_str}")
        except Exception as _ts_err:
            print(f"Timestamp fallback error: {_ts_err}")

    # 2. Calculate composite AI summary score
    avg_score = 0
    if results:
        scores = [r["ai_score"] for r in results if r["ai_score"] is not None]
        verbal_avg = round(sum(scores) / len(scores), 1) if scores else 0

        # Blend with coding / case study rounds if present
        try:
            from score_rounds import compute_coding_score, compute_case_study_score, blend_scores
            interview_record_for_score = interviews_collection.find_one({"id": actual_interview_id}) if actual_interview_id else None
            if interview_record_for_score:
                interview_format_cs = session_data.get("interview_format", "Standard") if session_data else "Standard"
                lang_cs = interview_record_for_score.get("language", "English")
                ctx_cs  = f"Candidate's {interview_record_for_score.get('source','Resume')}: {interview_record_for_score.get('profile_text','')}"
                coding_rd  = interview_record_for_score.get("coding_round")
                case_std   = interview_record_for_score.get("case_study_round")
                coding_s   = compute_coding_score(coding_rd, interview_format_cs, lang_cs) if coding_rd else None
                case_s     = compute_case_study_score(case_std, ctx_cs, lang_cs) if case_std else None
                avg_score  = blend_scores(verbal_avg, coding_s, case_s)
            else:
                avg_score = verbal_avg
        except Exception as blend_err:
            print(f"⚠️ complete-session blend error: {blend_err}")
            avg_score = verbal_avg

    # Use cached values if available, else generate
    if saved_rec and saved_comm is not None and saved_skills is not None:
        recommendation = saved_rec
        strengths = saved_str
        weaknesses = saved_wk
        communication_score = saved_comm
        communication_reasoning = saved_comm_reason
        skills_score = saved_skills
        skills_reasoning = saved_skills_reason
        competencies_score = saved_comp
        competencies_reasoning = saved_comp_reason
        personality_score = saved_pers
        personality_reasoning = saved_pers_reason
        culture_fit_score = saved_cult
        culture_fit_reasoning = saved_cult_reason
        job_success_score = saved_job
        job_success_reasoning = saved_job_reason
        detected_accent = saved_accent or "Unknown"
    else:
        summary = generate_interview_summary(candidate_name or "Candidate", results)
        recommendation = summary.get("recommendation", "No Data")
        strengths = summary.get("strengths", "")
        weaknesses = summary.get("weaknesses", "")
        communication_score = summary.get("communication_score", 0)
        communication_reasoning = summary.get("communication_reasoning", "N/A")
        skills_score = summary.get("skills_score", 0)
        skills_reasoning = summary.get("skills_reasoning", "N/A")
        competencies_score = summary.get("competencies_score", 0)
        competencies_reasoning = summary.get("competencies_reasoning", "N/A")
        personality_score = summary.get("personality_score", 0)
        personality_reasoning = summary.get("personality_reasoning", "N/A")
        culture_fit_score = summary.get("culture_fit_score", 0)
        culture_fit_reasoning = summary.get("culture_fit_reasoning", "N/A")
        job_success_score = summary.get("job_success_score", 0)
        job_success_reasoning = summary.get("job_success_reasoning", "N/A")
        
        detected_accent = summary.get("detected_accent")
        if not detected_accent or detected_accent == "Unknown":
            detected_accent = session_data.get("detected_accent") or "Unknown"
        
        # Only cache in DB if it's a real summary (not the fallback)
        if "Summary generation failed" not in strengths:
            try:
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": {
                        "overall_recommendation": recommendation,
                        "strengths_summary": strengths,
                        "weaknesses_summary": weaknesses,
                        "communication_score": communication_score,
                        "communication_reasoning": communication_reasoning,
                        "skills_score": skills_score,
                        "skills_reasoning": skills_reasoning,
                        "competencies_score": competencies_score,
                        "competencies_reasoning": competencies_reasoning,
                        "personality_score": personality_score,
                        "personality_reasoning": personality_reasoning,
                        "culture_fit_score": culture_fit_score,
                        "culture_fit_reasoning": culture_fit_reasoning,
                        "job_success_score": job_success_score,
                        "job_success_reasoning": job_success_reasoning,
                        "detected_accent": detected_accent,
                        "avg_score": avg_score
                    }}
                )
            except Exception as e:
                print(f"Summary cache error: {e}")
            sync_session_to_application(link_id)

    response_payload = {
        "interview_id": link_id,
        "actual_interview_id": actual_interview_id,
        "candidate_id": session_data.get("candidate_id"),
        "candidate_name": candidate_name or "Candidate",
        "candidate_email": session_data.get("candidate_email") or session_data.get("email", ""),
        "candidate_phone": session_data.get("candidate_phone") or session_data.get("phone", ""),
        "interview_title": session_data.get("interview_title") or session_data.get("job_title", ""),
        "experience": session_data.get("experience", ""),
        "location": session_data.get("location", ""),
        "notice_period": session_data.get("notice_period", ""),
        "current_ctc": session_data.get("current_ctc", ""),
        "expected_ctc": session_data.get("expected_ctc", ""),
        "current_company": session_data.get("current_company", ""),
        "status": sync_session_status(session_data),
        "decision": session_data.get("decision", ""),
        "resume_text": session_data.get("resume_text", ""),
        "job_description_text": session_data.get("job_description", ""),
        "date": created_at,
        "source": session_data.get("source") or "Job Description / Resume",
        "avg_score": avg_score,
        "overall_recommendation": recommendation,
        "strengths_summary": strengths,
        "weaknesses_summary": weaknesses,
        "communication_score": communication_score,
        "communication_reasoning": communication_reasoning,
        "skills_score": skills_score,
        "skills_reasoning": skills_reasoning,
        "competencies_score": competencies_score,
        "competencies_reasoning": competencies_reasoning,
        "personality_score": personality_score,
        "personality_reasoning": personality_reasoning,
        "culture_fit_score": culture_fit_score,
        "culture_fit_reasoning": culture_fit_reasoning,
        "job_success_score": job_success_score,
        "job_success_reasoning": job_success_reasoning,
        "detected_accent": detected_accent,
        "recording_url": recording_url,
        "screen_recording_url": screen_recording_url,
        "completion_reason": session_data.get("completion_reason"),
        "integrity": {
            "total_tab_switches": total_tab_switches,
            "total_face_alerts": total_face_alerts,
            "total_noise_alerts": total_noise_alerts,
            "total_time_minutes": round(total_time / 60, 1)
        },
        "alerts": session_data.get("violations", session_data.get("alerts", [])),
        "answers": results,
        "candidate_feedback": session_data.get("candidate_feedback", ""),
        "ats_score": session_data.get("ats_score")
    }
    
    # Include full question list so admin can see which questions were skipped
    all_questions = []
    try:
        raw_qs = session_data.get("pre_generated_questions") or session_data.get("questions")
        if raw_qs:
            if isinstance(raw_qs, str):
                import json as _json
                raw_qs = _json.loads(raw_qs)
            if isinstance(raw_qs, list):
                for q in raw_qs:
                    if isinstance(q, dict):
                        all_questions.append({
                            "id": q.get("id"),
                            "question": q.get("question") or q.get("text") or q.get("q", "")
                        })
    except Exception as e:
        print(f"all_questions parse error: {e}")
    
    response_payload["all_questions"] = all_questions

    # If the interview ended early, only show questions up to the last one attempted
    # so that unreached questions don't appear as "Not Answered"
    if all_questions and results:
        def _safe_int(val):
            try: return int(val)
            except: return 0
            
        max_answered_id = max((_safe_int(r.get("question_id", 0)) for r in results if r), default=0)
        if max_answered_id > 0:
            response_payload["all_questions"] = [q for q in all_questions if _safe_int(q.get("id")) <= max_answered_id]


    if actual_interview_id:
        interview_record = interviews_collection.find_one({"id": actual_interview_id})
        if interview_record:
            if interview_record.get("coding_round"):
                response_payload["coding_round"] = interview_record.get("coding_round")
            if interview_record.get("case_study_round"):
                response_payload["case_study_round"] = interview_record.get("case_study_round")
            # Add profile/resume text and job description for ATS analysis
            response_payload["profile_text"] = interview_record.get("profile_text", "")
            response_payload["job_description"] = interview_record.get("job_description", "")
            # Fill interview_title from interview record if not already set from session
            if not response_payload.get("interview_title"):
                response_payload["interview_title"] = (
                    interview_record.get("title") or
                    interview_record.get("interview_title") or
                    interview_record.get("job_title", "")
                )
                
    return response_payload

class AnalyzeRequest(BaseModel):
    interview_id: Optional[str] = None
    question_id: Optional[int] = None
    question: str
    answer: str

class DecisionRequest(BaseModel):
    link_id: str
    decision: str # 'selected' or 'rejected'
    admin_id: Optional[str] = None

@router.post("/analyze-answer")
def analyze(req: AnalyzeRequest):
    context = ""
    language = "English"
    # Retrieve Resume/JD context from the CURRENT in-memory session (not historical DB data)
    if req.interview_id and get_session(req.interview_id):
         profile_text = get_session(req.interview_id).get("profile_text", "")
         source = get_session(req.interview_id).get("source", "Resume")
         language = get_session(req.interview_id).get("language", "English")
         context = f"Candidate's {source}: {profile_text}"
    
    result = analyze_answer(req.question, req.answer, context, language=language)

    # Delete existing to avoid duplicates
    answers_collection.delete_many({"interview_id": req.interview_id, "question_id": req.question_id})

    # Store in DB
    try:
        answers_collection.insert_one({
            "interview_id": req.interview_id,
            "question_id": req.question_id,
            "question_text": req.question,
            "answer_text": req.answer,
            "ai_score": result.get("overall_score", 0),
            "ai_feedback": result.get("feedback", ""),
            "ai_keywords": json.dumps(result.get("keywords", [])),
            "corrected_answer": result.get("corrected_answer", ""),
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f" Failed to save answer to DB: {e}")

    return result

@router.post("/upload-full-recording")
def upload_full_recording(
    interview_id: str = Form(...),
    link_id: Optional[str] = Form(None),
    recording_type: Optional[str] = Form("camera"),
    recording_truncated: bool = Form(False),
    recording_upload_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    session = _require_candidate_session(
        credentials,
        link_id=link_id,
        interview_id=interview_id,
        allow_completed=True,
    )
    link_id = session.get("link_id")
    if recording_type not in {"camera", "screen"}:
        raise HTTPException(status_code=422, detail="Recording type must be camera or screen")
    path_key = "recording_path" if recording_type == "camera" else "screen_recording_path"
    existing_interview = interviews_collection.find_one(
        {"id": interview_id},
        {path_key: 1, f"{path_key}_cloudinary_public_id": 1},
    ) or {}
    previous_public_ids = {
        value
        for value in (
            session.get(f"{path_key}_cloudinary_public_id"),
            existing_interview.get(f"{path_key}_cloudinary_public_id"),
        )
        if value
    }
    previous_local_paths = {
        value
        for value in (session.get(path_key), existing_interview.get(path_key))
        if value and not str(value).startswith("cloudinary-authenticated://")
    }
    if recording_upload_id:
        recording_upload_id = recording_upload_id.strip()
        if len(recording_upload_id) > 100 or not all(
            character.isalnum() or character in {"-", "_"}
            for character in recording_upload_id
        ):
            raise HTTPException(status_code=422, detail="Invalid recording upload ID")
        if (
            session.get(f"{path_key}_upload_id") == recording_upload_id
            and session.get(path_key)
        ):
            return {
                "status": "success",
                "idempotent": True,
                "recording_truncated": bool(session.get(f"{path_key}_truncated")),
                "saved_to_session": True,
            }
    if file.content_type not in {"video/webm", "video/mp4", "application/octet-stream"}:
        raise HTTPException(status_code=415, detail="Only WebM or MP4 interview recordings are accepted")
    max_recording_bytes = 500 * 1024 * 1024
    if getattr(file, "size", 0) and file.size > max_recording_bytes:
        raise HTTPException(status_code=413, detail="Recording too large. Maximum size is 500MB.")
        
    try:
        # Create directory for temporary recordings if it doesn't exist
        recordings_dir = os.path.join(UPLOAD_FOLDER, "recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        
        # Generate filename
        prefix = "camera" if recording_type == "camera" else "screen"
        filename = f"{uuid.uuid4().hex}_{prefix}_recording.webm"
        file_path = os.path.join(recordings_dir, filename)
        
        # Save file locally first since it can be large
        bytes_written = 0
        try:
            with open(file_path, "wb") as buffer:
                while chunk := file.file.read(1024 * 1024):
                    bytes_written += len(chunk)
                    if bytes_written > max_recording_bytes:
                        raise HTTPException(status_code=413, detail="Recording too large. Maximum size is 500MB.")
                    buffer.write(chunk)
        except Exception:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise
            
        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload_large(
                file_path,
                resource_type="video",
                type="authenticated",
                folder="hireiq_interview_recordings",
            )
            cloudinary_public_id = upload_result.get("public_id")
            normalized_path = f"cloudinary-authenticated://{cloudinary_public_id}"
            
            # Clean up local file after successful upload
            os.remove(file_path)
            
        except Exception as cloud_e:
            logger.exception("Recording upload to private Cloudinary storage failed")
            if os.getenv("ENV", "local") == "production":
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(
                    status_code=503,
                    detail="Secure recording storage is temporarily unavailable",
                ) from cloud_e
            normalized_path = file_path.replace("\\", "/")
            cloudinary_public_id = None

        # Update database
        uploaded_at = datetime.now(timezone.utc)
        
        update_data = {
            path_key: normalized_path,
            f"{path_key}_uploaded_at": uploaded_at.isoformat(),
            f"{path_key}_expires_at": (uploaded_at + timedelta(days=RECORDING_RETENTION_DAYS)).isoformat(),
            f"{path_key}_retention_days": RECORDING_RETENTION_DAYS,
            f"{path_key}_storage": "cloudinary" if cloudinary_public_id else "local",
            f"{path_key}_truncated": bool(recording_truncated),
            f"{path_key}_upload_status": "complete",
        }
        if recording_upload_id:
            update_data[f"{path_key}_upload_id"] = recording_upload_id
        if cloudinary_public_id:
            update_data[f"{path_key}_cloudinary_public_id"] = cloudinary_public_id
            
        interview_update = interviews_collection.update_one(
            {"id": interview_id},
            {"$set": update_data}
        )

        session_filter = {"interview_id": interview_id}
        if link_id:
            session_filter = {"link_id": link_id}
            update_data["interview_id"] = interview_id
        session_update = interview_sessions_collection.update_one(
            session_filter,
            {"$set": update_data}
        )

        if interview_update.matched_count == 0 and session_update.matched_count == 0:
            if cloudinary_public_id:
                cloudinary.uploader.destroy(
                    cloudinary_public_id,
                    resource_type="video",
                    type="authenticated",
                    invalidate=True,
                )
            elif os.path.exists(normalized_path):
                os.remove(normalized_path)
            raise HTTPException(status_code=404, detail="Interview record no longer exists")

        for previous_public_id in previous_public_ids:
            if previous_public_id == cloudinary_public_id:
                continue
            try:
                cloudinary.uploader.destroy(
                    previous_public_id,
                    resource_type="video",
                    type="authenticated",
                    invalidate=True,
                )
            except Exception:
                logger.exception("Failed to delete a superseded private recording")
        recordings_root = os.path.abspath(recordings_dir)
        for previous_path in previous_local_paths:
            previous_absolute = os.path.abspath(previous_path)
            try:
                within_recordings = os.path.commonpath(
                    [recordings_root, previous_absolute]
                ) == recordings_root
            except ValueError:
                within_recordings = False
            if (
                within_recordings
                and previous_absolute != os.path.abspath(normalized_path)
                and os.path.isfile(previous_absolute)
            ):
                try:
                    os.remove(previous_absolute)
                except OSError:
                    logger.exception("Failed to delete a superseded local recording")

        return {
            "status": "success",
            "recording_truncated": bool(recording_truncated),
            "saved_to_interviews": interview_update.matched_count > 0,
            "saved_to_session": session_update.matched_count > 0
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error saving full recording")
        raise HTTPException(status_code=500, detail=str(e))


class RecordingUploadFailure(BaseModel):
    interview_id: str
    link_id: Optional[str] = None


@router.post("/recording-upload-failure")
def record_recording_upload_failure(
    data: RecordingUploadFailure,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    session = _require_candidate_session(
        credentials,
        link_id=data.link_id,
        interview_id=data.interview_id,
        allow_completed=True,
    )
    interview_sessions_collection.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "recording_upload_status": "failed",
                "recording_upload_failed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"status": "recorded"}


@router.get("/generate-report/{interview_id}")
def generate_report(
    interview_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    session = interview_sessions_collection.find_one({"interview_id": interview_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _require_admin_session_access(session, current_admin)
    # Fetch interview data
    interview_data = interviews_collection.find_one({"id": interview_id})
    if not interview_data:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    source = interview_data.get("source")
    date = interview_data.get("created_at")
    profile_text = interview_data.get("profile_text")
    
    # Fetch Q&A data
    answers_cursor = answers_collection.find({"interview_id": interview_id}).sort("question_id", 1)
    answers = [(a.get("question_text"), a.get("answer_text"), a.get("ai_score"), a.get("ai_feedback"), a.get("corrected_answer")) for a in answers_cursor]
    
    # Generate PDF
    pdf_filename = f"Interview_Report_{interview_id}.pdf"
    file_path = os.path.join(UPLOAD_FOLDER, pdf_filename)
    
    doc = SimpleDocTemplate(file_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = styles['Title']
    story.append(Paragraph(f"Interview Report", title_style))
    story.append(Spacer(1, 12))
    
    # Meta Info
    normal_style = styles['Normal']
    story.append(Paragraph(f"<b>Interview ID:</b> {interview_id}", normal_style))
    story.append(Paragraph(f"<b>Date:</b> {format_datetime_for_display(date)}", normal_style))
    story.append(Paragraph(f"<b>Source:</b> {source}", normal_style))
    story.append(Spacer(1, 12))
    
    # Fetch session record to reuse the average score already stored in the DB (includes blended scores)
    link_id = interview_data.get("link_id")
    session_rec = interview_sessions_collection.find_one({"link_id": link_id}) if link_id else None
    if not session_rec:
        session_rec = interview_sessions_collection.find_one({"interview_id": interview_id})
    avg_score = session_rec.get("avg_score") if session_rec else None
    
    # Calculate Average Score (Fallback if not populated in session document)
    if avg_score is None and answers:
        scores = [row[2] for row in answers if row[2] is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        
    if avg_score is not None:
        # Color code overall score
        color = "green" if avg_score >= 60 else "orange" if avg_score >= 40 else "red"
        story.append(Paragraph(f"<b>Overall Score:</b> <font color='{color}' size='14'>{avg_score:.1f}/100</font>", normal_style))
    else:
        story.append(Paragraph("<b>Overall Score:</b> N/A", normal_style))
    
    story.append(Spacer(1, 20))
    
    # Q&A Details
    for i, row in enumerate(answers):
        q_text, a_text, score, feedback, verified_answer = row
        
        # Question Header
        story.append(Paragraph(f"<b>Q{i+1}: {q_text}</b>", styles['Heading3']))
        story.append(Spacer(1, 5))
        
        # Your Answer
        a_text_disp = a_text if a_text else "(No answer recorded)"
        story.append(Paragraph(f"<b>Your Answer:</b> {a_text_disp}", normal_style))
        story.append(Spacer(1, 5))
        
        # AI Feedback & Score
        score_str = f"{score}/100" if score is not None else "N/A"
        feedback_str = feedback if feedback else "No feedback provided."
        
        # Color score (Green > 60, Red < 60)
        score_color = "green" if (score and score >= 60) else "red"
        
        story.append(Paragraph(f"<b>Score:</b> <font color='{score_color}'><b>{score_str}</b></font>", normal_style))
        story.append(Paragraph(f"<b>Feedback:</b> {feedback_str}", normal_style))
        
        # Suggested Answer (if verified answer exists and is different/better)
        if verified_answer:
             story.append(Spacer(1, 5))
             story.append(Paragraph(f"<b>Suggested/Corrected Answer:</b>", normal_style))
             story.append(Paragraph(f"<i>{verified_answer}</i>", normal_style))
             
        story.append(Spacer(1, 15))
        story.append(Paragraph("<hr width='100%'/>", normal_style)) # Separator using simplified HR if supported or just lines
        # Reportlab doesn't support <hr> well in Paragraph, use drawing or character separator
        # story.append(Paragraph("_" * 80, normal_style)) 
        
        story.append(Spacer(1, 15))

    # ── AI EVALUATION & RECOMMENDATION ──
    if session_rec:
        recommendation = session_rec.get("overall_recommendation") or session_rec.get("recommendation")
        strengths = session_rec.get("strengths_summary")
        weaknesses = session_rec.get("weaknesses_summary")
        
        if recommendation or strengths or weaknesses:
            story.append(Spacer(1, 20))
            story.append(Paragraph("<b>AI Recommendation & Evaluation</b>", styles['Heading2']))
            story.append(Spacer(1, 10))
            
            if recommendation:
                story.append(Paragraph(f"<b>Recommendation:</b> {recommendation}", normal_style))
                story.append(Spacer(1, 5))
            if strengths:
                story.append(Paragraph("<b>Strengths:</b>", normal_style))
                safe_strengths = strengths.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
                story.append(Paragraph(safe_strengths, normal_style))
                story.append(Spacer(1, 5))
            if weaknesses:
                story.append(Paragraph("<b>Areas to Improve:</b>", normal_style))
                safe_weaknesses = weaknesses.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
                story.append(Paragraph(safe_weaknesses, normal_style))
                story.append(Spacer(1, 5))
            
            story.append(Spacer(1, 15))

    # ── CODING ROUND ──
    coding_round = interview_data.get("coding_round")
    if coding_round and (coding_round.get("latest_code") or coding_round.get("final_evaluation")):
        story.append(Spacer(1, 20))
        story.append(Paragraph("<b>Coding Round Results</b>", styles['Heading2']))
        story.append(Spacer(1, 10))
        
        if coding_round.get("latest_code"):
            story.append(Paragraph("<b>Submitted Code:</b>", normal_style))
            safe_code = coding_round["latest_code"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            
            code_style = ParagraphStyle(
                'Code', parent=normal_style, fontName='Courier', fontSize=9, 
                leading=11, backColor='#f4f4f4', borderPadding=5, borderRadius=3
            )
            story.append(Paragraph(safe_code, code_style))
            story.append(Spacer(1, 15))
            
        if coding_round.get("final_evaluation"):
            story.append(Paragraph("<b>AI Evaluation:</b>", normal_style))
            safe_eval = coding_round["final_evaluation"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            story.append(Paragraph(safe_eval, normal_style))
            story.append(Spacer(1, 15))
            
    # ── CASE STUDY ROUND ──
    case_study = interview_data.get("case_study_round")
    if case_study and case_study.get("answers"):
        story.append(Spacer(1, 20))
        story.append(Paragraph("<b>Case Study Round Results</b>", styles['Heading2']))
        story.append(Spacer(1, 10))
        
        questions = case_study.get("questions", [])
        for i, ans in enumerate(case_study.get("answers", [])):
            if ans is None:
                continue
            
            q_text = questions[i].get("text", f"Question {i+1}") if i < len(questions) else f"Question {i+1}"
            story.append(Paragraph(f"<b>Q{i+1}: {q_text}</b>", styles['Heading3']))
            story.append(Spacer(1, 5))
            
            a_text = ans.get("answer_text", "")
            if a_text:
                a_text_disp = a_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            else:
                a_text_disp = "(No answer recorded)"
                
            story.append(Paragraph(f"<b>Your Answer:</b> {a_text_disp}", normal_style))
            story.append(Spacer(1, 15))

    doc.build(story)
    
    # Return the PDF file directly for download
    return FileResponse(
        path=file_path,
        filename=pdf_filename,
        media_type="application/pdf"
    )

# --------------------------------------------------------------------------------
# ADMIN & SESSION MANAGEMENT APIs
# --------------------------------------------------------------------------------

@router.post("/admin/preview-email")
def preview_email(data: EmailPreviewRequest, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    """Return the default email HTML for admin to edit before sending."""
    return {
        "html": build_default_interview_email_html(
            candidate_name=data.candidate_name,
            duration=data.duration,
            job_description=data.job_description,
            full_link="{{INTERVIEW_LINK}}",
            scheduled_start=data.scheduled_start,
            scheduled_end=data.scheduled_end
        )
    }


# ── Task 3: Submission Notification Email ────────────────────────────────────
def preview_email_v2(data: EmailPreviewRequest):
    return {
        "html": build_default_interview_email_html(
            candidate_name=data.candidate_name,
            duration=data.duration,
            job_description=data.job_description,
            full_link="{{INTERVIEW_LINK}}",
            scheduled_start=data.scheduled_start,
            scheduled_end=data.scheduled_end
        )
    }

for _route in router.routes:
    if getattr(_route, "path", "") == "/admin/preview-email" and "POST" in getattr(_route, "methods", set()):
        _route.endpoint = preview_email_v2
        break

def send_submission_notification(candidate_email: str, candidate_name: str, admin_email: str, avg_score: float, total_questions: int):
    """Send test submission notification to both admin and candidate."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email_addr = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key:
        return False

    # Email to candidate
    candidate_html = f"""
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px; background-color: #f1f5f9; min-height: 100%;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 24px 32px; text-align: left;">
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">✅ Interview Submitted Successfully</h2>
            </div>
            <div style="padding: 32px; background-color: #ffffff;">
                <p style="font-size: 16px; color: #0f172a; text-align: left; margin: 0 0 20px 0;">Dear <b>{candidate_name}</b>,</p>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">Thank you for completing your AI-powered interview. Your responses have been successfully submitted and are now being reviewed.</p>
                <div style="background-color: #f0fdf4; border-radius: 8px; padding: 15px; margin: 24px 0; border: 1px solid #bbf7d0; text-align: left;">
                    <p style="margin: 0; color: #166534; font-size: 14px;">📊 <b>Questions Answered:</b> {total_questions}</p>
                </div>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">Our recruitment team will review your performance and get back to you shortly. Please keep an eye on your email for further updates.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 24px 0;">
                <p style="color: #64748b; font-size: 14px; margin: 0; text-align: left; line-height: 1.6;">Best regards,<br/><b style="color: #4f46e5;">Hire IQ Recruiting</b></p>
            </div>
        </div>
        <div style="max-width: 600px; margin: 24px auto 0; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Powered by Hire IQ AI Assessments</p>
        </div>
    </body></html>
    """

    # Email to admin
    score_color = "#10b981" if avg_score >= 60 else "#ef4444"
    admin_html = f"""
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px; background-color: #f1f5f9; min-height: 100%;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 24px 32px; text-align: left;">
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">📋 New Interview Submission</h2>
            </div>
            <div style="padding: 32px; background-color: #ffffff;">
                <p style="font-size: 16px; color: #0f172a; text-align: left; margin: 0 0 20px 0;">A candidate has completed their interview:</p>
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; border-left: 4px solid #6366f1; text-align: left;">
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>👤 Candidate:</b> {candidate_name}</p>
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>📧 Email:</b> {candidate_email}</p>
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>📊 Questions Answered:</b> {total_questions}</p>
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>🏆 Average Score:</b> <span style="color: {score_color}; font-weight: 700; font-size: 18px;">{avg_score:.1f}/100</span></p>
                </div>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">Login to the admin panel to review the full results, video recording, and AI analysis.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 24px 0;">
                <p style="color: #64748b; font-size: 14px; margin: 0; text-align: left; line-height: 1.6;">— AI Interview System</p>
            </div>
        </div>
    </body></html>
    """

    results = []
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {"api-key": api_key, "content-type": "application/json"}

    # Send to candidate
    try:
        res = requests.post(url, json={
            "sender": {"name": sender_name, "email": sender_email_addr},
            "to": [{"email": candidate_email, "name": candidate_name}],
            "subject": "Your Interview Has Been Submitted — HireIQ",
            "htmlContent": candidate_html
        }, headers=headers, timeout=10)
        results.append(res.status_code < 300)
    except Exception:
        results.append(False)

    # Send to admin
    if admin_email:
        try:
            res = requests.post(url, json={
                "sender": {"name": sender_name, "email": sender_email_addr},
                "to": [{"email": admin_email, "name": "Admin"}],
                "subject": f"Interview Submitted: {candidate_name}",
                "htmlContent": admin_html
            }, headers=headers, timeout=10)
            results.append(res.status_code < 300)
        except Exception:
            results.append(False)

    return all(results)


# ── Task 8: Dashboard Stats Endpoint ────────────────────────────────────────
@router.get("/admin/dashboard-stats")
async def get_dashboard_stats(admin_id: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return aggregated stats for the admin dashboard."""
    from redis_manager import manager
    import json
    
    # Try cache first
    cache_key = f"dashboard_stats:{current_admin.get('company_id')}:{current_admin.get('admin_id')}:{admin_id or 'none'}"
    if manager.redis:
        cached = await manager.redis.get(cache_key)
        if cached:
            return json.loads(cached)

    try:
        comp_id = current_admin.get("company_id")
        query = {}
        if current_admin.get("role") != "master":
            query["company_id"] = comp_id
        
        if current_admin.get("role") == "admin":
            admin_doc = await asyncio.to_thread(
                admins_collection.find_one, {"_id": ObjectId(current_admin["admin_id"])}
            )
            credits = admin_doc.get("credits", 0) if admin_doc else 0
        elif comp_id:
            # super_admin and master: use company credits (sessions deduct from company pool)
            company = await asyncio.to_thread(companies_collection.find_one, {"_id": ObjectId(comp_id)})
            credits = company.get("credits", 0) if company else 0
        else:
            credits = 0
        
        # Data Isolation:
        # If the user is a standard admin, force the query to their own admin_id
        if current_admin.get("role") == "admin":
            query["created_by"] = current_admin["admin_id"]
        # If the user is a super admin and requested a specific admin's data, filter by it
        elif admin_id:
            query["created_by"] = admin_id
            
        now = datetime.now(timezone.utc)
        from datetime import timedelta
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()
        week_start = (now - timedelta(days=7)).isoformat()
        active_query = {
            **query,
            "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}],
        }
        dashboard_pipeline = [
            {"$match": active_query},
            {"$set": {
                "effective_status": {
                    "$cond": [
                        {"$and": [
                            {"$eq": ["$status", "pending"]},
                            {"$ne": [{"$ifNull": ["$expires_at", None]}, None]},
                            {"$lt": ["$expires_at", now.isoformat()]},
                        ]},
                        "expired",
                        "$status",
                    ]
                }
            }},
            {"$facet": {
                "summary": [{"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$effective_status", "completed"]}, 1, 0]}},
                    "started": {"$sum": {"$cond": [{"$eq": ["$effective_status", "started"]}, 1, 0]}},
                    "expired": {"$sum": {"$cond": [{"$eq": ["$effective_status", "expired"]}, 1, 0]}},
                    "selected": {"$sum": {"$cond": [{"$eq": ["$decision", "selected"]}, 1, 0]}},
                    "rejected": {"$sum": {"$cond": [{"$eq": ["$decision", "rejected"]}, 1, 0]}},
                    "total_score": {"$sum": {"$ifNull": ["$avg_score", 0]}},
                    "scored_count": {"$sum": {"$cond": [{"$ne": [{"$ifNull": ["$avg_score", None]}, None]}, 1, 0]}},
                    "today": {"$sum": {"$cond": [{"$gte": ["$created_at", today_start]}, 1, 0]}},
                    "this_week": {"$sum": {"$cond": [{"$gte": ["$created_at", week_start]}, 1, 0]}},
                    "candidate_emails": {"$addToSet": {"$toLower": {"$ifNull": ["$candidate_email", "$email"]}}},
                }}],
                "by_creator": [{"$group": {"_id": "$created_by", "count": {"$sum": 1}}}],
                "daily": [
                    {"$match": {"created_at": {"$gte": week_start}}},
                    {"$group": {"_id": {"$substrBytes": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
                ],
            }},
        ]
        aggregate_rows = await asyncio.to_thread(
            lambda: list(interview_sessions_collection.aggregate(dashboard_pipeline))
        )
        aggregate_data = aggregate_rows[0] if aggregate_rows else {}
        summary = (aggregate_data.get("summary") or [{}])[0]
        total = summary.get("total", 0)
        completed = summary.get("completed", 0)
        started = summary.get("started", 0)
        expired = summary.get("expired", 0)
        pending = max(0, total - completed - started - expired)
        selected = summary.get("selected", 0)
        rejected = summary.get("rejected", 0)
        total_score = summary.get("total_score", 0)
        scored_count = summary.get("scored_count", 0)
        today_count = summary.get("today", 0)
        week_count = summary.get("this_week", 0)
        seen_emails = {email for email in summary.get("candidate_emails", []) if email}
        session_by_creator = {
            str(row.get("_id") or ""): row.get("count", 0)
            for row in aggregate_data.get("by_creator", [])
            if row.get("_id")
        }
        daily_counts = {
            row.get("_id"): row.get("count", 0)
            for row in aggregate_data.get("daily", [])
            if row.get("_id")
        }
                
        # Merge stats from AI Calling interested candidates
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if current_admin.get("role") == "admin":
                jobs_query["admin_id"] = current_admin["admin_id"]
            elif admin_id:
                jobs_query["admin_id"] = admin_id
            jobs = await asyncio.to_thread(lambda: list(jobs_collection.find(jobs_query)))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"}
            }
            apps = await asyncio.to_thread(
                lambda: list(job_applications_collection.find(
                    app_query,
                    {"email": 1, "score": 1, "applied_at": 1, "updated_at": 1},
                ))
            )
            
            for app in apps:
                email = app.get("email")
                if email:
                    email_lower = email.strip().lower()
                    if email_lower in seen_emails:
                        continue
                    seen_emails.add(email_lower)
                
                total += 1
                completed += 1
                selected += 1
                
                score = app.get("score")
                if score is not None:
                    total_score += score
                    scored_count += 1
                    
                try:
                    created_str = app.get("applied_at") or app.get("updated_at")
                    if created_str:
                        created = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                        if created.tzinfo is None:
                            created = created.replace(tzinfo=timezone.utc)
                        if created.date() == now.date():
                            today_count += 1
                        if (now - created).days <= 7:
                            week_count += 1
                except Exception:
                    pass
        except Exception as e:
            print(f"Error merging AI Calling stats: {e}")
        
        avg_score = round(total_score / scored_count, 1) if scored_count > 0 else 0
        
        # Super Admin metrics
        recruiters_count = 0
        chart_labels = []
        chart_data = []
        admin_labels = []
        admin_data = []
        credits_used = 0
        credits_available = credits

        if comp_id:
            # 1. Recruiters Count
            recruiters_count = await asyncio.to_thread(
                admins_collection.count_documents, {"company_id": comp_id, "role": "admin"}
            )
            
            # 2. Last 7 Days Usage
            for i in range(6, -1, -1):
                day = now - timedelta(days=i)
                start_of_day = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
                count = daily_counts.get(start_of_day.date().isoformat(), 0)
                chart_labels.append(day.strftime("%m/%d"))
                chart_data.append(count)
                
            # Sessions with created_by='admin' (frontend fallback string) are attributed to the current admin
            if "admin" in session_by_creator:
                session_by_creator[current_admin["admin_id"]] = (
                    session_by_creator.get(current_admin["admin_id"], 0) + session_by_creator.pop("admin")
                )

            # Load all admins in this company and map each to their session count
            all_company_admins = await asyncio.to_thread(
                lambda: list(admins_collection.find(
                    {"company_id": comp_id},
                    {"_id": 1, "name": 1, "username": 1, "email": 1},
                ))
            )
            seen_admin_ids = set()
            for a in all_company_admins:
                aid = str(a["_id"])
                if aid in seen_admin_ids:
                    continue
                seen_admin_ids.add(aid)
                name = a.get("name") or a.get("username") or "Admin"
                # Try ObjectId string first, then username, then email as fallbacks
                count = session_by_creator.get(aid, 0)
                if count == 0 and a.get("username"):
                    count = session_by_creator.get(a["username"], 0)
                if count == 0 and a.get("email"):
                    count = session_by_creator.get(a["email"], 0)
                admin_labels.append(name)
                admin_data.append(count)

            # 4. Credits Used vs Available
            # Each interview session costs exactly 1 credit (deducted atomically at creation).
            # credits_used = total non-deactivated sessions for this company.
            credits_used = await asyncio.to_thread(
                interview_sessions_collection.count_documents,
                {"company_id": comp_id, "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]},
            )

        stats = {
            "total": total,
            "pending": pending,
            "completed": completed,
            "started": started,
            "expired": expired,
            "selected": selected,
            "rejected": rejected,
            "avg_score": avg_score,
            "today": today_count,
            "this_week": week_count,
            "credits": credits,
            "credits_available": credits_available,
            "credits_used": credits_used,
            "recruiters_count": recruiters_count,
            "chart_labels": chart_labels,
            "chart_data": chart_data,
            "admin_labels": admin_labels,
            "admin_data": admin_data
        }
        
        if manager.redis:
            await manager.redis.setex(cache_key, 30, json.dumps(stats))
            
        return stats
    except Exception as e:
        return {"error": str(e)}


# ── Task 2: Export Sessions Data Endpoint ───────────────────────────────────
@router.get("/admin/export-sessions")
def export_sessions(current_admin: dict = Depends(get_current_admin_details), status_filter: str = ""):
    """Return session data for Excel export, filtered by status."""
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    require_admin_capability(
        admin_id,
        "export_sessions",
        "Session export is available on Basic and Advance plans only.",
    )
    query = {"company_id": company_id}
    rows = list(interview_sessions_collection.find(query).sort("created_at", -1))
    now = datetime.now(timezone.utc)
    
    export_data = []
    for row in rows:
        current_status = sync_session_status(row, now)
        
        decision = row.get("decision", "")
        
        # Apply status filter
        if status_filter:
            if status_filter == "selected" and decision != "selected":
                continue
            elif status_filter == "rejected" and decision != "rejected":
                continue
            elif status_filter in ["pending", "completed", "started", "expired"] and current_status != status_filter:
                continue
        
        export_data.append({
            "candidate_id": row.get("candidate_id", ""),
            "candidate_name": row.get("candidate_name", ""),
            "candidate_email": row.get("candidate_email", ""),
            "status": current_status,
            "decision": decision or "Pending Review",
            "score": row.get("avg_score", ""),
            "recommendation": row.get("overall_recommendation", ""),
            "interview_duration": row.get("interview_duration", 30),
            "created_at": row.get("created_at", ""),
            "expires_at": row.get("expires_at", "")
        })
    
    return {"data": export_data}

# Redundant v2 removed as v1 unified above.

def process_pending_invitation_emails():
    now = datetime.now(timezone.utc).isoformat()
    due_sessions = list(interview_sessions_collection.find({
        "invite_email_status": {"$in": ["pending", "failed"]},
        "invite_email_send_at": {"$lte": now}
    }).limit(25))

    for session in due_sessions:
        claimed = interview_sessions_collection.update_one(
            {"_id": session["_id"], "invite_email_status": {"$in": ["pending", "failed"]}},
            {"$set": {"invite_email_status": "sending"}}
        )
        if claimed.modified_count == 0:
            continue

        link_url = f"{FRONTEND_URL}/interview?session_id={session['link_id']}"
        sent = send_interview_email(
            candidate_email=session.get("candidate_email", ""),
            candidate_name=session.get("candidate_name", ""),
            link_url=link_url,
            duration=session.get("interview_duration", 30),
            job_description=session.get("job_description", ""),
            custom_html=session.get("custom_email_html", ""),
            scheduled_start=session.get("scheduled_start", ""),
            scheduled_end=session.get("scheduled_end", "")
        )

        interview_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {
                "invite_email_status": "sent" if sent else "failed",
                "invite_email_sent_at": datetime.now(timezone.utc).isoformat() if sent else None
            }}
        )

def invitation_email_scheduler_loop():
    while True:
        try:
            process_pending_invitation_emails()
        except Exception as e:
            print(f"Email scheduler error: {e}")
        time.sleep(30)

# Startup functions (to be called by main.py lifespan)
async def startup_event_db_and_email():
    import mongo_db
    await mongo_db.init_db_indexes()
    global EMAIL_SCHEDULER_STARTED, MAIN_LOOP
    MAIN_LOOP = asyncio.get_running_loop()
    # Create default MASTER admin if not exists
    try:
        master_row = admins_collection.find_one({"username": "master"})
        if not master_row:
            import secrets
            master_pw = os.getenv("DEFAULT_MASTER_PASSWORD") or secrets.token_urlsafe(12)
            hashed_pw = hash_password(master_pw)
            default_email = os.getenv("BREVO_SENDER_EMAIL", "no-reply@hireiq.co.in")
            admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
                "username": "master",
                "password": hashed_pw,
                "email": default_email,
                "role": "master",
                "subscription_plan": "master",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"Default master created: master / {master_pw} (Email: {default_email})")
            
        row = admins_collection.find_one({"username": "admin"})
        if not row:
            import secrets
            admin_pw = os.getenv("DEFAULT_ADMIN_PASSWORD") or secrets.token_urlsafe(12)
            hashed_pw = hash_password(admin_pw)
            default_email = os.getenv("BREVO_SENDER_EMAIL", "no-reply@hireiq.co.in")
            admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
                "username": "admin",
                "password": hashed_pw,
                "email": default_email,
                "role": "super_admin",
                "subscription_plan": "advance",
                "subscription_start": datetime.now(timezone.utc).isoformat(),
                "subscription_expiry": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"Default admin created: admin / {admin_pw} (Email: {default_email})")
        else:
            # Upgrade legacy admin to tenant
            update_data = {}
            if not row.get("email"): update_data["email"] = os.getenv("BREVO_SENDER_EMAIL", "no-reply@hireiq.co.in")
            if not row.get("role"): update_data["role"] = "tenant"
            if not row.get("subscription_plan"):
                update_data["subscription_plan"] = "advance"
                update_data["subscription_start"] = datetime.now(timezone.utc).isoformat()
                update_data["subscription_expiry"] = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
            if update_data:
                admins_collection.update_one({"username": "admin"}, {"$set": update_data})
    except Exception as e:
        print(f"Error checking/creating admin: {e}")

    # Seed default plans if they don't exist
    try:
        default_plans = [
            {
                "plan_name": "Free Trial",
                "credits_granted": get_plan_definition("trial")["credits_granted"],
                "price": get_plan_definition("trial")["price"],
                "features": get_plan_definition("trial")["features"],
                "is_unlimited": False,
                "is_owner_plan": False
            },
            {
                "plan_name": "Basic",
                "credits_granted": get_plan_definition("basic")["credits_granted"],
                "price": get_plan_definition("basic")["price"],
                "features": get_plan_definition("basic")["features"],
                "is_unlimited": False,
                "is_owner_plan": False
            },
            {
                "plan_name": "Advance",
                "credits_granted": get_plan_definition("advance")["credits_granted"],
                "price": get_plan_definition("advance")["price"],
                "features": get_plan_definition("advance")["features"],
                "is_unlimited": False,
                "is_owner_plan": False
            },
            {
                "plan_name": "Owner",
                "credits_granted": get_plan_definition("owner")["credits_granted"],
                "price": get_plan_definition("owner")["price"],
                "features": get_plan_definition("owner")["features"],
                "is_unlimited": True,
                "is_owner_plan": True
            }
        ]
        for plan in default_plans:
            existing = plans_collection.find_one({"plan_name": plan["plan_name"]})
            if not existing:
                plans_collection.insert_one(plan)
                print(f"Seeded plan: {plan['plan_name']}")
    except Exception as e:
        print(f"Error seeding plans: {e}")

    if not EMAIL_SCHEDULER_STARTED:
        threading.Thread(target=invitation_email_scheduler_loop, daemon=True).start()
        EMAIL_SCHEDULER_STARTED = True

@router.get("/api/interview/{interview_id}/insights")
def get_interview_insights(
    interview_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    session = interview_sessions_collection.find_one({"interview_id": interview_id})
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
    _require_admin_session_access(session, current_admin)
    answers = list(answers_collection.find({"interview_id": interview_id}))
    
    if not answers:
        return {
            "clarity": 50,
            "technicalDepth": 50,
            "confidence": 50
        }
        
    scored_answers = [a for a in answers if a.get("scoring_status") == "complete"]
    
    if not scored_answers:
         return {
            "clarity": 50,
            "technicalDepth": 50,
            "confidence": 50
        }
        
    total_clarity = sum(a.get("clarity_score", 50) for a in scored_answers)
    total_technical = sum(a.get("technical_depth_score", 50) for a in scored_answers)
    total_confidence = sum(a.get("confidence_score", 50) for a in scored_answers)
    
    count = len(scored_answers)
    
    return {
        "clarity": round(total_clarity / count),
        "technicalDepth": round(total_technical / count),
        "confidence": round(total_confidence / count)
    }

@router.post("/admin/forgot-password")
def forgot_password(data: ForgotPasswordRequest):
    user = admins_collection.find_one({"username": data.username, "email": data.email})
    if not user:
        raise HTTPException(status_code=404, detail="Username and email do not match our records.")
    
    otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
    expiry = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    
    admins_collection.update_one({"_id": user["_id"]}, {"$set": {"otp": otp, "otp_expiry": expiry, "otp_attempts": 0}})
    
    # Send OTP email
    email_sent = send_otp_email(data.email, data.username, otp)
    if email_sent:
        return {"status": "success", "message": "OTP sent to your registered email."}
    else:
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again later.")

@router.post("/admin/verify-otp")
def verify_otp(data: VerifyOTPRequest):
    row = admins_collection.find_one({"username": data.username})
    if not row or not row.get("otp"):
        raise HTTPException(status_code=400, detail="No OTP found for this user.")
    
    db_otp = row.get("otp")
    expiry_str = row.get("otp_expiry")
    attempts = row.get("otp_attempts", 0)
    
    if attempts >= 5:
        admins_collection.update_one({"_id": row["_id"]}, {"$unset": {"otp": "", "otp_expiry": "", "otp_attempts": ""}})
        raise HTTPException(status_code=403, detail="Maximum OTP attempts exceeded. Please request a new OTP.")
        
    if db_otp != data.otp:
        admins_collection.update_one({"_id": row["_id"]}, {"$inc": {"otp_attempts": 1}})
        raise HTTPException(status_code=401, detail="Invalid OTP code.")
    
    expiry = datetime.fromisoformat(expiry_str)
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=401, detail="OTP has expired.")
    
    return {"status": "success", "message": "OTP verified successfully."}

@router.post("/admin/reset-password")
def reset_password(data: ResetPasswordRequest):
    # Verify OTP one last time for safety
    row = admins_collection.find_one({"username": data.username})
    if not row:
        raise HTTPException(status_code=401, detail="Invalid session. Please restart the process.")
        
    attempts = row.get("otp_attempts", 0)
    if attempts >= 5:
        admins_collection.update_one({"_id": row["_id"]}, {"$unset": {"otp": "", "otp_expiry": "", "otp_attempts": ""}})
        raise HTTPException(status_code=403, detail="Maximum OTP attempts exceeded. Please request a new OTP.")
        
    if row.get("otp") != data.otp:
        admins_collection.update_one({"_id": row["_id"]}, {"$inc": {"otp_attempts": 1}})
        raise HTTPException(status_code=401, detail="Invalid session. Please restart the process.")
    
    expiry = datetime.fromisoformat(row.get("otp_expiry"))
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=401, detail="Session expired.")
    
    hashed_pw = hash_password(data.new_password)
    admins_collection.update_one({"_id": row["_id"]}, {"$set": {"password": hashed_pw}, "$unset": {"otp": "", "otp_expiry": "", "otp_attempts": ""}})
    
    return {"status": "success", "message": "Password updated successfully. You can now login."}

def send_otp_email(email: str, name: str, otp: str):
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    
    if not api_key: return False

    html = f"""
    <html><body>
        <h3>Password Reset Request</h3>
        <p>Dear {name},</p>
        <p>You requested to reset your admin password. Please use the following One-Time Password (OTP) to proceed:</p>
        <h2 style='color: #6366f1; letter-spacing: 5px; font-size: 2rem;'>{otp}</h2>
        <p>This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <p>Best Regards,<br/>Hire IQ</p>
    </body></html>
    """

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": name}],
        "subject": "Admin Password Reset OTP",
        "htmlContent": html
    }
    
    try:
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {"accept": "application/json", "api-key": api_key, "content-type": "application/json"}
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return response.status_code < 300
    except:
        return False


    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@router.post("/admin/profile")
def update_profile(data: UpdateProfileRequest, current_admin: str = Depends(get_current_admin)):
    try:
        from bson import ObjectId
        
        admin_id_obj = ObjectId(str(data.admin_id))
        admin = admins_collection.find_one({"_id": admin_id_obj})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
            
        update_fields = {}
        
        if data.old_password and data.new_password:
            if not verify_password(data.old_password, admin["password"]):
                raise HTTPException(status_code=400, detail="Incorrect old password")
            update_fields["password"] = hash_password(data.new_password)
            
        if data.email:
            update_fields["email"] = data.email
        if data.username:
            update_fields["username"] = data.username
        if data.company_name:
            update_fields["company_name"] = data.company_name
            
        if not update_fields:
            return {"status": "success", "message": "No changes made."}
            
        admins_collection.update_one({"_id": admin_id_obj}, {"$set": update_fields})
        
        # Broadcast updated profile details
        admin_doc = admins_collection.find_one({"_id": admin_id_obj})
        if admin_doc:
            broadcast_profile_update(
                admin_id=str(admin_id_obj),
                company_id=str(admin_doc.get("company_id") or ""),
                credits=admin_doc.get("credits"),
                login_enabled=admin_doc.get("login_enabled"),
                extra={
                    "name": admin_doc.get("name"),
                    "username": admin_doc.get("username"),
                    "email": admin_doc.get("email"),
                    "company_name": admin_doc.get("company_name")
                }
            )
        
        # Remove password from response if present
        if "password" in update_fields:
            del update_fields["password"]
            
        return {
            "status": "success", 
            "message": "Profile updated successfully.",
            "updated_fields": update_fields
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

@router.post("/api/master/profile/image")
@router.post("/master/profile/image")
@router.post("/api/superadmin/profile/image")
@router.post("/superadmin/profile/image")
@router.post("/api/admin/profile/image")
@router.post("/admin/profile/image")
def upload_profile_image(
    admin_id: str = Form(...),
    file: UploadFile = File(...),
    current_admin: dict = Depends(get_current_admin_details)
):
    try:
        from bson import ObjectId
        admin_id_obj = ObjectId(admin_id)
        admin = admins_collection.find_one({"_id": admin_id_obj})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
            
        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload(
                file.file,
                folder="profile_images",
                resource_type="image"
            )
            secure_url = upload_result.get("secure_url")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")
            
        # Update db
        admins_collection.update_one(
            {"_id": admin_id_obj},
            {"$set": {"profile_image": secure_url, "avatar": secure_url}}
        )
        
        # Broadcast updated profile image
        broadcast_profile_update(
            admin_id=str(admin_id_obj),
            company_id=str(admin.get("company_id") or ""),
            credits=admin.get("credits"),
            login_enabled=admin.get("login_enabled"),
            extra={"profile_image": secure_url, "avatar": secure_url}
        )
        
        return {
            "status": "success",
            "profile_image": secure_url,
            "avatar": secure_url
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

def extract_info_from_resume(text: str) -> Dict:
    import re
    email = None
    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    if email_match:
        email = email_match.group(0)
        
    name = None
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    # First non-empty line that doesn't look like an email or phone
    for line in lines[:10]:
        if len(line) < 40 and not re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', line) and not re.search(r'\d{10}', line):
            name = line
            break
    
    return {"name": name, "email": email}

@router.post("/admin/parse-resume")
async def parse_resume(
    file: UploadFile = File(...), 
    source: Optional[str] = Form(None),
    upload_to_cloud: Optional[str] = Form(None),
    current_admin: dict = Depends(get_current_admin_details)
):
    ALLOWED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and TXT are allowed for security reasons.")
        
    if getattr(file, "size", 0) and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
    content = file.file.read()
    text = extract_text_from_file(content, file.filename)
    
    file_url = None
    if upload_to_cloud and upload_to_cloud.lower() in ('true', '1', 'yes'):
        import os
        import uuid
        temp_dir = os.path.join(os.getcwd(), "temp_uploads")
        os.makedirs(temp_dir, exist_ok=True)
        temp_filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
        temp_path = os.path.join(temp_dir, temp_filename)
        with open(temp_path, "wb") as f:
            f.write(content)
        file_url = f"temp://{temp_filename}"

    info = {}
    
    title = "Job Posting"
    experience = "Not Specified"
    skills_str = ""
    location = ""
    salary = ""
    bond = ""
    workMode = "Remote"
    warning = None
    
    if source == 'jd':
        from app.services import analyze_resume_or_jd, chat_completion
        from starlette.concurrency import run_in_threadpool
        try:
            import asyncio
            analysis = await asyncio.wait_for(run_in_threadpool(analyze_resume_or_jd, text), timeout=15.0)
            skills_list = analysis.get("skills", []) if isinstance(analysis, dict) else []
            skills_str = ", ".join(skills_list)
        except asyncio.TimeoutError:
            print("JD skills analysis timed out.")
            warning = "Failed to extract skills. Analysis timed out."
        except Exception as e:
            print("Error analyzing JD skills:", e)
            warning = "Failed to extract skills. "

        try:
            prompt = f"""Extract the following fields from this job description:
1. title (string)
2. experience (string, e.g., '2-3 years')
3. location (string)
4. salary (string)
5. bond (string, e.g., '1 year' or 'No')
6. workMode (string, only one of: 'Remote', 'Hybrid', 'On-site')

Return a pure JSON object with these keys. If not found, return empty string for that key. Do not use markdown. JD: {text[:20000]}"""
            
            resp = await run_in_threadpool(
                chat_completion,
                messages=[{"role": "user", "content": prompt}],
                model="openai/gpt-4o-mini",
                temperature=0.0,
                timeout=15.0
            )
            
            import json, re
            if resp:
                resp_clean = re.sub(r"```(?:json)?", "", resp).strip()
                try:
                    data = json.loads(resp_clean)
                    title = data.get("title") or title
                    experience = data.get("experience") or experience
                    location = data.get("location") or ""
                    salary = data.get("salary") or ""
                    bond = data.get("bond") or ""
                    
                    wm_parsed = str(data.get("workMode") or "").strip().lower()
                    if "hybrid" in wm_parsed:
                        workMode = "Hybrid"
                    elif "site" in wm_parsed or "office" in wm_parsed:
                        workMode = "On-site"
                    elif "remote" in wm_parsed:
                        workMode = "Remote"
                except Exception as parse_e:
                    print("Error parsing JSON for JD details:", parse_e)
                    warning = (warning + " " if warning else "") + "AI parsing failed or was incomplete. Some fields may be missing."
        except Exception as e:
            print("Error extracting JD info:", e)
            warning = (warning + " " if warning else "") + "AI auto-fill failed. Using basic text extraction. Please verify."
            
            import re
            
            # Basic Regex Fallbacks
            if not experience or experience == "Not Specified":
                exp_match = re.search(r'(\d+(?:\s*(?:-|to)\s*\d+)?\+?\s*(?:year|yr)s?)', text, re.IGNORECASE)
                if exp_match: experience = exp_match.group(1).title()
                
            if not salary:
                sal_match = re.search(r'((?:Rs\.?|INR|\$|₹)\s*[\d,.]+(?:\s*(?:-|to)\s*(?:Rs\.?|INR|\$|₹)?\s*[\d,.]+)?\s*(?:LPA|lakhs?|k|pa|per annum)?)', text, re.IGNORECASE)
                if not sal_match:
                    sal_match = re.search(r'([\d,.]+\s*(?:LPA|lakhs?))', text, re.IGNORECASE)
                if sal_match: salary = sal_match.group(1)
                
            if workMode == "Remote": # Default is Remote, try to find otherwise
                if re.search(r'\b(?:hybrid)\b', text, re.IGNORECASE):
                    workMode = "Hybrid"
                elif re.search(r'\b(?:on-site|onsite|work from office|in office)\b', text, re.IGNORECASE):
                    workMode = "On-site"
                    
            if not location:
                loc_match = re.search(r'(?:location|job location)\s*[:-]\s*([a-zA-Z\s,]+)(?:\n|$)', text, re.IGNORECASE)
                if loc_match:
                    location = loc_match.group(1).strip()[:50]
            
        if title == "Job Posting":
            lines = [l.strip() for l in text.split('\n') if l.strip()]
            if lines:
                title = lines[0][:50]
    else:
        info = extract_info_from_resume(text)
        
    res_dict = {
        "status": "success",   
        "text": text,
        "name": info.get("name"), 
        "email": info.get("email"),
        "file_url": file_url,
        "title": title,
        "experience": experience,
        "skills": skills_str,
        "location": location,
        "salary": salary,
        "bond": bond,
        "workMode": workMode
    }
    if warning:
        res_dict["warning"] = warning
    return res_dict


@router.get("/admin/candidate/check")
def check_candidate(email: str, current_admin: dict = Depends(get_current_admin_details)):
    try:
        # Check if candidate exists for this company (or globally if super admin)
        query = {"candidate_email": email}
        if current_admin.get("role") not in ["super_admin", "master"]:
            query["company_id"] = current_admin.get("company_id")
            
        session = interview_sessions_collection.find_one(
            query,
            sort=[("created_at", -1)]
        )
        if session:
            return {
                "exists": True,
                "resume_text": session.get("resume_text", ""),
                "candidate_name": session.get("candidate_name", "")
            }
        return {"exists": False}
    except Exception as e:
        return {"exists": False, "error": str(e)}

@router.post("/admin/create-session")
def create_session(data: CreateSession, current_admin: dict = Depends(get_current_admin_details)):
    company_id = current_admin.get("company_id")
    
    # ATOMIC DEDUCTION (Prevents race conditions leading to negative credits)
    if company_id:
        res = companies_collection.update_one(
            {"_id": ObjectId(company_id), "credits": {"$gte": 1}},
            {"$inc": {"credits": -1}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail="Insufficient company credits (or concurrent request).")
            
    if current_admin.get("role") == "admin":
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": 1}},
            {"$inc": {"credits": -1}}
        )
        if res.modified_count == 0:
            if company_id:
                companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": 1}})
            raise HTTPException(status_code=403, detail="Insufficient admin credits (or concurrent request).")
    elif not company_id:
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": 1}},
            {"$inc": {"credits": -1}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail="Insufficient admin credits.")

    link_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Task 4: If scheduled, use scheduled_end as expiry; otherwise 24h
    if data.scheduled_end:
        try:
            expires_at = datetime.fromisoformat(data.scheduled_end).isoformat()
        except Exception:
            expires_at = (now + timedelta(hours=24)).isoformat()
    else:
        expires_at = (now + timedelta(hours=24)).isoformat()
    
    custom_questions = data.custom_questions
    if isinstance(custom_questions, list):
        custom_questions = "\n".join(custom_questions)
    ai_instructions = data.ai_instructions
    if isinstance(ai_instructions, list):
        ai_instructions = "\n".join(ai_instructions)

    session_doc = {
        "link_id": link_id,
        "candidate_id": f"CAN{random.randint(1000, 9999)}",
        "candidate_name": data.candidate_name.title(),
        "candidate_email": data.candidate_email,
        "resume_text": data.resume_text,
        "job_description": data.job_description,
        "custom_email_html": data.custom_email_html,
        "jd_file_url": data.jd_file_url,
        "created_by": data.admin_id,
        "company_id": current_admin.get("company_id"),
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "interview_duration": data.interview_duration,
        "interview_format": data.interview_format,
        "interview_type": data.interview_type,
        "language": data.language,
        "record_video": data.record_video,
        "status": "pending",
        "hr_screening": data.hr_screening.dict(),
        "custom_questions": custom_questions,
        "ai_instructions": ai_instructions,
        "case_study_count": data.case_study_count,
        "industry": data.industry,
        "voice_clone": data.voice_clone,
        "custom_voice_id": data.custom_voice_id,
        "application_id": data.application_id,
        "candidate_phone": data.candidate_phone,
        "ats_score": data.ats_score
    }
    
    # Task 4: Store scheduled time window
    if data.scheduled_start:
        session_doc["scheduled_start"] = data.scheduled_start
    if data.scheduled_end:
        session_doc["scheduled_end"] = data.scheduled_end
    
    interview_sessions_collection.insert_one(session_doc)
    
    # Process temp JD/Resume URLs in the background
    if data.jd_file_url and data.jd_file_url.startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.jd_file_url, "interview_sessions", "jd_file_url")).start()
    if getattr(data, "resume_url", None) and getattr(data, "resume_url").startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.resume_url, "interview_sessions", "resume_url")).start()

    
    # Credits were already deducted atomically at the beginning of the request.
    # _id is already populated by insert_one
    
    link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
    
    email_result = queue_or_send_interview_email(session_doc, link_url)
    
    # Broadcast updated credits/profile to sync in real-time
    admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])})
    if admin_doc:
        broadcast_profile_update(
            admin_id=str(admin_doc["_id"]),
            company_id=str(admin_doc.get("company_id") or ""),
            credits=admin_doc.get("credits"),
            login_enabled=admin_doc.get("login_enabled")
        )
    if company_id:
        comp_doc = companies_collection.find_one({"_id": ObjectId(company_id)})
        if comp_doc:
            broadcast_profile_update(
                admin_id=current_admin["admin_id"],
                company_id=str(company_id),
                credits=comp_doc.get("credits", 0)
            )
            
    return {
        "status": "success", 
        "link_id": link_id, 
        "link_url": link_url,
        "email_sent": email_result["email_sent"],
        "email_scheduled": email_result["email_scheduled"],
        "email_send_at": email_result["email_send_at"]
    }


# ── Bulk Session Models ────────────────────────────────────────────────────────
class BulkCandidate(BaseModel):
    candidate_name: str
    candidate_email: str
    resume_text: str = ""
    record_video: bool = True  # Task 5: Per-candidate video toggle

    @validator('candidate_name')
    def name_must_not_be_numeric(cls, v):
        if v.strip().isdigit():
            raise ValueError("Candidate Name cannot be purely numeric")
        return v

class BulkCreateSession(BaseModel):
    candidates: List[BulkCandidate]
    job_description: str
    admin_id: str
    interview_duration: int = 30
    record_video: bool = True  # Global default
    interview_format: str = "Standard"  # "Standard" or "Voice"
    interview_type: str = "Technical"
    industry_type: str = "General"
    language: str = "English"
    case_study_count: int = 3
    custom_email_html: str = ""  # Task 1: Optional admin-edited email
    jd_file_url: Optional[str] = None
    scheduled_start: str = ""  # Task 4
    scheduled_end: str = ""    # Task 4
    hr_screening: HRScreening = HRScreening()  # HR screening preferences
    custom_questions: Union[str, List[str]] = ""
    ai_instructions: Union[str, List[str]] = ""
    voice_clone: bool = False
    custom_voice_id: str = ""

    @validator('scheduled_end')
    def validate_dates(cls, v, values):
        start = values.get('scheduled_start')
        if start and v:
            try:
                # Basic ISO format validation check (will be parsed fully in logic)
                start_dt = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
                end_dt = datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
                if start_dt >= end_dt:
                    raise ValueError("scheduled_end must be after scheduled_start")
            except ValueError as e:
                if "scheduled_end must be after" in str(e):
                    raise e
                # Ignore strict ISO parse errors here to allow legacy fallback formats
        return v

@router.post("/admin/bulk-create-sessions")
def bulk_create_sessions(data: BulkCreateSession, background_tasks: BackgroundTasks, current_admin: dict = Depends(get_current_admin_details)):
    from bson import ObjectId
    from bson.errors import InvalidId
    
    # ENFORCE SUBSCRIPTION PLAN
    if current_admin.get("role") not in ["super_admin", "master"]:
        try:
            admin_oid = ObjectId(data.admin_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid admin ID format")
            
        admin_user = admins_collection.find_one({"_id": admin_oid})
        if not admin_user:
            raise HTTPException(status_code=404, detail="Admin not found")
        if admin_user.get("role") != "master":
            require_admin_capability(
                data.admin_id,
                "bulk_interviews",
                "Bulk interviews require the Advance subscription plan. Please upgrade to continue.",
            )

    """
    Create interview sessions for multiple candidates at once.
    Each candidate gets their own unique link and receives an email invitation.
    Returns a per-candidate result list with link_id, link_url, and email_sent status.
    """
    if not data.candidates:
        raise HTTPException(status_code=400, detail="No candidates provided")
        
    num_candidates = len(data.candidates)
    company_id = current_admin.get("company_id")
    
    # ATOMIC DEDUCTION (Prevents race conditions leading to negative credits)
    if company_id:
        res = companies_collection.update_one(
            {"_id": ObjectId(company_id), "credits": {"$gte": num_candidates}},
            {"$inc": {"credits": -num_candidates}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail=f"Insufficient company credits (or concurrent request). You need {num_candidates} credits.")
            
    if current_admin.get("role") == "admin":
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": num_candidates}},
            {"$inc": {"credits": -num_candidates}}
        )
        if res.modified_count == 0:
            if company_id:
                companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": num_candidates}})
            raise HTTPException(status_code=403, detail=f"Insufficient admin credits (or concurrent request). You need {num_candidates} credits.")
    elif not company_id:
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": num_candidates}},
            {"$inc": {"credits": -num_candidates}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail=f"Insufficient admin credits. You need {num_candidates} credits.")

    session_docs = []
    results = []
    now = datetime.now(timezone.utc)
    scheduled_expiry = parse_iso_datetime(data.scheduled_end)
    expiry_iso = scheduled_expiry.isoformat() if scheduled_expiry else (now + timedelta(hours=24)).isoformat()

    custom_questions = data.custom_questions
    if isinstance(custom_questions, list):
        custom_questions = "\n".join(custom_questions)
    ai_instructions = data.ai_instructions
    if isinstance(ai_instructions, list):
        ai_instructions = "\n".join(ai_instructions)

    # Step 1: Prepare documents
    for candidate in data.candidates:
        link_id = str(uuid.uuid4())
        link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
        
        session_doc = {
            "link_id": link_id,
            "candidate_id": f"CAN{random.randint(1000, 9999)}",
            "candidate_name": candidate.candidate_name.title(),
            "candidate_email": candidate.candidate_email,
            "resume_text": candidate.resume_text,
            "job_description": data.job_description,
            "custom_email_html": data.custom_email_html,
            "jd_file_url": data.jd_file_url,
            "created_by": data.admin_id,
            "company_id": current_admin.get("company_id"),
            "created_at": now.isoformat(),
            "expires_at": expiry_iso,
            "interview_duration": data.interview_duration,
            "interview_format": data.interview_format,
            "interview_type": data.interview_type,
            "industry_type": data.industry_type,
            "language": data.language,
            "case_study_count": data.case_study_count,
            "record_video": candidate.record_video,  # Task 5: Per-candidate video
            "voice_clone": data.voice_clone,
            "custom_voice_id": data.custom_voice_id,
            "status": "pending",
            "hr_screening": data.hr_screening.dict(),
            "custom_questions": custom_questions,
            "ai_instructions": ai_instructions
        }
        if data.scheduled_start:
            session_doc["scheduled_start"] = data.scheduled_start
            start_dt = parse_iso_datetime(data.scheduled_start)
            if start_dt:
                send_at = start_dt - timedelta(minutes=15)
                if send_at > now:
                    session_doc["invite_email_status"] = "pending"
                    session_doc["invite_email_send_at"] = send_at.isoformat()
                    session_doc["invite_email_sent_at"] = None
        if data.scheduled_end:
            session_doc["scheduled_end"] = data.scheduled_end

        if "invite_email_status" not in session_doc:
            session_doc["invite_email_status"] = "sent"
            session_doc["invite_email_send_at"] = now.isoformat()
            session_doc["invite_email_sent_at"] = now.isoformat()
            
        session_docs.append(session_doc)
        
        results.append({
            "candidate_name": candidate.candidate_name.title(),
            "candidate_email": candidate.candidate_email,
            "link_id": link_id,
            "link_url": link_url,
            "email_sent": False,
            "email_scheduled": False,
            "email_send_at": "",
            "status": "success",
            "error": None,
            "session_doc": session_doc # Temp storage for email queueing
        })

    # Step 2: Batch Insert to MongoDB
    try:
        if session_docs:
            insert_result = interview_sessions_collection.insert_many(session_docs)
            for doc, object_id in zip(session_docs, insert_result.inserted_ids):
                doc["_id"] = object_id
    except Exception as db_err:
        print(f" Bulk DB Insert Error: {db_err}")
        # If the batch fails, mark all as failed
        for r in results:
            r["status"] = "error"
            r["error"] = f"DB batch error: {db_err}"
            r["link_id"] = None
            r["link_url"] = None

    # Step 3: Trigger Background Emails
    successful = sum(1 for r in results if r["status"] == "success")  # Only deduct credits for actually successful DB inserts
    email_jobs = []
    
    for r in results:
        if r["status"] == "success":
            doc = r.pop("session_doc") # Remove temp doc before returning JSON
            # ObjectId is not JSON serializable for Celery
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            email_jobs.append({"doc": doc, "link_url": r["link_url"]})
            # Optimistically mark as sent/scheduled since we dispatch to background
            r["email_sent"] = not doc.get("invite_email_send_at") or doc["invite_email_status"] == "sent"
            r["email_scheduled"] = doc.get("invite_email_status") == "pending"
            r["email_send_at"] = doc.get("invite_email_send_at") or ""
        else:
            r.pop("session_doc", None)

    # Queue the slow email sending process to run in the background (FastAPI native)
    from app.tasks import process_bulk_emails_task
    background_tasks.add_task(process_bulk_emails_task, email_jobs)
    # Process temp JD URLs in the background for bulk sessions
    if data.jd_file_url and data.jd_file_url.startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.jd_file_url, "interview_sessions", "jd_file_url")).start()


    print(f" Bulk sessions created: {successful}/{len(results)}")
    
    # Refund failed candidates (credits were deducted atomically beforehand)
    failed = num_candidates - successful
    if failed > 0:
        company_id = current_admin.get("company_id")
        if company_id:
            companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": failed}})
            
        if current_admin.get("role") == "admin":
            admins_collection.update_one({"_id": ObjectId(current_admin["admin_id"])}, {"$inc": {"credits": failed}})
        elif not company_id:
            admins_collection.update_one({"_id": ObjectId(current_admin["admin_id"])}, {"$inc": {"credits": failed}})

    # Broadcast updated credits/profile to sync in real-time
    admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])})
    if admin_doc:
        broadcast_profile_update(
            admin_id=str(admin_doc["_id"]),
            company_id=str(admin_doc.get("company_id") or ""),
            credits=admin_doc.get("credits"),
            login_enabled=admin_doc.get("login_enabled")
        )
    company_id = current_admin.get("company_id")
    if company_id:
        comp_doc = companies_collection.find_one({"_id": ObjectId(company_id)})
        if comp_doc:
            broadcast_profile_update(
                admin_id=current_admin["admin_id"],
                company_id=str(company_id),
                credits=comp_doc.get("credits", 0)
            )

    return {
        "status": "success",
        "total": len(results),
        "successful": successful,
        "failed": len(results) - successful,
        "results": results
    }


@router.get("/session/{link_id}")
def get_session_by_link(link_id: str):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if row:
        expires_at = row.get("expires_at")
        now = datetime.now(timezone.utc)
        
        # Check if the link has expired
        is_expired = False
        if expires_at:
            try:
                expiration_time = parse_iso_datetime(expires_at)
                if now > expiration_time:
                    is_expired = True
            except Exception as e:
                print(f"Error parsing expiration time: {e}")
        
        # Task 4: Check if interview is within scheduled time window
        is_before_schedule = False
        scheduled_start = row.get("scheduled_start", "")
        scheduled_end = row.get("scheduled_end", "")
        if scheduled_start:
            try:
                start_time = parse_iso_datetime(scheduled_start)
                if now < start_time:
                    is_before_schedule = True
            except Exception:
                pass
        if scheduled_end:
            try:
                end_time = parse_iso_datetime(scheduled_end)
                if now > end_time:
                    is_expired = True
            except Exception:
                pass
                
        status = row.get("status")
        
        # Verify if allowed duration has already been exceeded
        raw_duration = row.get("interview_duration")
        try:
            interview_duration = int(raw_duration) if raw_duration and int(raw_duration) > 0 else 30
        except (ValueError, TypeError):
            interview_duration = 30
            
        if status == 'started':
            from datetime import timedelta
            started_at_str = row.get("started_at")
            if started_at_str:
                try:
                    started_at = parse_iso_datetime(started_at_str)
                    if now > started_at + timedelta(minutes=interview_duration + 5):
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {"$set": {"status": "completed"}}
                        )
                        status = "completed"
                except Exception as e:
                    print(f"Error parsing started_at in get_session_by_link: {e}")
                    
                    
        # Verify if proctoring thresholds have already been exceeded
        if status == 'started':
            violation_count = row.get("violation_count", 0)
            warnings_count = row.get("warnings_count", 0)
            violations = row.get("violations", [])
            noise_alerts = sum(1 for v in violations if v.get("type") == "noise_alert")
            tab_switches = sum(1 for v in violations if v.get("type") == "tab_switch")
            screenshare_stops = sum(1 for v in violations if v.get("type") == "screenshare_stopped")
            
            is_terminated = (
                violation_count >= 20 or
                warnings_count >= 10 or
                noise_alerts >= 10 or
                tab_switches >= 3 or
                screenshare_stops >= 3
            )
            if is_terminated:
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": {"status": "completed"}}
                )
                status = "completed"
                
        return {
            "status": "success",
            "candidate_name": row.get("candidate_name"),
            "session_status": status,
            "interview_duration": interview_duration,
            "interview_format": row.get("interview_format", "Standard"),
            "is_expired": is_expired,
            "is_before_schedule": is_before_schedule,
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "record_video": row.get("record_video", True),
            "is_deactivated": row.get("is_deactivated", False),
            "language": row.get("language", "English"),
            "interview_type": row.get("interview_type", "Technical"),
            "voice_clone": row.get("voice_clone", False),
            "custom_voice_id": row.get("custom_voice_id", "")
        }
    else:
        raise HTTPException(status_code=404, detail="Session not found")
@router.get("/admin/sessions")
def get_all_sessions(
    current_admin: dict = Depends(get_current_admin_details), 
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    sort_by: str = "score", 
    deactivated: str = "false",
    admin_id: Optional[str] = None
):
    company_id = current_admin.get("company_id")
    if deactivated == "all":
        query_filter = {"company_id": company_id}
    elif deactivated == "true":
        query_filter = {"company_id": company_id, "is_deactivated": True}
    else:
        # Default: only active
        query_filter = {"company_id": company_id, "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]}
        
    # Data Isolation:
    if current_admin.get("role") == "admin":
        query_filter["created_by"] = current_admin["admin_id"]
    elif admin_id:
        query_filter["created_by"] = admin_id

    
    if (start_date and start_date.strip()) or (end_date and end_date.strip()):
        date_filter = {}
        if start_date and start_date.strip():
            date_filter["$gte"] = start_date
        if end_date and end_date.strip():
            date_filter["$lte"] = end_date + "T23:59:59"
        query_filter["created_at"] = date_filter
    
    sort_field = [("created_at", -1)] if sort_by == "date" else [("avg_score", -1), ("created_at", -1)]
    
    projection = {
        "link_id": 1, "candidate_id": 1, "candidate_name": 1, "candidate_email": 1, "status": 1, 
        "created_at": 1, "expires_at": 1, "interview_duration": 1, "interview_id": 1, 
        "avg_score": 1, "overall_recommendation": 1, "decision": 1, 
        "recording_path": 1, "record_video": 1, "is_deactivated": 1
    }
    
    rows = list(interview_sessions_collection.find(query_filter, projection).sort(sort_field))
    
    # Pre-fetch recording paths to prevent N+1 query problem
    interview_ids_to_fetch = [row.get("interview_id") for row in rows if row.get("interview_id") and not row.get("recording_path")]
    interview_doc_map = {}
    if interview_ids_to_fetch:
        interview_docs = list(interviews_collection.find({"id": {"$in": interview_ids_to_fetch}}, {"id": 1, "recording_path": 1}))
        for doc in interview_docs:
            interview_doc_map[doc.get("id")] = doc.get("recording_path")
    
    sessions = []
    now = datetime.now(timezone.utc)
    for row in rows:
        has_video = False
        interview_id = row.get("interview_id")
        rec_path = row.get("recording_path")
        
        if interview_id and not rec_path:
            rec_path = interview_doc_map.get(interview_id)
        if rec_path:
            # Cloudinary URLs are DB-backed remote videos; local fallbacks need a file check.
            if rec_path.startswith("http") or os.path.exists(rec_path):
                has_video = True
                
        status = row.get("status", "pending")
        if status == "pending" and row.get("expires_at"):
            try:
                exp_dt = datetime.fromisoformat(row["expires_at"].replace('Z', '+00:00'))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if now > exp_dt:
                    status = "expired"
                    interview_sessions_collection.update_one({"_id": row["_id"]}, {"$set": {"status": "expired"}})
            except Exception:
                pass
        elif status == "started":
            time_ref_str = row.get("started_at") or row.get("created_at")
            if time_ref_str:
                try:
                    time_ref = datetime.fromisoformat(time_ref_str.replace('Z', '+00:00'))
                    if time_ref.tzinfo is None:
                        time_ref = time_ref.replace(tzinfo=timezone.utc)
                    duration_mins = int(row.get("interview_duration") or 30)
                    buffer_mins = max(120, duration_mins * 2)
                    if (now - time_ref).total_seconds() > (buffer_mins * 60):
                        status = "expired"
                        interview_sessions_collection.update_one({"_id": row["_id"]}, {"$set": {"status": "expired"}})
                except Exception:
                    pass

        sessions.append({
            "link_id": row.get("link_id"),
            "candidate_id": row.get("candidate_id"),
            "candidate_name": row.get("candidate_name"),
            "candidate_email": row.get("candidate_email"),
            "status": status,
            "created_at": row.get("created_at"),
            "expires_at": row.get("expires_at"),
            "interview_duration": row.get("interview_duration"),
            "interview_id": interview_id,
            "avg_score": row.get("avg_score"),
            "recommendation": row.get("overall_recommendation"),
            "decision": row.get("decision"),
            "has_video": has_video,
            "record_video": row.get("record_video", True),
            "is_deactivated": row.get("is_deactivated", False)
        })
        
    return {"status": "success", "sessions": sessions}

@router.delete("/admin/sessions/{link_id}")
def delete_session(link_id: str, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
        
    _require_admin_session_access(row, current_admin)
        
    # Delete from interview tracking
    interview_id = row.get("interview_id")
    if interview_id:
        interviews_collection.delete_one({"id": interview_id})
        answers_collection.delete_many({"interview_id": interview_id})
        if get_session(interview_id):
            delete_cached_session(interview_id)
            
    # Delete the session link
    interview_sessions_collection.delete_one({"link_id": link_id})
    
    return {"status": "success", "message": "Session deleted"}

@router.post("/admin/sessions/{link_id}/deactivate")
def deactivate_session(link_id: str, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    _require_admin_session_access(row, current_admin)
        
    interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"is_deactivated": True}})
    return {"status": "success"}

@router.post("/admin/sessions/{link_id}/activate")
def activate_session(link_id: str, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    _require_admin_session_access(row, current_admin)
        
    interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"is_deactivated": False}})
    return {"status": "success"}

@router.post("/admin/sessions/{link_id}/reschedule")
def reschedule_session(link_id: str, new_expiry: str = Form(...), new_start: str = Form(None), current_admin: dict = Depends(require_role("admin", "super_admin"))):
    """
    Reschedule an interview by updating its expires_at date 
    and resetting its status to pending (if it was expired).
    """
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    _require_admin_session_access(row, current_admin)
    update_data = {
        "expires_at": new_expiry,
        "status": "pending",
        "is_deactivated": False # Ensure it's active if rescheduled
    }
    
    if new_start:
        update_data["scheduled_start"] = new_start
    
    # Also update scheduled_end if it exists for consistency
    update_data["scheduled_end"] = new_expiry
    result = interview_sessions_collection.update_one(
        {"link_id": link_id}, 
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Fetch the updated session for email dispatch
    updated_session = interview_sessions_collection.find_one({"link_id": link_id})
    link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
    
    # Re-send the invitation email to the candidate
    email_result = queue_or_send_interview_email(updated_session, link_url)
    
    return {
        "status": "success", 
        "message": "Session rescheduled and email sent",
        "email_sent": email_result.get("email_sent", False),
        "email_scheduled": email_result.get("email_scheduled", False)
    }

@router.post("/start-session-interview")
@router.post("/start_session_interview")
async def start_session_interview(link_id: str = Form(...)):
    current_session_id.set(link_id)
    row = interview_sessions_collection.find_one({"link_id": link_id})
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
        
    candidate_name = row.get("candidate_name")
    candidate_email = row.get("candidate_email")
    resume_text = row.get("resume_text")
    job_description = row.get("job_description")
    status = row.get("status")
    interview_type = row.get("interview_type", "Technical")
    num_questions = row.get("num_questions")
    raw_duration = row.get("interview_duration")
    try:
        interview_duration = int(raw_duration) if raw_duration and int(raw_duration) > 0 else 30
    except (ValueError, TypeError):
        interview_duration = 30
    print(f"[TIMER DEBUG] link_id={link_id}, raw interview_duration from DB={row.get('interview_duration')}, used={interview_duration}")
    existing_interview_id = row.get("interview_id")
    expires_at = row.get("expires_at")
    
    # Check if the link has expired
    if expires_at:
        try:
            expiration_time = parse_iso_datetime(expires_at)
            if datetime.now(timezone.utc) > expiration_time:
                return {
                    "is_expired": True,
                    "message": "This interview link has expired. Please contact your administrator."
                }
        except Exception as e:
            print(f"Error parsing expiration time in start_session_interview: {e}")
            
    # Check scheduled restrictions (Task 4)
    scheduled_start = row.get("scheduled_start")
    scheduled_end = row.get("scheduled_end")
    if scheduled_start:
        try:
            start_time = parse_iso_datetime(scheduled_start)
            if datetime.now(timezone.utc) < start_time:
                return {
                    "is_before_schedule": True,
                    "scheduled_start": scheduled_start,
                    "scheduled_end": scheduled_end
                }
        except Exception as e:
            print(f"Error parsing scheduled_start time in start_session_interview: {e}")

    if scheduled_end:
        try:
            end_time = parse_iso_datetime(scheduled_end)
            if datetime.now(timezone.utc) > end_time:
                return {
                    "is_expired": True,
                    "message": "This interview window has ended. Please contact your administrator."
                }   
        except Exception as e:
            print(f"Error parsing scheduled_end time in start_session_interview: {e}")
    
    # If session was already started or completed, don't restart — return status
    if status in ('started', 'completed') and existing_interview_id:
        if status == 'started':
            from datetime import timedelta
            started_at_str = row.get("started_at")
            if started_at_str:
                try:
                    started_at = parse_iso_datetime(started_at_str)
                    # Block resuming if time elapsed exceeds duration + 5 minutes buffer
                    if datetime.now(timezone.utc) > started_at + timedelta(minutes=interview_duration + 5):
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {"$set": {"status": "completed"}}
                        )
                        status = "completed"
                except Exception as e:
                    print(f"Error parsing started_at: {e}")

            # Verify if proctoring thresholds have already been exceeded
            violation_count = row.get("violation_count", 0)
            warnings_count = row.get("warnings_count", 0)
            violations = row.get("violations", [])
            noise_alerts = sum(1 for v in violations if v.get("type") == "noise_alert")
            tab_switches = sum(1 for v in violations if v.get("type") == "tab_switch")
            screenshare_stops = sum(1 for v in violations if v.get("type") == "screenshare_stopped")

            is_terminated = (
                violation_count >= 20 or
                warnings_count >= 10 or
                noise_alerts >= 10 or
                tab_switches >= 3 or
                screenshare_stops >= 3
            )
            if is_terminated and status != "completed":
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": {"status": "completed"}}
                )
                status = "completed"

        if status == 'completed':
            return {
                "already_started": True,
                "session_status": status,
                "candidate_name": candidate_name,
                "interview_id": existing_interview_id,
                "interview_duration": interview_duration
            }
        
        # Status is 'started' — reload the existing interview and return first question
        existing = get_session(existing_interview_id)
        if not existing:
            row2 = interviews_collection.find_one({"id": existing_interview_id})
            if row2:
                try:
                    loaded_questions = json.loads(row2.get("questions", "[]"))
                    existing = {
                        "id": existing_interview_id,
                        "source": row2.get("source"),
                        "profile_text": row2.get("profile_text", ""),
                        "questions": loaded_questions,
                        "answers": {},
                        "created_at": row2.get("created_at")
                    }
                    set_session(existing_interview_id, existing)
                except Exception:
                    existing = None
        
        if existing and existing.get("questions"):
            questions = existing["questions"]

            # ── Find the last answered question so we can resume from there ──
            resume_question_id = None
            try:
                answered_docs = list(answers_collection.find(
                    {"interview_id": existing_interview_id},
                    {"question_id": 1, "_id": 0}
                ))
                if answered_docs:
                    answered_ids = [
                        int(a["question_id"]) for a in answered_docs
                        if a.get("question_id") is not None
                    ]
                    if answered_ids:
                        last_answered = max(answered_ids)
                        # Resume at the next unanswered question (capped to last question)
                        next_q_id = last_answered + 1
                        if next_q_id <= len(questions):
                            resume_question_id = next_q_id
                        else:
                            resume_question_id = last_answered  # already done all
                            
            except Exception as resume_err:
                print(f" Could not determine resume question: {resume_err}")

            resume_question = next(
                (q for q in questions if int(q["id"]) == resume_question_id),
                questions[0]
            ) if resume_question_id else questions[0]
            
            # Determine if we should skip the verbal round entirely upon resume
            all_verbal_answered = False
            try:
                if answered_ids and len(answered_ids) >= len(questions):
                    all_verbal_answered = True
            except:
                pass

            return {
                "status": "started",
                "interview_id": existing_interview_id,
                "questions": questions,
                "first_question": resume_question,
                "resume_question_id": resume_question_id or 1,
                "total_questions": len(questions),
                "candidate_name": candidate_name,
                "interview_duration": interview_duration,
                "interview_type": interview_type,
                "interview_format": row.get("interview_format", "Standard"),
                "record_video": row.get("record_video", True),
                "all_verbal_answered": all_verbal_answered,
                "started_at": row.get("started_at"),
                "monitoring_token": _create_candidate_monitoring_token(
                    link_id, existing_interview_id, interview_duration
                ),
            }
        
        # Fallback: regenerate if questions lost
        return {
            "already_started": True,
            "session_status": status,
            "candidate_name": candidate_name,
            "interview_id": existing_interview_id,
            "interview_duration": interview_duration,
            "monitoring_token": _create_candidate_monitoring_token(
                link_id, existing_interview_id, interview_duration
            ),
        }
    
    # Always generate a full pool of questions — interview is time-based,
    # candidates answer as many as they can within the interview_duration timer
    num_questions_to_generate = 20
    
    # Generate Questions
    source = "job_description" if job_description and len(job_description) > 50 else "resume"
    content_str = job_description if source == "job_description" else resume_text
    
    import asyncio
    from starlette.concurrency import run_in_threadpool
    try:
        profile_analysis = await asyncio.wait_for(
            run_in_threadpool(analyze_resume_or_jd, content_str), 
            timeout=15.0
        )
    except asyncio.TimeoutError:
        profile_analysis = {"error": "Analysis timed out"}
    except Exception as e:
        profile_analysis = {"error": str(e)}
    
    hr_screening = row.get("hr_screening")
    custom_questions_text = row.get("custom_questions", "")
    ai_instructions_text = row.get("ai_instructions", "")
    language = row.get("language", "English")
    industry_val = row.get("industry") or row.get("industry_type") or "General"
    
    if language != "English":
        ai_instructions_text += f"\n\nCRITICAL REQUIREMENT: You MUST generate all questions and interact STRICTLY in the {language} language. Do NOT use English."
    
    # ── Strategy 3: Load pre-cached questions if already generated ──────────
    pre_cached_questions = row.get("pre_generated_questions")
    if pre_cached_questions:
        try:
            questions = json.loads(pre_cached_questions) if isinstance(pre_cached_questions, str) else pre_cached_questions
            if questions:
                print(f"⚡ Loaded {len(questions)} pre-cached questions instantly (no AI call needed)")
            else:
                raise ValueError("Empty questions list")
        except Exception:
            questions = None
    else:
        questions = None

    if not questions:
        print("🤖 Generating questions via AI (not pre-cached)...")
        questions = generate_mock_questions(
            content_str, 
            source, 
            num_questions=num_questions_to_generate, 
            resume_text=resume_text, 
            jd_text=job_description,
            hr_screening=hr_screening,
            custom_questions=custom_questions_text,
            ai_instructions=ai_instructions_text,
            interview_type=interview_type,
            industry=industry_val,
            language=language
        )
    
    if not questions:
        raise HTTPException(status_code=400, detail="Failed to generate questions")

    interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

    # Store interview data (RAM)
    set_session(interview_id, {
        "id": interview_id,
        "source": source,
        "profile_text": content_str[:5000],
        "profile_analysis": profile_analysis,
        "questions": questions,
        "answers": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "status": status,
        "language": language,
        "interview_type": interview_type,
        "industry": industry_val
    })
    
    # Store interview data (DB)
    try:
        interviews_collection.insert_one({
            "id": interview_id,
            "source": source,
            "profile_text": content_str[:5000],
            "questions": json.dumps(questions),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "language": language,
            "interview_format": row.get("interview_format", "Standard")
        })
        
        # Update session status AND cache questions for instant future loads
        interview_sessions_collection.update_one(
            {"link_id": link_id},
            {"$set": {
                "status": "started", 
                "interview_id": interview_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "pre_generated_questions": json.dumps(questions)  # cache for instant reload
            }}
        )
    except Exception as db_e:
        logger.exception("Failed to persist interview session start")
        raise HTTPException(status_code=500, detail="Unable to start the interview session") from db_e
    return {
        "status": "started",
        "interview_id": interview_id,
        "questions": questions,
        "first_question": questions[0] if questions else None,
        "total_questions": len(questions),
        "candidate_name": candidate_name,
        "interview_duration": interview_duration,
        "interview_format": row.get("interview_format", "Standard"),
        "interview_type": interview_type,
        "record_video": row.get("record_video", True),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "monitoring_token": _create_candidate_monitoring_token(
            link_id, interview_id, interview_duration
        ),
    }

@router.post("/session/{interview_id}/violation")
def log_violation(
    interview_id: str,
    violation: ViolationRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=interview_id)
    print(f" VIOLATION detected for session {interview_id}: {violation.type} (#{violation.count}) at {violation.timestamp}")
    try:
        interview_sessions_collection.update_one(
            {"interview_id": interview_id},
            {"$push": {"violations": violation.dict()}}
        )
        return {"status": "success"}
    except Exception as e:
        print(f" Error logging violation: {e}")
        return {"status": "error", "message": str(e)}


class ProctoringViolationRequest(BaseModel):
    interview_id: Optional[str] = ""
    link_id: Optional[str] = ""
    candidate_id: Optional[str] = ""
    violation_type: str
    details: Optional[str] = ""
    timestamp: Optional[str] = ""


@router.post("/proctoring/violation")
def log_proctoring_violation(
    data: ProctoringViolationRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """
    Unified proctoring violation endpoint.
    Accepts interview_id OR link_id to locate the session.
    Stores violation in session.violations[] and increments violation_count.
    Returns current violation_count so the caller can enforce termination threshold.
    """
    _require_candidate_session(
        credentials,
        link_id=data.link_id or None,
        interview_id=data.interview_id or None,
    )
    ts = data.timestamp or datetime.now(timezone.utc).isoformat()

    violation_doc = {
        "type": data.violation_type,
        "details": data.details or "",
        "candidate_id": data.candidate_id or "",
        "timestamp": ts,
    }

    try:
        # Locate session by interview_id first, then link_id as fallback
        query: dict = {}
        if data.interview_id:
            query = {"interview_id": data.interview_id}
        elif data.link_id:
            query = {"link_id": data.link_id}
        else:
            return {"status": "error", "message": "interview_id or link_id required"}

        result = interview_sessions_collection.find_one_and_update(
            query,
            {
                "$push": {"violations": violation_doc},
                "$inc":  {"violation_count": 1},
            },
            return_document=True,   # return updated document
            projection={"violation_count": 1, "_id": 0},
        )

        violation_count = result.get("violation_count", 1) if result else 1
        print(f"[Proctoring] {data.violation_type} | session={data.interview_id or data.link_id} | total={violation_count}")

        return {
            "status": "success",
            "violation_count": violation_count,
        }
    except Exception as e:
        print(f"[Proctoring] Error logging violation: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/admin/update-decision")
@router.post("/admin/update_decision")
def update_decision(data: DecisionRequest, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    print(f" Decision Update Request: link_id={data.link_id}, decision={data.decision}")
    try:
        if data.link_id.startswith("ai_call_"):
            app_id = data.link_id.replace("ai_call_", "")
            from bson import ObjectId
            try:
                app = job_applications_collection.find_one({"_id": ObjectId(app_id)})
            except Exception:
                app = None
            if not app:
                app = job_applications_collection.find_one({"omni_call_id": app_id})
            if not app:
                raise HTTPException(status_code=404, detail="AI Call candidate not found")

            job = jobs_collection.find_one({"job_id": app.get("job_id")})
            if not job:
                raise HTTPException(status_code=403, detail="Unable to verify candidate ownership")
            if current_admin.get("role") != "master" and job.get("company_id") != current_admin.get("company_id"):
                raise HTTPException(status_code=403, detail="Access denied")
            if current_admin.get("role") == "admin" and str(job.get("admin_id") or "") != str(current_admin.get("admin_id") or ""):
                raise HTTPException(status_code=403, detail="Access denied to another recruiter's candidate")
                
            job_applications_collection.update_one({"_id": app["_id"]}, {"$set": {"decision": data.decision}})
            
            name = app.get("name") or "Candidate"
            email = app.get("email")
            jd = app.get("job_description") or ""
            
            load_dotenv(override=False)
            email_sent = False
            email_reason = "No candidate email found"
            if email:
                email_sent = send_decision_email(email, name, data.decision, jd)
                email_reason = "Success" if email_sent else "Email service error (Brevo API failed)"
            
            return {"status": "success", "decision": data.decision, "email_sent": email_sent, "email_reason": email_reason}

        # 1. Fetch candidate details for email
        row = interview_sessions_collection.find_one({"link_id": data.link_id})
        if not row:
            print(f" Session NOT found for link_id: {data.link_id}")
            raise HTTPException(status_code=404, detail="Session not found")
        
        _require_admin_session_access(row, current_admin)
        
        name = row.get("candidate_name")
        email = row.get("candidate_email")
        jd = row.get("job_description")
        print(f" Candidate: {name}, Email: {email}")
        
        # 2. Update DB
        interview_sessions_collection.update_one({"link_id": data.link_id}, {"$set": {"decision": data.decision}})
        print(f" DB Updated for {data.link_id}")
        sync_session_to_application(data.link_id)
        
        # 3. Send Email
        load_dotenv(override=False)
        email_sent = False
        email_reason = "No candidate email found"
        if email:
            email_sent = send_decision_email(email, name, data.decision, jd)
            print(f" Email sent: {email_sent}")
            email_reason = "Success" if email_sent else "Email service error (Brevo API failed)"
        else:
            print(" No email found for candidate, skipping notification.")
        
        return {"status": "success", "decision": data.decision, "email_sent": email_sent, "email_reason": email_reason}
    except Exception as e:
        print(f" Decision update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def send_decision_email(email: str, name: str, decision: str, jd: str):
    import requests
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    
    if not api_key: return False

    subject = "Interview Result - Invitation for next steps" if decision == 'selected' else "Application Status Update"
    
    if decision == 'selected':
        html = f"""
        <html><body>
            <h3>Congratulations {name}!</h3>
            <p>We are pleased to inform you that you have successfully cleared the AI interview for the role.</p>
            <p><b>Next Steps:</b> Our recruitment team will reach out to you shortly for the final technical/HR round. Please stay reachable on this email.</p>
            <p>Best Regards,<br/>Hire IQ Recruiting Team</p>
        </body></html>
        """
    else:
        html = f"""
        <html><body>
            <h3>Application Update</h3>
            <p>Dear {name},</p>
            <p>Thank you for taking the time to interview with us. Unfortunately, we have decided not to move forward with your application at this time.</p>
            <p>We were impressed with your background, but we had many qualified candidates for this role. We wish you the very best in your job search.</p>
            <p>Best Regards,<br/>Hire IQ Recruiting Team</p>
        </body></html>
        """

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": name}],
        "subject": subject,
        "htmlContent": html
    }
    
    try:
        res = requests.post("https://api.brevo.com/v3/smtp/email", json=payload, headers={
            "api-key": api_key, "content-type": "application/json"
        }, timeout=10)
        if res.status_code >= 300:
            print(f" Brevo Error: {res.status_code} - {res.text}")
        return res.status_code < 300
    except Exception as email_err:
        print(f" Email sending error: {email_err}")
        return False

class CopilotMessage(BaseModel):
    role: str
    content: str

class CopilotRequest(BaseModel):
    message: str
    history: list[CopilotMessage] = []
    admin_id: Optional[str] = None

@router.post("/admin/copilot")
def admin_copilot_chat(request: CopilotRequest, raw_request: Request, current_admin: dict = Depends(get_current_admin_details)):
    try:
        from ai_client import chat_completion
        from mongo_db import db
        
        role = current_admin.get("role", "admin")
        admin_id = current_admin.get("admin_id")
        company_id = current_admin.get("company_id")
        
        def strip_markdown(text: str) -> str:
            if not text:
                return ""
            import re
            t = re.sub(r'```[a-zA-Z0-9]*', '', text)
            t = re.sub(r'\*\*|__|\*|_|#', '', t)
            return t.strip()
        
        # 1. Dynamic platform routing metadata (Filtered and capped to save tokens)
        dynamic_endpoints = []
        for r in getattr(raw_request.app, "routes", []):
            if hasattr(r, "path") and hasattr(r, "methods") and ("/admin" in r.path or "/api/plans" in r.path):
                if "notification" in r.path or "ws" in r.path:
                    continue
                methods_str = ", ".join(r.methods - {"HEAD", "OPTIONS"})
                if methods_str:
                    endpoint_name = r.endpoint.__name__ if hasattr(r, "endpoint") else ""
                    docstring = ""
                    if hasattr(r, "endpoint") and r.endpoint.__doc__:
                        docstring = r.endpoint.__doc__.strip().split('\n')[0].strip()
                    doc_suffix = f" -> {docstring}" if docstring else ""
                    dynamic_endpoints.append(f"- Endpoint `{r.path}` ({methods_str}) [Handler: {endpoint_name}]{doc_suffix}")
        endpoints_context = "\n".join(dynamic_endpoints[:5])
 
        # 2. Dynamic database collections and records count (Filtered to essential collections)
        dynamic_collections = []
        try:
            coll_names = db.list_collection_names()
            important_colls = {"jobs", "job_applications", "interview_sessions", "admins"}
            for col in coll_names:
                if col in important_colls:
                    doc_count = db[col].count_documents({})
                    dynamic_collections.append(f"- Collection '{col}': {doc_count} documents")
        except Exception as db_err:
            dynamic_collections.append(f"- Database query failed: {db_err}")
        db_context_meta = "\n".join(dynamic_collections)
 
        # 3. Dynamic subscription plans (Capped)
        dynamic_plans = []
        try:
            plans = list(plans_collection.find({}, {"_id": 0}))
            for p in plans[:3]:
                dynamic_plans.append(f"- Plan: {p.get('name', 'N/A')} (Key: {p.get('plan_key', 'N/A')}) | Price: {p.get('price_monthly', 0)} USD/mo | Credits: {p.get('credits_granted', 0)}")
        except Exception:
            pass
        plans_context = "\n".join(dynamic_plans)

        system_prompt = f"""You are the 'Hire IQ Admin Copilot', a specialized AI assistant embedded within the Admin Dashboard of the Hire IQ Adaptive Interview platform.
You are currently talking to a user with the role: {role.upper()}.

YOUR PURPOSE:
Your purpose is to help the admin understand and navigate this website, AND to perform specific administrative actions when requested.

DYNAMIC MODULE & FEATURE RECOGNITION:
Do not rely on hardcoded feature or module names. You must dynamically inspect the platform structure using the context details provided below:
1. "DYNAMIC PLATFORM MODULES & ROUTING METADATA": Outlines all available API routes, endpoints, HTTP methods, and module descriptions.
2. "DYNAMIC DATABASE SCHEMA & COLLECTIONS METADATA": Outlines MongoDB tables and count of records, reflecting available features.
3. "ACTIVE SUBSCRIPTION PLANS": Outlines all plans, credit grants, and prices.
Use this information to answer user questions about any module, view, or functionality of the platform, even if new ones are added dynamically.

YOU MUST SUPPORT:
1. General HireIQ conversations (e.g. greetings, role explanations, HireIQ small talk).
2. Platform questions (answering how any module, endpoint, or system feature works by mapping them to the active routes and database context).
3. Navigation help (guiding the admin to pages by mapping their query to the listed Admin / Tenant routes).
4. Candidate, job, and application queries (using the context data provided below to answer user questions about candidates, scores, job applications, job details, and status).
5. Email drafting (drafting feedback, rejection, or selection emails for candidates).
6. Email sending (routing to the 'send_feedback' action).
7. Admin creation (routing to the 'create_admin' action).
8. Credit management (routing to 'request_credits', 'transfer_credits', or 'buy_credits' actions).

CRITICAL RULES:
1. Direct LLM Responses: For HireIQ-related queries (categories 1 to 5), you must answer the user directly. Keep your answers concise, accurate, and professional.
2. Action Responses: For action requests (categories 6 to 8), you must output exactly one short sentence confirming the action, followed IMMEDIATELY by a JSON block.
   The JSON block MUST be exactly in this format:
   ```json
   {{
       "action": "action_name",
       ... (other required fields)
   }}
   ```
   Supported actions and roles:
   - send_feedback: Available for admin and super_admin. Schema: `{{'action': 'send_feedback', 'candidate_email': '...', 'content': '...'}}`
   - request_credits: Available for admin only. Schema: `{{'action': 'request_credits', 'amount': ..., 'reason': '...'}}`
   - transfer_credits: Available for super_admin only. Schema: `{{'action': 'transfer_credits', 'admin_username': '...', 'amount': ...}}`
   - buy_credits: Available for super_admin only. Schema: `{{'action': 'buy_credits', 'amount': ...}}`
   - create_admin: Available for super_admin only. Schema: `{{'action': 'create_admin', 'username': '...', 'email': '...'}}`
3. Formatting Rules:
   - You MUST format all responses as clean, structured, numbered or bulleted lists.
   - You MUST NOT use any Markdown formatting such as **bold**, *italics*, _underscores_, or code blocks in your responses unless the user explicitly requests them (or for the required JSON action blocks).
   - Responses should be plain, professional, clean, and easy to read while preserving the same information.
4. Unrelated Topics: For any topic unrelated to HireIQ (such as general knowledge, coding help, non-HireIQ conversation, general assistant questions), you MUST politely decline. Use this fallback response: "I'm sorry, I can only help you with questions related to the HireIQ platform, its dashboard, candidate data, and standard admin actions."
5. Do NOT echo or repeat the user's question. Provide the answer or the action directly.
"""

        context_data = ""
        context_data += "\n--- DYNAMIC PLATFORM MODULES & ROUTING METADATA ---\n"
        context_data += endpoints_context + "\n"
        
        context_data += "\n--- DYNAMIC DATABASE SCHEMA & COLLECTIONS METADATA ---\n"
        context_data += db_context_meta + "\n"
        
        if plans_context:
            context_data += "\n--- ACTIVE SUBSCRIPTION PLANS ---\n"
            context_data += plans_context + "\n"

        # Fetch recent jobs and applications
        recent_jobs = []
        recent_apps = []
        
        if role in ["admin", "super_admin"]:
            # Query jobs
            jobs_query = {}
            if role == "admin":
                jobs_query["admin_id"] = admin_id
            else:  # super_admin
                jobs_query["company_id"] = company_id
            
            recent_jobs = list(jobs_collection.find(
                jobs_query, 
                {"job_id": 1, "title": 1, "department": 1, "location": 1, "_id": 0}
            ).sort("created_at", -1).limit(3))
            
            if recent_jobs:
                job_ids = [j.get("job_id") for j in recent_jobs if j.get("job_id")]
                recent_apps = list(job_applications_collection.find(
                    {"job_id": {"$in": job_ids}}, 
                    {"name": 1, "email": 1, "score": 1, "status": 1, "applied_at": 1, "job_id": 1, "_id": 0}
                ).sort("applied_at", -1).limit(3))

        if role == "admin":
            recent_sessions = list(interview_sessions_collection.find(
                {"created_by": admin_id, "status": "completed"},
                {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "decision": 1, "_id": 0}
            ).sort("created_at", -1).limit(3))
            if recent_sessions:
                context_data += "\n--- YOUR RECENT CANDIDATE INTERVIEWS ---\n"
                for s in recent_sessions:
                    context_data += f"- Candidate: {s.get('candidate_name', 'Unknown')} | Email: {s.get('candidate_email', 'Unknown')} | Score: {s.get('avg_score', 'N/A')}/100 | Decision: {s.get('decision', 'None')}\n"

        elif role == "super_admin":
            sub_admins = list(admins_collection.find({"created_by": admin_id}, {"username": 1, "email": 1, "credits": 1, "_id": 0}).limit(3))
            if sub_admins:
                context_data += "\n--- YOUR SUB-ADMINS ---\n"
                for sa in sub_admins:
                    context_data += f"- Username: {sa.get('username')} | Email: {sa.get('email')} | Credits: {sa.get('credits')}\n"
                    
            recent_sessions = list(interview_sessions_collection.find(
                {"company_id": company_id, "status": "completed"},
                {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "decision": 1, "created_by": 1, "_id": 0}
            ).sort("created_at", -1).limit(3))
            if recent_sessions:
                context_data += "\n--- COMPANY CANDIDATE INTERVIEWS ---\n"
                for s in recent_sessions:
                    context_data += f"- Candidate: {s.get('candidate_name')} | Email: {s.get('candidate_email')} | Score: {s.get('avg_score')} | Created By ID: {s.get('created_by')}\n"

        if recent_jobs:
            context_data += "\n--- ACTIVE/RECENT JOBS ---\n"
            for j in recent_jobs:
                context_data += f"- Job ID: {j.get('job_id')} | Title: {j.get('title')} | Dept: {j.get('department', 'N/A')} | Loc: {j.get('location', 'N/A')}\n"
                
        if recent_apps:
            context_data += "\n--- RECENT JOB APPLICATIONS ---\n"
            for a in recent_apps:
                context_data += f"- Applicant: {a.get('name')} | Email: {a.get('email')} | Job ID: {a.get('job_id')} | Score: {a.get('score', 'N/A')} | Status: {a.get('status', 'N/A')} | Applied At: {a.get('applied_at', 'N/A')}\n"

        if role == "master":
            total_super_admins = admins_collection.count_documents({"role": "tenant"})
            total_admins = admins_collection.count_documents({})
            total_interviews = interview_sessions_collection.count_documents({})
            completed_interviews = interview_sessions_collection.count_documents({"status": "completed"})
            
            context_data += f"\n--- PLATFORM METRICS ---\n"
            context_data += f"- Total Super Admins (Tenants): {total_super_admins}\n"
            context_data += f"- Total Sub-Admins: {total_admins}\n"
            context_data += f"- Total Interviews Created: {total_interviews}\n"
            context_data += f"- Total Interviews Completed: {completed_interviews}\n"

        system_prompt += f"\n{context_data}"
        
        messages = [{"role": "system", "content": system_prompt}]
        history_list = request.history or []
        for msg in history_list[-2:]:
            if msg.role in ["user", "assistant"]:
                messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": request.message})
        
        try:
            response_text = chat_completion(messages, temperature=0.3)
            
            if not response_text or not str(response_text).strip():
                raise ValueError("Empty response from AI")
                
            import json
            import re
            
            action_required = None
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                try:
                    action_data = json.loads(json_match.group(1))
                    if "action" in action_data:
                        action_required = action_data
                        response_text = response_text.replace(json_match.group(0), "").strip()
                except:
                    pass
                    
            return {"reply": strip_markdown(response_text), "action_required": action_required}
            
        except Exception as e:
            print(f"Warning: Copilot AI failed: {e}")
            
            # Offline Fallback Logic
            msg_lower = request.message.lower()
            
            offline_responses = {
                "generate interview questions": "- Navigate to the 'Create Interview' or 'Bulk Send' page.\n- Input your Job Description (JD).\n- The platform will automatically generate interview questions tailored to the JD.",
                "rank candidates": "- Navigate to the 'Results' dashboard.\n- View the candidates sorted by their ATS Score and overall interview performance score.",
                "draft feedback emails": "- Navigate to the candidate's specific results page.\n- Click the 'Send Feedback Email' button.\n- A customized draft feedback email will be generated automatically.",
                "api": "- Configuration: API keys are configured in the 'Settings' section.\n- Quota Limits: If you run out of API quota, the system switches to offline fallbacks for scoring and copilot help.",
                "quota": "- System Quota: If your API quota limit is reached, essential features will switch to using offline fallback logic.",
                "buy credits": "- Purchase Credits: Go to the 'Plan & Usage' section of your dashboard.\n- Contact Admin: Alternatively, contact the master administrator for support.",
                "transfer credits": "- Admin Dashboard: Navigate to the 'Admins' dashboard page.\n- Transfer: Use the 'Add Credits' button next to the sub-admin's account name.",
                "create admin": "- Sub-Admins Page: Go to the 'Admins' page in the dashboard.\n- Create Recruiter: Click on the 'Create Admin' button.",
                "hello": f"- Status: Currently operating in offline fallback mode for your {role} account.\n- Reason: API quota has been exceeded.\n- Support: I can answer basic platform navigation and configuration questions.",
                "hi": f"- Status: Currently operating in offline mode.\n- Navigation: I can help you locate features or modules in the {role} dashboard."
            }
            
            for keyword, response in offline_responses.items():
                if keyword in msg_lower:
                    return {"reply": f"[Offline Mode] {strip_markdown(response)}"}
                    
            return {"reply": strip_markdown(f"[Offline Mode] - Status: AI connection is currently offline due to quota limits.\n- Support: I can only answer basic FAQ questions for your {role} account right now.")}

    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"Error in admin_copilot_chat: {tb_str}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}\n{tb_str}")

class CopilotExecuteRequest(BaseModel):
    action: str
    data: dict

@router.post("/admin/copilot/execute")
def admin_copilot_execute(request: CopilotExecuteRequest, current_admin: dict = Depends(get_current_admin_details)):
    try:
        role = current_admin.get("role", "admin")
        admin_id = current_admin.get("admin_id")
        
        if request.action == "send_feedback":
            email = request.data.get("candidate_email")
            content = request.data.get("content")
            if not email or not content:
                raise HTTPException(status_code=400, detail="Missing email or content")
                
            from app.services import send_interview_email
            # Simulate sending the plain text email using our existing service (it expects HTML but plain text works)
            send_interview_email(email, "Candidate", "", 30, "", custom_html=content.replace("\n", "<br>"))
            return {"status": "success", "message": f"Successfully sent feedback email to {email}."}
            
        elif request.action == "request_credits" and role == "admin":
            amount = request.data.get("amount", 10)
            reason = request.data.get("reason", "Requested via Copilot")
            
            from bson import ObjectId
            admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            if not admin_doc:
                raise HTTPException(status_code=404, detail="Admin not found")
                
            req = {
                "admin_id": admin_id,
                "admin_username": admin_doc.get("username", "Unknown"),
                "super_admin_id": admin_doc.get("created_by"),
                "amount": amount,
                "reason": reason,
                "status": "pending",
                "created_at": datetime.utcnow().isoformat()
            }
            credit_requests_collection.insert_one(req)
            return {"status": "success", "message": f"Successfully requested {amount} credits."}
            
        elif request.action == "transfer_credits" and role == "super_admin":
            target_username = request.data.get("admin_username")
            amount = request.data.get("amount")
            if not target_username or not amount:
                raise HTTPException(status_code=400, detail="Missing username or amount")
            
            # Find the admin
            target_admin = admins_collection.find_one({"username": target_username, "created_by": admin_id})
            if not target_admin:
                raise HTTPException(status_code=404, detail="Sub-admin not found")
                
            from bson import ObjectId
            # Perform transfer
            super_admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            if super_admin_doc.get("credits", 0) < amount:
                raise HTTPException(status_code=400, detail="Insufficient credits")
                
            admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$inc": {"credits": -amount}})
            admins_collection.update_one({"_id": target_admin["_id"]}, {"$inc": {"credits": amount}})
            return {"status": "success", "message": f"Successfully transferred {amount} credits to {target_username}."}
            
        elif request.action == "create_admin" and role == "super_admin":
            username = request.data.get("username")
            email = request.data.get("email")
            if not username or not email:
                raise HTTPException(status_code=400, detail="Missing username or email")
                
            company_id = current_admin.get("company_id")
            if not company_id:
                raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
                
            if admins_collection.find_one({"username": username}):
                raise HTTPException(status_code=400, detail="Username already exists")
                
            import uuid
            default_password = f"SubAdmin{uuid.uuid4().hex[:6]}!"
            
            new_admin = {
                "username": username,
                "password": hash_password(default_password),
                "email": email,
                "name": username,
                "role": "admin",
                "company_id": company_id,
                "credits": 0,
                "login_enabled": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
            admins_collection.insert_one(new_admin)
            
            return {
                "status": "success",
                "message": f"Successfully created sub-admin '{username}' with email '{email}'. Temporary password: {default_password}"
            }
            
        elif request.action == "buy_credits" and role == "super_admin":
            amount = request.data.get("amount")
            if not amount:
                raise HTTPException(status_code=400, detail="Missing amount")
            try:
                amount = int(amount)
            except ValueError:
                raise HTTPException(status_code=400, detail="Amount must be an integer")
                
            checkout_url = f"https://checkout.stripe.com/pay/mock_session_{amount}_credits"
            return {
                "status": "success", 
                "message": f"Successfully generated a checkout link for {amount} credits: {checkout_url}"
            }
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown or unauthorized action: {request.action}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ATSRequest(BaseModel):
    resume_text: str
    jd_text: str

@router.post("/admin/ats-score")
def calculate_ats_score(
    request: ATSRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    try:
        resume_text = request.resume_text.strip()[:3000]
        jd_text = request.jd_text.strip()[:3000]
        
        if not resume_text or not jd_text:
            raise HTTPException(status_code=400, detail="Resume or JD is empty")

        import prompt_cache
        cache_key_text = f"JD:{jd_text}::RESUME:{resume_text}"
        cached_result = prompt_cache.get(cache_key_text, "ATS_SCORE")
        if cached_result:
            return cached_result


        try:
            from ai_client import chat_completion
            prompt = f"""You are a professional ATS (Applicant Tracking System) evaluator. You MUST use the Machine Reading Inference (MRI) workflow:
1. QUICKLY EXTRACT core factual requirements from the Job Description.
2. ANALYZE the candidate's Resume and map which exact requirements they met.
3. CALCULATE the scores STRICTLY based on the ratio of requirements hit vs required.
Return ONLY valid JSON.

SCORING RUBRIC (weights must sum to 100%):
- keyword_matching (25%)
- semantic_similarity (20%)
- experience_alignment (25%)
- project_relevance (15%)
- education (10%)
- formatting_ats (5%)

Job Description:
{jd_text[:2000]}

Resume:
{resume_text[:2000]}

Return this EXACT JSON (all score fields are integers 0-100, weighted_total is the weighted average):
{{
  "keyword_matching": {{"score": 0}},
  "semantic_similarity": {{"score": 0}},
  "experience_alignment": {{"score": 0}},
  "project_relevance": {{"score": 0}},
  "education": {{"score": 0}},
  "formatting_ats": {{"score": 0}},
  "weighted_total": 0,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "summary": "2-3 sentence overall assessment and recommendations for improvement"
}}"""

            import os
            groq_key = os.getenv("GROQ_API_KEY")
            if groq_key:
                from groq import Groq
                client = Groq(api_key=groq_key.strip())
                response = client.chat.completions.create(
                    model="llama3-8b-8192",
                    messages=[
                        {"role": "system", "content": "You are a precise ATS scoring engine. Return ONLY valid JSON. No markdown. Be extremely fast and concise."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.0,
                    max_tokens=300
                )
                raw = response.choices[0].message.content
            else:
                raw = chat_completion(
                    messages=[
                        {"role": "system", "content": "You are a precise ATS scoring engine. Return ONLY valid JSON. No markdown. Be extremely fast and concise."},
                        {"role": "user", "content": prompt},
                    ],
                    model="openai/gpt-4o-mini",
                    temperature=0.0,
                    timeout=15,
                    max_tokens=300,
                )

            # Parse response
            import json as _json, re as _re
            raw_clean = _re.sub(r"```(?:json)?", "", raw).strip()
            start = raw_clean.find("{")
            end = raw_clean.rfind("}") + 1
            if start != -1 and end > start:
                data = _json.loads(raw_clean[start:end])

                # Extract per-category breakdown
                WEIGHTS = {
                    "keyword_matching":     0.25,
                    "semantic_similarity":  0.20,
                    "experience_alignment": 0.25,
                    "project_relevance":    0.15,
                    "education":            0.10,
                    "formatting_ats":       0.05,
                }
                LABELS = {
                    "keyword_matching":     "Keyword Matching",
                    "semantic_similarity":  "Semantic Similarity",
                    "experience_alignment": "Experience Alignment",
                    "project_relevance":    "Project Relevance",
                    "education":            "Education Match",
                    "formatting_ats":       "Formatting & ATS Compatibility",
                }

                breakdown = []
                computed_total = 0.0
                for key, weight in WEIGHTS.items():
                    cat = data.get(key, {})
                    cat_score = max(0, min(100, int(cat.get("score", 0) if isinstance(cat, dict) else cat)))
                    cat_note = cat.get("note", "") if isinstance(cat, dict) else ""
                    computed_total += cat_score * weight
                    breakdown.append({
                        "category": LABELS[key],
                        "score": cat_score,
                        "weight": int(weight * 100),
                        "note": cat_note,
                        "weighted_contribution": round(cat_score * weight, 1)
                    })

                # Use AI's weighted_total if provided, else use computed
                ai_total = data.get("weighted_total")
                if ai_total is not None:
                    final_score = max(0, min(100, int(ai_total)))
                else:
                    final_score = max(0, min(100, round(computed_total)))

                matched = [str(s) for s in data.get("matched_skills", [])][:15]
                missing = [str(s) for s in data.get("missing_skills", [])][:15]
                summary = str(data.get("summary", ""))

                if not matched and not missing:
                    matched = ["No clear skills identified"]
                    missing = ["No clear skills identified"]

                result = {
                    "score": final_score,
                    "matched_skills": matched,
                    "missing_skills": missing,
                    "summary": summary or f"AI ATS Analysis: {final_score}% weighted match score across 7 evaluation categories.",
                    "breakdown": breakdown,
                    "mode": "ai"
                }
                
                import prompt_cache
                prompt_cache.set(cache_key_text, "ATS_SCORE", result)
                return result
        except Exception as ai_err:
            print(f"⚠️ ATS AI call failed, falling back to keyword matching: {ai_err}")


        # ── Offline Fallback: High-Accuracy Keyword Dictionary Match ──────────
        import re
        try:
            from offline_skills_dict import COMMON_SKILLS
        except ImportError:
            COMMON_SKILLS = set()
            
        resume_lower = resume_text.lower()
        jd_lower = jd_text.lower()
        
        # Extract common skills that exist in the Job Description
        jd_keywords = set()
        for skill in COMMON_SKILLS:
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, jd_lower):
                jd_keywords.add(skill)
        
        # If JD has no known keywords, fall back to basic extraction
        if not jd_keywords:
            words = set(re.findall(r'\b[a-z]{5,}\b', jd_lower))
            stop_words = {"about", "above", "after", "again", "against", "because", "before", "below", "between", "cannot", "could", "doing", "during", "further", "having", "herself", "himself", "itself", "myself", "ought", "ourselves", "themselves", "there", "these", "those", "through", "under", "until", "where", "which", "while", "would", "yourself", "yourselves", "experience", "years", "skills", "ability", "working", "knowledge", "strong", "understanding", "preferred", "required", "responsibilities", "requirements", "including"}
            jd_keywords = {w for w in words if w not in stop_words}
        
        matched = []
        missing = []
        
        for word in jd_keywords:
            pattern = r'\b' + re.escape(word) + r'\b'
            if re.search(pattern, resume_lower):
                matched.append(word.title())
            else:
                missing.append(word.title())
                
        matched = sorted(matched)[:15]
        missing = sorted(missing)[:15]
        
        total_keywords = len(jd_keywords)
        matched_count = len(matched)
        score = min(100, int((matched_count / total_keywords) * 100)) if total_keywords > 0 else 0
        
        if not matched and not missing:
            matched.append("No clear skills found")
            missing.append("No clear skills found")
            
        # Create a dummy breakdown so the UI table still renders
        dummy_breakdown = [
            {"category": "Skills Match", "score": score, "weight": 30, "note": "Offline Keyword Match"},
            {"category": "Experience Match", "score": score, "weight": 25, "note": "Offline Keyword Match"},
            {"category": "Projects Match", "score": score, "weight": 15, "note": "Offline Keyword Match"},
            {"category": "Education Match", "score": score, "weight": 10, "note": "Offline Keyword Match"},
            {"category": "Keywords Match", "score": score, "weight": 10, "note": "Offline Keyword Match"},
            {"category": "Formatting & ATS Compatibility", "score": score, "weight": 5, "note": "Offline Keyword Match"},
            {"category": "Certifications", "score": score, "weight": 5, "note": "Offline Keyword Match"}
        ]

        result = {
            "score": score,
            "matched_skills": matched,
            "missing_skills": missing,
            "summary": "Keyword Match Mode: Score calculated using offline skill dictionary matching. Upgrade to AI mode by ensuring AI keys are configured.",
            "breakdown": dummy_breakdown,
            "mode": "fallback"
        }
        
        import prompt_cache
        prompt_cache.set(cache_key_text, "ATS_SCORE", result)
        return result
            
    except HTTPException:
        raise
    except Exception as e:
        print(f" ATS Score endpoint error: {e}")

        raise HTTPException(status_code=500, detail=str(e))

class CandidateFeedbackRequest(BaseModel):
    feedback_text: str

@router.post("/submit-feedback/{link_id}")
def submit_feedback(
    link_id: str,
    payload: CandidateFeedbackRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Save candidate feedback into the interview session."""
    _require_candidate_session(credentials, link_id=link_id, allow_completed=True)
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        interview_sessions_collection.update_one(
            {"link_id": link_id}, 
            {"$set": {"candidate_feedback": payload.feedback_text}}
        )
        return {"status": "success", "message": "Feedback submitted successfully."}
    except Exception as e:
        print(f"Submit Feedback Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CompleteSessionRequest(BaseModel):
    warnings: int = 0
    reason: str = "normal"
    total_tab_switches: int = 0
    total_face_alerts: int = 0
    total_noise_alerts: int = 0
    total_fullscreen_exits: int = 0

@router.post("/complete-session/{link_id}")
def complete_session(
    link_id: str, 
    payload: Optional[CompleteSessionRequest] = None,
    warnings: Optional[int] = None,
    reason: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Mark a session as completed and send notification emails (Task 3)."""
    _require_candidate_session(credentials, link_id=link_id, allow_completed=True)
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        # Use default payload if none was sent by the client
        if payload is None:
            payload = CompleteSessionRequest()
            
        if warnings is not None:
            payload.warnings = warnings
        if reason is not None:
            payload.reason = reason
            
        update_data = {
            "status": "completed", 
            "warnings": payload.warnings, 
            "completion_reason": payload.reason,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "integrity": {
                "total_tab_switches": payload.total_tab_switches,
                "total_face_alerts": payload.total_face_alerts,
                "total_noise_alerts": payload.total_noise_alerts,
                "total_fullscreen_exits": payload.total_fullscreen_exits
            }
        }
        if session:
            violations = session.get("violations", [])
            if violations:
                if update_data["integrity"]["total_tab_switches"] == 0:
                    update_data["integrity"]["total_tab_switches"] = sum(1 for v in violations if v.get("type") == "tab_switch")
                if update_data["integrity"]["total_face_alerts"] == 0:
                    update_data["integrity"]["total_face_alerts"] = sum(1 for v in violations if v.get("type") not in ("tab_switch", "noise_alert"))
                if update_data["integrity"]["total_noise_alerts"] == 0:
                    update_data["integrity"]["total_noise_alerts"] = sum(1 for v in violations if v.get("type") == "noise_alert")
            
            candidate_id = session.get("candidate_id")
            if candidate_id and not candidate_id.endswith("IQ"):
                update_data["candidate_id"] = f"{candidate_id}IQ"
            
            # Calculate total time for the dashboard
            started_at = session.get("started_at") or session.get("updated_at")
            if started_at:
                try:
                    s_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    e_dt = datetime.fromisoformat(update_data["completed_at"].replace("Z", "+00:00"))
                    delta = (e_dt - s_dt).total_seconds()
                    update_data["integrity"]["total_time_minutes"] = round(delta / 60, 1) if delta > 0 else 0
                except:
                    update_data["integrity"]["total_time_minutes"] = 0
            else:
                update_data["integrity"]["total_time_minutes"] = 0
                
        interview_sessions_collection.update_one({"link_id": link_id}, {"$set": update_data})
        sync_session_to_application(link_id)
        
        # Broadcast real-time completion to update credits and dashboard
        if session:
            admin_id = session.get("created_by")
            if admin_id:
                try:
                    from bson import ObjectId
                    admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
                    if admin_doc:
                        broadcast_profile_update(
                            admin_id=str(admin_id),
                            company_id=str(session.get("company_id") or ""),
                            credits=admin_doc.get("credits"),
                            login_enabled=admin_doc.get("login_enabled"),
                            extra={"status_change": "completed", "link_id": link_id}
                        )
                except:
                    pass
        
        # Task 3: Trigger submission logic IF all answers are scored.
        # Otherwise, the background scoring thread will trigger this later.
        try:
            session = interview_sessions_collection.find_one({"link_id": link_id})
            if session:
                interview_id = session.get("interview_id", "")
                
                if interview_id:
                    answers = list(answers_collection.find({"interview_id": interview_id}))
                    all_scored = all(a.get("scoring_status") in ("complete", "failed") for a in answers)
                    
                    if all_scored and not session.get("notification_sent"):
                        # Reuse the existing score in the database session document if available
                        avg_score = session.get("avg_score")
                        if avg_score is None:
                            scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
                            avg_score = sum(scores) / len(scores) if scores else 0
                        
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {"$set": {
                                "avg_score": round(avg_score, 1),
                                "notification_sent": True
                            }}
                        )
                        sync_session_to_application(link_id)
                        
                        candidate_name = session.get("candidate_name", "Candidate")
                        candidate_email = session.get("candidate_email", "")
                        admin_id = session.get("created_by", "")
                        admin_email = ""
                        if admin_id:
                            try:
                                from bson import ObjectId
                                admin = admins_collection.find_one({"_id": ObjectId(admin_id)})
                                if admin: 
                                    admin_email = admin.get("email", "")
                                    admin_company_id = admin.get("company_id")
                                    notifications_collection.insert_one({
                                        "title": "Interview Complete",
                                        "message": f"Candidate '{candidate_name}' has completed their interview. Avg score: {round(avg_score, 1)}/10.",
                                        "type": "candidate",
                                        "recipient_role": "admin",
                                        "company_id": admin_company_id,
                                        "read": False,
                                        "created_at": datetime.now(timezone.utc).isoformat()
                                    })
                            except: pass
                            
                        if candidate_email:
                            send_submission_notification(
                                candidate_email=candidate_email,
                                candidate_name=candidate_name,
                                admin_email=admin_email,
                                avg_score=avg_score,
                                total_questions=len(answers)
                            )
                            print(f"✅ Submission notification sent for {candidate_name} from complete_session")
                            
                        from app import tasks
                        tasks.generate_report_task.delay(interview_id=interview_id)
        except Exception as notify_err:
            print(f"⚠️ Submission notification error: {notify_err}")
        
        return {"status": "success"}
    except Exception as e:
        print(f"Error completing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# LIVE MONITORING  –  Three endpoints for real-time admin oversight
# ─────────────────────────────────────────────────────────────────────────────

# In-memory store:  link_id → latest heartbeat payload
_live_snapshots: Dict[str, Dict] = {}
_heartbeat_request_times: Dict[str, List[float]] = {}

LIVE_SNAPSHOT_TTL_SECONDS = 90
MAX_SNAPSHOT_BYTES = 250_000


def _bounded_number(value: Any, minimum: float, maximum: float, integer: bool = False):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    number = max(minimum, min(number, maximum))
    return int(number) if integer else number


def _optional_bool(value: Any):
    return value if isinstance(value, bool) else None


def _safe_round_type(value: Any):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {"verbal", "coding", "case_study"} else None


async def _enforce_heartbeat_rate_limit(link_id: str):
    """Allow normal 5-second heartbeats while limiting abuse per session."""
    await manager.connect_redis()
    if manager.redis:
        key = f"heartbeat_rate:{link_id}"
        count = await manager.redis.incr(key)
        if count == 1:
            await manager.redis.expire(key, 60)
        if count > 30:
            raise HTTPException(status_code=429, detail="Heartbeat rate limit exceeded")
        return

    now = time.monotonic()
    recent = [timestamp for timestamp in _heartbeat_request_times.get(link_id, []) if now - timestamp < 60]
    if len(recent) >= 30:
        raise HTTPException(status_code=429, detail="Heartbeat rate limit exceeded")
    recent.append(now)
    _heartbeat_request_times[link_id] = recent


async def _load_live_snapshots(link_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    clean_ids = [str(link_id) for link_id in link_ids if link_id]
    if not clean_ids:
        return {}
    await manager.connect_redis()
    if manager.redis:
        values = await manager.redis.mget([f"live_snapshot:{link_id}" for link_id in clean_ids])
        result: Dict[str, Dict[str, Any]] = {}
        for link_id, raw_value in zip(clean_ids, values):
            if not raw_value:
                continue
            try:
                result[link_id] = json.loads(raw_value)
            except (TypeError, json.JSONDecodeError):
                logger.warning("Ignoring malformed live snapshot for %s", link_id)
        return result
    return {link_id: _live_snapshots.get(link_id, {}) for link_id in clean_ids}


async def _store_live_snapshot(link_id: str, updates: Dict[str, Any], session: Dict[str, Any]) -> Dict[str, Any]:
    existing = (await _load_live_snapshots([link_id])).get(link_id, {})
    merged = {**existing, **{key: value for key, value in updates.items() if value is not None}}
    merged["ts"] = datetime.now(timezone.utc).isoformat()

    await manager.connect_redis()
    if manager.redis:
        await manager.redis.setex(
            f"live_snapshot:{link_id}",
            LIVE_SNAPSHOT_TTL_SECONDS,
            json.dumps(merged),
        )
    else:
        _live_snapshots[link_id] = merged

    dashboard_data = {key: value for key, value in merged.items() if key != "snapshot"}
    payload = {
        "type": "live_snapshot",
        "link_id": link_id,
        "company_id": str(session.get("company_id") or ""),
        "created_by": str(session.get("created_by") or ""),
        "data": dashboard_data,
    }
    if manager.redis:
        await manager.redis.publish("dashboard:updates", json.dumps(payload))
    else:
        await manager.broadcast_dashboard(payload)
    return merged


class LiveHeartbeatRequest(BaseModel):
    link_id: str
    snapshot_dataurl: Optional[str] = None   # base64 PNG from candidate's camera canvas
    audio_level: Optional[float] = None       # 0–100 RMS amplitude
    internet_kbps: Optional[float] = None     # measured download speed in kbps
    current_question: Optional[int] = None
    total_questions: Optional[int] = None
    elapsed_seconds: Optional[int] = None
    video_fps: Optional[float] = None
    tab_active: Optional[bool] = True
    face_visible: Optional[bool] = None
    proctoring_alerts: int = 0
    alert_types: Optional[List[str]] = None
    last_alert_type: Optional[str] = None
    face_count: int = 0
    multi_face: bool = False
    phone_detected: bool = False
    eye_contact_lost: bool = False
    round_type: Optional[str] = None

    @validator("link_id")
    def validate_link_id(cls, value):
        if not 8 <= len(value) <= 128:
            raise ValueError("Invalid session link identifier")
        return value

    @validator("snapshot_dataurl")
    def validate_snapshot_dataurl(cls, value):
        if value is None:
            return value
        return validate_snapshot_dataurl(value, MAX_SNAPSHOT_BYTES)

    @validator("audio_level")
    def validate_audio_level(cls, value):
        if value is not None and not 0 <= value <= 100:
            raise ValueError("Audio level must be between 0 and 100")
        return value

    @validator("alert_types")
    def validate_alert_types(cls, value):
        if value is not None and (len(value) > 25 or any(len(str(item)) > 64 for item in value)):
            raise ValueError("Too many or invalid alert types")
        return value

    @validator("round_type")
    def validate_round_type(cls, value):
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in {"verbal", "coding", "case_study"}:
            raise ValueError("Invalid interview round type")
        return normalized


@router.post("/live-heartbeat")
async def live_heartbeat(
    data: LiveHeartbeatRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Candidate browser sends a heartbeat every ~5 s with camera snapshot and quality metrics."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Candidate monitoring token is required")
    session = _validate_candidate_monitoring_token(credentials.credentials, data.link_id)
    await _enforce_heartbeat_rate_limit(data.link_id)
    updates = {
        "snapshot": data.snapshot_dataurl,
        "audio_level": data.audio_level,
        "internet_kbps": data.internet_kbps,
        "current_question": data.current_question,
        "total_questions": data.total_questions,
        "elapsed_seconds": data.elapsed_seconds,
        "video_fps": data.video_fps,
        "tab_active": data.tab_active,
        "face_visible": data.face_visible,
        "proctoring_alerts": data.proctoring_alerts,
        "alert_types": data.alert_types or [],
        "last_alert_type": data.last_alert_type,
        "face_count": data.face_count,
        "multi_face": data.multi_face,
        "phone_detected": data.phone_detected,
        "eye_contact_lost": data.eye_contact_lost,
        "round_type": data.round_type,
    }
    await _store_live_snapshot(data.link_id, updates, session)
    return {"status": "ok"}


@router.get("/admin/live-snapshot/{link_id}")
async def get_live_snapshot(
    link_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Return a snapshot to an authorized admin, super admin, or master."""
    _get_authorized_live_session(link_id, current_admin)
    if current_admin.get("role") != "master":
        require_admin_capability(
            current_admin["admin_id"],
            "live_monitoring",
            "Live monitoring is available on the Advance plan only.",
        )
    snap = (await _load_live_snapshots([link_id])).get(link_id)

    if not snap:
        return {"online": False}

    try:
        ts = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
        age_secs = (datetime.now(timezone.utc) - ts).total_seconds()
        online = age_secs < 15          # considered online if seen within last 15 s
    except Exception:
        age_secs = 0
        online = True

    return {
        "online": online,
        "last_seen_ago_seconds": round(age_secs, 1),
        "snapshot": snap.get("snapshot"),
        "audio_level": snap.get("audio_level"),
        "internet_kbps": snap.get("internet_kbps"),
        "current_question": snap.get("current_question"),
        "total_questions": snap.get("total_questions"),
        "elapsed_seconds": snap.get("elapsed_seconds"),
        "video_fps": snap.get("video_fps"),
        "tab_active": snap.get("tab_active", True),
        "face_visible": snap.get("face_visible"),
        "proctoring_alerts": snap.get("proctoring_alerts", 0),
        "alert_types": snap.get("alert_types", []),
        "last_alert_type": snap.get("last_alert_type"),
        "face_count": snap.get("face_count", 0),
        "multi_face": snap.get("multi_face", False),
        "phone_detected": snap.get("phone_detected", False),
        "eye_contact_lost": snap.get("eye_contact_lost", False),
        "round_type": snap.get("round_type"),
    }


@router.get("/admin/ongoing-interviews")
async def get_ongoing_interviews(admin_id: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return all in-progress (status=started) sessions for this admin with live status."""
    admin_uuid = current_admin["admin_id"]
    if current_admin.get("role") != "master":
        require_admin_capability(
            admin_uuid,
            "live_monitoring",
            "Live monitoring is available on the Advance plan only.",
        )
    query_filter = {
        "status": "started",
        "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
    }
    if current_admin.get("role") != "master":
        query_filter["company_id"] = current_admin.get("company_id")
    
    # Data Isolation:
    if current_admin.get("role") == "admin":
        query_filter["created_by"] = current_admin["admin_id"]
    elif admin_id:
        query_filter["created_by"] = admin_id

    rows = list(interview_sessions_collection.find(
        query_filter, 
        {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_id": 1, "started_at": 1}
    ).sort("created_at", -1))

    snapshots = await _load_live_snapshots([row.get("link_id", "") for row in rows])
    sessions = []
    for row in rows:
        link_id = row.get("link_id", "")
        snap = snapshots.get(link_id, {})

        # Determine online status from heartbeat age
        online = False
        age_secs = float('inf')
        if snap.get("ts"):
            try:
                # 'ts' is stored as ISO string ending with Z
                ts_dt = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
                age_secs = (datetime.now(timezone.utc) - ts_dt).total_seconds()
                online = age_secs < 60  # 60 seconds for "Live" status
            except Exception:
                online = False
                
        # GHOST FILTERING LOGIC
        if not online:
            # 1. Use started_at for sessions that have officially begun
            base_time_str = row.get("started_at") or row.get("created_at")
            session_age = 0
            if base_time_str:
                try:
                    dt = datetime.fromisoformat(base_time_str.replace("Z", "+00:00"))
                    session_age = (datetime.now(timezone.utc) - dt).total_seconds()
                except: pass

            # 2. If no heartbeat has EVER been received
            if not snap.get("ts"):
                # If they haven't sent a heartbeat within 10 mins of starting/creating, hide them
                if session_age > 600: 
                    continue
            
            # 3. If they HAVE sent heartbeats before, but are now silent
            else:
                # If they've been silent for more than 5 minutes, remove from "Ongoing" entirely
                if age_secs > 300: 
                    continue
                # Note: The UI will show them as "AWAY" if age_secs > 60

        sessions.append({
            "link_id": link_id,
            "candidate_name": row.get("candidate_name", ""),
            "candidate_email": row.get("candidate_email", ""),
            "created_at": row.get("created_at", ""),
            "interview_id": row.get("interview_id", ""),
            "online": online,
            "snapshot": snap.get("snapshot"),
            "current_question": snap.get("current_question"),
            "total_questions": snap.get("total_questions"),
            "elapsed_seconds": snap.get("elapsed_seconds"),
            "audio_level": snap.get("audio_level"),
            "internet_kbps": snap.get("internet_kbps"),
            "video_fps": snap.get("video_fps"),
            "tab_active": snap.get("tab_active", True),
            "face_visible": snap.get("face_visible"),
            "proctoring_alerts": snap.get("proctoring_alerts", 0),
            "alert_types": snap.get("alert_types", []),
            "last_alert_type": snap.get("last_alert_type"),
            "face_count": snap.get("face_count", 0),
            "multi_face": snap.get("multi_face", False),
            "phone_detected": snap.get("phone_detected", False),
            "eye_contact_lost": snap.get("eye_contact_lost", False),
            "round_type": snap.get("round_type"),
        })

    return {"sessions": sessions, "count": len(sessions)}


@router.websocket("/ws/webrtc/{role}/{link_id}")
async def webrtc_endpoint(websocket: WebSocket, role: str, link_id: str, token: Optional[str] = None):
    import os, tempfile
    webrtc_log_path = os.path.join(tempfile.gettempdir(), "webrtc_debug.log")
    with open(webrtc_log_path, "a") as f:
        f.write(f"\n--- New Connection ---\nRole: {role}, Link ID: {link_id}\nToken supplied: {bool(token)}\n")
    
    if role == "candidate":
        if not token:
            await websocket.close(code=1008)
            return
        try:
            candidate_session = _validate_candidate_monitoring_token(token, link_id)
        except HTTPException:
            await websocket.close(code=1008)
            return
        await manager.connect_candidate(websocket, link_id)
    elif role == "admin":
        if not token:
            with open(webrtc_log_path, "a") as f:
                f.write("No token provided. Closing with 1008.\n")
            await websocket.close(code=1008)
            return
        try:
            auth_context = _decode_dashboard_websocket_admin(token)
            _get_authorized_live_session(link_id, auth_context)
            await manager.connect_admin(websocket, link_id)
            with open(webrtc_log_path, "a") as f:
                f.write("Admin connected successfully.\n")
        except HTTPException as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"Admin authorization error: {e.detail}\n")
            await websocket.close(code=1008)
            return
        except jwt.PyJWTError as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"JWT Decode Error: {str(e)}\n")
            await websocket.close(code=1008)
            return
        except Exception as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"Other Error: {str(e)}\n{traceback.format_exc()}\n")
            await websocket.close(code=1011)
            return
    else:
        await websocket.close()
        return

    last_telemetry_at = 0.0
    try:
        # Notify admin immediately that they are connected so the frontend
        # can start the WebRTC offer right away without waiting for a message.
        if role == "admin":
            try:
                await websocket.send_json({"type": "admin_connected"})
            except Exception:
                pass

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            if role == "candidate":
                # Heartbeat ping — just pong back, never relay to admins
                if msg_type == "ping":
                    try:
                        await websocket.send_json({"type": "pong"})
                    except Exception:
                        pass
                    continue

                # Throttle telemetry: at most one per second
                if msg_type == "telemetry":
                    now_monotonic = time.monotonic()
                    if now_monotonic - last_telemetry_at < 1.0:
                        continue
                    last_telemetry_at = now_monotonic

                # Relay all signaling messages (offer/answer/ICE) to admins
                await manager.send_to_admins(link_id, data)

                # Persist telemetry snapshot to MongoDB / Redis for the dashboard
                if msg_type == "telemetry":
                    telemetry_payload = data.get("data", {}) or {}
                    proctoring_status = telemetry_payload.get("proctoring_status", {}) or {}
                    updates = {
                        "audio_level": _bounded_number(telemetry_payload.get("audio_level"), 0, 100),
                        "current_question": _bounded_number(telemetry_payload.get("current_question"), 0, 10_000, integer=True),
                        "total_questions": _bounded_number(telemetry_payload.get("total_questions"), 0, 10_000, integer=True),
                        "question_text": str(telemetry_payload.get("question_text") or "")[:500],
                        "round_type": _safe_round_type(telemetry_payload.get("round_type")),
                        "proctoring_alerts": _bounded_number(telemetry_payload.get("proctoring_alerts"), 0, 10_000, integer=True),
                        "last_alert_type": str(proctoring_status.get("lastAlertType") or "")[:64] or None,
                        "face_visible": _optional_bool(proctoring_status.get("faceVisible")),
                        "face_count": _bounded_number(proctoring_status.get("faceCount"), 0, 20, integer=True),
                        "multi_face": _optional_bool(proctoring_status.get("multiFace")),
                        "phone_detected": _optional_bool(proctoring_status.get("phoneDetected")),
                        "eye_contact_lost": _optional_bool(proctoring_status.get("eyeContactLost")),
                    }
                    await _store_live_snapshot(link_id, updates, candidate_session)

            elif role == "admin":
                # Forward all admin signaling (offer/answer/ICE) directly to the candidate
                await manager.send_to_candidate(link_id, data)
    except WebSocketDisconnect:
        webrtc_log_path = os.path.join(tempfile.gettempdir(), "webrtc_debug.log")
        with open(webrtc_log_path, "a") as f:
            f.write(f"WebSocketDisconnect for role {role}, link_id {link_id}\n")
        if role == "candidate":
            manager.disconnect_candidate(link_id)
            await manager.send_to_admins(link_id, {"type": "candidate_disconnected"})
        elif role == "admin":
            manager.disconnect_admin(websocket, link_id)
    except Exception as e:
        webrtc_log_path = os.path.join(tempfile.gettempdir(), "webrtc_debug.log")
        with open(webrtc_log_path, "a") as f:
            f.write(f"Exception in while loop: {str(e)}\n{traceback.format_exc()}\n")


# --------------------------------------------------------------------------------
# MASTER & SUBSCRIPTION APIs
# --------------------------------------------------------------------------------
@router.post("/master/login")
def master_login(data: AdminLogin):
    user = admins_collection.find_one({"username": data.username, "role": "master"})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid master credentials")
    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid master credentials")
        
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user["role"], "company_id": str(user.get("company_id", ""))})
    return {
        "status": "success",
        "master_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "role": user["role"]
    }

@router.get("/master/companies")
def get_companies(master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
        
    companies = list(companies_collection.find())
    
    result = []
    for c in companies:
        company_id = str(c["_id"])
        # Create a mock user dict to pass to get_admin_plan_context
        mock_user = {"company_id": company_id}
        plan_context = get_admin_plan_context(mock_user)
        
        session_filter = {"company_id": company_id}
        total_sessions = interview_sessions_collection.count_documents(session_filter)
        completed_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "completed"})
        started_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "started"})
        pending_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "pending"})
        deactivated_sessions = interview_sessions_collection.count_documents({**session_filter, "is_deactivated": True})
        
        # Get primary admin email
        primary_admin = admins_collection.find_one({"company_id": company_id, "role": "super_admin"})
        email = primary_admin.get("email", "") if primary_admin else ""
        username = primary_admin.get("username", "") if primary_admin else ""
        login_enabled = primary_admin.get("login_enabled", True) if primary_admin else False
        
        result.append({
            "id": company_id,
            "company_name": c.get("name", "Unknown"),
            "username": username,
            "email": email,
            "subscription_plan": plan_context["plan_key"],
            "subscription_plan_label": plan_context["plan_label"],
            "subscription_start": c.get("subscription_start", ""),
            "subscription_expiry": c.get("subscription_expiry", ""),
            "days_remaining": plan_context["days_remaining"],
            "is_expired": plan_context["is_expired"],
            "login_enabled": login_enabled,
            "status": "blocked" if not login_enabled else ("expired" if plan_context["is_expired"] else "active"),
            "created_at": c.get("created_at", ""),
            "member_count": total_sessions,
            "total_sessions": total_sessions,
            "completed_sessions": completed_sessions,
            "started_sessions": started_sessions,
            "pending_sessions": pending_sessions,
            "deactivated_sessions": deactivated_sessions,
            "credits": c.get("credits", 0),
        })
    return {"status": "success", "data": result}

@router.post("/master/tenants")
def create_tenant(data: TenantCreate, master_id: str = Depends(get_current_admin), current_admin: str = Depends(get_current_admin)):
    require_master_user(master_id)
        
    if admins_collection.find_one({"username": data.username}):
        raise HTTPException(status_code=400, detail="Username already exists")
        
    start = datetime.now(timezone.utc)
    plan_def = get_plan_definition(data.subscription_plan)
    credits_to_grant = plan_def.get("credits_granted", 10)
    
    # Expiry is no longer time-based, but we keep the field for backward compatibility
    expiry = start + timedelta(days=3650) 
        
    new_company = {
        "name": data.company_name,
        "subscription_plan": data.subscription_plan,
        "subscription_start": start.isoformat(),
        "subscription_expiry": expiry.isoformat(),
        "credits": data.credits if data.credits > 0 else credits_to_grant,
        "created_at": start.isoformat()
    }
    company_insert = companies_collection.insert_one(new_company)
    company_id = str(company_insert.inserted_id)

    new_tenant = {
        "username": data.username,
        "password": hash_password(data.password),
        "email": data.email,
        "role": "super_admin",
        "company_id": company_id,
        "login_enabled": True,
        "created_at": start.isoformat()
    }
    
    new_tenant["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_tenant)
    
    # Create notification for master admin
    try:
        notifications_collection.insert_one({
            "title": "New Tenant Registered",
            "message": f"Tenant '{data.company_name}' has been created with plan '{data.subscription_plan}'.",
            "type": "tenant_created",
            "recipient_role": "master",
            "read": False,
            "created_at": start.isoformat()
        })
    except Exception as ne:
        print(f"Failed to insert tenant notification: {ne}")

    return {"status": "success", "message": "Tenant created successfully"}

@router.put("/master/companies/{company_id}")
def update_company(company_id: str, data: TenantUpdate, master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
        
    company = companies_collection.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    update_fields = {"subscription_plan": data.subscription_plan}
    
    if data.add_days > 0:
        current_expiry = company.get("subscription_expiry")
        now = datetime.now(timezone.utc)
        
        try:
            exp_dt = datetime.fromisoformat(current_expiry) if current_expiry else now
            if exp_dt < now:
                exp_dt = now # If already expired, start from today
            
            new_expiry = exp_dt + timedelta(days=data.add_days)
            update_fields["subscription_expiry"] = new_expiry.isoformat()
        except Exception:
            update_fields["subscription_expiry"] = (now + timedelta(days=data.add_days)).isoformat()
            
    if data.add_credits > 0:
        current_credits = company.get("credits", 0)
        update_fields["credits"] = current_credits + data.add_credits
            
    companies_collection.update_one({"_id": ObjectId(company_id)}, {"$set": update_fields})
    return {"status": "success", "message": "Company updated successfully"}

@router.post("/master/companies/{company_id}/login")
def set_company_login(company_id: str, payload: Dict[str, bool], master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    enabled = bool(payload.get("login_enabled", True))
    result = admins_collection.update_many(
        {"company_id": company_id},
        {"$set": {"login_enabled": enabled}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"status": "success", "message": "Tenant login updated", "login_enabled": enabled}

@router.delete("/master/companies/{company_id}")
def delete_company(company_id: str, master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    company = companies_collection.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    sessions = list(interview_sessions_collection.find({"company_id": company_id}, {"interview_id": 1}))
    interview_ids = [s.get("interview_id") for s in sessions if s.get("interview_id")]
    for interview_id in interview_ids:
        interviews_collection.delete_one({"id": interview_id})
        answers_collection.delete_many({"interview_id": interview_id})

    interview_sessions_collection.delete_many({"company_id": company_id})
    admins_collection.delete_many({"company_id": company_id})
    companies_collection.delete_one({"_id": ObjectId(company_id)})
    return {
        "status": "success",
        "message": "Company and related data deleted",
        "deleted_sessions": len(sessions),
    }


# --------------------------------------------------------------------------------
# MASTER & ADMIN & SUPERADMIN NOTIFICATION APIs
# --------------------------------------------------------------------------------

@router.get("/api/notifications")
def get_notifications(current_admin: dict = Depends(get_current_admin_details)):
    try:
        role = current_admin["role"]
        company_id = current_admin["company_id"]
        
        # Filter based on role
        if role == "master":
            query = {"recipient_role": "master"}
        elif role in ["super_admin", "superadmin"]:
            query = {"recipient_role": "superadmin", "company_id": company_id}
        else:
            query = {"recipient_role": "admin", "company_id": company_id}
            
        notifications = list(notifications_collection.find(query).sort("created_at", -1))
        
        # Seed mock data if empty
        if not notifications:
            import datetime
            now = datetime.datetime.now(datetime.timezone.utc)
            if role == "master":
                mock_data = [
                    {
                        "title": "Welcome to Master Console",
                        "message": "Welcome to the Hire IQ Master Control Panel. Here you can monitor system status, subscription plans, and manage tenants.",
                        "type": "system",
                        "recipient_role": "master",
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=2)).isoformat()
                    },
                    {
                        "title": "Subscription Renewed",
                        "message": "Tenant 'Google Cloud Partner' renewed their Advanced plan successfully.",
                        "type": "payment",
                        "recipient_role": "master",
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=6)).isoformat()
                    },
                    {
                        "title": "System Check Completed",
                        "message": "Automatic daily backup and database indexes health check succeeded.",
                        "type": "system",
                        "recipient_role": "master",
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=1)).isoformat()
                    }
                ]
            elif role in ["super_admin", "superadmin"]:
                mock_data = [
                    {
                        "title": "Welcome to Hire IQ",
                        "message": "Welcome to your Admin Management. You can manage your team, check candidate results, and provision interviews.",
                        "type": "system",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=1)).isoformat()
                    },
                    {
                        "title": "Interview Created",
                        "message": "A new interview template 'Senior React Developer' has been created successfully.",
                        "type": "activity",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=4)).isoformat()
                    },
                    {
                        "title": "Credits Request Approved",
                        "message": "Your request for additional interview credits was approved by the master administrator.",
                        "type": "credits",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=1)).isoformat()
                    }
                ]
            else: # admin / tenant
                mock_data = [
                    {
                        "title": "Welcome to Hire IQ",
                        "message": "Welcome to the Admin console. Create, run, and review candidate coding and voice interviews.",
                        "type": "system",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=3)).isoformat()
                    },
                    {
                        "title": "New Interview Complete",
                        "message": "Candidate 'John Doe' has completed Python Technical Interview. Avg score: 8.5/10.",
                        "type": "candidate",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=5)).isoformat()
                    },
                    {
                        "title": "Credits Assigned",
                        "message": "Your team leader has assigned 20 credits to your admin account.",
                        "type": "credits",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=2)).isoformat()
                    }
                ]
            notifications_collection.insert_many(mock_data)
            notifications = list(notifications_collection.find(query).sort("created_at", -1))
            
        for n in notifications:
            n["id"] = str(n["_id"])
            n["_id"] = str(n["_id"])
            
        return {"status": "success", "data": notifications}

    except Exception as e:
        import traceback
        print(f"ERROR IN /api/notifications: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    # Security filter: ensure notification matches user's role and company
    notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if role == "master" and notif.get("recipient_role") != "master":
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"] and (notif.get("recipient_role") != "superadmin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "tenant" and (notif.get("recipient_role") != "admin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"read": True}}
    )
    return {"status": "success", "message": "Notification marked as read"}

@router.post("/api/notifications/read-all")
def mark_all_notifications_read(current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    if role == "master":
        query = {"recipient_role": "master", "read": False}
    elif role in ["super_admin", "superadmin"]:
        query = {"recipient_role": "superadmin", "company_id": company_id, "read": False}
    else:
        query = {"recipient_role": "admin", "company_id": company_id, "read": False}
        
    notifications_collection.update_many(query, {"$set": {"read": True}})
    return {"status": "success", "message": "All notifications marked as read"}

@router.delete("/api/notifications/{notification_id}")
def delete_master_notification(notification_id: str, current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if role == "master" and notif.get("recipient_role") != "master":
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"] and (notif.get("recipient_role") != "superadmin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "tenant" and (notif.get("recipient_role") != "admin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.delete_one({"_id": ObjectId(notification_id)})
    return {"status": "success", "message": "Notification deleted"}

# 4. Modify existing Admin Login endpoint to return subscription details
class FirebaseAuthRequest(BaseModel):
    email: str
    name: str = ""

@router.post("/admin/firebase-auth")
def firebase_auth(data: FirebaseAuthRequest):
    normalized_email = data.email.strip().lower()
    
    # Try email match first, then username match
    user = admins_collection.find_one({"email": normalized_email, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"username": normalized_email, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"email": normalized_email})
    if not user:
        user = admins_collection.find_one({"username": normalized_email})
        
    if not user:
        # Register new admin with Free Trial
        now = datetime.now(timezone.utc)
        plan_def = get_plan_definition("Free Trial")
        credits_to_grant = plan_def.get("credits_granted", 10)
        expiry = now + timedelta(days=3650)
        
        new_admin = {
            "username": normalized_email,
            "email": normalized_email,
            "name": data.name or normalized_email.split("@")[0],
            "password": hash_password(str(uuid.uuid4())), # random password, they use firebase
            "role": "super_admin",
            "subscription_plan": "Free Trial",
            "subscription_expiry": expiry.isoformat(),
            "credits": credits_to_grant,
            "created_at": now.isoformat()
        }
        new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
        result = admins_collection.insert_one(new_admin)
        user = admins_collection.find_one({"_id": result.inserted_id})
        
    # Check login_enabled
    if user.get("login_enabled") == False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }
        
    plan_context = get_admin_plan_context(user)
    plan = plan_context["plan_label"]
    expiry = user.get("subscription_expiry")
            
    # Do NOT block login if expired, because they need to be able to access the dashboard to buy more credits!
    if plan_context["is_expired"]:
        print(f"User {user['username']} logged in with an expired subscription (Credits: {plan_context.get('credits')})")
        
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan,
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": expiry,
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
    }

@router.post("/admin/login")
def admin_login(data: AdminLogin):
    # Try username match first, then email match (for self-registered users)
    user = admins_collection.find_one({"username": data.username, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"email": data.username, "role": {"$ne": "master"}})
    if not user:
        # Fallback: check without role filter
        user = admins_collection.find_one({"username": data.username})
        if not user:
            user = admins_collection.find_one({"email": data.username})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check login_enabled
    if user.get("login_enabled") == False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }
        
    plan_context = get_admin_plan_context(user)
    plan = plan_context["plan_label"]
    expiry = user.get("subscription_expiry")
            
    # Do NOT block login if expired, because they need to be able to access the dashboard to buy more credits!
    if plan_context["is_expired"]:
        print(f"User {user['username']} logged in with an expired subscription (Credits: {plan_context.get('credits')})")
        
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user.get("role", "tenant"), "company_id": str(user.get("company_id", ""))})
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan,
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": expiry,
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
        "credits": plan_context.get("credits", 0),
    }

# --------------------------------------------------------------------------------
# PLAN MANAGEMENT APIs (for Master + Landing Page)
# --------------------------------------------------------------------------------

class PlanUpdate(BaseModel):
    plan_name: str
    credits_granted: int = 250
    price: int = 0
    features: list = []

class AdminRegister(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    company_name: str = ""
    plan: str = "Free Trial"

class StripeCheckoutRequest(BaseModel):
    plan_name: str
    signup_form: dict

class RazorpayOrderRequest(BaseModel):
    plan_name: str
    signup_form: dict

class RazorpayVerifyRequest(BaseModel):
    plan_name: str
    signup_form: dict
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

class RazorpayUpgradeOrderRequest(BaseModel):
    plan_name: str
    admin_id: str

class RazorpayUpgradeVerifyRequest(BaseModel):
    plan_name: str
    admin_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str




@router.get("/master/plans")
def get_all_plans_master(master_id: str = Depends(get_current_admin)):
    """Master-only: fetch ALL plans including owner"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    plans = list(plans_collection.find({}))
    result = []
    for p in plans:
        result.append(serialize_plan(p))
    return {"status": "success", "data": result}

@router.post("/master/plans")
def upsert_plan(data: PlanUpdate, master_id: str = Depends(get_current_admin), current_admin: str = Depends(get_current_admin)):
    """Master-only: create or update a plan"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    existing = plans_collection.find_one({"plan_name": data.plan_name})
    
    plans_collection.update_one(
        {"plan_name": data.plan_name},
        {"$set": {
            "plan_name": data.plan_name,
            "credits_granted": data.credits_granted,
            "price": data.price,
            "features": data.features,
        }},
        upsert=True
    )
    return {"status": "success", "message": f"Plan '{data.plan_name}' saved"}

@router.delete("/master/plans/{plan_id}")
def delete_plan(plan_id: str, master_id: str = Depends(get_current_admin)):
    """Master-only: delete a plan"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    plan = plans_collection.find_one({"_id": ObjectId(plan_id)})
    if plan and plan.get("is_owner_plan"):
        raise HTTPException(status_code=403, detail="Owner plan cannot be deleted")
    
    plans_collection.delete_one({"_id": ObjectId(plan_id)})
    return {"status": "success", "message": "Plan deleted"}

# --------------------------------------------------------------------------------
# ADMIN SELF-REGISTRATION (from Landing Page)
# --------------------------------------------------------------------------------

@router.post("/api/register")
def register_admin(data: AdminRegister):
    """Public: Self-register from landing page pricing cards"""
    normalized_email = data.email.strip().lower()
    normalized_name = data.name.strip()
    normalized_company = data.company_name.strip()

    # Check if username/email already exists
    if admins_collection.find_one({"username": normalized_email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    if admins_collection.find_one({"email": normalized_email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    
    # Fetch plan details
    plan_info = plans_collection.find_one({"plan_name": data.plan})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    
    # For paid plans, block direct registration (must go through the payment checkout flow)
    if plan_info.get("price", 0) > 0:
        raise HTTPException(status_code=400, detail="Paid plans require payment. Use the checkout flow.")
    
    now = datetime.now(timezone.utc)
    plan_def = get_plan_definition(data.plan)
    credits_to_grant = plan_def.get("credits_granted", 10)
    expiry = now + timedelta(days=3650)
    
    new_company = {
        "name": normalized_company,
        "subscription_plan": data.plan,
        "subscription_start": now.isoformat(),
        "subscription_expiry": expiry.isoformat(),
        "is_paid": False,
        "credits": credits_to_grant,
        "created_at": now.isoformat()
    }
    company_insert = companies_collection.insert_one(new_company)
    company_id = str(company_insert.inserted_id)

    new_admin = {
        "username": normalized_email,  # Use email as username
        "password": hash_password(data.password),
        "email": normalized_email,
        "name": normalized_name,
        "phone": data.phone,
        "role": "super_admin",
        "company_id": company_id,
        "login_enabled": True,
        "credits": credits_to_grant,
        "created_at": now.isoformat()
    }
    
    new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_admin)
    return {"status": "success", "message": f"Account created with {data.plan} plan! Please login."}

def get_razorpay_credentials():
    key_id = os.getenv("RAZORPAY_KEY_ID")
    key_secret = os.getenv("RAZORPAY_KEY_SECRET")
    if not key_id or not key_secret:
        raise HTTPException(status_code=500, detail="Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.")
    return key_id, key_secret

def validate_signup_form(signup_form: dict):
    name = (signup_form.get("name") or "").strip()
    email = (signup_form.get("email") or "").strip().lower()
    password = signup_form.get("password") or ""
    if not name or not email or not password:
        raise HTTPException(status_code=400, detail="Name, email and password are required.")
    return {
        "name": name,
        "email": email,
        "password": password,
        "phone": (signup_form.get("phone") or "").strip(),
        "company_name": (signup_form.get("company_name") or "").strip(),
    }

@router.post("/api/razorpay/create-order")
def create_razorpay_order(data: RazorpayOrderRequest):
    """Create a Razorpay order for a paid subscription."""
    key_id, key_secret = get_razorpay_credentials()
    signup = validate_signup_form(data.signup_form or {})

    if admins_collection.find_one({"$or": [{"username": signup["email"]}, {"email": signup["email"]}]}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    if int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    pending_signup_id = uuid.uuid4().hex
    pending_signups_collection.insert_one({
        "_id": pending_signup_id,
        "name": signup["name"],
        "email": signup["email"],
        "password_hash": hash_password(signup["password"]),
        "phone": signup["phone"],
        "company_name": signup["company_name"],
        "plan_name": plan_info["plan_name"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=2),
        "status": "pending",
        "provider": "razorpay",
    })

    receipt = f"aii_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload = {
        "amount": int(plan_info["price"]) * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "plan_name": plan_info["plan_name"],
            "pending_signup_id": pending_signup_id,
        },
    }

    try:
        response = requests.post(
            "https://api.razorpay.com/v1/orders",
            auth=(key_id, key_secret),
            json=payload,
            timeout=30,
        )
        if response.status_code >= 400:
            try:
                error_json = response.json()
                error_message = error_json.get("error", {}).get("description") or error_json.get("description") or response.text
            except Exception:
                error_message = response.text
            raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {error_message}")

        order = response.json()
        payment_orders_collection.insert_one({
            "order_id": order["id"],
            "provider": "razorpay",
            "purpose": "signup",
            "pending_signup_id": pending_signup_id,
            "email": signup["email"],
            "plan_name": plan_info["plan_name"],
            "amount": int(plan_info["price"]) * 100,
            "currency": "INR",
            "status": "created",
            "created_at": datetime.now(timezone.utc),
        })
        plan_def = get_plan_definition(plan_info["plan_name"])
        return {
            "status": "success",
            "key": key_id,
            "company_name": os.getenv("APP_BRAND_NAME", "Hire IQ"),
            "description": f"{plan_info['plan_name']} plan with {plan_def.get('credits_granted', 0)} credits",
            "order": {
                "id": order["id"],
                "amount": order["amount"],
                "currency": order["currency"],
            },
            "plan": {
                "plan_name": plan_info["plan_name"],
                "credits_granted": plan_def.get("credits_granted", 0),
                "price": int(plan_info.get("price", 0)),
            },
            "prefill": {
                "name": signup["name"],
                "email": signup["email"],
                "contact": signup["phone"],
            },
        }
    except HTTPException:
        pending_signups_collection.delete_one({"_id": pending_signup_id, "status": "pending"})
        raise
    except Exception as exc:
        pending_signups_collection.delete_one({"_id": pending_signup_id, "status": "pending"})
        raise HTTPException(status_code=500, detail=f"Unable to initialize Razorpay payment: {str(exc)}")


def _verify_razorpay_signup_payment(data: RazorpayVerifyRequest, key_id: str, key_secret: str):
    order_record = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
    if not order_record or order_record.get("purpose") != "signup":
        raise HTTPException(status_code=400, detail="Unknown or expired payment order")
    if order_record.get("plan_name") != data.plan_name:
        raise HTTPException(status_code=400, detail="Payment order does not match the selected plan")

    if order_record.get("status") == "consumed":
        if order_record.get("payment_id") == data.razorpay_payment_id:
            return {
                "status": "success",
                "message": "Subscription is already activated for this account.",
                "idempotent": True,
            }
        raise HTTPException(status_code=409, detail="Payment order has already been consumed")

    signature_payload = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    try:
        order_response = requests.get(
            f"https://api.razorpay.com/v1/orders/{data.razorpay_order_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        payment_response = requests.get(
            f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Unable to verify payment with Razorpay") from exc
    if not order_response.ok or not payment_response.ok:
        raise HTTPException(status_code=502, detail="Razorpay payment verification failed")

    plan_info = plans_collection.find_one({"plan_name": order_record["plan_name"]})
    if not plan_info or int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="The purchased plan is no longer available")

    order_info = order_response.json()
    payment_info = payment_response.json()
    expected_amount = int(order_record["amount"])
    notes = order_info.get("notes") or {}
    if (
        int(order_info.get("amount", 0)) != expected_amount
        or (order_info.get("currency") or "").upper() != order_record.get("currency", "INR")
        or notes.get("plan_name") != order_record["plan_name"]
        or notes.get("pending_signup_id") != order_record.get("pending_signup_id")
    ):
        raise HTTPException(status_code=400, detail="Razorpay order details do not match")
    if (
        payment_info.get("order_id") != data.razorpay_order_id
        or int(payment_info.get("amount", 0)) != expected_amount
        or (payment_info.get("currency") or "").upper() != order_record.get("currency", "INR")
        or (payment_info.get("status") or "").lower() not in {"authorized", "captured"}
    ):
        raise HTTPException(status_code=400, detail="Razorpay payment is incomplete or does not match")

    try:
        claimed_order = payment_orders_collection.find_one_and_update(
            {"order_id": data.razorpay_order_id, "status": "created"},
            {
                "$set": {
                    "status": "processing",
                    "payment_id": data.razorpay_payment_id,
                    "processing_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Payment has already been used") from exc

    if not claimed_order:
        claimed_order = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
        if not (
            claimed_order
            and claimed_order.get("status") == "processing"
            and claimed_order.get("payment_id") == data.razorpay_payment_id
        ):
            raise HTTPException(status_code=409, detail="Payment order is already being processed")

    pending_signup_id = claimed_order.get("pending_signup_id")
    pending_signup = pending_signups_collection.find_one({"_id": pending_signup_id})
    if not pending_signup:
        existing_admin = admins_collection.find_one({
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id,
        })
        if existing_admin:
            payment_orders_collection.update_one(
                {"order_id": data.razorpay_order_id, "status": "processing"},
                {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
            )
            return {
                "status": "success",
                "message": "Subscription is already activated for this account.",
                "idempotent": True,
            }
        raise HTTPException(status_code=410, detail="Signup details expired. Contact support with your payment ID.")

    if (
        pending_signup.get("plan_name") != claimed_order.get("plan_name")
        or pending_signup.get("email") != claimed_order.get("email")
    ):
        raise HTTPException(status_code=400, detail="Stored signup details do not match this payment")

    pending_signup = pending_signups_collection.find_one_and_update(
        {"_id": pending_signup_id, "status": "pending"},
        {"$set": {"status": "processing", "processing_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    ) or pending_signups_collection.find_one({"_id": pending_signup_id, "status": "processing"})
    if not pending_signup:
        raise HTTPException(status_code=409, detail="Signup is already being activated")

    existing_user = admins_collection.find_one({"email": pending_signup["email"]})
    if existing_user:
        if (
            existing_user.get("razorpay_order_id") == data.razorpay_order_id
            and existing_user.get("razorpay_payment_id") == data.razorpay_payment_id
        ):
            payment_orders_collection.update_one(
                {"order_id": data.razorpay_order_id, "status": "processing"},
                {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
            )
            pending_signups_collection.delete_one({"_id": pending_signup_id})
            return {
                "status": "success",
                "message": "Subscription is already activated for this account.",
                "idempotent": True,
            }
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    now = datetime.now(timezone.utc)
    plan_def = get_plan_definition(claimed_order["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)
    company_doc = {
        "name": pending_signup.get("company_name", ""),
        "subscription_plan": claimed_order["plan_name"],
        "subscription_start": now.isoformat(),
        "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
        "is_paid": True,
        "credits": credits_to_grant,
        "created_at": now.isoformat(),
    }
    company_insert = companies_collection.insert_one(company_doc)
    try:
        admins_collection.insert_one({
            "custom_id": get_next_sequence_value("recruiter", "RC"),
            "username": pending_signup["email"],
            "password": pending_signup["password_hash"],
            "email": pending_signup["email"],
            "name": pending_signup["name"],
            "phone": pending_signup.get("phone", ""),
            "company_name": pending_signup.get("company_name", ""),
            "company_id": str(company_insert.inserted_id),
            "role": "super_admin",
            "subscription_plan": claimed_order["plan_name"],
            "subscription_start": now.isoformat(),
            "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
            "credits": credits_to_grant,
            "is_paid": True,
            "payment_provider": "razorpay",
            "payment_status": payment_info.get("status"),
            "amount_paid": expected_amount // 100,
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id,
            "payment_verified_at": now.isoformat(),
            "login_enabled": True,
            "created_at": now.isoformat(),
        })
    except Exception:
        companies_collection.delete_one({"_id": company_insert.inserted_id})
        pending_signups_collection.update_one(
            {"_id": pending_signup_id, "status": "processing"},
            {"$set": {"status": "pending"}, "$unset": {"processing_at": ""}},
        )
        payment_orders_collection.update_one(
            {
                "order_id": data.razorpay_order_id,
                "status": "processing",
                "payment_id": data.razorpay_payment_id,
            },
            {"$set": {"status": "created"}, "$unset": {"payment_id": "", "processing_at": ""}},
        )
        raise

    consume_result = payment_orders_collection.update_one(
        {
            "order_id": data.razorpay_order_id,
            "status": "processing",
            "payment_id": data.razorpay_payment_id,
        },
        {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
    )
    if consume_result.modified_count != 1:
        raise HTTPException(status_code=500, detail="Account created but payment receipt finalization failed")
    pending_signups_collection.delete_one({"_id": pending_signup_id})
    return {
        "status": "success",
        "message": f"Payment verified. Your {claimed_order['plan_name']} subscription is now active.",
    }


@router.post("/api/razorpay/verify-payment")
def verify_razorpay_payment(data: RazorpayVerifyRequest):
    """Verify Razorpay signature and activate the paid subscription."""
    key_id, key_secret = get_razorpay_credentials()
    return _verify_razorpay_signup_payment(data, key_id, key_secret)

    # Legacy implementation kept below temporarily for database migration reference.
    signup = validate_signup_form(data.signup_form or {})

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    if int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    existing_user = admins_collection.find_one({"email": signup["email"]})
    if existing_user:
        if existing_user.get("razorpay_payment_id") == data.razorpay_payment_id:
            return {"status": "success", "message": "Subscription is already activated for this account."}
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    signature_payload = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    key_id = os.getenv("RAZORPAY_KEY_ID")
    try:
        order_response = requests.get(
            f"https://api.razorpay.com/v1/orders/{data.razorpay_order_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        if order_response.ok:
            order_info = order_response.json()
            expected_amount = int(plan_info["price"]) * 100
            if int(order_info.get("amount", 0)) != expected_amount:
                raise HTTPException(status_code=400, detail="Paid amount does not match the selected plan")
            note_plan = (order_info.get("notes") or {}).get("plan_name")
            if note_plan and note_plan != plan_info["plan_name"]:
                raise HTTPException(status_code=400, detail="Payment order does not match the selected plan")
    except HTTPException:
        raise
    except Exception:
        pass

    try:
        payment_response = requests.get(
            f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        if payment_response.ok:
            payment_info = payment_response.json()
            payment_status = (payment_info.get("status") or "").lower()
            if payment_status and payment_status not in {"authorized", "captured"}:
                raise HTTPException(status_code=400, detail=f"Payment is not successful yet. Current status: {payment_status}")
    except HTTPException:
        raise
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    plan_def = get_plan_definition(plan_info["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)
    
    new_company = {
        "name": signup["company_name"],
        "subscription_plan": plan_info["plan_name"],
        "subscription_start": now.isoformat(),
        "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
        "is_paid": True,
        "credits": credits_to_grant,
        "created_at": now.isoformat()
    }
    company_insert = companies_collection.insert_one(new_company)
    company_id = str(company_insert.inserted_id)

    admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
        "username": signup["email"],
        "password": hash_password(signup["password"]),
        "email": signup["email"],
        "name": signup["name"],
        "phone": signup["phone"],
        "company_name": signup["company_name"],
        "company_id": company_id,
        "role": "super_admin",
        "subscription_plan": plan_info["plan_name"],
        "subscription_start": now.isoformat(),
        "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
        "credits": credits_to_grant,
        "is_paid": True,
        "payment_provider": "razorpay",
        "payment_status": "captured",
        "amount_paid": int(plan_info.get("price", 0)),
        "razorpay_order_id": data.razorpay_order_id,
        "razorpay_payment_id": data.razorpay_payment_id,
        "payment_verified_at": now.isoformat(),
        "login_enabled": True,
        "created_at": now.isoformat(),
    })

    return {
        "status": "success",
        "message": f"Payment verified. Your {plan_info['plan_name']} subscription is now active.",
    }


@router.post("/api/razorpay/create-upgrade-order")
def create_razorpay_upgrade_order(
    data: RazorpayUpgradeOrderRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Create a Razorpay order for purchasing credits / upgrading."""
    key_id, key_secret = get_razorpay_credentials()
    authenticated_admin_id = str(current_admin["admin_id"])
    if data.admin_id and not hmac.compare_digest(str(data.admin_id), authenticated_admin_id):
        raise HTTPException(status_code=403, detail="Cannot create an order for another account")
    admin = admins_collection.find_one({"_id": ObjectId(authenticated_admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
        
    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    if int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    receipt = f"upg_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload = {
        "amount": int(plan_info["price"]) * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "upgrade_admin_id": authenticated_admin_id,
            "plan_name": data.plan_name
        }
    }

    try:
        response = requests.post(
            "https://api.razorpay.com/v1/orders",
            auth=(key_id, key_secret),
            json=payload,
            timeout=15,
        )
        if not response.ok:
            raise HTTPException(status_code=500, detail=f"Razorpay error: {response.text}")
        
        order_data = response.json()
        payment_orders_collection.insert_one({
            "order_id": order_data["id"],
            "provider": "razorpay",
            "purpose": "upgrade",
            "admin_id": authenticated_admin_id,
            "company_id": str(admin.get("company_id") or ""),
            "plan_name": plan_info["plan_name"],
            "amount": int(plan_info["price"]) * 100,
            "currency": "INR",
            "status": "created",
            "created_at": datetime.now(timezone.utc),
        })
        return {
            "status": "success",
            "razorpay_order_id": order_data["id"],
            "amount": order_data["amount"],
            "currency": order_data["currency"],
            "key_id": key_id
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Razorpay Upgrade error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/razorpay/verify-upgrade")
def verify_razorpay_upgrade(
    data: RazorpayUpgradeVerifyRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Verify Razorpay signature and add credits to the user/company."""
    key_id, key_secret = get_razorpay_credentials()

    authenticated_admin_id = str(current_admin["admin_id"])
    if data.admin_id and not hmac.compare_digest(str(data.admin_id), authenticated_admin_id):
        raise HTTPException(status_code=403, detail="Cannot verify a payment for another account")
    admin = admins_collection.find_one({"_id": ObjectId(authenticated_admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    signature_payload = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    order_record = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
    if not order_record:
        raise HTTPException(status_code=400, detail="Unknown or expired payment order")
    if order_record.get("status") == "consumed":
        if order_record.get("payment_id") == data.razorpay_payment_id:
            return {
                "status": "success",
                "message": "Payment was already applied.",
                "credits_added": 0,
                "idempotent": True,
            }
        raise HTTPException(status_code=409, detail="Payment order has already been consumed")
    if (
        str(order_record.get("admin_id") or "") != authenticated_admin_id
        or order_record.get("plan_name") != data.plan_name
    ):
        raise HTTPException(status_code=403, detail="Payment order does not belong to this account and plan")

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")

    plan_def = get_plan_definition(plan_info["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)

    try:
        order_response = requests.get(
            f"https://api.razorpay.com/v1/orders/{data.razorpay_order_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        payment_response = requests.get(
            f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Unable to verify payment with Razorpay") from exc
    if not order_response.ok or not payment_response.ok:
        raise HTTPException(status_code=502, detail="Razorpay payment verification failed")

    order_info = order_response.json()
    payment_info = payment_response.json()
    expected_amount = int(plan_info["price"]) * 100
    if int(order_info.get("amount", 0)) != expected_amount:
        raise HTTPException(status_code=400, detail="Paid amount does not match the selected plan")
    if (order_info.get("currency") or "").upper() != "INR":
        raise HTTPException(status_code=400, detail="Unexpected payment currency")
    notes = order_info.get("notes") or {}
    if (
        str(notes.get("upgrade_admin_id") or "") != authenticated_admin_id
        or notes.get("plan_name") != data.plan_name
    ):
        raise HTTPException(status_code=400, detail="Razorpay order metadata does not match")
    if payment_info.get("order_id") != data.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment does not belong to this order")
    if (payment_info.get("status") or "").lower() not in {"authorized", "captured"}:
        raise HTTPException(status_code=400, detail="Payment has not completed")
    if int(payment_info.get("amount", 0)) != expected_amount:
        raise HTTPException(status_code=400, detail="Payment amount does not match")

    try:
        claimed_order = payment_orders_collection.find_one_and_update(
            {"order_id": data.razorpay_order_id, "status": "created"},
            {
                "$set": {
                    "status": "processing",
                    "payment_id": data.razorpay_payment_id,
                    "processing_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Payment has already been used") from exc
    if not claimed_order:
        existing_order = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
        if not (
            existing_order
            and existing_order.get("status") == "processing"
            and existing_order.get("payment_id") == data.razorpay_payment_id
        ):
            raise HTTPException(status_code=409, detail="Payment order is already being processed")
        claimed_order = existing_order

    now = datetime.now(timezone.utc).isoformat()
    expiry = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()

    if admin.get("company_id"):
        target_collection = companies_collection
        target_id = ObjectId(admin["company_id"])
    else:
        target_collection = admins_collection
        target_id = ObjectId(authenticated_admin_id)

    target_result = target_collection.update_one(
            {
                "_id": target_id,
                "applied_payment_ids": {"$ne": data.razorpay_payment_id},
            },
            {
                "$set": {
                    "subscription_plan": data.plan_name,
                    "subscription_start": now,
                    "subscription_expiry": expiry,
                    "is_paid": True,
                },
                "$inc": {"credits": credits_to_grant},
                "$addToSet": {"applied_payment_ids": data.razorpay_payment_id},
            }
        )
    if target_result.matched_count == 0:
        target = target_collection.find_one({"_id": target_id})
        if not target:
            raise HTTPException(status_code=404, detail="Subscription account no longer exists")
        if data.razorpay_payment_id not in target.get("applied_payment_ids", []):
            raise HTTPException(status_code=500, detail="Unable to apply purchased credits")

    consume_result = payment_orders_collection.update_one(
        {
            "order_id": data.razorpay_order_id,
            "status": "processing",
            "payment_id": data.razorpay_payment_id,
        },
        {
            "$set": {
                "status": "consumed",
                "payment_id": data.razorpay_payment_id,
                "consumed_at": datetime.now(timezone.utc),
            }
        },
    )
    if consume_result.modified_count != 1:
        raise HTTPException(status_code=500, detail="Payment applied but receipt finalization failed")

    return {
        "status": "success",
        "message": f"Payment verified. {credits_to_grant} credits added to your account.",
        "credits_added": credits_to_grant
    }

# --------------------------------------------------------------------------------
# LEGACY STRIPE CHECKOUT (kept only for backward compatibility)
# --------------------------------------------------------------------------------

@router.post("/api/stripe/create-checkout-session")
def create_stripe_checkout(data: StripeCheckoutRequest):
    """Create a Stripe Checkout session for paid plan subscription"""
    import stripe
    
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured. Contact administrator.")
    
    stripe.api_key = stripe_key
    
    signup = validate_signup_form(data.signup_form or {})
    if admins_collection.find_one({"email": signup["email"]}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if plan_info.get("price", 0) == 0:
        raise HTTPException(status_code=400, detail="Free plans don't require payment")
    
    frontend_url = os.getenv("FRONTEND_URL", "https://localhost:3000")
    pending_signup_id = uuid.uuid4().hex
    pending_signups_collection.insert_one({
        "_id": pending_signup_id,
        "name": signup["name"],
        "email": signup["email"],
        "password_hash": hash_password(signup["password"]),
        "phone": signup["phone"],
        "company_name": signup["company_name"],
        "plan_name": plan_info["plan_name"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=2),
        "status": "pending",
    })
    
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=signup["email"],
            line_items=[{
                "price_data": {
                    "currency": "inr",
                    "product_data": {
                        "name": plan_info["plan_name"],
                        "description": f"Subscription for {plan_info.get('credits_granted', 0)} credits",
                    },
                    "unit_amount": plan_info["price"] * 100,
                    "recurring": {
                        "interval": "day",
                        "interval_count": 30,
                    },
                },
                "quantity": 1,
            }],
            success_url=f"{frontend_url}/?payment=success",
            cancel_url=f"{frontend_url}/?payment=cancelled",
            metadata={
                "pending_signup_id": pending_signup_id,
                "plan": plan_info["plan_name"],
            },
        )
        return {"status": "success", "url": session.url}
    except Exception as e:
        pending_signups_collection.delete_one({"_id": pending_signup_id, "status": "pending"})
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")

@router.post("/api/stripe/webhook")
async def stripe_webhook(request):
    """Handle Stripe webhook for paid subscription completion"""
    import stripe
    
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not stripe_key or not webhook_secret:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    stripe.api_key = stripe_key
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    
    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook signature failed")
    
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("mode") != "subscription":
            return {"received": True}
        if (session.get("payment_status") or "").lower() not in {"paid", "no_payment_required"}:
            return {"received": True}
        
        metadata = session.get("metadata", {})
        pending_signup_id = metadata.get("pending_signup_id")
        if not pending_signup_id:
            return {"received": True}

        pending_signup = pending_signups_collection.find_one_and_update(
            {"_id": pending_signup_id, "status": "pending"},
            {
                "$set": {
                    "status": "processing",
                    "stripe_event_id": event.get("id"),
                    "stripe_session_id": session.get("id"),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if not pending_signup:
            pending_signup = pending_signups_collection.find_one({
                "_id": pending_signup_id,
                "status": "processing",
                "stripe_session_id": session.get("id"),
            })
        if not pending_signup:
            return {"received": True}

        name = pending_signup["name"]
        email = pending_signup["email"]
        password_hash = pending_signup["password_hash"]
        plan_name = pending_signup["plan_name"]

        existing_admin = admins_collection.find_one({"email": email})
        if existing_admin:
            if existing_admin.get("stripe_session_id") == session.get("id"):
                pending_signups_collection.delete_one({"_id": pending_signup_id})
                return {"received": True}
            pending_signups_collection.update_one(
                {"_id": pending_signup_id},
                {"$set": {"status": "conflict", "conflict_at": datetime.now(timezone.utc)}},
            )
            logger.error("Stripe signup conflict for an existing account")
            return {"received": True}
        
        plan_info = plans_collection.find_one({"plan_name": plan_name})
        if not plan_info or metadata.get("plan") != plan_name:
            raise HTTPException(status_code=400, detail="Stripe checkout plan does not match")
        expected_amount = int(plan_info.get("price", 0)) * 100
        if (
            int(session.get("amount_total") or 0) != expected_amount
            or (session.get("currency") or "").lower() != "inr"
        ):
            raise HTTPException(status_code=400, detail="Stripe checkout amount does not match")

        credits_granted = plan_info.get("credits_granted", 30)
        duration = plan_info.get("duration", 30)
        now = datetime.now(timezone.utc)
        company_insert = companies_collection.insert_one({
            "name": pending_signup.get("company_name", ""),
            "subscription_plan": plan_name,
            "subscription_start": now.isoformat(),
            "subscription_expiry": (now + timedelta(days=duration)).isoformat(),
            "is_paid": True,
            "credits": credits_granted,
            "created_at": now.isoformat(),
        })

        try:
            admins_collection.insert_one({
                "custom_id": get_next_sequence_value("recruiter", "RC"),
                "username": email,
                "password": password_hash,
                "email": email,
                "name": name,
                "phone": pending_signup.get("phone", ""),
                "company_name": pending_signup.get("company_name", ""),
                "company_id": str(company_insert.inserted_id),
                "role": "super_admin",
                "subscription_plan": plan_name,
                "subscription_start": now.isoformat(),
                "subscription_expiry": (now + timedelta(days=duration)).isoformat(),
                "is_paid": True,
                "stripe_customer_id": session.get("customer"),
                "stripe_subscription_id": session.get("subscription"),
                "stripe_session_id": session.get("id"),
                "login_enabled": True,
                "created_at": now.isoformat()
            })
        except Exception:
            companies_collection.delete_one({"_id": company_insert.inserted_id})
            pending_signups_collection.update_one(
                {"_id": pending_signup_id, "status": "processing"},
                {
                    "$set": {"status": "pending"},
                    "$unset": {
                        "stripe_event_id": "",
                        "stripe_session_id": "",
                    },
                },
            )
            raise
        pending_signups_collection.delete_one({"_id": pending_signup_id})
        logger.info("Paid admin created via Stripe for plan %s", plan_name)
    
    return {"received": True}

# --------------------------------------------------------------------------------
# MASTER: GET ALL ADMINS WITH SUBSCRIPTION DETAILS
# --------------------------------------------------------------------------------

@router.get("/master/admins")
def get_all_admins(master_id: str = Depends(get_current_admin)):
    """Master-only: Get all admins with subscription & revenue stats"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    all_admins = list(admins_collection.find({"role": {"$ne": "master"}}))
    now = datetime.now(timezone.utc)
    
    total_admins = len(all_admins)
    active_subs = 0
    total_revenue = 0
    
    admin_list = []
    for a in all_admins:
        exp_str = a.get("subscription_expiry")
        is_expired = False
        if exp_str:
            try:
                if now > datetime.fromisoformat(exp_str):
                    is_expired = True
            except:
                pass
        
        if not is_expired:
            active_subs += 1
        
        plan_name = a.get("subscription_plan", "Free Trial")
        plan_info = plans_collection.find_one({"plan_name": plan_name})
        if plan_info and a.get("is_paid"):
            total_revenue += plan_info.get("price", 0)
        
        admin_list.append({
            "id": str(a["_id"]),
            "username": a.get("username", ""),
            "name": a.get("name", a.get("username", "")),
            "email": a.get("email", ""),
            "subscription_plan": plan_name,
            "subscription_start": a.get("subscription_start", ""),
            "subscription_expiry": a.get("subscription_expiry", ""),
            "is_expired": is_expired,
            "is_paid": a.get("is_paid", False),
            "login_enabled": a.get("login_enabled", True),
            "created_at": a.get("created_at", "")
        })
    
    return {
        "status": "success",
        "stats": {
            "total_companies": total_admins,
            "active_subscriptions": active_subs,
            "estimated_revenue": total_revenue
        },
        "admins": admin_list
    }

@router.put("/master/admins/{admin_id}/toggle-login")
def toggle_admin_login(admin_id: str, master_id: str = Depends(get_current_admin)):
    """Master-only: Enable/disable an admin's login access"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    admin = admins_collection.find_one({"_id": ObjectId(admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    current = admin.get("login_enabled", True)
    admins_collection.update_one(
        {"_id": ObjectId(admin_id)},
        {"$set": {"login_enabled": not current}}
    )
    return {"status": "success", "login_enabled": not current}

# --------------------------------------------------------------------------------
# SUPER ADMIN APIs
# --------------------------------------------------------------------------------

@router.get("/super-admin/admins")
def get_sub_admins(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
        
    admins = list(admins_collection.find({"company_id": company_id, "role": "admin"}, {"password": 0}))
    
    # Enrich with session count created by each admin
    for admin in admins:
        admin["id"] = str(admin["_id"])
        admin["_id"] = str(admin["_id"])
        admin["credits"] = admin.get("credits", 0)
        admin["sessions_created"] = interview_sessions_collection.count_documents({"admin_id": str(admin["id"])})
        
    return {"status": "success", "data": admins}

@router.post("/super-admin/admins")
def create_sub_admin(data: SubAdminCreate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
        
    # Check if username already exists
    if admins_collection.find_one({"username": data.username}):
        raise HTTPException(status_code=400, detail="Username already exists")
        
    new_admin = {
        "username": data.username,
        "password": hash_password(data.password),
        "email": data.email,
        "name": data.name,
        "role": "admin",
        "company_id": company_id,
        "credits": data.credits,
        "login_enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_admin)
    return {"status": "success", "message": "Sub-admin created successfully"}

@router.post("/super-admin/admins/{admin_id}/toggle-status")
def toggle_sub_admin_status(admin_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    
    admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id), "company_id": company_id})
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Sub-admin not found")
        
    new_status = not admin_doc.get("login_enabled", True)
    admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$set": {"login_enabled": new_status}})
    
    broadcast_profile_update(
        admin_id=admin_id,
        company_id=str(company_id or ""),
        credits=admin_doc.get("credits"),
        login_enabled=new_status
    )
    return {"status": "success", "login_enabled": new_status}

@router.delete("/super-admin/admins/{admin_id}")
def delete_sub_admin(admin_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    
    result = admins_collection.delete_one({"_id": ObjectId(admin_id), "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sub-admin not found")
        
    broadcast_profile_update(
        admin_id=admin_id,
        company_id=str(company_id or ""),
        login_enabled=False,
        extra={"deleted": True}
    )
    return {"status": "success"}

@router.post("/super-admin/admins/{admin_id}/add-credits")
def add_sub_admin_credits(admin_id: str, data: AddCreditsRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    
    admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id), "company_id": company_id})
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Sub-admin not found")
        
    if admin_doc.get("login_enabled") == False:
        raise HTTPException(status_code=400, detail="Cannot add credits to a deactivated admin account.")

    super_admin_id = current_admin["admin_id"]
    with mongo_client.start_session() as db_session:
        with db_session.start_transaction():
            sa_doc = admins_collection.find_one_and_update(
                {"_id": ObjectId(super_admin_id), "credits": {"$gte": data.credits}},
                {"$inc": {"credits": -data.credits}},
                return_document=ReturnDocument.AFTER,
                session=db_session,
            )
            if not sa_doc:
                raise HTTPException(status_code=400, detail="Insufficient credits in Super Admin account.")

            updated_admin = admins_collection.find_one_and_update(
                {"_id": ObjectId(admin_id), "company_id": company_id},
                {"$inc": {"credits": data.credits}},
                return_document=ReturnDocument.AFTER,
                session=db_session,
            )
            if not updated_admin:
                raise HTTPException(status_code=404, detail="Sub-admin not found")
    
    # Broadcast to requesting sub-admin
    broadcast_profile_update(
        admin_id=admin_id,
        company_id=str(company_id or ""),
        credits=updated_admin.get("credits", 0),
        login_enabled=updated_admin.get("login_enabled")
    )
    # Broadcast to Super Admin (to update their layout header credits in real-time)
    broadcast_profile_update(
        admin_id=super_admin_id,
        company_id=str(company_id or ""),
        credits=sa_doc.get("credits", 0),
        login_enabled=sa_doc.get("login_enabled")
    )
    
    return {"status": "success", "credits": updated_admin.get("credits", 0), "super_admin_credits": sa_doc.get("credits", 0)}


@router.get("/super-admin/dashboard-stats")
def get_super_admin_dashboard_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
        
    admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])})
    credits = admin_doc.get("credits", 0) if admin_doc else 0
    
    company = companies_collection.find_one({"_id": ObjectId(company_id)})
    if company and "credits" in company:
        credits = company["credits"]
    
    session_filter = {"company_id": company_id}
    total_sessions = interview_sessions_collection.count_documents(session_filter)
    completed_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "completed"})
    pending_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "pending"})
    
    # Usage over the last 7 days
    now = datetime.now(timezone.utc)
    chart_labels = []
    chart_data = []
    
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        start_of_day = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)
        
        count = interview_sessions_collection.count_documents({
            **session_filter,
            "created_at": {
                "$gte": start_of_day.isoformat(),
                "$lt": end_of_day.isoformat()
            }
        })
        chart_labels.append(day.strftime("%m/%d"))
        chart_data.append(count)
        
    # Breakdown by admin
    admins = list(admins_collection.find({"company_id": company_id}))
    admin_labels = []
    admin_data = []
    for a in admins:
        name = a.get("name", a.get("username"))
        count = interview_sessions_collection.count_documents({"admin_id": str(a["_id"])})
        admin_labels.append(name)
        admin_data.append(count)

    return {
        "status": "success",
        "credits": credits,
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "pending_sessions": pending_sessions,
        "chart_labels": chart_labels,
        "chart_data": chart_data,
        "admin_labels": admin_labels,
        "admin_data": admin_data
    }

# --------------------------------------------------------------------------------
# CREDIT REQUEST APIs
# --------------------------------------------------------------------------------

@router.post("/admin/credit-requests")
def request_credits(data: CreditRequestCreate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only tenant admins can request credits")
        
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    
    request_doc = {
        "admin_id": admin_id,
        "company_id": company_id,
        "amount": data.amount,
        "reason": data.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    credit_requests_collection.insert_one(request_doc)
    
    # Send notification to superadmin
    try:
        admin_user = admins_collection.find_one({"_id": ObjectId(admin_id)})
        admin_name = admin_user.get("name") or admin_user.get("username") or "An admin"
        notifications_collection.insert_one({
            "title": "Credits Requested",
            "message": f"{admin_name} has requested {data.amount} additional credits.",
            "type": "credits",
            "recipient_role": "superadmin",
            "company_id": company_id,
            "read": False,
            "created_at": request_doc["created_at"]
        })
    except Exception as ne:
        print(f"Failed to create credit request notification: {ne}")
        
    return {"status": "success", "message": "Credit request submitted successfully"}

@router.get("/super-admin/credit-requests")
def get_credit_requests(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
        
    company_id = current_admin.get("company_id")
    requests = list(credit_requests_collection.find({"company_id": company_id}))
    
    # Enrich with admin details
    for req in requests:
        req["id"] = str(req["_id"])
        req["_id"] = str(req["_id"])
        admin_doc = admins_collection.find_one({"_id": ObjectId(req["admin_id"])})
        if admin_doc:
            req["admin_name"] = admin_doc.get("name", admin_doc.get("username", "Unknown"))
            req["admin_email"] = admin_doc.get("email", "Unknown")
            
    # Sort pending first, then by date descending
    requests.sort(key=lambda x: (0 if x["status"] == "pending" else 1, x.get("created_at", "")), reverse=True)
    return {"status": "success", "data": requests}

@router.put("/super-admin/credit-requests/{request_id}")
def update_credit_request(request_id: str, data: CreditRequestUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
        
    company_id = current_admin.get("company_id")
    if data.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    with mongo_client.start_session() as db_session:
        with db_session.start_transaction():
            req = credit_requests_collection.find_one_and_update(
                {
                    "_id": ObjectId(request_id),
                    "company_id": company_id,
                    "status": "pending",
                },
                {"$set": {
                    "status": data.status,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "processed_by": current_admin["admin_id"],
                }},
                return_document=ReturnDocument.BEFORE,
                session=db_session,
            )
            if not req:
                raise HTTPException(status_code=409, detail="Request was already processed or does not exist")

            if data.status == "approved":
                amount = req["amount"]
                company = companies_collection.find_one_and_update(
                    {"_id": ObjectId(company_id), "credits": {"$gte": amount}},
                    {"$inc": {"credits": -amount}},
                    return_document=ReturnDocument.AFTER,
                    session=db_session,
                )
                if not company:
                    raise HTTPException(status_code=400, detail="Insufficient company credits")
                admin_result = admins_collection.update_one(
                    {"_id": ObjectId(req["admin_id"]), "company_id": company_id},
                    {"$inc": {"credits": amount}},
                    session=db_session,
                )
                if admin_result.matched_count != 1:
                    raise HTTPException(status_code=404, detail="Requesting admin no longer exists")
        
    if data.status == "approved":
        # Broadcast to requesting admin
        updated_admin = admins_collection.find_one({"_id": ObjectId(req["admin_id"])})
        if updated_admin:
            broadcast_profile_update(
                admin_id=str(req["admin_id"]),
                company_id=str(company_id or ""),
                credits=updated_admin.get("credits", 0),
                login_enabled=updated_admin.get("login_enabled")
            )
            
        # Broadcast to Super Admin (company credits updated)
        broadcast_profile_update(
            admin_id=current_admin["admin_id"],
            company_id=str(company_id or ""),
            credits=companies_collection.find_one({"_id": ObjectId(company_id)}).get("credits", 0) if company_id else 0
        )
    else:
        # If rejected, still broadcast an event so the Super Admin list updates to show the request is no longer pending!
        broadcast_profile_update(
            admin_id=str(req["admin_id"]),
            company_id=str(company_id or ""),
            extra={"status_change": "rejected"}
        )
        
    # Send notification to the requesting admin
    try:
        notifications_collection.insert_one({
            "title": f"Credits Request {data.status.capitalize()}",
            "message": f"Your request for {req['amount']} additional credits has been {data.status}.",
            "type": "credits",
            "recipient_role": "admin",
            "company_id": company_id,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as ne:
        print(f"Failed to create credit request resolution notification: {ne}")
        
    return {"status": "success", "message": f"Request {data.status} successfully"}


class ExportExcelRequest(BaseModel):
    candidates: List[Dict[str, Any]]

class BulkDeleteRequest(BaseModel):
    ids: List[str]

class UpdateCreditRequestSchema(BaseModel):
    status: str

from fastapi import WebSocket, WebSocketDisconnect

@router.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket, token: Optional[str] = None):
    from redis_manager import manager
    if not token:
        await websocket.close(code=1008)
        return
    try:
        auth_context = _decode_dashboard_websocket_admin(token)
    except HTTPException:
        await websocket.close(code=1008)
        return
    await manager.connect_dashboard(websocket, auth_context)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)

@router.get("/dashboard")
async def get_dashboard_aggregated_data(
    admin_id: Optional[str] = None,
    summary_only: bool = False,
    current_admin: dict = Depends(get_current_admin_details),
):
    try:
        from redis_manager import manager
        import json
        
        stats_data = await get_dashboard_stats(admin_id=admin_id, current_admin=current_admin)
        
        
        # Restore candidate query since the frontend still expects candidates in this payload
        c_query_filter = {
            "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
        }
        if current_admin.get("role") != "master":
            c_query_filter["company_id"] = current_admin.get("company_id")
        if current_admin.get("role") == "admin":
            c_query_filter["created_by"] = current_admin["admin_id"]
        elif admin_id:
            c_query_filter["created_by"] = admin_id
            
        candidate_projection = None
        if summary_only:
            candidate_projection = {
                "link_id": 1,
                "candidate_name": 1,
                "candidate_email": 1,
                "candidate_phone": 1,
                "interview_title": 1,
                "score": 1,
                "avg_score": 1,
                "status": 1,
                "decision": 1,
                "created_at": 1,
                "expires_at": 1,
                "started_at": 1,
                "interview_duration": 1,
                "is_deactivated": 1,
            }
        def _load_dashboard_candidates():
            cursor = interview_sessions_collection.find(c_query_filter, candidate_projection).sort("created_at", -1)
            if summary_only:
                cursor = cursor.limit(8)
            return list(cursor)

        candidates_cursor = await asyncio.to_thread(_load_dashboard_candidates)
        
        # Get AI Calling interested candidates
        apps = []
        try:
            jobs_query = {}
            if current_admin.get("role") != "master":
                jobs_query["company_id"] = current_admin.get("company_id")
            if current_admin.get("role") == "admin":
                jobs_query["admin_id"] = current_admin["admin_id"]
            elif admin_id:
                jobs_query["admin_id"] = admin_id
            jobs = [] if summary_only else await asyncio.to_thread(lambda: list(jobs_collection.find(jobs_query)))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids}
            }
            if job_ids:
                apps = await asyncio.to_thread(lambda: list(job_applications_collection.find(app_query)))
        except Exception as e:
            print(f"Error fetching AI Calling candidates: {e}")
            
        seen_emails = set()
        candidates_list = []
        now = datetime.now(timezone.utc)
        for c in candidates_cursor:
            email = c.get("candidate_email") or c.get("email")
            if email:
                seen_emails.add(email.strip().lower())
            
            c["status"] = sync_session_status(c, now)
            
            c["id"] = str(c["_id"])
            c["_id"] = str(c["_id"])
            candidates_list.append(c)
            
        for app in apps:
            email = app.get("email")
            if email:
                email_lower = email.strip().lower()
                if email_lower in seen_emails:
                    continue
                seen_emails.add(email_lower)
            
            app_id = str(app.get("_id"))
            score = app.get("score") or 0.0
            mock_session = {
                "id": f"ai_call_{app_id}",
                "_id": f"ai_call_{app_id}",
                "link_id": f"ai_call_{app_id}",
                "candidate_name": app.get("name") or "Candidate",
                "candidate_email": app.get("email") or "",
                "candidate_phone": app.get("phone") or "",
                "interview_title": app.get("job_title") or "AI Calling Profile",
                "score": score,
                "avg_score": score,
                "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
                "decision": app.get("decision") or "selected",
                "status": "completed",
                "application_id": app_id,
                "is_deactivated": False
            }
            candidates_list.append(mock_session)
            
        # NOTE: Omni Dimension (AI Calling) call logs are intentionally NOT merged
        # into the main candidates_list here. Those records only have phone numbers
        # (not real names), hardcoded 'AI Calling' roles, and 0% scores, which
        # pollute the Recruiter Management table with dummy data.
        # AI Calling data is available via the dedicated /api/calls/recent endpoint

        live_sessions = []
        ongoing_monitored_count = 0
        ongoing_live_count = 0
        ongoing_alert_count = 0
        ongoing_speaking_count = 0
        ongoing_coding_count = 0
        
        # Plan capability checks
        admin_user_doc = await asyncio.to_thread(
            admins_collection.find_one, {"_id": ObjectId(current_admin["admin_id"])}
        )
        plan_ctx = get_admin_plan_context(admin_user_doc) if admin_user_doc else None
        has_live = plan_ctx.get("capabilities", {}).get("live_monitoring", False) if plan_ctx else False
        
        if has_live or current_admin.get("role") in ["master", "super_admin"]:
            query_filter = {
                "status": "started",
                "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
            }
            if current_admin.get("role") != "master":
                query_filter["company_id"] = current_admin.get("company_id")
            if current_admin.get("role") == "admin":
                query_filter["created_by"] = current_admin["admin_id"]
            elif admin_id:
                query_filter["created_by"] = admin_id
            
            rows = await asyncio.to_thread(
                lambda: list(interview_sessions_collection.find(
                    query_filter,
                    {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_id": 1, "interview_title": 1, "started_at": 1, "interview_duration": 1, "status": 1},
                ).sort("created_at", -1))
            )
            rows = [row for row in rows if sync_session_status(row) == "started"]
            
            ongoing_monitored_count = len(rows)
            snapshots = await _load_live_snapshots([row.get("link_id", "") for row in rows])
            for row in rows:
                link_id = row.get("link_id", "")
                snap = snapshots.get(link_id, {})
                online = False
                if snap.get("ts"):
                    try:
                        ts_dt = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
                        age_secs = (datetime.now(timezone.utc) - ts_dt).total_seconds()
                        online = age_secs < 60
                    except Exception:
                        pass
                
                audio_level = snap.get("audio_level", 0)
                current_question = snap.get("current_question", "")
                
                session_item = {
                    "online": online,
                    "audio_level": audio_level,
                    "current_question": current_question,
                    "proctoring_alerts": snap.get("proctoring_alerts", 0),
                    "alert_types": snap.get("alert_types", []),
                    "last_alert_type": snap.get("last_alert_type"),
                    "face_visible": snap.get("face_visible"),
                    "face_count": snap.get("face_count", 0),
                    "multi_face": snap.get("multi_face", False),
                    "phone_detected": snap.get("phone_detected", False),
                    "eye_contact_lost": snap.get("eye_contact_lost", False),
                    "round_type": snap.get("round_type"),
                    "question_text": snap.get("question_text", ""),
                    "link_id": row.get("link_id", ""),
                    "candidate_name": row.get("candidate_name", ""),
                    "candidate_email": row.get("candidate_email", ""),
                    "interview_title": row.get("interview_title", ""),
                    "session_id": str(row.get("_id", ""))
                }
                live_sessions.append(session_item)
                
                if online:
                    ongoing_live_count += 1
                
                if snap.get("proctoring_alerts", 0) > 0:
                    ongoing_alert_count += 1
                    
                if audio_level > 5:
                    ongoing_speaking_count += 1
                if snap.get("round_type") == "coding":
                    ongoing_coding_count += 1

        credit_reqs = []
        if current_admin.get("role") in ["master", "super_admin"]:
            credit_filter = {"status": "pending"}
            if current_admin.get("role") != "master":
                credit_filter["company_id"] = current_admin.get("company_id")
            reqs = await asyncio.to_thread(
                lambda: list(credit_requests_collection.find(credit_filter).sort("created_at", -1))
            )
            for r in reqs:
                r["id"] = str(r["_id"])
                r["_id"] = str(r["_id"])
                credit_reqs.append(r)
                
        return {
            "dbStats": stats_data,
            "candidates": candidates_list,
            "liveSessions": live_sessions,
            "ongoingMonitoredCount": ongoing_monitored_count,
            "ongoingLiveCount": ongoing_live_count,
            "ongoingAlertCount": ongoing_alert_count,
            "ongoingSpeakingCount": ongoing_speaking_count,
            "ongoingCodingCount": ongoing_coding_count,
            "creditRequests": credit_reqs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/export/excel")
def export_excel(data: ExportExcelRequest, current_admin: dict = Depends(get_current_admin_details)):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    try:
        output = io.StringIO()
        from dateutil.parser import parse as parse_date
        writer = csv.writer(output)
        writer.writerow(["Name", "Email", "Position", "Status", "Score", "Created At"])
        for c in data.candidates:
            # Format score as a plain number so Excel doesn't convert it to a date
            raw_score = c.get("score")
            if raw_score is None:
                raw_score = c.get("avg_score", 0)
            formatted_score = f"{float(raw_score):.1f}" if raw_score else "0.0"
            
            # Format date
            raw_date = c.get("created_at", "")
            formatted_date = raw_date
            if raw_date:
                try:
                    dt = parse_date(raw_date)
                    formatted_date = dt.strftime("%d/%m/%Y, %I:%M %p")
                except Exception:
                    pass

            writer.writerow([
                c.get("candidate_name", "Unknown"),
                c.get("candidate_email", "N/A"),
                c.get("interview_title") or "N/A",
                str(c.get("status", "")).upper(),
                formatted_score,
                formatted_date
            ])
        output.seek(0)
        # Add BOM for UTF-8 so Excel opens it properly formatted automatically
        return StreamingResponse(
            io.BytesIO(b'\xef\xbb\xbf' + output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=Interview_Candidates_Report.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/candidates/bulk")
def bulk_delete_candidates(data: BulkDeleteRequest, current_admin: dict = Depends(get_current_admin_details)):
    try:
        deleted_count = 0
        for id_str in data.ids:
            # The frontend passes link_id (or _id if link_id is missing)
            row = interview_sessions_collection.find_one({"$or": [{"link_id": id_str}, {"_id": id_str}]})
            if not row:
                try:
                    from bson import ObjectId
                    row = interview_sessions_collection.find_one({"_id": ObjectId(id_str)})
                except:
                    pass
            
            if row:
                interview_id = row.get("interview_id")
                if interview_id:
                    interviews_collection.delete_one({"id": interview_id})
                    answers_collection.delete_many({"interview_id": interview_id})
                    if get_session(interview_id):
                        delete_cached_session(interview_id)
                
                interview_sessions_collection.delete_one({"_id": row["_id"]})
                deleted_count += 1

        return {"status": "success", "deleted_count": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/interview/session/{link_id}")
def delete_session_alias(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    try:
        row = interview_sessions_collection.find_one({"link_id": link_id})
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        # Cascade-delete associated interview record and answers
        interview_id = row.get("interview_id")
        if interview_id:
            interviews_collection.delete_one({"id": interview_id})
            answers_collection.delete_many({"interview_id": interview_id})
            if get_session(interview_id):
                delete_cached_session(interview_id)

        # Delete the session link itself
        interview_sessions_collection.delete_one({"link_id": link_id})
        return {"status": "success", "message": "Session deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/api/credits/request/{request_id}")
def update_credit_request_alias(request_id: str, data: UpdateCreditRequestSchema, current_admin: dict = Depends(get_current_admin_details)):
    try:
        req = credit_requests_collection.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
            
        credit_requests_collection.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": data.status}}
        )
        
        if data.status == "approved":
            amount = req.get("requested_amount", 0)
            admin_id = req.get("admin_id")
            admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)}) if admin_id else None
            if admin_doc:
                company_id = admin_doc.get("company_id")
                if company_id:
                    companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": -amount}})
                admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$inc": {"credits": amount}})
                
        return {"status": "success", "message": f"Request {data.status} successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/admin/candidates/qualified")
def get_admin_qualified(pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
        
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": company_id, "decision": "selected", "created_by": admin_id}
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
        
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": company_id, "admin_id": admin_id}
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"},
                "decision": {"$ne": "rejected"}
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling candidates for admin qualified: {e}")
            
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "selected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

@router.get("/api/admin/candidates/rejected")
def get_admin_rejected(pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
        
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": company_id, "decision": "rejected", "created_by": admin_id}
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
        
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": company_id, "admin_id": admin_id}
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "decision": "rejected"
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling rejected candidates for admin: {e}")
            
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "rejected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

# ─── SuperAdmin APIs ─────────────────────────────────

@router.get("/api/superadmin/dashboard")
@router.get("/superadmin/dashboard")
async def superadmin_dashboard(
    adminId: Optional[str] = None,
    summary_only: bool = False,
    current_admin: dict = Depends(get_current_admin_details),
):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return await get_dashboard_aggregated_data(
        admin_id=adminId,
        summary_only=summary_only,
        current_admin=current_admin,
    )


@router.get("/api/superadmin/recruitment-funnel")
@router.get("/superadmin/recruitment-funnel")
def superadmin_recruitment_funnel(adminId: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return stage-by-stage recruitment funnel counts from real DB data."""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    try:
        company_id = current_admin.get("company_id")
        base_q = {}
        if current_admin.get("role") != "master":
            base_q["company_id"] = company_id
        if adminId:
            base_q["created_by"] = adminId

        total       = interview_sessions_collection.count_documents(base_q)
        completed   = interview_sessions_collection.count_documents({**base_q, "status": "completed"})
        qualified   = interview_sessions_collection.count_documents({**base_q, "decision": "selected"})
        rejected    = interview_sessions_collection.count_documents({**base_q, "decision": "rejected"})

        # Count AI calling candidates
        ai_call_apps = 0
        try:
            jobs_q = {}
            if current_admin.get("role") != "master":
                jobs_q["company_id"] = company_id
            if adminId:
                jobs_q["admin_id"] = adminId
            job_ids = [j.get("job_id") for j in jobs_collection.find(jobs_q, {"job_id": 1}) if j.get("job_id")]
            ai_call_apps = job_applications_collection.count_documents({"job_id": {"$in": job_ids}}) if job_ids else 0
        except Exception:
            ai_call_apps = 0

        colors = ["#3b82f6", "#0ea5e9", "#0284c7", "#0d9488", "#10b981", "#22c55e", "#eab308", "#f59e0b"]
        funnel = [
            {"name": "Applications Received",  "value": total + ai_call_apps, "fill": colors[0]},
            {"name": "AI Resume Screening",     "value": total,               "fill": colors[1]},
            {"name": "AI Voice Screening",      "value": ai_call_apps,        "fill": colors[2]},
            {"name": "AI Interviews",           "value": completed,           "fill": colors[3]},
            {"name": "Qualified Candidates",    "value": qualified,           "fill": colors[4]},
            {"name": "Recruiter Review",        "value": qualified,           "fill": colors[5]},
            {"name": "Offers Released",         "value": max(0, qualified - rejected), "fill": colors[6]},
            {"name": "Candidates Hired",        "value": qualified,           "fill": colors[7]},
        ]
        return {"funnel": funnel}
    except Exception as e:
        print(f"Funnel error: {e}")
        return {"funnel": []}


@router.get("/api/superadmin/platform-analytics")
@router.get("/superadmin/platform-analytics")
def superadmin_platform_analytics(adminId: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return key platform analytics metrics and average time-to-hire."""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    try:
        company_id = current_admin.get("company_id")
        base_q = {"company_id": company_id}
        if adminId:
            base_q["created_by"] = adminId

        total     = interview_sessions_collection.count_documents(base_q) or 1
        completed = interview_sessions_collection.count_documents({**base_q, "status": "completed"})
        selected  = interview_sessions_collection.count_documents({**base_q, "decision": "selected"})
        rejected  = interview_sessions_collection.count_documents({**base_q, "decision": "rejected"})
        decided   = selected + rejected or 1

        # Average AI score
        pipeline_agg = [
            {"$match": {**base_q, "avg_score": {"$gt": 0}}},
            {"$group": {"_id": None, "avg": {"$avg": "$avg_score"}}}
        ]
        agg_result = list(interview_sessions_collection.aggregate(pipeline_agg))
        avg_score  = round(agg_result[0]["avg"], 0) if agg_result else 0

        completion_rate = round((completed / total) * 100, 0)
        hire_rate       = round((selected / decided) * 100, 0)

        # Average time-to-hire in days
        avg_days = None
        try:
            hired_sessions = list(interview_sessions_collection.find(
                {**base_q, "decision": "selected", "started_at": {"$exists": True}},
                {"started_at": 1, "created_at": 1}
            ).limit(200))
            deltas = []
            for s in hired_sessions:
                try:
                    start = datetime.fromisoformat((s.get("started_at") or s.get("created_at")).replace("Z", "+00:00"))
                    end   = datetime.fromisoformat((s.get("updated_at") or s.get("completed_at") or s.get("created_at")).replace("Z", "+00:00"))
                    diff  = (end - start).days
                    if 0 <= diff <= 365:
                        deltas.append(diff)
                except Exception:
                    pass
            if deltas:
                avg_days = round(sum(deltas) / len(deltas), 0)
        except Exception as e:
            print(f"Time-to-hire error: {e}")

        analytics = [
            {"label": "AI Resume Screening Success Rate", "value": min(100, completion_rate)},
            {"label": "Interview Completion Rate",        "value": min(100, completion_rate)},
            {"label": "Average AI Match Score",           "value": min(100, int(avg_score))},
            {"label": "Offer Acceptance Rate",            "value": min(100, hire_rate)},
            {"label": "Candidate Conversion Rate",        "value": min(100, round((selected / total) * 100, 0))},
            {"label": "Recruiter Productivity",           "value": min(100, min(completion_rate + 5, 100))},
            {"label": "AI Recommendation Accuracy",       "value": min(100, int(avg_score) + 5 if avg_score else 0)},
        ]

        return {
            "analytics": analytics,
            "avg_time_to_hire_days": avg_days
        }
    except Exception as e:
        print(f"Platform analytics error: {e}")
        return {"analytics": [], "avg_time_to_hire_days": None}


@router.get("/api/superadmin/candidates/qualified")
@router.get("/superadmin/candidates/qualified")
def get_superadmin_qualified(adminId: Optional[str] = None, pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": current_admin.get("company_id"), "decision": "selected"}
        if adminId:
            query["created_by"] = adminId
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
    
    # Get AI Calling interested candidates
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if adminId:
                jobs_query["admin_id"] = adminId
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"},
                "decision": {"$ne": "rejected"}
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling candidates for superadmin qualified: {e}")
        
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "selected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

@router.get("/api/superadmin/candidates/rejected")
@router.get("/superadmin/candidates/rejected")
def get_superadmin_rejected(adminId: Optional[str] = None, pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": current_admin.get("company_id"), "decision": "rejected"}
        if adminId:
            query["created_by"] = adminId
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
    
    # Get AI Calling rejected candidates
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if adminId:
                jobs_query["admin_id"] = adminId
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "decision": "rejected"
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling rejected candidates: {e}")
        
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "rejected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

@router.post("/api/superadmin/interview/create")
@router.post("/superadmin/interview/create")
def superadmin_interview_create(data: dict, background_tasks: BackgroundTasks, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    if "candidates" in data:
        try:
            bulk_data = BulkCreateSession(**data)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        return bulk_create_sessions(bulk_data, background_tasks, current_admin)
    else:
        try:
            single_data = CreateSession(**data)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        return create_session(single_data, current_admin)

@router.get("/api/superadmin/profile")
@router.get("/superadmin/profile")
def get_superadmin_profile(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])}, {"password": 0})
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Super Admin not found")
    admin_doc["id"] = str(admin_doc["_id"])
    admin_doc["_id"] = str(admin_doc["_id"])
    if admin_doc.get("company_id"):
        company = companies_collection.find_one({"_id": ObjectId(admin_doc["company_id"])})
        if company:
            admin_doc["company_name"] = company.get("name", "")
            if "credits" in company:
                admin_doc["credits"] = company["credits"]
    plan_context = get_admin_plan_context(admin_doc)
    admin_doc["is_expired"] = plan_context["is_expired"]
    admin_doc["subscription_plan_key"] = plan_context["plan_key"]
    return admin_doc

@router.delete("/api/superadmin/candidates/bulk")
@router.delete("/superadmin/candidates/bulk")
def superadmin_bulk_delete(data: BulkDeleteRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return bulk_delete_candidates(data, current_admin)

@router.post("/api/superadmin/export/excel")
@router.post("/superadmin/export/excel")
def superadmin_export_excel(data: ExportExcelRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return export_excel(data, current_admin)

@router.patch("/api/superadmin/credits/request/{request_id}")
@router.patch("/superadmin/credits/request/{request_id}")
def superadmin_patch_credit_request(request_id: str, data: UpdateCreditRequestSchema, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return update_credit_request_alias(request_id, data, current_admin)

@router.get("/api/superadmin/interview/{link_id}")
@router.get("/superadmin/interview/{link_id}")
def superadmin_get_interview_details(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """SuperAdmin alias for the interview detail endpoint — can access any session across all admins"""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    # Verify the session belongs to this super admin's company
    _get_authorized_live_session(link_id, current_admin)
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    company_id = current_admin.get("company_id")
    if company_id and session.get("company_id") and session.get("company_id") != company_id:
        raise HTTPException(status_code=403, detail="Access denied to this session")
    # Reuse the existing admin endpoint logic
    return get_interview_details(link_id, current_admin)


# -------------------------------------------------------------------------------------
# PREMIUM VOICE & INTERACTIVE CODING ROUND ENDPOINTS
# -------------------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field("nova", max_length=100)
    language: str = Field("English", max_length=100)
    voice_id: Optional[str] = Field(None, max_length=200)
    use_custom_voice: bool = True    # Flag to determine if Cartesia should be used

@router.get("/admin/voices")
def get_admin_voices(current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns available Cartesia custom voices configured in the backend .env file.
    Keys like CARTESIA_VOICE_ID and CARTESIA_VOICE_ID_MALE are loaded.
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    
    voices = []
    
    # Check for the default one
    default_voice_id = os.getenv("CARTESIA_VOICE_ID")
    if default_voice_id:
        voices.append({"name": "Default Voice", "id": default_voice_id})
        
    # Check for anything starting with CARTESIA_VOICE_ID_
    for key, value in os.environ.items():
        if key.startswith("CARTESIA_VOICE_ID_") and value:
            # e.g., CARTESIA_VOICE_ID_MALE -> "Male"
            name_part = key.replace("CARTESIA_VOICE_ID_", "").replace("_", " ").title()
            voices.append({"name": name_part, "id": value})
            
    return {"status": "success", "voices": voices}

@router.post("/voice-clone-instant")
async def voice_clone_instant(
    audio: UploadFile = File(...),
    voice_name: Optional[str] = "CandidateVoice",
    candidate_session: dict = Depends(require_active_candidate),
):
    """
    Cartesia Instant Voice Cloning endpoint.
    Accepts a short audio sample (webm/mp3/wav), sends it to Cartesia,
    and returns a temporary voice_id that can be used for the session's TTS calls.
    Requires CARTESIA_API_KEY in the .env file.
    """
    import asyncio
    try:
        from cartesia import Cartesia
    except ImportError:
        raise HTTPException(status_code=500, detail="Cartesia SDK not installed. Run `pip install cartesia`.")

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=False)


    api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Cartesia API key not configured. Voice cloning is unavailable.")

    allowed_audio_types = {
        "audio/webm",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/mp4",
        "application/octet-stream",
    }
    if audio.content_type not in allowed_audio_types:
        raise HTTPException(status_code=415, detail="Unsupported voice sample format")

    # Save the uploaded file to a private temporary location.
    ext = "webm"
    if audio.filename:
        ext = audio.filename.rsplit(".", 1)[-1].lower() if "." in audio.filename else "webm"
    temp_handle = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    temp_audio = temp_handle.name
    temp_handle.close()
    try:
        audio_bytes = await audio.read(10 * 1024 * 1024 + 1)
        if len(audio_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Voice sample exceeds 10 MB")
        if len(audio_bytes) < 1000:
            raise HTTPException(status_code=422, detail="Voice sample is too short")
        with open(temp_audio, "wb") as f:
            f.write(audio_bytes)

        def _do_clone():
            client = Cartesia(api_key=api_key)
            # Clone the voice from the clip; voices.clone() returns VoiceMetadata directly
            with open(temp_audio, "rb") as clip_file:
                new_voice = client.voices.clone(
                    clip=clip_file,
                    name=voice_name or "CandidateVoice",
                    language="en",
                    description="Auto-cloned from interview voice sample",
                )
            return new_voice

        new_voice_data = await asyncio.get_event_loop().run_in_executor(None, _do_clone)
        voice_id = new_voice_data.id
        
        if not voice_id:
            raise Exception("No voice ID returned from Cartesia.")

        interview_sessions_collection.update_one(
            {"_id": candidate_session["_id"]},
            {
                "$set": {
                    "cloned_voice_id": voice_id,
                    "cloned_voice_created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        print(f"[VoiceClone] Created Cartesia voice_id={voice_id}")
        return {"voice_id": voice_id, "status": "success"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[VoiceClone] Cartesia Error: {e}")
        raise HTTPException(status_code=500, detail=f"Cartesia error: {str(e)}")
    finally:
        if os.path.exists(temp_audio):
            os.remove(temp_audio)

@router.post("/tts")
async def generate_tts(
    req: TTSRequest,
    candidate_session: dict = Depends(require_active_candidate),
):
    """
    Hybrid TTS: Cartesia (primary) → Microsoft Edge TTS (fallback).

    Strategy:
    - Cartesia is used for English when CARTESIA_API_KEY + CARTESIA_VOICE_ID are set.
      The sonic model is used for the cloned voice.
    - Regional languages always route directly to
      the native Microsoft Edge TTS neural voice for that language.
    - If Cartesia quota is exceeded, the API key is missing, or any other error
      occurs, the system silently falls back to the free Microsoft Edge TTS voice.
    """
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=False)
    cartesia_api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    session_voice_id = str(candidate_session.get("cloned_voice_id") or "").strip()
    requested_voice_id = str(req.voice_id or "").strip()
    if requested_voice_id and not (
        session_voice_id and hmac.compare_digest(requested_voice_id, session_voice_id)
    ):
        raise HTTPException(status_code=403, detail="Voice ID does not belong to this interview session")
    # A per-session clone takes priority over the configured global voice.
    cartesia_voice_id = session_voice_id or os.getenv("CARTESIA_VOICE_ID", "").strip()

    from fastapi.responses import StreamingResponse
    import io

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Build Edge TTS regional voice map (used as fallback AND for regional languages)
    # ──────────────────────────────────────────────────────────────────────────
    base_edge_voice = "en-US-JennyNeural" if req.voice in ("shimmer", "nova") else "en-US-AriaNeural"
    edge_language_map = {
        "Hindi":     "hi-IN-SwaraNeural",
        "Telugu":    "te-IN-ShrutiNeural",
        "Tamil":     "ta-IN-PallaviNeural",
        "Malayalam": "ml-IN-SobhanaNeural",
        "Kannada":   "kn-IN-SapnaNeural",
        "English":   base_edge_voice,
    }
    requested_lang = req.language.title()
    edge_voice = edge_language_map.get(requested_lang, base_edge_voice)
    is_regional = requested_lang in edge_language_map and requested_lang != "English"

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Cartesia path — only for English when keys are configured
    # ──────────────────────────────────────────────────────────────────────────
    used_cartesia = False
    temp_filename = f"temp_tts_{uuid.uuid4().hex}.mp3"
    
    # Determine the actual voice ID to use
    actual_cartesia_voice_id = cartesia_voice_id

    if req.use_custom_voice and cartesia_api_key and actual_cartesia_voice_id and not is_regional:
        try:
            import asyncio
            from cartesia import Cartesia

            def _call_cartesia():
                client = Cartesia(api_key=cartesia_api_key)
                result = client.tts.generate(
                    model_id="sonic-2",
                    transcript=req.text,
                    voice={"mode": "id", "id": actual_cartesia_voice_id},
                    output_format={
                        "container": "mp3",
                        "encoding": "mp3",
                        "sample_rate": 44100,
                    },
                )
                return result.read()

            audio_bytes = await asyncio.get_event_loop().run_in_executor(None, _call_cartesia)

            if audio_bytes:
                print(f"[TTS] Cartesia: OK ({len(audio_bytes)} bytes) | voice={cartesia_voice_id}")
                return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")
            else:
                print(f"[TTS] Cartesia error: No audio returned. Falling back to Edge TTS.")

        except Exception as err:
            print(f"[TTS] Cartesia exception: {err}. Falling back to Edge TTS.")

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Edge TTS fallback 
    # ──────────────────────────────────────────────────────────────────────────
    try:
        print(f"[TTS] Using Microsoft Edge TTS | voice={edge_voice} | lang={requested_lang}")
        communicate = edge_tts.Communicate(req.text, edge_voice)
        
        async def edge_tts_stream():
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
                    
        return StreamingResponse(edge_tts_stream(), media_type="audio/mpeg")
    except Exception as edge_err:
        print(f"[TTS] Edge TTS Error: {edge_err}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {edge_err}")



stt_inflight_counter = 0

@router.post("/stt")
async def stt_endpoint(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    candidate_session: dict = Depends(require_active_candidate),
):
    """Transcribe audio via Groq Whisper with concurrency & rate limit tracking"""
    global stt_inflight_counter
    stt_inflight_counter += 1
    current_inflight = stt_inflight_counter
    req_id = uuid.uuid4().hex[:8]
    t0 = time.time()
    
    try:
        audio_content = await file.read(25 * 1024 * 1024 + 1)
        file_size = len(audio_content)
        if file_size > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Audio upload exceeds 25 MB")
        if file_size < 12_000:
            return {"transcript": ""}
        header_hex = audio_content[:16].hex() if file_size >= 16 else ""
        print(f"📊 [STT CONCURRENCY TRACE - REQ #{req_id}] Started | In-Flight Requests: {current_inflight} | File: {file.filename} ({file_size} bytes)")
        
        original_name = file.filename or "audio.webm"
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else "webm"
        if extension not in {"webm", "ogg", "mp4", "wav", "m4a", "mp3"}:
            extension = "webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as temp_file:
            temp_file.write(audio_content)
            temp_filename = temp_file.name
            
        try:
            with open(temp_filename, "rb") as f:
                iso_lang = language or "en"
                if iso_lang not in {"en", "hi", "te", "ta", "ml", "kn"}:
                    raise HTTPException(status_code=422, detail="Unsupported transcription language")
                sys_prompt = "The speaker has an Indian English accent. Transcribe technical terms, programming concepts, and software engineering terminology accurately." if iso_lang == "en" else ""
                
                transcript = await groq_client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=f,
                    language=iso_lang,
                    prompt=sys_prompt,
                    response_format="verbose_json",
                    temperature=0.0,
                )
                valid_segments = []
                for segment in getattr(transcript, "segments", []) or []:
                    no_speech = segment.get("no_speech_prob", 0) if isinstance(segment, dict) else getattr(segment, "no_speech_prob", 0)
                    avg_logprob = segment.get("avg_logprob", 0) if isinstance(segment, dict) else getattr(segment, "avg_logprob", 0)
                    compression = segment.get("compression_ratio", 0) if isinstance(segment, dict) else getattr(segment, "compression_ratio", 0)
                    segment_text = segment.get("text", "") if isinstance(segment, dict) else getattr(segment, "text", "")
                    if iso_lang == "en":
                        if no_speech > 0.45 or avg_logprob < -1.0 or compression > 2.4:
                            continue
                    elif no_speech > 0.75 or compression > 2.4:
                        continue
                    valid_segments.append(segment_text.strip())

                raw_text = str(getattr(transcript, "text", "") or "").strip()
                transcript_text = " ".join(value for value in valid_segments if value).strip()
                if not getattr(transcript, "segments", None):
                    transcript_text = raw_text
                if transcript_text.lower() in {
                    "thank you",
                    "thank you.",
                    "thanks",
                    "thanks.",
                    "okay",
                    "okay.",
                    "you",
                    "bye",
                    "bye.",
                }:
                    transcript_text = ""
                dur = round(time.time() - t0, 3)
                print(f"✅ [STT CONCURRENCY TRACE - REQ #{req_id}] HTTP 200 OK | Latency: {dur}s")
            return {"transcript": transcript_text}
        finally:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
    except Exception as e:
        dur = round(time.time() - t0, 3)
        err_str = str(e)
        status_code = getattr(e, 'status_code', 500)
        if "429" in err_str or status_code == 429 or "rate_limit" in err_str.lower():
            print(f"🚨 [STT RATE LIMIT EXCEEDED - REQ #{req_id}] HTTP 429 TOO MANY REQUESTS | Latency: {dur}s | Error: {err_str}")
            raise HTTPException(status_code=429, detail=f"Groq Rate Limit Exceeded: {err_str}")
        else:
            print(f"❌ [STT CONCURRENCY ERROR - REQ #{req_id}] HTTP {status_code} | Latency: {dur}s | Error: {err_str}")
            raise HTTPException(status_code=status_code, detail=err_str)
    finally:
        stt_inflight_counter = max(0, stt_inflight_counter - 1)

# ─── Omni Dimension AI Calling Endpoints ──────────────────────────────────────

@router.post("/api/calls/initiate/{session_id}")
async def initiate_ai_call(session_id: str, request: Request):
    """
    Initiates an outbound AI call via Omni Dimension for the given session.
    Expects a JSON body with an optional phone_number, if not already in DB.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    
    phone_number = body.get("phone_number")
    
    session_data = interview_sessions_collection.find_one({
        "$or": [{"id": session_id}, {"link_id": session_id}]
    })
    
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
        
    candidate_name = session_data.get("candidate_name", "Candidate")
    # If phone_number was not passed in body, try to get from session (if it exists)
    if not phone_number:
        phone_number = session_data.get("candidate_phone")
        
    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required to initiate an AI call")

    interview_id = session_data.get("interview_id")
    interview_data = interviews_collection.find_one({"id": interview_id})
    if not interview_data:
        raise HTTPException(status_code=404, detail="Interview template not found")

    job_description = interview_data.get("job_description", "")
    resume_text = session_data.get("parsed_resume", "")
    skills = ", ".join(interview_data.get("skills", []))
    duration = interview_data.get("duration", 30)

    try:
        from . import omni_dimension_client
        response = omni_dimension_client.start_omni_call(
            phone_number=phone_number,
            candidate_name=candidate_name,
            job_description=job_description,
            resume_text=resume_text,
            duration=duration,
            skills=skills
        )
        
        call_id = response.get("call_id") if isinstance(response, dict) else str(response)
        
        # Save call info to session
        interview_sessions_collection.update_one(
            {"_id": session_data["_id"]},
            {"$set": {
                "ai_call_id": call_id,
                "ai_call_status": "initiated",
                "candidate_phone": phone_number
            }}
        )
        return {"status": "success", "call_id": call_id, "message": f"AI Call initiated to {phone_number}"}
    except Exception as e:
        print(f"Error initiating AI call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ManualAICallRequest(BaseModel):
    phone_number: str
    candidate_name: Optional[str] = "Candidate"
    job_description: Optional[str] = ""
    resume_text: Optional[str] = ""
    duration: Optional[int] = 30
    skills: Optional[str] = ""

# (duplicate removed — see /api/calls/agent-settings below)

@router.post("/api/calls/initiate-manual")
async def initiate_manual_ai_call(
    phone_number: str = Form(...),
    candidate_name: Optional[str] = Form("Candidate"),
    job_description: Optional[str] = Form(""),
    duration: Optional[int] = Form(30),
    skills: Optional[str] = Form(""),
    job_id: Optional[str] = Form(None),
    application_id: Optional[str] = Form(None),
    resume: UploadFile = File(None)
):
    """
    Initiates an outbound AI call via Omni Dimension manually, without requiring an existing session.
    """
    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required")

    try:
        from . import omni_dimension_client
        from .services import extract_text_from_file
        
        resume_text = ""
        if resume and resume.filename:
            file_content = await resume.read()
            resume_text = extract_text_from_file(file_content, resume.filename)
        elif application_id:
            from bson import ObjectId
            import os
            try:
                app_doc = job_applications_collection.find_one({"_id": ObjectId(application_id)})
                if app_doc:
                    resume_text = app_doc.get("resume_text") or ""
                    if not resume_text and app_doc.get("resume_url"):
                        r_url = app_doc.get("resume_url")
                        if os.path.exists(r_url):
                            with open(r_url, "rb") as f:
                                resume_text = extract_text_from_file(f.read(), r_url)
                                if resume_text:
                                    job_applications_collection.update_one(
                                        {"_id": ObjectId(application_id)},
                                        {"$set": {"resume_text": resume_text}}
                                    )
            except Exception as e:
                print(f"Error loading resume in manual AI call: {e}")
            
        response = omni_dimension_client.start_omni_call(
            phone_number=phone_number,
            candidate_name=candidate_name,
            job_description=job_description,
            resume_text=resume_text,
            duration=duration,
            skills=skills
        )
        
        call_id = response.get("call_id") if isinstance(response, dict) else str(response)
        
        # Save to Omni call logs
        omni_call_logs_collection.insert_one({
            "call_id": call_id,
            "candidate_name": candidate_name,
            "phone_number": phone_number,
            "status": "initiated",
            "duration": "0m 0s",
            "recording_url": None,
            "job_id": job_id,
            "application_id": application_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Store calling data against the same application record
        app_doc = None
        if application_id:
            try:
                app_doc = job_applications_collection.find_one({"_id": ObjectId(application_id)})
            except Exception:
                pass
        
        if not app_doc and phone_number and job_id:
            app_doc = job_applications_collection.find_one({"job_id": job_id, "phone": phone_number})

        if app_doc:
            job_applications_collection.update_one(
                {"_id": app_doc["_id"]},
                {"$set": {
                    "job_id": job_id or app_doc.get("job_id"),
                    "application_id": str(app_doc["_id"]),
                    "resume_text": resume_text or app_doc.get("resume_text", ""),
                    "job_description": job_description or app_doc.get("job_description", ""),
                    "call_status": "initiated",
                    "omni_call_id": call_id,
                    "omni_call_details": {
                        "call_id": call_id,
                        "phone_number": phone_number,
                        "candidate_name": candidate_name,
                        "duration": "0m 0s",
                        "recording_url": None,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                }}
            )
        else:
            if job_id:
                new_app = {
                    "job_id": job_id,
                    "name": candidate_name,
                    "phone": phone_number,
                    "email": "",
                    "resume_url": "",
                    "linkedin_url": "",
                    "cover_letter": "",
                    "status": "Pending Review",
                    "applied_at": datetime.now(timezone.utc).isoformat(),
                    "resume_text": resume_text,
                    "job_description": job_description,
                    "call_status": "initiated",
                    "omni_call_id": call_id,
                    "omni_call_details": {
                        "call_id": call_id,
                        "phone_number": phone_number,
                        "candidate_name": candidate_name,
                        "duration": "0m 0s",
                        "recording_url": None,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                }
                res = job_applications_collection.insert_one(new_app)
                job_applications_collection.update_one(
                    {"_id": res.inserted_id},
                    {"$set": {"application_id": str(res.inserted_id)}}
                )
        
        return {"status": "success", "call_id": call_id, "message": f"Manual AI Call initiated to {phone_number}"}
    except Exception as e:
        print(f"Error initiating manual AI call: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Omni Dimension Agent Data Routes ─────────────────────────────────────────

@router.get("/api/calls/agent-settings")
def get_omni_agent_settings(omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    """Fetch the Omni Dimension Agent settings."""
    from .omni_dimension_client import get_omni_account
    try:
        _, agent, _ = get_omni_account(omni_api_key)
        return {"settings": agent}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Failed to fetch agent settings: {str(e)}"})


@router.get("/api/calls/knowledge-base")
def get_omni_knowledge_base(omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    """Fetch the Knowledge Base files from Omni Dimension."""
    from .omni_dimension_client import get_omni_client
    try:
        client = get_omni_client(omni_api_key)
        res = client.knowledge_base.list()
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        files = data.get("files", []) if isinstance(data, dict) else []
        return {"files": files, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/integrations")
def get_omni_integrations(omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    """Fetch integrations for the agent from Omni Dimension."""
    from .omni_dimension_client import get_omni_account
    try:
        client, _, agent_id = get_omni_account(omni_api_key)
        res = client.integrations.get_agent_integrations(agent_id=agent_id)
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        integrations = data.get("integrations", []) if isinstance(data, dict) else []
        return {"integrations": integrations, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/integrations/user")
def get_user_integrations(omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    from .omni_dimension_client import get_omni_client
    try:
        client = get_omni_client(omni_api_key)
        res = client.integrations.get_user_integrations()
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        return {"integrations": data.get("integrations", []) if isinstance(data, dict) else [], "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

class CalendlyIntegrationRequest(BaseModel):
    name: str
    cal_api_key: str
    cal_id: str
    cal_timezone: str
    description: Optional[str] = ""

@router.post("/api/calls/integrations/calendly")
def create_calendly_integration(req: CalendlyIntegrationRequest, omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    from .omni_dimension_client import get_omni_account
    try:
        client, _, agent_id = get_omni_account(omni_api_key)
        res = client.integrations.create_cal_integration(
            name=req.name,
            cal_api_key=req.cal_api_key,
            cal_id=req.cal_id,
            cal_timezone=req.cal_timezone,
            description=req.description
        )
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        
        integration_data = data.get("integration", data) if isinstance(data, dict) else data
        integration_id = integration_data.get("id") if isinstance(integration_data, dict) else getattr(integration_data, "id", None)
        
        if integration_id:
            client.integrations.add_integration_to_agent(agent_id=agent_id, integration_id=integration_id)
            
        return {"success": True, "integration": integration_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

class CustomApiIntegrationRequest(BaseModel):
    name: str
    url: str
    method: str
    description: Optional[str] = ""
    headers: Optional[dict] = None
    body_type: Optional[str] = None
    body_content: Optional[dict] = None
    body_params: Optional[dict] = None
    query_params: Optional[dict] = None
    stop_listening: Optional[bool] = False
    request_timeout: Optional[int] = 10

@router.post("/api/calls/integrations/custom-api")
def create_custom_api_integration(req: CustomApiIntegrationRequest, omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    from .omni_dimension_client import get_omni_account
    try:
        client, _, agent_id = get_omni_account(omni_api_key)
        res = client.integrations.create_custom_api_integration(
            name=req.name,
            url=req.url,
            method=req.method,
            description=req.description,
            headers=req.headers,
            body_type=req.body_type,
            body_content=req.body_content,
            body_params=req.body_params,
            query_params=req.query_params,
            stop_listening=req.stop_listening,
            request_timeout=req.request_timeout
        )
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        
        integration_data = data.get("integration", data) if isinstance(data, dict) else data
        integration_id = integration_data.get("id") if isinstance(integration_data, dict) else getattr(integration_data, "id", None)
        
        if integration_id:
            client.integrations.add_integration_to_agent(agent_id=agent_id, integration_id=integration_id)
            
        return {"success": True, "integration": integration_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

class DetachIntegrationRequest(BaseModel):
    integration_id: int

@router.post("/api/calls/integrations/detach")
def detach_integration(req: DetachIntegrationRequest, omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    from .omni_dimension_client import get_omni_account
    try:
        client, _, agent_id = get_omni_account(omni_api_key)
        client.integrations.remove_integration_from_agent(agent_id=agent_id, integration_id=req.integration_id)
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/call-config")
def get_omni_call_config(omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    """Fetch call configuration from agent settings."""
    from .omni_dimension_client import get_omni_account
    try:
        _, agent, _ = get_omni_account(omni_api_key)
        config = {
            "silence_timeout": agent.get("silence_timeout"),
            "speech_speed": agent.get("speech_speed"),
            "max_call_duration_in_sec": agent.get("max_call_duration_in_sec"),
            "is_end_call_enabled": agent.get("is_end_call_enabled"),
            "end_call_condition": agent.get("end_call_condition"),
            "end_call_message": agent.get("end_call_message"),
            "voicemail_enabled": agent.get("voicemail_enabled"),
            "voicemail_message": agent.get("voicemail_message"),
            "background_noise_enabled": agent.get("background_noise_enabled"),
            "background_noice_name": agent.get("background_noice_name"),
            "background_audio_volume": agent.get("background_audio_volume"),
            "initial_ringing_sound_enabled": agent.get("initial_ringing_sound_enabled"),
            "is_transfer_enabled": agent.get("is_transfer_enabled"),
            "first_ideal_message": agent.get("first_ideal_message"),
            "second_ideal_message": agent.get("second_ideal_message"),
            "last_ideal_message": agent.get("last_ideal_message"),
            "user_idle_threshold_sec": agent.get("user_idle_threshold_sec"),
            "min_speech_duration_ms": agent.get("min_speech_duration_ms"),
        }
        return {"config": config, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/post-call-config")
def get_omni_post_call_config():
    """Fetch post-call configuration from agent settings."""
    from .omni_dimension_client import get_omni_client, get_omni_agent_id
    try:
        client = get_omni_client()
        agent_id = int(get_omni_agent_id()) if get_omni_agent_id() else 1
        res = client.agent.list()
        bots = res.get('json', {}).get('bots', [])
        agent = next((b for b in bots if b.get('id') == agent_id), bots[0] if bots else {})
        post_call = agent.get("post_call_config_ids", [])
        return {"post_call_configs": post_call, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/recent-calls")
def get_omni_recent_calls():
    """Fetch recent call logs directly from Omni Dimension SDK, including all evaluation scores."""
    from .omni_dimension_client import get_omni_client, get_omni_agent_id
    try:
        client = get_omni_client()
        agent_id_value = get_omni_agent_id()
        agent_id = int(agent_id_value) if agent_id_value else None
        res = client.call.get_call_logs(agent_id=agent_id, page_size=50)
        # SDK always returns {"status": <int>, "json": <dict>}
        data = res.get('json', res) if isinstance(res, dict) else {}
        # Try all known keys the Omni Dimension API may use for the calls list
        calls = (
            data.get("calls")
            or data.get("call_log_data")
            or data.get("call_logs")
            or data.get("data")
            or data.get("results")
            or []
        )
        if not isinstance(calls, list):
            calls = []
        # Normalise each call record to extract evaluation / score fields
        normalised = []
        for c in calls:
            if not isinstance(c, dict):
                continue
            rec = dict(c)
            # Pull evaluation sub-object if present
            ev = rec.get("evaluation") or {}
            # Flatten evaluation fields to top-level for easy frontend access
            rec["sentiment_score"]            = ev.get("sentiment_score")            or rec.get("sentiment_score")
            rec["sentiment_analysis_details"] = ev.get("sentiment_analysis_details") or rec.get("sentiment_analysis_details")
            rec["cqs_score"]                  = ev.get("cqs_score")                  or rec.get("cqs_score")
            rec["cqs_score_message"]          = ev.get("cqs_score_message")          or rec.get("cqs_score_message")
            rec["metric_score_intent"]        = ev.get("metric_score_intent")        or rec.get("metric_score_intent")
            rec["metric_score_relevance"]     = ev.get("metric_score_relevance")     or rec.get("metric_score_relevance")
            rec["metric_score_latency"]       = ev.get("metric_score_latency")       or rec.get("metric_score_latency")
            rec["metric_score_coherence"]     = ev.get("metric_score_coherence")     or rec.get("metric_score_coherence")
            rec["p50_latency"]                = rec.get("p50_latency")
            rec["p99_latency"]                = rec.get("p99_latency")
            normalised.append(rec)
            
        return {"calls": normalised, "success": True, "total": len(normalised)}
    except Exception as e:
        import traceback
        print(f"[recent-calls ERROR] {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": str(e)})

# ──────────────────────────────────────────────────────────────────────────────

@router.get("/api/calls/logs/{call_id}")
def get_omni_call_log_details(call_id: str):
    """
    Fetches the detailed log for a specific call directly from Omni Dimension.
    """
    from . import omni_dimension_client
    try:
        response = omni_dimension_client.get_omni_call_status(call_id)
        if response and response.get('json') and response['json'].get('call_log_data'):
            log_data = response['json']['call_log_data'][0]
            
            # Flatten evaluation fields for the call itself
            ev = log_data.get("evaluation") or {}
            log_data["sentiment_score"]            = ev.get("sentiment_score")            or log_data.get("sentiment_score")
            log_data["sentiment_analysis_details"] = ev.get("sentiment_analysis_details") or log_data.get("sentiment_analysis_details")
            log_data["cqs_score"]                  = ev.get("cqs_score")                  or log_data.get("cqs_score")
            log_data["cqs_score_message"]          = ev.get("cqs_score_message")          or log_data.get("cqs_score_message")
            
            # Flatten interaction evaluation scores
            if "interactions" in log_data and isinstance(log_data["interactions"], list):
                for interaction in log_data["interactions"]:
                    int_ev = interaction.get("evaluation") or {}
                    interaction["metric_score_intent"]    = int_ev.get("metric_score_intent")    or interaction.get("metric_score_intent")
                    interaction["metric_score_relevance"] = int_ev.get("metric_score_relevance") or interaction.get("metric_score_relevance")
                    interaction["metric_score_latency"]   = int_ev.get("metric_score_latency")   or interaction.get("metric_score_latency")
                    interaction["metric_score_coherence"] = int_ev.get("metric_score_coherence") or interaction.get("metric_score_coherence")
            
            return {"log": log_data}
        raise HTTPException(status_code=404, detail="Call log details not found in Omni Dimension.")
    except Exception as e:
        print(f"Error fetching detailed call log {call_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def sync_call_status_helper(call_id: str, app_id: str = None):
    """
    Synchronizes call details from OmniDimension for a specific call_id.
    Updates the log in omni_call_logs and the corresponding application in job_applications.
    """
    from bson import ObjectId
    try:
        from . import omni_dimension_client
        status_response = omni_dimension_client.get_omni_call_status(str(call_id))
        if status_response and "call_logs" in status_response and status_response["call_logs"]:
            call_log_data = status_response["call_logs"][0]
            
            new_status = call_log_data.get("call_status", "initiated")
            duration_sec = call_log_data.get("duration_in_sec", 0)
            mins, secs = divmod(duration_sec, 60)
            duration_str = f"{mins}m {secs}s"
            recording_url = call_log_data.get("recording_url")
            
            # Extract evaluation, score, interest, transcript
            ev = call_log_data.get("evaluation") or {}
            score = ev.get("cqs_score") or call_log_data.get("cqs_score") or 0
            
            # Interest sentiment details or sentiment score
            interest = ev.get("sentiment_analysis_details") or ev.get("sentiment_score") or call_log_data.get("interest") or ""
            if not interest:
                interest = ev.get("summary") or ""
            
            # Transcript reconstruction
            transcript_list = []
            if "interactions" in call_log_data and isinstance(call_log_data["interactions"], list):
                interactions = call_log_data["interactions"]
                for interaction in interactions:
                    speaker = interaction.get("speaker", "Bot")
                    text = interaction.get("text", "")
                    if text:
                        transcript_list.append(f"{speaker}: {text}")
                        # Update interactions scores
                        int_ev = interaction.get("evaluation") or {}
                        interaction["metric_score_intent"]    = int_ev.get("metric_score_intent")    or interaction.get("metric_score_intent")
                        interaction["metric_score_relevance"] = int_ev.get("metric_score_relevance") or interaction.get("metric_score_relevance")
                        interaction["metric_score_latency"]   = int_ev.get("metric_score_latency")   or interaction.get("metric_score_latency")
                        interaction["metric_score_coherence"] = int_ev.get("metric_score_coherence") or interaction.get("metric_score_coherence")
            
            transcript_str = "\n".join(transcript_list)
            
            # Update call log
            log_fields = {
                "status": new_status,
                "duration": duration_str,
                "recording_url": recording_url,
                "cqs_score": score,
                "interest": interest,
                "transcript": transcript_str
            }
            if "interactions" in call_log_data:
                log_fields["interactions"] = call_log_data["interactions"]
                
            omni_call_logs_collection.update_one(
                {"call_id": call_id},
                {"$set": log_fields}
            )
            
            # Find the corresponding application document to update
            app_doc = None
            if app_id:
                try:
                    app_doc = job_applications_collection.find_one({"_id": ObjectId(app_id)})
                except Exception:
                    pass
            if not app_doc:
                app_doc = job_applications_collection.find_one({"omni_call_id": call_id})
            if not app_doc:
                phone_number = call_log_data.get("phone_number")
                if phone_number:
                    call_log = omni_call_logs_collection.find_one({"call_id": call_id})
                    if call_log and call_log.get("job_id"):
                        app_doc = job_applications_collection.find_one({
                            "job_id": call_log["job_id"], 
                            "phone": phone_number
                        })
            
            if app_doc:
                job_applications_collection.update_one(
                    {"_id": app_doc["_id"]},
                    {"$set": {
                        "call_status": new_status,
                        "interest": interest,
                        "score": score,
                        "transcript": transcript_str,
                        "omni_call_details": {
                            "call_id": call_id,
                            "phone_number": call_log_data.get("phone_number", app_doc.get("phone")),
                            "candidate_name": app_doc.get("name"),
                            "duration": duration_str,
                            "recording_url": recording_url,
                            "cqs_score": score,
                            "interest": interest,
                            "interactions": call_log_data.get("interactions", []),
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                    }}
                )
            return True
    except Exception as e:
        print(f"Error in sync_call_status_helper for call_id {call_id}: {e}")
    return False

@router.get("/api/calls/logs")
def get_omni_call_logs():
    """
    Fetches all omni dimension call logs, updating pending calls with live data.
    """
    try:
        logs = list(omni_call_logs_collection.find().sort("created_at", -1))
        for log in logs:
            status = log.get("status", "").lower()
            if status not in ["completed", "failed", "no answer", "canceled"]:
                call_id = log.get("call_id")
                app_id = log.get("application_id")
                if call_id:
                    sync_call_status_helper(str(call_id), app_id)
            
        logs = list(omni_call_logs_collection.find().sort("created_at", -1))
        for log in logs:
            log["_id"] = str(log["_id"])
            
        return {"status": "success", "logs": logs}
    except Exception as e:
        print(f"Error fetching call logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/status/{session_id}")
def check_ai_call_status(session_id: str):
    """
    Checks the status of the AI call for a given session.
    """
    session_data = interview_sessions_collection.find_one({
        "$or": [{"id": session_id}, {"link_id": session_id}]
    })
    
    if not session_data or not session_data.get("ai_call_id"):
        raise HTTPException(status_code=404, detail="AI call not found for this session")

    call_id = session_data["ai_call_id"]
    try:
        from . import omni_dimension_client
        status_response = omni_dimension_client.get_omni_call_status(call_id)
        
        # Update session with latest status if needed
        # status_response could contain duration, recording link, etc.
        
        return {"status": "success", "data": status_response}
    except Exception as e:
        print(f"Error checking AI call status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/interested-candidates")
def get_interested_candidates(current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns all applications from job_applications_collection marked as interested from AI calling.
    For admin, filters by job owner.
    """
    try:
        query = {}
        if current_admin["role"] == "admin":
            # get all jobs owned by admin
            jobs = list(jobs_collection.find({"admin_id": current_admin["admin_id"]}))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            query["job_id"] = {"$in": job_ids}
            
        # We want applications where call_status is completed and interest is "Interested" (case-insensitive regex)
        query["interest"] = {"$regex": "interested", "$options": "i"}
        
        apps = list(job_applications_collection.find(query).sort("applied_at", -1))
        
        from .services import extract_text_from_file
        from bson import ObjectId
        import os
        
        updated_apps = []
        for a in apps:
            a["_id"] = str(a["_id"])
            if not a.get("resume_text") and a.get("resume_url"):
                r_url = a.get("resume_url")
                if os.path.exists(r_url):
                    try:
                        with open(r_url, "rb") as f:
                            text = extract_text_from_file(f.read(), r_url)
                            if text:
                                a["resume_text"] = text
                                job_applications_collection.update_one(
                                    {"_id": ObjectId(a["_id"])},
                                    {"$set": {"resume_text": text}}
                                )
                    except Exception as parse_err:
                        print(f"Failed to parse stored resume {r_url}: {parse_err}")
            updated_apps.append(a)
            
        return {"status": "success", "candidates": updated_apps}
    except Exception as e:
        print(f"Error fetching interested candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CodingChatRequest(BaseModel):
    interview_id: str
    transcript: str
    code: str
    run_result: Optional[Dict[str, Any]] = None

@router.post("/coding-round/chat")
async def coding_round_chat(
    req: CodingChatRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Provide conversational AI responses during the coding round"""
    _require_candidate_session(credentials, interview_id=req.interview_id)
    try:
        # Load interview context
        interview = get_interview_or_404(req.interview_id)
        task = interview.get("coding_round", {}).get("task", {})
        problem_title = task.get("title", "the given problem")
        problem_desc  = task.get("description", "")
        constraints   = task.get("constraints", "")

        # ── Build run-result context ──────────────────────────────────────
        run_context = ""
        rr = req.run_result
        if rr:
            if rr.get("runtime_error"):
                run_context = f"""
## Last Run Result: EXECUTION ERROR
Error message: {rr['runtime_error']}
All test cases failed due to this error."""
            else:
                visible = rr.get("visible_results", [])
                hidden  = rr.get("hidden_summary", {})
                passed_v = sum(1 for r in visible if r.get("passed"))
                total_v  = len(visible)
                passed_h = hidden.get("passed", 0)
                total_h  = hidden.get("total", 0)
                all_passed = rr.get("all_passed", False)

                failed_cases = [r for r in visible if not r.get("passed")]
                failed_details = ""
                for fc in failed_cases[:2]:   # Show max 2 failing examples
                    failed_details += f"  - Input: {fc.get('input')} | Got: {fc.get('output')} | Expected: {fc.get('expected')}\n"

                run_context = f"""
## Last Run Result
- Visible tests passed: {passed_v}/{total_v}
- Hidden tests passed:  {passed_h}/{total_h}
- Overall: {'ALL PASSED ✓' if all_passed else 'SOME FAILED ✗'}"""
                if failed_details:
                    run_context += f"\n- Failing examples:\n{failed_details}"

        # ── Build the system prompt ───────────────────────────────────────
        prompt = f"""You are Zara, a sharp but friendly AI coding interviewer at HireIQ.
You are conducting a live technical coding interview.

## Problem
Title: {problem_title}
Description: {problem_desc}
Constraints: {constraints}

## Candidate's Current Code
```
{req.code}
```
{run_context}

## Candidate Just Said
"{req.transcript}"

## Your Role as Zara
You must respond in 2-3 conversational sentences. Follow these rules strictly:
1. NEVER give full code solutions or write code for the candidate.
2. Ask probing questions about their implementation — "Why did you choose this data structure?", "What happens if the input is empty?", "Can you trace through your logic with this input?"
3. If there is a runtime error, guide them to the likely cause with a hint (not the fix).
4. If some test cases fail, point to a specific failing case and ask what they think is wrong.
5. If all tests pass, ask about time complexity, space complexity, or edge cases they haven't considered.
6. If they explain an approach, acknowledge it and ask a follow-up: "And how does that handle duplicates?" or "What's the worst-case here?"
7. If they seem stuck, give a targeted hint without revealing the solution.
8. Be encouraging — use phrases like "Good thinking!", "You're on the right track.", "Interesting approach."
9. Keep the conversation going — always end with a question or a call to action."""

        reply = await asyncio.to_thread(
            chat_completion,
            [{"role": "system", "content": prompt}],
            model="openai/gpt-4o-mini"
        )
        return {"reply": reply}
    except Exception as e:
        print(f"Coding Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ---------------------------------------------------------------------------
# Omni Dimension AI Calling Endpoints
# ---------------------------------------------------------------------------

class StartAICallRequest(BaseModel):
    phone_number: str

@router.post("/api/calls/start/{link_id}")
def start_ai_call(link_id: str, data: StartAICallRequest, current_admin: dict = Depends(get_current_admin_details)):
    # Find the candidate session
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Candidate session not found.")
    
    # Save the phone number if provided
    if data.phone_number:
        interview_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {"candidate_phone": data.phone_number}}
        )
    
    # Check if a call is already in progress
    if session.get("omni_call_id") and session.get("omni_call_status") not in ["completed", "failed"]:
        # We might want to check the actual status via API, but for now just prevent duplicates
        pass 
        
    try:
        # Start the call via Omni Dimension
        cq = session.get("custom_questions")
        if isinstance(cq, list):
            skills_str = ", ".join(cq)
        elif isinstance(cq, str):
            skills_str = ", ".join([q.strip() for q in cq.split('\n') if q.strip()])
        else:
            skills_str = ""

        response = omni_dimension_client.start_omni_call(
            phone_number=data.phone_number,
            candidate_name=session.get("candidate_name", ""),
            job_description=session.get("job_description", ""),
            resume_text=session.get("resume_text", ""),
            duration=session.get("interview_duration", 15),
            skills=skills_str
        )
        
        call_id = response.get("id") if hasattr(response, "get") else response.id
        
        # Update session with call metadata
        interview_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {
                "omni_call_id": call_id,
                "omni_call_status": "initiated"
            }}
        )
        
        return {"status": "success", "call_id": call_id}
        
    except Exception as e:
        print(f"Error starting AI call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/status/{link_id}")
def get_ai_call_status(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Candidate session not found.")
        
    call_id = session.get("omni_call_id")
    if not call_id:
        return {"status": "success", "call_status": "no_call"}
        
    try:
        # Fetch status from Omni Dimension
        response = omni_dimension_client.get_omni_call_status(call_id)
        
        call_status = response.get("status") if hasattr(response, "get") else response.status
        
        # Update MongoDB if status changed
        if call_status and call_status != session.get("omni_call_status"):
            update_data = {"omni_call_status": call_status}
            
            # If completed, we should also save the transcript/summary
            if call_status == "completed":
                transcript = response.get("transcript") if hasattr(response, "get") else getattr(response, "transcript", None)
                summary = response.get("summary") if hasattr(response, "get") else getattr(response, "summary", None)
                if transcript:
                    update_data["omni_call_transcript"] = transcript
                if summary:
                    update_data["omni_call_summary"] = summary
            
            interview_sessions_collection.update_one(
                {"_id": session["_id"]},
                {"$set": update_data}
            )
            
        return {"status": "success", "call_status": call_status, "data": response}
        
    except Exception as e:
        print(f"Error checking AI call status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Jobs & Applications (Super Admin / Public)
# ---------------------------------------------------------------------------

@router.post("/api/jobs")
def create_job(job: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    job_dict = job.dict()
    import random
    import string
    job_id = f"JOB-{''.join(random.choices(string.ascii_uppercase + string.digits, k=6))}"
    job_dict["job_id"] = job_id
    job_dict["admin_id"] = current_admin["admin_id"]
    job_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    job_dict["application_count"] = 0
    job_dict["custom_id"] = get_next_sequence_value("job", "JOB")
    result = jobs_collection.insert_one(job_dict)
    job_dict["_id"] = str(result.inserted_id)
    return {"status": "success", "job": job_dict}

@router.get("/api/jobs")
def get_admin_jobs(page: int = 1, limit: int = 20, current_admin: dict = Depends(get_current_admin_details)):
    # Validate and clamp pagination parameters
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    # Return jobs with pagination
    skip = (page - 1) * limit
    query = {}
    if current_admin["role"] == "admin":
        query = {"admin_id": current_admin["admin_id"]}
    total_jobs = jobs_collection.count_documents(query)
    jobs = list(jobs_collection.find(query).sort("created_at", -1).skip(skip).limit(limit))
    for j in jobs:
        j["_id"] = str(j["_id"])
    return {
        "status": "success", 
        "jobs": jobs,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_jobs": total_jobs,
            "total_pages": (total_jobs + limit - 1) // limit if limit > 0 else 1
        }
    }

@router.put("/api/jobs/{job_id}")
def update_job(job_id: str, job_update: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_admin["role"] == "admin" and job.get("admin_id") != current_admin["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = job_update.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = jobs_collection.update_one({"job_id": job_id}, {"$set": update_data})
    if result.matched_count == 0:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            result = jobs_collection.update_one({"_id": ObjectId(job_id)}, {"$set": update_data})
    return {"status": "success", "message": "Job updated"}

@router.delete("/api/jobs/{job_id}")
def delete_job(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_admin["role"] == "admin" and job.get("admin_id") != current_admin["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    result = jobs_collection.delete_one({"job_id": job_id})
    if result.deleted_count == 0:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            result = jobs_collection.delete_one({"_id": ObjectId(job_id)})
    return {"status": "success", "message": "Job deleted"}

@router.get("/api/public/jobs/{job_id}")
def get_public_job(job_id: str):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["_id"] = str(job["_id"])
    return {"status": "success", "job": job}

from fastapi import File, UploadFile, Form

@router.post("/api/public/jobs/{job_id}/apply")
def apply_for_job(job_id: str, application: JobApplicationCreate):
    """
    Accept a job application submitted as JSON by the public-facing form.
    Validates the job exists, persists the application, and increments
    the job's application_count atomically.
    """
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    actual_job_id = job.get("job_id") or str(job["_id"])
    app_dict = {
        "job_id": actual_job_id,
        "job_title": job.get("title"),
        "name": application.name,
        "email": application.email,
        "phone": application.phone,
        "resume_url": application.resume_url,
        "linkedin_url": application.linkedin_url,
        "cover_letter": application.cover_letter,
        "status": "Pending Review",
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }

    result = job_applications_collection.insert_one(app_dict)
    # Atomically increment application_count on the parent job
    jobs_collection.update_one(
        {"_id": job["_id"]},
        {"$inc": {"application_count": 1}},
    )
    print(f"[JobApply] New application for job_id={actual_job_id} by {application.email}, _id={result.inserted_id}")
    return {"status": "success", "message": "Application submitted successfully", "application_id": str(result.inserted_id)}

@router.get("/api/jobs/{job_id}/applications")
def get_job_applications(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns all applications submitted for a given job_id.
    Super-admins can view applications for any job; admins only for their own jobs.
    """
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Admins can only see applications for jobs they own (stored as admin_id since last fix)
    if current_admin["role"] == "admin" and job.get("admin_id") != current_admin["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    actual_job_id = job.get("job_id") or str(job["_id"])
    applications = list(job_applications_collection.find({"job_id": actual_job_id}).sort("applied_at", -1))
    
    # Sync active calls
    for a in applications:
        call_status = (a.get("call_status") or "").lower()
        call_id = a.get("omni_call_id")
        if call_id and call_status and call_status not in ["completed", "failed", "no answer", "canceled"]:
            try:
                sync_call_status_helper(str(call_id), str(a["_id"]))
            except Exception as e:
                print(f"Failed to sync active call {call_id}: {e}")
                
    # Re-fetch after syncing to get fresh data
    applications = list(job_applications_collection.find({"job_id": actual_job_id}).sort("applied_at", -1))
    
    from .services import extract_text_from_file
    import os
    from bson import ObjectId
    
    for a in applications:
        a["_id"] = str(a["_id"])
        if not a.get("resume_text") and a.get("resume_url"):
            r_url = a.get("resume_url")
            if os.path.exists(r_url):
                try:
                    with open(r_url, "rb") as f:
                        text = extract_text_from_file(f.read(), r_url)
                        if text:
                            a["resume_text"] = text
                            job_applications_collection.update_one(
                                {"_id": ObjectId(a["_id"])},
                                {"$set": {"resume_text": text}}
                            )
                except Exception as parse_err:
                    print(f"Failed to parse stored resume {r_url}: {parse_err}")
                    
    return {"status": "success", "applications": applications, "total": len(applications)}

@router.patch("/api/jobs/{job_id}/applications/{app_id}/status")
def update_application_status(
    job_id: str,
    app_id: str,
    payload: dict,
    current_admin: dict = Depends(get_current_admin_details)
):
    """Update the status of a specific job application."""
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if current_admin["role"] == "admin" and job.get("admin_id") != current_admin["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied")

    from bson import ObjectId as BsonObjectId
    new_status = payload.get("status", "").strip()
    allowed = {"Pending Review", "Shortlisted", "Interview Scheduled", "Rejected", "Hired"}
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")
    try:
        oid = BsonObjectId(app_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid application id")

    app = job_applications_collection.find_one({"_id": oid})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    actual_job_id = job.get("job_id") or str(job["_id"])
    if app.get("job_id") != actual_job_id:
        raise HTTPException(status_code=400, detail="Application does not belong to this job")

    result = job_applications_collection.update_one(
        {"_id": oid},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"status": "success", "message": f"Status updated to '{new_status}'"}

import pypdf
import io

@router.post("/api/public/jobs/parse-resume")
def parse_resume(resume: UploadFile = File(...)):
    try:
        allowed_types = {
            "application/pdf",
            "text/plain",
        }
        if resume.content_type and resume.content_type not in allowed_types:
            raise HTTPException(status_code=415, detail="Only PDF and plain-text resumes are supported")
        if getattr(resume, "size", 0) and resume.size > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Resume exceeds the 5 MB limit")

        # Read the file content
        content = resume.file.read(5 * 1024 * 1024 + 1)
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Resume exceeds the 5 MB limit")
        
        # We'll just handle PDFs for now as an example, but we can easily extend this
        extracted_text = ""
        if resume.filename.lower().endswith(".pdf"):
            pdf_reader = pypdf.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                extracted_text += page.extract_text() + "\n"
        else:
            # If not PDF, just decode assuming txt or string (we can add docx later if needed)
            # Or just take a best effort for other text-based
            try:
                extracted_text = content.decode('utf-8', errors='ignore')
            except:
                extracted_text = ""

        if not extracted_text.strip():
             return {"status": "success", "data": {"name": "", "email": "", "phone": "", "linkedin_url": ""}}

        # Ensure text is not insanely large for the LLM context (truncate if necessary)
        extracted_text = extracted_text[:10000]

        prompt = f"""
        Extract the following information from the provided resume text. 
        Format the output strictly as JSON with keys: "name", "email", "phone", "linkedin_url".
        If a field is not found, leave it as an empty string. Do not include markdown formatting or comments.
        
        Resume Text:
        {extracted_text}
        """
        
        raw_response = chat_completion([{"role": "user", "content": prompt}])
        parsed_data = extract_json(raw_response) or {}
        
        return {
            "status": "success", 
            "data": {
                "name": parsed_data.get("name", ""),
                "email": parsed_data.get("email", ""),
                "phone": parsed_data.get("phone", ""),
                "linkedin_url": parsed_data.get("linkedin_url", "")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error parsing resume: {e}")
        return {"status": "error", "data": {"name": "", "email": "", "phone": "", "linkedin_url": ""}}

# ---------------------------------------------------------------------------
# Demo Requests
# ---------------------------------------------------------------------------
from app.models import DemoRequestCreate, DemoRequestUpdate
from mongo_db import demo_requests_collection
from bson import ObjectId
from datetime import datetime

@router.post('/demo-request')
def create_demo_request(req: DemoRequestCreate):
    try:
        new_request = {
            'first_name': req.first_name,
            'last_name': req.last_name,
            'work_email': req.work_email,
            'mobile_number': req.mobile_number,
            'company_name': req.company_name,
            'help_text': req.help_text,
            'status': 'NEW',
            'created_at': datetime.utcnow().isoformat()
        }
        result = demo_requests_collection.insert_one(new_request)

        # Send email notification to master
        brevo_key = os.getenv("BREVO_API_KEY")
        master_email = os.getenv("MASTER_EMAIL", os.getenv("BREVO_SENDER_EMAIL", "support@hireiq.com"))
        if brevo_key and master_email:
            try:
                import requests
                email_html = f"""
                <html><body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #4f46e5;">New Demo Request</h2>
                    <p><b>Name:</b> {req.first_name} {req.last_name}</p>
                    <p><b>Company:</b> {req.company_name}</p>
                    <p><b>Email:</b> {req.work_email}</p>
                    <p><b>Mobile:</b> {req.mobile_number}</p>
                    <p><b>Message:</b><br>{req.help_text}</p>
                </body></html>
                """
                requests.post("https://api.brevo.com/v3/smtp/email", json={
                    "sender": {"name": "Hire IQ Alerts", "email": master_email},
                    "to": [{"email": master_email, "name": "Hire IQ Admin"}],
                    "subject": f"New Demo Request from {req.company_name}",
                    "htmlContent": email_html
                }, headers={"api-key": brevo_key, "content-type": "application/json"}, timeout=5)
            except Exception as email_err:
                print(f'Error sending demo request email: {email_err}')

        return {'status': 'success', 'id': str(result.inserted_id)}
    except Exception as e:
        print(f'Error saving demo request: {e}')
        raise HTTPException(status_code=500, detail='Failed to submit demo request')

@router.get('/master/demo-requests')
def get_master_demo_requests(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Only master admin can view demo requests')
    
    try:
        requests_cursor = demo_requests_collection.find().sort('created_at', -1)
        requests = []
        for req in requests_cursor:
            req['id'] = str(req['_id'])
            del req['_id']
            requests.append(req)
        return {'status': 'success', 'data': requests}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put('/master/demo-requests/{request_id}')
def update_demo_request_status(request_id: str, req: DemoRequestUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Not authorized')
    try:
        result = demo_requests_collection.update_one(
            {'_id': ObjectId(request_id)},
            {'$set': {'status': req.status}}
        )
        if result.modified_count == 1:
            return {'status': 'success'}
        else:
            raise HTTPException(status_code=404, detail='Request not found')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete('/master/demo-requests/{request_id}')
def delete_demo_request(request_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Not authorized')
    try:
        result = demo_requests_collection.delete_one({'_id': ObjectId(request_id)})
        if result.deleted_count == 1:
            return {'status': 'success'}
        else:
            raise HTTPException(status_code=404, detail='Request not found')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/interview/{link_id}/notes")
def update_interview_notes(link_id: str, payload: dict, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "superadmin", "admin", "tenant"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    note_text = payload.get("notes", "").strip()
    if not note_text:
        return {"status": "success", "message": "No note to add"}
        
    new_note = {
        "text": note_text,
        "author_id": current_admin.get("admin_id"),
        "role": current_admin.get("role"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    from bson import ObjectId
    result = interview_sessions_collection.update_one(
        {"link_id": link_id},
        {"$push": {"notes_history": new_note}}
    )
    if result.matched_count == 0:
        # Also check job_applications for AI calls
        try:
            oid = ObjectId(link_id.replace("ai_call_", "")) if link_id.startswith("ai_call_") else None
        except Exception:
            oid = None
        or_cond = [{"omni_call_id": link_id}]
        if oid:
            or_cond.append({"_id": oid})
        result2 = job_applications_collection.update_one(
            {"$or": or_cond},
            {"$push": {"notes_history": new_note}}
        )
        if result2.matched_count == 0:
            raise HTTPException(status_code=404, detail="Session not found")
            
    return {"status": "success", "message": "Note added successfully", "note": new_note}
