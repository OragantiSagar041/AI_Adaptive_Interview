"""
app/routes_split/notes_superadmin2.py — Notes + superadmin extra routes
Auto-split from routes.py lines 12320–12908.
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
    RazorpayOrderRequest, MAIN_LOOP,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

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

# ==========================================
# SUPERADMIN ANALYTICS & MANAGEMENT ENDPOINTS
# ==========================================
import random
from datetime import timedelta

@router.get("/api/superadmin/organizations/stats")
def get_superadmin_org_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    # Mock data aggregation mixed with DB
    total_companies = companies_collection.count_documents({})
    # Mock some data for the UI
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    growth_data = [{"name": m, "signups": random.randint(10, 50)} for m in months]
    plans_data = [
        {"name": "Free", "value": random.randint(20, 40)},
        {"name": "Pro", "value": random.randint(10, 30)},
        {"name": "Enterprise", "value": random.randint(2, 10)}
    ]
    return {
        "status": "success",
        "kpis": {
            "total_organizations": total_companies + 150,
            "active_organizations": total_companies + 120,
            "churned_organizations": 30,
            "revenue": "$12,450"
        },
        "growth_chart": growth_data,
        "plans_chart": plans_data
    }

@router.get("/api/superadmin/recruiters/stats")
def get_superadmin_recruiter_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    company_id = current_admin.get("company_id")
    company_ids = [company_id]
    try:
        if company_id:
            company_ids.append(ObjectId(company_id))
    except Exception:
        pass

    query = {"company_id": {"$in": company_ids}} if company_id else {}
    admins = list(admins_collection.find(query, {"password": 0}))
    recruiters = []
    total_interviews = 0

    for a in admins:
        admin_obj_id = a.get("_id")
        admin_str_id = str(admin_obj_id) if admin_obj_id else ""
        email = a.get("email")
        username = a.get("username")
        
        identifiers = [x for x in [admin_str_id, admin_obj_id, email, username] if x]
        
        # Check interviews templates created by this admin
        created_interviews = list(interviews_collection.find({
            "$or": [
                {"admin_id": {"$in": identifiers}},
                {"created_by": {"$in": identifiers}},
                {"user_id": {"$in": identifiers}}
            ]
        }, {"_id": 1, "id": 1}))
        
        interview_keys = []
        for it in created_interviews:
            if "_id" in it:
                interview_keys.append(str(it["_id"]))
                interview_keys.append(it["_id"])
            if "id" in it:
                interview_keys.append(str(it["id"]))
                
        session_query = {
            "$or": [
                {"admin_id": {"$in": identifiers}},
                {"created_by": {"$in": identifiers}},
                {"interviewer_id": {"$in": identifiers}}
            ]
        }
        if interview_keys:
            session_query["$or"].append({"interview_id": {"$in": interview_keys}})
            
        interviews_count = interview_sessions_collection.count_documents(session_query)
        total_interviews += interviews_count
        
        last_interview = interview_sessions_collection.find_one(
            session_query,
            sort=[("created_at", -1)]
        )
        last_active = last_interview.get("created_at") if last_interview and last_interview.get("created_at") else a.get("created_at", datetime.now(timezone.utc).isoformat())
        
        recruiters.append({
            "id": str(a.get("_id")),
            "name": a.get("name") or a.get("username"),
            "email": a.get("email", "N/A"),
            "role": a.get("role", "admin"),
            "status": "Active" if a.get("is_active", True) else "Inactive",
            "credits": a.get("credits", 0),
            "interviews_conducted": interviews_count,
            "last_active": last_active
        })
    
    now = datetime.now(timezone.utc)
    weekly_activity = []
    
    for i in range(8, 0, -1):
        start_date = now - timedelta(days=7*i)
        end_date = now - timedelta(days=7*(i-1))
        
        date_query = {
            "created_at": {
                "$gte": start_date.isoformat(),
                "$lt": end_date.isoformat()
            }
        }
        if company_id:
            date_query["company_id"] = {"$in": company_ids}
            
        count = interview_sessions_collection.count_documents(date_query)
        weekly_activity.append({
            "name": f"Week {9-i}",
            "interviews": count
        })
    
    return {
        "status": "success",
        "kpis": {
            "total_recruiters": len(recruiters),
            "active_now": len([r for r in recruiters if r["status"] == "Active"]),
            "avg_interviews": round(total_interviews / len(recruiters)) if recruiters else 0
        },
        "recruiters": recruiters,
        "weekly_activity": weekly_activity
    }

@router.get("/api/superadmin/credits/stats")
def get_superadmin_credit_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    usage_data = [{"day": d, "used": random.randint(100, 1000), "purchased": random.randint(0, 500)} for d in days]
    
    thirty_days_ago = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    
    query = {"company_id": current_admin.get("company_id")} if current_admin.get("company_id") else {}
    history_docs = list(credit_ledger_collection.find(query).sort("date", -1).limit(10))
    history = [
        {"id": str(d.get("_id")), "org": d.get("org", "Unknown"), "amount": d.get("amount", 0), 
         "date": d.get("date"), "status": d.get("status", "Completed")} 
        for d in history_docs
    ]
    
    total_company_credits = 0
    for c in companies_collection.find({}, {"credits": 1}):
        total_company_credits += int(c.get("credits") or 0)
        
    total_admin_credits = 0
    for a in admins_collection.find({"company_id": {"$exists": False}}, {"credits": 1}):
        total_admin_credits += int(a.get("credits") or 0)
        
    total_credits = total_company_credits + total_admin_credits
    consumed_credits = interview_sessions_collection.count_documents({"created_at": {"$gte": thirty_days_ago}})
    
    return {
        "status": "success",
        "kpis": {
            "total_credits_system": total_credits,
            "credits_consumed_month": consumed_credits,
            "active_topups": 12
        },
        "usage_chart": usage_data,
        "history": history
    }

@router.get("/api/superadmin/subscriptions/stats")
def get_superadmin_subscription_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
    mrr_data = [{"name": m, "mrr": random.randint(5000, 15000)} for m in months]
    
    return {
        "status": "success",
        "kpis": {
            "mrr": "$14,500",
            "arr": "$174,000",
            "active_subs": 342,
            "churn_rate": "2.4%"
        },
        "mrr_chart": mrr_data,
        "tiers": [
            {"name": "Free", "value": 200},
            {"name": "Starter", "value": 100},
            {"name": "Pro", "value": 35},
            {"name": "Enterprise", "value": 7}
        ]
    }


# ─── Integration catalog (definitions stay in code, config stored in MongoDB) ───
INTEGRATION_CATALOG = [
    {"id": "workday",   "name": "Workday",           "category": "HRIS",     "description": "Sync employee and org data with Workday HRIS.",        "fields": [{"key": "tenant_id", "label": "Tenant ID", "type": "text", "placeholder": "your-tenant"}, {"key": "api_key", "label": "API Key", "type": "password", "placeholder": "wday_***"}, {"key": "base_url", "label": "Base URL", "type": "text", "placeholder": "https://wd3.myworkday.com"}]},
    {"id": "greenhouse","name": "Greenhouse",        "category": "ATS",      "description": "Two-way sync of candidates and jobs.",                  "fields": [{"key": "api_key", "label": "API Key", "type": "password", "placeholder": "grnhse_***"}, {"key": "board_token", "label": "Board Token", "type": "text", "placeholder": "your-board"}]},
    {"id": "lever",     "name": "Lever",             "category": "ATS",      "description": "Import Lever pipelines into HireIQ.",                   "fields": [{"key": "api_key", "label": "API Key", "type": "password", "placeholder": "lever_***"}]},
    {"id": "gcal",      "name": "Google Calendar",   "category": "Calendar", "description": "Schedule interviews on recruiter calendars.",             "fields": [{"key": "client_id", "label": "OAuth Client ID", "type": "text", "placeholder": "*.apps.googleusercontent.com"}, {"key": "client_secret", "label": "Client Secret", "type": "password", "placeholder": "GOCSPX-***"}]},
    {"id": "outlook",   "name": "Outlook Calendar",  "category": "Calendar", "description": "Two-way calendar sync with Microsoft 365.",               "fields": [{"key": "tenant_id", "label": "Azure Tenant ID", "type": "text", "placeholder": "xxxxxxxx-xxxx"}, {"key": "client_id", "label": "App (Client) ID", "type": "text", "placeholder": "xxxxxxxx-xxxx"}, {"key": "client_secret", "label": "Client Secret", "type": "password", "placeholder": "~abc***"}]},
    {"id": "slack",     "name": "Slack",             "category": "Chat",     "description": "Send interview and hiring updates to channels.",           "fields": [{"key": "webhook_url", "label": "Webhook URL", "type": "text", "placeholder": "https://hooks.slack.com/services/..."}, {"key": "channel", "label": "Default Channel", "type": "text", "placeholder": "#hiring"}]},
    {"id": "teams",     "name": "Microsoft Teams",   "category": "Chat",     "description": "Notifications and interview links in Teams.",             "fields": [{"key": "webhook_url", "label": "Incoming Webhook URL", "type": "text", "placeholder": "https://outlook.office.com/webhook/..."}]},
    {"id": "zoom",      "name": "Zoom",              "category": "Video",    "description": "Auto-generate video interview links.",                    "fields": [{"key": "account_id", "label": "Account ID", "type": "text", "placeholder": "abc123"}, {"key": "client_id", "label": "Client ID", "type": "text", "placeholder": "xyz123"}, {"key": "client_secret", "label": "Client Secret", "type": "password", "placeholder": "secret_***"}]},
    {"id": "sendgrid",  "name": "SendGrid",          "category": "Email",    "description": "Deliver transactional emails via SendGrid.",              "fields": [{"key": "api_key", "label": "API Key", "type": "password", "placeholder": "SG.***"}, {"key": "from_email", "label": "From Email", "type": "text", "placeholder": "noreply@company.com"}]},
]


@router.get("/api/superadmin/integrations")
def get_superadmin_integrations(current_admin: dict = Depends(get_current_admin_details)):
    """Return integration catalog merged with company-specific saved config from MongoDB."""
    if current_admin.get("role") not in ["master", "super_admin", "superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    company_id = current_admin.get("company_id")
    saved = {}
    if company_id:
        try:
            doc = companies_collection.find_one({"_id": ObjectId(company_id)}, {"integrations": 1})
            if doc and doc.get("integrations"):
                saved = {item["id"]: item for item in doc["integrations"]}
        except Exception:
            pass

    result = []
    for defn in INTEGRATION_CATALOG:
        s = saved.get(defn["id"], {})
        # Mask secret values – return True/False so frontend knows they exist
        masked_config = {}
        for f in defn["fields"]:
            val = s.get("config", {}).get(f["key"], "")
            if f["type"] == "password":
                masked_config[f["key"]] = "••••••••" if val else ""
            else:
                masked_config[f["key"]] = val
        result.append({
            **defn,
            "connected": s.get("connected", False),
            "status": s.get("status", "Disconnected"),
            "config": masked_config,
            "configured_at": s.get("configured_at"),
        })
    return {"status": "success", "integrations": result}


@router.put("/api/superadmin/integrations/{integration_id}")
def configure_superadmin_integration(
    integration_id: str,
    body: dict,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Save (upsert) configuration for a specific integration. Stores full values in MongoDB."""
    if current_admin.get("role") not in ["master", "super_admin", "superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    defn = next((d for d in INTEGRATION_CATALOG if d["id"] == integration_id), None)
    if not defn:
        raise HTTPException(status_code=404, detail="Integration not found")

    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="No company associated with your account")

    config = body.get("config", {})
    # Only keep keys that belong to this integration; ignore empty strings (don't overwrite existing secrets)
    valid_keys = {f["key"] for f in defn["fields"]}
    clean_config = {k: v for k, v in config.items() if k in valid_keys and v != "" and v != "••••••••"}

    now_iso = datetime.now(timezone.utc).isoformat()

    # Merge with existing config so we don't wipe saved secrets when only updating one field
    try:
        doc = companies_collection.find_one({"_id": ObjectId(company_id)}, {"integrations": 1})
        existing_list = doc.get("integrations", []) if doc else []
        existing_map = {item["id"]: item for item in existing_list}
        prev = existing_map.get(integration_id, {})
        merged_config = {**prev.get("config", {}), **clean_config}
    except Exception:
        merged_config = clean_config

    new_entry = {
        "id": integration_id,
        "name": defn["name"],
        "category": defn["category"],
        "connected": True,
        "status": "Healthy",
        "config": merged_config,
        "configured_at": now_iso,
    }

    try:
        # Upsert into the integrations array by id
        result = companies_collection.update_one(
            {"_id": ObjectId(company_id), "integrations.id": integration_id},
            {"$set": {"integrations.$": new_entry}},
        )
        if result.matched_count == 0:
            # Not yet in array – push it
            companies_collection.update_one(
                {"_id": ObjectId(company_id)},
                {"$push": {"integrations": new_entry}},
                upsert=True,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save integration: {e}")

    return {
        "status": "success",
        "message": f"{defn['name']} configured successfully",
        "integration": {k: v for k, v in new_entry.items() if k != "config"},  # don't echo secrets
    }


@router.patch("/api/superadmin/integrations/{integration_id}/toggle")
def toggle_superadmin_integration(
    integration_id: str,
    body: dict,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Toggle connected/disconnected state for an integration."""
    if current_admin.get("role") not in ["master", "super_admin", "superadmin", "admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="No company associated with your account")

    connected = body.get("connected", False)
    status = "Healthy" if connected else "Disconnected"

    try:
        doc = companies_collection.find_one({"_id": ObjectId(company_id)}, {"integrations": 1})
        existing_list = doc.get("integrations") if doc and isinstance(doc.get("integrations"), list) else []
        matched = False
        updated_list = []
        for item in existing_list:
            if isinstance(item, dict) and item.get("id") == integration_id:
                item["connected"] = connected
                item["status"] = status
                matched = True
            updated_list.append(item)
        if not matched:
            updated_list.append({
                "id": integration_id,
                "connected": connected,
                "status": status,
                "config": {},
                "configured_at": datetime.now(timezone.utc).isoformat() if connected else None,
            })
        companies_collection.update_one(
            {"_id": ObjectId(company_id)},
            {"$set": {"integrations": updated_list}}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to toggle integration: {e}")

    return {"status": "success", "connected": connected, "integration_status": status}


@router.get("/api/superadmin/integrations/status")
def get_superadmin_integration_status(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "superadmin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    times = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00"]
    api_traffic = [{"time": t, "calls": random.randint(50, 200)} for t in times]
    return {"status": "success", "api_traffic": api_traffic}


@router.get("/api/superadmin/audit-logs")
def get_superadmin_audit_logs(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "superadmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    events = ["User Login", "Password Changed", "Data Exported", "Integration Added", "Subscription Upgraded", "Failed Login"]
    logs = []
    for i in range(20):
        logs.append({
            "id": f"evt_{random.randint(10000, 99999)}",
            "event": random.choice(events),
            "user": f"admin_{random.randint(1, 10)}@example.com",
            "ip": f"192.168.1.{random.randint(1, 255)}",
            "timestamp": (datetime.now(timezone.utc) - timedelta(minutes=random.randint(1, 1000))).isoformat()
        })
        
    logs.sort(key=lambda x: x["timestamp"], reverse=True)
    
    return {
        "status": "success",
        "logs": logs
    }

@router.post("/api/superadmin/security/stats")
@router.get("/api/superadmin/security/stats")
def get_superadmin_security_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    now_utc = datetime.now(timezone.utc)
    yesterday = (now_utc - timedelta(days=1)).isoformat()
    
    # 1. Real Failed Logins (24h)
    failed_logins_24h = security_logs_collection.count_documents({
        "event_type": "FAILED_LOGIN",
        "timestamp": {"$gte": yesterday}
    })
    
    # 2. Real Security Policies
    global_policies = security_policies_collection.find_one({"_id": "global_policies"}) or {}
    require_2fa_enabled = bool(current_admin.get("two_factor_enabled") or current_admin.get("require_2fa"))
    strict_timeout_enabled = global_policies.get("strict_session_timeout", True)
    restrict_ip_enabled = global_policies.get("restrict_ip", False)
    
    # 3. Real Dynamic Security Score (0 - 100) based on actual security posture & policies
    score = 0
    if require_2fa_enabled:
        score += 30
    if strict_timeout_enabled:
        score += 25
    if restrict_ip_enabled:
        score += 20
    else:
        score += 10
    
    if failed_logins_24h == 0:
        score += 25
    elif failed_logins_24h <= 5:
        score += 15
    elif failed_logins_24h <= 15:
        score += 5
    
    security_score = min(100, max(0, score))
    
    # 4. Real Active Sessions count
    session_minutes = 30 if strict_timeout_enabled else 1440
    session_cutoff = (now_utc - timedelta(minutes=session_minutes)).isoformat()
    
    active_admin_logins = len(security_logs_collection.distinct("username", {
        "event_type": "SUCCESSFUL_LOGIN",
        "timestamp": {"$gte": session_cutoff}
    }))
    
    active_copilot_sessions = copilot_sessions_collection.count_documents({
        "updated_at": {"$gte": session_cutoff}
    })
    
    active_interview_sessions = interview_sessions_collection.count_documents({
        "status": {"$in": ["in_progress", "active", "started"]}
    })
    
    active_sessions = max(active_admin_logins + active_interview_sessions, active_copilot_sessions, active_admin_logins, 1 if current_admin else 0)
    
    # 5. Real Users with 2FA percentage
    total_admins = admins_collection.count_documents({})
    if total_admins == 0:
        users_with_2fa = "100%"
    else:
        if require_2fa_enabled:
            users_with_2fa = "100%"
        else:
            enabled_2fa_count = admins_collection.count_documents({
                "$or": [
                    {"two_factor_enabled": True},
                    {"totp_enabled": True},
                    {"is_2fa_enabled": True},
                    {"otp": {"$exists": True}},
                    {"otp_secret": {"$exists": True}}
                ]
            })
            pct = int((enabled_2fa_count / total_admins) * 100)
            users_with_2fa = f"{pct}%"
            
    # 6. Real Auth Methods distribution from DB
    password_count = admins_collection.count_documents({"password": {"$exists": True, "$ne": ""}})
    google_sso_count = admins_collection.count_documents({
        "$or": [
            {"auth_provider": "google"},
            {"firebase_uid": {"$exists": True}},
            {"google_id": {"$exists": True}},
            {"provider": "google"}
        ]
    })
    saml_sso_count = admins_collection.count_documents({
        "$or": [
            {"auth_provider": "saml"},
            {"sso_provider": "saml"},
            {"provider": "saml"}
        ]
    })
    
    total_auth = password_count + google_sso_count + saml_sso_count
    if total_auth == 0:
        total_auth = max(total_admins, 1)
        password_count = total_auth
        
    pwd_val = round((password_count / total_auth) * 100)
    google_val = round((google_sso_count / total_auth) * 100)
    saml_val = round((saml_sso_count / total_auth) * 100)
    
    diff = 100 - (pwd_val + google_val + saml_val)
    if diff != 0:
        pwd_val += diff
        
    auth_methods = [
        {"name": "Password", "value": max(pwd_val, 0)},
        {"name": "Google SSO", "value": max(google_val, 0)},
        {"name": "SAML", "value": max(saml_val, 0)}
    ]
    
    # 7. Recent Alerts using actual event_type classification & probe artifact suppression
    recent_logs = list(security_logs_collection.find().sort("timestamp", -1).limit(50))
    
    # Pre-index successful login timestamps per user to filter legacy master_login probe artifacts
    success_timestamps = {}
    for log in recent_logs:
        if log.get("event_type") == "SUCCESSFUL_LOGIN":
            uname = log.get("username") or log.get("user") or ""
            ts = log.get("timestamp") or ""
            if uname and ts:
                try:
                    dt = datetime.fromisoformat(ts)
                    success_timestamps.setdefault(uname, []).append(dt)
                except Exception:
                    pass

    recent_alerts = []
    seen_events = set()
    
    for log in recent_logs:
        username = log.get("username") or log.get("user") or "unknown"
        ip_addr = log.get("ip_address") or log.get("ip") or "Unknown IP"
        evt_type = log.get("event_type", "UNKNOWN")
        ts = log.get("timestamp") or ""
        
        # Suppress FAILED_LOGIN probe artifact if user had a SUCCESSFUL_LOGIN within 15s
        if evt_type == "FAILED_LOGIN" and username in success_timestamps:
            try:
                log_dt = datetime.fromisoformat(ts)
                if any(abs((s_dt - log_dt).total_seconds()) <= 15 for s_dt in success_timestamps[username]):
                    continue
            except Exception:
                pass

        # Deduplicate identical events for the same user within the same timestamp minute
        ts_str = str(ts)[:16]  # match YYYY-MM-DDTHH:MM
        dedup_key = f"{evt_type}_{username}_{ts_str}"
        if dedup_key in seen_events:
            continue
        seen_events.add(dedup_key)

        try:
            log_time = datetime.fromisoformat(ts)
        except Exception:
            log_time = now_utc
            
        elapsed = now_utc - log_time
        
        if elapsed.total_seconds() < 60:
            time_str = "just now"
        elif elapsed.total_seconds() < 3600:
            time_str = f"{int(elapsed.total_seconds() // 60)} mins ago"
        elif elapsed.total_seconds() < 86400:
            time_str = f"{int(elapsed.total_seconds() // 3600)} hours ago"
        else:
            time_str = f"{int(elapsed.total_seconds() // 86400)} days ago"
            
        if evt_type == "FAILED_LOGIN":
            event_label = "Failed Login"
        elif evt_type == "SUCCESSFUL_LOGIN":
            event_label = "Successful Login"
        elif evt_type == "NEW_IP_ADDRESS":
            event_label = "New IP Address"
        else:
            event_label = str(evt_type).replace("_", " ").title()
            
        recent_alerts.append({
            "type": f"{event_label} ({username})",
            "ip": ip_addr,
            "time": time_str
        })
        
        if len(recent_alerts) >= 10:
            break
    
    return {
        "status": "success",
        "kpis": {
            "security_score": security_score,
            "active_sessions": active_sessions,
            "failed_logins_24h": failed_logins_24h,
            "users_with_2fa": users_with_2fa
        },
        "auth_methods": auth_methods,
        "recent_alerts": recent_alerts
    }

class SecurityPoliciesUpdate(BaseModel):
    require_2fa: bool
    strict_session_timeout: bool
    restrict_ip: bool
    allowed_ips: Optional[List[str]] = None

@router.get("/api/superadmin/security/policies")
def get_security_policies(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    global_policies = security_policies_collection.find_one({"_id": "global_policies"}) or {}
    
    # Query admins_collection directly for the logging-in admin's fresh 2FA status
    admin_id_str = current_admin.get("admin_id") or current_admin.get("_id") or current_admin.get("id")
    admin_doc = None
    if admin_id_str:
        try:
            admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id_str) if isinstance(admin_id_str, str) else admin_id_str})
        except Exception:
            pass
    if not admin_doc and current_admin.get("username"):
        admin_doc = admins_collection.find_one({"username": current_admin.get("username")})
    if not admin_doc and current_admin.get("email"):
        admin_doc = admins_collection.find_one({"email": current_admin.get("email")})
        
    if admin_doc:
        user_2fa = bool(admin_doc.get("two_factor_enabled") or admin_doc.get("require_2fa") or admin_doc.get("is_2fa_enabled") or admin_doc.get("totp_enabled"))
    else:
        user_2fa = bool(current_admin.get("two_factor_enabled") or current_admin.get("require_2fa"))

    policies = {
        "require_2fa": user_2fa,
        "strict_session_timeout": global_policies.get("strict_session_timeout", True),
        "restrict_ip": global_policies.get("restrict_ip", False),
        "allowed_ips": global_policies.get("allowed_ips", [])
    }
        
    return {"status": "success", "policies": policies}

@router.put("/api/superadmin/security/policies")
def update_security_policies(data: SecurityPoliciesUpdate, request: Request, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    x_forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = x_forwarded_for.split(",")[0].strip() if x_forwarded_for else (request.client.host if request.client else "unknown")
    
    # Fetch existing policies to get current allowed_ips array
    existing = security_policies_collection.find_one({"_id": "global_policies"}) or {}
    
    if data.allowed_ips is not None:
        allowed_ips = data.allowed_ips
    else:
        allowed_ips = existing.get("allowed_ips", [])
    
    was_restricted = existing.get("restrict_ip", False)
    if data.restrict_ip and (not was_restricted or len(allowed_ips) == 0):
        if client_ip not in allowed_ips and client_ip != "unknown":
            allowed_ips.append(client_ip)
            
    # 1. Update 2FA setting reliably on THIS specific Super Admin account in admins_collection
    admin_id_str = current_admin.get("admin_id") or current_admin.get("_id") or current_admin.get("id")
    admin_username = current_admin.get("username")
    admin_email = current_admin.get("email")

    update_query = []
    if admin_id_str:
        try:
            update_query.append({"_id": ObjectId(admin_id_str) if isinstance(admin_id_str, str) else admin_id_str})
        except Exception:
            pass
    if admin_username:
        update_query.append({"username": admin_username})
    if admin_email:
        update_query.append({"email": admin_email})

    if update_query:
        try:
            admins_collection.update_many(
                {"$or": update_query},
                {"$set": {
                    "two_factor_enabled": data.require_2fa,
                    "require_2fa": data.require_2fa,
                    "is_2fa_enabled": data.require_2fa
                }}
            )
        except Exception as err:
            logging.warning(f"Could not update admin 2FA preference: {err}")
        
    # 2. Update global policies (session timeout and IP restrictions only)
    security_policies_collection.update_one(
        {"_id": "global_policies"},
        {"$set": {
            "strict_session_timeout": data.strict_session_timeout,
            "restrict_ip": data.restrict_ip,
            "allowed_ips": allowed_ips,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": current_admin.get("username")
        }},
        upsert=True
    )
    
    return {"status": "success", "message": "Security settings updated successfully"}

class RecruiterUpdate(BaseModel):
    name: str
    email: str
    role: str

class RecruiterMessage(BaseModel):
    subject: str
    body: str

@router.put("/api/superadmin/recruiters/{admin_id}")
def update_recruiter(admin_id: str, data: RecruiterUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    try:
        from bson import ObjectId
        obj_id = ObjectId(admin_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid admin ID")
        
    result = admins_collection.update_one(
        {"_id": obj_id},
        {"$set": {
            "name": data.name,
            "email": data.email,
            "role": data.role,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Recruiter not found or no changes made")
        
    return {"status": "success", "message": "Recruiter updated successfully"}

@router.post("/api/superadmin/recruiters/{admin_id}/message")
def send_recruiter_message(admin_id: str, data: RecruiterMessage, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    try:
        from bson import ObjectId
        obj_id = ObjectId(admin_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid admin ID")
        
    target_admin = admins_collection.find_one({"_id": obj_id})
    if not target_admin:
        raise HTTPException(status_code=404, detail="Recruiter not found")
        
    messages_collection.insert_one({
        "sender_id": current_admin.get("_id"),
        "sender_email": current_admin.get("email"),
        "receiver_id": obj_id,
        "receiver_email": target_admin.get("email"),
        "subject": data.subject,
        "body": data.body,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    try:
        notifications_collection.insert_one({
            "title": f"Message: {data.subject}",
            "message": data.body[:200] if data.body else "You have received a new direct message.",
            "type": "message",
            "recipient_role": "admin",
            "recipient_id": str(obj_id),
            "admin_id": str(obj_id),
            "company_id": str(current_admin.get("company_id") or ""),
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as notif_err:
        logger.warning(f"Failed to create recruiter message notification: {notif_err}")
    
    return {"status": "success", "message": "Message sent successfully"}

@router.put("/api/superadmin/recruiters/{admin_id}/toggle-status")
def toggle_recruiter_status(admin_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["master", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")
        
    try:
        from bson import ObjectId
        obj_id = ObjectId(admin_id)
    except:
        raise HTTPException(status_code=400, detail="Invalid admin ID")
        
    target_admin = admins_collection.find_one({"_id": obj_id})
    if not target_admin:
        raise HTTPException(status_code=404, detail="Recruiter not found")
        
    current_status = target_admin.get("is_active", True)
    new_status = not current_status
    
    admins_collection.update_one(
        {"_id": obj_id},
        {"$set": {
            "is_active": new_status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    action = "activated" if new_status else "deactivated"
    return {"status": "success", "message": f"Recruiter successfully {action}"}
