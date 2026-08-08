"""
app/routes_core.py — Shared helpers, auth dependencies, and utility functions.
All split route files import from here. This was originally the top of routes.py.

DO NOT add route handlers here. Only shared code belongs here.
"""
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
from app.services.services import parse_iso_datetime
from app.core.session_store import get_session, set_session, delete_session as delete_cached_session
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from app.data.interview_graphs import run_followup_graph

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
# pyrefly: ignore [missing-import]
import pypdf
from bson import ObjectId

def process_temp_cloudinary_upload(temp_url: str, collection_name: str, field_name: str):
    if not temp_url or not temp_url.startswith("temp://"):
        return
    import os
    import cloudinary.uploader
    from app.db.mongo_db import interviews_collection, interview_sessions_collection
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
    from app.db.redis_manager import manager
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
from app.ai.ai_client import chat_completion, extract_json, current_session_id
from app.ai.analyze_answer import analyze_answer
from app.data.coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from app.data.industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from app.db.redis_manager import manager
import app.services.transcription as transcription
from app.routes import voice_routes
from app.db.mongo_db import client as mongo_client

from app.schemas.models import *
from app.db.database import *
from app.core.config import *
from app.ai import omni_dimension_client
from app.services.services import *
from app.services.live_monitoring_security import (
    MONITORING_SCOPE,
    admin_can_access_session,
    create_monitoring_token,
    decode_monitoring_token,
    validate_snapshot_dataurl,
)
from app.services.candidate_auth import require_active_candidate

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    if session.get("is_deactivated") or session.get("status") in ("terminated", "cancelled", "expired"):
        raise HTTPException(status_code=403, detail="This interview session is not active")

    token_interview_id = str(payload.get("interview_id") or "")
    session_interview_id = str(session.get("interview_id") or "")
    if token_interview_id and session_interview_id and not hmac.compare_digest(token_interview_id, session_interview_id):
        # If link_id matches, allow connection and sync interview_id
        logger.info(f"Monitoring token interview_id transition: {token_interview_id} -> {session_interview_id}")
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
    if interview_id and token_interview_id and not hmac.compare_digest(token_interview_id, str(interview_id)):
        # If link matches token_link_id, allow interview_id update
        pass

    session = interview_sessions_collection.find_one(
        {"link_id": token_link_id},
        {"link_id": 1, "interview_id": 1, "status": 1, "is_deactivated": 1},
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("is_deactivated"):
        raise HTTPException(status_code=403, detail="This interview session is deactivated")

    session_status = str(session.get("status") or "").lower()
    if session_status in ("terminated", "cancelled", "expired"):
        raise HTTPException(status_code=403, detail="This interview session is no longer active")
    if not allow_completed and session_status == "completed":
        raise HTTPException(status_code=403, detail="This interview session is already completed")

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


def _get_authorized_creator_ids(current_admin: dict) -> list:
    """Returns a list of admin_ids whose data the current_admin is authorized to view within their organization."""
    admin_id = str(current_admin.get("admin_id") or "")
    company_id = current_admin.get("company_id")
    
    if company_id:
        org_admins = list(admins_collection.find({"company_id": company_id}, {"_id": 1}))
        ids = [str(a["_id"]) for a in org_admins]
        if admin_id and admin_id not in ids:
            ids.append(admin_id)
        return ids
    return [admin_id] if admin_id else []


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


class RazorpayOrderRequest(BaseModel):
    plan_name: str
    signup_form: Optional[Dict[str, Any]] = None
    amount_inr: Optional[float] = None
    credits: Optional[int] = None


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
    from app.db.mongo_db import interviews_collection, interview_sessions_collection
    interview = get_session(interview_id)
    if interview:
        interview["coding_round"] = coding_round
        set_session(interview_id, interview)
    try:
        interviews_collection.update_one(
            {"id": interview_id},
            {"$set": {"coding_round": coding_round}},
            upsert=False,
        )
    except Exception as e:
        print(f"[persist_coding_round] Error updating interviews_collection: {e}")

    try:
        interview_sessions_collection.update_one(
            {"$or": [{"link_id": interview_id}, {"id": interview_id}, {"candidate_id": interview_id}]},
            {"$set": {"coding_round": coding_round}},
            upsert=False,
        )
    except Exception as e:
        print(f"[persist_coding_round] Error updating interview_sessions_collection: {e}")


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
    import app.db.mongo_db as mongo_db
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



# ---------------------------------------------------------------------------
# Razorpay / payment helpers
# ---------------------------------------------------------------------------
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

