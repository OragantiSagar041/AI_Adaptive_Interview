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

@router.post("/master/login")
def master_login(data: AdminLogin, request: Request):
    x_forwarded_for = request.headers.get("x-forwarded-for")
    client_ip = x_forwarded_for.split(",")[0].strip() if x_forwarded_for else (request.client.host if request.client else "unknown")
    global_policies = security_policies_collection.find_one({"_id": "global_policies"}) or {}
    
    # 1. IP Restriction Check
    if global_policies.get("restrict_ip"):
        allowed_ips = global_policies.get("allowed_ips", [])
        if client_ip not in allowed_ips and client_ip != "unknown":
            security_logs_collection.insert_one({
                "event_type": "FAILED_LOGIN",
                "username": data.username,
                "ip_address": client_ip,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "reason": "IP Restricted"
            })
            raise HTTPException(status_code=403, detail="Login from this IP address is restricted.")
            
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
    
    # 2. 2FA Check
    if global_policies.get("require_2fa"):
        import random
        otp = str(random.randint(100000, 999999))
        expiry_time = datetime.now(timezone.utc) + timedelta(minutes=10)
        admins_collection.update_one({"_id": user["_id"]}, {"$set": {"otp": otp, "otp_expiry": expiry_time}})
        
        # Send OTP email
        from app.routes.admin_dashboard import send_otp_email
        send_otp_email(user.get("email", user["username"]), user.get("name", user["username"]), otp)
        
        return {
            "status": "2fa_required",
            "admin_id": str(user["_id"])
        }
    
    # 3. Strict Session Timeout (30 mins if enabled, else default 7 days)
    expires_delta = timedelta(minutes=30) if global_policies.get("strict_session_timeout") else None
    
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user["role"], "company_id": str(user.get("company_id", ""))}, expires_delta=expires_delta)
    return {
        "status": "success",
        "master_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "role": user["role"]
    }

def parse_date_param(val: Optional[str], is_end: bool = False) -> Optional[datetime]:
    if not val or not str(val).strip():
        return None
    val = str(val).strip()
    try:
        if len(val) == 10 and val.count("-") == 2:
            d = datetime.strptime(val, "%Y-%m-%d")
            if is_end:
                return d.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc)
            else:
                return d.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
        parsed = parse_iso_datetime(val)
        if parsed and is_end and parsed.hour == 0 and parsed.minute == 0:
            parsed = parsed.replace(hour=23, minute=59, second=59, microsecond=999999)
        return parsed
    except Exception:
        return None

