"""
app/routes_split/coding_chat.py — Coding round chat
Auto-split from routes.py lines 11647–11879.
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

from app.routes.ai_calls import CodingChatRequest

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/coding-round/chat")
async def coding_round_chat(
    req: CodingChatRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Provide conversational AI responses during the coding round"""
    _require_candidate_session(credentials, interview_id=req.interview_id)
    try:
        # Load interview context
        interview = get_interview_or_404(req.interview_id)
        task = interview.get("coding_round", {}).get("task", {})
        problem_title = task.get("title", "the given problem")
        problem_desc  = task.get("description", "")
        constraints   = task.get("constraints", "")

        # ── Build run-result context ──────────────────────────────────────
        run_context = ""
        rr = req.run_result
        if rr:
            if rr.get("runtime_error"):
                run_context = f"""
## Last Run Result: EXECUTION ERROR
Error message: {rr['runtime_error']}
All test cases failed due to this error."""
            else:
                visible = rr.get("visible_results", [])
                hidden  = rr.get("hidden_summary", {})
                passed_v = sum(1 for r in visible if str(r.get("passed", "")).strip().lower() in {"true", "1", "yes", "y", "passed", "pass"})
                total_v  = len(visible)
                passed_h = hidden.get("passed", 0)
                total_h  = hidden.get("total", 0)
                all_passed = rr.get("all_passed", False)

                failed_cases = [r for r in visible if str(r.get("passed", "")).strip().lower() not in {"true", "1", "yes", "y", "passed", "pass"}]
                failed_details = ""
                for fc in failed_cases[:2]:   # Show max 2 failing examples
                    failed_details += f"  - Input: {fc.get('input')} | Got: {fc.get('output')} | Expected: {fc.get('expected')}\n"

                run_context = f"""
## Last Run Result
- Visible tests passed: {passed_v}/{total_v}
- Hidden tests passed:  {passed_h}/{total_h}
- Overall: {'ALL PASSED ✓' if all_passed else 'SOME FAILED ✗'}"""
                if failed_details:
                    run_context += f"\n- Failing examples:\n{failed_details}"

        # ── Build the system prompt ───────────────────────────────────────
        prompt = f"""You are Zara, a sharp but friendly AI coding interviewer at HireIQ.
You are conducting a live technical coding interview.

## Problem
Title: {problem_title}
Description: {problem_desc}
Constraints: {constraints}

## Candidate's Current Code
```
{req.code}
```
{run_context}

## Candidate Just Said
"{req.transcript}"

## Your Role as Zara
You must respond in 2-3 conversational sentences. Follow these rules strictly:
1. NEVER give full code solutions or write code for the candidate.
2. Ask probing questions about their implementation — "Why did you choose this data structure?", "What happens if the input is empty?", "Can you trace through your logic with this input?"
3. If there is a runtime error, guide them to the likely cause with a hint (not the fix).
4. If some test cases fail, point to a specific failing case and ask what they think is wrong.
5. If all tests pass, ask about time complexity, space complexity, or edge cases they haven't considered.
6. If they explain an approach, acknowledge it and ask a follow-up: "And how does that handle duplicates?" or "What's the worst-case here?"
7. If they seem stuck, give a targeted hint without revealing the solution.
8. Be encouraging — use phrases like "Good thinking!", "You're on the right track.", "Interesting approach."
9. Keep the conversation going — always end with a question or a call to action."""

        reply = await asyncio.to_thread(
            chat_completion,
            [{"role": "system", "content": prompt}],
            model="openai/gpt-4o-mini"
        )
        return {"reply": reply}
    except Exception as e:
        print(f"Coding Chat Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))



# ---------------------------------------------------------------------------
# Omni Dimension AI Calling Endpoints
# ---------------------------------------------------------------------------

class StartAICallRequest(BaseModel):
    phone_number: str

@router.post("/api/calls/start/{link_id}")
def start_ai_call(link_id: str, data: StartAICallRequest, current_admin: dict = Depends(get_current_admin_details)):
    # Find the candidate session
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Candidate session not found.")
    
    # Save the phone number if provided
    if data.phone_number:
        interview_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {"candidate_phone": data.phone_number}}
        )
    
    # Check if a call is already in progress
    if session.get("omni_call_id") and session.get("omni_call_status") not in ["completed", "failed"]:
        # We might want to check the actual status via API, but for now just prevent duplicates
        pass 
        
    try:
        # Start the call via Omni Dimension
        cq = session.get("custom_questions")
        if isinstance(cq, list):
            skills_str = ", ".join(cq)
        elif isinstance(cq, str):
            skills_str = ", ".join([q.strip() for q in cq.split('\n') if q.strip()])
        else:
            skills_str = ""

        response = omni_dimension_client.start_omni_call(
            phone_number=data.phone_number,
            candidate_name=session.get("candidate_name", ""),
            job_description=session.get("job_description", ""),
            resume_text=session.get("resume_text", ""),
            duration=session.get("interview_duration", 15),
            skills=skills_str
        )
        
        call_id = response.get("id") if hasattr(response, "get") else response.id
        
        # Update session with call metadata
        interview_sessions_collection.update_one(
            {"_id": session["_id"]},
            {"$set": {
                "omni_call_id": call_id,
                "omni_call_status": "initiated"
            }}
        )
        
        return {"status": "success", "call_id": call_id}
        
    except Exception as e:
        print(f"Error starting AI call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/status/{link_id}")
