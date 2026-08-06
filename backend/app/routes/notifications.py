"""
app/routes_split/notifications.py — Notifications CRUD
Auto-split from routes.py lines 7322–7505.
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

@router.get("/api/notifications")
def get_notifications(current_admin: dict = Depends(get_current_admin_details)):
    try:
        role = current_admin.get("role", "tenant")
        company_id = str(current_admin.get("company_id") or "")
        admin_id = str(current_admin.get("admin_id") or current_admin.get("_id") or "")
        
        admin_ids = [admin_id]
        try:
            if admin_id:
                admin_ids.append(ObjectId(admin_id))
        except Exception:
            pass
            
        company_ids = [company_id]
        try:
            if company_id:
                company_ids.append(ObjectId(company_id))
        except Exception:
            pass

        # Strict Role & Recipient Isolation:
        if role == "master":
            query = {
                "$or": [
                    {"recipient_role": "master"},
                    {"recipient_id": {"$in": admin_ids}}
                ]
            }
        elif role in ["super_admin", "superadmin"]:
            # Super Admin sees tenant-level superadmin notifications (credits requests from recruiters, system alerts)
            # OR notifications specifically targeted to this super admin
            query = {
                "company_id": {"$in": company_ids} if company_id else {"$exists": True},
                "$or": [
                    {"recipient_role": {"$in": ["superadmin", "super_admin"]}},
                    {"recipient_id": {"$in": admin_ids}},
                    {"admin_id": {"$in": admin_ids}}
                ]
            }
        else:
            # Recruiter / Admin:
            # MUST ONLY see notifications specifically addressed to this recruiter account
            query = {
                "recipient_role": {"$nin": ["superadmin", "super_admin", "master"]},
                "$or": [
                    {"recipient_id": {"$in": admin_ids}},
                    {"admin_id": {"$in": admin_ids}}
                ]
            }
            if company_id:
                query["company_id"] = {"$in": company_ids}
            
        notifications = list(notifications_collection.find(query).sort("created_at", -1))
        
        # Seed initial mock data only if completely empty for this user/role
        if not notifications and role == "master":
            import datetime
            now = datetime.datetime.now(datetime.timezone.utc)
            mock_data = [
                {
                    "title": "Welcome to Master Console",
                    "message": "Welcome to the Hire IQ Master Control Panel. Here you can monitor system status, subscription plans, and manage tenants.",
                    "type": "system",
                    "recipient_role": "master",
                    "recipient_id": admin_id,
                    "read": False,
                    "created_at": (now - datetime.timedelta(hours=2)).isoformat()
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
    role = current_admin.get("role", "tenant")
    company_id = str(current_admin.get("company_id") or "")
    admin_id = str(current_admin.get("admin_id") or current_admin.get("_id") or "")
    
    try:
        notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    # Security authorization check
    notif_recip = str(notif.get("recipient_id") or "")
    notif_admin = str(notif.get("admin_id") or "")
    notif_comp = str(notif.get("company_id") or "")
    notif_role = str(notif.get("recipient_role") or "")

    if role == "master":
        if notif_role != "master" and notif_recip != admin_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"]:
        if company_id and notif_comp and notif_comp != company_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if notif_role not in ["superadmin", "super_admin"] and notif_recip != admin_id and notif_admin != admin_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if company_id and notif_comp and notif_comp != company_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if notif_recip != admin_id and notif_admin != admin_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"read": True}}
    )
    return {"status": "success", "message": "Notification marked as read"}

@router.post("/api/notifications/read-all")
def mark_all_notifications_read(current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin.get("role", "tenant")
    company_id = str(current_admin.get("company_id") or "")
    admin_id = str(current_admin.get("admin_id") or current_admin.get("_id") or "")
    
    admin_ids = [admin_id]
    try:
        if admin_id:
            admin_ids.append(ObjectId(admin_id))
    except Exception:
        pass
        
    company_ids = [company_id]
    try:
        if company_id:
            company_ids.append(ObjectId(company_id))
    except Exception:
        pass

    if role == "master":
        query = {
            "read": False,
            "$or": [
                {"recipient_role": "master"},
                {"recipient_id": {"$in": admin_ids}}
            ]
        }
    elif role in ["super_admin", "superadmin"]:
        query = {
            "company_id": {"$in": company_ids} if company_id else {"$exists": True},
            "read": False,
            "$or": [
                {"recipient_role": {"$in": ["superadmin", "super_admin"]}},
                {"recipient_id": {"$in": admin_ids}},
                {"admin_id": {"$in": admin_ids}}
            ]
        }
    else:
        query = {
            "recipient_role": {"$nin": ["superadmin", "super_admin", "master"]},
            "read": False,
            "$or": [
                {"recipient_id": {"$in": admin_ids}},
                {"admin_id": {"$in": admin_ids}}
            ]
        }
        if company_id:
            query["company_id"] = {"$in": company_ids}
        
    notifications_collection.update_many(query, {"$set": {"read": True}})
    return {"status": "success", "message": "All notifications marked as read"}

@router.delete("/api/notifications/{notification_id}")
def delete_notification_item(notification_id: str, current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin.get("role", "tenant")
    company_id = str(current_admin.get("company_id") or "")
    admin_id = str(current_admin.get("admin_id") or current_admin.get("_id") or "")
    
    try:
        notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid notification ID format")

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notif_recip = str(notif.get("recipient_id") or "")
    notif_admin = str(notif.get("admin_id") or "")
    notif_comp = str(notif.get("company_id") or "")
    notif_role = str(notif.get("recipient_role") or "")

    if role == "master":
        if notif_role != "master" and notif_recip != admin_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"]:
        if company_id and notif_comp and notif_comp != company_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if notif_role not in ["superadmin", "super_admin"] and notif_recip != admin_id and notif_admin != admin_id:
            raise HTTPException(status_code=403, detail="Forbidden")
    else:
        if company_id and notif_comp and notif_comp != company_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        if notif_recip != admin_id and notif_admin != admin_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.delete_one({"_id": ObjectId(notification_id)})
    return {"status": "success", "message": "Notification deleted"}

# 4. Modify existing Admin Login endpoint to return subscription details
class FirebaseAuthRequest(BaseModel):
    email: str
    name: str = ""

