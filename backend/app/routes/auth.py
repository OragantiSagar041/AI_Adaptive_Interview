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
import firebase_admin
from firebase_admin import auth as firebase_auth_admin,credentials


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

# Initialize Firebase Admin SDK once
if not firebase_admin._apps:
    google_creds = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or "firebase_credentials.json"
    if google_creds:
        # Check direct path or path relative to backend root
        resolved_path = google_creds if os.path.isabs(google_creds) else os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), google_creds)
        if os.path.exists(resolved_path):
            try:
                cred = credentials.Certificate(resolved_path)
                firebase_admin.initialize_app(cred)
                logger.info(f"Firebase Admin SDK initialized with credentials from: {resolved_path}")
            except Exception as e:
                logger.error(f"Failed to initialize Firebase Admin SDK from {resolved_path}: {e}")
        else:
            logger.warning(f"GOOGLE_APPLICATION_CREDENTIALS file not found at: {resolved_path}")
    else:
        logger.warning("GOOGLE_APPLICATION_CREDENTIALS not set in environment. Firebase Admin SDK will not be available until configured.")

router = APIRouter()
# ─────────────────────────────────────────────────────────────────────────────
# TOKEN REFRESH  —  silently extend a valid session without re-entering creds
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/token/refresh")
def refresh_token(current_admin: dict = Depends(get_current_admin_details)):
    """
    Re-issue a fresh access token for the currently authenticated admin.
    The existing token must still be valid (not yet expired) to call this.
    The frontend should call this proactively (e.g. every 30 min) to keep
    the session alive without requiring the user to log in again.
    """
    global_policies = security_policies_collection.find_one({"_id": "global_policies"}) or {}
    expires_delta = timedelta(hours=8) if global_policies.get("strict_session_timeout", False) else None

    new_token = create_access_token(
        data={
            "sub": str(current_admin["admin_id"]),
            "role": current_admin.get("role", "tenant"),
            "company_id": str(current_admin.get("company_id", "")),
        },
        expires_delta=expires_delta,
    )
    return {"token": new_token}

@router.post("/admin/firebase-auth")
def firebase_auth(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
):
    if not firebase_admin._apps:
        raise HTTPException(
            status_code=500,
            detail="Firebase Admin SDK is not configured on the server. Please set GOOGLE_APPLICATION_CREDENTIALS in .env.",
        )
    # ---------------------------------------------------------
    # 1. Verify the Firebase ID token
    # ---------------------------------------------------------
    try:
        decoded_token = firebase_auth_admin.verify_id_token(
            credentials.credentials,
            check_revoked=True,
        )
    except Exception as exc:
        logger.warning(
            "Firebase authentication failed: %s - %s",
            type(exc).__name__,
            str(exc),
        )
        raise HTTPException(
        status_code=401,
        detail="Invalid or expired Firebase authentication token",
        )
    # ---------------------------------------------------------
    # 2. Get identity ONLY from the verified Firebase token
    # ---------------------------------------------------------
    firebase_uid = decoded_token.get("uid")
    verified_email = (decoded_token.get("email") or "").strip().lower()
    email_verified = decoded_token.get("email_verified", False)
    
    if not firebase_uid:
        raise HTTPException(
            status_code=401,
            detail="Firebase token does not contain a valid user ID",
        )
    if not verified_email or email_verified is not True:
        raise HTTPException(
            status_code=401,
            detail="Firebase account does not have a verified email",
        )
    # ---------------------------------------------------------
    # 3. Find the corresponding MongoDB admin account
    # ---------------------------------------------------------
    user = admins_collection.find_one({
        "firebase_uid": firebase_uid
    })

    if not user:
        user = admins_collection.find_one({
            "email": verified_email
        })

    if not user:
        user = admins_collection.find_one({
            "username": verified_email
        })

    # ---------------------------------------------------------
    # 4. Link Firebase UID to an existing MongoDB account
    # ---------------------------------------------------------
    if user:
        existing_firebase_uid = user.get("firebase_uid")

        if existing_firebase_uid and existing_firebase_uid != firebase_uid:
            raise HTTPException(
                status_code=403,
                detail="Firebase account is not authorized for this admin account",
            )

        if not existing_firebase_uid:
            admins_collection.update_one(
                {"_id": user["_id"]},
                {
                    "$set": {
                        "firebase_uid": firebase_uid,
                        "firebase_email": verified_email,
                    }
                },
            )

            user = admins_collection.find_one({
                "_id": user["_id"]
            })

    # ---------------------------------------------------------
    # 5. Reject Firebase users with no authorized MongoDB account
    # ---------------------------------------------------------
    if not user:
        raise HTTPException(
            status_code=403,
            detail="No authorized admin account is associated with this Firebase account",
        )

    stored_firebase_uid = user.get("firebase_uid")

    if stored_firebase_uid and stored_firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="Firebase account does not match this admin account",
        )

    # ---------------------------------------------------------
    # 6. Check whether application login is enabled
    # ---------------------------------------------------------
    if user.get("login_enabled") is False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }

    # ---------------------------------------------------------
    # 7. Resolve subscription / plan information
    # ---------------------------------------------------------
    plan_context = get_admin_plan_context(user)

    # ---------------------------------------------------------
    # 8. Handle 2FA if enabled
    # ---------------------------------------------------------
    user_2fa_enabled = bool(
        user.get("two_factor_enabled")
        or user.get("require_2fa")
        or user.get("is_2fa_enabled")
        or user.get("two_factor_auth")
        or user.get("totp_enabled")
    )

    if user_2fa_enabled:
        otp = str(random.randint(100000, 999999))
        expiry_time = datetime.now(timezone.utc) + timedelta(minutes=10)

        admins_collection.update_one(
            {"_id": user["_id"]},
            {
                "$set": {
                    "otp": otp,
                    "otp_expiry": expiry_time,
                }
            },
        )

        from app.routes.admin_dashboard import send_otp_email

        send_otp_email(
            user.get("email", ""),
            user.get("name", user.get("username", "")),
            otp,
        )

        return {
            "status": "2fa_required",
            "admin_id": str(user["_id"]),
        }

    # ---------------------------------------------------------
    # 9. Create the existing application JWT
    # ---------------------------------------------------------
    global_policies = security_policies_collection.find_one({
        "_id": "global_policies"
    }) or {}

    expires_delta = (
        timedelta(hours=8)
        if global_policies.get("strict_session_timeout", False)
        else None
    )

    access_token = create_access_token(
        data={
            "sub": str(user["_id"]),
            "role": user.get("role", "tenant"),
            "company_id": str(user.get("company_id", "")),
        },
        expires_delta=expires_delta,
    )

    # ---------------------------------------------------------
    # 10. Return successful Firebase authentication result
    # ---------------------------------------------------------
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan_context["plan_label"],
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": user.get("subscription_expiry"),
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
        "plan_features": plan_context["features"],
        "layout_config": plan_context.get("layout_config"),
        "credits": plan_context.get("credits", 0),
    }


