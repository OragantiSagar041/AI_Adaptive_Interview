"""
app/routes_split/auth.py — Admin login, register, Firebase, OTP
Auto-split from routes.py lines 7506–7820.
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

from app.routes.notifications import FirebaseAuthRequest

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/admin/firebase-auth")
def firebase_auth(data: FirebaseAuthRequest):
    normalized_email = data.email.strip().lower()
    
    # Try email match first, then username match
    user = admins_collection.find_one({"email": normalized_email, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"username": normalized_email, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"email": normalized_email})
    if not user:
        user = admins_collection.find_one({"username": normalized_email})
        
    if not user:
        # Register new admin with Free Trial
        now = datetime.now(timezone.utc)
        plan_def = get_plan_definition("Free Trial")
        credits_to_grant = plan_def.get("credits_granted", 10)
        expiry = now + timedelta(days=3650)
        
        new_admin = {
            "username": normalized_email,
            "email": normalized_email,
            "name": data.name or normalized_email.split("@")[0],
            "password": hash_password(str(uuid.uuid4())), # random password, they use firebase
            "role": "super_admin",
            "subscription_plan": "Free Trial",
            "subscription_expiry": expiry.isoformat(),
            "credits": credits_to_grant,
            "created_at": now.isoformat()
        }
        new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
        result = admins_collection.insert_one(new_admin)
        user = admins_collection.find_one({"_id": result.inserted_id})
        
    # Check login_enabled
    if user.get("login_enabled") == False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }
        
    plan_context = get_admin_plan_context(user)
    plan = plan_context["plan_label"]
    expiry = user.get("subscription_expiry")
            
    # Do NOT block login if expired, because they need to be able to access the dashboard to buy more credits!
    if plan_context["is_expired"]:
        print(f"User {user['username']} logged in with an expired subscription (Credits: {plan_context.get('credits')})")
        
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan,
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": expiry,
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
        "plan_features": plan_context["features"],
    }

@router.post("/admin/login")
def admin_login(data: AdminLogin, request: Request):
    client_ip = request.client.host if request.client else "unknown"
    # Try username match first, then email match (for self-registered users)
    user = admins_collection.find_one({"username": data.username, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"email": data.username, "role": {"$ne": "master"}})
    if not user:
        # Fallback: check without role filter
        user = admins_collection.find_one({"username": data.username})
        if not user:
            user = admins_collection.find_one({"email": data.username})
        if not user:
            security_logs_collection.insert_one({
                "event_type": "FAILED_LOGIN",
                "username": data.username,
                "ip_address": client_ip,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
    if not verify_password(data.password, user["password"]):
        security_logs_collection.insert_one({
            "event_type": "FAILED_LOGIN",
            "username": data.username,
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check login_enabled
    if user.get("login_enabled") == False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }
        
    plan_context = get_admin_plan_context(user)
    plan = plan_context["plan_label"]
    expiry = user.get("subscription_expiry")
            
    # Do NOT block login if expired, because they need to be able to access the dashboard to buy more credits!
    if plan_context["is_expired"]:
        print(f"User {user['username']} logged in with an expired subscription (Credits: {plan_context.get('credits')})")
        
    last_ip = user.get("last_ip")
    if last_ip and last_ip != client_ip:
        security_logs_collection.insert_one({
            "event_type": "NEW_IP_ADDRESS",
            "username": data.username,
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    admins_collection.update_one({"_id": user["_id"]}, {"$set": {"last_ip": client_ip}})
        
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user.get("role", "tenant"), "company_id": str(user.get("company_id", ""))})
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan,
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": expiry,
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
        "plan_features": plan_context["features"],
        "credits": plan_context.get("credits", 0),
    }

# --------------------------------------------------------------------------------
# PLAN MANAGEMENT APIs (for Master + Landing Page)
# --------------------------------------------------------------------------------

class PlanUpdate(BaseModel):
    plan_name: str
    credits_granted: int = 250
    price: int = 0
    features: list = []

class AdminRegister(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    company_name: str = ""
    plan: str = "Free Trial"

class StripeCheckoutRequest(BaseModel):
    plan_name: str
    signup_form: dict

class RazorpayOrderRequest(BaseModel):
    plan_name: str
    signup_form: Optional[dict] = None
    amount_inr: Optional[float] = None
    credits: Optional[int] = None

class RazorpayVerifyRequest(BaseModel):
    plan_name: str
    signup_form: dict
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

class RazorpayUpgradeOrderRequest(BaseModel):
    plan_name: str
    admin_id: str

class RazorpayUpgradeVerifyRequest(BaseModel):
    plan_name: str
    admin_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str




@router.get("/master/plans")
def get_all_plans_master(master_id: str = Depends(get_current_admin)):
    """Master-only: fetch ALL plans including owner"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    plans = list(plans_collection.find({}))
    result = []
    for p in plans:
        result.append(serialize_plan(p))
    return {"status": "success", "data": result}

