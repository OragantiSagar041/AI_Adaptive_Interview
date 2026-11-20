"""
app/routes_split/interview.py — Interview session, questions, coding
Auto-split from routes.py lines 565–2051.
"""

# ---------------------------------------------------------------------------
# Standard library
# ---------------------------------------------------------------------------
import os, sys, io, json, hmac, math, uuid, html, time, random
import base64, shutil, hashlib, textwrap, asyncio, subprocess, tempfile
import threading, traceback, logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Union

# ---------------------------------------------------------------------------
# Third-party
# ---------------------------------------------------------------------------
import bcrypt, jwt, requests
import cloudinary, cloudinary.uploader, cloudinary.api, cloudinary.utils
import edge_tts
# pyrefly: ignore [missing-import]
import pypdf
from bson import ObjectId
from bson.errors import InvalidId
from docx import Document
from dotenv import load_dotenv
from groq import AsyncGroq
from pydantic import BaseModel, validator, Field
from starlette.background import BackgroundTask
from fastapi import (
    APIRouter, Body, Depends, File, Form, HTTPException, Request, UploadFile,
    WebSocket, WebSocketDisconnect, BackgroundTasks, Header
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# ---------------------------------------------------------------------------
# Internal / project
# ---------------------------------------------------------------------------
from app.ai.ai_client import chat_completion, extract_json, current_session_id
from app.ai.analyze_answer import analyze_answer
from app.data.coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from app.data.industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from app.db.redis_manager import manager
import app.services.transcription as transcription
from app.db.mongo_db import client as mongo_client
from app.services.services import *
from app.services.services import parse_iso_datetime
from app.core.session_store import get_session, set_session, delete_session as delete_cached_session
from app.schemas.models import *
from app.db.database import *
from app.core.config import *
from app.ai import omni_dimension_client
from app.services.live_monitoring_security import (
    MONITORING_SCOPE, admin_can_access_session,
    create_monitoring_token, decode_monitoring_token,
    validate_snapshot_dataurl,
)
from app.services.candidate_auth import require_active_candidate
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from app.data.interview_graphs import run_followup_graph

# Re-import shared helpers from routes_core
from app.schemas.routes_models import *
from app.core.routes_core import (
    get_current_admin, get_current_admin_details, require_master_user,
    _create_candidate_monitoring_token, _validate_candidate_monitoring_token,
    _require_candidate_session, _require_admin_session_access,
    _get_authorized_live_session, _get_authorized_creator_ids,
    _decode_dashboard_websocket_admin,
    sync_session_status, get_or_create_candidate,
    load_interview_from_db, get_interview_or_404,
    get_answer_history, build_answer_summary,
    persist_coding_round, build_coding_test_payload,
    process_temp_cloudinary_upload, broadcast_profile_update,
    startup_event_cloudinary, candidate_monitoring_security,
    RazorpayOrderRequest, MAIN_LOOP,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

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

    # ── Strict 22-question maximum limit check ──
    if len(interview.get("questions", [])) >= 22:
        return {"skip_followup": True, "reason": "Maximum limit of 22 questions reached"}

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
        questions = generate_interview_questions(content_str, source)

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
        questions = await asyncio.to_thread(generate_interview_questions, content, source)

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
        def _save_interview():
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        try:
            await asyncio.to_thread(_save_interview)
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
                row = await asyncio.to_thread(interviews_collection.find_one, {"id": interview_id})
                if row:
                    try:
                        session_row = await asyncio.to_thread(interview_sessions_collection.find_one, {"interview_id": interview_id}) or {}
                        loaded_questions = json.loads(row.get("questions", "[]"))
                        session = {
                            "id": interview_id,
                            "link_id": session_row.get("link_id"),
                            "source": row.get("source"),
                            "profile_text": row.get("profile_text", ""),
                            "questions": loaded_questions,
                            "answers": {},
                            "industry": row.get("industry") or row.get("industry_type") or session_row.get("industry") or session_row.get("industry_type") or "General",
                            "interview_type": row.get("interview_type") or session_row.get("interview_type") or "Technical",
                            "language": row.get("language") or session_row.get("language") or "English",
                            "case_study_count": session_row.get("case_study_count", 3)
                        }
                        set_session(interview_id, session)
                    except Exception:
                        pass

            if not session:
                raise HTTPException(status_code=404, detail="Interview session not found")
            profile_text = session.get("profile_text", "")
            source = session.get("source", "resume")
            existing_questions = session.get("questions", [])
            if len(existing_questions) >= 22:
                return {"questions": []}

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
                generate_interview_questions,
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
            def _update_db():
                interviews_collection.update_one(
                    {"id": interview_id},
                    {"$set": {"questions": json.dumps(session["questions"])}}
                )
            await asyncio.to_thread(_update_db)

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
        "current_question": ({k: v for k, v in question.items() if k not in ("model_answer", "quick_summary", "key_points")} if isinstance(question, dict) else question),  # Stripped of recruiter cheat-sheet fields
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
    monitoring_token: Optional[str] = Form(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    try:
        effective_creds = credentials
        if not effective_creds and monitoring_token:
            effective_creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=monitoring_token)

        candidate_session = None
        if effective_creds:
            try:
                candidate_session = _require_candidate_session(effective_creds, interview_id=interview_id)
            except HTTPException:
                pass

        if not candidate_session and interview_id:
            candidate_session = interview_sessions_collection.find_one(
                {"$or": [{"interview_id": interview_id}, {"link_id": interview_id}], "is_deactivated": {"$ne": True}}
            )

        if not candidate_session:
            raise HTTPException(status_code=401, detail="Candidate session token is required")

        current_session_id.set(interview_id)
        from app.services.answer_service import persist_answer_and_enqueue_scoring

        result = persist_answer_and_enqueue_scoring(
            interview_id=interview_id,
            question_id=question_id,
            question_text=question_text,
            answer_text=answer_text,
            candidate_name=candidate_session.get("candidate_name") or candidate_name,
            time_spent_seconds=time_spent_seconds,
            time_limit_seconds=time_limit_seconds,
        )
        return {
            **result,
            "ai_score": None,
            "message": "Answer saved. Scoring is running in the background.",
        }
    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        with open("error_log.txt", "a") as f:
            f.write(f"Error in save_answer: {exc}\n{traceback.format_exc()}\n")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

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

    # Publish Redis Pub/Sub event for answer submitted
    try:
        from app.db.redis_manager import broadcast_interview_event
        broadcast_interview_event(
            event_type="answer_submitted",
            session_id=interview_id,
            extra={"question_id": question_id}
        )
    except Exception as _ev_e:
        pass

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
    task: Optional[Dict[str, Any]] = None
    question_id: Optional[Union[int, str]] = None


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
    language = interview.get("language", "English")

    # generate_coding_task calls an LLM (blocking I/O) — run it off the event loop
    task = await run_in_threadpool(
        generate_coding_task, profile_text, answers_data, interview_type, industry, language
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

Return ONLY a JSON array. 
CRITICAL: Even though the example below is in English, YOUR output MUST be entirely in {language}. All scenario text, questions, skills, and criteria must be written in {language}.

Example format (Translate values to {language}):
[
  {{
    "scenario": "[Scenario text in {language}]",
    "question": "[Question text in {language}]",
    "skill_tested": "[Skill name in {language}]",
    "evaluation_criteria": ["[Criterion 1 in {language}]", "[Criterion 2 in {language}]"]
  }}
]"""

    try:
        from app.ai.ai_client import chat_completion
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
    from app.data.industry_fallback_data import INDUSTRY_CASE_STUDIES
    
    # Try to get specific industry scenarios first
    if language != "English":
        # Fallback generic industry-aware templates for non-English languages
        lang_industry_cases = {
            "Telugu": [
                "{industry} పరిశ్రమలో మీరు ఒక కీలకమైన ప్రాజెక్ట్‌కు నాయకత్వం వహిస్తున్నారని ఊహించుకోండి, కానీ ఇద్దరు వాటాదారులు ఒక దిశపై తీవ్రంగా విభేదిస్తున్నారు. దీనిని పరిష్కరించడానికి మీ వ్యూహాన్ని వివరించండి.",
                "{industry} రంగానికి చెందిన మీ బృందం తక్కువ పనితీరు కనబరుస్తోంది. మీరు మూలకారణాన్ని ఎలా నిర్ధారిస్తారు మరియు టర్న్‌అరౌండ్ ప్లాన్‌ను ఎలా అమలు చేస్తారు?",
                "కోతల కారణంగా మీ {industry} ప్రాజెక్ట్ 20% బడ్జెట్‌ను కోల్పోయింది, కానీ డెలివరీ గడువు అలాగే ఉంది. మీరు ప్రాజెక్ట్ డెలివరీని ఎలా పునఃప్రణాళిక చేస్తారు?"
            ],
            "Hindi": [
                "कल्पना करें कि आप {industry} उद्योग में एक महत्वपूर्ण परियोजना का नेतृत्व कर रहे हैं, लेकिन दो प्रमुख हितधारक दिशा को लेकर दृढ़ता से असहमत हैं। इसे हल करने के लिए अपनी रणनीति बताएं।",
                "{industry} क्षेत्र में आपकी टीम का प्रदर्शन खराब है। आप मूल कारण का निदान कैसे करेंगे और सुधार योजना कैसे लागू करेंगे?",
                "कटौती के कारण आपके {industry} प्रोजेक्ट का 20% बजट कम हो गया है, लेकिन डिलीवरी की समय सीमा वही है। आप प्रोजेक्ट डिलीवरी की फिर से योजना कैसे बनाएंगे?"
            ],
            "Tamil": [
                "{industry} துறையில் ஒரு முக்கியமான திட்டத்தை நீங்கள் வழிநடத்துகிறீர்கள் என்று கற்பனை செய்து பாருங்கள், ஆனால் இரண்டு முக்கிய பங்குதாரர்கள் திசை குறித்து கடுமையாக உடன்படவில்லை. இதைத் தீர்ப்பதற்கான உங்கள் உத்தியை விளக்குங்கள்.",
                "{industry} துறையில் உங்கள் குழு சிறப்பாக செயல்படவில்லை. மூல காரணத்தை எவ்வாறு கண்டறிந்து, மேம்பாட்டுத் திட்டத்தை செயல்படுத்துவீர்கள்?",
                "செலவுக் குறைப்பு காரணமாக உங்கள் {industry} திட்டம் 20% பட்ஜெட்டை இழந்துள்ளது, ஆனால் டெலிவரி கெடு அப்படியே உள்ளது. திட்ட விநியோகத்தை எவ்வாறு மீண்டும் திட்டமிடுவீர்கள்?"
            ],
            "Malayalam": [
                "{industry} വ്യവസായത്തിൽ നിങ്ങൾ ഒരു നിർണായക പ്രോജക്റ്റ് നയിക്കുകയാണെന്ന് സങ്കൽപ്പിക്കുക, എന്നാൽ രണ്ട് പ്രധാന പങ്കാളികൾ ലക്ഷ്യത്തെക്കുറിച്ച് ശക്തമായി വിയോജിക്കുന്നു. ഇത് പരിഹരിക്കുന്നതിനുള്ള നിങ്ങളുടെ തന്ത്രം വിശദീകരിക്കുക.",
                "{industry} മേഖലയിലെ നിങ്ങളുടെ ടീം മോശം പ്രകടനമാണ് കാഴ്ചവെക്കുന്നത്. അടിസ്ഥാന കാരണം നിങ്ങൾ എങ്ങനെ കണ്ടെത്തുകയും ഒരു പരിഹാര പദ്ധതി നടപ്പിലാക്കുകയും ചെയ്യും?",
                "ചെലവ് ചുരുക്കൽ കാരണം നിങ്ങളുടെ {industry} പ്രോജക്റ്റിന് 20% ബജറ്റ് നഷ്ടപ്പെട്ടു, പക്ഷേ ഡെലിവറി സമയപരിധി മാറ്റമില്ലാതെ തുടരുന്നു. നിങ്ങൾ എങ്ങനെ പ്രോജക്റ്റ് ഡെലിവറി പുനഃക്രമീകരിക്കും?"
            ],
            "Kannada": [
                "{industry} ಉದ್ಯಮದಲ್ಲಿ ನೀವು ನಿರ್ಣಾಯಕ ಯೋಜನೆಯನ್ನು ಮುನ್ನಡೆಸುತ್ತಿದ್ದೀರಿ ಎಂದು ಕಲ್ಪಿಸಿಕೊಳ್ಳಿ, ಆದರೆ ಇಬ್ಬರು ಪ್ರಮುಖ ಪಾಲುದಾರರು ದಿಕ್ಕಿನ ಬಗ್ಗೆ ಬಲವಾಗಿ ಭಿನ್ನಾಭಿಪ್ರಾಯ ಹೊಂದಿದ್ದಾರೆ. ಇದನ್ನು ಪರಿಹರಿಸಲು ನಿಮ್ಮ ತಂತ್ರವನ್ನು ವಿವರಿಸಿ.",
                "{industry} ವಲಯದಲ್ಲಿ ನಿಮ್ಮ ತಂಡ ಕಳಪೆ ಸಾಧನೆ ಮಾಡುತ್ತಿದೆ. ಮೂಲ ಕಾರಣವನ್ನು ನೀವು ಹೇಗೆ ನಿರ್ಣಯಿಸುತ್ತೀರಿ ಮತ್ತು ಸುಧಾರಣಾ ಯೋಜನೆಯನ್ನು ಹೇಗೆ ಜಾರಿಗೆ ತರುತ್ತೀರಿ?",
                "ಕಡಿತದಿಂದಾಗಿ ನಿಮ್ಮ {industry} ಯೋಜನೆಯು 20% ಬಜೆಟ್ ಅನ್ನು ಕಳೆದುಕೊಂಡಿದೆ, ಆದರೆ ವಿತರಣಾ ಗಡುವು ಹಾಗೆಯೇ ಉಳಿದಿದೆ. ಪ್ರಾಜೆಕ್ಟ್ ವಿತರಣೆಯನ್ನು ನೀವು ಹೇಗೆ ಮರು-ಯೋಜಿಸುತ್ತೀರಿ?"
            ]
        }
        
        import random
        lang_cases = lang_industry_cases.get(language)
        
        # If we don't have industry templates for this language, fallback to the generic IT cases
        if not lang_cases:
            try:
                from app.data.offline_language_fallback import OFFLINE_LANGUAGE_CASE_STUDIES
                lang_cases = OFFLINE_LANGUAGE_CASE_STUDIES.get(language, [])
            except ImportError:
                lang_cases = []
                
        if lang_cases:
            selected = random.sample(lang_cases, min(num_questions, len(lang_cases)))
            results = []
            for idx, c in enumerate(selected):
                # Inject industry into the template
                formatted_c = c.replace("{industry}", industry)
                sep = "।" if "।" in formatted_c else "."
                parts = formatted_c.split(sep, 1)
                if len(parts) > 1 and parts[1].strip():
                    scenario = parts[0].strip() + sep
                    question = parts[1].strip()
                else:
                    scenario = formatted_c
                    question = formatted_c
                results.append({
                    "id": str(idx + 1),
                    "scenario": scenario,
                    "question": question,
                    "skill_tested": f"{industry} Scenario",
                    "difficulty": "Medium",
                    "time_limit": 300,
                    "evaluation_criteria": ["Analysis", "Problem Solving", "Communication"]
                })
            return results

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
    
    # Try getting case_study_count from RAM first, then DB, default to 3
    num_questions = interview.get("case_study_count")
    if num_questions is None:
        num_questions = (session or {}).get("case_study_count", 3)
    
    num_questions = int(num_questions) if num_questions is not None else 3
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
        # Create a combined text that contains both the scenario and the specific question
        scenario_text = q.get('scenario', '')
        question_text = q.get('question', '')
        
        # If they are exactly the same, avoid duplicating them
        if scenario_text and question_text and scenario_text != question_text:
            text = f"{scenario_text} {question_text}".strip()
        else:
            text = q.get('text') or scenario_text or question_text or ''
            
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
        found_task = getattr(req, "task", None)
        if not found_task:
            link_id = interview.get("link_id") or req.interview_id
            session = interview_sessions_collection.find_one({"$or": [{"link_id": link_id}, {"interview_id": req.interview_id}]}) or {}
            pre_q = session.get("pre_generated_questions") or []
            if isinstance(pre_q, str):
                try:
                    pre_q = json.loads(pre_q)
                except Exception:
                    pre_q = []
            for q in pre_q:
                if isinstance(q, dict) and q.get("coding_task"):
                    found_task = q.get("coding_task")
                    break
        if not found_task:
            raise HTTPException(status_code=400, detail="Coding round not started")
        coding_round = {
            "status": "active",
            "task": found_task,
            "language": req.language or "python",
            "latest_code": req.code or "",
        }

    if feedback_mode == "checkpoint":
        feedback_count = coding_round.get("ai_feedback_count", 0)
        if feedback_count >= 2:
            raise HTTPException(
                status_code=400,
                detail="Your AI feedback limit is over! You can only get AI feedback 2 times."
            )
        coding_round["ai_feedback_count"] = feedback_count + 1

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
            "ai_feedback_count": coding_round.get("ai_feedback_count", 0),
            "ai_feedback_remaining": max(0, 2 - coding_round.get("ai_feedback_count", 0)),
            "cached": True,
        }

    if feedback_mode == "final":
        now_iso = datetime.now(timezone.utc).isoformat()
        if latest_code.strip():
            try:
                from app.services.services import run_code_against_tests
                run_result = run_code_against_tests(latest_code, coding_round["task"], req.language or "python")
                coding_round["latest_run"] = {
                    "at": now_iso,
                    **run_result,
                }
            except Exception as e:
                print(f"Auto-eval execution failed: {e}")

        coding_round["latest_code"] = latest_code
        coding_round["latest_explanation"] = latest_explanation
        coding_round["language"] = req.language
        coding_round["status"] = "completed"
        coding_round["completed_at"] = now_iso
        coding_round["updated_at"] = now_iso
        persist_coding_round(req.interview_id, coding_round)

        # Offload slow LLM evaluation to a background daemon thread so candidate submission returns instantly
        def _async_eval():
            try:
                fb = run_coding_round(
                    task=coding_round["task"],
                    answer_summary=coding_round.get("answer_summary", ""),
                    code=latest_code,
                    explanation=latest_explanation,
                    language=req.language,
                    prior_feedback=coding_round.get("latest_feedback", ""),
                    feedback_mode="final",
                )
                now_ts = datetime.now(timezone.utc).isoformat()
                coding_round["latest_feedback"] = fb
                coding_round["final_evaluation"] = fb
                coding_round.setdefault("checkpoints", []).append({
                    "at": now_ts,
                    "language": req.language,
                    "code_length": len(latest_code),
                    "explanation_length": len(latest_explanation),
                    "feedback": fb,
                    "mode": "final",
                })
                persist_coding_round(req.interview_id, coding_round)
            except Exception as exc:
                print(f"Background final coding evaluation error: {exc}")

        threading.Thread(target=_async_eval, daemon=True).start()

        return {
            "interview_id": req.interview_id,
            "coding_round": coding_round,
            "feedback": "Code submitted successfully.",
            "status": "completed",
            "ai_feedback_count": coding_round.get("ai_feedback_count", 0),
            "ai_feedback_remaining": 0,
            "cached": False,
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
            from app.services.services import run_code_against_tests
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
        "ai_feedback_count": coding_round.get("ai_feedback_count", 0),
        "ai_feedback_remaining": max(0, 2 - coding_round.get("ai_feedback_count", 0)),
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
    coding_round = interview.get("coding_round") or {}

    # If coding_round or its task is not yet initialized on interview, resolve it gracefully
    if not coding_round.get("task"):
        found_task = getattr(req, "task", None)
        if not found_task:
            link_id = interview.get("link_id") or req.interview_id
            session = interview_sessions_collection.find_one({"$or": [{"link_id": link_id}, {"interview_id": req.interview_id}]}) or {}
            pre_q = session.get("pre_generated_questions", [])
            if isinstance(pre_q, str):
                try:
                    pre_q = json.loads(pre_q)
                except Exception:
                    pre_q = []
            for q in pre_q:
                if isinstance(q, dict) and q.get("coding_task"):
                    found_task = q.get("coding_task")
                    break
        if not found_task:
            for q in interview.get("pre_generated_questions", []):
                if isinstance(q, dict) and q.get("coding_task"):
                    found_task = q.get("coding_task")
                    break
        if not found_task and getattr(req, "task", None):
            found_task = req.task

        if not found_task:
            raise HTTPException(status_code=400, detail="Coding round not started")
        coding_round = {
            "status": "active",
            "task": found_task,
            "language": req.language or "python",
            "latest_code": req.code or "",
        }

    # If the request explicitly supplied the active task, adopt it
    if req.task and isinstance(req.task, dict):
        coding_round["task"] = req.task

    result = run_code_against_tests(req.code or "", coding_round["task"], req.language or "python")
    coding_round["latest_code"] = req.code or ""
    coding_round["latest_explanation"] = req.explanation or coding_round.get("latest_explanation", "")
    coding_round["language"] = req.language or "python"
    coding_round["latest_run"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    persist_coding_round(req.interview_id, coding_round)
    try:
        link_id = interview.get("link_id") or req.interview_id
        interview_sessions_collection.update_one(
            {"$or": [{"interview_id": req.interview_id}, {"link_id": link_id}]},
            {"$set": {"coding_round": coding_round, "latest_coding_run": coding_round["latest_run"]}},
        )
    except Exception as e:
        print(f"Error persisting coding run to interview session: {e}")

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
    # Optional auth validation: if bearer provided, check it; if sendBeacon without headers, allow based on link_id
    if credentials:
        try:
            _require_candidate_session(credentials, link_id=interview_id)
        except Exception:
            pass
    try:
        body_bytes = await request.body()
        data = json.loads(body_bytes)
        alert_type = data.get("type", "warning")
        alert_message = data.get("message", "Unknown alert")
    except Exception:
        alert_type = "warning"
        alert_message = "Invalid alert data received"
        
    ts = datetime.now(timezone.utc).isoformat()
    violation_doc = {
        "type": alert_type,
        "details": alert_message,
        "message": alert_message,
        "timestamp": ts,
    }
    interview_sessions_collection.update_one(
        {"$or": [{"link_id": interview_id}, {"interview_id": interview_id}]},
        {
            "$push": {
                "violations": violation_doc,
                "alerts": violation_doc,
            },
            "$inc": {"violation_count": 1}
        }
    )
    return {"status": "success"}

# ─── Helper: Generate AI Summary (Recommendation + S&W) ─────────────────────
def generate_interview_summary(candidate_name: str, answers_data: list) -> dict:
    """
    Generate interview summary via typed_ai_layer (type-safe, compressed, token-optimized).
    """
    # Priority 0: LangGraph Layer
    try:
        from app.data.interview_graphs import run_summary_graph
        result = run_summary_graph(candidate_name, answers_data)
        if result and "recommendation" in result:
            return result
    except ImportError:
        pass
    except Exception as e:
        print(f"[interview_graphs] summary failed, falling back: {e}")

    # Priority 1: Typed AI layer (type-safe validated output)
    try:
        from app.ai.typed_ai_layer import generate_summary as _typed_summary
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
        if res:
            if not res.get("detected_accent") or str(res.get("detected_accent")).strip().lower() in ["unknown", "none", ""]:
                from app.services.language_accent_detector import detect_language_and_accent
                l_res = detect_language_and_accent(answers_data)
                res["detected_accent"] = l_res.get("detected_accent", "English (Indian Accent)")
            return res
        raise Exception("Invalid JSON returned")
    except Exception as e:
        print(f"Summary generation error: {e}")
        from app.services.language_accent_detector import detect_language_and_accent
        l_res = detect_language_and_accent(answers_data)
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
            "detected_accent": l_res.get("detected_accent", "English (Indian Accent)")
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
    norm_title = _normalize_text_field(context_title)
    norm_body = _normalize_text_field(context_body)
    return {
        "context_title": norm_title,
        "context_body": norm_body,
        "title": norm_title,
        "body": norm_body,
        "instruction": norm_body,
        "is_enabled": bool(item.get("is_enabled", item.get("enabled", True))),
    }


def normalize_agent_flow_write_item(item: Dict[str, Any]) -> Dict[str, Any]:
    title = item.get("context_title") if item.get("context_title") is not None else item.get("title", "")
    body = item.get("context_body") if item.get("context_body") is not None else item.get("body", item.get("instruction", ""))
    norm_title = _normalize_text_field(title)
    norm_body = _normalize_text_field(body)
    return {
        "title": norm_title,
        "body": norm_body,
        "context_title": norm_title,
        "context_body": norm_body,
        "instruction": norm_body,
        "is_enabled": bool(item.get("is_enabled", item.get("enabled", True))),
    }



# ==============================================================================
# RECRUITER-LED COPILOT ENDPOINTS (Blueprint v1.1 — Deterministic + Zero Live AI)
# ==============================================================================

_optional_admin_bearer = HTTPBearer(auto_error=False)
_RECRUITER_RATING_SCORES = {
    "correct": 100.0,
    "partial": 50.0,
    "incorrect": 0.0,
    "skip": None,
}
_VALID_RECRUITER_RECOMMENDATIONS = {
    "strongly recommend": "Strongly Recommend",
    "recommend": "Recommend",
    "hold": "Hold",
    "reject": "Reject",
}


def _find_session_by_any_id(identifier: str) -> Optional[Dict[str, Any]]:
    queries = [{"link_id": identifier}, {"interview_id": identifier}]
    if ObjectId.is_valid(identifier):
        queries.append({"_id": ObjectId(identifier)})
    return interview_sessions_collection.find_one({"$or": queries})


def _safe_recruiter_id(val: Any, fallback: Any = 1) -> Union[int, str]:
    if val is None or val == "":
        return fallback
    if isinstance(val, int):
        return val
    s = str(val).strip()
    try:
        return int(s)
    except (ValueError, TypeError):
        return s


def _safe_str_difficulty(val: Any) -> str:
    if isinstance(val, str) and val.strip():
        return val.strip().capitalize()
    return "Medium"


def _safe_json_dumps(obj: Any) -> str:
    def _default_serializer(o):
        if isinstance(o, (datetime, timedelta)):
            return str(o)
        if isinstance(o, ObjectId):
            return str(o)
        if hasattr(o, "isoformat"):
            return o.isoformat()
        if hasattr(o, "model_dump"):
            return o.model_dump()
        if hasattr(o, "dict"):
            return o.dict()
        if hasattr(o, "__str__"):
            return str(o)
        return repr(o)
    return json.dumps(obj, default=_default_serializer)


def _clean_recruiter_question_item(
    q: Any,
    idx: int,
    fallback_difficulty: str = "Medium",
    fallback_category: str = "Core Technical",
) -> Dict[str, Any]:
    from app.data.interview_graphs import _build_recruiter_fallback_item
    if not isinstance(q, dict):
        return _build_recruiter_fallback_item(
            idx,
            str(q or f"Question {idx}"),
            category=fallback_category,
            difficulty=fallback_difficulty,
        )
    clean = {k: v for k, v in q.items() if k != "_id" and v is not None}
    clean["id"] = _safe_recruiter_id(clean.get("id"), idx)
    clean["difficulty"] = _safe_str_difficulty(clean.get("difficulty") or fallback_difficulty)
    if clean.get("coding_task") or "coding" in str(clean.get("category", "")).lower() or "coding" in str(clean.get("question", "")).lower():
        clean["question_type"] = "coding"
    elif clean.get("case_study") or "case study" in str(clean.get("category", "")).lower():
        clean["question_type"] = "case_study"
    else:
        clean["question_type"] = str(clean.get("question_type") or "discussion")
    q_text = str(clean.get("question") or clean.get("text") or f"Question {idx}").strip()
    clean["question"] = q_text

    # Ensure cheat-sheet essentials are always present
    if not clean.get("quick_summary") or not clean.get("model_answer") or not clean.get("key_points"):
        fb = _build_recruiter_fallback_item(
            clean["id"],
            q_text,
            category=clean.get("category") or fallback_category,
            difficulty=clean["difficulty"],
            question_type=clean["question_type"],
            coding_task=clean.get("coding_task"),
            case_study=clean.get("case_study"),
        )
        for k in ("quick_summary", "key_points", "model_answer", "category"):
            if not clean.get(k):
                clean[k] = fb.get(k)
    return clean


def _build_emergency_recruiter_response(
    session_row: Optional[Dict[str, Any]],
    link_id: str,
    interview_id: Optional[str] = None,
    err: Optional[Exception] = None,
) -> Dict[str, Any]:
    from app.data.interview_graphs import _build_recruiter_fallback_item
    s_row = session_row or {}
    canonical_link_id = str(s_row.get("link_id") or link_id)
    actual_iv_id = s_row.get("interview_id") or interview_id or f"int_emerg_{uuid.uuid4().hex[:8]}"
    iv_type = s_row.get("interview_type") or "Technical"
    diff = _safe_str_difficulty(s_row.get("project_difficulty") or s_row.get("difficulty"))
    custom_qs = s_row.get("custom_questions") or ""
    custom_lines = [q.strip() for q in str(custom_qs).split("\n") if q.strip()]

    seed_questions = custom_lines[:5] + [
        "Walk me through the most technically challenging project on your resume and your specific architectural choices.",
        "How do you troubleshoot and isolate a critical production outage under tight latency or SLA constraints?",
        "What key trade-offs do you evaluate when structuring database schemas, caching layers, or distributed APIs?",
        "Describe a situation where you had to push back on a technical requirement or align cross-functional stakeholders.",
        "How do you ensure test coverage, security postures, and code maintainability in high-velocity deployments?",
    ]

    emergency_questions = [
        _build_recruiter_fallback_item(
            idx,
            q_text,
            category="Core Technical" if "tech" in iv_type.lower() else "Case Study",
            difficulty=diff,
            question_type="discussion",
        )
        for idx, q_text in enumerate(seed_questions[:6], start=1)
    ]

    return {
        "status": "success",
        "link_id": canonical_link_id,
        "interview_id": actual_iv_id,
        "candidate_name": s_row.get("candidate_name") or "Candidate",
        "candidate_email": s_row.get("candidate_email") or "",
        "experience": str(s_row.get("experience") or ""),
        "interview_title": s_row.get("interview_title") or s_row.get("job_title") or f"{iv_type} Interview",
        "interview_duration": s_row.get("interview_duration") or 30,
        "interview_type": iv_type,
        "interview_format": "Recruiter-Led",
        "interview_mode": "recruiter_led",
        "session_status": s_row.get("status") or "pending",
        "resume_text": s_row.get("resume_text") or "",
        "job_description": s_row.get("job_description") or "",
        "questions": emergency_questions,
        "evaluations": s_row.get("recruiter_evaluations") or [],
        "active_question_index": int(s_row.get("active_question_index") or 0),
        "overall_notes": s_row.get("overall_notes") or "",
        "overall_recommendation": s_row.get("overall_recommendation") or "",
        "score": s_row.get("score"),
        "external_meeting_url": s_row.get("external_meeting_url") or "",
        "external_call_mode": bool(s_row.get("external_call_mode") or s_row.get("external_meeting_url")),
        "emergency_fallback": True,
    }


def _strip_cheat_sheet_list(questions: Any) -> Any:
    if not isinstance(questions, list):
        return questions
    cleaned = []
    for q in questions:
        if isinstance(q, dict):
            cleaned.append({k: v for k, v in q.items() if k not in ("model_answer", "quick_summary", "key_points")})
        else:
            cleaned.append(q)
    return cleaned


def _normalize_recruiter_eval_items(evaluations: List[Any]) -> List[Dict[str, Any]]:
    normalized = []
    for item in evaluations or []:
        if hasattr(item, "model_dump"):
            d = item.model_dump()
        elif hasattr(item, "dict"):
            d = item.dict()
        elif isinstance(item, dict):
            d = dict(item)
        else:
            continue
        raw_rating = str(d.get("rating") or "Skip").strip()
        rating_key = raw_rating.lower()
        canonical_rating = {
            "correct": "Correct",
            "partial": "Partial",
            "incorrect": "Incorrect",
            "skip": "Skip",
        }.get(rating_key, "Skip")
        normalized.append({
            "question_id": _safe_recruiter_id(d.get("question_id"), 0),
            "question": str(d.get("question") or ""),
            "rating": canonical_rating,
            "notes": str(d.get("notes") or ""),
            "score": _RECRUITER_RATING_SCORES.get(canonical_rating.lower()),
        })
    return normalized


def _compute_recruiter_score(eval_items: List[Dict[str, Any]]) -> Optional[float]:
    scored = [
        _RECRUITER_RATING_SCORES.get(str(item.get("rating") or "").strip().lower())
        for item in (eval_items or [])
    ]
    numeric = [val for val in scored if val is not None]
    if not numeric:
        return None
    return round(sum(numeric) / len(numeric), 1)


@router.get("/recruiter/session/{link_id}/questions")
def get_recruiter_session_questions(
    link_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    """
    Lazy-loads or generates the Recruiter-Only Q&A Cheat Sheet (upfront only, idempotent).
    Never exposed to candidates.
    """
    from app.data.interview_graphs import (
        generate_recruiter_cheat_sheet_questions,
        enrich_questions_with_cheat_sheet,
        _build_recruiter_fallback_item,
    )

    session_row = _find_session_by_any_id(link_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="Session not found")

    _require_admin_session_access(session_row, current_admin)
    canonical_link_id = str(session_row.get("link_id") or link_id)
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        interview_id = session_row.get("interview_id")
        iv_doc = None
        if interview_id:
            try:
                iv_doc = interviews_collection.find_one({"id": interview_id})
            except Exception:
                iv_doc = None
        if not iv_doc:
            try:
                iv_doc = interviews_collection.find_one({"link_id": canonical_link_id})
            except Exception:
                iv_doc = None
            if iv_doc and not interview_id:
                interview_id = iv_doc.get("id")

        if not interview_id:
            interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        raw_questions = None
        if iv_doc and iv_doc.get("questions"):
            raw_questions = iv_doc.get("questions")
        elif session_row.get("pre_generated_questions"):
            raw_questions = session_row.get("pre_generated_questions")

        parsed_questions: List[Dict[str, Any]] = []
        if isinstance(raw_questions, str):
            try:
                loaded = json.loads(raw_questions)
                if isinstance(loaded, list):
                    parsed_questions = loaded
            except Exception:
                parsed_questions = []
        elif isinstance(raw_questions, list):
            parsed_questions = raw_questions

        needs_generation = len(parsed_questions) == 0
        needs_enrichment = (
            len(parsed_questions) > 0
            and any(
                not isinstance(q, dict)
                or not str(q.get("quick_summary") or "").strip()
                or not str(q.get("model_answer") or "").strip()
                or not isinstance(q.get("key_points"), list)
                or len(q.get("key_points") or []) == 0
                for q in parsed_questions
            )
        )

        job_desc = session_row.get("job_description") or (iv_doc or {}).get("job_description") or ""
        resume_txt = session_row.get("resume_text") or (iv_doc or {}).get("resume_text") or ""
        custom_qs = session_row.get("custom_questions") or ""
        ai_instr = session_row.get("ai_instructions") or ""
        iv_type = session_row.get("interview_type") or (iv_doc or {}).get("interview_type") or "Technical"
        experience_val = str(session_row.get("experience") or "")
        safe_diff = _safe_str_difficulty(session_row.get("project_difficulty") or session_row.get("difficulty"))

        try:
            if needs_generation:
                parsed_questions = generate_recruiter_cheat_sheet_questions(
                    resume_text=resume_txt,
                    jd_text=job_desc,
                    num_questions=8,
                    interview_type=iv_type,
                    industry=session_row.get("industry") or "General",
                    language=session_row.get("language") or "English",
                    difficulty=safe_diff,
                    custom_questions=custom_qs,
                    ai_instructions=ai_instr,
                )
            elif needs_enrichment:
                parsed_questions = enrich_questions_with_cheat_sheet(
                    questions=parsed_questions,
                    resume_text=resume_txt,
                    jd_text=job_desc,
                    language=session_row.get("language") or "English",
                    difficulty=safe_diff,
                )

            # Ensure Technical / Coding interviews ALWAYS contain live coding challenges
            is_coding_eligible = any(k in iv_type.lower() for k in ("coding", "technical", "tech", "software", "developer"))
            has_coding = any(
                isinstance(q, dict) and (q.get("question_type") == "coding" or bool(q.get("coding_task")))
                for q in parsed_questions
            )
            if is_coding_eligible and not has_coding:
                try:
                    from app.data.coding_graph import _offline_coding_fallback, generate_coding_task
                    from app.data.interview_graphs import _detect_candidate_tech_stack
                    profile_blob = f"{job_desc}\n{resume_txt}"
                    detected_lang = _detect_candidate_tech_stack(profile_blob)
                    task_obj = None
                    try:
                        task_obj = generate_coding_task(profile_blob, [], interview_type="Technical", industry=session_row.get("industry") or "General")
                    except Exception:
                        pass
                    if not task_obj or not task_obj.get("title"):
                        task_obj = _offline_coding_fallback(profile_blob)
                    if task_obj and task_obj.get("title"):
                        task_obj["recommended_language"] = task_obj.get("recommended_language") or detected_lang
                        ct_title = task_obj.get("title", "Coding Challenge")
                        ct_desc = task_obj.get("description", "")
                        coding_item = {
                            "id": len(parsed_questions) + 1,
                            "question": f"Live Coding Challenge: {ct_title} — {ct_desc[:240]}...",
                            "quick_summary": f"Live Coding Challenge: {ct_title} — Candidate implements solution in Monaco Code Editor with test execution.",
                            "key_points": [
                                "Optimal time/space complexity",
                                "Handles edge cases & boundary conditions",
                                "Passes visible and hidden automated test cases",
                                "Clean, readable syntax & modular logic",
                            ],
                            "model_answer": (
                                f"Optimal algorithmic approach for {ct_title}: Expected complexity O(N) or O(N log N). "
                                f"Starter function: `{task_obj.get('starter_function_signature') or task_obj.get('function_name') or 'solve'}`. "
                                f"Candidate must explain data structure selection, trade-offs, and run test verification."
                            ),
                            "category": "Coding Challenge",
                            "difficulty": (task_obj.get("difficulty") or safe_diff).capitalize(),
                            "question_type": "coding",
                            "coding_task": task_obj,
                        }
                        insert_pos = min(len(parsed_questions), 2)
                        parsed_questions.insert(insert_pos, coding_item)
                except Exception as code_inj_err:
                    logger.warning(f"[RecruiterCopilot] Coding injection warning: {code_inj_err}")
        except Exception as cheat_err:
            logger.warning(f"[RecruiterCopilot] Cheat-sheet generation fallback triggered for {canonical_link_id}: {cheat_err}")
            if not parsed_questions:
                custom_lines = [q.strip() for q in str(custom_qs or "").split("\n") if q.strip()]
                seed_texts = custom_lines[:5] + [
                    "Walk me through the most complex project on your resume and the architectural decisions you made.",
                    "How do you diagnose and resolve a production bottleneck or failure in your core tech stack?",
                    "What trade-offs do you consider when designing APIs, state, or databases for scale?",
                    "Tell me about a time you collaborated across teams or resolved a technical disagreement.",
                ]
                parsed_questions = [
                    _build_recruiter_fallback_item(idx, qt, difficulty=safe_diff)
                    for idx, qt in enumerate(seed_texts[:7], start=1)
                ]
            else:
                repaired = []
                for idx, q in enumerate(parsed_questions, start=1):
                    repaired.append(_clean_recruiter_question_item(q, idx, fallback_difficulty=safe_diff))
                parsed_questions = repaired

        cleaned_questions = [
            _clean_recruiter_question_item(q, idx, fallback_difficulty=safe_diff)
            for idx, q in enumerate(parsed_questions, start=1)
        ]
        questions_json = _safe_json_dumps(cleaned_questions)

        try:
            iv_update_payload = {
                "id": interview_id,
                "link_id": canonical_link_id,
                "source": "Recruiter-Led Live Call",
                "profile_text": (job_desc or resume_txt)[:5000],
                "job_description": job_desc,
                "resume_text": resume_txt,
                "difficulty": safe_diff,
                "questions": questions_json,
                "candidate_name": session_row.get("candidate_name") or "Candidate",
                "candidate_email": session_row.get("candidate_email") or "",
                "language": session_row.get("language") or "English",
                "interview_format": "Recruiter-Led",
                "interview_mode": "recruiter_led",
                "interview_type": iv_type,
            }
            if iv_doc:
                interviews_collection.update_one(
                    {"_id": iv_doc["_id"]},
                    {"$set": {
                        "questions": questions_json,
                        "link_id": canonical_link_id,
                        "interview_format": "Recruiter-Led",
                        "interview_mode": "recruiter_led",
                        "difficulty": safe_diff,
                    }}
                )
            else:
                interviews_collection.update_one(
                    {"$or": [{"id": interview_id}, {"link_id": canonical_link_id}]},
                    {
                        "$set": iv_update_payload,
                        "$setOnInsert": {
                            "created_at": now_iso,
                            "status": session_row.get("status") or "pending",
                        }
                    },
                    upsert=True,
                )
        except Exception as iv_sync_err:
            logger.warning(f"[RecruiterCopilot] interviews_collection sync warning for {canonical_link_id}: {iv_sync_err}")

        try:
            session_updates: Dict[str, Any] = {}
            if not session_row.get("interview_id"):
                session_updates["interview_id"] = interview_id
            if needs_generation or needs_enrichment or not session_row.get("pre_generated_questions"):
                session_updates["pre_generated_questions"] = questions_json
            if session_updates:
                interview_sessions_collection.update_one({"_id": session_row["_id"]}, {"$set": session_updates})
        except Exception as sess_sync_err:
            logger.warning(f"[RecruiterCopilot] interview_sessions_collection sync warning for {canonical_link_id}: {sess_sync_err}")

        saved_evals = session_row.get("recruiter_evaluations")
        if saved_evals is None and iv_doc:
            saved_evals = iv_doc.get("recruiter_evaluations")

        safe_response_questions = json.loads(questions_json)

        return {
            "status": "success",
            "link_id": canonical_link_id,
            "interview_id": interview_id,
            "candidate_name": session_row.get("candidate_name") or "Candidate",
            "candidate_email": session_row.get("candidate_email") or "",
            "experience": experience_val,
            "interview_title": session_row.get("interview_title") or session_row.get("job_title") or "",
            "interview_duration": session_row.get("interview_duration") or 30,
            "interview_type": iv_type,
            "interview_format": "Recruiter-Led",
            "interview_mode": "recruiter_led",
            "session_status": session_row.get("status") or "pending",
            "resume_text": resume_txt,
            "job_description": job_desc,
            "questions": safe_response_questions,
            "evaluations": saved_evals or [],
            "active_question_index": int(session_row.get("active_question_index") or 0),
            "overall_notes": session_row.get("overall_notes") or "",
            "overall_recommendation": session_row.get("overall_recommendation") or "",
            "score": session_row.get("score"),
            "external_meeting_url": session_row.get("external_meeting_url") or "",
            "external_call_mode": bool(session_row.get("external_call_mode") or session_row.get("external_meeting_url")),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"[RecruiterCopilot] Critical fallback triggered for session {canonical_link_id}: {exc}")
        return _build_emergency_recruiter_response(session_row, canonical_link_id, session_row.get("interview_id"), exc)


import threading
from collections import defaultdict as _recruiter_defaultdict

_recruiter_gen_locks = _recruiter_defaultdict(threading.Lock)


@router.post("/recruiter/session/{link_id}/generate-more-questions")
def recruiter_generate_more_questions(
    link_id: str,
    payload: Dict[str, Any] = Body(default_factory=dict),
    current_admin: dict = Depends(get_current_admin_details),
):
    """
    Generate on-demand additional cheat-sheet questions during a live Recruiter-Led interview.
    Enables continuous, infinite questions until the recruiter decides to conclude the call,
    with strict multi-layer deduplication across discussion, case-study, and coding questions.
    """
    from app.data.interview_graphs import (
        generate_recruiter_cheat_sheet_questions,
        _build_recruiter_fallback_item,
        is_recruiter_question_duplicate,
        extract_coding_title_from_text,
    )

    session_row = _find_session_by_any_id(link_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="Session not found")

    _require_admin_session_access(session_row, current_admin)
    canonical_link_id = str(session_row.get("link_id") or link_id)

    try:
        with _recruiter_gen_locks[canonical_link_id]:
            # Re-fetch fresh session & interview docs inside the lock so rapid requests never overlap
            fresh_session = _find_session_by_any_id(canonical_link_id) or session_row
            interview_id = fresh_session.get("interview_id") or session_row.get("interview_id")

            iv_doc = None
            if interview_id:
                try:
                    iv_doc = interviews_collection.find_one({"id": interview_id})
                except Exception:
                    iv_doc = None
            if not iv_doc:
                try:
                    iv_doc = interviews_collection.find_one({"link_id": canonical_link_id})
                except Exception:
                    iv_doc = None

            # Read existing questions from session/interview doc
            existing_questions: List[Dict[str, Any]] = []
            raw_questions = (iv_doc or {}).get("questions") or fresh_session.get("pre_generated_questions")
            if isinstance(raw_questions, str):
                try:
                    loaded = json.loads(raw_questions)
                    if isinstance(loaded, list):
                        existing_questions = loaded
                except Exception:
                    pass
            elif isinstance(raw_questions, list):
                existing_questions = raw_questions

            # Number of new questions requested (support both num_questions and count; default 5)
            requested_count = int(payload.get("num_questions") or payload.get("count") or 5)
            requested_count = max(1, min(requested_count, 10))

            # Collect ALL existing question texts, coding titles, coding functions, and case-study titles
            exclude_list: List[str] = []
            exclude_coding_titles: List[str] = []
            exclude_coding_functions: List[str] = []
            exclude_case_titles: List[str] = []

            for q in existing_questions:
                if not isinstance(q, dict):
                    continue
                qt = str(q.get("question") or q.get("text") or "").strip()
                if qt:
                    exclude_list.append(qt)
                    extracted_ct = extract_coding_title_from_text(qt)
                    if extracted_ct:
                        exclude_coding_titles.append(extracted_ct)
                ct = q.get("coding_task")
                if isinstance(ct, dict):
                    if ct.get("title"):
                        exclude_coding_titles.append(str(ct.get("title")).strip())
                    if ct.get("function_name"):
                        exclude_coding_functions.append(str(ct.get("function_name")).strip())
                cs = q.get("case_study")
                if isinstance(cs, dict) and cs.get("title"):
                    exclude_case_titles.append(str(cs.get("title")).strip())

            job_desc = fresh_session.get("job_description") or (iv_doc or {}).get("job_description") or ""
            resume_txt = fresh_session.get("resume_text") or (iv_doc or {}).get("resume_text") or ""
            iv_type = fresh_session.get("interview_type") or (iv_doc or {}).get("interview_type") or "Technical"
            diff_val = _safe_str_difficulty(fresh_session.get("project_difficulty") or fresh_session.get("difficulty"))
            industry_val = fresh_session.get("industry") or "General"
            language_val = fresh_session.get("language") or "English"

            start_num = len(existing_questions) + 1

            try:
                new_items = generate_recruiter_cheat_sheet_questions(
                    resume_text=resume_txt,
                    jd_text=job_desc,
                    num_questions=requested_count,
                    interview_type=iv_type,
                    industry=industry_val,
                    language=language_val,
                    difficulty=diff_val,
                    custom_questions="",  # Never re-inject initial custom questions on continuation
                    ai_instructions=fresh_session.get("ai_instructions") or "",
                    exclude_questions=exclude_list,
                    start_id=start_num,
                    exclude_coding_titles=exclude_coding_titles,
                    exclude_coding_functions=exclude_coding_functions,
                    exclude_case_titles=exclude_case_titles,
                )
            except Exception as gen_err:
                logger.warning(f"[RecruiterCopilot] Infinite question generator fallback for {canonical_link_id}: {gen_err}")
                more_seeds = [
                    f"How do you approach scalability and maintainability tradeoffs in {iv_type} contexts?",
                    "Walk me through a challenging bug or design flaw you encountered and how you solved it.",
                    "What observability and telemetry metrics would you track in production for this system?",
                    "How would you explain your architecture and technical decisions to non-technical stakeholders?",
                    "How do you validate backward compatibility when rolling out breaking API or schema changes?",
                    "What testing pyramid strategy ensures high confidence without slowing down release cycles?",
                ]
                new_items = [
                    _build_recruiter_fallback_item(
                        start_num + i,
                        text,
                        category="Core Technical" if "tech" in iv_type.lower() else "Case Study",
                        difficulty=diff_val,
                    )
                    for i, text in enumerate(more_seeds)
                ]

            # Final hard deduplication pass against existing_questions AND within new_items itself
            deduped_new_items: List[Dict[str, Any]] = []
            running_texts = list(exclude_list)
            running_coding_titles = list(exclude_coding_titles)
            running_coding_functions = list(exclude_coding_functions)
            running_case_titles = list(exclude_case_titles)

            for item in new_items:
                if not isinstance(item, dict):
                    continue
                qt = str(item.get("question") or item.get("text") or "").strip()
                ct_obj = item.get("coding_task") if isinstance(item.get("coding_task"), dict) else {}
                cs_obj = item.get("case_study") if isinstance(item.get("case_study"), dict) else {}
                c_title = str(ct_obj.get("title") or extract_coding_title_from_text(qt) or "").strip()
                c_fn = str(ct_obj.get("function_name") or "").strip()
                cs_title = str(cs_obj.get("title") or "").strip()

                if is_recruiter_question_duplicate(
                    qt,
                    running_texts,
                    coding_title=c_title,
                    coding_function=c_fn,
                    existing_coding_titles=running_coding_titles,
                    existing_coding_functions=running_coding_functions,
                    case_title=cs_title,
                    existing_case_titles=running_case_titles,
                ):
                    continue

                running_texts.append(qt)
                if c_title:
                    running_coding_titles.append(c_title)
                if c_fn:
                    running_coding_functions.append(c_fn)
                if cs_title:
                    running_case_titles.append(cs_title)
                deduped_new_items.append(item)
                if len(deduped_new_items) >= requested_count:
                    break

            # Combine existing and strictly unique new questions
            combined_raw = existing_questions + deduped_new_items
            cleaned_combined = [
                _clean_recruiter_question_item(q, idx, fallback_difficulty=diff_val)
                for idx, q in enumerate(combined_raw, start=1)
            ]
            combined_json = _safe_json_dumps(cleaned_combined)

            # Persist updated list to DB
            if deduped_new_items:
                try:
                    interview_sessions_collection.update_one(
                        {"_id": fresh_session["_id"]},
                        {"$set": {"pre_generated_questions": combined_json}}
                    )
                except Exception as s_err:
                    logger.warning(f"[RecruiterCopilot] Session update error in generate_more: {s_err}")

                if interview_id:
                    try:
                        interviews_collection.update_one(
                            {"id": interview_id},
                            {"$set": {"questions": combined_json}}
                        )
                    except Exception as iv_err:
                        logger.warning(f"[RecruiterCopilot] Interview update error in generate_more: {iv_err}")

            safe_new_items = [
                _clean_recruiter_question_item(item, start_num + idx, fallback_difficulty=diff_val)
                for idx, item in enumerate(deduped_new_items)
            ]
            safe_all_items = json.loads(combined_json)

            return {
                "status": "success",
                "new_questions": safe_new_items,
                "added_count": len(safe_new_items),
                "questions": safe_all_items,
                "total_questions": len(safe_all_items),
            }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"[RecruiterCopilot] Error in recruiter_generate_more_questions: {exc}")
        return {
            "status": "error",
            "message": str(exc),
            "new_questions": [],
            "added_count": 0,
            "questions": existing_questions if 'existing_questions' in locals() else [],
            "total_questions": len(existing_questions) if 'existing_questions' in locals() else 0,
        }


@router.post("/interview/{interview_id}/auto-save-progress")
def auto_save_recruiter_progress(
    interview_id: str,
    payload: AutoSaveRecruiterProgressRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Persist in-flight recruiter ratings & notes on question step transitions."""
    session_row = _find_session_by_any_id(interview_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="Interview session not found")

    _require_admin_session_access(session_row, current_admin)
    canonical_link_id = str(session_row.get("link_id") or "")
    actual_iv_id = session_row.get("interview_id") or interview_id
    eval_dicts = _normalize_recruiter_eval_items(payload.evaluations)
    preview_score = _compute_recruiter_score(eval_dicts)
    now_iso = datetime.now(timezone.utc).isoformat()

    updates = {
        "recruiter_evaluations": eval_dicts,
        "active_question_index": max(0, int(payload.active_question_index or 0)),
        "overall_notes": payload.overall_notes or "",
        "last_autosaved_at": now_iso,
    }
    if canonical_link_id:
        interview_sessions_collection.update_one({"link_id": canonical_link_id}, {"$set": updates})
    interviews_collection.update_one(
        {"$or": [{"id": actual_iv_id}, {"link_id": canonical_link_id or interview_id}]},
        {"$set": updates},
    )
    return {
        "status": "saved",
        "active_question_index": updates["active_question_index"],
        "saved_count": len(eval_dicts),
        "preview_score": preview_score,
    }


def _sanitize_external_meeting_link(raw_url: Optional[str]) -> str:
    url = (raw_url or "").strip()
    if not url:
        return ""
    lower = url.lower()
    if not (lower.startswith("http://") or lower.startswith("https://")):
        import re as _re
        if _re.match(r"^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(/.*)?$", url):
            url = "https://" + url
        else:
            raise HTTPException(status_code=400, detail="Please enter a valid Google Meet or Zoom URL (https://...)")
    return url[:500]


@router.post("/recruiter/session/{link_id}/external-meeting")
def update_recruiter_external_meeting(
    link_id: str,
    payload: ExternalMeetingUpdateRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Toggle External Call Mode (Google Meet / Zoom) and persist meeting URL."""
    session_row = _find_session_by_any_id(link_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="Interview session not found")

    _require_admin_session_access(session_row, current_admin)
    canonical_link_id = str(session_row.get("link_id") or link_id)
    actual_iv_id = session_row.get("interview_id") or ""
    clean_url = _sanitize_external_meeting_link(payload.external_meeting_url) if payload.external_meeting_url else ""
    enabled = bool(payload.external_call_mode)

    updates = {
        "external_call_mode": enabled,
        "external_meeting_url": clean_url,
    }
    interview_sessions_collection.update_one({"link_id": canonical_link_id}, {"$set": updates})
    if actual_iv_id:
        interviews_collection.update_one({"id": actual_iv_id}, {"$set": updates})

    return {
        "status": "success",
        "link_id": canonical_link_id,
        "external_call_mode": enabled,
        "external_meeting_url": clean_url,
    }


@router.post("/interview/{interview_id}/save-recruiter-evaluation")
def save_recruiter_evaluation(
    interview_id: str,
    payload: SaveRecruiterEvaluationRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """
    Finalize a Recruiter-Led interview with deterministic scoring:
    Correct=100, Partial=50, Incorrect=0, Skip=excluded from average.
    Zero runtime LLM calls.
    """
    session_row = _find_session_by_any_id(interview_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="Interview session not found")

    _require_admin_session_access(session_row, current_admin)
    canonical_link_id = str(session_row.get("link_id") or "")
    actual_iv_id = session_row.get("interview_id") or interview_id
    now_iso = datetime.now(timezone.utc).isoformat()

    raw_rec = str(payload.recommendation or "Hold").strip()
    canonical_rec = _VALID_RECRUITER_RECOMMENDATIONS.get(raw_rec.lower(), raw_rec or "Hold")

    eval_dicts = _normalize_recruiter_eval_items(payload.evaluations)
    computed = _compute_recruiter_score(eval_dicts)
    final_score = computed if computed is not None else 0.0
    graded_items = [e for e in eval_dicts if e.get("score") is not None]

    correct_cnt = sum(1 for e in eval_dicts if e.get("rating") == "Correct")
    partial_cnt = sum(1 for e in eval_dicts if e.get("rating") == "Partial")
    incorrect_cnt = sum(1 for e in eval_dicts if e.get("rating") == "Incorrect")
    skip_cnt = sum(1 for e in eval_dicts if e.get("rating") == "Skip")

    recruiter_name = current_admin.get("name") or current_admin.get("username") or "Recruiter"
    overall_notes = (payload.overall_notes or "").strip()

    strengths_text = (
        f"Recruiter-Led live assessment by {recruiter_name}: "
        f"{correct_cnt} Correct, {partial_cnt} Partial, {incorrect_cnt} Incorrect, {skip_cnt} Skipped."
    )
    weaknesses_text = overall_notes or "No additional weaknesses or concerns noted by recruiter."
    rubric_reason = (
        f"Evaluated directly by {recruiter_name} during live human interview ({canonical_rec})."
    )

    session_update = {
        "status": "completed",
        "completed_at": now_iso,
        "submitted_at": now_iso,
        "completion_reason": "recruiter_submitted",
        "interview_id": actual_iv_id,
        "interview_format": "Recruiter-Led",
        "interview_mode": "recruiter_led",
        "score": final_score,
        "avg_score": final_score,
        "ai_score": final_score,
        "round1_score": final_score,
        "round2_score": final_score,
        "overall_recommendation": canonical_rec,
        "recruiter_evaluations": eval_dicts,
        "overall_notes": overall_notes,
        "active_question_index": int(payload.active_question_index or 0),
        "evaluated_by": current_admin.get("admin_id") or current_admin.get("email"),
        "evaluated_by_name": recruiter_name,
        "strengths_summary": strengths_text,
        "weaknesses_summary": weaknesses_text,
        "communication_score": final_score,
        "communication_reasoning": rubric_reason,
        "skills_score": final_score,
        "skills_reasoning": rubric_reason,
        "competencies_score": final_score,
        "competencies_reasoning": rubric_reason,
        "personality_score": final_score,
        "personality_reasoning": rubric_reason,
        "culture_fit_score": final_score,
        "culture_fit_reasoning": rubric_reason,
        "job_success_score": final_score,
        "job_success_reasoning": rubric_reason,
    }

    if canonical_link_id:
        interview_sessions_collection.update_one({"link_id": canonical_link_id}, {"$set": session_update})

    interviews_collection.update_one(
        {"$or": [{"id": actual_iv_id}, {"link_id": canonical_link_id or interview_id}]},
        {"$set": {
            "status": "completed",
            "completed_at": now_iso,
            "score": final_score,
            "avg_score": final_score,
            "overall_recommendation": canonical_rec,
            "recruiter_evaluations": eval_dicts,
            "overall_notes": overall_notes,
            "evaluated_by_name": recruiter_name,
        }},
    )

    # Persist question-level rows into answers_collection for View Results & PDF reports
    for idx, ev in enumerate(eval_dicts, start=1):
        qid = ev.get("question_id") or idx
        rating = ev.get("rating") or "Skip"
        notes = ev.get("notes") or ""
        q_score = ev.get("score")
        q_text = ev.get("question") or f"Question {qid}"
        q_cat = str(ev.get("category") or "").strip()
        is_coding = bool(
            ev.get("is_coding")
            or "coding" in q_cat.lower()
            or "coding" in q_text.lower()
            or "live coding challenge" in q_text.lower()
            or "case study" in q_cat.lower()
            or "case study" in q_text.lower()
            or (
                "input:" in q_text.lower()
                and "output:" in q_text.lower()
                and any(k in q_text.lower() for k in ("function", "code", "algorithm", "constraints", "o("))
            )
        )
        answers_collection.update_one(
            {"interview_id": actual_iv_id, "question_id": qid},
            {"$set": {
                "interview_id": actual_iv_id,
                "link_id": canonical_link_id,
                "question_id": qid,
                "question_text": q_text,
                "answer_text": f"[Recruiter Rating: {rating}]" + (f" — {notes}" if notes else ""),
                "ai_score": q_score,
                "content_score": q_score,
                "relevance_score": q_score,
                "ai_feedback": notes or f"Marked '{rating}' by {recruiter_name}.",
                "corrected_answer": ev.get("model_answer") or ev.get("corrected_answer") or "Recruiter-Led Live Assessment",
                "recruiter_rating": rating,
                "recruiter_notes": notes,
                "is_coding": is_coding,
                "question_type": "coding" if is_coding else "verbal",
                "category": q_cat or ("Coding" if is_coding else "Technical"),
                "scoring_status": "complete",
                "created_at": now_iso,
            }},
            upsert=True,
        )

    if canonical_link_id:
        try:
            sync_session_to_application(canonical_link_id)
        except Exception as _sync_err:
            logger.warning(f"sync_session_to_application failed for {canonical_link_id}: {_sync_err}")

    try:
        from app.db.redis_manager import broadcast_interview_event
        broadcast_interview_event(
            event_type="interview_completed",
            session_id=canonical_link_id or actual_iv_id,
            company_id=session_row.get("company_id"),
            created_by=session_row.get("created_by"),
            extra={
                "candidate_name": session_row.get("candidate_name"),
                "score": final_score,
                "recommendation": canonical_rec,
                "interview_mode": "recruiter_led",
            },
        )
    except Exception:
        pass

    return {
        "status": "success",
        "interview_id": actual_iv_id,
        "link_id": canonical_link_id,
        "final_score": final_score,
        "recommendation": canonical_rec,
        "graded_count": len(graded_items),
        "total_count": len(eval_dicts),
    }


@router.get("/interview/{interview_id}")
def get_interview_details_guarded(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_optional_admin_bearer),
):
    """
    Fetch interview metadata with strict Anti-Cheat Guard:
    Candidates and unauthenticated callers NEVER receive model_answer,
    quick_summary, key_points, or recruiter evaluation notes.
    """
    iv_doc = interviews_collection.find_one({"$or": [{"id": interview_id}, {"link_id": interview_id}]})
    session_row = _find_session_by_any_id(interview_id)
    if not iv_doc and not session_row:
        raise HTTPException(status_code=404, detail="Interview not found")

    is_authorized_admin = False
    if credentials and credentials.credentials:
        try:
            admin_details = get_current_admin_details(credentials)
            if session_row:
                _require_admin_session_access(session_row, admin_details)
            is_authorized_admin = True
        except HTTPException:
            is_authorized_admin = False
        except Exception:
            is_authorized_admin = False

    raw_qs = (iv_doc or {}).get("questions") or (session_row or {}).get("pre_generated_questions") or "[]"
    questions = []
    if isinstance(raw_qs, str):
        try:
            parsed = json.loads(raw_qs)
            if isinstance(parsed, list):
                questions = parsed
        except Exception:
            questions = []
    elif isinstance(raw_qs, list):
        questions = raw_qs

    # Strip any internal MongoDB _id or non-serializable fields
    cleaned_qs = []
    for idx, q in enumerate(questions, start=1):
        if isinstance(q, dict):
            c = {k: v for k, v in q.items() if k != "_id"}
            c["id"] = _safe_recruiter_id(c.get("id"), idx)
            cleaned_qs.append(c)
        else:
            cleaned_qs.append(q)

    if not is_authorized_admin:
        cleaned_qs = _strip_cheat_sheet_list(cleaned_qs)

    safe_response_qs = json.loads(_safe_json_dumps(cleaned_qs))

    payload: Dict[str, Any] = {
        "status": "success",
        "interview_id": (iv_doc or {}).get("id") or (session_row or {}).get("interview_id") or interview_id,
        "link_id": (iv_doc or {}).get("link_id") or (session_row or {}).get("link_id") or "",
        "candidate_name": (session_row or iv_doc or {}).get("candidate_name") or "Candidate",
        "interview_format": (session_row or iv_doc or {}).get("interview_format") or "Standard",
        "interview_mode": (session_row or iv_doc or {}).get("interview_mode") or "standard",
        "interview_type": (session_row or iv_doc or {}).get("interview_type") or "Technical",
        "language": (session_row or iv_doc or {}).get("language") or "English",
        "questions": safe_response_qs,
    }
    if is_authorized_admin:
        payload["evaluations"] = (session_row or iv_doc or {}).get("recruiter_evaluations") or []
        payload["overall_notes"] = (session_row or iv_doc or {}).get("overall_notes") or ""
        payload["overall_recommendation"] = (session_row or iv_doc or {}).get("overall_recommendation") or ""
        payload["score"] = (session_row or iv_doc or {}).get("score")
    return payload