# --------------------------------------------------------------------------------
# 2FA VERIFICATION API
# --------------------------------------------------------------------------------

class Verify2FA(BaseModel):
    admin_id: str
    otp: str

class FirebaseLoginIdentifier(BaseModel):
    identifier: str


@router.post("/admin/firebase-login-identifier")
def firebase_login_identifier(data: FirebaseLoginIdentifier):
    """
    Resolve the user's normal username/email to the
    internal Firebase login email.

    The user's password is NOT handled here.
    """

    identifier = (data.identifier or "").strip()

    if not identifier:
        raise HTTPException(
            status_code=400,
            detail="Username or email is required.",
        )

    # ---------------------------------------------------------
    # 1. Try username
    # ---------------------------------------------------------
    user = admins_collection.find_one({
        "username": identifier
    })
    print("DEBUG IDENTIFIER:", repr(identifier))
    print("DEBUG USER FOUND:", bool(user))

    if user:
        print("DEBUG USER EMAIL:", repr(user.get("email")))
        print("DEBUG USERNAME:", repr(user.get("username")))
        print("DEBUG FIREBASE UID:", repr(user.get("firebase_uid")))

    # ---------------------------------------------------------
    # 2. If username was not found, try email
    # ---------------------------------------------------------
    if not user:
        email_matches = list(
            admins_collection.find({
                "email": identifier
            }).limit(2)
        )

        # More than one MongoDB account uses this email.
        if len(email_matches) > 1:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This email is associated with multiple accounts. "
                    "Please use your username."
                ),
            )

        if len(email_matches) == 1:
            user = email_matches[0]

    # ---------------------------------------------------------
    # 3. Generic failure if no account was found
    # ---------------------------------------------------------
    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or email.",
        )

    # ---------------------------------------------------------
    # 4. Make sure this MongoDB account is linked to Firebase
    # ---------------------------------------------------------
    firebase_uid = user.get("firebase_uid")

    if not firebase_uid:
        raise HTTPException(
            status_code=401,
            detail="This account is not available for Firebase login.",
        )

    # ---------------------------------------------------------
    # 5. Get the Firebase account
    # ---------------------------------------------------------
    try:
        firebase_user = firebase_auth_admin.get_user(firebase_uid)

    except Exception as exc:
        logger.warning(
            "Unable to resolve Firebase account for admin: %s - %s",
            type(exc).__name__,
            str(exc),
        )

        raise HTTPException(
            status_code=401,
            detail="Firebase account is not available.",
        )

    firebase_email = (firebase_user.email or "").strip().lower()

    if not firebase_email:
        raise HTTPException(
            status_code=401,
            detail="Firebase account does not have a login email.",
        )

    # ---------------------------------------------------------
    # 6. Return only the Firebase login email
    # ---------------------------------------------------------
    return {
        "firebase_email": firebase_email,
    }


