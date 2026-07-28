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

@router.get("/api/notifications")
def get_notifications(current_admin: dict = Depends(get_current_admin_details)):
    try:
        role = current_admin["role"]
        company_id = current_admin["company_id"]
        
        # Filter based on role
        if role == "master":
            query = {"recipient_role": "master"}
        elif role in ["super_admin", "superadmin"]:
            query = {"recipient_role": "superadmin", "company_id": company_id}
        else:
            query = {"recipient_role": "admin", "company_id": company_id}
            
        notifications = list(notifications_collection.find(query).sort("created_at", -1))
        
        # Seed mock data if empty
        if not notifications:
            import datetime
            now = datetime.datetime.now(datetime.timezone.utc)
            if role == "master":
                mock_data = [
                    {
                        "title": "Welcome to Master Console",
                        "message": "Welcome to the Hire IQ Master Control Panel. Here you can monitor system status, subscription plans, and manage tenants.",
                        "type": "system",
                        "recipient_role": "master",
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=2)).isoformat()
                    },
                    {
                        "title": "Subscription Renewed",
                        "message": "Tenant 'Google Cloud Partner' renewed their Advanced plan successfully.",
                        "type": "payment",
                        "recipient_role": "master",
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=6)).isoformat()
                    },
                    {
                        "title": "System Check Completed",
                        "message": "Automatic daily backup and database indexes health check succeeded.",
                        "type": "system",
                        "recipient_role": "master",
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=1)).isoformat()
                    }
                ]
            elif role in ["super_admin", "superadmin"]:
                mock_data = [
                    {
                        "title": "Welcome to Hire IQ",
                        "message": "Welcome to your Admin Management. You can manage your team, check candidate results, and provision interviews.",
                        "type": "system",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=1)).isoformat()
                    },
                    {
                        "title": "Interview Created",
                        "message": "A new interview template 'Senior React Developer' has been created successfully.",
                        "type": "activity",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=4)).isoformat()
                    },
                    {
                        "title": "Credits Request Approved",
                        "message": "Your request for additional interview credits was approved by the master administrator.",
                        "type": "credits",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=1)).isoformat()
                    }
                ]
            else: # admin / tenant
                mock_data = [
                    {
                        "title": "Welcome to Hire IQ",
                        "message": "Welcome to the Admin console. Create, run, and review candidate coding and voice interviews.",
                        "type": "system",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=3)).isoformat()
                    },
                    {
                        "title": "New Interview Complete",
                        "message": "Candidate 'John Doe' has completed Python Technical Interview. Avg score: 8.5/10.",
                        "type": "candidate",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=5)).isoformat()
                    },
                    {
                        "title": "Credits Assigned",
                        "message": "Your team leader has assigned 20 credits to your admin account.",
                        "type": "credits",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=2)).isoformat()
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
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    # Security filter: ensure notification matches user's role and company
    notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if role == "master" and notif.get("recipient_role") != "master":
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"] and (notif.get("recipient_role") != "superadmin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "tenant" and (notif.get("recipient_role") != "admin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"read": True}}
    )
    return {"status": "success", "message": "Notification marked as read"}

@router.post("/api/notifications/read-all")
def mark_all_notifications_read(current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    if role == "master":
        query = {"recipient_role": "master", "read": False}
    elif role in ["super_admin", "superadmin"]:
        query = {"recipient_role": "superadmin", "company_id": company_id, "read": False}
    else:
        query = {"recipient_role": "admin", "company_id": company_id, "read": False}
        
    notifications_collection.update_many(query, {"$set": {"read": True}})
    return {"status": "success", "message": "All notifications marked as read"}

@router.delete("/api/notifications/{notification_id}")
def delete_master_notification(notification_id: str, current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if role == "master" and notif.get("recipient_role") != "master":
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"] and (notif.get("recipient_role") != "superadmin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "tenant" and (notif.get("recipient_role") != "admin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.delete_one({"_id": ObjectId(notification_id)})
    return {"status": "success", "message": "Notification deleted"}

# 4. Modify existing Admin Login endpoint to return subscription details
class FirebaseAuthRequest(BaseModel):
    email: str
    name: str = ""

