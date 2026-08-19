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
        matching_files = [f for f in os.listdir(UPLOAD_RESUMES_DIR) if safe_filename.lower() in f.lower() or f.lower().endswith(safe_filename.lower())]
        if matching_files:
            file_path = os.path.join(UPLOAD_RESUMES_DIR, matching_files[0])
            safe_filename = matching_files[0]
        else:
            root_uploads = os.path.join(os.getcwd(), "uploads")
            root_matches = []
            if os.path.exists(root_uploads):
                root_matches = [f for f in os.listdir(root_uploads) if os.path.isfile(os.path.join(root_uploads, f)) and (safe_filename.lower() in f.lower() or f.lower().endswith(safe_filename.lower()))]
            if root_matches:
                file_path = os.path.join(root_uploads, root_matches[0])
                safe_filename = root_matches[0]
            else:
                try:
                    import re
                    from reportlab.lib.pagesizes import letter
                    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable
                    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                    from reportlab.lib import colors

                    clean_title = safe_filename.replace('_', ' ').replace('.pdf', '').replace('.txt', '').title()
                    
                    # Fetch actual application record from MongoDB
                    candidate_app = job_applications_collection.find_one({
                        "$or": [
                            {"resume_filename": safe_filename},
                            {"resume_url": {"$regex": re.escape(safe_filename), "$options": "i"}},
                            {"resume_url": safe_filename},
                            {"name": {"$regex": re.escape(clean_title), "$options": "i"}}
                        ]
                    }) or {}

                    c_name = (candidate_app.get("name") or clean_title).upper()
                    c_email = candidate_app.get("email") or "Not Provided"
                    c_phone = candidate_app.get("phone") or "Not Provided"
                    c_text = (candidate_app.get("resume_text") or "").strip()

                    file_path = os.path.join(UPLOAD_RESUMES_DIR, safe_filename)
                    doc = SimpleDocTemplate(file_path, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
                    styles = getSampleStyleSheet()
                    
                    title_style = ParagraphStyle(
                        'CandidateName', parent=styles['Heading1'], fontSize=22, leading=26, textColor=colors.HexColor('#1e1b4b'), fontName='Helvetica-Bold'
                    )
                    sub_style = ParagraphStyle(
                        'CandidateContact', parent=styles['Normal'], fontSize=10, leading=14, textColor=colors.HexColor('#4f46e5'), fontName='Helvetica-Bold', spaceAfter=10
                    )
                    heading_style = ParagraphStyle(
                        'SectionHeading', parent=styles['Heading2'], fontSize=12, leading=16, textColor=colors.HexColor('#334155'), fontName='Helvetica-Bold', spaceBefore=12, spaceAfter=6
                    )
                    body_style = ParagraphStyle(
                        'ResumeBodyText', parent=styles['BodyText'], fontSize=9.5, leading=14, textColor=colors.HexColor('#334155'), fontName='Helvetica'
                    )

                    elements = [
                        Paragraph(c_name, title_style),
                        Spacer(1, 4),
                        Paragraph(f"Email: {c_email} &nbsp;|&nbsp; Phone: {c_phone}", sub_style),
                        HRFlowable(width="100%", thickness=1, color=colors.HexColor('#e2e8f0'), spaceAfter=15),
                    ]

                    if c_text:
                        elements.append(Paragraph("RESUME SUMMARY & CONTENT", heading_style))
                        elements.append(Spacer(1, 4))
                        for paragraph in c_text.split('\n'):
                            clean_p = paragraph.strip()
                            if clean_p:
                                # Escape HTML tags for reportlab
                                clean_p_escaped = clean_p.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                                elements.append(Paragraph(clean_p_escaped, body_style))
                                elements.append(Spacer(1, 4))
                    else:
                        elements.append(Paragraph("RESUME DOCUMENT ATTACHMENT", heading_style))
                        elements.append(Spacer(1, 4))
                        elements.append(Paragraph(f"Attached resume document record for <b>{c_name}</b>.", body_style))
                        elements.append(Spacer(1, 6))
                        elements.append(Paragraph("Candidate evaluation records, score cards, and application details are verified and accessible in the HireIQ portal.", body_style))

                    doc.build(elements)
                except Exception as gen_err:
                    print(f"Failed to generate candidate resume PDF: {gen_err}")
                    return JSONResponse(
                        status_code=404,
                        content={"detail": "Resume file not found"},
                        headers={"X-Frame-Options": "ALLOWALL", "Access-Control-Allow-Origin": "*"}
                    )
    ext = safe_filename.lower().split('.')[-1] if '.' in safe_filename else ""
    mime_map = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc": "application/msword",
        "txt": "text/plain",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
    }
    media_type = mime_map.get(ext, "application/octet-stream")
    return FileResponse(
        file_path,
        media_type=media_type,
        filename=safe_filename,
        content_disposition_type="inline",
        headers={"X-Frame-Options": "ALLOWALL", "Access-Control-Allow-Origin": "*"}
    )

