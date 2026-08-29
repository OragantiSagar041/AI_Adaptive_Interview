"""
app/routes_split/session_complete.py — Feedback, complete-session, live
Auto-split from routes.py lines 6465–7107.
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
    create_spectator_token, decode_spectator_token,
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

from app.routes.interview import sync_session_to_application
from app.routes.admin_dashboard import send_submission_notification
from app.routes.candidates import CandidateFeedbackRequest

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/submit-feedback/{link_id}")
def submit_feedback(
    link_id: str,
    payload: CandidateFeedbackRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Save candidate feedback into the interview session."""
    _require_candidate_session(credentials, link_id=link_id, allow_completed=True)
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
            
        interview_sessions_collection.update_one(
            {"link_id": link_id}, 
            {"$set": {"candidate_feedback": payload.feedback_text}}
        )
        return {"status": "success", "message": "Feedback submitted successfully."}
    except Exception as e:
        print(f"Submit Feedback Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CompleteSessionRequest(BaseModel):
    warnings: int = 0
    reason: str = "normal"
    total_tab_switches: int = 0
    total_face_alerts: int = 0
    total_noise_alerts: int = 0
    total_fullscreen_exits: int = 0

@router.post("/complete-session/{link_id}")
def complete_session(
    link_id: str, 
    payload: Optional[CompleteSessionRequest] = None,
    warnings: Optional[int] = None,
    reason: Optional[str] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Mark a session as completed and send notification emails (Task 3)."""
    _require_candidate_session(credentials, link_id=link_id, allow_completed=True)
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        # Use default payload if none was sent by the client
        if payload is None:
            payload = CompleteSessionRequest()
            
        if warnings is not None:
            payload.warnings = warnings
        if reason is not None:
            payload.reason = reason
            
        update_data = {
            "status": "completed", 
            "warnings": payload.warnings, 
            "completion_reason": payload.reason,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "integrity": {
                "total_tab_switches": payload.total_tab_switches,
                "total_face_alerts": payload.total_face_alerts,
                "total_noise_alerts": payload.total_noise_alerts,
                "total_fullscreen_exits": payload.total_fullscreen_exits
            }
        }
        if session:
            violations = session.get("violations", [])
            if violations:
                if update_data["integrity"]["total_tab_switches"] == 0:
                    update_data["integrity"]["total_tab_switches"] = sum(1 for v in violations if v.get("type") == "tab_switch")
                if update_data["integrity"]["total_face_alerts"] == 0:
                    update_data["integrity"]["total_face_alerts"] = sum(1 for v in violations if v.get("type") not in ("tab_switch", "noise_alert"))
                if update_data["integrity"]["total_noise_alerts"] == 0:
                    update_data["integrity"]["total_noise_alerts"] = sum(1 for v in violations if v.get("type") == "noise_alert")
            
            candidate_id = session.get("candidate_id")
            if candidate_id and not candidate_id.endswith("IQ"):
                update_data["candidate_id"] = f"{candidate_id}IQ"
            
            # Calculate total time for the dashboard
            started_at = session.get("started_at") or session.get("updated_at")
            if started_at:
                try:
                    s_dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    e_dt = datetime.fromisoformat(update_data["completed_at"].replace("Z", "+00:00"))
                    delta = (e_dt - s_dt).total_seconds()
                    update_data["integrity"]["total_time_minutes"] = round(delta / 60, 1) if delta > 0 else 0
                except:
                    update_data["integrity"]["total_time_minutes"] = 0
            else:
                update_data["integrity"]["total_time_minutes"] = 0
                
        interview_sessions_collection.update_one({"link_id": link_id}, {"$set": update_data})
        sync_session_to_application(link_id)
        
        # Broadcast real-time completion to update credits and dashboard
        if session:
            admin_id = session.get("created_by")
            if admin_id:
                try:
                    from bson import ObjectId
                    admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
                    if admin_doc:
                        broadcast_profile_update(
                            admin_id=str(admin_id),
                            company_id=str(session.get("company_id") or ""),
                            credits=admin_doc.get("credits"),
                            login_enabled=admin_doc.get("login_enabled"),
                            extra={"status_change": "completed", "link_id": link_id}
                        )
                except:
                    pass
        
        # Task 3: Trigger submission logic IF all answers are scored.
        # Otherwise, the background scoring thread will trigger this later.
        try:
            session = interview_sessions_collection.find_one({"link_id": link_id})
            if session:
                interview_id = session.get("interview_id", "")
                
                if interview_id:
                    answers = list(answers_collection.find({"interview_id": interview_id}))
                    all_scored = all(a.get("scoring_status") in ("complete", "failed") for a in answers)
                    
                    if all_scored and not session.get("notification_sent"):
                        # ALWAYS recalculate the final score to include the coding/case-study round
                        avg_score = session.get("avg_score") or 0.0
                        try:
                            from app.ai.score_rounds import (
                                compute_case_study_score, 
                                calculate_round1_score, calculate_coding_score, calculate_final_score
                            )
                            interview_doc = interviews_collection.find_one({"id": interview_id})
                            questions = []
                            round1_s = 0.0
                            round2_s = 0.0
                            
                            if interview_doc:
                                q_data = interview_doc.get("questions")
                                if isinstance(q_data, str):
                                    import json
                                    try:
                                        questions = json.loads(q_data)
                                    except:
                                        pass
                                elif isinstance(q_data, list):
                                    questions = q_data
                                    
                                if not questions and session.get("pre_generated_questions"):
                                    import json
                                    try:
                                        questions = json.loads(session.get("pre_generated_questions"))
                                    except:
                                        pass
                                        
                                round1_s = calculate_round1_score(questions, answers)
                                
                                coding_rd = interview_doc.get("coding_round")
                                case_std = interview_doc.get("case_study_round")
                                
                                if coding_rd:
                                    round2_s = calculate_coding_score(coding_rd)
                                elif case_std:
                                    lang_cs = interview_doc.get("language", "English")
                                    ctx_cs = f"Profile: {interview_doc.get('profile_text','')}"
                                    cs_score_100 = compute_case_study_score(case_std, ctx_cs, lang_cs) or 0.0
                                    round2_s = round(min(20.0, max(0.0, (cs_score_100 / 100.0) * 20.0)), 1)
                                    
                            avg_score = calculate_final_score(round1_s, round2_s)
                        except Exception as e:
                            print(f"Error calculating final score on completion: {e}")
                        
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {"$set": {
                                "score": round(avg_score, 1),
                                "avg_score": round(avg_score, 1),
                                "round1_score": round(round1_s, 1),
                                "round2_score": round(round2_s, 1),
                                "notification_sent": True
                            }}
                        )
                        sync_session_to_application(link_id)
                        
                        candidate_name = session.get("candidate_name", "Candidate")
                        candidate_email = session.get("candidate_email", "")
                        admin_id = session.get("created_by", "")
                        admin_email = ""
                        if admin_id:
                            try:
                                from bson import ObjectId
                                admin = admins_collection.find_one({"_id": ObjectId(admin_id)})
                                if admin: 
                                    admin_email = admin.get("email", "")
                                    admin_company_id = str(admin.get("company_id") or "")
                                    admin_role = admin.get("role", "admin")
                                    is_super = admin_role in ["super_admin", "superadmin"]
                                    notifications_collection.insert_one({
                                        "title": "Interview Complete",
                                        "message": f"Candidate '{candidate_name}' has completed their interview. Avg score: {round(avg_score, 1)}/10.",
                                        "type": "candidate",
                                        "recipient_role": "superadmin" if is_super else "admin",
                                        "recipient_id": str(admin_id),
                                        "admin_id": str(admin_id),
                                        "interview_id": str(interview_id),
                                        "company_id": admin_company_id,
                                        "read": False,
                                        "created_at": datetime.now(timezone.utc).isoformat()
                                    })
                            except Exception as notif_e:
                                logger.warning(f"Failed to insert completion notification: {notif_e}")
                            
                        if candidate_email:
                            company_name_val = admin.get("company_name", "HireIQ") if 'admin' in locals() and admin else "HireIQ"
                            send_submission_notification(
                                candidate_email=candidate_email,
                                candidate_name=candidate_name,
                                admin_email=admin_email,
                                avg_score=avg_score,
                                total_questions=len(answers),
                                company_name=company_name_val
                            )
                            print(f"✅ Submission notification sent for {candidate_name} from complete_session")
                            
                        from app import tasks
                        tasks.generate_report_task.delay(interview_id=interview_id)
        except Exception as notify_err:
            print(f"⚠️ Submission notification error: {notify_err}")
        
        return {"status": "success"}
    except Exception as e:
        print(f"Error completing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# LIVE MONITORING  –  Three endpoints for real-time admin oversight
# ─────────────────────────────────────────────────────────────────────────────

# In-memory store:  link_id → latest heartbeat payload
_live_snapshots: Dict[str, Dict] = {}
_heartbeat_request_times: Dict[str, List[float]] = {}

LIVE_SNAPSHOT_TTL_SECONDS = 90
MAX_SNAPSHOT_BYTES = 250_000


def _bounded_number(value: Any, minimum: float, maximum: float, integer: bool = False):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    number = max(minimum, min(number, maximum))
    return int(number) if integer else number


def _optional_bool(value: Any):
    return value if isinstance(value, bool) else None


def _safe_round_type(value: Any):
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {"verbal", "coding", "case_study"} else None


async def _enforce_heartbeat_rate_limit(link_id: str):
    """Allow normal 5-second heartbeats while limiting abuse per session."""
    await manager.connect_redis()
    if manager.redis:
        key = f"heartbeat_rate:{link_id}"
        count = await manager.redis.incr(key)
        if count == 1:
            await manager.redis.expire(key, 60)
        if count > 30:
            raise HTTPException(status_code=429, detail="Heartbeat rate limit exceeded")
        return

    now = time.monotonic()
    recent = [timestamp for timestamp in _heartbeat_request_times.get(link_id, []) if now - timestamp < 60]
    if len(recent) >= 30:
        raise HTTPException(status_code=429, detail="Heartbeat rate limit exceeded")
    recent.append(now)
    _heartbeat_request_times[link_id] = recent


async def _load_live_snapshots(link_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    clean_ids = [str(link_id) for link_id in link_ids if link_id]
    if not clean_ids:
        return {}
    await manager.connect_redis()
    if manager.redis:
        values = await manager.redis.mget([f"live_snapshot:{link_id}" for link_id in clean_ids])
        result: Dict[str, Dict[str, Any]] = {}
        for link_id, raw_value in zip(clean_ids, values):
            if not raw_value:
                continue
            try:
                result[link_id] = json.loads(raw_value)
            except (TypeError, json.JSONDecodeError):
                logger.warning("Ignoring malformed live snapshot for %s", link_id)
        return result
    return {link_id: _live_snapshots.get(link_id, {}) for link_id in clean_ids}


async def _store_live_snapshot(link_id: str, updates: Dict[str, Any], session: Dict[str, Any]) -> Dict[str, Any]:
    existing = (await _load_live_snapshots([link_id])).get(link_id, {})
    merged = {**existing, **{key: value for key, value in updates.items() if value is not None}}
    merged["ts"] = datetime.now(timezone.utc).isoformat()

    await manager.connect_redis()
    if manager.redis:
        await manager.redis.setex(
            f"live_snapshot:{link_id}",
            LIVE_SNAPSHOT_TTL_SECONDS,
            json.dumps(merged),
        )
    else:
        _live_snapshots[link_id] = merged

    dashboard_data = {key: value for key, value in merged.items() if key != "snapshot"}
    payload = {
        "type": "live_snapshot",
        "link_id": link_id,
        "company_id": str(session.get("company_id") or ""),
        "created_by": str(session.get("created_by") or ""),
        "data": dashboard_data,
    }
    if manager.redis:
        await manager.redis.publish("dashboard:updates", json.dumps(payload))
    else:
        await manager.broadcast_dashboard(payload)
    return merged


class LiveHeartbeatRequest(BaseModel):
    link_id: str
    snapshot_dataurl: Optional[str] = None   # base64 PNG from candidate's camera canvas
    audio_level: Optional[float] = None       # 0–100 RMS amplitude
    internet_kbps: Optional[float] = None     # measured download speed in kbps
    current_question: Optional[int] = None
    total_questions: Optional[int] = None
    elapsed_seconds: Optional[int] = None
    video_fps: Optional[float] = None
    tab_active: Optional[bool] = True
    face_visible: Optional[bool] = None
    proctoring_alerts: int = 0
    alert_types: Optional[List[str]] = None
    last_alert_type: Optional[str] = None
    face_count: int = 0
    multi_face: bool = False
    phone_detected: bool = False
    eye_contact_lost: bool = False
    round_type: Optional[str] = None

    @validator("link_id")
    def validate_link_id(cls, value):
        if not 8 <= len(value) <= 128:
            raise ValueError("Invalid session link identifier")
        return value

    @validator("snapshot_dataurl")
    def validate_snapshot_dataurl(cls, value):
        if value is None:
            return value
        return validate_snapshot_dataurl(value, MAX_SNAPSHOT_BYTES)

    @validator("audio_level")
    def validate_audio_level(cls, value):
        if value is not None and not 0 <= value <= 100:
            raise ValueError("Audio level must be between 0 and 100")
        return value

    @validator("alert_types")
    def validate_alert_types(cls, value):
        if value is not None and (len(value) > 25 or any(len(str(item)) > 64 for item in value)):
            raise ValueError("Too many or invalid alert types")
        return value

    @validator("round_type")
    def validate_round_type(cls, value):
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in {"verbal", "coding", "case_study"}:
            raise ValueError("Invalid interview round type")
        return normalized


@router.post("/live-heartbeat")
async def live_heartbeat(
    data: LiveHeartbeatRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Candidate browser sends a heartbeat every ~5 s with camera snapshot and quality metrics."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Candidate monitoring token is required")
    session = _validate_candidate_monitoring_token(credentials.credentials, data.link_id)
    await _enforce_heartbeat_rate_limit(data.link_id)
    updates = {
        "snapshot": data.snapshot_dataurl,
        "audio_level": data.audio_level,
        "internet_kbps": data.internet_kbps,
        "current_question": data.current_question,
        "total_questions": data.total_questions,
        "elapsed_seconds": data.elapsed_seconds,
        "video_fps": data.video_fps,
        "tab_active": data.tab_active,
        "face_visible": data.face_visible,
        "proctoring_alerts": data.proctoring_alerts,
        "alert_types": data.alert_types or [],
        "last_alert_type": data.last_alert_type,
        "face_count": data.face_count,
        "multi_face": data.multi_face,
        "phone_detected": data.phone_detected,
        "eye_contact_lost": data.eye_contact_lost,
        "round_type": data.round_type,
    }
    await _store_live_snapshot(data.link_id, updates, session)
    return {"status": "ok"}


@router.get("/admin/live-snapshot/{link_id}")
async def get_live_snapshot(
    link_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Return a snapshot to an authorized admin, super admin, or master."""
    _get_authorized_live_session(link_id, current_admin)
    if current_admin.get("role") != "master":
        require_admin_capability(
            current_admin["admin_id"],
            "live_monitoring",
            "Live monitoring is available on the Advance plan only.",
        )
    snap = (await _load_live_snapshots([link_id])).get(link_id)

    if not snap:
        return {"online": False}

    try:
        ts = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
        age_secs = (datetime.now(timezone.utc) - ts).total_seconds()
        online = age_secs < 15          # considered online if seen within last 15 s
    except Exception:
        age_secs = 0
        online = True

    return {
        "online": online,
        "last_seen_ago_seconds": round(age_secs, 1),
        "snapshot": snap.get("snapshot"),
        "audio_level": snap.get("audio_level"),
        "internet_kbps": snap.get("internet_kbps"),
        "current_question": snap.get("current_question"),
        "total_questions": snap.get("total_questions"),
        "elapsed_seconds": snap.get("elapsed_seconds"),
        "video_fps": snap.get("video_fps"),
        "tab_active": snap.get("tab_active", True),
        "face_visible": snap.get("face_visible"),
        "proctoring_alerts": snap.get("proctoring_alerts", 0),
        "alert_types": snap.get("alert_types", []),
        "last_alert_type": snap.get("last_alert_type"),
        "face_count": snap.get("face_count", 0),
        "multi_face": snap.get("multi_face", False),
        "phone_detected": snap.get("phone_detected", False),
        "eye_contact_lost": snap.get("eye_contact_lost", False),
        "round_type": snap.get("round_type"),
    }


@router.get("/admin/ongoing-interviews")
async def get_ongoing_interviews(admin_id: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return all in-progress (status=started) sessions for this admin with live status."""
    admin_uuid = current_admin["admin_id"]
    if current_admin.get("role") != "master":
        require_admin_capability(
            admin_uuid,
            "live_monitoring",
            "Live monitoring is available on the Advance plan only.",
        )
    query_filter = {
        "status": "started",
        "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
    }
    if current_admin.get("role") != "master":
        query_filter["company_id"] = current_admin.get("company_id")
    
    # Data Isolation:
    if current_admin.get("role") == "admin":
        query_filter["created_by"] = current_admin["admin_id"]
    elif current_admin.get("role") in ["super_admin", "superadmin"] and not admin_id:
        query_filter["created_by"] = {"$in": _get_authorized_creator_ids(current_admin)}
    elif admin_id:
        if current_admin.get("role") in ["super_admin", "superadmin"]:
            allowed_ids = _get_authorized_creator_ids(current_admin)
            if admin_id not in allowed_ids:
                raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
        query_filter["created_by"] = admin_id

    rows = list(interview_sessions_collection.find(
        query_filter, 
        {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_id": 1, "started_at": 1}
    ).sort("created_at", -1))

    snapshots = await _load_live_snapshots([row.get("link_id", "") for row in rows])
    sessions = []
    for row in rows:
        link_id = row.get("link_id", "")
        snap = snapshots.get(link_id, {})

        # Determine online status from heartbeat age
        online = False
        age_secs = float('inf')
        if snap.get("ts"):
            try:
                # 'ts' is stored as ISO string ending with Z
                ts_dt = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
                age_secs = (datetime.now(timezone.utc) - ts_dt).total_seconds()
                online = age_secs < 60  # 60 seconds for "Live" status
            except Exception:
                online = False
                
        # GHOST FILTERING LOGIC
        if not online:
            # 1. Use started_at for sessions that have officially begun
            base_time_str = row.get("started_at") or row.get("created_at")
            session_age = 0
            if base_time_str:
                try:
                    dt = datetime.fromisoformat(base_time_str.replace("Z", "+00:00"))
                    session_age = (datetime.now(timezone.utc) - dt).total_seconds()
                except: pass

            # 2. If no heartbeat has EVER been received
            if not snap.get("ts"):
                # If they haven't sent a heartbeat within 10 mins of starting/creating, hide them
                if session_age > 600: 
                    continue
            
            # 3. If they HAVE sent heartbeats before, but are now silent
            else:
                # If they've been silent for more than 5 minutes, remove from "Ongoing" entirely
                if age_secs > 300: 
                    continue
                # Note: The UI will show them as "AWAY" if age_secs > 60

        sessions.append({
            "link_id": link_id,
            "candidate_name": row.get("candidate_name", ""),
            "candidate_email": row.get("candidate_email", ""),
            "created_at": row.get("created_at", ""),
            "interview_id": row.get("interview_id", ""),
            "online": online,
            "snapshot": snap.get("snapshot"),
            "current_question": snap.get("current_question"),
            "total_questions": snap.get("total_questions"),
            "elapsed_seconds": snap.get("elapsed_seconds"),
            "audio_level": snap.get("audio_level"),
            "internet_kbps": snap.get("internet_kbps"),
            "video_fps": snap.get("video_fps"),
            "tab_active": snap.get("tab_active", True),
            "face_visible": snap.get("face_visible"),
            "proctoring_alerts": snap.get("proctoring_alerts", 0),
            "alert_types": snap.get("alert_types", []),
            "last_alert_type": snap.get("last_alert_type"),
            "face_count": snap.get("face_count", 0),
            "multi_face": snap.get("multi_face", False),
            "phone_detected": snap.get("phone_detected", False),
            "eye_contact_lost": snap.get("eye_contact_lost", False),
            "round_type": snap.get("round_type"),
        })

    return {"sessions": sessions, "count": len(sessions)}


@router.post("/admin/interview/{link_id}/spectator-token")
async def generate_spectator_token(
    link_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Generate a short-lived spectator token for a specific live interview session.
    
    The token is valid for 4 hours and grants read-only WebRTC access.
    Spectators can watch the live video feed but cannot interact in any way.
    """
    if current_admin.get("role") != "master":
        require_admin_capability(
            current_admin["admin_id"],
            "live_monitoring",
            "Live monitoring is required to create spectator links.",
        )
    
    session = _get_authorized_live_session(link_id, current_admin)
    if session.get("status") != "started":
        raise HTTPException(status_code=403, detail="Spectator access is only allowed for started sessions")
    
    token = create_spectator_token(
        secret=JWT_SECRET_KEY,
        algorithm=ALGORITHM,
        link_id=link_id,
        issued_by_admin_id=str(current_admin.get("admin_id") or ""),
        ttl_hours=4,
    )
    return {
        "token": token,
        "expires_in_hours": 4,
        "link_id": link_id,
    }


@router.get("/admin/interview/{link_id}/spectator-count")
async def get_spectator_count(
    link_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    """Return the current number of active spectators watching this session."""
    _get_authorized_live_session(link_id, current_admin)
    count = await manager.get_spectator_count(link_id)
    return {"link_id": link_id, "spectator_count": count}


@router.websocket("/ws/webrtc/{role}/{link_id}")
async def webrtc_endpoint(websocket: WebSocket, role: str, link_id: str, token: Optional[str] = None):
    import os, tempfile
    webrtc_log_path = os.path.join(tempfile.gettempdir(), "webrtc_debug.log")
    with open(webrtc_log_path, "a") as f:
        f.write(f"\n--- New Connection ---\nRole: {role}, Link ID: {link_id}\nToken supplied: {bool(token)}\n")
    
    admin_id: Optional[str] = None
    spectator_id: Optional[str] = None

    if role == "candidate":
        if not token:
            await websocket.close(code=1008)
            return
        try:
            candidate_session = _validate_candidate_monitoring_token(token, link_id)
        except HTTPException:
            await websocket.close(code=1008)
            return
        await manager.connect_candidate(websocket, link_id)
        # Notify watching admins immediately that candidate stream is active/ready
        try:
            await manager.send_to_admins(link_id, {"type": "candidate_connected"})
        except Exception:
            pass
    elif role == "admin":
        if not token:
            with open(webrtc_log_path, "a") as f:
                f.write("No token provided. Closing with 1008.\n")
            await websocket.close(code=1008)
            return
        try:
            auth_context = _decode_dashboard_websocket_admin(token)
            _get_authorized_live_session(link_id, auth_context)
            # Use client-provided unique admin_id or generate unique instance identifier
            client_admin_id = websocket.query_params.get("admin_id")
            if client_admin_id and client_admin_id != "undefined":
                admin_id = client_admin_id
            else:
                base = auth_context.get("email") or auth_context.get("user_id") or "admin"
                admin_id = f"{base}_{uuid.uuid4().hex[:8]}"

            await manager.connect_admin(websocket, link_id, admin_id=admin_id)
            with open(webrtc_log_path, "a") as f:
                f.write(f"Admin ({admin_id}) connected successfully.\n")
            # Also notify candidate that a new admin connected
            try:
                await manager.send_to_candidate(link_id, {"type": "admin_connected", "admin_id": admin_id})
            except Exception:
                pass
        except HTTPException as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"Admin authorization error: {e.detail}\n")
            await websocket.close(code=1008)
            return
        except jwt.PyJWTError as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"JWT Decode Error: {str(e)}\n")
            await websocket.close(code=1008)
            return
        except Exception as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"Other Error: {str(e)}\n{traceback.format_exc()}\n")
            await websocket.close(code=1011)
            return
    elif role == "spectator":
        if not token:
            await websocket.close(code=1008)
            return
        try:
            decode_spectator_token(JWT_SECRET_KEY, ALGORITHM, token, link_id)
        except (jwt.PyJWTError, ValueError) as e:
            with open(webrtc_log_path, "a") as f:
                f.write(f"Spectator auth error: {str(e)}\n")
            await websocket.close(code=1008)
            return
        # Verify session is not deactivated or cancelled
        session_check = interview_sessions_collection.find_one(
            {"link_id": link_id},
            {"status": 1, "is_deactivated": 1}
        )
        if not session_check or session_check.get("is_deactivated") or session_check.get("status") in ("terminated", "cancelled", "expired"):
            with open(webrtc_log_path, "a") as f:
                f.write(f"Spectator session check failed for link_id {link_id}: {session_check}\n")
            await websocket.close(code=1008)
            return
        spectator_id = f"spectator_{uuid.uuid4().hex[:8]}"
        await manager.connect_spectator(websocket, link_id, spectator_id=spectator_id)
        try:
            await websocket.send_json({"type": "spectator_connected", "spectator_id": spectator_id})
        except Exception:
            pass
        try:
            await manager.send_to_candidate(link_id, {"type": "admin_connected", "admin_id": spectator_id, "spectator_id": spectator_id, "role": "spectator"})
        except Exception:
            pass
    else:
        await websocket.close()
        return

    last_telemetry_at = 0.0
    try:
        # Notify admin immediately that they are connected with their assigned admin_id
        if role == "admin":
            try:
                await websocket.send_json({"type": "admin_connected", "admin_id": admin_id})
            except Exception:
                pass

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type", "")

            # Heartbeat ping/pong from any role to keep load balancer alive
            if msg_type == "ping":
                try:
                    await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
                continue
            if msg_type == "pong":
                continue

            if role == "candidate":
                # Throttle telemetry: at most one per second
                if msg_type == "telemetry":
                    now_monotonic = time.monotonic()
                    if now_monotonic - last_telemetry_at < 1.0:
                        continue
                    last_telemetry_at = now_monotonic

                    # Broadcast telemetry to all watching admins & spectators
                    await manager.send_to_admins(link_id, data)

                    # Persist telemetry snapshot to MongoDB / Redis for the dashboard
                    telemetry_payload = data.get("data", {}) or {}
                    proctoring_status = telemetry_payload.get("proctoring_status", {}) or {}
                    updates = {
                        "audio_level": _bounded_number(telemetry_payload.get("audio_level"), 0, 100),
                        "current_question": _bounded_number(telemetry_payload.get("current_question"), 0, 10_000, integer=True),
                        "total_questions": _bounded_number(telemetry_payload.get("total_questions"), 0, 10_000, integer=True),
                        "question_text": str(telemetry_payload.get("question_text") or "")[:500],
                        "round_type": _safe_round_type(telemetry_payload.get("round_type")),
                        "proctoring_alerts": _bounded_number(telemetry_payload.get("proctoring_alerts"), 0, 10_000, integer=True),
                        "last_alert_type": str(proctoring_status.get("lastAlertType") or "")[:64] or None,
                        "face_visible": _optional_bool(proctoring_status.get("faceVisible")),
                        "face_count": _bounded_number(proctoring_status.get("faceCount"), 0, 20, integer=True),
                        "multi_face": _optional_bool(proctoring_status.get("multiFace")),
                        "phone_detected": _optional_bool(proctoring_status.get("phoneDetected")),
                        "eye_contact_lost": _optional_bool(proctoring_status.get("eyeContactLost")),
                    }
                    await _store_live_snapshot(link_id, updates, candidate_session)
                else:
                    # WebRTC signaling (answer, ice candidate) - target specific admin/spectator if specified
                    target_admin = data.get("target_admin_id") or data.get("viewer_id") or data.get("spectator_id")
                    if target_admin:
                        await manager.send_to_specific_admin(link_id, target_admin, data)
                    else:
                        await manager.send_to_admins(link_id, data)

            elif role == "admin":
                # Ensure admin_id is tagged on outgoing offers and ICE candidates
                if "admin_id" not in data and admin_id:
                    data["admin_id"] = admin_id
                # Forward all admin signaling (offer/ICE) directly to the candidate
                await manager.send_to_candidate(link_id, data)

            elif role == "spectator":
                # Spectators are strictly receive-only for audio/video.
                allowed_spectator_types = {"webrtc_offer", "webrtc_ice_candidate", "ping"}
                if msg_type in allowed_spectator_types:
                    data["admin_id"] = spectator_id
                    data["spectator_id"] = spectator_id
                    data["role"] = "spectator"
                    await manager.send_to_candidate(link_id, data)
    except WebSocketDisconnect:
        webrtc_log_path = os.path.join(tempfile.gettempdir(), "webrtc_debug.log")
        with open(webrtc_log_path, "a") as f:
            f.write(f"WebSocketDisconnect for role {role}, link_id {link_id}\n")
    except Exception as e:
        webrtc_log_path = os.path.join(tempfile.gettempdir(), "webrtc_debug.log")
        with open(webrtc_log_path, "a") as f:
            f.write(f"Exception in while loop: {str(e)}\n{traceback.format_exc()}\n")
    finally:
        if role == "candidate":
            manager.disconnect_candidate(link_id)
            try:
                await manager.send_to_admins(link_id, {"type": "candidate_disconnected"})
            except Exception:
                pass
        elif role == "admin":
            manager.disconnect_admin(websocket, link_id, admin_id=admin_id)
            try:
                await manager.send_to_candidate(link_id, {"type": "admin_disconnected", "admin_id": admin_id})
            except Exception:
                pass
        elif role == "spectator":
            await manager.disconnect_spectator(websocket, link_id, spectator_id=spectator_id)
            try:
                await manager.send_to_candidate(link_id, {"type": "admin_disconnected", "admin_id": spectator_id})
            except Exception:
                pass



# --------------------------------------------------------------------------------
# MASTER & SUBSCRIPTION APIs
# --------------------------------------------------------------------------------
