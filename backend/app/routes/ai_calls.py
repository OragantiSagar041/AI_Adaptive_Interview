"""
app/routes_split/ai_calls.py — AI calling agent routes
Auto-split from routes.py lines 10706–11646.
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
    RazorpayOrderRequest, MAIN_LOOP, get_current_admin_details
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/calls/initiate/{session_id}")
async def initiate_ai_call(session_id: str, request: Request, current_admin: dict = Depends(get_current_admin_details)):
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
        
    _require_admin_session_access(session_data, current_admin)
        
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
        from app.ai import omni_dimension_client
        response = omni_dimension_client.start_omni_call(
            phone_number=phone_number,
            candidate_name=candidate_name,
            job_description=job_description,
            resume_text=resume_text,
            duration=duration,
            skills=skills
        )
        
        call_id = ""
        if isinstance(response, dict):
            if "json" in response and isinstance(response["json"], dict):
                call_id = str(response["json"].get("requestId") or response["json"].get("call_id") or "")
            if not call_id:
                call_id = str(response.get("requestId") or response.get("call_id") or "")
        else:
            call_id = str(response)
        
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
    resume: UploadFile = File(None),
    current_admin: dict = Depends(get_current_admin_details)
):
    """
    Initiates an outbound AI call via Omni Dimension manually, without requiring an existing session.
    """
    import re
    raw_phone = (phone_number or "").strip()
    digits_only = re.sub(r'\D', '', raw_phone)
    if len(digits_only) == 12 and digits_only.startswith("91"):
        digits_only = digits_only[2:]
    elif len(digits_only) == 11 and digits_only.startswith("0"):
        digits_only = digits_only[1:]

    if not digits_only or len(digits_only) != 10 or not digits_only.isdigit():
        raise HTTPException(
            status_code=400,
            detail="Invalid phone number. Phone number must be a valid 10-digit mobile number."
        )

    phone_number = digits_only

    try:
        from app.ai import omni_dimension_client
        from app.services.services import extract_text_from_file
        
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
                        text = None
                        if os.path.exists(r_url):
                            with open(r_url, "rb") as f:
                                text = extract_text_from_file(f.read(), r_url)
                        elif r_url.startswith("http://") or r_url.startswith("https://"):
                            resp = requests.get(r_url, timeout=10)
                            if resp.status_code == 200:
                                text = extract_text_from_file(resp.content, r_url)
                        elif r_url.startswith("/api/public/resumes/"):
                            local_fname = os.path.basename(r_url)
                            local_fpath = os.path.join(os.getcwd(), "uploads", "resumes", local_fname)
                            if os.path.exists(local_fpath):
                                with open(local_fpath, "rb") as f:
                                    text = extract_text_from_file(f.read(), local_fpath)
                        if text:
                            resume_text = text
                            job_applications_collection.update_one(
                                {"_id": ObjectId(application_id)},
                                {"$set": {"resume_text": text}}
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
        
        call_id = ""
        if isinstance(response, dict):
            if "json" in response and isinstance(response["json"], dict):
                call_id = str(response["json"].get("requestId") or response["json"].get("call_id") or "")
            if not call_id:
                call_id = str(response.get("requestId") or response.get("call_id") or "")
        else:
            call_id = str(response)
        
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
            "admin_id": current_admin.get("admin_id"),
            "company_id": current_admin.get("company_id"),
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


class CandidateBulkCallItem(BaseModel):
    phone_number: str
    candidate_name: Optional[str] = "Candidate"
    job_description: Optional[str] = ""
    job_id: Optional[str] = None
    application_id: Optional[str] = None

class BulkAICallRequest(BaseModel):
    candidates: List[CandidateBulkCallItem]
    default_job_description: Optional[str] = ""

@router.post("/api/calls/initiate-bulk-manual")
async def initiate_bulk_manual_ai_calls(
    req: BulkAICallRequest,
    current_admin: dict = Depends(get_current_admin_details)
):
    """
    Initiates outbound AI calls in bulk for a list of candidates parsed from Excel/CSV or form data.
    """
    import re
    if not req.candidates:
        raise HTTPException(status_code=400, detail="Candidate list cannot be empty")

    results = []
    success_count = 0
    fail_count = 0

    from app.ai import omni_dimension_client

    for item in req.candidates:
        raw_phone = (item.phone_number or "").strip()
        digits_only = re.sub(r'\D', '', raw_phone)
        if len(digits_only) == 12 and digits_only.startswith("91"):
            digits_only = digits_only[2:]
        elif len(digits_only) == 11 and digits_only.startswith("0"):
            digits_only = digits_only[1:]

        c_name = item.candidate_name or "Candidate"
        c_jd = (item.job_description or "").strip() or (req.default_job_description or "").strip()

        if not digits_only or len(digits_only) < 10 or len(digits_only) > 15:
            fail_count += 1
            results.append({
                "phone_number": raw_phone,
                "candidate_name": c_name,
                "status": "failed",
                "detail": "Invalid phone number length"
            })
            continue

        phone_number = digits_only

        try:
            response = omni_dimension_client.start_omni_call(
                phone_number=phone_number,
                candidate_name=c_name,
                job_description=c_jd,
                resume_text="",
                duration=30,
                skills=""
            )

            call_id = ""
            if isinstance(response, dict):
                if "json" in response and isinstance(response["json"], dict):
                    call_id = str(response["json"].get("requestId") or response["json"].get("call_id") or "")
                if not call_id:
                    call_id = str(response.get("requestId") or response.get("call_id") or "")
            else:
                call_id = str(response)

            omni_call_logs_collection.insert_one({
                "call_id": call_id,
                "candidate_name": c_name,
                "phone_number": phone_number,
                "status": "initiated",
                "duration": "0m 0s",
                "recording_url": None,
                "job_id": item.job_id,
                "application_id": item.application_id,
                "admin_id": current_admin.get("admin_id"),
                "company_id": current_admin.get("company_id"),
                "created_at": datetime.now(timezone.utc).isoformat()
            })

            success_count += 1
            results.append({
                "phone_number": phone_number,
                "candidate_name": c_name,
                "call_id": call_id,
                "status": "success",
                "detail": f"AI Call initiated to {phone_number}"
            })
        except Exception as e:
            fail_count += 1
            results.append({
                "phone_number": phone_number,
                "candidate_name": c_name,
                "status": "failed",
                "detail": str(e)
            })

    return {
        "status": "success",
        "total": len(req.candidates),
        "success_count": success_count,
        "fail_count": fail_count,
        "results": results
    }


# ─── Omni Dimension Agent Data Routes ─────────────────────────────────────────

@router.get("/api/calls/agent-settings")
def get_omni_agent_settings(current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    """Fetch the Omni Dimension Agent settings."""
    from app.ai.omni_dimension_client import get_cached_omni_json, get_omni_account, set_cached_omni_json
    try:
        cached = get_cached_omni_json(omni_api_key, "agent-settings")
        if cached is not None:
            return {"settings": cached}
        _, agent, _ = get_omni_account(omni_api_key)
        set_cached_omni_json(omni_api_key, "agent-settings", agent)
        return {"settings": agent}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Failed to fetch agent settings: {str(e)}"})


@router.get("/api/calls/knowledge-base")
def get_omni_knowledge_base(current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    """Fetch the Knowledge Base files from Omni Dimension."""
    from app.ai.omni_dimension_client import get_cached_omni_json, get_omni_client, set_cached_omni_json
    try:
        cached = get_cached_omni_json(omni_api_key, "knowledge-base")
        if cached is not None:
            return {"files": cached, "success": True}
        client = get_omni_client(omni_api_key)
        res = client.knowledge_base.list()
        data = res.get('json', res)
        files = data.get("files", [])
        set_cached_omni_json(omni_api_key, "knowledge-base", files)
        return {"files": files, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/integrations")
def get_omni_integrations(current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    """Fetch integrations for the agent from Omni Dimension."""
    from app.ai.omni_dimension_client import get_cached_omni_json, get_omni_account, set_cached_omni_json
    try:
        cached = get_cached_omni_json(omni_api_key, "integrations")
        if cached is not None:
            return {"integrations": cached, "success": True}
        client, _, agent_id = get_omni_account(omni_api_key)
        res = client.integrations.get_agent_integrations(agent_id=agent_id)
        data = res.get('json', res)
        integrations = data.get("integrations", [])
        set_cached_omni_json(omni_api_key, "integrations", integrations)
        return {"integrations": integrations, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/integrations/user")
def get_user_integrations(current_admin: dict = Depends(get_current_admin_details)):
    from app.ai.omni_dimension_client import get_omni_client
    try:
        client = get_omni_client()
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

class IntegrationJsonRequest(BaseModel):
    integration: dict

@router.post("/api/calls/integrations/calendly")
def create_calendly_integration(req: CalendlyIntegrationRequest, current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    from app.ai.omni_dimension_client import get_omni_account
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
        
        # Depending on SDK response format, integration data might be nested
        integration_data = data.get("integration", data) if isinstance(data, dict) else data
        integration_id = integration_data.get("id") if isinstance(integration_data, dict) else getattr(integration_data, "id", None)
        
        if integration_id:
            client.integrations.add_integration_to_agent(agent_id=agent_id, integration_id=integration_id)
            
        return {"success": True, "integration": integration_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

@router.post("/api/calls/integrations/from-json")
def create_integration_from_json(req: IntegrationJsonRequest, current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    from app.ai.omni_dimension_client import get_omni_account
    try:
        client, _, agent_id = get_omni_account(omni_api_key)
        res = client.integrations.create_integration_from_json(req.integration)
        data = res.get('json', res) if isinstance(res, dict) else res
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
def create_custom_api_integration(req: CustomApiIntegrationRequest, current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    from app.ai.omni_dimension_client import get_omni_account
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
def detach_integration(req: DetachIntegrationRequest, current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    from app.ai.omni_dimension_client import get_omni_account
    try:
        client, _, agent_id = get_omni_account(omni_api_key)
        client.integrations.remove_integration_from_agent(agent_id=agent_id, integration_id=req.integration_id)
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/call-config")
def get_omni_call_config(current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    """Fetch call configuration from agent settings."""
    from app.ai.omni_dimension_client import get_omni_account
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


class CallConfigRequestModel(BaseModel):
    silence_timeout: Optional[int] = None
    speech_speed: Optional[float] = None
    max_call_duration_in_sec: Optional[int] = None
    is_end_call_enabled: Optional[bool] = None
    end_call_condition: Optional[str] = None
    end_call_message: Optional[str] = None
    voicemail_enabled: Optional[bool] = None
    voicemail_message: Optional[str] = None
    background_noise_enabled: Optional[bool] = None
    background_noice_name: Optional[str] = None
    background_audio_volume: Optional[float] = None
    initial_ringing_sound_enabled: Optional[bool] = None
    is_transfer_enabled: Optional[bool] = None
    first_ideal_message: Optional[str] = None
    second_ideal_message: Optional[str] = None
    last_ideal_message: Optional[str] = None
    user_idle_threshold_sec: Optional[int] = None
    min_speech_duration_ms: Optional[int] = None

@router.post("/api/calls/call-config")
def update_omni_call_config(req: CallConfigRequestModel, current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    """Update call configuration in Omni Dimension."""
    from app.ai.omni_dimension_client import get_omni_account
    try:
        client, agent, agent_id = get_omni_account(omni_api_key)
        update_data = {k: v for k, v in req.dict().items() if v is not None}
        
        try:
            if hasattr(client, 'agent') and hasattr(client.agent, 'update'):
                client.agent.update(agent_id=agent_id, **update_data)
        except Exception as sdk_e:
            print(f"SDK Call Config update note: {sdk_e}")

        updated_config = {**agent, **update_data}
        return {"success": True, "config": updated_config, "message": "Call configuration updated successfully!"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/post-call-config")
def get_omni_post_call_config(current_admin: dict = Depends(get_current_admin_details)):
    omni_api_key = None
    """Fetch post-call configuration from agent settings."""
    from app.ai.omni_dimension_client import get_omni_account
    try:
        _, agent, _ = get_omni_account(omni_api_key)
        post_call = agent.get("post_call_config_ids", [])
        return {"post_call_configs": post_call, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


class ExtractedVariable(BaseModel):
    key: str
    description: str

class PostCallConfigPayload(BaseModel):
    delivery_method: str
    destination: str
    webhook_url: str
    trigger_call_statuses: List[str]
    call_summary: bool = False
    full_conversation: bool = False
    sentiment_analysis: bool = False
    extracted_information: bool = False
    extracted_variables: List[ExtractedVariable] = []


@router.post("/api/calls/post-call-config")
def update_omni_post_call_config(payload: PostCallConfigPayload, current_admin: dict = Depends(get_current_admin_details)):
    """Update post-call configuration directly into Omni Dimension agent."""
    omni_api_key = None
    from app.ai.omni_dimension_client import get_omni_account, set_cached_omni_json
    try:
        client, agent, agent_id = get_omni_account(omni_api_key)
        
        new_config = {
            "delivery_method": payload.delivery_method,
            "destination": payload.destination,
            "webhook_url": payload.webhook_url,
            "trigger_call_statuses": payload.trigger_call_statuses,
            "include_summary": payload.call_summary,
            "include_full_conversation": payload.full_conversation,
            "include_sentiment": payload.sentiment_analysis,
            "include_extracted_info": payload.extracted_information,
            "extracted_variables": [v.dict() for v in payload.extracted_variables]
        }
        
        # Update the agent in Omni Dimension
        client.agent.update(agent_id=agent_id, data={"post_call_config_ids": [new_config]})
        
        # Invalidate local cache so the next GET fetches fresh data
        set_cached_omni_json(omni_api_key, "account", None)
        
        return {"success": True, "message": "Updated successfully"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/recent-calls")
def get_omni_recent_calls(current_admin: dict = Depends(get_current_admin_details)):

    """Fetch recent call logs directly from Omni Dimension SDK, including all evaluation scores."""
    from app.ai.omni_dimension_client import get_omni_client, get_omni_agent_id
    try:
        client = get_omni_client()
        
        # ── PAGINATED LOOP: fetch ALL pages from Omni Dimension ──────────────
        # IMPORTANT: Do NOT pass agent_id — passing it causes the API to return 0 records
        # even when calls exist. Fetch without it to get ALL historical + new calls.
        
        # Pre-fetch admins for ID generation and name resolution
        admins_in_company = list(admins_collection.find({"company_id": current_admin.get("company_id")}, {"name": 1, "username": 1, "role": 1}))
        admin_map = {str(a["_id"]): a for a in admins_in_company}
        
        my_admin = admin_map.get(current_admin.get("admin_id")) or {}

        all_calls = []
        page = 1
        page_size = 100     # max records per request
        max_pages = 20      # safety cap: 20 x 100 = 2,000 calls max

        while page <= max_pages:
            res  = client.call.get_call_logs(page=page, page_size=page_size)
            data = res.get("json", res) if isinstance(res, dict) else {}

            # Omni API returns calls under 'call_log_data' key
            page_calls = (
                data.get("call_log_data")
                or data.get("calls")
                or data.get("call_logs")
                or data.get("data")
                or data.get("results")
                or []
            )
            if not isinstance(page_calls, list) or not page_calls:
                break

            all_calls.extend(page_calls)

            # Stop when we've consumed all available records
            total_records = data.get("total_records") or 0
            if len(all_calls) >= total_records or len(page_calls) < page_size:
                break

            page += 1
            
        role = current_admin.get("role")
        company_id = current_admin.get("company_id")
        admin_id = current_admin.get("admin_id")
        
        # 1. Fetch all calls for this company to identify creators and decisions
        session_query = {"omni_call_id": {"$exists": True, "$ne": None}}
        manual_query = {"call_id": {"$exists": True, "$ne": None}}
        
        if role != "master" and company_id:
            session_query["company_id"] = company_id
            manual_query["$or"] = [
                {"company_id": company_id},
                {"company_id": {"$exists": False}},
                {"company_id": None}
            ]
        
        all_sessions = list(interview_sessions_collection.find(session_query, {"omni_call_id": 1, "created_by": 1, "candidate_name": 1, "name": 1, "decision": 1}))
        all_manuals = list(omni_call_logs_collection.find(manual_query, {"call_id": 1, "admin_id": 1, "candidate_name": 1, "name": 1, "decision": 1}))

        session_map = {str(s.get("omni_call_id")): s for s in all_sessions if s.get("omni_call_id")}
        manual_map = {str(m.get("call_id")): m for m in all_manuals if m.get("call_id")}

        # 2. Get current admin names/usernames to match against user_name for unknown calls
        current_admin_identifiers = set()
        my_admin = admins_collection.find_one({"_id": ObjectId(current_admin.get("admin_id"))}) or {}
        
        adm_name = (my_admin.get("name") or "").strip().lower()
        if adm_name:
            current_admin_identifiers.add(adm_name)
            
        adm_username = (my_admin.get("username") or "").strip().lower()
        if adm_username:
            current_admin_identifiers.add(adm_username)

        # Filter API calls strictly based on creator
        filtered_calls = []
        for call in all_calls:
            if not isinstance(call, dict):
                continue
            
            cid = str(call.get("id") or call.get("call_id") or "")
            req_id = str(call.get("call_request_id", {}).get("id") or "")
            
            creator_id = None
            if cid in session_map:
                creator_id = str(session_map[cid].get("created_by") or "")
            elif req_id in session_map and req_id:
                creator_id = str(session_map[req_id].get("created_by") or "")
            elif cid in manual_map:
                creator_id = str(manual_map[cid].get("admin_id") or "")
            elif req_id in manual_map and req_id:
                creator_id = str(manual_map[req_id].get("admin_id") or "")
            
            if creator_id:
                # If we know who made the call, strictly limit visibility to authorized creators
                allowed_ids = _get_authorized_creator_ids(current_admin)
                if creator_id in allowed_ids:
                    filtered_calls.append(call)
            else:
                # If the call is unknown (e.g. inbound directly to Omni), fallback to string matching
                u_name = str(call.get("user_name") or "").strip().lower()
                is_current = False
                if u_name and current_admin_identifiers:
                    # Use exact matching for better isolation, instead of partial 'in' matches
                    is_current = any(ident == u_name or ident in u_name.split() for ident in current_admin_identifiers)
                if is_current:
                    filtered_calls.append(call)
                    
        all_calls = filtered_calls
        print(f"[DEBUG] Total filtered_calls for {current_admin.get('admin_id')}: {len(all_calls)}")

        # Normalise each call record to extract evaluation / score fields
        normalised = []
        
        # Pre-fetch admins for ID generation
        admins_in_company = list(admins_collection.find({"company_id": current_admin.get("company_id")}, {"name": 1, "username": 1, "role": 1}))
        admin_map = {str(a["_id"]): a for a in admins_in_company}
        super_admin = next((a for a in admins_in_company if a.get("role") == "super_admin"), None)
        sa_prefix = (super_admin.get("name") or super_admin.get("username") or "SA")[:2].upper() if super_admin else "SA"
        
        for c in all_calls:
            if not isinstance(c, dict):
                continue
            rec     = dict(c)
            call_id = str(rec.get("id") or rec.get("call_id") or "")

            # ── Resolve candidate name ──────────────────────────────────────
            # Priority: extracted_variables.full_name → user_name → to_number
            extracted = rec.get("extracted_variables") or {}
            if isinstance(extracted, str):
                try:
                    import json as _json
                    extracted = _json.loads(extracted)
                except Exception:
                    extracted = {}
            req_id  = str(rec.get("call_request_id", {}).get("id") or "")

            # Ignore placeholders from Omni Dimension
            api_c_name = rec.get("candidate_name")
            if api_c_name in ("Not provided", "Unknown", "", None):
                api_c_name = None
                
            c_name = (
                extracted.get("full_name")
                or api_c_name
                or rec.get("user_name")
                or rec.get("to_number")
                or "Unknown"
            )
            
            # Prioritize our database records which have the manually entered names
            if call_id in session_map and (session_map[call_id].get("candidate_name") or session_map[call_id].get("name")):
                c_name = session_map[call_id].get("candidate_name") or session_map[call_id].get("name")
            elif req_id in session_map and (session_map[req_id].get("candidate_name") or session_map[req_id].get("name")):
                c_name = session_map[req_id].get("candidate_name") or session_map[req_id].get("name")
            elif call_id in manual_map and (manual_map[call_id].get("candidate_name") or manual_map[call_id].get("name")):
                c_name = manual_map[call_id].get("candidate_name") or manual_map[call_id].get("name")
            elif req_id in manual_map and (manual_map[req_id].get("candidate_name") or manual_map[req_id].get("name")):
                c_name = manual_map[req_id].get("candidate_name") or manual_map[req_id].get("name")
                
            rec["candidate_name"] = c_name

            # Expose extracted profile fields to the frontend
            rec["extracted_role"]           = extracted.get("current_role") or ""
            rec["extracted_experience"]     = extracted.get("years_experience") or ""
            rec["extracted_city"]           = extracted.get("current_city") or ""
            rec["extracted_qualification"]  = extracted.get("highest_qualification") or ""
            rec["extracted_company"]        = extracted.get("current_company") or ""
            rec["extracted_salary"]         = extracted.get("current_salary") or ""

            
            creator_id = None
            if call_id in session_map:
                creator_id = session_map[call_id].get("created_by")
            elif req_id in session_map:
                creator_id = session_map[req_id].get("created_by")
            elif call_id in manual_map:
                creator_id = manual_map[call_id].get("admin_id")
            elif req_id in manual_map:
                creator_id = manual_map[req_id].get("admin_id")
                
            if not creator_id and c.get("user_name"):
                u_name = str(c.get("user_name")).strip().lower()
                for a_id, a in admin_map.items():
                    a_name = (a.get("name") or "").strip().lower()
                    a_user = (a.get("username") or "").strip().lower()
                    if (a_name and (a_name in u_name or u_name in a_name)) or (a_user and (a_user in u_name or u_name in a_user)):
                        creator_id = a_id
                        break

            creator   = admin_map.get(str(creator_id)) if creator_id else None
            su_prefix = (creator.get("name") or creator.get("username") or "AD")[:2].upper() if creator else sa_prefix
            ca_prefix = c_name[:2].upper()
            
            rec["candidate_id"] = f"{sa_prefix}{su_prefix}{ca_prefix}{call_id[-4:] if len(call_id) >= 4 else call_id}"

            
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
            
            # Decision mapping (selected / rejected / pending)
            dec = None
            if call_id in manual_map:
                dec = manual_map[call_id].get("decision")
            elif req_id in manual_map:
                dec = manual_map[req_id].get("decision")
            elif call_id in session_map:
                dec = session_map[call_id].get("decision")
            elif req_id in session_map:
                dec = session_map[req_id].get("decision")
            rec["decision"] = dec or rec.get("decision") or "pending"

            normalised.append(rec)
            
        return {"calls": normalised, "success": True, "total": len(normalised)}
    except Exception as e:
        import traceback
        print(f"[recent-calls ERROR] {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": str(e)})

# ──────────────────────────────────────────────────────────────────────────────

@router.get("/api/calls/logs/{call_id}")
def get_omni_call_log_details(call_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """
    Fetches the detailed log for a specific call directly from Omni Dimension with DB fallback,
    normalizing all evaluation metrics, sentiment, CQS scores, summaries, and extracted profile variables.
    """
    from app.ai import omni_dimension_client
    log_data = None
    try:
        response = omni_dimension_client.get_omni_call_status(str(call_id))
        data = response.get('json', response) if isinstance(response, dict) else {}
        if isinstance(data, dict):
            calls = (
                data.get("call_log_data")
                or data.get("calls")
                or data.get("call_logs")
                or data.get("data")
                or data.get("results")
                or []
            )
            if isinstance(calls, list) and len(calls) > 0:
                log_data = calls[0]
            elif isinstance(data, dict) and (data.get("id") or data.get("call_id") or data.get("call_status")):
                log_data = data
    except Exception as e:
        print(f"[get_omni_call_log_details] Omni API fetch warning for {call_id}: {e}")

    # Fallback to local MongoDB collections if log_data not retrieved from Omni API
    if not log_data:
        call_ids = [str(call_id)]
        if str(call_id).isdigit():
            call_ids.append(int(call_id))
        db_log = omni_call_logs_collection.find_one({"call_id": {"$in": call_ids}}) or interview_sessions_collection.find_one({"omni_call_id": {"$in": call_ids}})
        if db_log:
            db_log["_id"] = str(db_log["_id"])
            log_data = db_log

    if not log_data:
        raise HTTPException(status_code=404, detail="Call log details not found in Omni Dimension or Database.")

    # Cross-tenant check: if log belongs to a session, verify access
    # We first try to find a session linked to this call
    linked_session = interview_sessions_collection.find_one({"omni_call_id": str(call_id)})
    if linked_session:
        _require_admin_session_access(linked_session, current_admin)
    elif log_data.get("company_id") and current_admin.get("role") != "master":
        if log_data["company_id"] != current_admin["company_id"]:
            raise HTTPException(status_code=403, detail="Not authorized to access this call log.")

    # Flatten top-level evaluation fields
    ev = log_data.get("evaluation") or {}
    if isinstance(ev, str):
        try:
            import json as _json
            ev = _json.loads(ev)
        except Exception:
            ev = {}

    extracted = log_data.get("extracted_variables") or {}
    if isinstance(extracted, str):
        try:
            import json as _json
            extracted = _json.loads(extracted)
        except Exception:
            extracted = {}

    log_data["sentiment_score"]            = ev.get("sentiment_score")            or log_data.get("sentiment_score") or log_data.get("interest")
    log_data["sentiment_analysis_details"] = ev.get("sentiment_analysis_details") or log_data.get("sentiment_analysis_details")
    log_data["cqs_score"]                  = ev.get("cqs_score")                  or log_data.get("cqs_score")
    log_data["cqs_score_message"]          = ev.get("cqs_score_message")          or log_data.get("cqs_score_message")
    log_data["summary"]                    = ev.get("summary")                    or log_data.get("summary") or log_data.get("transcript")
    log_data["evaluation_remarks"]         = ev.get("evaluation_remarks")         or ev.get("remarks") or log_data.get("evaluation_remarks")
    log_data["metric_score_intent"]        = ev.get("metric_score_intent")        or log_data.get("metric_score_intent")
    log_data["metric_score_relevance"]     = ev.get("metric_score_relevance")     or log_data.get("metric_score_relevance")
    log_data["metric_score_latency"]       = ev.get("metric_score_latency")       or log_data.get("metric_score_latency")
    log_data["metric_score_coherence"]     = ev.get("metric_score_coherence")     or log_data.get("metric_score_coherence")

    # Extracted profile details
    log_data["extracted_role"]           = extracted.get("current_role")          or log_data.get("extracted_role")
    log_data["extracted_experience"]     = extracted.get("years_experience")      or log_data.get("extracted_experience")
    log_data["extracted_city"]           = extracted.get("current_city")          or log_data.get("extracted_city")
    log_data["extracted_qualification"]  = extracted.get("highest_qualification") or log_data.get("extracted_qualification")
    log_data["extracted_company"]        = extracted.get("current_company")       or log_data.get("extracted_company")
    log_data["extracted_salary"]         = extracted.get("current_salary")        or log_data.get("extracted_salary")

    # Flatten interaction metrics
    if "interactions" in log_data and isinstance(log_data["interactions"], list):
        for interaction in log_data["interactions"]:
            if isinstance(interaction, dict):
                int_ev = interaction.get("evaluation") or {}
                if isinstance(int_ev, str):
                    try:
                        import json as _json
                        int_ev = _json.loads(int_ev)
                    except Exception:
                        int_ev = {}
                interaction["metric_score_intent"]    = int_ev.get("metric_score_intent")    or interaction.get("metric_score_intent")
                interaction["metric_score_relevance"] = int_ev.get("metric_score_relevance") or interaction.get("metric_score_relevance")
                interaction["metric_score_latency"]   = int_ev.get("metric_score_latency")   or interaction.get("metric_score_latency")
                interaction["metric_score_coherence"] = int_ev.get("metric_score_coherence") or interaction.get("metric_score_coherence")

    return {"log": log_data}

def sync_call_status_helper(call_id: str, app_id: str = None):
    """
    Synchronizes call details from OmniDimension for a specific call_id.
    Updates the log in omni_call_logs and the corresponding application in job_applications.
    """
    from bson import ObjectId
    try:
        from app.ai import omni_dimension_client
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
def get_omni_call_logs(current_admin: dict = Depends(get_current_admin_details)):
    """
    Fetches all omni dimension call logs, updating pending calls with live data.
    """
    try:
        query = {}
        if current_admin.get("role") != "master":
            query["company_id"] = current_admin.get("company_id")
            
        logs = list(omni_call_logs_collection.find(query).sort("created_at", -1))
        for log in logs:
            status = log.get("status", "").lower()
            if status not in ["completed", "failed", "no answer", "canceled"]:
                call_id = log.get("call_id")
                app_id = log.get("application_id")
                if call_id:
                    sync_call_status_helper(str(call_id), app_id)
            
            
        logs = list(omni_call_logs_collection.find(query).sort("created_at", -1))
        for log in logs:
            log["_id"] = str(log["_id"])
            
        return {"status": "success", "logs": logs}
    except Exception as e:
        print(f"Error fetching call logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/status/{session_id}")
def check_ai_call_status(session_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """
    Checks the status of the AI call for a given session.
    """
    session_data = interview_sessions_collection.find_one({
        "$or": [{"id": session_id}, {"link_id": session_id}]
    })
    
    if not session_data or not session_data.get("ai_call_id"):
        raise HTTPException(status_code=404, detail="AI call not found for this session")

    _require_admin_session_access(session_data, current_admin)

    call_id = session_data["ai_call_id"]
    try:
        from app.ai import omni_dimension_client
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
        
        from app.services.services import extract_text_from_file
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

