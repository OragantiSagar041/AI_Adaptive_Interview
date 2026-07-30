"""
app/routes_split/credits.py — Credit requests
Auto-split from routes.py lines 9010–9166.
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

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/admin/credit-requests")
def request_credits(data: CreditRequestCreate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only tenant admins can request credits")
        
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    
    request_doc = {
        "admin_id": admin_id,
        "company_id": company_id,
        "amount": data.amount,
        "reason": data.reason,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    credit_requests_collection.insert_one(request_doc)
    
    # Send notification to superadmin
    try:
        admin_user = admins_collection.find_one({"_id": ObjectId(admin_id)})
        admin_name = admin_user.get("name") or admin_user.get("username") or "An admin"
        notifications_collection.insert_one({
            "title": "Credits Requested",
            "message": f"{admin_name} has requested {data.amount} additional credits.",
            "type": "credits",
            "recipient_role": "superadmin",
            "company_id": company_id,
            "read": False,
            "created_at": request_doc["created_at"]
        })
    except Exception as ne:
        print(f"Failed to create credit request notification: {ne}")
        
    return {"status": "success", "message": "Credit request submitted successfully"}

@router.get("/super-admin/credit-requests")
def get_credit_requests(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
        
    company_id = current_admin.get("company_id")
    requests = list(credit_requests_collection.find({"company_id": company_id}))
    
    # Enrich with admin details
    for req in requests:
        req["id"] = str(req["_id"])
        req["_id"] = str(req["_id"])
        admin_doc = admins_collection.find_one({"_id": ObjectId(req["admin_id"])})
        if admin_doc:
            req["admin_name"] = admin_doc.get("name", admin_doc.get("username", "Unknown"))
            req["admin_email"] = admin_doc.get("email", "Unknown")
            
    # Sort pending first, then by date descending
    requests.sort(key=lambda x: (0 if x["status"] == "pending" else 1, x.get("created_at", "")), reverse=True)
    return {"status": "success", "data": requests}

@router.put("/super-admin/credit-requests/{request_id}")
def update_credit_request(request_id: str, data: CreditRequestUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
        
    company_id = current_admin.get("company_id")
    if data.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")

    with mongo_client.start_session() as db_session:
        with db_session.start_transaction():
            req = credit_requests_collection.find_one_and_update(
                {
                    "_id": ObjectId(request_id),
                    "company_id": company_id,
                    "status": "pending",
                },
                {"$set": {
                    "status": data.status,
                    "processed_at": datetime.now(timezone.utc).isoformat(),
                    "processed_by": current_admin["admin_id"],
                }},
                return_document=ReturnDocument.BEFORE,
                session=db_session,
            )
            if not req:
                raise HTTPException(status_code=409, detail="Request was already processed or does not exist")

            if data.status == "approved":
                amount = req["amount"]
                company = companies_collection.find_one_and_update(
                    {"_id": ObjectId(company_id), "credits": {"$gte": amount}},
                    {"$inc": {"credits": -amount}},
                    return_document=ReturnDocument.AFTER,
                    session=db_session,
                )
                if not company:
                    raise HTTPException(status_code=400, detail="Insufficient company credits")
                admin_result = admins_collection.update_one(
                    {"_id": ObjectId(req["admin_id"]), "company_id": company_id},
                    {"$inc": {"credits": amount}},
                    session=db_session,
                )
                if admin_result.matched_count != 1:
                    raise HTTPException(status_code=404, detail="Requesting admin no longer exists")
        
    if data.status == "approved":
        # Broadcast to requesting admin
        updated_admin = admins_collection.find_one({"_id": ObjectId(req["admin_id"])})
        if updated_admin:
            broadcast_profile_update(
                admin_id=str(req["admin_id"]),
                company_id=str(company_id or ""),
                credits=updated_admin.get("credits", 0),
                login_enabled=updated_admin.get("login_enabled")
            )
            
        # Broadcast to Super Admin (company credits updated)
        broadcast_profile_update(
            admin_id=current_admin["admin_id"],
            company_id=str(company_id or ""),
            credits=companies_collection.find_one({"_id": ObjectId(company_id)}).get("credits", 0) if company_id else 0
        )
    else:
        # If rejected, still broadcast an event so the Super Admin list updates to show the request is no longer pending!
        broadcast_profile_update(
            admin_id=str(req["admin_id"]),
            company_id=str(company_id or ""),
            extra={"status_change": "rejected"}
        )
        
    # Send notification to the requesting admin
    try:
        notifications_collection.insert_one({
            "title": f"Credits Request {data.status.capitalize()}",
            "message": f"Your request for {req['amount']} additional credits has been {data.status}.",
            "type": "credits",
            "recipient_role": "admin",
            "company_id": company_id,
            "read": False,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as ne:
        print(f"Failed to create credit request resolution notification: {ne}")
        
    return {"status": "success", "message": f"Request {data.status} successfully"}


class ExportExcelRequest(BaseModel):
    candidates: List[Dict[str, Any]]

class BulkDeleteRequest(BaseModel):
    ids: List[str]

class UpdateCreditRequestSchema(BaseModel):
    status: str

from fastapi import WebSocket, WebSocketDisconnect

