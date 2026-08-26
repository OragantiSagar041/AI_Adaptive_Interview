"""
app/routes_split/jobs.py — Jobs and applications
Auto-split from routes.py lines 11880–12228.
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
from app.services.services import get_current_admin_details
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

from app.routes.admin_dashboard import extract_info_from_resume
from app.routes.ai_calls import sync_call_status_helper

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/jobs")
def create_job(job: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    job_dict = job.dict()
    job_dict["custom_id"] = get_next_sequence_value("job", "JOB")
    
    admin_id = current_admin["admin_id"]
    role = current_admin.get("role", "admin")
    
    # Store isolation & creator metadata
    job_dict["company_id"] = current_admin.get("company_id")
    job_dict["admin_id"] = admin_id
    job_dict["created_by_id"] = admin_id
    job_dict["created_by_role"] = role
    creator_name = current_admin.get("name") or current_admin.get("username") or "Admin"
    job_dict["created_by_name"] = creator_name
    job_dict["created_by_email"] = current_admin.get("email") or ""
    job_dict["created_by"] = creator_name
    
    # Custom format: JOB-[custom_id]-[role]-[admin_id_suffix]
    safe_role = str(role).replace("_", "").lower()
    suffix = str(admin_id)[-4:] if len(str(admin_id)) >= 4 else str(admin_id)
    job_id = f"{job_dict['custom_id']}-{safe_role}-{suffix}"
    
    job_dict["job_id"] = job_id
    job_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    job_dict["application_count"] = 0
    
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
    skip = (page - 1) * limit

    role = current_admin.get("role")
    admin_id = current_admin.get("admin_id")
    company_id = current_admin.get("company_id")

    query = {}
    if company_id:
        query["company_id"] = company_id
        
    if role != "master":
        query["admin_id"] = {"$in": _get_authorized_creator_ids(current_admin)}
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

    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") and job.get("admin_id") not in allowed_ids and current_admin.get("role") != "master":
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {k: v for k, v in job_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Preserve original creator ownership (admin_id & company_id) so job is not disowned or hidden
    if not update_data.get("admin_id"):
        update_data["admin_id"] = job.get("admin_id") or current_admin.get("admin_id")
    if not update_data.get("company_id") and job.get("company_id"):
        update_data["company_id"] = job.get("company_id")

    result = jobs_collection.update_one({"_id": job["_id"]}, {"$set": update_data})
    if result.matched_count == 0:
        jobs_collection.update_one({"job_id": job_id}, {"$set": update_data})
        
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

    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") not in allowed_ids:
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

@router.get("/api/public/jobs/company/{company_id}")
def get_public_company_jobs(company_id: str):
    """
    Fetch all active public jobs for a specific company.
    Mirrors the dashboard logic by only selecting jobs created by authorized admins.
    """
    from bson import ObjectId
    
    # 1. Get the company name
    company_name = "Unknown Company"
    try:
        company = companies_collection.find_one({"_id": ObjectId(company_id)})
        if company:
            company_name = company.get("name") or company.get("company_name", "Unknown Company")
    except Exception:
        pass
        
    # 2. Get all authorized admin IDs for this company
    admin_ids = []
    try:
        org_admins = list(admins_collection.find({"company_id": company_id}, {"_id": 1}))
        admin_ids = [str(a["_id"]) for a in org_admins]
        # Also include the company_id itself just in case it acts as an admin_id in some legacy records
        if company_id not in admin_ids:
            admin_ids.append(company_id)
    except Exception:
        admin_ids = [company_id]
        
    # 3. Query jobs that belong to these admins (exactly how dashboard does it)
    query = {
        "admin_id": {"$in": admin_ids}
    }
    
    jobs = list(jobs_collection.find(query).sort("created_at", -1))
    
    # 4. Clean up jobs for public consumption
    public_jobs = []
    for j in jobs:
        j["_id"] = str(j["_id"])
        public_jobs.append(j)
        
    return {
        "status": "success", 
        "company_name": company_name, 
        "jobs": public_jobs
    }
UPLOAD_RESUMES_DIR = os.path.join(os.getcwd(), "uploads", "resumes")
UPLOAD_COVER_LETTERS_DIR = os.path.join(os.getcwd(), "uploads", "cover_letters")
os.makedirs(UPLOAD_RESUMES_DIR, exist_ok=True)
os.makedirs(UPLOAD_COVER_LETTERS_DIR, exist_ok=True)

@router.get("/api/public/resumes/{filename}")
def get_uploaded_resume_file(filename: str, current_admin: dict = Depends(get_current_admin_details)):
    """Serve locally stored resumes if not using Cloudinary."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_RESUMES_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Resume file not found")
    media_type = "application/pdf" if safe_filename.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=safe_filename)

