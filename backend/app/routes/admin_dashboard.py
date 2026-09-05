"""
app/routes_split/admin_dashboard.py — Admin dashboard, stats, copilot
Auto-split from routes.py lines 2052–4009.
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

_LOCAL_DASHBOARD_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
_LOCAL_DASHBOARD_CACHE_TTL = 10.0

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

from app.routes.interview import UpdateAgentFlowRequest, normalize_agent_flow_read_item, generate_interview_summary, sync_session_to_application, normalize_agent_flow_write_item

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/admin/widget-config")
@router.get("/api/admin/widget-config")
def get_widget_config(
    omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key"),
    current_admin: dict = Depends(get_current_admin_details)
):
    from app.core.config import get_omni_dimension_api_key
    api_key = (omni_api_key or get_omni_dimension_api_key()).strip()
    if not api_key:
        return {"configured": False, "secret_key": None, "widget_url": None}
    return {
        "configured": True,
        "secret_key": api_key,
        "widget_url": f"https://omnidim.io/web_widget.js?secret_key={api_key}"
    }

@router.get("/admin/agent-flow")
def get_agent_flow(omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    from app.core.config import get_omni_dimension_api_key, get_omni_agent_id
    import requests
    api_key = (omni_api_key or get_omni_dimension_api_key()).strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="OMNI_DIMENSION_API_KEY is not set.")
    headers = {"Authorization": f"Bearer {api_key}"}
    try:
        from app.ai.omni_dimension_client import get_cached_omni_json, get_omni_account, set_cached_omni_json
        cached_flow = get_cached_omni_json(api_key, "agent-flow")
        if cached_flow is not None:
            return {"success": True, "flow": cached_flow, "cached": True}
        _, _, resolved_agent_id = get_omni_account(api_key)
        agent_id = str(resolved_agent_id)
        res = requests.get(f"https://backend.omnidim.io/api/v1/agents/{agent_id}", headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            agent_obj = data.get("agent") or {}
            top_level = data.get("context_breakdown")
            if top_level is not None:
                flow_data = top_level
            elif agent_obj.get("context_breakdown") is not None:
                flow_data = agent_obj["context_breakdown"]
            else:
                flow_data = []
            normalized_flow = [normalize_agent_flow_read_item(item) for item in flow_data]
            set_cached_omni_json(api_key, "agent-flow", normalized_flow)
            return {"success": True, "flow": normalized_flow}
        else:
            print(f"[Omnidimension] GET agent flow failed [status={res.status_code}]")
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch agent flow from upstream API.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/admin/agent-flow")
def update_agent_flow(req: UpdateAgentFlowRequest, omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key")):
    from app.core.config import get_omni_dimension_api_key, get_omni_agent_id
    import requests
    from pathlib import Path
    payload = {
        "context_breakdown": [normalize_agent_flow_write_item(item.dict()) for item in req.flow]
    }

    api_key = (omni_api_key or get_omni_dimension_api_key()).strip()
    if not api_key:
        logger.warning("[agent-flow] OMNI_DIMENSION_API_KEY not configured; saving local flow only.")
        try:
            local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
            local_path.write_text(json.dumps(payload.get('context_breakdown', []), indent=2, ensure_ascii=False), encoding='utf-8')
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to persist local flow: {e}")
        return {"success": True, "message": "Local flow saved; Omnidimension sync skipped because OMNI_DIMENSION_API_KEY is not configured."}

    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    from app.ai.omni_dimension_client import get_omni_account, set_cached_omni_json
    _, _, resolved_agent_id = get_omni_account(api_key)
    agent_id = str(resolved_agent_id)

    # We only send the context_breakdown (conversational flow)
    
    omni_url = f"https://backend.omnidim.io/api/v1/agents/{agent_id}"
    try:
        logger.info("[agent-flow] OmniDimension sync request: method=PUT url=%s agent_id=%s", omni_url, agent_id)
        logger.info("[agent-flow] OmniDimension authorization configured: %s", bool(api_key))
        logger.info("[agent-flow] OmniDimension request body: %s", json.dumps(payload, ensure_ascii=False))
        res = requests.put(omni_url, headers=headers, json=payload, timeout=10)
        logger.info("[agent-flow] OmniDimension response status: %s", res.status_code)
        logger.info("[agent-flow] OmniDimension response body: %s", res.text)
        from app.db.mongo_db import db
        flow_list = payload.get('context_breakdown', [])
        if res.status_code == 200:
            set_cached_omni_json(api_key, "agent-flow", flow_list)
            try:
                db.conversation_flows.update_one(
                    {"omni_agent_id": agent_id},
                    {"$set": {"omni_agent_id": agent_id, "flow": flow_list, "synced_at": datetime.utcnow().isoformat()}},
                    upsert=True
                )
                local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
                local_path.write_text(json.dumps(flow_list, indent=2, ensure_ascii=False), encoding='utf-8')
            except Exception as e:
                print(f"[agent-flow] Warning: failed to persist local flow: {e}")
            return {"success": True, "message": "Agent flow updated successfully."}
        else:
            print(f"[Omnidimension] PUT agent flow failed [status={res.status_code}]")
            try:
                db.conversation_flows.update_one(
                    {"omni_agent_id": agent_id},
                    {"$set": {"omni_agent_id": agent_id, "flow": flow_list, "synced_at": datetime.utcnow().isoformat()}},
                    upsert=True
                )
                local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
                local_path.write_text(json.dumps(flow_list, indent=2, ensure_ascii=False), encoding='utf-8')
                set_cached_omni_json(api_key, "agent-flow", flow_list)
                return {"success": True, "message": "Upstream failed but local flow updated."}
            except Exception:
                raise HTTPException(status_code=res.status_code, detail="Failed to update agent flow on upstream API and failed to save locally.")
    except HTTPException:
        raise
    except Exception as e:
        try:
            flow_list = payload.get('context_breakdown', [])
            db.conversation_flows.update_one(
                {"omni_agent_id": agent_id if 'agent_id' in locals() else "default"},
                {"$set": {"flow": flow_list, "synced_at": datetime.utcnow().isoformat()}},
                upsert=True
            )
            local_path = Path(__file__).resolve().parents[1] / 'agent_flow.json'
            local_path.write_text(json.dumps(flow_list, indent=2, ensure_ascii=False), encoding='utf-8')
            set_cached_omni_json(api_key, "agent-flow", flow_list)
            return {"success": True, "message": "Local flow updated (upstream error)."}
        except Exception:
            raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/interview/{link_id}")
def get_interview_details(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if link_id.startswith("ai_call_"):
        # This is an AI Call Mock Session!
        app_id = link_id.replace("ai_call_", "")
        from bson import ObjectId
        try:
            app = job_applications_collection.find_one({"_id": ObjectId(app_id)})
        except Exception:
            app = None
        if not app:
            # Fallback search by omni_call_id
            app = job_applications_collection.find_one({"omni_call_id": app_id})
        if not app:
            raise HTTPException(status_code=404, detail="AI Call candidate not found")
        if current_admin.get("role") != "master":
            job = jobs_collection.find_one({"job_id": app.get("job_id")}, {"company_id": 1, "admin_id": 1})
            if not job or str(job.get("company_id") or "") != str(current_admin.get("company_id") or ""):
                raise HTTPException(status_code=403, detail="Access denied to this candidate")
            if current_admin.get("role") == "admin" and str(job.get("admin_id") or "") != str(current_admin.get("admin_id") or ""):
                raise HTTPException(status_code=403, detail="Access denied to this candidate")
            
        interactions = app.get("omni_call_details", {}).get("interactions", [])
        answers = []
        if interactions:
            for idx, interaction in enumerate(interactions):
                speaker = interaction.get("speaker", "Bot")
                text = interaction.get("text", "")
                answers.append({
                    "question_id": idx + 1,
                    "question_text": f"Segment {idx + 1} ({speaker})",
                    "answer_text": text,
                    "ai_score": app.get("score") or 0.0,
                    "content_score": app.get("score") or 0.0,
                    "relevance_score": app.get("score") or 0.0,
                    "time_score": 100,
                    "time_spent_seconds": 0,
                    "time_limit_seconds": 60,
                    "ai_feedback": "Outbound AI Call interaction.",
                    "corrected_answer": "N/A",
                    "wpm": 0.0,
                    "pause_count": 0,
                    "filler_count": 0,
                    "keyword_match_pct": 0.0,
                    "tab_switches": 0,
                    "face_alerts": 0,
                    "noise_alerts": 0,
                    "behavioral_stats": {
                        "filler_words_count": 0,
                        "pauses_count": 0,
                        "face_not_visible_count": 0
                    }
                })
        elif app.get("transcript"):
            lines = app.get("transcript", "").split("\n")
            for idx, line in enumerate(lines):
                if not line.strip():
                    continue
                speaker = "Bot"
                text = line
                if ":" in line:
                    parts = line.split(":", 1)
                    speaker = parts[0].strip()
                    text = parts[1].strip()
                answers.append({
                    "question_id": idx + 1,
                    "question_text": f"Segment {idx + 1} ({speaker})",
                    "answer_text": text,
                    "ai_score": app.get("score") or 0.0,
                    "content_score": app.get("score") or 0.0,
                    "relevance_score": app.get("score") or 0.0,
                    "time_score": 100,
                    "time_spent_seconds": 0,
                    "time_limit_seconds": 60,
                    "ai_feedback": "Outbound AI Call interaction.",
                    "corrected_answer": "N/A",
                    "wpm": 0.0,
                    "pause_count": 0,
                    "filler_count": 0,
                    "keyword_match_pct": 0.0,
                    "tab_switches": 0,
                    "face_alerts": 0,
                    "noise_alerts": 0,
                    "behavioral_stats": {
                        "filler_words_count": 0,
                        "pauses_count": 0,
                        "face_not_visible_count": 0
                    }
                })

        # Mock dimensions
        score = app.get("score") or 0.0
        
        # Calculate actual duration from Omni Call
        omni_duration_str = app.get("omni_call_details", {}).get("duration", "0m 0s")
        total_mins = 0.0
        try:
            m_part = omni_duration_str.split("m")[0].strip() if "m" in omni_duration_str else "0"
            s_part = omni_duration_str.split("m")[1].replace("s", "").strip() if "m" in omni_duration_str else "0"
            total_mins = int(m_part) + int(s_part) / 60.0
            total_mins = round(total_mins, 1)
        except Exception:
            total_mins = 0.0
            
        response_payload = {
            "interview_id": link_id,
            "actual_interview_id": "mock_ai_call",
            "candidate_id": f"CAN{str(app['_id'])[:4].upper()}",
            "candidate_name": app.get("name") or "Candidate",
            "candidate_email": app.get("email") or "",
            "date": app.get("applied_at") or app.get("updated_at"),
            "source": "AI Calling Agent",
            "avg_score": score,
            "overall_recommendation": app.get("interest") or "Interested",
            "strengths_summary": "Marked as Interested during outbound AI call.",
            "weaknesses_summary": "N/A",
            "communication_score": score,
            "communication_reasoning": "Communication assessed via outbound AI calling agent.",
            "skills_score": score,
            "skills_reasoning": "Skills assessed via outbound AI calling agent.",
            "competencies_score": score,
            "competencies_reasoning": "N/A",
            "personality_score": score,
            "personality_reasoning": "N/A",
            "culture_fit_score": score,
            "culture_fit_reasoning": "N/A",
            "job_success_score": score,
            "job_success_reasoning": "N/A",
            "detected_accent": "English",
            "recording_url": app.get("omni_call_details", {}).get("recording_url"),
            "screen_recording_url": None,
            "completion_reason": "normal",
            "integrity": {
                "total_tab_switches": 0,
                "total_face_alerts": 0,
                "total_noise_alerts": 0,
                "total_time_minutes": total_mins
            },
            "admin_notes": app.get("admin_notes", ""),
            "alerts": [],
            "answers": answers,
            "started_at": app.get("applied_at") or app.get("updated_at") or app.get("created_at")
        }
        return response_payload

    # 1. Fetch session metadata
    session_data = interview_sessions_collection.find_one({"link_id": link_id})
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    candidate_name = session_data.get("candidate_name")
    created_at = session_data.get("created_at")
    jd = session_data.get("job_description")
    actual_interview_id = session_data.get("interview_id")
    saved_rec = session_data.get("overall_recommendation")
    saved_str = session_data.get("strengths_summary")
    saved_wk = session_data.get("weaknesses_summary")
    saved_avg = session_data.get("avg_score")
    saved_comm = session_data.get("communication_score")
    saved_comm_reason = session_data.get("communication_reasoning")
    saved_skills = session_data.get("skills_score")
    saved_skills_reason = session_data.get("skills_reasoning")
    saved_comp = session_data.get("competencies_score")
    saved_comp_reason = session_data.get("competencies_reasoning")
    saved_pers = session_data.get("personality_score")
    saved_pers_reason = session_data.get("personality_reasoning")
    saved_cult = session_data.get("culture_fit_score")
    saved_cult_reason = session_data.get("culture_fit_reasoning")
    saved_job = session_data.get("job_success_score")
    saved_job_reason = session_data.get("job_success_reasoning")
    saved_accent = session_data.get("detected_accent")
    current_status = session_data.get("status")
    candidate_email = session_data.get("candidate_email")


    def get_url_from_raw_path(rpath):
        if not rpath: return None
        try:
            if rpath.startswith("cloudinary-authenticated://"):
                public_id = rpath.split("://", 1)[1]
                signed_url, _ = cloudinary.utils.cloudinary_url(
                    public_id,
                    resource_type="video",
                    type="authenticated",
                    secure=True,
                    sign_url=True,
                )
                return signed_url
            if rpath.startswith("http"): return rpath
            
            raw_path_fixed = rpath.replace("\\", "/")
            idx = raw_path_fixed.find("uploads/")
            
            if idx != -1: 
                relative_path = raw_path_fixed[idx:]
                if os.path.exists(rpath):
                    return relative_path
                else:
                    # If running locally, the file might be on the production server
                    return "https://ai-adaptive-interview-1hsw.onrender.com/" + relative_path
                    
            print(f"Recording file not found on disk: {rpath}")
            return None
        except Exception as e:
            print(f"Error generating recording URL for {rpath}: {e}")
            return None

    recording_url = None
    screen_recording_url = None
    
    raw_path = session_data.get("recording_path")
    raw_screen_path = session_data.get("screen_recording_path")
    
    if actual_interview_id:
        rec_row = interviews_collection.find_one({"id": actual_interview_id})
        if rec_row:
            if not raw_path and rec_row.get("recording_path"):
                raw_path = rec_row["recording_path"]
            if not raw_screen_path and rec_row.get("screen_recording_path"):
                raw_screen_path = rec_row["screen_recording_path"]
                
    recording_url = get_url_from_raw_path(raw_path)
    screen_recording_url = get_url_from_raw_path(raw_screen_path)

    results = []
    
    # Calculate integrity totals from the violations array, as it accurately tracks all events
    # even if the interview terminates before any questions are answered.
    violations = session_data.get("violations", [])
    total_tab_switches = sum(1 for v in violations if v.get("type") == "tab_switch")
    total_face_alerts = sum(1 for v in violations if v.get("type") not in ("tab_switch", "noise_alert"))
    total_noise_alerts = sum(1 for v in violations if v.get("type") == "noise_alert")
    
    total_time = 0
    # Note: if all per-question time_spent_seconds are 0 (old records pre-fix),
    # we fall back to session-level timestamps below after the answers loop.

    if actual_interview_id:
        rows = answers_collection.find({"interview_id": actual_interview_id}).sort("question_id", 1)
        for row in rows:
            tab_sw = row.get("tab_switches") or 0
            face_al = row.get("face_alerts") or 0
            noise_al = row.get("noise_alerts") or 0
            # We no longer sum these from answers since we pull directly from the violations array
            # total_tab_switches += tab_sw
            # total_face_alerts += face_al
            # total_noise_alerts += noise_al
            total_time += (row.get("time_spent_seconds") or 0)
            results.append({
                "question_id": row.get("question_id"),
                "question_text": row.get("question_text"),
                "answer_text": row.get("answer_text") or "(No answer yet)",
                "ai_score": row.get("ai_score"),
                "content_score": row.get("content_score"),
                "relevance_score": row.get("relevance_score"),
                "time_score": row.get("time_score"),
                "time_spent_seconds": row.get("time_spent_seconds") or 0,
                "time_limit_seconds": row.get("time_limit_seconds"),
                "ai_feedback": row.get("ai_feedback") or "No feedback provided",
                "corrected_answer": row.get("corrected_answer") or "N/A",
                "wpm": round(row.get("wpm") or 0, 1),
                "pause_count": row.get("pause_count") or 0,
                "filler_count": row.get("filler_count") or 0,
                "keyword_match_pct": round(row.get("keyword_match_pct") or 0, 1),
                "tab_switches": tab_sw,
                "face_alerts": face_al,
                "noise_alerts": noise_al
            })

    # ── Timestamp-based fallback for older sessions where time_spent_seconds was not stored ──
    # If total_time is still 0 after reading all answers, calculate from session timestamps.
    if total_time == 0:
        try:
            started_str  = session_data.get("started_at")
            finished_str = (session_data.get("completed_at")
                            or session_data.get("updated_at")
                            or session_data.get("submitted_at"))

            print(f"⏱️ Duration fallback check | link_id={link_id} | started_at={started_str} | finished_str(before ans)={finished_str} | interview_id={actual_interview_id}")

            # For old sessions with no completed_at, use the created_at of the LAST answer
            if started_str and not finished_str and actual_interview_id:
                last_ans = answers_collection.find_one(
                    {"interview_id": actual_interview_id},
                    sort=[("created_at", -1)]
                )
                if last_ans:
                    finished_str = last_ans.get("created_at")
                    print(f"⏱️ Using last answer created_at as finish time: {finished_str}")

            if started_str and finished_str:
                started_dt  = datetime.fromisoformat(started_str.replace("Z", "+00:00"))
                finished_dt = datetime.fromisoformat(finished_str.replace("Z", "+00:00"))
                delta_secs  = (finished_dt - started_dt).total_seconds()
                print(f"⏱️ Calculated duration: {delta_secs:.0f}s = {delta_secs/60:.1f} min")
                if delta_secs > 0:
                    total_time = int(delta_secs)
            else:
                print(f"⏱️ Cannot compute fallback duration: started_str={started_str}, finished_str={finished_str}")
        except Exception as _ts_err:
            print(f"Timestamp fallback error: {_ts_err}")

    # 2. Calculate composite AI summary score
    avg_score = 0
    round1_s = 0.0
    round2_s = 0.0
    interview_type = (session_data.get("interview_type") if session_data else None) or "Technical"
    scores = [r["ai_score"] for r in results if r["ai_score"] is not None]
    verbal_avg = round(sum(scores) / len(scores), 1) if scores else 0

    # Blend with coding / case study rounds if present
    try:
        from app.ai.score_rounds import (
                compute_case_study_score,
                calculate_round1_score, calculate_coding_score,
                calculate_case_study_round2_score, calculate_final_score
            )
        interview_record_for_score = interviews_collection.find_one({"id": actual_interview_id}) if actual_interview_id else None

        if interview_record_for_score:
            interview_format_cs = session_data.get("interview_format", "Standard") if session_data else "Standard"
            lang_cs = interview_record_for_score.get("language", "English")
            ctx_cs  = f"Candidate's {interview_record_for_score.get('source','Resume')}: {interview_record_for_score.get('profile_text','')}"

            # Determine interview type for scoring model
            interview_type = interview_record_for_score.get("interview_type") or \
                             (session_data.get("interview_type") if session_data else None) or "Technical"

            coding_rd  = interview_record_for_score.get("coding_round")
            case_std   = interview_record_for_score.get("case_study_round")
            n_cs_questions = len((case_std or {}).get("questions", []) or []) if case_std else 0

            questions  = interview_record_for_score.get("questions", [])
            if isinstance(questions, str):
                import json
                try:
                    questions = json.loads(questions)
                except:
                    questions = []
            if not questions and session_data and session_data.get("pre_generated_questions"):
                import json
                try:
                    questions = json.loads(session_data["pre_generated_questions"])
                except:
                    pass

            # Round 1 (Verbal): ALWAYS recalculate because it's fast (O(1)) and uses native math, not the LLM.
            round1_s = calculate_round1_score(questions, results, interview_type=interview_type, n_case_study_questions=n_cs_questions)

            round2_s = 0.0
            itype_lower = str(interview_type).strip().lower()
            if itype_lower == "technical" and coding_rd:
                # Coding Round: ALWAYS recalculate because it just reads test cases, no LLM cost.
                round2_s = calculate_coding_score(coding_rd)
            elif itype_lower in ("non-technical", "non_technical", "non tech", "nontech") and case_std:
                lang_cs = interview_record_for_score.get("language", "English")
                ctx_cs = f"Profile: {interview_record_for_score.get('profile_text', '')}"
                round2_s = calculate_case_study_round2_score(case_std, n_cs_questions, ctx_cs, lang_cs)
                if actual_interview_id:
                    interviews_collection.update_one(
                        {"id": actual_interview_id},
                        {"$set": {"case_study_round": case_std}}
                    )

            # Final Score: ALWAYS recalculate mathematically.
            avg_score = calculate_final_score(round1_s, round2_s)
        else:
            round1_s = verbal_avg
            avg_score = verbal_avg
    except Exception as blend_err:
        print(f"🚨 complete-session blend error: {blend_err}")
        avg_score = verbal_avg

    # Use cached values if available, else generate
    if saved_rec and saved_comm is not None and saved_skills is not None:
        recommendation = saved_rec
        strengths = saved_str
        weaknesses = saved_wk
        communication_score = saved_comm
        communication_reasoning = saved_comm_reason
        skills_score = saved_skills
        skills_reasoning = saved_skills_reason
        competencies_score = saved_comp
        competencies_reasoning = saved_comp_reason
        personality_score = saved_pers
        personality_reasoning = saved_pers_reason
        culture_fit_score = saved_cult
        culture_fit_reasoning = saved_cult_reason
        job_success_score = saved_job
        job_success_reasoning = saved_job_reason
        detected_accent = saved_accent or "Unknown"
        if not detected_accent or detected_accent.strip().lower() in ["unknown", "none", ""]:
            from app.services.language_accent_detector import detect_language_and_accent
            lang_accent_res = detect_language_and_accent(
                text_or_answers=results or session_data.get("answers", []),
                candidate_profile=session_data,
                interview_language=session_data.get("language") or "English"
            )
            detected_accent = lang_accent_res.get("detected_accent") or "English (Indian Accent)"
            detected_language = lang_accent_res.get("language") or "English"
            try:
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": {
                        "detected_accent": detected_accent,
                        "detected_language": detected_language,
                        "language": detected_language
                    }}
                )
            except Exception as e:
                print(f"Error updating detected accent: {e}")
    else:
        try:
            summary = generate_interview_summary(candidate_name or "Candidate", results)
        except Exception as sum_err:
            print(f"Error generating interview summary: {sum_err}")
            summary = {}
        recommendation = summary.get("recommendation", "No Data")
        strengths = summary.get("strengths", "")
        weaknesses = summary.get("weaknesses", "")
        communication_score = summary.get("communication_score", 0)
        communication_reasoning = summary.get("communication_reasoning", "N/A")
        skills_score = summary.get("skills_score", 0)
        skills_reasoning = summary.get("skills_reasoning", "N/A")
        competencies_score = summary.get("competencies_score", 0)
        competencies_reasoning = summary.get("competencies_reasoning", "N/A")
        personality_score = summary.get("personality_score", 0)
        personality_reasoning = summary.get("personality_reasoning", "N/A")
        culture_fit_score = summary.get("culture_fit_score", 0)
        culture_fit_reasoning = summary.get("culture_fit_reasoning", "N/A")
        job_success_score = summary.get("job_success_score", 0)
        job_success_reasoning = summary.get("job_success_reasoning", "N/A")
        
        detected_accent = summary.get("detected_accent")
        if not detected_accent or detected_accent == "Unknown":
            detected_accent = session_data.get("detected_accent") or "Unknown"

        # Auto-detect language and accent if missing or Unknown
        if not detected_accent or detected_accent.strip().lower() in ["unknown", "none", ""]:
            from app.services.language_accent_detector import detect_language_and_accent
            lang_accent_res = detect_language_and_accent(
                text_or_answers=results or session_data.get("answers", []),
                candidate_profile=session_data,
                interview_language=session_data.get("language") or "English"
            )
            detected_accent = lang_accent_res.get("detected_accent") or "English (Indian Accent)"
            detected_language = lang_accent_res.get("language") or "English"
            try:
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": {
                        "detected_accent": detected_accent,
                        "detected_language": detected_language,
                        "language": detected_language
                    }}
                )
            except Exception as e:
                print(f"Error updating detected accent: {e}")
        
        # Only cache in DB if it's a real summary (not the fallback)
        if "Summary generation failed" not in strengths:
            try:
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": {
                        "overall_recommendation": recommendation,
                        "strengths_summary": strengths,
                        "weaknesses_summary": weaknesses,
                        "communication_score": communication_score,
                        "communication_reasoning": communication_reasoning,
                        "skills_score": skills_score,
                        "skills_reasoning": skills_reasoning,
                        "competencies_score": competencies_score,
                        "competencies_reasoning": competencies_reasoning,
                        "personality_score": personality_score,
                        "personality_reasoning": personality_reasoning,
                        "culture_fit_score": culture_fit_score,
                        "culture_fit_reasoning": culture_fit_reasoning,
                        "job_success_score": job_success_score,
                        "job_success_reasoning": job_success_reasoning,
                        "detected_accent": detected_accent,
                        "score": avg_score,
                        "avg_score": avg_score,
                        "round1_score": round1_s,
                        "round2_score": round2_s
                    }}
                )
            except Exception as e:
                print(f"Summary cache error: {e}")
            sync_session_to_application(link_id)

    # ── Auto-enrich candidate profile via NLP from resume text if fields missing ──
    resume_text_content = session_data.get("resume_text") or session_data.get("profile_text") or ""
    if not resume_text_content and actual_interview_id:
        iv_doc = interviews_collection.find_one({"id": actual_interview_id})
        if iv_doc:
            resume_text_content = iv_doc.get("profile_text", "")

    phone_val = session_data.get("candidate_phone") or session_data.get("phone") or ""
    exp_val = session_data.get("experience") or ""
    comp_val = session_data.get("current_company") or ""
    loc_val = session_data.get("location") or ""
    np_val = session_data.get("notice_period") or ""
    cctc_val = session_data.get("current_ctc") or ""
    ectc_val = session_data.get("expected_ctc") or ""

    if resume_text_content and (not phone_val or not exp_val or not comp_val or not loc_val or not np_val or not cctc_val or not ectc_val or not candidate_name or candidate_name == "Candidate"):
        try:
            from app.services.resume_nlp_extractor import extract_candidate_info_nlp, is_valid_company_name
            nlp_profile = extract_candidate_info_nlp(resume_text_content)
            db_updates = {}
            if not phone_val and nlp_profile.get("phone"):
                phone_val = nlp_profile["phone"]
                db_updates["candidate_phone"] = phone_val
                session_data["candidate_phone"] = phone_val
            if not exp_val and nlp_profile.get("experience"):
                exp_val = nlp_profile["experience"]
                db_updates["experience"] = exp_val
                session_data["experience"] = exp_val
            if (not comp_val or comp_val in ("N/A", "Not specified") or not is_valid_company_name(comp_val)) and nlp_profile.get("current_company"):
                comp_val = nlp_profile["current_company"]
                db_updates["current_company"] = comp_val
                session_data["current_company"] = comp_val
            if not loc_val and nlp_profile.get("location"):
                loc_val = nlp_profile["location"]
                db_updates["location"] = loc_val
                session_data["location"] = loc_val
            if (not np_val or np_val in ("N/A", "Not specified")) and nlp_profile.get("notice_period"):
                np_val = nlp_profile["notice_period"]
                db_updates["notice_period"] = np_val
                session_data["notice_period"] = np_val
            if (not cctc_val or cctc_val in ("N/A", "Not specified")) and nlp_profile.get("current_ctc"):
                cctc_val = nlp_profile["current_ctc"]
                db_updates["current_ctc"] = cctc_val
                session_data["current_ctc"] = cctc_val
            if (not ectc_val or ectc_val in ("N/A", "Not specified")) and nlp_profile.get("expected_ctc"):
                ectc_val = nlp_profile["expected_ctc"]
                db_updates["expected_ctc"] = ectc_val
                session_data["expected_ctc"] = ectc_val
            if (not candidate_name or candidate_name == "Candidate") and nlp_profile.get("name"):
                candidate_name = nlp_profile["name"]
                db_updates["candidate_name"] = candidate_name
                session_data["candidate_name"] = candidate_name

            # If detected_accent is Unknown or generic, refine it with candidate location/phone/resume
            if not detected_accent or detected_accent.strip().lower() in ["unknown", "none", "", "neutral english accent"]:
                from app.services.language_accent_detector import detect_language_and_accent
                l_res = detect_language_and_accent(
                    text_or_answers=results or session_data.get("answers", []),
                    candidate_profile={
                        "candidate_phone": phone_val,
                        "location": loc_val,
                        "resume_text": resume_text_content
                    },
                    interview_language=session_data.get("language") or "English"
                )
                detected_accent = l_res.get("detected_accent") or "English (Indian Accent)"
                det_lang = l_res.get("language") or "English"
                db_updates["detected_accent"] = detected_accent
                db_updates["detected_language"] = det_lang
                db_updates["language"] = det_lang
                session_data["detected_accent"] = detected_accent
                session_data["detected_language"] = det_lang
                session_data["language"] = det_lang

            if db_updates:
                interview_sessions_collection.update_one(
                    {"link_id": link_id},
                    {"$set": db_updates}
                )
        except Exception as nlp_err:
            print(f"⚠️ Resume NLP extraction error in get_candidate_detail: {nlp_err}")

    resume_url_val = session_data.get("resume_url", "")
    resume_filename_val = session_data.get("resume_filename", "")
    app_id = session_data.get("application_id")
    if app_id:
        from bson import ObjectId
        try:
            app_record = job_applications_collection.find_one({"_id": ObjectId(app_id)})
            if app_record:
                resume_url_val = app_record.get("resume_url") or resume_url_val
                resume_filename_val = app_record.get("resume_filename") or resume_filename_val
        except:
            pass

    response_payload = {
        "interview_id": link_id,
        "actual_interview_id": actual_interview_id,
        "candidate_id": session_data.get("candidate_id"),
        "candidate_name": candidate_name or "Candidate",
        "candidate_email": session_data.get("candidate_email") or session_data.get("email", ""),
        "candidate_phone": phone_val,
        "interview_title": session_data.get("interview_title") or session_data.get("job_title", ""),
        "experience": exp_val,
        "location": loc_val,
        "notice_period": np_val,
        "current_ctc": cctc_val,
        "expected_ctc": ectc_val,
        "current_company": comp_val,
        "status": sync_session_status(session_data),
        "decision": session_data.get("decision", ""),
        "resume_url": resume_url_val,
        "resume_filename": resume_filename_val,
        "resume_text": session_data.get("resume_text", ""),
        "job_description_text": session_data.get("job_description", ""),
        "date": created_at,
        "source": session_data.get("source") or "Job Description / Resume",
        "avg_score": avg_score,
        "round1_score": round1_s,
        "round2_score": round2_s,
        "interview_type": interview_type,
        "overall_recommendation": recommendation,
        "strengths_summary": strengths,
        "weaknesses_summary": weaknesses,
        "communication_score": communication_score,
        "communication_reasoning": communication_reasoning,
        "skills_score": skills_score,
        "skills_reasoning": skills_reasoning,
        "competencies_score": competencies_score,
        "competencies_reasoning": competencies_reasoning,
        "personality_score": personality_score,
        "personality_reasoning": personality_reasoning,
        "culture_fit_score": culture_fit_score,
        "culture_fit_reasoning": culture_fit_reasoning,
        "job_success_score": job_success_score,
        "job_success_reasoning": job_success_reasoning,
        "detected_accent": detected_accent,
        "detected_language": session_data.get("detected_language") or (detected_accent.split("(")[0].strip() if "(" in detected_accent else detected_accent),
        "language": session_data.get("language") or (detected_accent.split("(")[0].strip() if "(" in detected_accent else "English"),
        "detected_language_accent": detected_accent,
        "recording_url": recording_url,
        "screen_recording_url": screen_recording_url,
        "completion_reason": session_data.get("completion_reason"),
        "integrity": {
            "total_tab_switches": total_tab_switches,
            "total_face_alerts": total_face_alerts,
            "total_noise_alerts": total_noise_alerts,
            "total_time_minutes": round(total_time / 60, 1)
        },
        "violations": session_data.get("violations", session_data.get("alerts", [])),
        "proctoring_alerts": session_data.get("violations", session_data.get("alerts", [])),
        "alerts": session_data.get("violations", session_data.get("alerts", [])),
        "answers": results,
        "candidate_feedback": session_data.get("candidate_feedback", ""),
        "ats_score": session_data.get("ats_score")
    }
    
    # Include full question list so admin can see which questions were skipped
    all_questions = []
    try:
        raw_qs = session_data.get("pre_generated_questions") or session_data.get("questions")
        if raw_qs:
            if isinstance(raw_qs, str):
                import json as _json
                raw_qs = _json.loads(raw_qs)
            if isinstance(raw_qs, list):
                for q in raw_qs:
                    if isinstance(q, dict):
                        all_questions.append({
                            "id": q.get("id"),
                            "question": q.get("question") or q.get("text") or q.get("q", "")
                        })
    except Exception as e:
        print(f"all_questions parse error: {e}")
    
    response_payload["all_questions"] = all_questions

    # If the interview ended early, only show questions up to the last one attempted
    # so that unreached questions don't appear as "Not Answered"
    if all_questions and results:
        def _safe_int(val):
            try: return int(val)
            except: return 0
            
        max_answered_id = max((_safe_int(r.get("question_id", 0)) for r in results if r), default=0)
        if max_answered_id > 0:
            response_payload["all_questions"] = [q for q in all_questions if _safe_int(q.get("id")) <= max_answered_id]

    coding_round_data = session_data.get("coding_round")
    case_study_data = session_data.get("case_study_round")

    if actual_interview_id:
        interview_record = interviews_collection.find_one({"id": actual_interview_id})
        if interview_record:
            if not coding_round_data and interview_record.get("coding_round"):
                coding_round_data = interview_record.get("coding_round")
            if not case_study_data and interview_record.get("case_study_round"):
                case_study_data = interview_record.get("case_study_round")
            # Add profile/resume text and job description for ATS analysis
            response_payload["profile_text"] = interview_record.get("profile_text", "")
            response_payload["job_description"] = interview_record.get("job_description", "")
            response_payload["source"] = interview_record.get("source", response_payload["source"])
            # Fill interview_title from interview record if not already set from session
            if not response_payload.get("interview_title"):
                response_payload["interview_title"] = (
                    interview_record.get("title") or
                    interview_record.get("interview_title") or
                    interview_record.get("job_title", "")
                )

    # ── Include coding/case-study round data so the admin transcript shows submitted code ──
    response_payload["coding_round"] = coding_round_data
    response_payload["case_study_round"] = case_study_data

    return response_payload

class AnalyzeRequest(BaseModel):
    interview_id: Optional[str] = None
    question_id: Optional[int] = None
    question: str
    answer: str

class DecisionRequest(BaseModel):
    link_id: str
    decision: str # 'selected' or 'rejected'
    admin_id: Optional[str] = None

@router.post("/analyze-answer")
def analyze(req: AnalyzeRequest):
    context = ""
    language = "English"
    time_spent_seconds = 0
    time_limit_seconds = 120
    
    # Retrieve Resume/JD context from the CURRENT in-memory session (not historical DB data)
    if req.interview_id and get_session(req.interview_id):
         profile_text = get_session(req.interview_id).get("profile_text", "")
         source = get_session(req.interview_id).get("source", "Resume")
         language = get_session(req.interview_id).get("language", "English")
         context = f"Candidate's {source}: {profile_text}"
         
    # Fetch existing time metrics from DB so offline re-evaluation calculates WPM and time_score correctly
    existing_ans = answers_collection.find_one({"interview_id": req.interview_id, "question_id": req.question_id})
    if existing_ans:
        try:
            time_spent_seconds = int(existing_ans.get("time_spent_seconds") or 0)
            time_limit_seconds = int(existing_ans.get("time_limit_seconds") or 120)
        except (ValueError, TypeError):
            pass
    
    result = analyze_answer(
        req.question, 
        req.answer, 
        context, 
        language=language,
        time_spent_seconds=time_spent_seconds,
        time_limit_seconds=time_limit_seconds
    )

    # Delete existing to avoid duplicates
    answers_collection.delete_many({"interview_id": req.interview_id, "question_id": req.question_id})

    # Store in DB
    try:
        answers_collection.insert_one({
            "interview_id": req.interview_id,
            "question_id": req.question_id,
            "question_text": req.question,
            "answer_text": req.answer,
            "time_spent_seconds": time_spent_seconds,
            "time_limit_seconds": time_limit_seconds,
            "ai_score": result.get("overall_score", 0),
            "content_score": result.get("content_score", 0),
            "relevance_score": result.get("relevance_score", 0),
            "time_score": result.get("time_score", 0),
            "clarity_score": result.get("clarity_score", 50),
            "technical_depth_score": result.get("technical_depth_score", 50),
            "confidence_score": result.get("confidence_score", 50),
            "ai_feedback": result.get("feedback", ""),
            "ai_keywords": json.dumps(result.get("keywords", [])),
            "corrected_answer": result.get("corrected_answer", ""),
            "scoring_status": "completed",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    except Exception as e:
        print(f" Failed to save answer to DB: {e}")

    return result

@router.post("/upload-full-recording")
def upload_full_recording(
    interview_id: str = Form(...),
    link_id: Optional[str] = Form(None),
    recording_type: Optional[str] = Form("camera"),
    recording_truncated: bool = Form(False),
    recording_upload_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    session = _require_candidate_session(
        credentials,
        link_id=link_id,
        interview_id=interview_id,
        allow_completed=True,
    )
    link_id = session.get("link_id")
    if recording_type not in {"camera", "screen"}:
        raise HTTPException(status_code=422, detail="Recording type must be camera or screen")
    path_key = "recording_path" if recording_type == "camera" else "screen_recording_path"
    existing_interview = interviews_collection.find_one(
        {"id": interview_id},
        {path_key: 1, f"{path_key}_cloudinary_public_id": 1},
    ) or {}
    previous_public_ids = {
        value
        for value in (
            session.get(f"{path_key}_cloudinary_public_id"),
            existing_interview.get(f"{path_key}_cloudinary_public_id"),
        )
        if value
    }
    previous_local_paths = {
        value
        for value in (session.get(path_key), existing_interview.get(path_key))
        if value and not str(value).startswith("cloudinary-authenticated://")
    }
    if recording_upload_id:
        recording_upload_id = recording_upload_id.strip()
        if len(recording_upload_id) > 100 or not all(
            character.isalnum() or character in {"-", "_"}
            for character in recording_upload_id
        ):
            raise HTTPException(status_code=422, detail="Invalid recording upload ID")
        if (
            session.get(f"{path_key}_upload_id") == recording_upload_id
            and session.get(path_key)
        ):
            return {
                "status": "success",
                "idempotent": True,
                "recording_truncated": bool(session.get(f"{path_key}_truncated")),
                "saved_to_session": True,
            }
    content_type = (file.content_type or "").lower().split(";")[0].strip()
    if content_type not in {"video/webm", "video/mp4", "application/octet-stream", "video/x-matroska"}:
        raise HTTPException(status_code=415, detail="Only WebM or MP4 interview recordings are accepted")
    max_recording_bytes = 500 * 1024 * 1024
    if getattr(file, "size", 0) and file.size > max_recording_bytes:
        raise HTTPException(status_code=413, detail="Recording too large. Maximum size is 500MB.")
        
    try:
        # Create directory for temporary recordings if it doesn't exist
        recordings_dir = os.path.join(UPLOAD_FOLDER, "recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        
        # Generate filename
        prefix = "camera" if recording_type == "camera" else "screen"
        filename = f"{uuid.uuid4().hex}_{prefix}_recording.webm"
        file_path = os.path.join(recordings_dir, filename)
        
        # Save file locally first since it can be large
        bytes_written = 0
        try:
            with open(file_path, "wb") as buffer:
                while chunk := file.file.read(1024 * 1024):
                    bytes_written += len(chunk)
                    if bytes_written > max_recording_bytes:
                        raise HTTPException(status_code=413, detail="Recording too large. Maximum size is 500MB.")
                    buffer.write(chunk)
        except Exception:
            if os.path.exists(file_path):
                os.remove(file_path)
            raise
            
        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload_large(
                file_path,
                resource_type="video",
                type="authenticated",
                folder="hireiq_interview_recordings",
            )
            cloudinary_public_id = upload_result.get("public_id")
            normalized_path = f"cloudinary-authenticated://{cloudinary_public_id}"
            
            # Clean up local file after successful upload
            os.remove(file_path)
            
        except Exception as cloud_e:
            logger.exception("Recording upload to private Cloudinary storage failed")
            if os.getenv("ENV", "local") == "production":
                if os.path.exists(file_path):
                    os.remove(file_path)
                raise HTTPException(
                    status_code=503,
                    detail="Secure recording storage is temporarily unavailable",
                ) from cloud_e
            normalized_path = file_path.replace("\\", "/")
            cloudinary_public_id = None

        # Update database
        uploaded_at = datetime.now(timezone.utc)
        
        update_data = {
            path_key: normalized_path,
            f"{path_key}_uploaded_at": uploaded_at.isoformat(),
            f"{path_key}_expires_at": (uploaded_at + timedelta(days=RECORDING_RETENTION_DAYS)).isoformat(),
            f"{path_key}_retention_days": RECORDING_RETENTION_DAYS,
            f"{path_key}_storage": "cloudinary" if cloudinary_public_id else "local",
            f"{path_key}_truncated": bool(recording_truncated),
            f"{path_key}_upload_status": "complete",
        }
        if recording_upload_id:
            update_data[f"{path_key}_upload_id"] = recording_upload_id
        if cloudinary_public_id:
            update_data[f"{path_key}_cloudinary_public_id"] = cloudinary_public_id
            
        interview_update = interviews_collection.update_one(
            {"id": interview_id},
            {"$set": update_data}
        )

        session_filter = {"interview_id": interview_id}
        if link_id:
            session_filter = {"link_id": link_id}
            update_data["interview_id"] = interview_id
        session_update = interview_sessions_collection.update_one(
            session_filter,
            {"$set": update_data}
        )

        if interview_update.matched_count == 0 and session_update.matched_count == 0:
            if cloudinary_public_id:
                cloudinary.uploader.destroy(
                    cloudinary_public_id,
                    resource_type="video",
                    type="authenticated",
                    invalidate=True,
                )
            elif os.path.exists(normalized_path):
                os.remove(normalized_path)
            raise HTTPException(status_code=404, detail="Interview record no longer exists")

        for previous_public_id in previous_public_ids:
            if previous_public_id == cloudinary_public_id:
                continue
            try:
                cloudinary.uploader.destroy(
                    previous_public_id,
                    resource_type="video",
                    type="authenticated",
                    invalidate=True,
                )
            except Exception:
                logger.exception("Failed to delete a superseded private recording")
        recordings_root = os.path.abspath(recordings_dir)
        for previous_path in previous_local_paths:
            previous_absolute = os.path.abspath(previous_path)
            try:
                within_recordings = os.path.commonpath(
                    [recordings_root, previous_absolute]
                ) == recordings_root
            except ValueError:
                within_recordings = False
            if (
                within_recordings
                and previous_absolute != os.path.abspath(normalized_path)
                and os.path.isfile(previous_absolute)
            ):
                try:
                    os.remove(previous_absolute)
                except OSError:
                    logger.exception("Failed to delete a superseded local recording")

        return {
            "status": "success",
            "recording_truncated": bool(recording_truncated),
            "saved_to_interviews": interview_update.matched_count > 0,
            "saved_to_session": session_update.matched_count > 0
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error saving full recording")
        raise HTTPException(status_code=500, detail=str(e))


class RecordingUploadFailure(BaseModel):
    interview_id: str
    link_id: Optional[str] = None


@router.post("/recording-upload-failure")
def record_recording_upload_failure(
    data: RecordingUploadFailure,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    session = _require_candidate_session(
        credentials,
        link_id=data.link_id,
        interview_id=data.interview_id,
        allow_completed=True,
    )
    interview_sessions_collection.update_one(
        {"_id": session["_id"]},
        {
            "$set": {
                "recording_upload_status": "failed",
                "recording_upload_failed_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    return {"status": "recorded"}


@router.get("/generate-report/{interview_id}")
def generate_report(
    interview_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    session = interview_sessions_collection.find_one({"interview_id": interview_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    _require_admin_session_access(session, current_admin)
    # Fetch interview data
    interview_data = interviews_collection.find_one({"id": interview_id})
    if not interview_data:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    source = interview_data.get("source")
    date = interview_data.get("created_at")
    profile_text = interview_data.get("profile_text")
    
    # Fetch Q&A data
    answers_cursor = answers_collection.find({"interview_id": interview_id}).sort("question_id", 1)
    answers = [(a.get("question_text"), a.get("answer_text"), a.get("ai_score"), a.get("ai_feedback"), a.get("corrected_answer")) for a in answers_cursor]
    
    # Generate PDF
    pdf_filename = f"Interview_Report_{interview_id}.pdf"
    file_path = os.path.join(UPLOAD_FOLDER, pdf_filename)
    
    doc = SimpleDocTemplate(file_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = styles['Title']
    story.append(Paragraph(f"Interview Report", title_style))
    story.append(Spacer(1, 12))
    
    # Meta Info
    normal_style = styles['Normal']
    story.append(Paragraph(f"<b>Interview ID:</b> {interview_id}", normal_style))
    story.append(Paragraph(f"<b>Date:</b> {format_datetime_for_display(date)}", normal_style))
    story.append(Paragraph(f"<b>Source:</b> {source}", normal_style))
    story.append(Spacer(1, 12))
    
    # Fetch session record to reuse the average score already stored in the DB (includes blended scores)
    link_id = interview_data.get("link_id")
    session_rec = interview_sessions_collection.find_one({"link_id": link_id}) if link_id else None
    if not session_rec:
        session_rec = interview_sessions_collection.find_one({"interview_id": interview_id})
    avg_score = session_rec.get("avg_score") if session_rec else None
    
    # Calculate Average Score (Fallback if not populated in session document)
    if avg_score is None and answers:
        scores = [row[2] for row in answers if row[2] is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        
    if avg_score is not None:
        # Color code overall score
        color = "green" if avg_score >= 60 else "orange" if avg_score >= 40 else "red"
        story.append(Paragraph(f"<b>Overall Score:</b> <font color='{color}' size='14'>{avg_score:.1f}/100</font>", normal_style))
    else:
        story.append(Paragraph("<b>Overall Score:</b> N/A", normal_style))
    
    story.append(Spacer(1, 20))
    
    # Q&A Details
    for i, row in enumerate(answers):
        q_text, a_text, score, feedback, verified_answer = row
        
        # Question Header
        story.append(Paragraph(f"<b>Q{i+1}: {q_text}</b>", styles['Heading3']))
        story.append(Spacer(1, 5))
        
        # Your Answer
        a_text_disp = a_text if a_text else "(No answer recorded)"
        story.append(Paragraph(f"<b>Your Answer:</b> {a_text_disp}", normal_style))
        story.append(Spacer(1, 5))
        
        # AI Feedback & Score
        score_str = f"{score}/100" if score is not None else "N/A"
        feedback_str = feedback if feedback else "No feedback provided."
        
        # Color score (Green > 60, Red < 60)
        score_color = "green" if (score and score >= 60) else "red"
        
        story.append(Paragraph(f"<b>Score:</b> <font color='{score_color}'><b>{score_str}</b></font>", normal_style))
        story.append(Paragraph(f"<b>Feedback:</b> {feedback_str}", normal_style))
        
        # Suggested Answer (if verified answer exists and is different/better)
        if verified_answer:
             story.append(Spacer(1, 5))
             story.append(Paragraph(f"<b>Suggested/Corrected Answer:</b>", normal_style))
             story.append(Paragraph(f"<i>{verified_answer}</i>", normal_style))
             
        story.append(Spacer(1, 15))
        story.append(Paragraph("<hr width='100%'/>", normal_style)) # Separator using simplified HR if supported or just lines
        # Reportlab doesn't support <hr> well in Paragraph, use drawing or character separator
        # story.append(Paragraph("_" * 80, normal_style)) 
        
        story.append(Spacer(1, 15))

    # ── AI EVALUATION & RECOMMENDATION ──
    if session_rec:
        recommendation = session_rec.get("overall_recommendation") or session_rec.get("recommendation")
        strengths = session_rec.get("strengths_summary")
        weaknesses = session_rec.get("weaknesses_summary")
        
        if recommendation or strengths or weaknesses:
            story.append(Spacer(1, 20))
            story.append(Paragraph("<b>AI Recommendation & Evaluation</b>", styles['Heading2']))
            story.append(Spacer(1, 10))
            
            if recommendation:
                story.append(Paragraph(f"<b>Recommendation:</b> {recommendation}", normal_style))
                story.append(Spacer(1, 5))
            if strengths:
                story.append(Paragraph("<b>Strengths:</b>", normal_style))
                safe_strengths = strengths.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
                story.append(Paragraph(safe_strengths, normal_style))
                story.append(Spacer(1, 5))
            if weaknesses:
                story.append(Paragraph("<b>Areas to Improve:</b>", normal_style))
                safe_weaknesses = weaknesses.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
                story.append(Paragraph(safe_weaknesses, normal_style))
                story.append(Spacer(1, 5))
            
            story.append(Spacer(1, 15))

    # ── CODING ROUND ──
    coding_round = interview_data.get("coding_round")
    if coding_round and (coding_round.get("latest_code") or coding_round.get("final_evaluation")):
        story.append(Spacer(1, 20))
        story.append(Paragraph("<b>Coding Round Results</b>", styles['Heading2']))
        story.append(Spacer(1, 10))
        
        if coding_round.get("latest_code"):
            story.append(Paragraph("<b>Submitted Code:</b>", normal_style))
            safe_code = coding_round["latest_code"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            
            code_style = ParagraphStyle(
                'Code', parent=normal_style, fontName='Courier', fontSize=9, 
                leading=11, backColor='#f4f4f4', borderPadding=5, borderRadius=3
            )
            story.append(Paragraph(safe_code, code_style))
            story.append(Spacer(1, 15))
            
        if coding_round.get("final_evaluation"):
            story.append(Paragraph("<b>AI Evaluation:</b>", normal_style))
            eval_data = coding_round["final_evaluation"]
            eval_text = json.dumps(eval_data, indent=2) if isinstance(eval_data, dict) else str(eval_data)
            safe_eval = eval_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            story.append(Paragraph(safe_eval, normal_style))
            story.append(Spacer(1, 15))
            
    # ── CASE STUDY ROUND ──
    case_study = interview_data.get("case_study_round")
    if case_study and case_study.get("answers"):
        story.append(Spacer(1, 20))
        story.append(Paragraph("<b>Case Study Round Results</b>", styles['Heading2']))
        story.append(Spacer(1, 10))
        
        questions = case_study.get("questions", [])
        for i, ans in enumerate(case_study.get("answers", [])):
            if ans is None:
                continue
            
            q_text = questions[i].get("text", f"Question {i+1}") if i < len(questions) else f"Question {i+1}"
            story.append(Paragraph(f"<b>Q{i+1}: {q_text}</b>", styles['Heading3']))
            story.append(Spacer(1, 5))
            
            a_text = ans.get("answer_text", "")
            if a_text:
                a_text_disp = a_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
            else:
                a_text_disp = "(No answer recorded)"
                
            story.append(Paragraph(f"<b>Your Answer:</b> {a_text_disp}", normal_style))
            story.append(Spacer(1, 15))

    doc.build(story)
    
    # Return the PDF file directly for download
    return FileResponse(
        path=file_path,
        filename=pdf_filename,
        media_type="application/pdf"
    )

# --------------------------------------------------------------------------------
# ADMIN & SESSION MANAGEMENT APIs
# --------------------------------------------------------------------------------

@router.post("/admin/preview-email")
def preview_email(data: EmailPreviewRequest, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    """Return the default email HTML for admin to edit before sending."""
    return {
        "html": build_default_interview_email_html(
            candidate_name=data.candidate_name,
            duration=data.duration,
            job_description=data.job_description,
            full_link="{{INTERVIEW_LINK}}",
            scheduled_start=data.scheduled_start,
            scheduled_end=data.scheduled_end
        )
    }


# ── Task 3: Submission Notification Email ────────────────────────────────────
def preview_email_v2(data: EmailPreviewRequest):
    return {
        "html": build_default_interview_email_html(
            candidate_name=data.candidate_name,
            duration=data.duration,
            job_description=data.job_description,
            full_link="{{INTERVIEW_LINK}}",
            scheduled_start=data.scheduled_start,
            scheduled_end=data.scheduled_end
        )
    }

for _route in router.routes:
    if getattr(_route, "path", "") == "/admin/preview-email" and "POST" in getattr(_route, "methods", set()):
        _route.endpoint = preview_email_v2
        break
def send_submission_notification(candidate_email: str, candidate_name: str, admin_email: str, avg_score: float, total_questions: int, company_name: str = 'HireIQ'):
    """Send test submission notification to both admin and candidate."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email_addr = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key:
        return False

    # Email to candidate
    candidate_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="background: linear-gradient(135deg, #000033 0%, #003366 100%); padding: 32px 40px; text-align: left; border-bottom: 1px solid #e5e7eb;">
                            <img src="https://raw.githubusercontent.com/OragantiSagar041/AI_Adaptive_Interview/pavan/Front-end/public/hireiq_new_logo.png" alt="HireIQ" style="height: 110px; max-width: 100%; display: inline-block; object-fit: contain;" />
                        </td>
                    </tr>
                    <tr><td style="padding: 40px;">
                        <h2 style="color: #202124; font-size: 20px; font-weight: 400; margin: 0 0 24px 0;">Interview Submitted Successfully &ndash; {company_name.title()}</h2>
                        <p style="color: #3c4043; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Dear {candidate_name},</p>
                        <p style="color: #3c4043; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Thank you for completing your AI-powered interview. Your responses have been successfully submitted and are now being reviewed.
                        </p>
                        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
                            <p style="margin: 0; color: #5f6368; font-size: 15px; line-height: 1.6;">
                                <strong>Questions Answered:</strong> {total_questions}
                            </p>
                        </div>
                        <p style="color: #3c4043; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Our recruitment team will review your performance and get back to you shortly. Please keep an eye on your email for further updates.
                        </p>
                        <p style="color: #3c4043; font-size: 15px; line-height: 1.6; margin: 32px 0 0 0;">
                            Best regards,<br><strong>HIREIQ Recruiting Team</strong>
                        </p>
                    </td></tr>
                    <tr><td style="background-color: #f1f3f4; padding: 24px 40px; text-align: center;">
                        <p style="color: #5f6368; font-size: 12px; line-height: 1.5; margin: 0;">&copy; 2026 HireIQ. All rights reserved.</p>
                    </td></tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>
    """

    # Email to admin
    score_color = "#137333" if avg_score >= 60 else "#c5221f"
    admin_html = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; padding: 40px 20px;">
            <tr><td align="center">
                <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #dadce0; border-radius: 8px; overflow: hidden;">
                    <tr>
                        <td style="background: linear-gradient(135deg, #000033 0%, #003366 100%); padding: 32px 40px; text-align: left; border-bottom: 1px solid #e5e7eb;">
                            <img src="https://raw.githubusercontent.com/OragantiSagar041/AI_Adaptive_Interview/pavan/Front-end/public/hireiq_new_logo.png" alt="HireIQ" style="height: 110px; max-width: 100%; display: inline-block; object-fit: contain;" />
                        </td>
                    </tr>
                    <tr><td style="padding: 40px;">
                        <h2 style="color: #202124; font-size: 20px; font-weight: 400; margin: 0 0 24px 0;">New Interview Submission</h2>
                        <p style="color: #3c4043; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">A candidate has just completed their interview assessment:</p>
                        
                        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
                            <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 15px; color: #3c4043;">
                                <tr>
                                    <td width="140"><strong>Candidate:</strong></td>
                                    <td>{candidate_name}</td>
                                </tr>
                                <tr>
                                    <td><strong>Email:</strong></td>
                                    <td>{candidate_email}</td>
                                </tr>
                                <tr>
                                    <td><strong>Questions:</strong></td>
                                    <td>{total_questions}</td>
                                </tr>
                                <tr>
                                    <td><strong>Est. Score:</strong></td>
                                    <td><strong style="color: {score_color};">{avg_score:.1f}%</strong></td>
                                </tr>
                            </table>
                        </div>
                        
                        <p style="color: #3c4043; font-size: 15px; line-height: 1.6; margin: 32px 0 0 0;">
                            Please log in to the HireIQ admin dashboard to review the detailed performance report and recordings.
                        </p>
                    </td></tr>
                    <tr><td style="background-color: #f1f3f4; padding: 24px 40px; text-align: center;">
                        <p style="color: #5f6368; font-size: 12px; line-height: 1.5; margin: 0;">&copy; 2026 HireIQ Platform Notifications</p>
                    </td></tr>
                </table>
            </td></tr>
        </table>
    </body>
    </html>
    """

    results = []
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {"api-key": api_key, "content-type": "application/json"}

    # Send to candidate
    try:
        res = requests.post(url, json={
            "sender": {"name": sender_name, "email": sender_email_addr},
            "to": [{"email": candidate_email, "name": candidate_name}],
            "subject": "Your Interview Has Been Submitted — HireIQ",
            "htmlContent": candidate_html
        }, headers=headers, timeout=10)
        results.append(res.status_code < 300)
    except Exception:
        results.append(False)

    # Send to admin
    if admin_email:
        try:
            res = requests.post(url, json={
                "sender": {"name": sender_name, "email": sender_email_addr},
                "to": [{"email": admin_email, "name": "Admin"}],
                "subject": f"Interview Submitted: {candidate_name}",
                "htmlContent": admin_html
            }, headers=headers, timeout=10)
            results.append(res.status_code < 300)
        except Exception:
            results.append(False)

    return all(results)