@router.post("/admin/verify-2fa")
def verify_2fa(
    data: Verify2FA,
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
):
    x_forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = x_forwarded_for.split(",")[0].strip() if x_forwarded_for else (request.client.host if request.client else "unknown")
    # ------------------------------------------------------------
    # 1. Verify Firebase ID token
    # ------------------------------------------------------------
    try:
        decoded_token = firebase_auth_admin.verify_id_token(
            credentials.credentials,
            check_revoked=True,
        )
    except Exception as exc:
        logger.warning(
            "Firebase 2FA authentication failed: %s - %s",
            type(exc).__name__,
            str(exc),
        )
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired Firebase authentication token.",
        )

    firebase_uid = decoded_token.get("uid")

    if not firebase_uid:
        raise HTTPException(
            status_code=401,
            detail="Firebase token does not contain a valid user ID.",
        )
    
    verified_email = (decoded_token.get("email") or "").strip().lower()
    email_verified = bool(decoded_token.get("email_verified"))

    if not verified_email or not email_verified:
        raise HTTPException(
            status_code=401,
            detail="Firebase account does not have a verified email.",
        )
    
    admin_id_clean = (data.admin_id or "").strip()
    provided_otp = str(data.otp or "").strip()

    if not admin_id_clean or not provided_otp:
        raise HTTPException(status_code=400, detail="admin_id and otp are required.")

    try:
        user_oid = ObjectId(admin_id_clean)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid admin ID format.")
        
    user = admins_collection.find_one({"_id": user_oid})
    if not user:
        raise HTTPException(
            status_code=404,
            detail="Admin account not found.",
        )

    if user.get("login_enabled") is False:
        raise HTTPException(
            status_code=403,
            detail="Your account login has been stopped by the administrator. Please contact support.",
        )
    
    stored_firebase_uid = user.get("firebase_uid")

    if not stored_firebase_uid or stored_firebase_uid != firebase_uid:
        raise HTTPException(
            status_code=403,
            detail="Firebase account is not authorized for this admin account.",
        )
        
    stored_otp = str(user.get("otp") or "").strip()
    if not stored_otp or stored_otp != provided_otp:
        security_logs_collection.insert_one({
            "event_type": "FAILED_LOGIN",
            "username": user.get("username", "unknown"),
            "ip_address": client_ip,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "reason": "Invalid 2FA OTP"
        })
        raise HTTPException(status_code=401, detail="Invalid OTP code.")
        
    expiry = user.get("otp_expiry")
    now_dt = datetime.now(timezone.utc)
    is_expired = False

    if not expiry:
        is_expired = True
    elif isinstance(expiry, datetime):
        exp_dt = expiry if expiry.tzinfo else expiry.replace(tzinfo=timezone.utc)
        if now_dt > exp_dt:
            is_expired = True
    elif isinstance(expiry, str):
        try:
            exp_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            if not exp_dt.tzinfo:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if now_dt > exp_dt:
                is_expired = True
        except Exception:
            pass

    if is_expired:
        security_logs_collection.insert_one({
            "event_type": "FAILED_LOGIN",
            "username": user.get("username", "unknown"),
            "ip_address": client_ip,
            "timestamp": now_dt.isoformat(),
            "reason": "Expired 2FA OTP"
        })
        raise HTTPException(status_code=401, detail="OTP code has expired. Please log in again to receive a new OTP.")
        
    # OTP is valid, clear it
    admins_collection.update_one({"_id": user["_id"]}, {"$unset": {"otp": "", "otp_expiry": ""}})
    
    global_policies = security_policies_collection.find_one({"_id": "global_policies"}) or {}
    expires_delta = timedelta(hours=8) if global_policies.get("strict_session_timeout", False) else None
    
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user.get("role", "tenant"), "company_id": str(user.get("company_id", ""))}, expires_delta=expires_delta)
    
    plan_context = get_admin_plan_context(user)
    
    # Log successful login event after 2FA
    security_logs_collection.insert_one({
        "event_type": "SUCCESSFUL_LOGIN",
        "username": user["username"],
        "role": user.get("role", "tenant"),
        "ip_address": client_ip,
        "timestamp": now_dt.isoformat()
    })
    
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan_context["plan_label"],
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": user.get("subscription_expiry"),
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
        "plan_features": plan_context["features"],
        "layout_config": plan_context.get("layout_config"),
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
    
    # Load active features registry
    import json
    import os
    registry_path = os.path.join(os.path.dirname(__file__), '..', '..', 'features_registry.json')
    active_features = set()
    try:
        with open(registry_path, 'r') as f:
            active_features = set(json.load(f))
    except Exception:
        pass
        
    result = []
    for p in plans:
        serialized = serialize_plan(p)
        if active_features:
            serialized["features"] = [f for f in serialized.get("features", []) if f in active_features]
        result.append(serialized)
    return {"status": "success", "data": result}

@router.post("/master/plans")
def upsert_plan(data: PlanUpdate, master_id: str = Depends(get_current_admin), current_admin: str = Depends(get_current_admin)):
    """Master-only: create or update a plan"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
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