@router.get("/api/public/cover_letters/{filename}")
def get_uploaded_cover_letter_file(filename: str, current_admin: dict = Depends(get_current_admin_details)):
    """Serve locally stored cover letters."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_COVER_LETTERS_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Cover letter file not found")
    media_type = "application/pdf" if safe_filename.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=safe_filename, content_disposition_type="inline")


@router.post("/api/public/jobs/{job_id}/apply")
async def apply_for_job(
    job_id: str,
    request: Request,
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    resume_url: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
    cover_letter: Optional[str] = Form(None),
    resume_file: Optional[UploadFile] = File(None),
    cover_letter_file: Optional[UploadFile] = File(None),
):
    """
    Accept a job application submitted as multipart/form-data with file uploads
    or as JSON. Validates the job exists, extracts text from uploaded resumes/cover letters,
    persists the application document, and increments application_count.
    """
    try:
        job = jobs_collection.find_one({"job_id": job_id})
        if not job:
            from bson import ObjectId
            if ObjectId.is_valid(job_id):
                job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    except InvalidId:
        pass # Ignore InvalidId and proceed to 404
    except Exception as db_err:
        logger.error(f"[JobApply] Database error looking up job {job_id}: {db_err}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable. Please try again later.")

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    actual_job_id = job.get("job_id") or str(job["_id"])

    # Fallback to JSON payload if request was application/json
    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            body = await request.json()
            name = body.get("name") or name
            email = body.get("email") or email
            phone = body.get("phone") or phone
            resume_url = body.get("resume_url") or resume_url
            linkedin_url = body.get("linkedin_url") or linkedin_url
            cover_letter = body.get("cover_letter") or cover_letter
        except Exception:
            pass

    if not name or not email:
        raise HTTPException(status_code=422, detail="Name and email are required to apply")

    from app.services.services import extract_text_from_file

    resume_filename = None
    resume_text = ""
    saved_resume_url = (resume_url or "").strip()

    # Process uploaded resume file
    if resume_file and resume_file.filename:
        resume_filename = resume_file.filename
        try:
            file_bytes = await resume_file.read()
            if len(file_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Resume file size exceeds 5MB limit")
            
            # Simple magic byte / extension check
            ext = os.path.splitext(resume_filename)[1].lower()
            if ext not in ['.pdf', '.docx', '.doc', '.txt']:
                raise HTTPException(status_code=400, detail="Invalid resume file type. Allowed: PDF, DOCX, DOC, TXT")
            
            if len(file_bytes) >= 4:
                header = file_bytes[:4]
                is_valid_magic = False
                if ext == '.pdf' and header == b'%PDF':
                    is_valid_magic = True
                elif ext == '.docx' and header == b'PK\x03\x04':
                    is_valid_magic = True
                elif ext == '.doc' and header == b'\xd0\xcf\x11\xe0':
                    is_valid_magic = True
                elif ext == '.txt':
                    is_valid_magic = True
                
                if not is_valid_magic:
                    raise HTTPException(status_code=400, detail="File content does not match its extension signature")
                
            if file_bytes:
                # Extract text
                extracted = extract_text_from_file(file_bytes, resume_filename)
                if extracted:
                    resume_text = extracted

                # Upload to Cloudinary or save locally
                cloud_uploaded = False
                try:
                    upload_res = cloudinary.uploader.upload(
                        file_bytes,
                        folder="job_resumes",
                        resource_type="raw"
                    )
                    if upload_res and upload_res.get("secure_url"):
                        saved_resume_url = upload_res.get("secure_url")
                        cloud_uploaded = True
                        logger.info(f"[JobApply] Resume uploaded to Cloudinary: {saved_resume_url}")
                except Exception as cloud_err:
                    logger.warning(f"Cloudinary resume upload skipped/failed: {cloud_err}")

                if not cloud_uploaded:
                    try:
                        unique_id = uuid.uuid4().hex[:10]
                        safe_name = f"{unique_id}_{os.path.basename(resume_filename)}"
                        local_path = os.path.join(UPLOAD_RESUMES_DIR, safe_name)
                        logger.info(f"[JobApply] Saving resume locally to: {local_path}")
                        with open(local_path, "wb") as f:
                            f.write(file_bytes)
                        saved_resume_url = f"/api/public/resumes/{safe_name}"
                        logger.info(f"[JobApply] Resume saved locally. URL: {saved_resume_url}")
                    except Exception as local_err:
                        logger.error(f"[JobApply] Local resume save FAILED: {local_err}", exc_info=True)
                        saved_resume_url = ""
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing uploaded resume file: {e}", exc_info=True)
            saved_resume_url = ""

    # If saved_resume_url is a bare filename (not a URL or path), clear it
    if saved_resume_url and not saved_resume_url.startswith(('http://', 'https://', '/')):
        logger.warning(f"[JobApply] Clearing invalid resume_url (bare filename): '{saved_resume_url}'")
        saved_resume_url = ""

    # Process uploaded cover letter file
    cover_letter_filename = None
    cover_letter_url = ""
    if cover_letter_file and cover_letter_file.filename:
        cover_letter_filename = cover_letter_file.filename
        try:
            cl_bytes = await cover_letter_file.read()
            if len(cl_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Cover letter file size exceeds 5MB limit")
                
            ext = os.path.splitext(cover_letter_filename)[1].lower()
            if ext not in ['.pdf', '.docx', '.doc', '.txt']:
                raise HTTPException(status_code=400, detail="Invalid cover letter file type. Allowed: PDF, DOCX, DOC, TXT")
                
            if cl_bytes:
                cl_extracted = extract_text_from_file(cl_bytes, cover_letter_filename)
                if cl_extracted and not cover_letter:
                    cover_letter = cl_extracted

                cloud_uploaded = False
                try:
                    upload_res = cloudinary.uploader.upload(
                        cl_bytes,
                        folder="job_cover_letters",
                        resource_type="auto"
                    )
                    if upload_res and upload_res.get("secure_url"):
                        cover_letter_url = upload_res.get("secure_url")
                        cloud_uploaded = True
                except Exception as cloud_err:
                    logger.warning(f"Cloudinary cover letter upload skipped/failed: {cloud_err}")

                if not cloud_uploaded:
                    unique_id = uuid.uuid4().hex[:10]
                    safe_name = f"{unique_id}_{os.path.basename(cover_letter_filename)}"
                    local_path = os.path.join(UPLOAD_COVER_LETTERS_DIR, safe_name)
                    with open(local_path, "wb") as f:
                        f.write(cl_bytes)
                    cover_letter_url = f"/api/public/cover_letters/{safe_name}"
        except Exception as e:
            logger.error(f"Error processing uploaded cover letter file: {e}")

    parsed_info = {}
    if resume_text:
        try:
            from app.services.resume_nlp_extractor import extract_candidate_info_nlp
            parsed_info = extract_candidate_info_nlp(resume_text) or {}
        except Exception as p_err:
            logger.warning(f"[JobApply] NLP info extraction error: {p_err}")

    app_dict = {
        "job_id": actual_job_id,
        "company_id": job.get("company_id"),
        "admin_id": job.get("admin_id"),
        "job_title": job.get("title"),
        "name": name,
        "email": email,
        "candidate_email": email,
        "phone": phone or "",
        "resume_url": saved_resume_url,
        "resume_filename": resume_filename,
        "resume_text": resume_text,
        "linkedin_url": linkedin_url or (parsed_info.get("linkedin_url") if isinstance(parsed_info, dict) else "") or "",
        "skills": parsed_info.get("skills", []) if isinstance(parsed_info, dict) else [],
        "experience": parsed_info.get("experience", "") if isinstance(parsed_info, dict) else "",
        "location": parsed_info.get("location", "") if isinstance(parsed_info, dict) else "",
        "current_company": parsed_info.get("current_company", "") if isinstance(parsed_info, dict) else "",
        "notice_period": parsed_info.get("notice_period", "") if isinstance(parsed_info, dict) else "",
        "cover_letter": cover_letter or "",
        "cover_letter_url": cover_letter_url,
        "cover_letter_filename": cover_letter_filename,
        "status": "Pending Review",
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }

    result = job_applications_collection.insert_one(app_dict)
    # Atomically increment application_count on the parent job
    jobs_collection.update_one(
        {"_id": job["_id"]},
        {"$inc": {"application_count": 1}},
    )
    logger.info(f"[JobApply] New application for job_id={actual_job_id} by {email}, _id={result.inserted_id}")
    return {
        "status": "success",
        "message": "Application submitted successfully",
        "application_id": str(result.inserted_id),
        "resume_url": saved_resume_url,
        "resume_filename": resume_filename,
    }

@router.get("/api/jobs/{job_id}/applications")
def get_job_applications(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns all applications submitted for a given job_id.
    Enforces multi-tenant job access verification.
    """
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Data Isolation Check
    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") not in allowed_ids:
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
    
    from app.services.services import extract_text_from_file
    import os
    from bson import ObjectId
    
    for a in applications:
        a["_id"] = str(a["_id"])
        if not a.get("resume_text") and a.get("resume_url"):
            r_url = a.get("resume_url")
            try:
                text = None
                if os.path.exists(r_url):
                    with open(r_url, "rb") as f:
                        text = extract_text_from_file(f.read(), r_url)
                elif r_url.startswith("http://") or r_url.startswith("https://"):
                    resp = requests.get(r_url, timeout=10)
                    if resp.status_code == 200:
                        text = extract_text_from_file(resp.content, r_url)
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

    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") not in allowed_ids:
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

    now_iso = datetime.now(timezone.utc).isoformat()
    action_by_name = current_admin.get("name") or current_admin.get("username") or "Admin"
    action_by_email = current_admin.get("email") or ""
    action_by_role = current_admin.get("role") or "admin"
    action_by_id = current_admin.get("admin_id")

    log_entry = {
        "status": new_status,
        "action": f"Status changed to {new_status}",
        "action_by_id": action_by_id,
        "action_by_name": action_by_name,
        "action_by_email": action_by_email,
        "action_by_role": action_by_role,
        "timestamp": now_iso
    }

    result = job_applications_collection.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": new_status,
                "updated_at": now_iso,
                "last_action_by_id": action_by_id,
                "last_action_by_name": action_by_name,
                "last_action_by_email": action_by_email,
                "last_action_by_role": action_by_role,
                "last_action_status": new_status,
                "last_action_at": now_iso
            },
            "$push": {
                "action_history": log_entry
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {
        "status": "success",
        "message": f"Status updated to '{new_status}'",
        "last_action_by_name": action_by_name,
        "last_action_by_role": action_by_role,
        "last_action_at": now_iso
    }

# pyrefly: ignore [missing-import]
import pypdf
import io

@router.post("/api/public/jobs/parse-resume")
def parse_resume(resume: UploadFile = File(...)):
    try:
        allowed_extensions = {".pdf", ".docx", ".doc", ".txt"}
        filename = (resume.filename or "").lower()
        ext = os.path.splitext(filename)[1]
        
        allowed_types = {
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "text/plain",
            "application/octet-stream",
        }
        if ext not in allowed_extensions and resume.content_type and resume.content_type not in allowed_types:
            raise HTTPException(status_code=415, detail="Only PDF, DOCX, DOC, and TXT resumes are supported")

        if getattr(resume, "size", 0) and resume.size > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Resume exceeds the 10 MB limit")

        content = resume.file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Resume exceeds the 10 MB limit")
        
        from app.services.services import extract_text_from_file
        extracted_text = extract_text_from_file(content, resume.filename or "resume.pdf") or ""

        if not extracted_text.strip():
            return {
                "status": "success",
                "data": {
                    "name": "", "email": "", "phone": "", "linkedin_url": "",
                    "skills": [], "experience": "", "location": "", "resume_text": ""
                }
            }

        from app.services.resume_nlp_extractor import extract_candidate_info_nlp
        parsed_data = extract_candidate_info_nlp(extracted_text)
        if isinstance(parsed_data, dict):
            parsed_data["resume_text"] = extracted_text

        return {
            "status": "success", 
            "data": parsed_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing resume: {e}")
        return {"status": "error", "message": str(e), "data": {"name": "", "email": "", "phone": "", "linkedin_url": "", "skills": [], "resume_text": ""}}

# ---------------------------------------------------------------------------
# Demo Requests
# ---------------------------------------------------------------------------
from app.schemas.models import DemoRequestCreate, DemoRequestUpdate
from app.db.mongo_db import demo_requests_collection
from bson import ObjectId
from datetime import datetime

