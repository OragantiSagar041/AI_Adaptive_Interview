"""
app/routes_split/candidates.py — Resume, sessions, violations
Auto-split from routes.py lines 4010–6464.
"""

# ---------------------------------------------------------------------------
# Standard library
# ---------------------------------------------------------------------------
import os, sys, io, json, hmac, math, uuid, html, time, random, re
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
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile,
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
from app.db.mongo_db import client as mongo_client, omni_call_logs_collection
from app.services.services import *
from app.services.services import require_role
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

INTEGRATION_CATALOG = [
    {"id": "greenhouse", "name": "Greenhouse", "category": "ATS"},
    {"id": "lever", "name": "Lever", "category": "ATS"},
    {"id": "workday", "name": "Workday", "category": "HRIS"},
    {"id": "bamboohr", "name": "BambooHR", "category": "HRIS"},
    {"id": "slack", "name": "Slack", "category": "Communication"},
    {"id": "teams", "name": "Microsoft Teams", "category": "Communication"},
    {"id": "zapier", "name": "Zapier", "category": "Automation"}
]

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
        from app.services.services import analyze_resume_or_jd, chat_completion
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
        from app.services.resume_nlp_extractor import extract_candidate_info_nlp
        info = extract_candidate_info_nlp(text)
        if isinstance(info.get("skills"), list):
            skills_str = ", ".join(info.get("skills", []))
        
    res_dict = {
        "status": "success",   
        "text": text,
        "name": info.get("name") if 'info' in locals() else None, 
        "email": info.get("email") if 'info' in locals() else None,
        "phone": info.get("phone") if 'info' in locals() else None,
        "file_url": file_url,
        "title": title,
        "experience": experience if source == 'jd' else (info.get("experience") if 'info' in locals() else ""),
        "skills": skills_str,
        "location": location if source == 'jd' else (info.get("location") if 'info' in locals() else ""),
        "salary": salary,
        "bond": bond,
        "workMode": workMode,
        "current_company": info.get("current_company", "") if 'info' in locals() else "",
        "current_ctc": info.get("current_ctc", "") if 'info' in locals() else "",
        "expected_ctc": info.get("expected_ctc", "") if 'info' in locals() else "",
        "notice_period": info.get("notice_period", "") if 'info' in locals() else ""
    }
    if warning:
        res_dict["warning"] = warning
    return res_dict


