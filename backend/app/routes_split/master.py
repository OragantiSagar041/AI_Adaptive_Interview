"""
app/routes_split/master.py — Master login, companies, tenants
Auto-split from routes.py lines 7108–7321.
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
from ai_client import chat_completion, extract_json, current_session_id
from analyze_answer import analyze_answer
from coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from redis_manager import manager
import transcription
from mongo_db import client as mongo_client
from app.services import *
from app.services import parse_iso_datetime
from app.session_store import get_session, set_session, delete_session as delete_cached_session
from app.models import *
from app.database import *
from app.config import *
from app import omni_dimension_client
from app.live_monitoring_security import (
    MONITORING_SCOPE, admin_can_access_session,
    create_monitoring_token, decode_monitoring_token,
    validate_snapshot_dataurl,
)
from app.candidate_auth import require_active_candidate
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from interview_graphs import run_followup_graph

# Re-import shared helpers from routes_core
from app.routes_models import *
from app.routes_core import (
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

@router.post("/master/login")
def master_login(data: AdminLogin, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    user = admins_collection.find_one({"username": data.username, "role": "master"})
    if not user:
        security_logs_collection.insert_one({
            "event_type": "FAILED_LOGIN",
            "username": data.username,
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        raise HTTPException(status_code=401, detail="Invalid master credentials")
        
    if not verify_password(data.password, user["password"]):
        security_logs_collection.insert_one({
            "event_type": "FAILED_LOGIN",
            "username": data.username,
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        raise HTTPException(status_code=401, detail="Invalid master credentials")
        
    last_ip = user.get("last_ip")
    if last_ip and last_ip != client_ip:
        security_logs_collection.insert_one({
            "event_type": "NEW_IP_ADDRESS",
            "username": data.username,
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    admins_collection.update_one({"_id": user["_id"]}, {"$set": {"last_ip": client_ip}})
    
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