@router.get("/master/companies")
def get_companies(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    master_id: str = Depends(get_current_admin)
):
    require_master_user(master_id)
        
    start_dt = parse_date_param(start_date, is_end=False)
    end_dt = parse_date_param(end_date, is_end=True)
    
    companies = list(companies_collection.find())
    
    # Pre-fetch session counts for all companies using an aggregation pipeline
    pipeline = [
        {"$group": {
            "_id": "$company_id",
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "started": {"$sum": {"$cond": [{"$eq": ["$status", "started"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}},
            "deactivated": {"$sum": {"$cond": [{"$eq": ["$is_deactivated", True]}, 1, 0]}}
        }}
    ]
    session_counts = {str(item["_id"]): item for item in interview_sessions_collection.aggregate(pipeline)}
    
    # Pre-fetch primary admins for all companies
    company_ids = [str(c["_id"]) for c in companies]
    primary_admins = {str(admin["company_id"]): admin for admin in admins_collection.find({"company_id": {"$in": company_ids}, "role": "super_admin"})}
    
    result = []
    for c in companies:
        company_id = str(c["_id"])
        mock_user = {"company_id": company_id}
        plan_context = get_admin_plan_context(mock_user)
        
        c_date_str = c.get("created_at") or c.get("subscription_start")
        if start_dt or end_dt:
            c_dt = parse_iso_datetime(c_date_str) if c_date_str else None
            if start_dt and c_dt and c_dt < start_dt:
                continue
            if end_dt and c_dt and c_dt > end_dt:
                continue
        
        counts = session_counts.get(company_id, {})
        total_sessions = counts.get("total", 0)
        completed_sessions = counts.get("completed", 0)
        started_sessions = counts.get("started", 0)
        pending_sessions = counts.get("pending", 0)
        deactivated_sessions = counts.get("deactivated", 0)
        
        primary_admin = primary_admins.get(company_id)
        email = primary_admin.get("email", "") if primary_admin else ""
        username = primary_admin.get("username", "") if primary_admin else ""
        login_enabled = primary_admin.get("login_enabled", True) if primary_admin else False
        
        result.append({
            "id": company_id,
            "company_name": c.get("company_name") or c.get("name") or "Unknown",
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
            "features": c.get("features", None),
            "layout_config": c.get("layout_config", None),
        })
    return {"status": "success", "data": result}

@router.get("/master/stats")
def get_master_dashboard_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    master_id: str = Depends(get_current_admin)
):
    require_master_user(master_id)
    
    start_dt = parse_date_param(start_date, is_end=False)
    end_dt = parse_date_param(end_date, is_end=True)
    
    # 1. Plan lookup pricing in INR
    plans_dict = {}
    try:
        for p in plans_collection.find():
            p_name = (p.get("plan_name") or "").lower()
            plans_dict[p_name] = p.get("price", 0)
    except Exception:
        pass
    if "basic" not in plans_dict and "basic plan" not in plans_dict:
        plans_dict["basic"] = 4999
        plans_dict["basic plan"] = 4999
    if "advance" not in plans_dict and "advance plan" not in plans_dict:
        plans_dict["advance"] = 14999
        plans_dict["advance plan"] = 14999
        
    # 2. Total Conducted Interviews from Mongo (filtered by date if provided)
    session_conditions = []
    if start_dt:
        session_conditions.append({
            "$or": [
                {"created_at": {"$gte": start_dt.isoformat()}},
                {"created_at": {"$gte": start_dt}},
                {"session_start": {"$gte": start_dt.isoformat()}},
                {"session_start": {"$gte": start_dt}}
            ]
        })
    if end_dt:
        session_conditions.append({
            "$or": [
                {"created_at": {"$lte": end_dt.isoformat()}},
                {"created_at": {"$lte": end_dt}},
                {"session_start": {"$lte": end_dt.isoformat()}},
                {"session_start": {"$lte": end_dt}}
            ]
        })
    
    session_filter = {"$and": session_conditions} if session_conditions else {}
    
    total_interviews = interview_sessions_collection.count_documents(session_filter)
    completed_interviews = interview_sessions_collection.count_documents({**session_filter, "status": "completed"})
    
    # 3. Total Revenue — use ACTUAL verified payment orders (same as company-revenue endpoint)
    all_companies = list(companies_collection.find())
    filtered_companies = []
    active_companies_count = 0
    plan_counts = {}

    now = datetime.now(timezone.utc)
    is_custom_range = (start_dt is not None or end_dt is not None)

    # Build company/admin lookup maps for order attribution
    company_ids = [str(c["_id"]) for c in all_companies]
    primary_admins_map = {
        str(adm.get("company_id")): adm
        for adm in admins_collection.find({"company_id": {"$in": company_ids}, "role": "super_admin"})
    }
    admin_to_company = {}
    email_to_company = {}
    for cid, adm in primary_admins_map.items():
        if adm.get("_id"):
            admin_to_company[str(adm["_id"])] = cid
        if adm.get("email"):
            email_to_company[adm["email"].lower().strip()] = cid

    # Load all payment orders
    all_orders = list(payment_orders_collection.find().sort("created_at", -1))
    orders_by_company: dict = defaultdict(list)
    for o in all_orders:
        cid = o.get("company_id")
        if not cid or cid not in company_ids:
            aid = str(o.get("admin_id") or "")
            if aid in admin_to_company:
                cid = admin_to_company[aid]
            elif o.get("email") and o["email"].lower().strip() in email_to_company:
                cid = email_to_company[o["email"].lower().strip()]
        if cid:
            orders_by_company[cid].append(o)

    # Tally actual verified revenue per company
    company_revenue_map: dict = {}
    for company_id, c_orders in orders_by_company.items():
        rev = 0
        count = 0
        for o in c_orders:
            o_status = o.get("status", "created")
            o_amt_raw = o.get("amount", 0)
            o_amt_inr = (o_amt_raw / 100) if o_amt_raw >= 1000 else o_amt_raw
            o_date = o.get("created_at") or o.get("verified_at") or o.get("consumed_at")
            o_date_str = o_date.isoformat() if isinstance(o_date, datetime) else str(o_date or "")
            o_dt = parse_iso_datetime(o_date_str) if o_date_str else None
            if start_dt and o_dt and o_dt < start_dt:
                continue
            if end_dt and o_dt and o_dt > end_dt:
                continue
            if o_status in ["verified", "consumed", "success", "captured", "paid"]:
                rev += o_amt_inr
                count += 1
        company_revenue_map[company_id] = {"revenue": rev, "count": count}

    total_sales_inr = 0
    for c in all_companies:
        company_id = str(c["_id"])
        mock_user = {"company_id": company_id}
        plan_context = get_admin_plan_context(mock_user)
        plan_key = (plan_context.get("plan_key") or "trial").lower()
        plan_label = plan_context.get("plan_label") or "Free Trial"
        is_expired = plan_context.get("is_expired", False)

        # Determine price in INR for provisioned-only companies
        if "advance" in plan_key or "advance" in plan_label.lower():
            price = plans_dict.get("advance plan", plans_dict.get("advance", 14999))
        elif "basic" in plan_key or "basic" in plan_label.lower():
            price = plans_dict.get("basic plan", plans_dict.get("basic", 4999))
        elif "owner" in plan_key or "trial" in plan_key:
            price = 0
        else:
            price = plans_dict.get(plan_label.lower(), plans_dict.get(plan_key, 0))

        c_date_str = c.get("created_at") or c.get("subscription_start")
        c_dt = parse_iso_datetime(c_date_str) if c_date_str else None

        matches_date = True
        if start_dt and c_dt and c_dt < start_dt:
            matches_date = False
        if end_dt and c_dt and c_dt > end_dt:
            matches_date = False

        if matches_date:
            filtered_companies.append(c)
            plan_counts[plan_label] = plan_counts.get(plan_label, 0) + 1
            if not is_expired:
                active_companies_count += 1

            cr = company_revenue_map.get(company_id, {})
            actual_rev = cr.get("revenue", 0)
            actual_count = cr.get("count", 0)
            # Use actual payments; fall back to provisioned plan price when no orders
            if actual_count > 0:
                total_sales_inr += actual_rev
            else:
                total_sales_inr += price

    # Chart Generation according to filter
    chart_labels = []
    chart_values = []
    
    if start_dt and end_dt:
        days_diff = (end_dt.date() - start_dt.date()).days + 1
        if 1 <= days_diff <= 31:
            # Daily breakdown
            curr = start_dt.date()
            daily_rev = {}
            for i in range(days_diff):
                d = curr + timedelta(days=i)
                d_str = d.strftime("%b %d")
                chart_labels.append(d_str)
                daily_rev[d.isoformat()] = 0
                
            for c in filtered_companies:
                c_date_str = c.get("created_at") or c.get("subscription_start")
                c_dt = parse_iso_datetime(c_date_str) if c_date_str else None
                if c_dt:
                    d_iso = c_dt.date().isoformat()
                    if d_iso in daily_rev:
                        p_val = 14999 if "adv" in (c.get("subscription_plan") or "") else (4999 if "basic" in (c.get("subscription_plan") or "") else 0)
                        daily_rev[d_iso] += p_val
                        
            running = 0
            for i in range(days_diff):
                d = curr + timedelta(days=i)
                running += daily_rev.get(d.isoformat(), 0)
                chart_values.append(running if running > 0 else int(total_sales_inr * ((i + 1) / max(1, days_diff))))
        else:
            # Range spread over 6 intervals
            for i in range(6):
                m_date = start_dt + timedelta(days=int(i * (days_diff / 5)))
                chart_labels.append(m_date.strftime("%b %d"))
                chart_values.append(int(total_sales_inr * ((i + 1) / 6)))
    else:
        # Default 6-month view
        for i in range(5, -1, -1):
            m_date = now - timedelta(days=i * 30)
            chart_labels.append(m_date.strftime("%b"))
        
        chart_values = [0] * 6
        for c in all_companies:
            c_date_str = c.get("created_at") or c.get("subscription_start")
            plan_key = (c.get("subscription_plan") or "").lower()
            try:
                if c_date_str:
                    c_dt = parse_iso_datetime(c_date_str)
                    days_ago = (now - c_dt).days
                    month_idx = 5 - min(5, max(0, days_ago // 30))
                    p_val = 14999 if "adv" in plan_key else (4999 if "basic" in plan_key else 0)
                    for idx in range(month_idx, 6):
                        chart_values[idx] += p_val
            except Exception:
                pass
        chart_values[5] = total_sales_inr
        for idx in range(4, -1, -1):
            if chart_values[idx] == 0 and chart_values[idx+1] > 0:
                chart_values[idx] = int(chart_values[idx+1] * 0.75)
    
    # 4. System Health & Database Latency
    t0 = time.time()
    try:
        mongo_client.admin.command('ping')
        ping_ms = round((time.time() - t0) * 1000, 1)
        system_status = "Operational"
        health_score = "100%" if ping_ms < 100 else "99.9%"
    except Exception:
        ping_ms = 0
        system_status = "Degraded"
        health_score = "95.0%"

    prev_mrr = chart_values[-2] if len(chart_values) >= 2 else total_sales_inr
    growth_pct = 0.0
    if prev_mrr > 0 and total_sales_inr >= prev_mrr:
        growth_pct = round(((total_sales_inr - prev_mrr) / prev_mrr) * 100, 1)
    elif total_sales_inr > 0:
        growth_pct = 100.0

    return {
        "status": "success",
        "data": {
            "mrr_inr": total_sales_inr,
            "currency": "INR",
            "currency_symbol": "₹",
            "growth_pct": growth_pct,
            "total_companies": len(filtered_companies) if is_custom_range else len(all_companies),
            "active_companies": active_companies_count,
            "total_interviews_conducted": total_interviews,
            "completed_interviews": completed_interviews,
            "system_health": health_score,
            "system_status": system_status,
            "latency_ms": ping_ms,
            "is_filtered": is_custom_range,
            "start_date": start_date,
            "end_date": end_date,
            "mrr_chart": {
                "labels": chart_labels,
                "values": chart_values
            },
            "plan_distribution": plan_counts if plan_counts else {"Free Trial": 1}
        }
    }

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
        "company_name": data.company_name,
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
        "company_name": data.company_name,
        "login_enabled": True,
        "created_at": start.isoformat()
    }
    
    new_tenant["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_tenant)
    
    # Send credentials email to the new tenant
    brevo_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "support@hireiq.com")
    if brevo_key:
        try:
            import requests
            email_html = f"""
            <html><body style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333;">
                <h2 style="color: #4f46e5;">Welcome to Hire IQ!</h2>
                <p>Hello,</p>
                <p>Your tenant account for <b>{data.company_name}</b> has been successfully provisioned on Hire IQ.</p>
                <p>Here are your admin login credentials:</p>
                <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p style="margin: 5px 0;"><b>Login URL:</b> <a href="https://hireiq.com/login" style="color: #4f46e5;">https://hireiq.com/login</a></p>
                    <p style="margin: 5px 0;"><b>Username:</b> {data.username}</p>
                    <p style="margin: 5px 0;"><b>Password:</b> {data.password}</p>
                </div>
                <p>Please log in and change your password as soon as possible.</p>
                <p>Best regards,<br>The Hire IQ Team</p>
            </body></html>
            """
            requests.post("https://api.brevo.com/v3/smtp/email", json={
                "sender": {"name": "Hire IQ", "email": sender_email},
                "to": [{"email": data.email, "name": data.company_name}],
                "subject": f"Welcome to Hire IQ - Account Credentials for {data.company_name}",
                "htmlContent": email_html
            }, headers={"api-key": brevo_key, "content-type": "application/json"}, timeout=5)
            logger.info(f"Sent credentials email to {data.email}")
        except Exception as email_err:
            logger.error(f'Error sending tenant credentials email: {email_err}')

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
@router.post("/master/companies/{company_id}")
@router.patch("/master/companies/{company_id}")
def update_company(company_id: str, data: TenantUpdate, master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
        
    try:
        company = companies_collection.find_one({"_id": ObjectId(company_id)})
    except Exception:
        company = None
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    update_fields = {}
    admin_update_fields = {}
    now = datetime.now(timezone.utc)
    
    # 1. Company Name Sync
    new_company_name = data.company_name or data.name
    if new_company_name:
        update_fields["name"] = new_company_name
        admin_update_fields["company_name"] = new_company_name
        
    # 2. Email & Username Sync
    if data.email:
        update_fields["email"] = data.email
        admin_update_fields["email"] = data.email
    if data.username:
        admin_update_fields["username"] = data.username
        admin_update_fields["name"] = data.username

    # 3. Subscription Plan
    req_plan = data.subscription_plan or data.plan_name or data.plan_key
    old_plan = company.get("subscription_plan", "trial")
    if req_plan and req_plan != old_plan:
        update_fields["subscription_plan"] = req_plan
        admin_update_fields["subscription_plan"] = req_plan
        history_entry = {
            "plan_name": old_plan,
            "replaced_by": req_plan,
            "changed_at": now.isoformat(),
            "changed_by": "master"
        }
        companies_collection.update_one(
            {"_id": ObjectId(company_id)},
            {"$push": {"plan_history": history_entry}}
        )
    elif req_plan:
        update_fields["subscription_plan"] = req_plan
        admin_update_fields["subscription_plan"] = req_plan

    # 4. Expiry / Extension Days
    days_to_add = data.add_days or data.extend_days or data.days_to_add or 0
    if days_to_add > 0:
        current_expiry = company.get("subscription_expiry")
        try:
            exp_dt = datetime.fromisoformat(str(current_expiry).replace("Z", "+00:00")) if current_expiry else now
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt < now:
                exp_dt = now # If already expired, start from today
            
            new_expiry = exp_dt + timedelta(days=days_to_add)
            update_fields["subscription_expiry"] = new_expiry.isoformat()
        except Exception:
            update_fields["subscription_expiry"] = (now + timedelta(days=days_to_add)).isoformat()
            
    # 5. Credits
    if data.credits is not None:
        update_fields["credits"] = max(0, data.credits)
    elif data.add_credits > 0:
        current_credits = company.get("credits", 0)
        update_fields["credits"] = current_credits + add_credits
    elif raw_credits is not None:
        update_fields["credits"] = int(raw_credits)

    co_name = payload_data.get("company_name") or payload_data.get("name")
    if co_name:
        update_fields["company_name"] = str(co_name).strip()
        update_fields["name"] = str(co_name).strip()
        
    # 6. Features & Layout / Branding
    if data.features is not None:
        update_fields["features"] = data.features
    if data.layout_config is not None:
        update_fields["layout_config"] = data.layout_config
    if data.branding is not None:
        update_fields["branding"] = data.branding

    # 7. Status & Login Access
    login_val = data.login_enabled if data.login_enabled is not None else data.is_active
    if data.status is not None and login_val is None:
        login_val = (data.status != "blocked")
        
    if login_val is not None:
        update_fields["login_enabled"] = login_val
        update_fields["is_active"] = login_val
        update_fields["status"] = "active" if login_val else "blocked"
        admins_collection.update_many(
            {"company_id": str(company_id)},
            {"$set": {"login_enabled": login_val, "updated_at": now.isoformat()}}
        )

    # 8. Persist to MongoDB
    update_fields["updated_at"] = now.isoformat()
    companies_collection.update_one({"_id": ObjectId(company_id)}, {"$set": update_fields})
    
    if admin_update_fields:
        admin_update_fields["updated_at"] = now.isoformat()
        admins_collection.update_many(
            {"company_id": str(company_id), "role": {"$in": ["super_admin", "superadmin"]}},
            {"$set": admin_update_fields}
        )

    # Broadcast real-time profile update
    try:
        broadcast_profile_update(
            company_id=str(company_id),
            credits=update_fields.get("credits", company.get("credits", 0)),
            login_enabled=update_fields.get("login_enabled", company.get("login_enabled", True))
        )
    except Exception:
        pass

    return {"status": "success", "message": "Company updated successfully", "data": update_fields}


@router.patch("/master/companies/{company_id}/subscription")
def patch_company_subscription(company_id: str, data: MasterSubscriptionPatch, master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    try:
        company = companies_collection.find_one({"_id": ObjectId(company_id)})
    except Exception:
        company = None
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    tenant_update = TenantUpdate(
        plan_key=data.plan_key,
        plan_name=data.plan_name,
        days_to_add=data.days_to_add or data.extend_days,
        credits=data.credits,
        add_credits=data.add_credits,
    )
    return update_company(company_id=company_id, data=tenant_update, master_id=master_id)


@router.get("/master/company-revenue")
def get_company_revenue(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    plan_filter: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = "revenue_desc",
    master_id: str = Depends(get_current_admin)
):
    require_master_user(master_id)
    
    start_dt = parse_date_param(start_date, is_end=False)
    end_dt = parse_date_param(end_date, is_end=True)
    
    # 1. Load plans pricing
    plans_dict = {}
    try:
        for p in plans_collection.find():
            p_name = (p.get("plan_name") or "").lower()
            plans_dict[p_name] = p.get("price", 0)
    except Exception:
        pass
    if "basic" not in plans_dict and "basic plan" not in plans_dict:
        plans_dict["basic"] = 4999
        plans_dict["basic plan"] = 4999
    if "advance" not in plans_dict and "advance plan" not in plans_dict:
        plans_dict["advance"] = 14999
        plans_dict["advance plan"] = 14999

    # 2. Load all companies
    companies = list(companies_collection.find())
    company_ids = [str(c["_id"]) for c in companies]

    # 3. Load all primary admins for these companies
    primary_admins = {
        str(admin.get("company_id")): admin
        for admin in admins_collection.find({"company_id": {"$in": company_ids}, "role": "super_admin"})
    }

    # 4. Load all verified/consumed & created payment orders
    all_orders = list(payment_orders_collection.find().sort("created_at", -1))
    orders_by_company = defaultdict(list)
    
    admin_to_company = {}
    email_to_company = {}
    for cid, adm in primary_admins.items():
        if adm.get("_id"):
            admin_to_company[str(adm["_id"])] = cid
        if adm.get("email"):
            email_to_company[adm["email"].lower().strip()] = cid
            
    for o in all_orders:
        cid = o.get("company_id")
        if not cid or cid not in company_ids:
            aid = str(o.get("admin_id") or "")
            if aid in admin_to_company:
                cid = admin_to_company[aid]
            elif o.get("email") and o["email"].lower().strip() in email_to_company:
                cid = email_to_company[o["email"].lower().strip()]
        if cid:
            orders_by_company[cid].append(o)

    # 5. Pre-fetch session stats per company
    session_pipeline = [
        {"$group": {
            "_id": "$company_id",
            "total": {"$sum": 1},
            "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
            "started": {"$sum": {"$cond": [{"$eq": ["$status", "started"]}, 1, 0]}},
            "pending": {"$sum": {"$cond": [{"$eq": ["$status", "pending"]}, 1, 0]}}
        }}
    ]
    session_counts = {str(item["_id"]): item for item in interview_sessions_collection.aggregate(session_pipeline)}

    now = datetime.now(timezone.utc)
    company_results = []
    
    total_platform_revenue = 0
    total_purchases_all = 0
    plan_revenue_map = defaultdict(int)
    
    for c in companies:
        company_id = str(c["_id"])
        mock_user = {"company_id": company_id}
        plan_context = get_admin_plan_context(mock_user)
        plan_key = (plan_context.get("plan_key") or "trial").lower()
        plan_label = plan_context.get("plan_label") or "Free Trial"
        is_expired = plan_context.get("is_expired", False)
        
        # Determine current plan price
        if "advance" in plan_key or "advance" in plan_label.lower():
            current_plan_price = plans_dict.get("advance plan", plans_dict.get("advance", 14999))
        elif "basic" in plan_key or "basic" in plan_label.lower():
            current_plan_price = plans_dict.get("basic plan", plans_dict.get("basic", 4999))
        elif "owner" in plan_key or "trial" in plan_key:
            current_plan_price = 0
        else:
            current_plan_price = plans_dict.get(plan_label.lower(), plans_dict.get(plan_key, 0))

        adm = primary_admins.get(company_id, {})
        admin_name = adm.get("name") or adm.get("full_name") or adm.get("username") or "Admin"
        admin_email = adm.get("email") or ""
        admin_username = adm.get("username") or ""
        login_enabled = adm.get("login_enabled", True) if adm else True
        
        company_orders = orders_by_company.get(company_id, [])
        
        formatted_txns = []
        company_paid_revenue = 0
        verified_orders_count = 0
        
        for ord_item in company_orders:
            o_status = ord_item.get("status", "created")
            o_amt_raw = ord_item.get("amount", 0)
            o_amt_inr = (o_amt_raw / 100) if o_amt_raw >= 1000 else o_amt_raw
            
            o_date = ord_item.get("created_at") or ord_item.get("verified_at") or ord_item.get("consumed_at")
            o_date_str = o_date.isoformat() if isinstance(o_date, datetime) else str(o_date or "")
            o_dt = parse_iso_datetime(o_date_str) if o_date_str else None
            
            if start_dt and o_dt and o_dt < start_dt:
                continue
            if end_dt and o_dt and o_dt > end_dt:
                continue
                
            p_name = ord_item.get("plan_name") or ("Advance Plan" if o_amt_inr >= 10000 else "Basic Plan" if o_amt_inr >= 2000 else "Credit Top-Up")
            
            is_successful = o_status in ["verified", "consumed", "success", "captured", "paid"]
            if is_successful:
                company_paid_revenue += o_amt_inr
                verified_orders_count += 1
                plan_revenue_map[p_name] += int(o_amt_inr)
                
            formatted_txns.append({
                "order_id": ord_item.get("order_id", f"ORD-{str(ord_item.get('_id', ''))[-6:].upper()}"),
                "payment_id": ord_item.get("payment_id", "—"),
                "plan_name": p_name,
                "amount": int(o_amt_inr),
                "status": "verified" if is_successful else o_status,
                "date": o_date_str,
                "type": ord_item.get("type", "Plan Subscription" if "plan" in str(p_name).lower() else "Credit Top-Up")
            })

        if current_plan_price > 0:
            if verified_orders_count == 0:
                company_paid_revenue += current_plan_price
                verified_orders_count = 1
                plan_revenue_map[plan_label] += int(current_plan_price)
                formatted_txns.append({
                    "order_id": f"DIR-{company_id[:8].upper()}",
                    "payment_id": "MASTER-PROVISIONED",
                    "plan_name": plan_label,
                    "amount": int(current_plan_price),
                    "status": "verified",
                    "date": c.get("subscription_start") or c.get("created_at") or now.isoformat(),
                    "type": "Admin Direct Provision"
                })

        raw_plan_history = c.get("plan_history", [])
        previous_plans = []
        if isinstance(raw_plan_history, list) and len(raw_plan_history) > 0:
            for ph in raw_plan_history:
                ph_name = ph.get("plan_name", "Free Trial")
                ph_label = ph.get("plan_label") or ph_name
                ph_price = plans_dict.get(ph_name.lower(), 0)
                previous_plans.append({
                    "plan_name": ph_name,
                    "plan_label": ph_label,
                    "price": ph_price,
                    "changed_at": ph.get("changed_at", ""),
                    "changed_by": ph.get("changed_by", "Master Admin"),
                    "replaced_by": ph.get("replaced_by", plan_label)
                })
        else:
            if plan_key != "trial":
                previous_plans.append({
                    "plan_name": "trial",
                    "plan_label": "Free Trial",
                    "price": 0,
                    "changed_at": c.get("created_at", ""),
                    "changed_by": "Initial Signup",
                    "replaced_by": plan_label
                })

        last_payment_date = c.get("subscription_start") or c.get("created_at") or ""
        if formatted_txns:
            valid_dates = [t["date"] for t in formatted_txns if t.get("date")]
            if valid_dates:
                last_payment_date = max(valid_dates)

        c_date_str = c.get("created_at") or c.get("subscription_start")
        c_dt = parse_iso_datetime(c_date_str) if c_date_str else None
        if start_dt and c_dt and c_dt < start_dt and not formatted_txns:
            continue
        if end_dt and c_dt and c_dt > end_dt and not formatted_txns:
            continue

        if plan_filter and plan_filter != "all":
            if plan_filter.lower() not in plan_key and plan_filter.lower() not in plan_label.lower():
                continue

        c_name = c.get("name", "Unknown")
        if search and search.strip():
            sq = search.strip().lower()
            if sq not in c_name.lower() and sq not in admin_email.lower() and sq not in admin_username.lower():
                continue

        sc = session_counts.get(company_id, {})
        
        company_obj = {
            "id": company_id,
            "company_name": c_name,
            "admin_name": admin_name,
            "admin_email": admin_email,
            "admin_username": admin_username,
            "login_enabled": login_enabled,
            "created_at": c.get("created_at", ""),
            "current_plan": {
                "key": plan_key,
                "label": plan_label,
                "price": int(current_plan_price),
                "credits": c.get("credits", 0),
                "days_remaining": plan_context["days_remaining"],
                "is_expired": is_expired,
                "start_date": c.get("subscription_start", ""),
                "expiry_date": c.get("subscription_expiry", ""),
                "status": "expired" if is_expired else ("trial" if plan_key == "trial" else "active")
            },
            "previous_plans": previous_plans,
            "total_purchases_count": verified_orders_count,
            "total_revenue": int(company_paid_revenue),
            "avg_order_value": int(company_paid_revenue / verified_orders_count) if verified_orders_count > 0 else 0,
            "last_payment_date": last_payment_date,
            "transactions": formatted_txns,
            "sessions_stats": {
                "total": sc.get("total", 0),
                "completed": sc.get("completed", 0),
                "started": sc.get("started", 0),
                "pending": sc.get("pending", 0)
            }
        }

        total_platform_revenue += company_paid_revenue
        total_purchases_all += verified_orders_count
        company_results.append(company_obj)

    if sort_by == "revenue_desc":
        company_results.sort(key=lambda x: x["total_revenue"], reverse=True)
    elif sort_by == "revenue_asc":
        company_results.sort(key=lambda x: x["total_revenue"])
    elif sort_by == "orders_desc":
        company_results.sort(key=lambda x: x["total_purchases_count"], reverse=True)
    elif sort_by == "name_asc":
        company_results.sort(key=lambda x: x["company_name"].lower())
    elif sort_by == "date_desc":
        company_results.sort(key=lambda x: x["created_at"], reverse=True)
    else:
        company_results.sort(key=lambda x: x["total_revenue"], reverse=True)

    top_company = None
    if company_results:
        sorted_by_rev = sorted(company_results, key=lambda x: x["total_revenue"], reverse=True)
        if sorted_by_rev and sorted_by_rev[0]["total_revenue"] > 0:
            top_company = {
                "name": sorted_by_rev[0]["company_name"],
                "revenue": sorted_by_rev[0]["total_revenue"],
                "plan": sorted_by_rev[0]["current_plan"]["label"]
            }

    paid_companies = [comp for comp in company_results if comp["total_revenue"] > 0 or comp["current_plan"]["key"] != "trial"]
    trial_companies = [comp for comp in company_results if comp["total_revenue"] == 0 and comp["current_plan"]["key"] == "trial"]

    summary = {
        "total_platform_revenue": int(total_platform_revenue),
        "total_purchases_count": total_purchases_all,
        "total_companies_count": len(company_results),
        "paid_companies_count": len(paid_companies),
        "trial_companies_count": len(trial_companies),
        "top_contributing_company": top_company,
        "average_revenue_per_company": int(total_platform_revenue / len(company_results)) if company_results else 0,
        "revenue_by_plan": dict(plan_revenue_map)
    }

    return {
        "status": "success",
        "summary": summary,
        "companies": company_results
    }

@router.post("/master/companies/{company_id}/login")
def set_company_login(company_id: str, payload: Dict[str, bool], master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    enabled = bool(payload.get("login_enabled", True))
    from app.services.services import sync_company_and_admins
    sync_company_and_admins(company_id, {"login_enabled": enabled, "status": "blocked" if not enabled else "active"})
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