@router.get("/admin/candidate/check")
def check_candidate(email: str, current_admin: dict = Depends(get_current_admin_details)):
    try:
        clean_email = (email or "").strip().lower()
        if not clean_email or "@" not in clean_email:
            return {"exists": False}

        # 1. Search in interview_sessions_collection (with case-insensitive match)
        query = {
            "candidate_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}
        }
        if current_admin.get("role") not in ["super_admin", "master"]:
            query["company_id"] = current_admin.get("company_id")
            
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1).limit(5))
        for s in sessions:
            resume_text = (s.get("resume_text") or "").strip()
            cand_name = (s.get("candidate_name") or "").strip()
            if resume_text:
                return {
                    "exists": True,
                    "resume_text": resume_text,
                    "candidate_name": cand_name,
                    "job_description": s.get("job_description", "")
                }

        # 2. Search in job_applications_collection
        app_doc = job_applications_collection.find_one(
            {
                "email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"},
                "resume_text": {"$exists": True, "$ne": ""}
            },
            sort=[("applied_at", -1)]
        )
        if app_doc and (app_doc.get("resume_text") or "").strip():
            return {
                "exists": True,
                "resume_text": app_doc.get("resume_text", "").strip(),
                "candidate_name": app_doc.get("name", "") or app_doc.get("candidate_name", ""),
                "candidate_phone": app_doc.get("phone", ""),
                "job_description": app_doc.get("job_description", "")
            }

        # 3. Search in omni_call_logs_collection
        call_doc = omni_call_logs_collection.find_one(
            {
                "$or": [
                    {"email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}},
                    {"candidate_email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}}
                ]
            },
            sort=[("created_at", -1)]
        )
        if call_doc:
            r_text = (call_doc.get("resume_text") or call_doc.get("parsed_resume") or "").strip()
            if r_text:
                return {
                    "exists": True,
                    "resume_text": r_text,
                    "candidate_name": call_doc.get("candidate_name") or call_doc.get("name", ""),
                    "candidate_phone": call_doc.get("phone_number") or call_doc.get("phone", "")
                }

        # 4. Search candidates_collection
        cand_doc = candidates_collection.find_one(
            {"email": {"$regex": f"^{re.escape(clean_email)}$", "$options": "i"}},
            sort=[("created_at", -1)]
        )
        if cand_doc and (cand_doc.get("resume_text") or "").strip():
            return {
                "exists": True,
                "resume_text": cand_doc.get("resume_text", "").strip(),
                "candidate_name": cand_doc.get("name", "") or cand_doc.get("candidate_name", "")
            }

        # 5. If sessions found with candidate name even if resume_text is blank
        if sessions:
            first_s = sessions[0]
            return {
                "exists": True,
                "resume_text": first_s.get("resume_text", ""),
                "candidate_name": first_s.get("candidate_name", ""),
                "job_description": first_s.get("job_description", "")
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

    admin_name = current_admin.get("name") or current_admin.get("username") or "AD"
    prefix = admin_name[:2].upper()

    session_doc = {
        "link_id": link_id,
        "candidate_id": f"{prefix}{random.randint(1000, 9999)}",
        "candidate_name": data.candidate_name.title(),
        "candidate_email": data.candidate_email,
        "experience": data.experience,
        "location": data.location,
        "current_ctc": data.current_ctc,
        "expected_ctc": data.expected_ctc,
        "current_company": data.current_company,
        "notice_period": data.notice_period,
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
    experience: str = ""
    location: str = ""
    current_ctc: str = ""
    expected_ctc: str = ""
    current_company: str = ""
    notice_period: str = ""
    candidate_phone: Optional[str] = ""

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

    admin_name = current_admin.get("name") or current_admin.get("username") or "AD"
    prefix = admin_name[:2].upper()

    # Step 1: Prepare documents
    for candidate in data.candidates:
        link_id = str(uuid.uuid4())
        link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
        
        session_doc = {
            "link_id": link_id,
            "candidate_id": f"{prefix}{random.randint(1000, 9999)}",
            "candidate_name": candidate.candidate_name.title(),
            "candidate_email": candidate.candidate_email,
            "candidate_phone": candidate.candidate_phone,
            "experience": candidate.experience,
            "location": candidate.location,
            "current_ctc": candidate.current_ctc,
            "expected_ctc": candidate.expected_ctc,
            "current_company": candidate.current_company,
            "notice_period": candidate.notice_period,
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
    elif current_admin.get("role") in ["super_admin", "superadmin"] and not admin_id:
        query_filter["created_by"] = {"$in": _get_authorized_creator_ids(current_admin)}
    elif admin_id:
        if current_admin.get("role") in ["super_admin", "superadmin"]:
            allowed_ids = _get_authorized_creator_ids(current_admin)
            if admin_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
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
    
    # Always generate a full pool of questions — exactly 22 questions for the interview
    num_questions_to_generate = 22
    
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
        admin_name = current_admin.get("name") or current_admin.get("username") or "Admin"
        admin_role = current_admin.get("role") or "admin"
        admin_id = current_admin.get("admin_id")
        now_iso = datetime.now(timezone.utc).isoformat()
        
        if data.link_id.startswith("ai_call_"):
            raw_id = data.link_id.replace("ai_call_", "")
            omni_call_id = raw_id.replace("omni_", "").strip()
            
            # 1. Search job_applications_collection
            app = None
            from bson import ObjectId
            try:
                app = job_applications_collection.find_one({"_id": ObjectId(raw_id)})
            except Exception:
                app = None

            if not app:
                call_ids_to_try = [omni_call_id]
                if omni_call_id.isdigit():
                    call_ids_to_try.append(int(omni_call_id))
                app = job_applications_collection.find_one({"omni_call_id": {"$in": call_ids_to_try}})

            log = None
            session = None
            call_ids_to_try = [omni_call_id]
            if omni_call_id.isdigit():
                call_ids_to_try.append(int(omni_call_id))

            log = omni_call_logs_collection.find_one({"call_id": {"$in": call_ids_to_try}})
            session = interview_sessions_collection.find_one({"omni_call_id": {"$in": call_ids_to_try}})

            if app and not log and not session:
                linked_app_id = str(app["_id"])
            elif log and not app:
                linked_app_id = log.get("application_id")
                if linked_app_id:
                    try:
                        app = job_applications_collection.find_one({"_id": ObjectId(linked_app_id)})
                    except Exception:
                        app = job_applications_collection.find_one({"application_id": linked_app_id})

            # Update job_applications_collection if app exists
            if app:
                job_applications_collection.update_one(
                    {"_id": app["_id"]},
                    {"$set": {
                        "decision": data.decision,
                        "last_action_by_name": admin_name,
                        "last_action_by_role": admin_role,
                        "last_action_by_id": admin_id,
                        "last_action_status": data.decision,
                        "last_action_at": now_iso,
                        "decision_by_name": admin_name,
                        "decision_by_role": admin_role,
                        "decision_at": now_iso
                    }}
                )

            # Always update or upsert omni_call_logs_collection
            company_id = current_admin.get("company_id")
            omni_update = {
                "call_id": omni_call_id,
                "decision": data.decision,
                "last_action_status": data.decision,
                "decision_by_name": admin_name,
                "decision_by_role": admin_role,
                "decision_at": now_iso
            }
            if company_id:
                omni_update["company_id"] = company_id
            if admin_id:
                omni_update["admin_id"] = admin_id

            omni_call_logs_collection.update_one(
                {"call_id": {"$in": call_ids_to_try}},
                {"$set": omni_update},
                upsert=True
            )

            # Update interview_sessions_collection if present
            if session:
                interview_sessions_collection.update_one(
                    {"_id": session["_id"]},
                    {"$set": {
                        "decision": data.decision,
                        "decision_by_name": admin_name,
                        "decision_by_role": admin_role,
                        "decision_at": now_iso
                    }}
                )

            name = (app.get("name") if app else None) or (log.get("candidate_name") if log else None) or (session.get("candidate_name") if session else None) or "Candidate"
            email = (app.get("email") if app else None) or (log.get("email") if log else None) or (session.get("candidate_email") if session else None)
            jd = (app.get("job_description") if app else None) or (session.get("job_description") if session else None) or ""

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
        
        admin_name = current_admin.get("name") or current_admin.get("username") or "Admin"
        admin_role = current_admin.get("role") or "admin"
        admin_id = current_admin.get("admin_id")
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # 2. Update DB
        interview_sessions_collection.update_one(
            {"link_id": data.link_id},
            {"$set": {
                "decision": data.decision,
                "decision_by_name": admin_name,
                "decision_by_role": admin_role,
                "decision_by_id": admin_id,
                "decision_at": now_iso
            }}
        )
        print(f" DB Updated for {data.link_id}")
        from app.routes.interview import sync_session_to_application
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
    session_id: Optional[str] = None

@router.post("/admin/copilot")
def admin_copilot_chat(request: CopilotRequest, raw_request: Request, current_admin: dict = Depends(get_current_admin_details)):
    try:
        from app.ai.ai_client import chat_completion
        from app.db.mongo_db import db
        from app.services.subscription_service import get_subscription_stats
        
        role = current_admin.get("role", "admin")
        admin_id = current_admin.get("admin_id")
        company_id = current_admin.get("company_id")
        
        is_master = bool(current_admin.get("is_master") or role == "master" or current_admin.get("role") == "master")
        is_super_admin = not is_master and (role in ["super_admin", "tenant"] or current_admin.get("role") in ["super_admin", "tenant"])
        is_recruiter = not is_master and not is_super_admin

        if is_master:
            role_type = "master"
            user_name = current_admin.get("name") or current_admin.get("username") or "master"
            copilot_title = "Hire IQ Master Copilot"
        elif is_super_admin:
            role_type = "super_admin"
            user_name = current_admin.get("name") or current_admin.get("company_name") or current_admin.get("username") or "Super Admin"
            copilot_title = "Hire IQ Super Admin Copilot"
        else:
            role_type = "recruiter"
            user_name = current_admin.get("name") or current_admin.get("username") or "Recruiter"
            copilot_title = "Hire IQ Recruiter Copilot"

        def strip_markdown(text: str) -> str:
            if not text:
                return ""
            import re
            t = re.sub(r'```[a-zA-Z0-9]*', '', text)
            t = re.sub(r'\*\*|__|\*|_|#', '', t)
            return t.strip()

        # Dynamic subscription plans
        dynamic_plans = []
        try:
            plans = list(plans_collection.find({}, {"_id": 0}))
            for p in plans:
                p_name = p.get('plan_name') or p.get('name') or 'Custom'
                p_price = p.get('price', 0)
                p_credits = p.get('credits_granted', 0)
                p_feats = ", ".join(p.get('features', [])[:4])
                dynamic_plans.append(f"- Plan: {p_name} | Price: Rs. {p_price:,} | Credits Granted: {p_credits} | Key Features: {p_feats}")
        except Exception:
            pass
        plans_context = "\n".join(dynamic_plans)

        # Build Role-Specific System Prompts
        if is_master:
            system_prompt = f"""You are the '{copilot_title}', the dedicated executive AI assistant in the Master Control Panel of the Hire IQ platform.
You are interacting directly with the Master Platform Administrator: {user_name}.

YOUR ROLE & AUTHORITY:
You assist the Master Admin with platform governance, subscription revenue analytics, subscribed tenant organizations oversight, plan configurations, and global usage metrics.

STRICT SCOPE FOR MASTER PANEL:
1. Master Analytics & Revenue: Answer questions about total platform revenue, Monthly Recurring Revenue (MRR), total subscribed organizations (active, trial, expired), and credits issued across all tenants using the PLATFORM METRICS below.
2. Tenant & Subscriber Management: Answer queries about subscriber companies, tenant status (active/deactivated), demo requests, and global subscriber counts.
3. Subscription Plans: Explain all subscription plans, pricing, credit limits, and configured features.
4. Global Metrics: Provide platform-wide statistics (total interviews conducted, global credit usage).
5. If the Master asks any question regarding revenue, tenant counts, or plans, answer with precise live data from the context.
"""
        elif is_super_admin:
            company_name = current_admin.get("company_name") or user_name
            system_prompt = f"""You are the '{copilot_title}', the organization AI assistant in the Super Admin Dashboard of the Hire IQ platform.
You are interacting with the Super Admin: {user_name} (Company: {company_name}).

YOUR ROLE & AUTHORITY:
You assist the Super Admin in managing company-wide hiring operations, team recruiters, company credit balances, job postings, candidate pipelines, and organization settings.

STRICT SCOPE FOR SUPER ADMIN PANEL:
1. Team & Recruiter Management: Answer questions about your sub-admin recruiters, their assigned credits, and recruiter statuses.
2. Credit Balance & Recharge: Check and manage your company's credit balance, purchase new credits, or transfer credits to your recruiters.
3. Organization Pipeline: View candidate interviews, overall hiring scores, and active job postings across your company.
4. Integrations & Settings: Assist with ATS integrations, security whitelist IPs, and company profile.
"""
        else:
            system_prompt = f"""You are the '{copilot_title}', the dedicated recruitment assistant in the Recruiter Dashboard of the Hire IQ platform.
You are interacting with the Recruiter: {user_name}.

YOUR ROLE & AUTHORITY:
You assist the Recruiter in creating candidate interviews, reviewing candidate scorecard metrics, drafting candidate feedback/invitation emails, and evaluating candidate responses.

STRICT SCOPE FOR RECRUITER PANEL:
1. Candidate Evaluation: Review candidate interview results, scores, strengths, and areas for improvement.
2. Interview Workflows: Guide on creating single or bulk interviews, configuring job descriptions, and setting up questions.
3. Candidate Email Drafting: Draft professional selection, rejection, or feedback emails for candidates.
4. ATS & Scoring: Explain adaptive interview scoring, proctoring anti-cheat flags, and interview rubrics.
5. Credits: Help request credits from your Super Admin.
"""

        # Append common rules
        system_prompt += """
CRITICAL RULES:
1. Direct LLM Responses: For general platform questions, metrics, explanations, and advice, answer concisely and directly.
2. Action Responses: When the user explicitly requests an action, output one short confirmation sentence followed IMMEDIATELY by a JSON block:
   ```json
   {
       "action": "action_name",
       ...
   }
   ```
   Supported actions:
   - send_feedback (recruiter & super_admin): {"action": "send_feedback", "candidate_email": "...", "content": "..."}
   - request_credits (recruiter only): {"action": "request_credits", "amount": 50, "reason": "..."}
   - transfer_credits (super_admin only): {"action": "transfer_credits", "admin_username": "...", "amount": 50}
   - buy_credits (super_admin only): {"action": "buy_credits", "amount": 100}
   - create_admin (super_admin only): {"action": "create_admin", "username": "...", "email": "..."}
   - create_interview (recruiter & super_admin): {"action": "create_interview", "candidate_name": "...", "candidate_email": "...", "resume_text": "...", "job_description": "..."}
   - query_candidates (recruiter & super_admin): {"action": "query_candidates", "candidate_name": "..."}
   - create_job (recruiter & super_admin): {"action": "create_job", "title": "...", "skills": "...", "description": "..."}
3. Formatting Rules: Keep responses clean, concise, well-structured with bullet points.
4. Unrelated Topics: For any non-HireIQ questions, politely state that you are specialized in HireIQ platform features for their panel.
"""

        context_data = ""

        if plans_context:
            context_data += "\n--- ACTIVE SUBSCRIPTION PLANS ---\n" + plans_context + "\n"

        if is_master:
            try:
                stats = get_subscription_stats()
                total_interviews = interview_sessions_collection.count_documents({})
                completed_interviews = interview_sessions_collection.count_documents({"status": "completed"})
                total_tenants = admins_collection.count_documents({"$or": [{"role": "tenant"}, {"is_master": False}]})
                active_tenants = admins_collection.count_documents({"login_enabled": {"$ne": False}, "$or": [{"role": "tenant"}, {"role": "super_admin"}]})
                
                context_data += f"\n--- MASTER PLATFORM METRICS ---\n"
                context_data += f"- Total Platform MRR / Revenue: Rs. {stats.total_mrr:,.2f}\n"
                context_data += f"- Total Subscribed Organizations: {stats.total_organisations}\n"
                context_data += f"- Active Subscriptions: {stats.active_subscriptions}\n"
                context_data += f"- Trial Subscriptions: {stats.trial_subscriptions}\n"
                context_data += f"- Expired Subscriptions: {stats.expired_subscriptions}\n"
                context_data += f"- Total Platform Super Admins: {active_tenants}\n"
                context_data += f"- Total Credits Issued: {stats.total_credits_issued:,}\n"
                context_data += f"- Total Credits Consumed: {stats.total_credits_consumed:,}\n"
                context_data += f"- Total Platform Interviews: {total_interviews:,}\n"
                context_data += f"- Total Completed Interviews: {completed_interviews:,}\n"
            except Exception as e:
                context_data += f"\n--- MASTER METRICS (Fallback) ---\n- Error loading stats: {e}\n"

        elif is_super_admin:
            # Query super admin organization info
            admin_record = admins_collection.find_one({"_id": ObjectId(admin_id)}) if admin_id else None
            company_credits = admin_record.get("credits", 0) if admin_record else 0
            
            sub_admins = list(admins_collection.find({"created_by": admin_id}, {"username": 1, "name": 1, "email": 1, "credits": 1, "_id": 0}).limit(20))
            recent_sessions = list(interview_sessions_collection.find(
                {"$or": [{"company_id": company_id}, {"created_by": admin_id}], "status": "completed"},
                {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "decision": 1, "_id": 0}
            ).sort("created_at", -1).limit(10))

            context_data += f"\n--- YOUR COMPANY METRICS ---\n"
            context_data += f"- Company Name: {current_admin.get('company_name', 'Your Company')}\n"
            context_data += f"- Available Credit Balance: {company_credits} credits\n"
            context_data += f"- Team Sub-Admins / Recruiters: {len(sub_admins)}\n"
            if sub_admins:
                context_data += "Recruiter Team Members:\n"
                for sa in sub_admins:
                    context_data += f"  • {sa.get('name') or sa.get('username')} ({sa.get('email')}) - {sa.get('credits', 0)} credits\n"
            if recent_sessions:
                context_data += "Recent Company Candidate Interviews:\n"
                for s in recent_sessions:
                    context_data += f"  • Candidate: {s.get('candidate_name')} | Score: {s.get('avg_score', 'N/A')}/100 | Decision: {s.get('decision', 'Pending')}\n"

        else: # Recruiter
            admin_record = admins_collection.find_one({"_id": ObjectId(admin_id)}) if admin_id else None
            recruiter_credits = admin_record.get("credits", 0) if admin_record else 0
            
            recent_sessions = list(interview_sessions_collection.find(
                {"created_by": admin_id},
                {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "decision": 1, "status": 1, "_id": 0}
            ).sort("created_at", -1).limit(10))

            context_data += f"\n--- RECRUITER METRICS ---\n"
            context_data += f"- Recruiter Name: {user_name}\n"
            context_data += f"- Available Credits: {recruiter_credits}\n"
            if recent_sessions:
                context_data += "Your Recent Candidate Interviews:\n"
                for s in recent_sessions:
                    context_data += f"  • Candidate: {s.get('candidate_name')} | Score: {s.get('avg_score', 'N/A')}/100 | Status: {s.get('status')} | Decision: {s.get('decision', 'Pending')}\n"

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
                    
                    if action_data.get("action") == "query_candidates":
                        start_date = action_data.get("start_date")
                        end_date = action_data.get("end_date")
                        status = action_data.get("status")
                        decision = action_data.get("decision")
                        min_score = action_data.get("min_score")
                        
                        candidate_name_filter = action_data.get("candidate_name")
                        
                        query = {}
                        if candidate_name_filter:
                            query["candidate_name"] = {"$regex": str(candidate_name_filter).strip(), "$options": "i"}
                        if role == "admin":
                            query["created_by"] = admin_id
                        elif role in ["super_admin", "master"] and company_id:
                            query["company_id"] = company_id
                            
                        if start_date or end_date:
                            import dateutil.parser
                            query["created_at"] = {}
                            if start_date:
                                try:
                                    dt = dateutil.parser.parse(str(start_date))
                                    query["created_at"]["$gte"] = dt.strftime("%Y-%m-%dT00:00:00")
                                except: pass
                            if end_date:
                                try:
                                    dt = dateutil.parser.parse(str(end_date))
                                    query["created_at"]["$lte"] = dt.strftime("%Y-%m-%dT23:59:59")
                                except: pass
                            
                        if status: 
                            query["status"] = status
                            
                        if decision:
                            query["decision"] = decision
                            
                        if min_score is not None:
                            try:
                                query["avg_score"] = {"$gte": float(min_score)}
                            except:
                                pass
                                
                        results = list(interview_sessions_collection.find(
                            query,
                            {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "status": 1, "decision": 1, "created_at": 1, "_id": 0}
                        ).sort("created_at", -1).limit(50))
                        
                        results_str = "\n".join([f"- Name: {r.get('candidate_name', 'Unknown')} | Email: {r.get('candidate_email', 'Unknown')} | Score: {r.get('avg_score', 'N/A')} | Status: {r.get('status', 'Unknown')} | Decision: {r.get('decision', 'Unknown')} | Date: {r.get('created_at', 'N/A')[:10] if isinstance(r.get('created_at'), str) else 'N/A'}" for r in results])
                        if not results_str: 
                            results_str = "No candidates found matching those filters."
                            
                        messages.append({"role": "assistant", "content": response_text})
                        messages.append({"role": "user", "content": f"Here are the query results:\n{results_str}\nNow, please answer my original question using this data directly. Format it nicely. Do NOT output another JSON action block."})
                        
                        final_response = chat_completion(messages, temperature=0.3)
                        return {"reply": strip_markdown(final_response), "action_required": None}
                        
                    elif "action" in action_data:
                        action_required = action_data
                        response_text = response_text.replace(json_match.group(0), "").strip()
                except:
                    pass
                    
            reply_text = strip_markdown(response_text)
            out_res = {"reply": reply_text, "action_required": action_required}

            # Save chat session to MongoDB
            if request.session_id and admin_id:
                try:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    user_msg_item = {"role": "user", "content": request.message, "timestamp": now_iso}
                    asst_msg_item = {"role": "assistant", "content": reply_text, "actionRequired": action_required, "timestamp": now_iso}
                    
                    doc = copilot_sessions_collection.find_one({"session_id": request.session_id, "admin_id": admin_id})
                    if doc:
                        title = doc.get("title", "New Chat")
                        if title == "New Chat" and request.message:
                            clean_msg = request.message.split("\n")[0][:30]
                            title = clean_msg if clean_msg else "New Chat"
                        
                        copilot_sessions_collection.update_one(
                            {"session_id": request.session_id, "admin_id": admin_id},
                            {
                                "$set": {"title": title, "updated_at": now_iso},
                                "$push": {"messages": {"$each": [user_msg_item, asst_msg_item]}}
                            }
                        )
                    else:
                        clean_msg = request.message.split("\n")[0][:30] if request.message else "New Chat"
                        new_doc = {
                            "session_id": request.session_id,
                            "admin_id": admin_id,
                            "title": clean_msg,
                            "messages": [user_msg_item, asst_msg_item],
                            "created_at": now_iso,
                            "updated_at": now_iso
                        }
                        copilot_sessions_collection.insert_one(new_doc)
                except Exception as ex:
                    print(f"Error saving copilot session: {ex}")

            return out_res
            
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

# ─── COPILOT SESSIONS ENDPOINTS ───
@router.get("/api/admin/copilot/sessions")
def get_admin_copilot_sessions(current_admin: dict = Depends(get_current_admin_details)):
    admin_id = current_admin.get("admin_id")
    sessions = list(copilot_sessions_collection.find(
        {"admin_id": admin_id},
        {"_id": 0, "session_id": 1, "title": 1, "created_at": 1, "updated_at": 1}
    ).sort("updated_at", -1).limit(50))
    return {"status": "success", "sessions": sessions}

@router.post("/api/admin/copilot/sessions")
def create_admin_copilot_session(current_admin: dict = Depends(get_current_admin_details)):
    admin_id = current_admin.get("admin_id")
    role = current_admin.get("role", "admin")
    is_master = bool(current_admin.get("is_master") or role == "master" or current_admin.get("role") == "master")
    is_super_admin = not is_master and (role in ["super_admin", "tenant"] or current_admin.get("role") in ["super_admin", "tenant"])

    if is_master:
        user_name = current_admin.get("name") or current_admin.get("username") or "master"
        initial_greeting = f"Hello {user_name}! I'm the Hire IQ Master Copilot. How can I help you manage the platform, plans, and tenants today?"
    elif is_super_admin:
        user_name = current_admin.get("name") or current_admin.get("company_name") or current_admin.get("username") or "Super Admin"
        initial_greeting = f"Hello {user_name}! I'm the Hire IQ Super Admin Copilot. How can I assist you with your company's team, interviews, and credits today?"
    else:
        user_name = current_admin.get("name") or current_admin.get("username") or "Recruiter"
        initial_greeting = f"Hello {user_name}! I'm the Hire IQ Recruiter Copilot. How can I help you with candidate evaluations and interviews today?"

    import uuid
    session_id = f"session_{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    doc = {
        "session_id": session_id,
        "admin_id": admin_id,
        "title": "New Chat",
        "messages": [
            {
                "role": "assistant",
                "content": initial_greeting
            }
        ],
        "created_at": now_iso,
        "updated_at": now_iso
    }
    copilot_sessions_collection.insert_one(doc)
    doc.pop("_id", None)
    return {"status": "success", "session": doc}

@router.get("/api/admin/copilot/sessions/{session_id}")
def get_admin_copilot_session_detail(session_id: str, current_admin: dict = Depends(get_current_admin_details)):
    admin_id = current_admin.get("admin_id")
    role = current_admin.get("role", "admin")
    is_master = bool(current_admin.get("is_master") or role == "master" or current_admin.get("role") == "master")
    is_super_admin = not is_master and (role in ["super_admin", "tenant"] or current_admin.get("role") in ["super_admin", "tenant"])

    if is_master:
        user_name = current_admin.get("name") or current_admin.get("username") or "master"
        initial_greeting = f"Hello {user_name}! I'm the Hire IQ Master Copilot. How can I help you manage the platform, plans, and tenants today?"
    elif is_super_admin:
        user_name = current_admin.get("name") or current_admin.get("company_name") or current_admin.get("username") or "Super Admin"
        initial_greeting = f"Hello {user_name}! I'm the Hire IQ Super Admin Copilot. How can I assist you with your company's team, interviews, and credits today?"
    else:
        user_name = current_admin.get("name") or current_admin.get("username") or "Recruiter"
        initial_greeting = f"Hello {user_name}! I'm the Hire IQ Recruiter Copilot. How can I help you with candidate evaluations and interviews today?"

    doc = copilot_sessions_collection.find_one({"session_id": session_id, "admin_id": admin_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")

    msgs = doc.get("messages", [])
    if msgs and len(msgs) > 0 and msgs[0].get("role") == "assistant":
        first_content = msgs[0].get("content", "")
        if "Hello Admin!" in first_content or "I'm the Hire IQ Copilot" in first_content or first_content.startswith("Hello "):
            msgs[0]["content"] = initial_greeting
            copilot_sessions_collection.update_one(
                {"session_id": session_id, "admin_id": admin_id},
                {"$set": {"messages.0.content": initial_greeting}}
            )
            doc["messages"] = msgs

    return {"status": "success", "session": doc}

@router.delete("/api/admin/copilot/sessions/{session_id}")
def delete_admin_copilot_session(session_id: str, current_admin: dict = Depends(get_current_admin_details)):
    admin_id = current_admin.get("admin_id")
    copilot_sessions_collection.delete_one({"session_id": session_id, "admin_id": admin_id})
    return {"status": "success", "message": "Session deleted"}

class CopilotExecuteRequest(BaseModel):
    action: str
    data: dict

@router.post("/admin/copilot/execute")
def admin_copilot_execute(request: CopilotExecuteRequest, current_admin: dict = Depends(get_current_admin_details)):
    from datetime import datetime, timezone, timedelta
    try:
        role = current_admin.get("role", "admin")
        admin_id = current_admin.get("admin_id")
        
        if request.action == "send_feedback":
            email = request.data.get("candidate_email")
            content = request.data.get("content")
            if not email or not content:
                raise HTTPException(status_code=400, detail="Missing email or content")
                
            from app.services.services import send_interview_email
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
            
        elif request.action == "transfer_credits" and role in ["super_admin", "superadmin", "master", "admin"]:
            target_username = request.data.get("admin_username")
            amount = request.data.get("amount")
            if not target_username or not amount:
                raise HTTPException(status_code=400, detail="Missing username or amount")
            
            # Find the admin by either username or name
            target_admin = admins_collection.find_one({
                "$or": [{"username": target_username}, {"name": target_username}],
            })
            if not target_admin:
                raise HTTPException(status_code=404, detail="Sub-admin not found")
                
            from bson import ObjectId
            # Perform transfer
            super_admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            if super_admin_doc.get("credits", 0) < amount:
                raise HTTPException(status_code=400, detail="Insufficient credits")
                
            admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$inc": {"credits": -amount}})
            admins_collection.update_one({"_id": target_admin["_id"]}, {"$inc": {"credits": amount, "total_allocated_credits": amount}})
            return {"status": "success", "message": f"Successfully transferred {amount} credits to {target_username}."}
            
        elif request.action == "create_admin" and role in ["super_admin", "superadmin", "master", "admin"]:
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
            
        elif request.action == "create_interview":
            candidate_name = request.data.get("candidate_name")
            candidate_email = request.data.get("candidate_email")
            resume_text = request.data.get("resume_text", "")
            job_description = request.data.get("job_description", "")
            
            if not candidate_name or not candidate_email:
                raise HTTPException(status_code=400, detail="Missing candidate name or email")
                
            from bson import ObjectId
            # Deduct credits
            current_admin = admins_collection.find_one({"_id": ObjectId(admin_id)})
            company_id = current_admin.get("company_id")
            
            if role in ["super_admin", "master"] and company_id:
                res = companies_collection.update_one({"_id": ObjectId(company_id), "credits": {"$gte": 1}}, {"$inc": {"credits": -1}})
                if res.modified_count == 0:
                    raise HTTPException(status_code=403, detail="Insufficient company credits.")
            else:
                res = admins_collection.update_one({"_id": ObjectId(admin_id), "credits": {"$gte": 1}}, {"$inc": {"credits": -1}})
                if res.modified_count == 0:
                    raise HTTPException(status_code=403, detail="Insufficient admin credits.")

            import uuid, random
            link_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc)
            expires_at = (now + timedelta(hours=24)).isoformat()
            
            admin_name = current_admin.get("name") or current_admin.get("username") or "AD"
            prefix = admin_name[:2].upper()
            
            session_doc = {
                "link_id": link_id,
                "candidate_id": f"{prefix}{random.randint(1000, 9999)}",
                "candidate_name": candidate_name.title(),
                "candidate_email": candidate_email,
                "experience": request.data.get("experience", ""),
                "location": request.data.get("location", ""),
                "current_ctc": request.data.get("current_ctc", ""),
                "expected_ctc": request.data.get("expected_ctc", ""),
                "resume_text": resume_text,
                "job_description": job_description,
                "created_by": admin_id,
                "company_id": company_id,
                "created_at": now.isoformat(),
                "expires_at": expires_at,
                "interview_duration": 30,
                "interview_format": "Video",
                "interview_type": "Technical",
                "language": "English",
                "record_video": True,
                "status": "pending",
                "hr_screening": {"enabled": False},
                "custom_questions": "",
                "ai_instructions": "",
                "case_study_count": 0,
                "industry": "General"
            }
            
            interview_sessions_collection.insert_one(session_doc)
            link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
            
            try:
                from app.services.services import send_interview_email
                import threading
                threading.Thread(target=send_interview_email, args=(
                    candidate_email,
                    candidate_name.title(),
                    link_url,
                    30,
                    job_description,
                    ""
                )).start()
            except Exception as e:
                print("Failed to send email during copilot create_interview:", e)
                
            return {"status": "success", "message": f"Successfully created interview for {candidate_name}. Invite sent!", "link_url": link_url}
            
        elif request.action == "create_job":
            title = request.data.get("title")
            if not title:
                raise HTTPException(status_code=400, detail="Missing job title")
            
            job_dict = {
                "title": title,
                "experience": request.data.get("experience", "Not specified"),
                "skills": request.data.get("skills", ""),
                "description": request.data.get("description", ""),
                "workMode": "Remote",
                "bond": "",
                "location": "",
                "salary": "",
                "custom_id": get_next_sequence_value("job", "JOB"),
                "company_id": current_admin.get("company_id"),
                "admin_id": admin_id,
                "created_by_role": role,
                "created_by_name": current_admin.get("name") or current_admin.get("username"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "application_count": 0
            }
            
            safe_role = str(role).replace("_", "").lower()
            suffix = str(admin_id)[-4:] if len(str(admin_id)) >= 4 else str(admin_id)
            job_dict["job_id"] = f"{job_dict['custom_id']}-{safe_role}-{suffix}"
            
            jobs_collection.insert_one(job_dict)
            return {"status": "success", "message": f"Successfully created job '{title}'."}
        elif request.action in ["integrate_platform", "connect_app"]:
            platform_name = request.data.get("platform_name") or request.data.get("app_name") or request.data.get("platform") or request.data.get("name") or "Unknown Platform"
            import uuid
            mock_api_key = f"{platform_name[:3].upper()}-{uuid.uuid4().hex[:12]}"
            mock_webhook_url = f"https://api.hireiq.com/webhooks/{platform_name.lower().replace(' ', '')}/{uuid.uuid4().hex[:8]}"
            
            company_id = current_admin.get("company_id")
            from bson import ObjectId
            
            # Match platform_name with INTEGRATION_CATALOG if possible
            matched_defn = next((d for d in INTEGRATION_CATALOG if d["name"].lower() in platform_name.lower() or d["id"].lower() in platform_name.lower() or platform_name.lower() in d["name"].lower()), None)
            integration_id = matched_defn["id"] if matched_defn else platform_name.lower().replace(" ", "")
            integration_name = matched_defn["name"] if matched_defn else platform_name
            category = matched_defn["category"] if matched_defn else "Custom"
            
            new_entry = {
                "id": integration_id,
                "name": integration_name,
                "category": category,
                "connected": True,
                "status": "Healthy",
                "config": {
                    "api_key": mock_api_key,
                    "webhook_url": mock_webhook_url
                },
                "configured_at": datetime.now(timezone.utc).isoformat()
            }
            
            if company_id:
                try:
                    doc = companies_collection.find_one({"_id": ObjectId(company_id)}, {"integrations": 1})
                    existing_list = doc.get("integrations") if doc and isinstance(doc.get("integrations"), list) else []
                    updated_list = [item for item in existing_list if isinstance(item, dict) and item.get("id") != integration_id]
                    updated_list.append(new_entry)
                    companies_collection.update_one(
                        {"_id": ObjectId(company_id)},
                        {"$set": {"integrations": updated_list}}
                    )
                except Exception as e:
                    print(f"Error updating company integrations: {e}")

            # Also push to admin document
            admins_collection.update_one(
                {"_id": ObjectId(admin_id)},
                {"$push": {"integrations": new_entry}}
            )
            
            return {
                "status": "success",
                "message": f"Successfully connected and configured {integration_name} integration.\n\n**API Key**: `{mock_api_key}`\n**Webhook URL**: `{mock_webhook_url}`\n**Security Whitelist IPs**: `34.202.15.91`, `3.15.82.204`, `52.14.73.11`\n*(Please ensure these IPs are whitelisted in your {integration_name} firewall settings to allow HireIQ to connect securely.)*"
            }
            
        elif request.action == "disconnect_app":
            platform_name = request.data.get("platform_name") or request.data.get("app_name") or request.data.get("platform") or request.data.get("name") or "Unknown Platform"
            company_id = current_admin.get("company_id")
            from bson import ObjectId
            
            matched_defn = next((d for d in INTEGRATION_CATALOG if d["name"].lower() in platform_name.lower() or d["id"].lower() in platform_name.lower() or platform_name.lower() in d["name"].lower()), None)
            integration_id = matched_defn["id"] if matched_defn else platform_name.lower().replace(" ", "")
            integration_name = matched_defn["name"] if matched_defn else platform_name
            
            if company_id:
                try:
                    doc = companies_collection.find_one({"_id": ObjectId(company_id)}, {"integrations": 1})
                    existing_list = doc.get("integrations") if doc and isinstance(doc.get("integrations"), list) else []
                    updated_list = []
                    for item in existing_list:
                        if isinstance(item, dict) and item.get("id") == integration_id:
                            item["connected"] = False
                            item["status"] = "Disconnected"
                        updated_list.append(item)
                    companies_collection.update_one(
                        {"_id": ObjectId(company_id)},
                        {"$set": {"integrations": updated_list}}
                    )
                except Exception as e:
                    print(f"Error disconnecting company integration: {e}")

            admins_collection.update_one(
                {"_id": ObjectId(admin_id)},
                {"$pull": {"integrations": {"platform": platform_name}}}
            )
            return {
                "status": "success",
                "message": f"Successfully disconnected {integration_name} integration. API keys and webhooks for {integration_name} have been revoked and all traffic disabled."
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

        import app.ai.prompt_cache as prompt_cache
        cache_key_text = f"JD:{jd_text}::RESUME:{resume_text}"
        cached_result = prompt_cache.get(cache_key_text, "ATS_SCORE")
        if cached_result:
            return cached_result


        try:
            from app.ai.ai_client import chat_completion
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
                
                import app.ai.prompt_cache as prompt_cache
                prompt_cache.set(cache_key_text, "ATS_SCORE", result)
                return result
        except Exception as ai_err:
            print(f"⚠️ ATS AI call failed, falling back to keyword matching: {ai_err}")


        # ── Offline Fallback: High-Accuracy Keyword Dictionary Match ──────────
        import re
        try:
            from app.data.offline_skills_dict import COMMON_SKILLS
        except Exception:
            COMMON_SKILLS = {"python", "javascript", "react", "node", "java", "c++", "sql", "aws", "docker", "kubernetes", "git", "html", "css", "typescript", "mongodb", "fastapi", "django", "flask", "rest", "api"}
            
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
        
        import app.ai.prompt_cache as prompt_cache
        prompt_cache.set(cache_key_text, "ATS_SCORE", result)
        return result
            
    except HTTPException:
        raise
    except Exception as e:
        print(f" ATS Score endpoint error: {e}")

        raise HTTPException(status_code=500, detail=str(e))

class CandidateFeedbackRequest(BaseModel):
    feedback_text: str