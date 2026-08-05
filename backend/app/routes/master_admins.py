"""
app/routes_split/master_admins.py — Master admins management
Auto-split from routes.py lines 8682–9009.
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

def get_tenant_recruiters_query(current_admin: dict) -> dict:
    """Builds the exact tenant recruiter query used consistently across Credit Management and Recruiters Page."""
    role = current_admin.get("role", "")
    if role == "master":
        return {}
        
    company_id = current_admin.get("company_id")
    admin_id = current_admin.get("admin_id") or str(current_admin.get("_id") or "")
    
    or_conditions = []
    
    if admin_id:
        or_conditions.append({"created_by": admin_id})
        or_conditions.append({"super_admin_id": admin_id})
        try:
            or_conditions.append({"created_by": ObjectId(admin_id)})
        except Exception:
            pass

    if company_id:
        or_conditions.append({"company_id": company_id})
        or_conditions.append({"company_id": str(company_id)})
        try:
            or_conditions.append({"company_id": ObjectId(company_id)})
        except Exception:
            pass

    if not or_conditions:
        return {"_id": None}

    sa_oids = []
    if admin_id:
        sa_oids.append(admin_id)
        try:
            sa_oids.append(ObjectId(admin_id))
        except Exception:
            pass

    return {
        "$or": or_conditions,
        "_id": {"$nin": sa_oids}
    }

@router.get("/super-admin/admins")
def get_sub_admins(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
        
    query = get_tenant_recruiters_query(current_admin)
    admins = list(admins_collection.find(query, {"password": 0}))
    
    # Enrich with session count created by each admin
    for admin in admins:
        admin["id"] = str(admin["_id"])
        admin["_id"] = str(admin["_id"])
        admin["credits"] = admin.get("credits", 0)
        admin["total_allocated_credits"] = admin.get("total_allocated_credits", admin["credits"])
        admin["sessions_created"] = interview_sessions_collection.count_documents({
            "$or": [
                {"admin_id": str(admin["id"])},
                {"created_by": str(admin["id"])}
            ]
        })
        
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
        "created_by": current_admin["admin_id"],
        "credits": data.credits,
        "total_allocated_credits": data.credits,
        "login_enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_admin)
    
    # Trigger credentials email via Celery
    try:
        from app.tasks import send_recruiter_credentials_email_task
        send_recruiter_credentials_email_task.delay(
            recruiter_email=data.email,
            recruiter_name=data.name,
            username=data.username,
            password=data.password,
            description=data.description if data.description else ""
        )
    except Exception as e:
        print(f"Failed to enqueue recruiter credentials email task: {e}")
        
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
@router.post("/api/superadmin/recruiters/{admin_id}/add-credits")
def add_sub_admin_credits(admin_id: str, data: AddCreditsRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
        
    company_id = current_admin.get("company_id")
    add_amount = data.credits or data.amount or 0
    if add_amount <= 0:
        raise HTTPException(status_code=400, detail="Credit amount must be greater than 0")
    
    # Try finding admin doc by ObjectId or string id
    admin_query = {}
    try:
        admin_query = {"_id": ObjectId(admin_id)}
    except Exception:
        admin_query = {"_id": admin_id}
        
    admin_doc = admins_collection.find_one(admin_query)
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Recruiter / Sub-admin not found")
        
    if admin_doc.get("login_enabled") == False or admin_doc.get("is_active") == False:
        raise HTTPException(status_code=400, detail="Cannot add credits to a deactivated recruiter account.")

    super_admin_id = current_admin.get("admin_id") or str(current_admin.get("_id") or "")
    
    updated_admin = None
    sa_doc = None
    
    try:
        with mongo_client.start_session() as db_session:
            with db_session.start_transaction():
                if company_id:
                    sa_doc = companies_collection.find_one_and_update(
                        {"_id": ObjectId(company_id), "credits": {"$gte": add_amount}},
                        {"$inc": {"credits": -add_amount}},
                        return_document=ReturnDocument.AFTER,
                        session=db_session,
                    )
                else:
                    sa_doc = admins_collection.find_one_and_update(
                        {"_id": ObjectId(super_admin_id), "credits": {"$gte": add_amount}},
                        {"$inc": {"credits": -add_amount}},
                        return_document=ReturnDocument.AFTER,
                        session=db_session,
                    )

                updated_admin = admins_collection.find_one_and_update(
                    admin_query,
                    {"$inc": {"credits": add_amount, "total_allocated_credits": add_amount}},
                    return_document=ReturnDocument.AFTER,
                    session=db_session,
                )
                
                credit_ledger_collection.insert_one({
                    "company_id": company_id,
                    "super_admin_id": super_admin_id,
                    "sub_admin_id": str(admin_id),
                    "org": updated_admin.get("name") or updated_admin.get("username"),
                    "amount": add_amount,
                    "status": "Completed",
                    "date": datetime.now(timezone.utc).isoformat()
                }, session=db_session)
    except Exception as tx_err:
        logger.warning(f"Transaction not supported or failed, falling back to direct atomic updates: {tx_err}")
        if company_id:
            try:
                sa_doc = companies_collection.find_one_and_update(
                    {"_id": ObjectId(company_id)},
                    {"$inc": {"credits": -add_amount}},
                    return_document=ReturnDocument.AFTER
                )
            except Exception:
                sa_doc = None
        else:
            try:
                sa_doc = admins_collection.find_one_and_update(
                    {"_id": ObjectId(super_admin_id)},
                    {"$inc": {"credits": -add_amount}},
                    return_document=ReturnDocument.AFTER
                )
            except Exception:
                sa_doc = None

        updated_admin = admins_collection.find_one_and_update(
            admin_query,
            {"$inc": {"credits": add_amount, "total_allocated_credits": add_amount}},
            return_document=ReturnDocument.AFTER
        )
        
        try:
            credit_ledger_collection.insert_one({
                "company_id": company_id,
                "super_admin_id": super_admin_id,
                "sub_admin_id": str(admin_id),
                "org": updated_admin.get("name") or updated_admin.get("username") if updated_admin else "Recruiter",
                "amount": add_amount,
                "status": "Completed",
                "date": datetime.now(timezone.utc).isoformat()
            })
        except Exception:
            pass

    if not updated_admin:
        raise HTTPException(status_code=500, detail="Failed to update recruiter credit balance in database.")

    try:
        broadcast_profile_update(
            admin_id=admin_id,
            company_id=str(company_id or ""),
            credits=updated_admin.get("credits", 0),
            login_enabled=updated_admin.get("login_enabled")
        )
        if sa_doc:
            broadcast_profile_update(
                admin_id=super_admin_id,
                company_id=str(company_id or ""),
                credits=sa_doc.get("credits", 0),
                login_enabled=sa_doc.get("login_enabled")
            )
    except Exception as e:
        logger.warning(f"Failed to broadcast profile update: {e}")

    try:
        notifications_collection.insert_one({
            "title": "Credits Allocated",
            "message": f"You have been allocated {add_amount} interview credits by your administrator.",
            "type": "credits",
            "recipient_role": "admin",
            "recipient_id": str(admin_id),
            "admin_id": str(admin_id),
            "company_id": str(company_id or ""),
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as notif_err:
        logger.warning(f"Failed to create credit allocation notification: {notif_err}")

    return {
        "status": "success",
        "message": f"Successfully allocated {add_amount} credits.",
        "credits": updated_admin.get("credits", 0),
        "recruiter_id": str(admin_id)
    }


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

