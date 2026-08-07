"""
app/routes_split/ws_dashboard.py — WebSocket dashboard + admin dash
Auto-split from routes.py lines 9167–9591.
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

from app.routes.admin_dashboard import get_dashboard_stats
from app.routes.session_complete import _load_live_snapshots

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket, token: Optional[str] = None):
    from app.db.redis_manager import manager
    if not token:
        await websocket.close(code=1008)
        return
    try:
        auth_context = _decode_dashboard_websocket_admin(token)
    except HTTPException:
        await websocket.close(code=1008)
        return
    await manager.connect_dashboard(websocket, auth_context)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)

@router.get("/dashboard")
async def get_dashboard_aggregated_data(
    admin_id: Optional[str] = None,
    summary_only: bool = False,
    current_admin: dict = Depends(get_current_admin_details),
):
    try:
        from app.db.redis_manager import manager
        import json
        
        stats_data = await get_dashboard_stats(admin_id=admin_id, current_admin=current_admin)
        
        # Restore candidate query since the frontend still expects candidates in this payload
        c_query_filter = {
            "is_deactivated": {"$ne": True}
        }
        if current_admin.get("role") != "master":
            c_query_filter["company_id"] = current_admin.get("company_id")
        if current_admin.get("role") == "admin":
            c_query_filter["created_by"] = current_admin["admin_id"]
        elif admin_id:
            c_query_filter["created_by"] = admin_id
            
        candidate_projection = {
            "link_id": 1,
            "candidate_name": 1,
            "candidate_email": 1,
            "candidate_phone": 1,
            "interview_title": 1,
            "score": 1,
            "avg_score": 1,
            "status": 1,
            "decision": 1,
            "created_at": 1,
            "expires_at": 1,
            "started_at": 1,
            "interview_duration": 1,
            "is_deactivated": 1,
            "company_id": 1,
            "created_by": 1,
        }
        
        def _load_dashboard_candidates():
            cursor = interview_sessions_collection.find(c_query_filter, candidate_projection).sort("created_at", -1)
            if summary_only:
                cursor = cursor.limit(8)
            else:
                cursor = cursor.limit(1000) # Prevent MongoDB NetworkTimeout by setting a generous upper bound
            return list(cursor)

        candidates_cursor = await asyncio.to_thread(_load_dashboard_candidates)
        
        # Get AI Calling interested candidates
        apps = []
        try:
            jobs_query = {}
            if current_admin.get("role") != "master":
                jobs_query["company_id"] = current_admin.get("company_id")
            if current_admin.get("role") == "admin":
                jobs_query["admin_id"] = current_admin["admin_id"]
            elif admin_id:
                jobs_query["admin_id"] = admin_id
            jobs = [] if summary_only else await asyncio.to_thread(lambda: list(jobs_collection.find(jobs_query)))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids}
            }
            if job_ids:
                apps = await asyncio.to_thread(lambda: list(job_applications_collection.find(app_query)))
        except Exception as e:
            print(f"Error fetching AI Calling candidates: {e}")
            
        # Pre-fetch admins for ID generation
        admins_in_company = list(admins_collection.find({"company_id": current_admin.get("company_id")}, {"name": 1, "username": 1, "role": 1}))
        admin_map = {str(a["_id"]): a for a in admins_in_company}
        super_admin = next((a for a in admins_in_company if a.get("role") == "super_admin"), None)
        sa_prefix = (super_admin.get("name") or super_admin.get("username") or "SA")[:2].upper() if super_admin else "SA"
        
        seen_emails = set()
        candidates_list = []
        now = datetime.now(timezone.utc)
        for c in candidates_cursor:
            email = c.get("candidate_email") or c.get("email")
            if email:
                seen_emails.add(email.strip().lower())
            
            c["status"] = sync_session_status(c, now)
            
            creator_id = c.get("created_by")
            creator = admin_map.get(str(creator_id)) if creator_id else None
            su_prefix = (creator.get("name") or creator.get("username") or "AD")[:2].upper() if creator else sa_prefix
            
            c_name = c.get("candidate_name") or "CA"
            ca_prefix = c_name[:2].upper()
            
            base_id = str(c["_id"])
            c["candidate_id"] = f"{sa_prefix}{su_prefix}{ca_prefix}{base_id[-4:] if len(base_id) >= 4 else base_id}"
            
            c["id"] = base_id
            c["_id"] = base_id
            candidates_list.append(c)
            
        for app in apps:
            email = app.get("email")
            if email:
                email_lower = email.strip().lower()
                if email_lower in seen_emails:
                    continue
                seen_emails.add(email_lower)
            
            app_id = str(app.get("_id"))
            score = app.get("score") or 0.0
            
            su_prefix = sa_prefix 
            c_name = app.get("name") or "CA"
            ca_prefix = c_name[:2].upper()
            cand_id = f"{sa_prefix}{su_prefix}{ca_prefix}{app_id[-4:] if len(app_id) >= 4 else app_id}"
            
            mock_session = {
                "id": f"ai_call_{app_id}",
                "_id": f"ai_call_{app_id}",
                "link_id": f"ai_call_{app_id}",
                "candidate_id": cand_id,
                "candidate_name": app.get("name") or "Candidate",
                "candidate_email": app.get("email") or "",
                "candidate_phone": app.get("phone") or "",
                "interview_title": app.get("job_title") or "AI Calling Profile",
                "score": score,
                "avg_score": score,
                "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
                "decision": app.get("decision") or "selected",
                "status": "completed",
                "application_id": app_id,
                "is_deactivated": False
            }
            candidates_list.append(mock_session)
            
        # ── Fetch AI calling logs from Omni Dimension API ────────────────────
        # The Omni API key is SHARED across all companies on this platform.
        # We restrict calls admin-wise: they must either be in our local DB or the
        # user_name of the call must match one of this company's admins' names/usernames.
        omni_calls = []
        try:
            from app.ai.omni_dimension_client import get_omni_client
            omni_client = get_omni_client()

            # 1. Get owned call IDs from local DB
            company_id_str = str(current_admin.get("company_id") or "")
            db_query = {"company_id": company_id_str}
            if current_admin.get("role") == "admin":
                db_query["admin_id"] = str(current_admin.get("admin_id") or "")

            company_log_docs = list(omni_call_logs_collection.find(db_query, {"call_id": 1}))
            owned_call_ids = {str(doc["call_id"]) for doc in company_log_docs if doc.get("call_id")}

            session_docs = list(interview_sessions_collection.find(db_query, {"omni_call_id": 1}))
            for doc in session_docs:
                if doc.get("omni_call_id"):
                    owned_call_ids.add(str(doc["omni_call_id"]))

            # 2. Get all admin names/usernames for this company to match against user_name from the Omni API
            company_admins = list(admins_collection.find({"company_id": company_id_str}, {"name": 1, "username": 1}))
            company_admin_identifiers = set()
            for a in company_admins:
                if a.get("name"):
                    company_admin_identifiers.add(a["name"].strip().lower())
                if a.get("username"):
                    company_admin_identifiers.add(a["username"].strip().lower())

            # Fetch from Omni API
            omni_page = 1
            omni_page_size = 100
            omni_max_pages = 5 if summary_only else 20

            while omni_page <= omni_max_pages:
                omni_res  = omni_client.call.get_call_logs(page=omni_page, page_size=omni_page_size)
                omni_data = omni_res.get("json", omni_res) if isinstance(omni_res, dict) else {}
                omni_page_calls = (
                    omni_data.get("call_log_data")
                    or omni_data.get("calls")
                    or omni_data.get("call_logs")
                    or omni_data.get("data")
                    or omni_data.get("results")
                    or []
                )
                if not isinstance(omni_page_calls, list) or not omni_page_calls:
                    break

                for call in omni_page_calls:
                    cid = str(call.get("id") or call.get("call_id") or "")
                    u_name = str(call.get("user_name") or "").strip().lower()
                    
                    # Match by database record OR by API user_name matching a company admin
                    if cid in owned_call_ids or u_name in company_admin_identifiers:
                        omni_calls.append(call)

                total_omni = omni_data.get("total_records") or 0
                if len(omni_calls) >= total_omni or len(omni_page_calls) < omni_page_size:
                    break
                omni_page += 1

            # Cap to 8 for summary_only (dashboard widget)
            if summary_only:
                omni_calls = omni_calls[:8]

        except Exception as omni_err:
            print(f"[dashboard omni fetch] {omni_err}")
            omni_calls = []



        # Pre-fetch candidate sessions for enrichment
        all_omni_call_ids = [str(o.get("id") or o.get("call_id") or "") for o in omni_calls]
        matching_sessions = list(interview_sessions_collection.find({"omni_call_id": {"$in": all_omni_call_ids}}))
        session_map = {str(s["omni_call_id"]): s for s in matching_sessions if s.get("omni_call_id")}

        # Name fallback map
        api_names = [o.get("candidate_name") for o in omni_calls if o.get("candidate_name")]
        name_sessions = list(interview_sessions_collection.find({"candidate_name": {"$in": api_names}, "company_id": current_admin.get("company_id")}))
        name_map = {s["candidate_name"].lower(): s for s in sorted(name_sessions, key=lambda x: x.get("created_at", ""), reverse=True) if s.get("candidate_name")}

        for o_call in omni_calls:
            call_id = str(o_call.get("id") or o_call.get("call_id") or o_call.get("_id") or "")

            # Resolve candidate name from extracted_variables.full_name first
            extracted = o_call.get("extracted_variables") or {}
            if isinstance(extracted, str):
                try:
                    import json as _json
                    extracted = _json.loads(extracted)
                except Exception:
                    extracted = {}
            c_name = (
                extracted.get("full_name")
                or o_call.get("candidate_name")
                or o_call.get("user_name")
                or o_call.get("to_number")
                or "CA"
            )

            # 1. Custom ID Generation
            creator_id = o_call.get("admin_id")
            creator   = admin_map.get(str(creator_id)) if creator_id else None
            su_prefix = (creator.get("name") or creator.get("username") or "AD")[:2].upper() if creator else sa_prefix
            ca_prefix = c_name[:2].upper()
            cand_id   = f"{sa_prefix}{su_prefix}{ca_prefix}{call_id[-4:] if len(call_id) >= 4 else call_id}"

            # 2. Map Details from session if available
            matched_session = session_map.get(call_id) or name_map.get(c_name.lower())
            cand_email = matched_session.get("candidate_email") or matched_session.get("email") if matched_session else o_call.get("phone_number", "")
            cand_phone = matched_session.get("candidate_phone") or matched_session.get("phone") if matched_session else o_call.get("to_number", "")
            int_title  = matched_session.get("job_title") or matched_session.get("interview_title") if matched_session else extracted.get("current_role") or "AI Calling Agent"

            raw_score = o_call.get("cqs_score")
            try:
                score = float(raw_score) if raw_score else 0.0
            except (ValueError, TypeError):
                score = 0.0

            # Map status
            raw_status  = o_call.get("call_status") or o_call.get("status") or "initiated"
            status_remap = {"initiated": "pending", "completed": "completed", "failed": "expired", "no-answer": "expired"}
            mapped_status = status_remap.get(raw_status, "pending")

            # Standardize date
            raw_created = o_call.get("time_of_call") or o_call.get("created_at")
            if raw_created and isinstance(raw_created, str) and "/" in raw_created:
                try:
                    parsed_dt = datetime.strptime(raw_created, "%m/%d/%Y %H:%M:%S").replace(tzinfo=timezone.utc)
                    created_at_iso = parsed_dt.isoformat()
                except Exception:
                    created_at_iso = datetime.now(timezone.utc).isoformat()
            else:
                created_at_iso = raw_created if isinstance(raw_created, str) else datetime.now(timezone.utc).isoformat()

            mock_session = {
                "id": f"ai_call_omni_{call_id}",
                "_id": f"ai_call_omni_{call_id}",
                "link_id": f"ai_call_omni_{call_id}",
                "candidate_id": cand_id,
                "candidate_name": c_name if c_name not in ("CA", "Unknown") else "AI Calling Profile",
                "candidate_email": cand_email or "",
                "candidate_phone": cand_phone or "",
                "interview_title": int_title,
                "score": score,
                "avg_score": score,
                "created_at": created_at_iso,
                "created_by": creator_id,
                "decision": "selected" if score > 50 else "rejected",
                "status": mapped_status,
                "is_deactivated": False
            }
            candidates_list.append(mock_session)



        live_sessions = []
        ongoing_monitored_count = 0
        ongoing_live_count = 0
        ongoing_alert_count = 0
        ongoing_speaking_count = 0
        ongoing_coding_count = 0
        
        # Plan capability checks
        admin_user_doc = await asyncio.to_thread(
            admins_collection.find_one, {"_id": ObjectId(current_admin["admin_id"])}
        )
        plan_ctx = get_admin_plan_context(admin_user_doc) if admin_user_doc else None
        has_live = plan_ctx.get("capabilities", {}).get("live_monitoring", False) if plan_ctx else False
        
        if has_live or current_admin.get("role") in ["master", "super_admin"]:
            query_filter = {
                "status": {"$in": ["started", "pending"]},
                "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
            }
            if current_admin.get("role") != "master":
                query_filter["company_id"] = current_admin.get("company_id")
            if current_admin.get("role") == "admin":
                query_filter["created_by"] = current_admin["admin_id"]
            elif admin_id:
                query_filter["created_by"] = admin_id
            
            rows = await asyncio.to_thread(
                lambda: list(interview_sessions_collection.find(
                    query_filter,
                    {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_id": 1, "interview_title": 1, "started_at": 1, "interview_duration": 1, "status": 1},
                ).sort("created_at", -1))
            )
            rows = [row for row in rows if sync_session_status(row) in ("started", "pending")]
            
            ongoing_monitored_count = len(rows)
            snapshots = await _load_live_snapshots([row.get("link_id", "") for row in rows])
            for row in rows:
                link_id = row.get("link_id", "")
                snap = snapshots.get(link_id, {})
                online = False
                age_secs = float('inf')
                if snap.get("ts"):
                    try:
                        ts_dt = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
                        age_secs = (datetime.now(timezone.utc) - ts_dt).total_seconds()
                        online = age_secs < 60
                    except Exception:
                        pass
                        
                # GHOST FILTERING LOGIC — only hide truly abandoned sessions
                if not online:
                    base_time_str = row.get("started_at") or row.get("created_at")
                    session_age = 0
                    if base_time_str:
                        try:
                            dt = datetime.fromisoformat(base_time_str.replace("Z", "+00:00"))
                            if dt.tzinfo is None:
                                dt = dt.replace(tzinfo=timezone.utc)
                            session_age = (datetime.now(timezone.utc) - dt).total_seconds()
                        except: pass

                    if not snap.get("ts"):
                        # Never received a heartbeat — show for up to 2 hours (link may not have been opened yet)
                        if session_age > 7200:
                            continue
                    else:
                        # Had heartbeats before but now silent for > 5 minutes
                        if age_secs > 300:
                            continue

                
                audio_level = snap.get("audio_level", 0)
                current_question = snap.get("current_question", "")
                
                session_item = {
                    "online": online,
                    "audio_level": audio_level,
                    "current_question": current_question,
                    "proctoring_alerts": snap.get("proctoring_alerts", 0),
                    "alert_types": snap.get("alert_types", []),
                    "last_alert_type": snap.get("last_alert_type"),
                    "face_visible": snap.get("face_visible"),
                    "face_count": snap.get("face_count", 0),
                    "multi_face": snap.get("multi_face", False),
                    "phone_detected": snap.get("phone_detected", False),
                    "eye_contact_lost": snap.get("eye_contact_lost", False),
                    "round_type": snap.get("round_type"),
                    "question_text": snap.get("question_text", ""),
                    "link_id": row.get("link_id", ""),
                    "candidate_name": row.get("candidate_name", ""),
                    "candidate_email": row.get("candidate_email", ""),
                    "interview_title": row.get("interview_title", ""),
                    "session_id": str(row.get("_id", ""))
                }
                live_sessions.append(session_item)
                
                if online:
                    ongoing_live_count += 1
                
                if snap.get("proctoring_alerts", 0) > 0:
                    ongoing_alert_count += 1
                    
                if audio_level > 5:
                    ongoing_speaking_count += 1
                if snap.get("round_type") == "coding":
                    ongoing_coding_count += 1

        credit_reqs = []
        if current_admin.get("role") in ["master", "super_admin"]:
            credit_filter = {"status": "pending"}
            if current_admin.get("role") != "master":
                credit_filter["company_id"] = current_admin.get("company_id")
            reqs = await asyncio.to_thread(
                lambda: list(credit_requests_collection.find(credit_filter).sort("created_at", -1))
            )
            for r in reqs:
                r["id"] = str(r["_id"])
                r["_id"] = str(r["_id"])
                credit_reqs.append(r)
                
        return {
            "dbStats": stats_data,
            "candidates": candidates_list,
            "liveSessions": live_sessions,
            "ongoingMonitoredCount": ongoing_monitored_count,
            "ongoingLiveCount": ongoing_live_count,
            "ongoingAlertCount": ongoing_alert_count,
            "ongoingSpeakingCount": ongoing_speaking_count,
            "ongoingCodingCount": ongoing_coding_count,
            "creditRequests": credit_reqs
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