def get_ai_call_status(link_id: str, current_admin: dict = Depends(get_current_admin_details)):
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Candidate session not found.")
        
    call_id = session.get("omni_call_id")
    if not call_id:
        return {"status": "success", "call_status": "no_call"}
        
    try:
        # Fetch status from Omni Dimension
        response = omni_dimension_client.get_omni_call_status(call_id)
        
        call_status = response.get("status") if hasattr(response, "get") else response.status
        
        # Update MongoDB if status changed
        if call_status and call_status != session.get("omni_call_status"):
            update_data = {"omni_call_status": call_status}
            
            # If completed, we should also save the transcript/summary
            if call_status == "completed":
                transcript = response.get("transcript") if hasattr(response, "get") else getattr(response, "transcript", None)
                summary = response.get("summary") if hasattr(response, "get") else getattr(response, "summary", None)
                if transcript:
                    update_data["omni_call_transcript"] = transcript
                if summary:
                    update_data["omni_call_summary"] = summary
            
            interview_sessions_collection.update_one(
                {"_id": session["_id"]},
                {"$set": update_data}
            )
            
        return {"status": "success", "call_status": call_status, "data": response}
        
    except Exception as e:
        print(f"Error checking AI call status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ---------------------------------------------------------------------------
# Jobs & Applications (Super Admin / Public)
# ---------------------------------------------------------------------------

def verify_job_access(job: dict, current_admin: dict) -> bool:
    """
    Enforces multi-tenant isolation for job resources.
    Master role: Full global access.
    Super Admin / Admin: Restricted to their company, created_by, or linked super_admin_id.
    """
    role = current_admin.get("role")
    if role == "master":
        return True

    admin_id = current_admin.get("admin_id")
    company_id = current_admin.get("company_id")

    job_admin_id = job.get("admin_id")
    job_company_id = job.get("company_id")
    job_super_admin_id = job.get("super_admin_id")

    # 1. Direct creator or direct super_admin match
    if admin_id and (job_admin_id == admin_id or job_super_admin_id == admin_id):
        return True

    # 2. Company / Tenant match
    if company_id and job_company_id and job_company_id == company_id:
        return True

    # 3. Linked Sub-Admin to Super Admin check
    if role == "admin" and admin_id:
        try:
            from bson import ObjectId
            admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            if admin_doc:
                linked_sa = admin_doc.get("super_admin_id") or admin_doc.get("created_by")
                if linked_sa and (job_admin_id == linked_sa or job_super_admin_id == linked_sa):
                    return True
        except Exception:
            pass

    return False

