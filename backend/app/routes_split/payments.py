"""
app/routes_split/payments.py — Razorpay, Stripe, plans
Auto-split from routes.py lines 7821–8681.
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

from app.routes_split.auth import RazorpayUpgradeVerifyRequest, RazorpayUpgradeOrderRequest, StripeCheckoutRequest, validate_signup_form, RazorpayVerifyRequest, get_razorpay_credentials

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/razorpay/create-order")
def create_razorpay_order(data: RazorpayOrderRequest):
    """Create a Razorpay order for a paid subscription."""
    key_id, key_secret = get_razorpay_credentials()
    signup = validate_signup_form(data.signup_form or {})

    if admins_collection.find_one({"$or": [{"username": signup["email"]}, {"email": signup["email"]}]}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    if int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    pending_signup_id = uuid.uuid4().hex
    pending_signups_collection.insert_one({
        "_id": pending_signup_id,
        "name": signup["name"],
        "email": signup["email"],
        "password_hash": hash_password(signup["password"]),
        "phone": signup["phone"],
        "company_name": signup["company_name"],
        "plan_name": plan_info["plan_name"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=2),
        "status": "pending",
        "provider": "razorpay",
    })

    receipt = f"aii_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload = {
        "amount": int(plan_info["price"]) * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "plan_name": plan_info["plan_name"],
            "pending_signup_id": pending_signup_id,
        },
    }

    try:
        response = requests.post(
            "https://api.razorpay.com/v1/orders",
            auth=(key_id, key_secret),
            json=payload,
            timeout=30,
        )
        if response.status_code >= 400:
            try:
                error_json = response.json()
                error_message = error_json.get("error", {}).get("description") or error_json.get("description") or response.text
            except Exception:
                error_message = response.text
            raise HTTPException(status_code=502, detail=f"Razorpay order creation failed: {error_message}")

        order = response.json()
        payment_orders_collection.insert_one({
            "order_id": order["id"],
            "provider": "razorpay",
            "purpose": "signup",
            "pending_signup_id": pending_signup_id,
            "email": signup["email"],
            "plan_name": plan_info["plan_name"],
            "amount": int(plan_info["price"]) * 100,
            "currency": "INR",
            "status": "created",
            "created_at": datetime.now(timezone.utc),
        })
        plan_def = get_plan_definition(plan_info["plan_name"])
        return {
            "status": "success",
            "key": key_id,
            "company_name": os.getenv("APP_BRAND_NAME", "Hire IQ"),
            "description": f"{plan_info['plan_name']} plan with {plan_def.get('credits_granted', 0)} credits",
            "order": {
                "id": order["id"],
                "amount": order["amount"],
                "currency": order["currency"],
            },
            "plan": {
                "plan_name": plan_info["plan_name"],
                "credits_granted": plan_def.get("credits_granted", 0),
                "price": int(plan_info.get("price", 0)),
            },
            "prefill": {
                "name": signup["name"],
                "email": signup["email"],
                "contact": signup["phone"],
            },
        }
    except HTTPException:
        pending_signups_collection.delete_one({"_id": pending_signup_id, "status": "pending"})
        raise
    except Exception as exc:
        pending_signups_collection.delete_one({"_id": pending_signup_id, "status": "pending"})
        raise HTTPException(status_code=500, detail=f"Unable to initialize Razorpay payment: {str(exc)}")


def _verify_razorpay_signup_payment(data: RazorpayVerifyRequest, key_id: str, key_secret: str):
    order_record = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
    if not order_record or order_record.get("purpose") != "signup":
        raise HTTPException(status_code=400, detail="Unknown or expired payment order")
    if order_record.get("plan_name") != data.plan_name:
        raise HTTPException(status_code=400, detail="Payment order does not match the selected plan")

    if order_record.get("status") == "consumed":
        if order_record.get("payment_id") == data.razorpay_payment_id:
            return {
                "status": "success",
                "message": "Subscription is already activated for this account.",
                "idempotent": True,
            }
        raise HTTPException(status_code=409, detail="Payment order has already been consumed")

    signature_payload = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    try:
        order_response = requests.get(
            f"https://api.razorpay.com/v1/orders/{data.razorpay_order_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        payment_response = requests.get(
            f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Unable to verify payment with Razorpay") from exc
    if not order_response.ok or not payment_response.ok:
        raise HTTPException(status_code=502, detail="Razorpay payment verification failed")

    plan_info = plans_collection.find_one({"plan_name": order_record["plan_name"]})
    if not plan_info or int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="The purchased plan is no longer available")

    order_info = order_response.json()
    payment_info = payment_response.json()
    expected_amount = int(order_record["amount"])
    notes = order_info.get("notes") or {}
    if (
        int(order_info.get("amount", 0)) != expected_amount
        or (order_info.get("currency") or "").upper() != order_record.get("currency", "INR")
        or notes.get("plan_name") != order_record["plan_name"]
        or notes.get("pending_signup_id") != order_record.get("pending_signup_id")
    ):
        raise HTTPException(status_code=400, detail="Razorpay order details do not match")
    if (
        payment_info.get("order_id") != data.razorpay_order_id
        or int(payment_info.get("amount", 0)) != expected_amount
        or (payment_info.get("currency") or "").upper() != order_record.get("currency", "INR")
        or (payment_info.get("status") or "").lower() not in {"authorized", "captured"}
    ):
        raise HTTPException(status_code=400, detail="Razorpay payment is incomplete or does not match")

    try:
        claimed_order = payment_orders_collection.find_one_and_update(
            {"order_id": data.razorpay_order_id, "status": "created"},
            {
                "$set": {
                    "status": "processing",
                    "payment_id": data.razorpay_payment_id,
                    "processing_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Payment has already been used") from exc

    if not claimed_order:
        claimed_order = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
        if not (
            claimed_order
            and claimed_order.get("status") == "processing"
            and claimed_order.get("payment_id") == data.razorpay_payment_id
        ):
            raise HTTPException(status_code=409, detail="Payment order is already being processed")

    pending_signup_id = claimed_order.get("pending_signup_id")
    pending_signup = pending_signups_collection.find_one({"_id": pending_signup_id})
    if not pending_signup:
        existing_admin = admins_collection.find_one({
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id,
        })
        if existing_admin:
            payment_orders_collection.update_one(
                {"order_id": data.razorpay_order_id, "status": "processing"},
                {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
            )
            return {
                "status": "success",
                "message": "Subscription is already activated for this account.",
                "idempotent": True,
            }
        raise HTTPException(status_code=410, detail="Signup details expired. Contact support with your payment ID.")

    if (
        pending_signup.get("plan_name") != claimed_order.get("plan_name")
        or pending_signup.get("email") != claimed_order.get("email")
    ):
        raise HTTPException(status_code=400, detail="Stored signup details do not match this payment")

    pending_signup = pending_signups_collection.find_one_and_update(
        {"_id": pending_signup_id, "status": "pending"},
        {"$set": {"status": "processing", "processing_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    ) or pending_signups_collection.find_one({"_id": pending_signup_id, "status": "processing"})
    if not pending_signup:
        raise HTTPException(status_code=409, detail="Signup is already being activated")

    existing_user = admins_collection.find_one({"email": pending_signup["email"]})
    if existing_user:
        if (
            existing_user.get("razorpay_order_id") == data.razorpay_order_id
            and existing_user.get("razorpay_payment_id") == data.razorpay_payment_id
        ):
            payment_orders_collection.update_one(
                {"order_id": data.razorpay_order_id, "status": "processing"},
                {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
            )
            pending_signups_collection.delete_one({"_id": pending_signup_id})
            return {
                "status": "success",
                "message": "Subscription is already activated for this account.",
                "idempotent": True,
            }
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    now = datetime.now(timezone.utc)
    plan_def = get_plan_definition(claimed_order["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)
    company_doc = {
        "name": pending_signup.get("company_name", ""),
        "subscription_plan": claimed_order["plan_name"],
        "subscription_start": now.isoformat(),
        "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
        "is_paid": True,
        "credits": credits_to_grant,
        "created_at": now.isoformat(),
    }
    company_insert = companies_collection.insert_one(company_doc)
    try:
        admins_collection.insert_one({
            "custom_id": get_next_sequence_value("recruiter", "RC"),
            "username": pending_signup["email"],
            "password": pending_signup["password_hash"],
            "email": pending_signup["email"],
            "name": pending_signup["name"],
            "phone": pending_signup.get("phone", ""),
            "company_name": pending_signup.get("company_name", ""),
            "company_id": str(company_insert.inserted_id),
            "role": "super_admin",
            "subscription_plan": claimed_order["plan_name"],
            "subscription_start": now.isoformat(),
            "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
            "credits": credits_to_grant,
            "is_paid": True,
            "payment_provider": "razorpay",
            "payment_status": payment_info.get("status"),
            "amount_paid": expected_amount // 100,
            "razorpay_order_id": data.razorpay_order_id,
            "razorpay_payment_id": data.razorpay_payment_id,
            "payment_verified_at": now.isoformat(),
            "login_enabled": True,
            "created_at": now.isoformat(),
        })
    except Exception:
        companies_collection.delete_one({"_id": company_insert.inserted_id})
        pending_signups_collection.update_one(
            {"_id": pending_signup_id, "status": "processing"},
            {"$set": {"status": "pending"}, "$unset": {"processing_at": ""}},
        )
        payment_orders_collection.update_one(
            {
                "order_id": data.razorpay_order_id,
                "status": "processing",
                "payment_id": data.razorpay_payment_id,
            },
            {"$set": {"status": "created"}, "$unset": {"payment_id": "", "processing_at": ""}},
        )
        raise

    consume_result = payment_orders_collection.update_one(
        {
            "order_id": data.razorpay_order_id,
            "status": "processing",
            "payment_id": data.razorpay_payment_id,
        },
        {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
    )
    if consume_result.modified_count != 1:
        raise HTTPException(status_code=500, detail="Account created but payment receipt finalization failed")
    pending_signups_collection.delete_one({"_id": pending_signup_id})
    return {
        "status": "success",
        "message": f"Payment verified. Your {claimed_order['plan_name']} subscription is now active.",
    }


@router.post("/api/razorpay/verify-payment")
def verify_razorpay_payment(data: RazorpayVerifyRequest):
    """Verify Razorpay signature and activate the paid subscription."""
    key_id, key_secret = get_razorpay_credentials()
    return _verify_razorpay_signup_payment(data, key_id, key_secret)

    # Legacy implementation kept below temporarily for database migration reference.
    signup = validate_signup_form(data.signup_form or {})

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    if int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    existing_user = admins_collection.find_one({"email": signup["email"]})
    if existing_user:
        if existing_user.get("razorpay_payment_id") == data.razorpay_payment_id:
            return {"status": "success", "message": "Subscription is already activated for this account."}
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    signature_payload = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    key_id = os.getenv("RAZORPAY_KEY_ID")
    try:
        order_response = requests.get(
            f"https://api.razorpay.com/v1/orders/{data.razorpay_order_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        if order_response.ok:
            order_info = order_response.json()
            expected_amount = int(plan_info["price"]) * 100
            if int(order_info.get("amount", 0)) != expected_amount:
                raise HTTPException(status_code=400, detail="Paid amount does not match the selected plan")
            note_plan = (order_info.get("notes") or {}).get("plan_name")
            if note_plan and note_plan != plan_info["plan_name"]:
                raise HTTPException(status_code=400, detail="Payment order does not match the selected plan")
    except HTTPException:
        raise
    except Exception:
        pass

    try:
        payment_response = requests.get(
            f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        if payment_response.ok:
            payment_info = payment_response.json()
            payment_status = (payment_info.get("status") or "").lower()
            if payment_status and payment_status not in {"authorized", "captured"}:
                raise HTTPException(status_code=400, detail=f"Payment is not successful yet. Current status: {payment_status}")
    except HTTPException:
        raise
    except Exception:
        pass

    now = datetime.now(timezone.utc)
    plan_def = get_plan_definition(plan_info["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)
    
    new_company = {
        "name": signup["company_name"],
        "subscription_plan": plan_info["plan_name"],
        "subscription_start": now.isoformat(),
        "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
        "is_paid": True,
        "credits": credits_to_grant,
        "created_at": now.isoformat()
    }
    company_insert = companies_collection.insert_one(new_company)
    company_id = str(company_insert.inserted_id)

    admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
        "username": signup["email"],
        "password": hash_password(signup["password"]),
        "email": signup["email"],
        "name": signup["name"],
        "phone": signup["phone"],
        "company_name": signup["company_name"],
        "company_id": company_id,
        "role": "super_admin",
        "subscription_plan": plan_info["plan_name"],
        "subscription_start": now.isoformat(),
        "subscription_expiry": (now + timedelta(days=3650)).isoformat(),
        "credits": credits_to_grant,
        "is_paid": True,
        "payment_provider": "razorpay",
        "payment_status": "captured",
        "amount_paid": int(plan_info.get("price", 0)),
        "razorpay_order_id": data.razorpay_order_id,
        "razorpay_payment_id": data.razorpay_payment_id,
        "payment_verified_at": now.isoformat(),
        "login_enabled": True,
        "created_at": now.isoformat(),
    })

    return {
        "status": "success",
        "message": f"Payment verified. Your {plan_info['plan_name']} subscription is now active.",
    }


@router.post("/api/razorpay/create-upgrade-order")
def create_razorpay_upgrade_order(
    data: RazorpayUpgradeOrderRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Create a Razorpay order for purchasing credits / upgrading."""
    key_id, key_secret = get_razorpay_credentials()
    authenticated_admin_id = str(current_admin["admin_id"])
    if data.admin_id and not hmac.compare_digest(str(data.admin_id), authenticated_admin_id):
        raise HTTPException(status_code=403, detail="Cannot create an order for another account")
    admin = admins_collection.find_one({"_id": ObjectId(authenticated_admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
        
    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")
    if int(plan_info.get("price", 0)) <= 0:
        raise HTTPException(status_code=400, detail="This plan does not require payment")

    receipt = f"upg_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload = {
        "amount": int(plan_info["price"]) * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "upgrade_admin_id": authenticated_admin_id,
            "plan_name": data.plan_name
        }
    }

    try:
        response = requests.post(
            "https://api.razorpay.com/v1/orders",
            auth=(key_id, key_secret),
            json=payload,
            timeout=15,
        )
        if not response.ok:
            raise HTTPException(status_code=500, detail=f"Razorpay error: {response.text}")
        
        order_data = response.json()
        payment_orders_collection.insert_one({
            "order_id": order_data["id"],
            "provider": "razorpay",
            "purpose": "upgrade",
            "admin_id": authenticated_admin_id,
            "company_id": str(admin.get("company_id") or ""),
            "plan_name": plan_info["plan_name"],
            "amount": int(plan_info["price"]) * 100,
            "currency": "INR",
            "status": "created",
            "created_at": datetime.now(timezone.utc),
        })
        return {
            "status": "success",
            "razorpay_order_id": order_data["id"],
            "amount": order_data["amount"],
            "currency": order_data["currency"],
            "key_id": key_id
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Razorpay Upgrade error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/razorpay/verify-upgrade")
def verify_razorpay_upgrade(
    data: RazorpayUpgradeVerifyRequest,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Verify Razorpay signature and add credits to the user/company."""
    key_id, key_secret = get_razorpay_credentials()

    authenticated_admin_id = str(current_admin["admin_id"])
    if data.admin_id and not hmac.compare_digest(str(data.admin_id), authenticated_admin_id):
        raise HTTPException(status_code=403, detail="Cannot verify a payment for another account")
    admin = admins_collection.find_one({"_id": ObjectId(authenticated_admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")

    signature_payload = f"{data.razorpay_order_id}|{data.razorpay_payment_id}".encode("utf-8")
    expected_signature = hmac.new(
        key_secret.encode("utf-8"),
        signature_payload,
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed")

    order_record = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
    if not order_record:
        raise HTTPException(status_code=400, detail="Unknown or expired payment order")
    if order_record.get("status") == "consumed":
        if order_record.get("payment_id") == data.razorpay_payment_id:
            return {
                "status": "success",
                "message": "Payment was already applied.",
                "credits_added": 0,
                "idempotent": True,
            }
        raise HTTPException(status_code=409, detail="Payment order has already been consumed")
    if (
        str(order_record.get("admin_id") or "") != authenticated_admin_id
        or order_record.get("plan_name") != data.plan_name
    ):
        raise HTTPException(status_code=403, detail="Payment order does not belong to this account and plan")

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")

    plan_def = get_plan_definition(plan_info["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)

    try:
        order_response = requests.get(
            f"https://api.razorpay.com/v1/orders/{data.razorpay_order_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
        payment_response = requests.get(
            f"https://api.razorpay.com/v1/payments/{data.razorpay_payment_id}",
            auth=(key_id, key_secret),
            timeout=30,
        )
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail="Unable to verify payment with Razorpay") from exc
    if not order_response.ok or not payment_response.ok:
        raise HTTPException(status_code=502, detail="Razorpay payment verification failed")

    order_info = order_response.json()
    payment_info = payment_response.json()
    expected_amount = int(plan_info["price"]) * 100
    if int(order_info.get("amount", 0)) != expected_amount:
        raise HTTPException(status_code=400, detail="Paid amount does not match the selected plan")
    if (order_info.get("currency") or "").upper() != "INR":
        raise HTTPException(status_code=400, detail="Unexpected payment currency")
    notes = order_info.get("notes") or {}
    if (
        str(notes.get("upgrade_admin_id") or "") != authenticated_admin_id
        or notes.get("plan_name") != data.plan_name
    ):
        raise HTTPException(status_code=400, detail="Razorpay order metadata does not match")
    if payment_info.get("order_id") != data.razorpay_order_id:
        raise HTTPException(status_code=400, detail="Payment does not belong to this order")
    if (payment_info.get("status") or "").lower() not in {"authorized", "captured"}:
        raise HTTPException(status_code=400, detail="Payment has not completed")
    if int(payment_info.get("amount", 0)) != expected_amount:
        raise HTTPException(status_code=400, detail="Payment amount does not match")

    try:
        claimed_order = payment_orders_collection.find_one_and_update(
            {"order_id": data.razorpay_order_id, "status": "created"},
            {
                "$set": {
                    "status": "processing",
                    "payment_id": data.razorpay_payment_id,
                    "processing_at": datetime.now(timezone.utc),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=409, detail="Payment has already been used") from exc
    if not claimed_order:
        existing_order = payment_orders_collection.find_one({"order_id": data.razorpay_order_id})
        if not (
            existing_order
            and existing_order.get("status") == "processing"
            and existing_order.get("payment_id") == data.razorpay_payment_id
        ):
            raise HTTPException(status_code=409, detail="Payment order is already being processed")
        claimed_order = existing_order

    now = datetime.now(timezone.utc).isoformat()
    expiry = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()

    if admin.get("company_id"):
        target_collection = companies_collection
        target_id = ObjectId(admin["company_id"])
    else:
        target_collection = admins_collection
        target_id = ObjectId(authenticated_admin_id)

    target_result = target_collection.update_one(
            {
                "_id": target_id,
                "applied_payment_ids": {"$ne": data.razorpay_payment_id},
            },
            {
                "$set": {
                    "subscription_plan": data.plan_name,
                    "subscription_start": now,
                    "subscription_expiry": expiry,
                    "is_paid": True,
                },
                "$inc": {"credits": credits_to_grant},
                "$addToSet": {"applied_payment_ids": data.razorpay_payment_id},
            }
        )
    if target_result.matched_count == 0:
        target = target_collection.find_one({"_id": target_id})
        if not target:
            raise HTTPException(status_code=404, detail="Subscription account no longer exists")
        if data.razorpay_payment_id not in target.get("applied_payment_ids", []):
            raise HTTPException(status_code=500, detail="Unable to apply purchased credits")

    consume_result = payment_orders_collection.update_one(
        {
            "order_id": data.razorpay_order_id,
            "status": "processing",
            "payment_id": data.razorpay_payment_id,
        },
        {
            "$set": {
                "status": "consumed",
                "payment_id": data.razorpay_payment_id,
                "consumed_at": datetime.now(timezone.utc),
            }
        },
    )
    if consume_result.modified_count != 1:
        raise HTTPException(status_code=500, detail="Payment applied but receipt finalization failed")

    return {
        "status": "success",
        "message": f"Payment verified. {credits_to_grant} credits added to your account.",
        "credits_added": credits_to_grant
    }

# --------------------------------------------------------------------------------
# LEGACY STRIPE CHECKOUT (kept only for backward compatibility)
# --------------------------------------------------------------------------------

@router.post("/api/stripe/create-checkout-session")
def create_stripe_checkout(data: StripeCheckoutRequest):
    """Create a Stripe Checkout session for paid plan subscription"""
    import stripe
    
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured. Contact administrator.")
    
    stripe.api_key = stripe_key
    
    signup = validate_signup_form(data.signup_form or {})
    if admins_collection.find_one({"email": signup["email"]}):
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if plan_info.get("price", 0) == 0:
        raise HTTPException(status_code=400, detail="Free plans don't require payment")
    
    frontend_url = os.getenv("FRONTEND_URL", "https://localhost:3000")
    pending_signup_id = uuid.uuid4().hex
    pending_signups_collection.insert_one({
        "_id": pending_signup_id,
        "name": signup["name"],
        "email": signup["email"],
        "password_hash": hash_password(signup["password"]),
        "phone": signup["phone"],
        "company_name": signup["company_name"],
        "plan_name": plan_info["plan_name"],
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(hours=2),
        "status": "pending",
    })
    
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=signup["email"],
            line_items=[{
                "price_data": {
                    "currency": "inr",
                    "product_data": {
                        "name": plan_info["plan_name"],
                        "description": f"Subscription for {plan_info.get('credits_granted', 0)} credits",
                    },
                    "unit_amount": plan_info["price"] * 100,
                    "recurring": {
                        "interval": "day",
                        "interval_count": 30,
                    },
                },
                "quantity": 1,
            }],
            success_url=f"{frontend_url}/?payment=success",
            cancel_url=f"{frontend_url}/?payment=cancelled",
            metadata={
                "pending_signup_id": pending_signup_id,
                "plan": plan_info["plan_name"],
            },
        )
        return {"status": "success", "url": session.url}
    except Exception as e:
        pending_signups_collection.delete_one({"_id": pending_signup_id, "status": "pending"})
        raise HTTPException(status_code=500, detail=f"Stripe error: {str(e)}")

@router.post("/api/stripe/webhook")
async def stripe_webhook(request):
    """Handle Stripe webhook for paid subscription completion"""
    import stripe
    
    stripe_key = os.getenv("STRIPE_SECRET_KEY")
    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not stripe_key or not webhook_secret:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    stripe.api_key = stripe_key
    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    
    try:
        event = stripe.Webhook.construct_event(payload, sig, webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook signature failed")
    
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        if session.get("mode") != "subscription":
            return {"received": True}
        if (session.get("payment_status") or "").lower() not in {"paid", "no_payment_required"}:
            return {"received": True}
        
        metadata = session.get("metadata", {})
        pending_signup_id = metadata.get("pending_signup_id")
        if not pending_signup_id:
            return {"received": True}

        pending_signup = pending_signups_collection.find_one_and_update(
            {"_id": pending_signup_id, "status": "pending"},
            {
                "$set": {
                    "status": "processing",
                    "stripe_event_id": event.get("id"),
                    "stripe_session_id": session.get("id"),
                }
            },
            return_document=ReturnDocument.AFTER,
        )
        if not pending_signup:
            pending_signup = pending_signups_collection.find_one({
                "_id": pending_signup_id,
                "status": "processing",
                "stripe_session_id": session.get("id"),
            })
        if not pending_signup:
            return {"received": True}

        name = pending_signup["name"]
        email = pending_signup["email"]
        password_hash = pending_signup["password_hash"]
        plan_name = pending_signup["plan_name"]

        existing_admin = admins_collection.find_one({"email": email})
        if existing_admin:
            if existing_admin.get("stripe_session_id") == session.get("id"):
                pending_signups_collection.delete_one({"_id": pending_signup_id})
                return {"received": True}
            pending_signups_collection.update_one(
                {"_id": pending_signup_id},
                {"$set": {"status": "conflict", "conflict_at": datetime.now(timezone.utc)}},
            )
            logger.error("Stripe signup conflict for an existing account")
            return {"received": True}
        
        plan_info = plans_collection.find_one({"plan_name": plan_name})
        if not plan_info or metadata.get("plan") != plan_name:
            raise HTTPException(status_code=400, detail="Stripe checkout plan does not match")
        expected_amount = int(plan_info.get("price", 0)) * 100
        if (
            int(session.get("amount_total") or 0) != expected_amount
            or (session.get("currency") or "").lower() != "inr"
        ):
            raise HTTPException(status_code=400, detail="Stripe checkout amount does not match")

        credits_granted = plan_info.get("credits_granted", 30)
        duration = plan_info.get("duration", 30)
        now = datetime.now(timezone.utc)
        company_insert = companies_collection.insert_one({
            "name": pending_signup.get("company_name", ""),
            "subscription_plan": plan_name,
            "subscription_start": now.isoformat(),
            "subscription_expiry": (now + timedelta(days=duration)).isoformat(),
            "is_paid": True,
            "credits": credits_granted,
            "created_at": now.isoformat(),
        })

        try:
            admins_collection.insert_one({
                "custom_id": get_next_sequence_value("recruiter", "RC"),
                "username": email,
                "password": password_hash,
                "email": email,
                "name": name,
                "phone": pending_signup.get("phone", ""),
                "company_name": pending_signup.get("company_name", ""),
                "company_id": str(company_insert.inserted_id),
                "role": "super_admin",
                "subscription_plan": plan_name,
                "subscription_start": now.isoformat(),
                "subscription_expiry": (now + timedelta(days=duration)).isoformat(),
                "is_paid": True,
                "stripe_customer_id": session.get("customer"),
                "stripe_subscription_id": session.get("subscription"),
                "stripe_session_id": session.get("id"),
                "login_enabled": True,
                "created_at": now.isoformat()
            })
        except Exception:
            companies_collection.delete_one({"_id": company_insert.inserted_id})
            pending_signups_collection.update_one(
                {"_id": pending_signup_id, "status": "processing"},
                {
                    "$set": {"status": "pending"},
                    "$unset": {
                        "stripe_event_id": "",
                        "stripe_session_id": "",
                    },
                },
            )
            raise
        pending_signups_collection.delete_one({"_id": pending_signup_id})
        logger.info("Paid admin created via Stripe for plan %s", plan_name)
    
    return {"received": True}

# --------------------------------------------------------------------------------
# MASTER: GET ALL ADMINS WITH SUBSCRIPTION DETAILS
# --------------------------------------------------------------------------------