# ── Task 8: Dashboard Stats Endpoint ────────────────────────────────────────
@router.get("/admin/dashboard-stats")
async def get_dashboard_stats(admin_id: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return aggregated stats for the admin dashboard."""
    from app.db.redis_manager import manager
    import json
    
    # Try cache first
    cache_key = f"dashboard_stats:{current_admin.get('company_id')}:{current_admin.get('admin_id')}:{admin_id or 'none'}"
    if manager.redis:
        cached = await manager.redis.get(cache_key)
        if cached:
            return json.loads(cached)
    else:
        cached = _LOCAL_DASHBOARD_CACHE.get(cache_key)
        if cached and time.monotonic() - cached[0] < _LOCAL_DASHBOARD_CACHE_TTL:
            return cached[1]

    try:
        comp_id = current_admin.get("company_id")
        query = {}
        if current_admin.get("role") != "master":
            query["company_id"] = comp_id
        
        def safe_object_id(val):
            try:
                from bson.errors import InvalidId
                return ObjectId(val)
            except Exception:
                return val
                
        if current_admin.get("role") == "admin":
            admin_doc = await asyncio.to_thread(
                admins_collection.find_one, {"_id": safe_object_id(current_admin["admin_id"])}
            )
            credits = admin_doc.get("credits", 0) if admin_doc else 0
        elif comp_id:
            # super_admin and master: use company credits (sessions deduct from company pool)
            company = await asyncio.to_thread(companies_collection.find_one, {"_id": safe_object_id(comp_id)})
            credits = company.get("credits", 0) if company else 0
        else:
            credits = 0
        
        # Data Isolation:
        # If the user is a standard admin, force the query to their own admin_id
        if current_admin.get("role") == "admin":
            query["created_by"] = current_admin["admin_id"]
        elif current_admin.get("role") in ["super_admin", "superadmin"] and not admin_id:
            query["created_by"] = {"$in": _get_authorized_creator_ids(current_admin)}
        # If the user is a super admin and requested a specific admin's data, filter by it
        elif admin_id:
            if current_admin.get("role") in ["super_admin", "superadmin"]:
                allowed_ids = _get_authorized_creator_ids(current_admin)
                if admin_id not in allowed_ids:
                    raise HTTPException(status_code=403, detail="Not authorized to view this admin's data")
            query["created_by"] = admin_id
            
        now = datetime.now(timezone.utc)
        from datetime import timedelta
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc).isoformat()
        yesterday_start = (datetime(now.year, now.month, now.day, tzinfo=timezone.utc) - timedelta(days=1)).isoformat()
        week_start = (now - timedelta(days=7)).isoformat()
        active_query = {
            **query,
            "is_deactivated": {"$ne": True},
        }
        dashboard_pipeline = [
            {"$match": active_query},
            {"$set": {
                "effective_status": {
                    "$cond": [
                        {"$and": [
                            {"$eq": ["$status", "pending"]},
                            {"$ne": [{"$ifNull": ["$expires_at", None]}, None]},
                            {"$lt": ["$expires_at", now.isoformat()]},
                        ]},
                        "expired",
                        "$status",
                    ]
                }
            }},
            {"$facet": {
                "summary": [{"$group": {
                    "_id": None,
                    "total": {"$sum": 1},
                    "completed": {"$sum": {"$cond": [{"$eq": ["$effective_status", "completed"]}, 1, 0]}},
                    "started": {"$sum": {"$cond": [{"$eq": ["$effective_status", "started"]}, 1, 0]}},
                    "expired": {"$sum": {"$cond": [{"$eq": ["$effective_status", "expired"]}, 1, 0]}},
                    "selected": {"$sum": {"$cond": [{"$eq": ["$decision", "selected"]}, 1, 0]}},
                    "rejected": {"$sum": {"$cond": [{"$eq": ["$decision", "rejected"]}, 1, 0]}},
                    "total_score": {"$sum": {"$ifNull": ["$avg_score", 0]}},
                    "scored_count": {"$sum": {"$cond": [{"$ne": [{"$ifNull": ["$avg_score", None]}, None]}, 1, 0]}},
                    "today": {"$sum": {"$cond": [{"$gte": ["$created_at", today_start]}, 1, 0]}},
                    "this_week": {"$sum": {"$cond": [{"$gte": ["$created_at", week_start]}, 1, 0]}},
                    "candidate_emails": {"$addToSet": {"$toLower": {"$ifNull": ["$candidate_email", "$email"]}}},
                    "completed_today": {"$sum": {"$cond": [{"$and": [{"$eq": ["$effective_status", "completed"]}, {"$gte": ["$created_at", today_start]}]}, 1, 0]}},
                    "completed_yesterday": {"$sum": {"$cond": [{"$and": [{"$eq": ["$effective_status", "completed"]}, {"$gte": ["$created_at", yesterday_start]}, {"$lt": ["$created_at", today_start]}]}, 1, 0]}},
                    "selected_today": {"$sum": {"$cond": [{"$and": [{"$eq": ["$decision", "selected"]}, {"$gte": ["$created_at", today_start]}]}, 1, 0]}},
                    "selected_yesterday": {"$sum": {"$cond": [{"$and": [{"$eq": ["$decision", "selected"]}, {"$gte": ["$created_at", yesterday_start]}, {"$lt": ["$created_at", today_start]}]}, 1, 0]}},
                    "rejected_today": {"$sum": {"$cond": [{"$and": [{"$eq": ["$decision", "rejected"]}, {"$gte": ["$created_at", today_start]}]}, 1, 0]}},
                    "rejected_yesterday": {"$sum": {"$cond": [{"$and": [{"$eq": ["$decision", "rejected"]}, {"$gte": ["$created_at", yesterday_start]}, {"$lt": ["$created_at", today_start]}]}, 1, 0]}},
                    "expired_today": {"$sum": {"$cond": [{"$and": [{"$eq": ["$effective_status", "expired"]}, {"$gte": ["$created_at", today_start]}]}, 1, 0]}},
                    "expired_yesterday": {"$sum": {"$cond": [{"$and": [{"$eq": ["$effective_status", "expired"]}, {"$gte": ["$created_at", yesterday_start]}, {"$lt": ["$created_at", today_start]}]}, 1, 0]}},
                }}],
                "by_creator": [{"$group": {"_id": "$created_by", "count": {"$sum": 1}}}],
                "daily": [
                    {"$match": {"created_at": {"$gte": week_start, "$type": "string"}}},
                    {"$group": {"_id": {"$substrBytes": ["$created_at", 0, 10]}, "count": {"$sum": 1}}},
                ],
            }},
        ]
        try:
            aggregate_rows = await asyncio.to_thread(
                lambda: list(interview_sessions_collection.aggregate(dashboard_pipeline))
            )
            aggregate_data = aggregate_rows[0] if aggregate_rows else {}
        except Exception as e:
            print(f"Dashboard aggregation error: {e}")
            aggregate_data = {}
            
        summary = (aggregate_data.get("summary") or [{}])[0]
        total = summary.get("total", 0)
        completed = summary.get("completed", 0)
        started = summary.get("started", 0)
        expired = summary.get("expired", 0)
        pending = max(0, total - completed - started - expired)
        selected = summary.get("selected", 0)
        rejected = summary.get("rejected", 0)
        total_score = summary.get("total_score", 0)
        scored_count = summary.get("scored_count", 0)
        today_count = summary.get("today", 0)
        week_count = summary.get("this_week", 0)
        seen_emails = {email for email in summary.get("candidate_emails", []) if email}
        session_by_creator = {
            str(row.get("_id") or ""): row.get("count", 0)
            for row in aggregate_data.get("by_creator", [])
            if row.get("_id")
        }
        daily_counts = {
            row.get("_id"): row.get("count", 0)
            for row in aggregate_data.get("daily", [])
            if row.get("_id")
        }
                
        # Merge stats from AI Calling interested candidates
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if current_admin.get("role") == "admin":
                jobs_query["admin_id"] = current_admin["admin_id"]
            elif current_admin.get("role") in ["super_admin", "superadmin"]:
                jobs_query["admin_id"] = {"$in": _get_authorized_creator_ids(current_admin)}
            jobs = await asyncio.to_thread(lambda: list(jobs_collection.find(jobs_query)))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"}
            }
            apps = await asyncio.to_thread(
                lambda: list(job_applications_collection.find(
                    app_query,
                    {"email": 1, "score": 1, "applied_at": 1, "updated_at": 1},
                ))
            )
            
            for app in apps:
                email = app.get("email")
                if email:
                    email_lower = email.strip().lower()
                    if email_lower in seen_emails:
                        continue
                    seen_emails.add(email_lower)
                
                total += 1
                completed += 1
                selected += 1
                
                score = app.get("score")
                if score is not None:
                    total_score += score
                    scored_count += 1
                    
                try:
                    created_str = app.get("applied_at") or app.get("updated_at")
                    if created_str:
                        created = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                        if created.tzinfo is None:
                            created = created.replace(tzinfo=timezone.utc)
                        if created.date() == now.date():
                            today_count += 1
                        if (now - created).days <= 7:
                            week_count += 1
                except Exception:
                    pass
        except Exception as e:
            print(f"Error merging AI Calling stats: {e}")
        
        avg_score = round(total_score / scored_count, 1) if scored_count > 0 else 0
        
        # Super Admin metrics
        recruiters_count = 0
        chart_labels = []
        chart_data = []
        admin_labels = []
        admin_data = []
        credits_used = 0
        credits_available = credits

        if comp_id:
            # 1. Recruiters Count
            recruiters_count = await asyncio.to_thread(
                admins_collection.count_documents, {"company_id": comp_id, "role": "admin"}
            )
            
            # 2. Last 7 Days Usage
            for i in range(6, -1, -1):
                day = now - timedelta(days=i)
                start_of_day = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
                count = daily_counts.get(start_of_day.date().isoformat(), 0)
                chart_labels.append(day.strftime("%m/%d"))
                chart_data.append(count)
                
            # Sessions with created_by='admin' (frontend fallback string) are attributed to the current admin
            if "admin" in session_by_creator:
                session_by_creator[current_admin["admin_id"]] = (
                    session_by_creator.get(current_admin["admin_id"], 0) + session_by_creator.pop("admin")
                )

            # Load all admins in this company and map each to their session count
            all_company_admins = await asyncio.to_thread(
                lambda: list(admins_collection.find(
                    {"company_id": comp_id},
                    {"_id": 1, "name": 1, "username": 1, "email": 1},
                ))
            )
            seen_admin_ids = set()
            for a in all_company_admins:
                aid = str(a["_id"])
                if aid in seen_admin_ids:
                    continue
                seen_admin_ids.add(aid)
                name = a.get("name") or a.get("username") or "Admin"
                # Try ObjectId string first, then username, then email as fallbacks
                count = session_by_creator.get(aid, 0)
                if count == 0 and a.get("username"):
                    count = session_by_creator.get(a["username"], 0)
                if count == 0 and a.get("email"):
                    count = session_by_creator.get(a["email"], 0)
                admin_labels.append(name)
                admin_data.append(count)

            # 4. Credits Used vs Available
            # Each interview session costs exactly 1 credit (deducted atomically at creation).
            # credits_used = total non-deactivated sessions for this company.
            credits_used = await asyncio.to_thread(
                interview_sessions_collection.count_documents,
                {"company_id": comp_id, "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]},
            )

        stats = {
            "total": total,
            "pending": pending,
            "completed": completed,
            "started": started,
            "expired": expired,
            "selected": selected,
            "rejected": rejected,
            "avg_score": avg_score,
            "today": today_count,
            "this_week": week_count,
            "credits": credits,
            "credits_available": credits_available,
            "credits_used": credits_used,
            "recruiters_count": recruiters_count,
            "chart_labels": chart_labels,
            "chart_data": chart_data,
            "admin_labels": admin_labels,
            "admin_data": admin_data
        }

        def calc_trend(today_val, yesterday_val):
            if yesterday_val == 0:
                return 100.0 if today_val > 0 else 0.0
            return round(((today_val - yesterday_val) / yesterday_val) * 100, 1)

        stats["completed_trend"] = calc_trend(summary.get("completed_today", 0), summary.get("completed_yesterday", 0))
        stats["selected_trend"] = calc_trend(summary.get("selected_today", 0), summary.get("selected_yesterday", 0))
        stats["rejected_trend"] = calc_trend(summary.get("rejected_today", 0), summary.get("rejected_yesterday", 0))
        stats["expired_trend"] = calc_trend(summary.get("expired_today", 0), summary.get("expired_yesterday", 0))
        
        if manager.redis:
            await manager.redis.setex(cache_key, 30, json.dumps(stats))
        else:
            _LOCAL_DASHBOARD_CACHE[cache_key] = (time.monotonic(), stats)
            if len(_LOCAL_DASHBOARD_CACHE) > 100:
                oldest_key = min(_LOCAL_DASHBOARD_CACHE, key=lambda key: _LOCAL_DASHBOARD_CACHE[key][0])
                _LOCAL_DASHBOARD_CACHE.pop(oldest_key, None)
            
        return stats
    except Exception as e:
        return {"error": str(e)}


# ── Task 2: Export Sessions Data Endpoint ───────────────────────────────────
@router.get("/admin/export-sessions")
def export_sessions(current_admin: dict = Depends(get_current_admin_details), status_filter: str = ""):
    """Return session data for Excel export, filtered by status."""
    admin_id = current_admin["admin_id"]
    company_id = current_admin.get("company_id")
    require_admin_capability(
        admin_id,
        "export_sessions",
        "Session export is available on Basic and Advance plans only.",
    )
    query = {"company_id": company_id}
    
    # Data Isolation
    if current_admin.get("role") == "admin":
        query["created_by"] = admin_id
    elif current_admin.get("role") in ["super_admin", "superadmin"]:
        query["created_by"] = {"$in": _get_authorized_creator_ids(current_admin)}
    rows = list(interview_sessions_collection.find(query).sort("created_at", -1))
    now = datetime.now(timezone.utc)
    
    export_data = []
    for row in rows:
        current_status = sync_session_status(row, now)
        
        decision = row.get("decision", "")
        
        # Apply status filter
        if status_filter:
            if status_filter == "selected" and decision != "selected":
                continue
            elif status_filter == "rejected" and decision != "rejected":
                continue
            elif status_filter in ["pending", "completed", "started", "expired"] and current_status != status_filter:
                continue
        
        export_data.append({
            "candidate_id": row.get("candidate_id", ""),
            "candidate_name": row.get("candidate_name", ""),
            "candidate_email": row.get("candidate_email", ""),
            "status": current_status,
            "decision": decision or "Pending Review",
            "score": row.get("avg_score", ""),
            "recommendation": row.get("overall_recommendation", ""),
            "interview_duration": row.get("interview_duration", 30),
            "created_at": row.get("created_at", ""),
            "expires_at": row.get("expires_at", "")
        })
    
    return {"data": export_data}

# Redundant v2 removed as v1 unified above.

def process_pending_invitation_emails():
    now = datetime.now(timezone.utc).isoformat()
    due_sessions = list(interview_sessions_collection.find({
        "invite_email_status": {"$in": ["pending", "failed"]},
        "invite_email_send_at": {"$lte": now}
    }).limit(25))

    for session in due_sessions:
        claimed = interview_sessions_collection.update_one(
            {"_id": session["_id"], "invite_email_status": {"$in": ["pending", "failed"]}},
            {"$set": {"invite_email_status": "sending"}}
        )
        if claimed.modified_count == 0:
            continue

        link_url = f"{FRONTEND_URL}/interview?session_id={session['link_id']}"
        sent = send_interview_email(
            candidate_email=session.get("candidate_email", ""),
            candidate_name=session.get("candidate_name", ""),
            link_url=link_url,
            duration=session.get("interview_duration", 30),
            job_description=session.get("job_description", ""),
            custom_html=session.get("custom_email_html", ""),
            scheduled_start=session.get("scheduled_start", ""),
            scheduled_end=session.get("scheduled_end", "")
        )

        interview_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {
                "invite_email_status": "sent" if sent else "failed",
                "invite_email_sent_at": datetime.now(timezone.utc).isoformat() if sent else None
            }}
        )

def invitation_email_scheduler_loop():
    while True:
        try:
            process_pending_invitation_emails()
        except Exception as e:
            print(f"Email scheduler error: {e}")
        time.sleep(30)


        EMAIL_SCHEDULER_STARTED = True

@router.get("/api/interview/{interview_id}/insights")
def get_interview_insights(
    interview_id: str,
    current_admin: dict = Depends(get_current_admin_details),
):
    session = interview_sessions_collection.find_one({"interview_id": interview_id})
    if not session:
        raise HTTPException(status_code=404, detail="Interview session not found")
    _require_admin_session_access(session, current_admin)
    answers = list(answers_collection.find({"interview_id": interview_id}))
    
    if not answers:
        return {
            "clarity": 50,
            "technicalDepth": 50,
            "confidence": 50
        }
        
    scored_answers = [a for a in answers if a.get("scoring_status") == "complete"]
    
    if not scored_answers:
         return {
            "clarity": 50,
            "technicalDepth": 50,
            "confidence": 50
        }
        
    total_clarity = sum(a.get("clarity_score", 50) for a in scored_answers)
    total_technical = sum(a.get("technical_depth_score", 50) for a in scored_answers)
    total_confidence = sum(a.get("confidence_score", 50) for a in scored_answers)
    
    count = len(scored_answers)
    
    return {
        "clarity": round(total_clarity / count),
        "technicalDepth": round(total_technical / count),
        "confidence": round(total_confidence / count)
    }

@router.post("/admin/forgot-password")
def forgot_password(data: ForgotPasswordRequest):
    user = admins_collection.find_one({"username": data.username, "email": data.email})
    if not user:
        raise HTTPException(status_code=404, detail="Username and email do not match our records.")
    
    otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
    expiry = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
    
    admins_collection.update_one({"_id": user["_id"]}, {"$set": {"otp": otp, "otp_expiry": expiry, "otp_attempts": 0}})
    
    # Send OTP email
    email_sent = send_otp_email(data.email, data.username, otp)
    if email_sent:
        return {"status": "success", "message": "OTP sent to your registered email."}
    else:
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again later.")

@router.post("/admin/verify-otp")
def verify_otp(data: VerifyOTPRequest):
    row = admins_collection.find_one({"username": data.username})
    if not row or not row.get("otp"):
        raise HTTPException(status_code=400, detail="No OTP found for this user.")
    
    db_otp = row.get("otp")
    expiry_str = row.get("otp_expiry")
    attempts = row.get("otp_attempts", 0)
    
    if attempts >= 5:
        admins_collection.update_one({"_id": row["_id"]}, {"$unset": {"otp": "", "otp_expiry": "", "otp_attempts": ""}})
        raise HTTPException(status_code=403, detail="Maximum OTP attempts exceeded. Please request a new OTP.")
        
    if db_otp != data.otp:
        admins_collection.update_one({"_id": row["_id"]}, {"$inc": {"otp_attempts": 1}})
        raise HTTPException(status_code=401, detail="Invalid OTP code.")
    
    expiry = datetime.fromisoformat(expiry_str)
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=401, detail="OTP has expired.")
    
    return {"status": "success", "message": "OTP verified successfully."}

@router.post("/admin/reset-password")
def reset_password(data: ResetPasswordRequest):
    # Verify OTP one last time for safety
    row = admins_collection.find_one({"username": data.username})
    if not row:
        raise HTTPException(status_code=401, detail="Invalid session. Please restart the process.")
        
    attempts = row.get("otp_attempts", 0)
    if attempts >= 5:
        admins_collection.update_one({"_id": row["_id"]}, {"$unset": {"otp": "", "otp_expiry": "", "otp_attempts": ""}})
        raise HTTPException(status_code=403, detail="Maximum OTP attempts exceeded. Please request a new OTP.")
        
    if row.get("otp") != data.otp:
        admins_collection.update_one({"_id": row["_id"]}, {"$inc": {"otp_attempts": 1}})
        raise HTTPException(status_code=401, detail="Invalid session. Please restart the process.")
    
    expiry = datetime.fromisoformat(row.get("otp_expiry"))
    if datetime.now(timezone.utc) > expiry:
        raise HTTPException(status_code=401, detail="Session expired.")
    
    hashed_pw = hash_password(data.new_password)
    admins_collection.update_one({"_id": row["_id"]}, {"$set": {"password": hashed_pw}, "$unset": {"otp": "", "otp_expiry": "", "otp_attempts": ""}})
    
    return {"status": "success", "message": "Password updated successfully. You can now login."}

def send_otp_email(email: str, name: str, otp: str):
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    
    if not api_key: return False

    html = f"""
    <html><body>
        <h3>Password Reset Request</h3>
        <p>Dear {name},</p>
        <p>You requested to reset your admin password. Please use the following One-Time Password (OTP) to proceed:</p>
        <h2 style='color: #6366f1; letter-spacing: 5px; font-size: 2rem;'>{otp}</h2>
        <p>This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <p>Best Regards,<br/>Hire IQ</p>
    </body></html>
    """

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": name}],
        "subject": "Admin Password Reset OTP",
        "htmlContent": html
    }
    
    try:
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {"accept": "application/json", "api-key": api_key, "content-type": "application/json"}
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        return response.status_code < 300
    except:
        return False


    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@router.get("/api/admin/profile")
@router.get("/admin/profile")
def get_admin_profile(current_admin: dict = Depends(get_current_admin_details)):
    admin_id = current_admin.get("admin_id")
    try:
        admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)}, {"password": 0})
    except Exception:
        admin_doc = admins_collection.find_one({"_id": admin_id}, {"password": 0})
        
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Admin not found")
        
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
    admin_doc["subscription_plan"] = plan_context["plan_label"]
    admin_doc["plan_features"] = plan_context["features"]
    admin_doc["features"] = plan_context["features"]
    admin_doc["capabilities"] = plan_context["capabilities"]
    admin_doc["days_remaining"] = plan_context.get("days_remaining")
    admin_doc["subscription_start"] = plan_context.get("subscription_start")
    admin_doc["subscription_expiry"] = plan_context.get("subscription_expiry")
    admin_doc["layout_config"] = plan_context.get("layout_config")
    admin_doc["branding"] = plan_context.get("branding")
            
    return admin_doc

@router.post("/admin/profile")
def update_profile(data: UpdateProfileRequest, current_admin: str = Depends(get_current_admin)):
    try:
        from bson import ObjectId
        
        admin_id_obj = ObjectId(str(data.admin_id))
        admin = admins_collection.find_one({"_id": admin_id_obj})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
            
        update_fields = {}
        now_iso = datetime.now(timezone.utc).isoformat()
        update_fields["updated_at"] = now_iso
        
        if data.old_password and data.new_password:
            if not verify_password(data.old_password, admin["password"]):
                raise HTTPException(status_code=400, detail="Incorrect old password")
            update_fields["password"] = hash_password(data.new_password)
            
        if data.email:
            update_fields["email"] = data.email
        if data.username:
            update_fields["username"] = data.username
            update_fields["name"] = data.username
        if data.company_name:
            update_fields["company_name"] = data.company_name
            
        if len(update_fields) <= 1:  # only updated_at
            return {"status": "success", "message": "No changes made."}
            
        admins_collection.update_one({"_id": admin_id_obj}, {"$set": update_fields})
        
        # Sync company collection if company_id is associated with this admin
        if admin.get("company_id"):
            company_update = {"updated_at": now_iso}
            if data.company_name:
                company_update["name"] = data.company_name
            if data.email:
                company_update["email"] = data.email
            if len(company_update) > 1:
                try:
                    companies_collection.update_one(
                        {"_id": ObjectId(str(admin["company_id"]))},
                        {"$set": company_update}
                    )
                except Exception as comp_err:
                    print(f"Error syncing company record: {comp_err}")
        
        # Broadcast updated profile details
        admin_doc = admins_collection.find_one({"_id": admin_id_obj})
        if admin_doc:
            broadcast_profile_update(
                admin_id=str(admin_id_obj),
                company_id=str(admin_doc.get("company_id") or ""),
                credits=admin_doc.get("credits"),
                login_enabled=admin_doc.get("login_enabled"),
                extra={
                    "name": admin_doc.get("name"),
                    "username": admin_doc.get("username"),
                    "email": admin_doc.get("email"),
                    "company_name": admin_doc.get("company_name")
                }
            )
        
        # Remove password from response if present
        if "password" in update_fields:
            del update_fields["password"]
            
        return {
            "status": "success", 

            "message": "Profile updated successfully.",
            "updated_fields": update_fields
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

@router.post("/api/master/profile/image")
@router.post("/master/profile/image")
@router.post("/api/superadmin/profile/image")
@router.post("/superadmin/profile/image")
@router.post("/api/admin/profile/image")
@router.post("/admin/profile/image")
def upload_profile_image(
    admin_id: str = Form(...),
    file: UploadFile = File(...),
    current_admin: dict = Depends(get_current_admin_details)
):
    try:
        from bson import ObjectId
        admin_id_obj = ObjectId(admin_id)
        admin = admins_collection.find_one({"_id": admin_id_obj})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
            
        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload(
                file.file,
                folder="profile_images",
                resource_type="image"
            )
            secure_url = upload_result.get("secure_url")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")
            
        # Update db
        admins_collection.update_one(
            {"_id": admin_id_obj},
            {"$set": {"profile_image": secure_url, "avatar": secure_url}}
        )
        
        # Broadcast updated profile image
        broadcast_profile_update(
            admin_id=str(admin_id_obj),
            company_id=str(admin.get("company_id") or ""),
            credits=admin.get("credits"),
            login_enabled=admin.get("login_enabled"),
            extra={"profile_image": secure_url, "avatar": secure_url}
        )
        
        return {
            "status": "success",
            "profile_image": secure_url,
            "avatar": secure_url
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

def extract_info_from_resume(text: str) -> Dict:
    import re
    email = ""
    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    if email_match:
        email = email_match.group(0).strip()

    phone = ""
    phone_match = re.search(r'(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}', text)
    if phone_match:
        phone_candidate = phone_match.group(0).strip()
        if len(re.sub(r'\D', '', phone_candidate)) >= 7:
            phone = phone_candidate

    linkedin_url = ""
    linkedin_match = re.search(r'(https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_-]+)', text, re.IGNORECASE)
    if linkedin_match:
        linkedin_url = linkedin_match.group(0).strip()
    else:
        linkedin_simple = re.search(r'(linkedin\.com/in/[a-zA-Z0-9_-]+)', text, re.IGNORECASE)
        if linkedin_simple:
            linkedin_url = f"https://{linkedin_simple.group(0).strip()}"

    name = ""
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    skip_keywords = {"resume", "curriculum", "vitae", "cv", "profile", "contact", "email", "phone", "summary", "experience", "education", "skills"}
    for line in lines[:10]:
        line_clean = re.sub(r'[^a-zA-Z\s]', '', line).strip()
        if line_clean and len(line_clean) < 50 and len(line_clean.split()) <= 4:
            words = [w.lower() for w in line_clean.split()]
            if not any(kw in words for kw in skip_keywords):
                name = line_clean
                break

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "linkedin_url": linkedin_url
    }

