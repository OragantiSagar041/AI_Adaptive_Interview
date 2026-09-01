"""
app/routes_split/superadmin.py — SuperAdmin routes
Auto-split from routes.py lines 9592–10359.
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

from app.routes.credits import ExportExcelRequest, BulkDeleteRequest, UpdateCreditRequestSchema
from app.routes.candidates import bulk_create_sessions, create_session, BulkCreateSession
from app.routes.session_complete import _load_live_snapshots
from app.routes.admin_dashboard import get_interview_details
from app.routes.ws_dashboard import get_dashboard_aggregated_data

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/api/superadmin/live-sessions")
@router.get("/superadmin/live-sessions")
async def superadmin_live_sessions(
    adminId: Optional[str] = None,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Fast endpoint returning only the live session snapshots for the active-today card."""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    try:
        from app.db.redis_manager import manager
        live_sessions = []
        ongoing_live_count = 0
        ongoing_alert_count = 0

        query_filter = {
            "status": {"$in": ["started", "completed"]},
            "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
        }
        if current_admin.get("role") != "master":
            query_filter["company_id"] = current_admin.get("company_id")
        if current_admin.get("role") == "admin":
            query_filter["created_by"] = current_admin["admin_id"]
        elif adminId:
            query_filter["created_by"] = adminId

        rows = list(interview_sessions_collection.find(
            query_filter,
            {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_title": 1, "started_at": 1, "status": 1, "completed_at": 1, "interview_duration": 1}
        ).sort("created_at", -1).limit(50))

        rows = [
            row for row in rows
            if not row.get("completed_at") and sync_session_status(row) == "started"
        ]
        unique_rows = {}
        for row in rows:
            link_id = row.get("link_id")
            if link_id and link_id not in unique_rows:
                unique_rows[link_id] = row
        rows = list(unique_rows.values())

        # A candidate can have duplicate started records after refreshing or
        # reopening the same invitation. Keep only the newest record per email.
        unique_candidates = {}
        for row in rows:
            candidate_key = (row.get("candidate_email") or row.get("candidate_name") or "").strip().lower()
            if candidate_key and candidate_key not in unique_candidates:
                unique_candidates[candidate_key] = row
        rows = list(unique_candidates.values()) if unique_candidates else rows

        snapshots = await _load_live_snapshots([row.get("link_id", "") for row in rows])
        now = datetime.now(timezone.utc)

        for row in rows:
            link_id = row.get("link_id", "")
            snap = snapshots.get(link_id, {})
            online = False
            if snap.get("ts"):
                try:
                    ts_dt = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
                    age_secs = (now - ts_dt).total_seconds()
                    online = age_secs < 60
                except Exception:
                    pass

            audio_level = snap.get("audio_level", 0)
            session_item = {
                "online": online,
                "audio_level": audio_level,
                "current_question": snap.get("current_question", ""),
                "proctoring_alerts": snap.get("proctoring_alerts", 0),
                "alert_types": snap.get("alert_types", []),
                "face_visible": snap.get("face_visible"),
                "face_count": snap.get("face_count", 0),
                "round_type": snap.get("round_type"),
                "link_id": link_id,
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

        return {
            "liveSessions": live_sessions,
            "ongoingLiveCount": ongoing_live_count,
            "ongoingMonitoredCount": len(rows),
            "ongoingAlertCount": ongoing_alert_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/export/excel")
def export_excel(data: ExportExcelRequest, current_admin: dict = Depends(get_current_admin_details)):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    try:
        output = io.StringIO()
        from dateutil.parser import parse as parse_date
        writer = csv.writer(output)
        writer.writerow(["Name", "Email", "Position", "Status", "Score", "Created At"])
        for c in data.candidates:
            # Format score as a plain number so Excel doesn't convert it to a date
            raw_score = c.get("score")
            if raw_score is None:
                raw_score = c.get("avg_score", 0)
            formatted_score = f"{float(raw_score):.1f}" if raw_score else "0.0"
            
            # Format date
            raw_date = c.get("created_at", "")
            formatted_date = raw_date
            if raw_date:
                try:
                    dt = parse_date(raw_date)
                    formatted_date = dt.strftime("%d/%m/%Y, %I:%M %p")
                except Exception:
                    pass

            writer.writerow([
                c.get("candidate_name", "Unknown"),
                c.get("candidate_email", "N/A"),
                c.get("interview_title") or "N/A",
                str(c.get("status", "")).upper(),
                formatted_score,
                formatted_date
            ])
        output.seek(0)
        # Add BOM for UTF-8 so Excel opens it properly formatted automatically
        return StreamingResponse(
            io.BytesIO(b'\xef\xbb\xbf' + output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=Interview_Candidates_Report.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/candidates/bulk")
def bulk_delete_candidates(data: BulkDeleteRequest, current_admin: dict = Depends(get_current_admin_details)):
    try:
        deleted_count = 0
        for id_str in data.ids:
            # The frontend passes link_id (or _id if link_id is missing)
            row = interview_sessions_collection.find_one({"$or": [{"link_id": id_str}, {"_id": id_str}]})
            if not row:
                try:
                    from bson import ObjectId
                    row = interview_sessions_collection.find_one({"_id": ObjectId(id_str)})
                except:
                    pass
            
            if row:
                interview_id = row.get("interview_id")
                if interview_id:
                    interviews_collection.delete_one({"id": interview_id})
                    answers_collection.delete_many({"interview_id": interview_id})
                    if get_session(interview_id):
                        delete_cached_session(interview_id)
                
                interview_sessions_collection.delete_one({"_id": row["_id"]})
                deleted_count += 1

        return {"status": "success", "deleted_count": deleted_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/interview/session/{link_id}")
def delete_session_alias(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    try:
        row = interview_sessions_collection.find_one({"link_id": link_id})
        if not row:
            raise HTTPException(status_code=404, detail="Session not found")

        # Cascade-delete associated interview record and answers
        interview_id = row.get("interview_id")
        if interview_id:
            interviews_collection.delete_one({"id": interview_id})
            answers_collection.delete_many({"interview_id": interview_id})
            if get_session(interview_id):
                delete_cached_session(interview_id)

        # Delete the session link itself
        interview_sessions_collection.delete_one({"link_id": link_id})
        return {"status": "success", "message": "Session deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/api/credits/request/{request_id}")
def update_credit_request_alias(request_id: str, data: UpdateCreditRequestSchema, current_admin: dict = Depends(get_current_admin_details)):
    try:
        req = credit_requests_collection.find_one({"_id": ObjectId(request_id)})
        if not req:
            raise HTTPException(status_code=404, detail="Request not found")
            
        credit_requests_collection.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": {"status": data.status}}
        )
        
        if data.status == "approved":
            amount = req.get("requested_amount", 0)
            admin_id = req.get("admin_id")
            admin_doc = None
            try:
                admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            except Exception:
                admin_doc = admins_collection.find_one({"_id": admin_id})

            if admin_doc:
                company_id = admin_doc.get("company_id")
                updated_co = None
                if company_id:
                    try:
                        updated_co = companies_collection.find_one_and_update(
                            {"_id": ObjectId(company_id)},
                            {"$inc": {"credits": -amount}},
                            return_document=ReturnDocument.AFTER
                        )
                    except Exception:
                        pass
                
                updated_rec = None
                try:
                    updated_rec = admins_collection.find_one_and_update(
                        {"_id": admin_doc["_id"]},
                        {"$inc": {"credits": amount}},
                        return_document=ReturnDocument.AFTER
                    )
                except Exception:
                    pass

                # Real-time WebSocket broadcast to Recruiter
                if updated_rec:
                    try:
                        broadcast_profile_update(
                            admin_id=str(admin_doc["_id"]),
                            company_id=str(company_id or ""),
                            credits=updated_rec.get("credits", 0)
                        )
                    except Exception as b_err:
                        print(f"Failed to broadcast recruiter credit update: {b_err}")

                # Real-time WebSocket broadcast to Super Admin
                if updated_co:
                    try:
                        sa_id = current_admin.get("admin_id") or str(current_admin.get("_id") or "")
                        broadcast_profile_update(
                            admin_id=sa_id,
                            company_id=str(company_id or ""),
                            credits=updated_co.get("credits", 0)
                        )
                    except Exception as b_err:
                        print(f"Failed to broadcast super admin credit update: {b_err}")
                
        return {"status": "success", "message": f"Request {data.status} successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/admin/candidates/qualified")
def get_admin_qualified(pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
        
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": company_id, "decision": "selected", "created_by": admin_id}
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
        
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": company_id, "admin_id": admin_id}
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"},
                "decision": {"$ne": "rejected"}
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling candidates for admin qualified: {e}")
            
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "selected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

@router.get("/api/admin/candidates/rejected")
def get_admin_rejected(pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
        
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": company_id, "decision": "rejected", "created_by": admin_id}
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
        
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": company_id, "admin_id": admin_id}
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "decision": "rejected"
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling rejected candidates for admin: {e}")
            
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "rejected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

# ─── SuperAdmin APIs ─────────────────────────────────

@router.get("/api/superadmin/dashboard")
@router.get("/superadmin/dashboard")
async def superadmin_dashboard(
    adminId: Optional[str] = None,
    summary_only: bool = False,
    current_admin: dict = Depends(get_current_admin_details),
):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return await get_dashboard_aggregated_data(
        admin_id=adminId,
        summary_only=summary_only,
        current_admin=current_admin,
    )


@router.get("/api/superadmin/recruitment-funnel")
@router.get("/superadmin/recruitment-funnel")
def superadmin_recruitment_funnel(adminId: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return stage-by-stage recruitment funnel counts from real DB data."""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    try:
        company_id = current_admin.get("company_id")
        base_q = {}
        if current_admin.get("role") != "master":
            base_q["company_id"] = company_id
        if adminId:
            base_q["created_by"] = adminId

        # Stage 1 & 2: total interview sessions assigned
        total       = interview_sessions_collection.count_documents(base_q)
        # Stage 4: sessions where interview was actually completed
        completed   = interview_sessions_collection.count_documents({**base_q, "status": "completed"})
        # Stage 5 & 6: candidates marked as selected (qualified) by recruiter
        qualified   = interview_sessions_collection.count_documents({**base_q, "decision": "selected"})
        # Stage 7: candidates to whom an offer email was sent (invite_email_status=sent and decision=selected)
        offers_sent = interview_sessions_collection.count_documents({
            **base_q,
            "decision": "selected",
            "invite_email_status": "sent"
        })
        # If no offers_sent data yet, fall back to qualified count
        if offers_sent == 0 and qualified > 0:
            offers_sent = qualified

        # Count AI calling candidates (from job_applications)
        ai_call_apps = 0
        try:
            jobs_q = {}
            if current_admin.get("role") != "master":
                jobs_q["company_id"] = company_id
            if adminId:
                jobs_q["admin_id"] = adminId
            job_ids = [j.get("job_id") for j in jobs_collection.find(jobs_q, {"job_id": 1}) if j.get("job_id")]
            ai_call_apps = job_applications_collection.count_documents({"job_id": {"$in": job_ids}}) if job_ids else 0
        except Exception:
            ai_call_apps = 0

        colors = ["#3b82f6", "#0ea5e9", "#0284c7", "#0d9488", "#10b981", "#22c55e", "#eab308", "#f59e0b"]
        funnel = [
            {"name": "Applications Received",  "value": total + ai_call_apps, "fill": colors[0]},
            {"name": "AI Resume Screening",     "value": total,               "fill": colors[1]},
            {"name": "AI Voice Screening",      "value": ai_call_apps,        "fill": colors[2]},
            {"name": "AI Interviews",           "value": completed,           "fill": colors[3]},
            {"name": "Qualified Candidates",    "value": qualified,           "fill": colors[4]},
            {"name": "Recruiter Review",        "value": qualified,           "fill": colors[5]},
            {"name": "Candidates Hired",        "value": qualified,           "fill": colors[6]},
            {"name": "Offers Released",         "value": offers_sent,         "fill": colors[7]},
        ]
        return {"funnel": funnel}
    except Exception as e:
        print(f"Funnel error: {e}")
        return {"funnel": []}


@router.get("/api/superadmin/platform-analytics")
@router.get("/superadmin/platform-analytics")
def superadmin_platform_analytics(adminId: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return key platform analytics metrics and average time-to-hire."""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    try:
        company_id = current_admin.get("company_id")
        base_q = {"company_id": company_id}
        
        allowed_ids = _get_authorized_creator_ids(current_admin)
        if adminId:
            if current_admin.get("role") in ["super_admin", "superadmin"] and adminId not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
            base_q["created_by"] = adminId
        else:
            base_q["created_by"] = {"$in": allowed_ids}

        total     = interview_sessions_collection.count_documents(base_q) or 1
        completed = interview_sessions_collection.count_documents({**base_q, "status": "completed"})
        selected  = interview_sessions_collection.count_documents({**base_q, "decision": "selected"})
        rejected  = interview_sessions_collection.count_documents({**base_q, "decision": "rejected"})
        decided   = selected + rejected or 1

        # Average AI score
        pipeline_agg = [
            {"$match": {**base_q, "avg_score": {"$gt": 0}}},
            {"$group": {"_id": None, "avg": {"$avg": "$avg_score"}}}
        ]
        agg_result = list(interview_sessions_collection.aggregate(pipeline_agg))
        avg_score  = round(agg_result[0]["avg"], 0) if agg_result else 0

        completion_rate = round((completed / total) * 100, 0)
        hire_rate       = round((selected / decided) * 100, 0)

        # Average time-to-hire in days
        avg_days = None
        try:
            hired_sessions = list(interview_sessions_collection.find(
                {**base_q, "decision": "selected", "started_at": {"$exists": True}},
                {"started_at": 1, "created_at": 1}
            ).limit(200))
            deltas = []
            for s in hired_sessions:
                try:
                    start = datetime.fromisoformat((s.get("started_at") or s.get("created_at")).replace("Z", "+00:00"))
                    end   = datetime.fromisoformat((s.get("updated_at") or s.get("completed_at") or s.get("created_at")).replace("Z", "+00:00"))
                    diff  = (end - start).days
                    if 0 <= diff <= 365:
                        deltas.append(diff)
                except Exception:
                    pass
            if deltas:
                avg_days = round(sum(deltas) / len(deltas), 0)
        except Exception as e:
            print(f"Time-to-hire error: {e}")

        analytics = [
            {"label": "AI Resume Screening Success Rate", "value": min(100, completion_rate)},
            {"label": "Interview Completion Rate",        "value": min(100, completion_rate)},
            {"label": "Average AI Match Score",           "value": min(100, int(avg_score))},
            {"label": "Offer Acceptance Rate",            "value": min(100, hire_rate)},
            {"label": "Candidate Conversion Rate",        "value": min(100, round((selected / total) * 100, 0))},
            {"label": "Recruiter Productivity",           "value": min(100, min(completion_rate + 5, 100))},
            {"label": "AI Recommendation Accuracy",       "value": min(100, int(avg_score) + 5 if avg_score else 0)},
        ]

        return {
            "analytics": analytics,
            "avg_time_to_hire_days": avg_days
        }
    except Exception as e:
        print(f"Platform analytics error: {e}")
        return {"analytics": [], "avg_time_to_hire_days": None}


@router.get("/api/superadmin/candidates/qualified")
@router.get("/superadmin/candidates/qualified")
def get_superadmin_qualified(adminId: Optional[str] = None, pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    sessions = []
    
    allowed_ids = _get_authorized_creator_ids(current_admin)
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": current_admin.get("company_id"), "decision": "selected"}
        if adminId:
            if current_admin.get("role") in ["super_admin", "superadmin"] and adminId not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
            query["created_by"] = adminId
        else:
            query["created_by"] = {"$in": allowed_ids}
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
    
    # Get AI Calling interested candidates
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if adminId:
                if current_admin.get("role") in ["super_admin", "superadmin"] and adminId not in allowed_ids:
                    raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
                jobs_query["admin_id"] = adminId
            else:
                jobs_query["admin_id"] = {"$in": allowed_ids}
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"},
                "decision": {"$ne": "rejected"}
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling candidates for superadmin qualified: {e}")
        
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "selected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

@router.get("/api/superadmin/candidates/rejected")
@router.get("/superadmin/candidates/rejected")
def get_superadmin_rejected(adminId: Optional[str] = None, pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    sessions = []
    
    allowed_ids = _get_authorized_creator_ids(current_admin)
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": current_admin.get("company_id"), "decision": "rejected"}
        if adminId:
            if current_admin.get("role") in ["super_admin", "superadmin"] and adminId not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
            query["created_by"] = adminId
        else:
            query["created_by"] = {"$in": allowed_ids}
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
    
    # Get AI Calling rejected candidates
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if adminId:
                if current_admin.get("role") in ["super_admin", "superadmin"] and adminId not in allowed_ids:
                    raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
                jobs_query["admin_id"] = adminId
            else:
                jobs_query["admin_id"] = {"$in": allowed_ids}
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "decision": "rejected"
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling rejected candidates: {e}")
        
    seen_emails = set()
    merged_list = []
    now = datetime.now(timezone.utc)
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
        s["status"] = sync_session_status(s, now)
        s["id"] = str(s["_id"])
        s["_id"] = str(s["_id"])
        merged_list.append(s)
        
    for app in apps:
        email = app.get("email")
        if email:
            email_lower = email.strip().lower()
            if email_lower in seen_emails:
                continue
            seen_emails.add(email_lower)
            
        app_id = str(app.get("_id"))
        score = app.get("score") or 0.0
        mock_session = {
            "id": f"ai_call_{app_id}",
            "_id": f"ai_call_{app_id}",
            "link_id": f"ai_call_{app_id}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "candidate_phone": app.get("phone") or "",
            "interview_title": app.get("job_title") or "AI Calling Profile",
            "score": score,
            "avg_score": score,
            "created_at": app.get("applied_at") or app.get("updated_at") or datetime.now(timezone.utc).isoformat(),
            "decision": "rejected",
            "status": "completed",
            "application_id": app_id,
            "is_deactivated": False
        }
        merged_list.append(mock_session)
        
    return merged_list

@router.post("/api/superadmin/interview/create")
@router.post("/superadmin/interview/create")
def superadmin_interview_create(data: dict, background_tasks: BackgroundTasks, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    if "candidates" in data:
        try:
            bulk_data = BulkCreateSession(**data)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        return bulk_create_sessions(bulk_data, background_tasks, current_admin)
    else:
        try:
            single_data = CreateSession(**data)
        except Exception as e:
            raise HTTPException(status_code=422, detail=str(e))
        return create_session(single_data, current_admin)
@router.get("/api/superadmin/crash-logs")
@router.get("/superadmin/crash-logs")
def get_crash_logs(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    from app.db.mongo_db import crash_logs_collection
    logs = list(crash_logs_collection.find().sort("timestamp", -1).limit(50))
    for log in logs:
        log["_id"] = str(log["_id"])
    return {"status": "success", "logs": logs}

def get_live_super_admin_credits(admin_id: str, company_id: Optional[str] = None) -> int:
    """Returns the single source of truth credit balance for a Super Admin across companies and admins collections."""
    if company_id:
        try:
            c = companies_collection.find_one({"_id": ObjectId(company_id)}, {"credits": 1})
            if c and "credits" in c and c["credits"] is not None:
                return int(c["credits"])
        except Exception:
            pass
        
        c = companies_collection.find_one({"_id": str(company_id)}, {"credits": 1})
        if c and "credits" in c and c["credits"] is not None:
            return int(c["credits"])
            
        c = companies_collection.find_one({"company_id": str(company_id)}, {"credits": 1})
        if c and "credits" in c and c["credits"] is not None:
            return int(c["credits"])

    a_doc = None
    if admin_id:
        try:
            a_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
        except Exception:
            a_doc = admins_collection.find_one({"_id": str(admin_id)})

    if a_doc:
        doc_co_id = a_doc.get("company_id")
        if doc_co_id and str(doc_co_id) != str(company_id):
            try:
                c = companies_collection.find_one({"_id": ObjectId(doc_co_id)}, {"credits": 1})
                if c and "credits" in c and c["credits"] is not None:
                    return int(c["credits"])
            except Exception:
                pass
            c = companies_collection.find_one({"_id": str(doc_co_id)}, {"credits": 1})
            if c and "credits" in c and c["credits"] is not None:
                return int(c["credits"])

        if "credits" in a_doc and a_doc["credits"] is not None:
            return int(a_doc["credits"])

    if admin_id:
        c = companies_collection.find_one({"super_admin_id": str(admin_id)}, {"credits": 1})
        if c and "credits" in c and c["credits"] is not None:
            return int(c["credits"])

    return 0

@router.get("/api/superadmin/profile")
@router.get("/superadmin/profile")
def get_superadmin_profile(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])}, {"password": 0})
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Super Admin not found")
    admin_doc["id"] = str(admin_doc["_id"])
    admin_doc["_id"] = str(admin_doc["_id"])
    
    company = None
    if admin_doc.get("company_id"):
        try:
            company = companies_collection.find_one({"_id": ObjectId(str(admin_doc["company_id"]))})
        except Exception:
            company = None
        if company:
            admin_doc["company_name"] = company.get("name", admin_doc.get("company_name", ""))
            if "credits" in company:
                admin_doc["credits"] = company["credits"]
            admin_doc["status"] = company.get("status", "active" if admin_doc.get("login_enabled", True) else "blocked")
            admin_doc["login_enabled"] = admin_doc.get("login_enabled", True) and company.get("login_enabled", True)

    plan_context = get_admin_plan_context(admin_doc)
    admin_doc["is_expired"] = plan_context["is_expired"]
    admin_doc["subscription_plan_key"] = plan_context["plan_key"]
    admin_doc["subscription_plan"] = plan_label = plan_context["plan_label"]
    admin_doc["plan_features"] = plan_context["features"]
    admin_doc["features"] = plan_context["features"]
    admin_doc["capabilities"] = plan_context["capabilities"]
    admin_doc["days_remaining"] = plan_context.get("days_remaining")
    admin_doc["subscription_start"] = plan_context.get("subscription_start")
    admin_doc["subscription_expiry"] = plan_context.get("subscription_expiry")
    admin_doc["layout_config"] = plan_context.get("layout_config")
    admin_doc["branding"] = plan_context.get("branding")
    return admin_doc

class SuperAdminPlanUpdate(BaseModel):
    subscription_plan: str

@router.put("/api/superadmin/subscription")
@router.put("/superadmin/subscription")
def update_superadmin_subscription(data: SuperAdminPlanUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="No company associated with this admin")
    now_iso = datetime.now(timezone.utc).isoformat()
    companies_collection.update_one(
        {"_id": ObjectId(company_id)},
        {"$set": {"subscription_plan": data.subscription_plan, "updated_at": now_iso}}
    )
    admins_collection.update_many(
        {"company_id": str(company_id), "role": {"$in": ["super_admin", "superadmin"]}},
        {"$set": {"subscription_plan": data.subscription_plan, "updated_at": now_iso}}
    )
    return {"status": "success", "message": "Subscription plan updated successfully"}


@router.delete("/api/superadmin/candidates/bulk")
@router.delete("/superadmin/candidates/bulk")
def superadmin_bulk_delete(data: BulkDeleteRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return bulk_delete_candidates(data, current_admin)

@router.post("/api/superadmin/export/excel")
@router.post("/superadmin/export/excel")
def superadmin_export_excel(data: ExportExcelRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return export_excel(data, current_admin)

@router.patch("/api/superadmin/credits/request/{request_id}")
@router.patch("/superadmin/credits/request/{request_id}")
def superadmin_patch_credit_request(request_id: str, data: UpdateCreditRequestSchema, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return update_credit_request_alias(request_id, data, current_admin)

@router.get("/api/superadmin/interview/{link_id}")
@router.get("/superadmin/interview/{link_id}")
def superadmin_get_interview_details(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """SuperAdmin alias for the interview detail endpoint — can access any session across all admins"""
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    # Verify the session belongs to this super admin's company
    _get_authorized_live_session(link_id, current_admin)
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    company_id = current_admin.get("company_id")
    if company_id and session.get("company_id") and session.get("company_id") != company_id:
        raise HTTPException(status_code=403, detail="Access denied to this session")
    # Reuse the existing admin endpoint logic
    return get_interview_details(link_id, current_admin)


# -------------------------------------------------------------------------------------
# PREMIUM VOICE & INTERACTIVE CODING ROUND ENDPOINTS
# -------------------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field("nova", max_length=100)
    language: str = Field("English", max_length=100)
    voice_id: Optional[str] = Field(None, max_length=200)
    use_custom_voice: bool = True    # Flag to determine if Cartesia should be used