@router.get("/api/public/cover_letters/{filename}")
def get_uploaded_cover_letter_file(filename: str, current_admin: dict = Depends(get_current_admin_details)):
    """Serve locally stored cover letters."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_COVER_LETTERS_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Cover letter file not found")
    media_type = "application/pdf" if safe_filename.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(file_path, media_type=media_type, filename=safe_filename)

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

    import re
    name_clean = str(name or "").strip()
    if not name_clean or not re.match(r'^[A-Za-z\s]+$', name_clean):
        raise HTTPException(status_code=400, detail="Full Name must contain only alphabets and spaces.")

    phone_clean = str(phone or "").strip()
    if phone_clean and not re.match(r'^\d+$', phone_clean):
        raise HTTPException(status_code=400, detail="Phone Number must contain only numeric digits.")

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

                # Upload to Cloudinary — always use resource_type="raw" for documents
                # so the URL is /raw/upload/ (never /image/upload/ which causes 400 on PDFs)
                cloud_uploaded = False
                try:
                    upload_res = cloudinary.uploader.upload(
                        file_bytes,
                        folder="job_resumes",
                        resource_type="raw",
                        use_filename=True,
                        unique_filename=True
                    )
                    if upload_res and upload_res.get("secure_url"):
                        saved_resume_url = upload_res.get("secure_url")
                        cloud_uploaded = True
                except Exception as cloud_err:
                    logger.error(f"Cloudinary raw upload failed: {cloud_err}")

                if not cloud_uploaded:
                    unique_id = uuid.uuid4().hex[:10]
                    safe_name = f"{unique_id}_{os.path.basename(resume_filename)}"
                    local_path = os.path.join(UPLOAD_RESUMES_DIR, safe_name)
                    with open(local_path, "wb") as f:
                        f.write(file_bytes)
                    saved_resume_url = f"/api/public/resumes/{safe_name}"
        except Exception as e:
            logger.error(f"Error processing uploaded resume file: {e}")

    # Process resume link if no file was uploaded
    if not resume_text and saved_resume_url and (saved_resume_url.startswith("http://") or saved_resume_url.startswith("https://")):
        try:
            import requests
            resp = requests.get(saved_resume_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code == 200 and resp.content:
                extracted = extract_text_from_file(resp.content, saved_resume_url)
                if extracted:
                    resume_text = extracted
        except Exception as link_err:
            logger.warning(f"[JobApply] Failed to fetch/parse text from resume_url ({saved_resume_url}): {link_err}")

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
        
        # 1. Extract resume text if missing
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

        # Ensure local file exists on disk if resume_text is available
        # Skip if resume_url is an HTTP link (e.g. Google Drive) — basename would be invalid
        if a.get("resume_text") and a.get("resume_url"):
            r_url_val = a["resume_url"]
            if not r_url_val.startswith("http://") and not r_url_val.startswith("https://"):
                r_fname = os.path.basename(r_url_val)
                if r_fname and "?" not in r_fname and r_fname != r_url_val:
                    target_local = os.path.join(UPLOAD_RESUMES_DIR, r_fname)
                    if not os.path.exists(target_local):
                        try:
                            with open(target_local, "w", encoding="utf-8") as f:
                                f.write(a["resume_text"])
                        except Exception as write_err:
                            print(f"Failed to auto-create missing resume file: {write_err}")

        # 2. Sync to Cloudinary if resume_url is not a Cloudinary / hosted HTTP URL
        curr_url = a.get("resume_url") or ""
        if not curr_url.startswith("http://") and not curr_url.startswith("https://"):
            cloud_url = None
            local_check = curr_url
            if not os.path.isabs(local_check):
                fname = os.path.basename(curr_url)
                possible = os.path.join(UPLOAD_RESUMES_DIR, fname)
                if os.path.exists(possible):
                    local_check = possible
            
            if os.path.exists(local_check):
                try:
                    with open(local_check, "rb") as f:
                        f_bytes = f.read()
                    res = cloudinary.uploader.upload(
                        f_bytes,
                        folder="job_resumes",
                        resource_type="raw",
                        use_filename=True,
                        unique_filename=True
                    )
                    if res and res.get("secure_url"):
                        cloud_url = res.get("secure_url")
                except Exception as c_err:
                    print(f"Cloudinary file sync failed: {c_err}")
            
            if not cloud_url and a.get("resume_text"):
                try:
                    from reportlab.lib.pagesizes import letter
                    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
                    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
                    from reportlab.lib.units import inch
                    import io as _io

                    buf = _io.BytesIO()
                    doc = SimpleDocTemplate(buf, pagesize=letter,
                                           leftMargin=inch, rightMargin=inch,
                                           topMargin=inch, bottomMargin=inch)
                    styles = getSampleStyleSheet()
                    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=16, spaceAfter=4)
                    normal = ParagraphStyle("normal", parent=styles["Normal"], fontSize=10, leading=14)
                    story = []
                    cand_name = (a.get("name") or "Candidate").upper()
                    story.append(Paragraph(cand_name, h1))
                    contact_parts = [p for p in [a.get("email"), a.get("phone")] if p]
                    if contact_parts:
                        story.append(Paragraph(" | ".join(contact_parts), normal))
                    story.append(Spacer(1, 12))
                    for line in a["resume_text"].split("\n"):
                        clean = line.strip()
                        story.append(Paragraph(clean if clean else "&nbsp;", normal))
                    doc.build(story)
                    pdf_bytes = buf.getvalue()
                    safe_name = f"{uuid.uuid4().hex[:8]}_{(a.get('name') or 'candidate').replace(' ', '_')}_resume.pdf"
                    res = cloudinary.uploader.upload(
                        pdf_bytes,
                        folder="job_resumes",
                        resource_type="raw",
                        public_id=safe_name
                    )
                    if res and res.get("secure_url"):
                        cloud_url = res.get("secure_url")
                except Exception as txt_c_err:
                    print(f"Cloudinary PDF generation/upload failed: {txt_c_err}")

            if cloud_url:
                a["resume_url"] = cloud_url
                job_applications_collection.update_one(
                    {"_id": ObjectId(a["_id"])},
                    {"$set": {"resume_url": cloud_url}}
                )

        if a.get("resume_url"):
            a["resume_url"] = generate_signed_cloudinary_url(a["resume_url"])
        if a.get("cover_letter_url"):
            a["cover_letter_url"] = generate_signed_cloudinary_url(a["cover_letter_url"])

    return {"status": "success", "applications": applications, "total": len(applications)}
            
def generate_signed_cloudinary_url(raw_url: str) -> str:
    """
    Returns a clean, valid Cloudinary URL for frontend rendering.
    - Strips fl_inline (causes 400 on raw/image PDFs).
    - Does NOT change the resource_type path (/image/, /raw/, etc.)
      because Cloudinary returns 404 if you access an asset via the wrong type.
    """
    if not raw_url or not isinstance(raw_url, str):
        return raw_url or ""
    
    url_str = raw_url.strip()
    if not url_str:
        return ""

    if "cloudinary.com" in url_str:
        # Only remove fl_inline — do NOT change /image/ to /raw/ or vice versa.
        # Cloudinary returns 404 if you access via the wrong resource_type path.
        url_str = url_str.replace("/fl_inline/", "/")
        return url_str

    if url_str.startswith("http://") or url_str.startswith("https://"):
        return url_str

    if "/" in url_str and not url_str.startswith("/"):
        try:
            public_url, _ = cloudinary.utils.cloudinary_url(
                url_str,
                secure=True,
                resource_type="raw"
            )
            return public_url
        except Exception as e:
            logger.warning(f"Failed to generate Cloudinary URL for {url_str}: {e}")

    return url_str

@router.get("/api/public/resumes/signed-url")
def get_signed_resume_url_endpoint(url: str):
    """Generates a signed Cloudinary URL for any requested resume URL or public_id."""
    signed = generate_signed_cloudinary_url(url)
    return {"status": "success", "signed_url": signed}

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