@router.post("/master/plans")
def upsert_plan(data: PlanUpdate, master_id: str = Depends(get_current_admin), current_admin: str = Depends(get_current_admin)):
    """Master-only: create or update a plan"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    existing = plans_collection.find_one({"plan_name": data.plan_name})
    
    plans_collection.update_one(
        {"plan_name": data.plan_name},
        {"$set": {
            "plan_name": data.plan_name,
            "credits_granted": data.credits_granted,
            "price": data.price,
            "features": data.features,
        }},
        upsert=True
    )
    return {"status": "success", "message": f"Plan '{data.plan_name}' saved"}

@router.delete("/master/plans/{plan_id}")
def delete_plan(plan_id: str, master_id: str = Depends(get_current_admin)):
    """Master-only: delete a plan"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    plan = plans_collection.find_one({"_id": ObjectId(plan_id)})
    if plan and plan.get("is_owner_plan"):
        raise HTTPException(status_code=403, detail="Owner plan cannot be deleted")
    
    plans_collection.delete_one({"_id": ObjectId(plan_id)})
    return {"status": "success", "message": "Plan deleted"}

# --------------------------------------------------------------------------------
# ADMIN SELF-REGISTRATION (from Landing Page)
# --------------------------------------------------------------------------------

@router.post("/api/register")
def register_admin(data: AdminRegister):
    """Public: Self-register from landing page pricing cards"""
    normalized_email = data.email.strip().lower()
    normalized_name = data.name.strip()
    normalized_company = data.company_name.strip()

    # Check if username/email already exists
    if admins_collection.find_one({"username": normalized_email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    if admins_collection.find_one({"email": normalized_email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")
    
    # Fetch plan details
    plan_info = plans_collection.find_one({"plan_name": data.plan})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    
    # For paid plans, block direct registration (must go through the payment checkout flow)
    if plan_info.get("price", 0) > 0:
        raise HTTPException(status_code=400, detail="Paid plans require payment. Use the checkout flow.")
    
    now = datetime.now(timezone.utc)
    plan_def = get_plan_definition(data.plan)
    credits_to_grant = plan_def.get("credits_granted", 10)
    expiry = now + timedelta(days=3650)
    
    new_company = {
        "name": normalized_company,
        "subscription_plan": data.plan,
        "subscription_start": now.isoformat(),
        "subscription_expiry": expiry.isoformat(),
        "is_paid": False,
        "credits": credits_to_grant,
        "created_at": now.isoformat()
    }
    company_insert = companies_collection.insert_one(new_company)
    company_id = str(company_insert.inserted_id)

    new_admin = {
        "username": normalized_email,  # Use email as username
        "password": hash_password(data.password),
        "email": normalized_email,
        "name": normalized_name,
        "phone": data.phone,
        "role": "super_admin",
        "company_id": company_id,
        "login_enabled": True,
        "credits": credits_to_grant,
        "created_at": now.isoformat()
    }
    
    new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_admin)
    return {"status": "success", "message": f"Account created with {data.plan} plan! Please login."}

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

