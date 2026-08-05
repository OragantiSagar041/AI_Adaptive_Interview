"""
app/routes_split/interview.py — Interview session, questions, coding
Auto-split from routes.py lines 565–2051.
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

@router.post("/generate-next-question")
def api_gen_next_question(
    req: NextQuestionRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    if not get_session(req.interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")
        
    interview = get_session(req.interview_id)
    followup_streak = interview.get("followup_streak", 0)

    # ── BUGFIX: Prevent Follow-ups from hijacking the interview ──
    # Find current question and evaluate skip conditions BEFORE calling the AI
    current_idx = -1
    for i, q in enumerate(interview["questions"]):
        if int(q["id"]) == req.current_question_id:
            current_idx = i
            break
            
    if current_idx == -1:
        raise HTTPException(status_code=400, detail="Current question ID not found")
        
    current_q = interview["questions"][current_idx]
    q_type = current_q.get("type", "").lower()
    q_cat = current_q.get("category", "").lower()
    
    # 1. Skip follow-ups for Intros, Custom Questions, Closing, and existing Follow-ups
    if "self-intro" in q_type or "introduction" in q_type:
        return {"skip_followup": True, "reason": "Skip follow-up for intro"}
    if "follow-up" in q_type or "jd-based" in q_type:
        return {"skip_followup": True, "reason": "Already a follow-up"}
    if "custom" in q_cat:
        return {"skip_followup": True, "reason": "Skip follow-up for custom questions"}
    if "closing" in q_cat or "future" in q_cat or "closing" in q_type:
        return {"skip_followup": True, "reason": "Skip follow-up for closing"}

    # 2. Check if we already have a follow-up (avoid infinite expansion if re-running)
    if current_idx + 1 < len(interview["questions"]):
         next_q = interview["questions"][current_idx+1]
         if "follow-up" in next_q.get("type", "").lower() or "jd-based" in next_q.get("type", "").lower():
             return {"skip_followup": True, "reason": "Next question is already a follow-up"}

    
    try:
        # Generate the question
        language = interview.get("language", "English")
        new_question = run_followup_graph(
            req.answer_text, 
            interview.get("profile_text", ""),
            interview.get("job_description", ""),
            req.current_question_id,
            followup_streak,
            language
        )
        
        if followup_streak >= 3:
            interview["followup_streak"] = 0
        else:
            interview["followup_streak"] = followup_streak + 1

    except Exception as e:
        # If API fails, return a 503 so frontend catches it and moves to next pre-generated question
        raise HTTPException(status_code=503, detail="AI generation failed")
    
    # Assign the inserted follow-up ID explicitly
    new_question["id"] = int(current_q["id"]) + 1
    
    # Shift IDs of subsequent questions to make room for the new follow-up
    for q in interview["questions"][current_idx+1:]:
        q["id"] = int(q["id"]) + 1
             
    interview["questions"].insert(current_idx + 1, new_question)
    
    try:
        # Update DB first to prevent partial persistence
        interviews_collection.update_one(
            {"id": req.interview_id}, 
            {"$set": {"questions": json.dumps(interview["questions"])}}
        )
        # If DB succeeds, update fast-cache
        set_session(req.interview_id, interview)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to save follow-up question")
        
    return new_question


@router.post("/parse-resume")
async def parse_resume(
    file: UploadFile = File(...),
    source: str = Form("resume"),
    upload_to_cloud: bool = Form(False)
):
    ALLOWED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and TXT are allowed for security reasons.")
    
    if getattr(file, "size", 0) and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
    try:
        print(f"Uploading file with source: {source}, upload_to_cloud: {upload_to_cloud}")

        # Read file content
        content = file.file.read()

        # Extract text based on file type
        content_str = extract_text_from_file(content, file.filename)

        if not content_str.strip():
            raise HTTPException(status_code=400, detail="No readable text found in the file")

        file_url = None
        if upload_to_cloud:
            import cloudinary.uploader
            try:
                # Seek back to 0 before uploading
                file.file.seek(0)
                upload_res = cloudinary.uploader.upload(
                    file.file,
                    resource_type="raw",
                    folder="jds" if source == 'jd' else "resumes",
                    public_id=f"{uuid.uuid4().hex[:8]}_{file.filename}"
                )
                file_url = upload_res.get("secure_url")
            except Exception as e:
                print(f"Cloudinary upload failed: {e}")
                # We do not fail the whole process if upload fails, just continue without URL

        if source == "jd":
            return {
                "text": content_str.strip(),
                "file_url": file_url
            }

        # Generate interview ID
        interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        # Analyze the resume
        import asyncio
        from starlette.concurrency import run_in_threadpool
        try:
            profile_analysis = await asyncio.wait_for(
                run_in_threadpool(analyze_resume_or_jd, content_str), 
                timeout=15.0
            )
        except asyncio.TimeoutError:
            profile_analysis = {"error": "Analysis timed out"}
        except Exception as e:
            profile_analysis = {"error": str(e)}

        # Generate questions
        questions = generate_mock_questions(content_str, source)

        if not questions:
            raise HTTPException(status_code=400, detail="Failed to generate questions")

        # Store interview data (RAM)
        set_session(interview_id, {
            "id": interview_id,
            "source": source,
            "profile_text": content_str[:5000], # Store more text
            "profile_analysis": profile_analysis,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Store interview data (DB)
        try:
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content_str[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "file_url": file_url
            })
        except Exception as db_e:
            print(f" DB Save Error: {db_e}")


        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")

@router.post("/start-interview")
@router.post("/start-interview/")
async def start_interview(
    content: str = Form(...),
    source: str = Form("resume")
):
    try:
        print(f"Starting interview with source: {source}")

        interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        # ✅ STEP-3.2 → AI ANALYSIS (CORRECT PLACE)
        import asyncio
        from starlette.concurrency import run_in_threadpool
        try:
            profile_analysis = await asyncio.wait_for(
                run_in_threadpool(analyze_resume_or_jd, content), 
                timeout=15.0
            )
        except asyncio.TimeoutError:
            profile_analysis = {"error": "Analysis timed out"}
        except Exception as e:
            profile_analysis = {"error": str(e)}

        # Generate questions based on Source (Resume vs JD)
        questions = await asyncio.to_thread(generate_mock_questions, content, source)

        if not questions:
            raise HTTPException(status_code=400, detail="Failed to generate questions")

        # ✅ STEP-3.3 → STORE ANALYSIS HERE (RAM)
        set_session(interview_id, {
            "id": interview_id,
            "source": source,
            "profile_text": content[:5000],
            "profile_analysis": profile_analysis,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now(timezone.utc).isoformat()
        })

        # Store interview data (DB)
        def _save_interview():
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        try:
            await asyncio.to_thread(_save_interview)
        except Exception as db_e:
            print(f" DB Save Error: {db_e}")

        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import asyncio
from collections import defaultdict
_question_generation_locks = defaultdict(asyncio.Lock)

@router.post("/generate-more-questions")
@router.post("/generate-more-questions/")
async def generate_more_questions_endpoint(
    interview_id: str = Form(...),
    asked_question_ids: str = Form(""),
    count: int = Form(5),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """
    Generate additional questions for an interview session when the candidate
    finishes all questions but still has time left on the clock.
    Returns only NEW questions not already asked.
    """
    _require_candidate_session(credentials, interview_id=interview_id)
    try:
        from starlette.concurrency import run_in_threadpool

        async with _question_generation_locks[interview_id]:
            # Fetch session from RAM or DB
            session = get_session(interview_id)
            if not session:
                row = await asyncio.to_thread(interviews_collection.find_one, {"id": interview_id})
                if row:
                    try:
                        session_row = await asyncio.to_thread(interview_sessions_collection.find_one, {"interview_id": interview_id}) or {}
                        loaded_questions = json.loads(row.get("questions", "[]"))
                        session = {
                            "id": interview_id,
                            "source": row.get("source"),
                            "profile_text": row.get("profile_text", ""),
                            "questions": loaded_questions,
                            "answers": {},
                            "industry": row.get("industry") or row.get("industry_type") or session_row.get("industry") or session_row.get("industry_type") or "General",
                            "interview_type": row.get("interview_type") or session_row.get("interview_type") or "Technical",
                            "language": row.get("language") or session_row.get("language") or "English"
                        }
                        set_session(interview_id, session)
                    except Exception:
                        pass

            if not session:
                raise HTTPException(status_code=404, detail="Interview session not found")
            profile_text = session.get("profile_text", "")
            source = session.get("source", "resume")
            existing_questions = session.get("questions", [])

            # Parse IDs of already-asked questions to avoid repeats
            asked_ids = set()
            if asked_question_ids:
                for aid in asked_question_ids.split(","):
                    aid = aid.strip()
                    if aid:
                        asked_ids.add(str(aid))

            already_asked_texts = {
                str(q.get("question") or q.get("text") or "").lower().strip()
                for q in existing_questions
                if str(q.get("id", "")) in asked_ids or asked_ids == set()
            }

            # Generate a new batch of questions — request extra to survive duplicate filtering
            new_questions = await run_in_threadpool(
                generate_mock_questions,
                text=profile_text,
                source=source,
                num_questions=count + 8,
                interview_type=session.get("interview_type", "Technical"),
                industry=session.get("industry", "General"),
                language=session.get("language", "English")
            )

            # Filter out questions already asked (text-similarity check)
            fresh_questions = []
            for q in new_questions:
                q_text = str(q.get("question") or q.get("text") or "").lower().strip()
                is_duplicate = any(
                    q_text in asked or asked in q_text
                    for asked in already_asked_texts
                    if len(asked) > 10  # skip very short strings
                )
                if not is_duplicate:
                    fresh_questions.append(q)
                if len(fresh_questions) >= count:
                    break

            # Assign fresh IDs starting after the last existing question
            start_id = len(existing_questions) + 1
            for i, q in enumerate(fresh_questions):
                q["id"] = start_id + i
                q["text"] = q.get("question") or q.get("text") or ""
                q["type"] = q.get("type") or "Interview"

            # Persist the newly generated questions back to session and DB
            session["questions"].extend(fresh_questions)
            set_session(interview_id, session)
            def _update_db():
                interviews_collection.update_one(
                    {"id": interview_id},
                    {"$set": {"questions": json.dumps(session["questions"])}}
                )
            await asyncio.to_thread(_update_db)

            return {
                "status": "success",
                "questions": fresh_questions,
                "count": len(fresh_questions)
            }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in /generate-more-questions: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate more questions. Please try again later.")

@router.get("/interview/{interview_id}/question/{question_id}")

def get_question(interview_id: str, question_id: int):
    # Restore from DB if not in RAM
    if not get_session(interview_id):
        row = interviews_collection.find_one({"id": interview_id})
        if row:
            print(f" Restoring interview {interview_id} from DB...")
            try:
                loaded_questions = json.loads(row.get("questions", "[]"))
                set_session(interview_id, {
                    "id": interview_id,
                    "source": row.get("source"),
                    "profile_text": row.get("profile_text"),
                    "questions": loaded_questions,
                    "answers": {},
                    "created_at": row.get("created_at")
                })
            except Exception as e:
                print(f"Restore failed: {e}")
    
    if not get_session(interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    
    interview = get_session(interview_id)
    # Ensure ID comparison works (cast both to int)
    question = next((q for q in interview["questions"] if int(q["id"]) == int(question_id)), None)
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    return {
        "current_question": question,  # This key must match what your HTML looks for
        "total_questions": len(interview["questions"]),
        "interview_id": interview_id
    }
# Add this import at the top

@router.post("/upload-answer")
def upload_answer(
    interview_id: str = Form(...),
    question_id: int = Form(...),
    video: UploadFile = File(...)
):
    # Endpoint is incomplete and not used by the current frontend.
    # Return 501 Not Implemented instead of causing syntax or runtime errors.
    raise HTTPException(status_code=501, detail="Upload answer with video is not implemented yet.")

def sync_session_to_application(link_id: str):
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        if not session:
            return
            
        app_id = session.get("application_id")
        candidate_email = session.get("candidate_email")
        company_id = session.get("company_id")
        
        app_record = None
        if app_id:
            from bson import ObjectId
            try:
                app_record = job_applications_collection.find_one({"_id": ObjectId(app_id)})
            except:
                pass
                
        if not app_record and candidate_email and company_id:
            jobs = list(jobs_collection.find({"company_id": company_id}))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            app_record = job_applications_collection.find_one({
                "email": {"$regex": f"^{candidate_email.strip()}$", "$options": "i"},
                "job_id": {"$in": job_ids}
            })
            
        if app_record:
            avg_score = session.get("avg_score")
            if avg_score is None:
                interview_id = session.get("interview_id")
                if interview_id:
                    answers = list(answers_collection.find({"interview_id": interview_id}))
                    scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
                    avg_score = round(sum(scores) / len(scores), 1) if scores else 0.0
                    
            strengths = session.get("strengths_summary") or ""
            weaknesses = session.get("weaknesses_summary") or ""
            feedback = ""
            if strengths or weaknesses:
                feedback = f"Strengths:\n{strengths}\n\nWeaknesses:\n{weaknesses}"
                
            update_fields = {
                "hireiq_interview_status": session.get("status") or "completed",
                "hireiq_score": avg_score or 0.0,
                "hireiq_feedback": feedback,
                "hireiq_resume_text": session.get("resume_text", ""),
                "hireiq_job_description_text": session.get("job_description_text", ""),
                "hireiq_recommendation": session.get("overall_recommendation") or "No recommendation",
                "hireiq_completion_time": session.get("updated_at") or session.get("created_at") or datetime.now(timezone.utc).isoformat(),
                "hireiq_final_result": session.get("decision") or "pending",
                "detected_accent": session.get("detected_accent") or "Unknown"
            }
            
            if session.get("status") == "completed":
                if avg_score is not None:
                    update_fields["score"] = avg_score
                if session.get("decision"):
                    update_fields["decision"] = session["decision"]
                    
            job_applications_collection.update_one(
                {"_id": app_record["_id"]},
                {"$set": update_fields}
            )
            print(f"✅ Synced HireIQ interview {link_id} status to application {app_record['_id']}.")
    except Exception as e:
        print(f"⚠️ Error syncing interview to application: {e}")

@router.get("/interview/{interview_id}/summary")
def get_interview_summary(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Get a summary of the interview including all questions and answers."""
    _require_candidate_session(credentials, interview_id=interview_id, allow_completed=True)
    if not get_session(interview_id):
        raise HTTPException(status_code=404, detail="Interview not found")
    
    interview = get_session(interview_id)
    return {
        "interview_id": interview_id,
        "source": interview["source"],
        "created_at": interview["created_at"],
        "total_questions": len(interview["questions"]),
        "questions_answered": len(interview["answers"]),
        "questions": interview["questions"],
        "answers": interview["answers"]
    }


class ChatRequest(BaseModel):
    message: str
@router.post("/chat")
def chat(req: ChatRequest, current_admin: dict = Depends(get_current_admin_details)):
    try:
        reply = chat_completion(
            messages=[
                {"role": "system", "content": "You are a helpful interview assistant. Keep responses short."},
                {"role": "user", "content": req.message}
            ],
            model="openai/gpt-4o-mini"
        )
        return {"reply": reply}
    except Exception as e:
        logger.exception("Admin chat completion failed")
        return {"reply": "Sorry, I am currently unavailable."}

class AnswerRequest(BaseModel):
    interview_id: str
    candidate_name: str
    question_id: int
    question_text: str
    answer_text: str
    


@router.post("/save-answer")
def save_answer(
    interview_id: str = Form(...),
    question_id: str = Form(...),
    question_text: str = Form(...),
    answer_text: str = Form(...),
    candidate_name: str = Form("Candidate"),
    time_spent_seconds: str = Form("0"),
    time_limit_seconds: str = Form("120"),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    try:
        candidate_session = _require_candidate_session(credentials, interview_id=interview_id)
        current_session_id.set(interview_id)
        from app.services.answer_service import persist_answer_and_enqueue_scoring

        result = persist_answer_and_enqueue_scoring(
            interview_id=interview_id,
            question_id=question_id,
            question_text=question_text,
            answer_text=answer_text,
            candidate_name=candidate_session.get("candidate_name") or candidate_name,
            time_spent_seconds=time_spent_seconds,
            time_limit_seconds=time_limit_seconds,
        )
        return {
            **result,
            "ai_score": None,
            "message": "Answer saved. Scoring is running in the background.",
        }
    except Exception as exc:
        import traceback
        with open("error_log.txt", "a") as f:
            f.write(f"Error in save_answer: {exc}\n{traceback.format_exc()}\n")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    print(f"⚡ Instant save for Q{question_id} ➝ AI scoring in background...")

    # ── STEP 1: Get context (fast — RAM first) ──────────────────────────────
    context = ""
    language = "English"
    try:
        row = interviews_collection.find_one({"id": interview_id})
        if row:
            source = row.get("source", "Resume")
            profile_text = row.get("profile_text", "")
            context = f"Candidate's {source}: {profile_text}"
            language = row.get("language", "English")
    except Exception as e:
        print(f" Context fetch error: {e}")

    # ── STEP 2: Save to MongoDB INSTANTLY with pending status ───────────────
    try:
        t_spent = int(float(time_spent_seconds)) if time_spent_seconds.lower() != 'nan' else 0
    except:
        t_spent = 0
        
    try:
        t_limit = int(float(time_limit_seconds)) if time_limit_seconds.lower() != 'nan' else 120
    except:
        t_limit = 120

    answers_collection.delete_many({"interview_id": interview_id, "question_id": question_id})
    answers_collection.insert_one({
        "interview_id": interview_id,
        "question_id": question_id,
        "question_text": question_text,
        "answer_text": answer_text,
        "ai_score": None,
        "content_score": None,
        "relevance_score": None,
        "time_score": None,
        "time_spent_seconds": t_spent,
        "time_limit_seconds": t_limit,
        "ai_feedback": "Scoring in progress...",
        "ai_keywords": "",
        "corrected_answer": "Scoring in progress...",
        "scoring_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    })

    # ── STEP 3: Fire AI scoring in a Celery background task ──────────────────
    from app import tasks
    tasks.score_answer_task.delay(
        interview_id=interview_id,
        question_id=question_id,
        question_text=question_text,
        answer_text=answer_text,
        context=context,
        time_spent_seconds=t_spent,
        time_limit_seconds=t_limit,
        language=language
    )

    # ── STEP 4: Return INSTANTLY to the candidate ───────────────────────────
    return {
        "status": "saved",
        "scoring_status": "pending",
        "ai_score": None,
        "message": "Answer saved! Scoring is running in the background."
    }



# ─── NEW: Save Behavioral / Proctoring Metrics per Question ───────────────────
class BehavioralData(BaseModel):
    interview_id: str
    question_id: str
    wpm: float = 0
    pause_count: int = 0
    filler_count: int = 0
    time_spent_seconds: int = 0
    keyword_match_pct: float = 0
    tab_switches: int = 0
    face_alerts: int = 0
    noise_alerts: int = 0

@router.post("/save-behavioral-data")
def save_behavioral_data(
    data: BehavioralData,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    """Saves per-question behavioral and proctoring metrics"""
    _require_candidate_session(credentials, interview_id=data.interview_id, allow_completed=True)
    try:
        # Check if this is a case study question
        is_case_study = False
        idx = -1
        if "cs_" in str(data.question_id):
            is_case_study = True
            try:
                idx = int(str(data.question_id).replace("cs_", ""))
            except:
                pass

        if is_case_study and idx >= 0:
            interview = interviews_collection.find_one({"id": data.interview_id})
            if interview and "case_study_round" in interview:
                answers = interview["case_study_round"].get("answers", [])
                if idx < len(answers):
                    if answers[idx] is None:
                        answers[idx] = {}

                    answers[idx]["wpm"] = data.wpm
                    answers[idx]["pause_count"] = data.pause_count
                    answers[idx]["filler_count"] = data.filler_count
                    answers[idx]["time_spent_seconds"] = data.time_spent_seconds
                    answers[idx]["tab_switches"] = data.tab_switches
                    answers[idx]["face_alerts"] = data.face_alerts
                    answers[idx]["noise_alerts"] = data.noise_alerts

                    interviews_collection.update_one(
                        {"id": data.interview_id},
                        {"$set": {"case_study_round.answers": answers}}
                    )

        else:
            update_fields = {
                "wpm": data.wpm,
                "pause_count": data.pause_count,
                "filler_count": data.filler_count,
                "keyword_match_pct": data.keyword_match_pct,
                "tab_switches": data.tab_switches,
                "face_alerts": data.face_alerts,
                "noise_alerts": data.noise_alerts
            }

            # Preserve existing time if the frontend sends the default value.
            if data.time_spent_seconds and data.time_spent_seconds > 0:
                update_fields["time_spent_seconds"] = data.time_spent_seconds

            answers_collection.update_many(
                {"interview_id": data.interview_id, "question_id": data.question_id},
                {"$set": update_fields}
            )
        return {"status": "ok"}
    except Exception as e:
        print(f"Behavioral save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CodingRoundStartRequest(BaseModel):
    interview_id: str

class CodingRoundCheckpointRequest(BaseModel):
    interview_id: str
    code: str = ""
    explanation: str = ""
    language: str = "python"


class CodingRoundSubmitRequest(CodingRoundCheckpointRequest):
    pass


class CodingRoundRunRequest(CodingRoundCheckpointRequest):
    pass


class CodingRoundObserveRequest(CodingRoundCheckpointRequest):
    pass


@router.post("/coding-round/start")
async def start_coding_round(
    req: CodingRoundStartRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    import asyncio
    from fastapi.concurrency import run_in_threadpool

    interview = get_interview_or_404(req.interview_id)
    answers_data = get_answer_history(req.interview_id)

    existing_round = interview.get("coding_round") or {}
    if existing_round.get("task"):
        return {
            "interview_id": req.interview_id,
            "coding_round": existing_round,
            "tests": build_coding_test_payload(existing_round),
            "resumed": True,
        }

    interview_type = interview.get("interview_type", "Technical")
    profile_text = interview.get("profile_text", "")

    # Get industry from the session
    link_id = interview.get("link_id", "")
    session = interview_sessions_collection.find_one({"link_id": link_id}) if link_id else None
    industry = (session or {}).get("industry", "General")

    # generate_coding_task calls an LLM (blocking I/O) — run it off the event loop
    task = await run_in_threadpool(
        generate_coding_task, profile_text, answers_data, interview_type, industry
    )

    coding_round = {
        "status": "active",
        "task": task,
        "answer_summary": build_answer_summary(answers_data),
        "language": task.get("recommended_language", "python"),
        "latest_code": "",
        "latest_explanation": "",
        "latest_feedback": "",
        "checkpoints": [],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    persist_coding_round(req.interview_id, coding_round)
    return {
        "interview_id": req.interview_id,
        "coding_round": coding_round,
        "tests": build_coding_test_payload(coding_round),
        "resumed": False,
    }


# ── CASE STUDY ROUND (Non-Technical) ─────────────────────────────────────────

class CaseStudyStartRequest(BaseModel):
    interview_id: str

class CaseStudyAnswerRequest(BaseModel):
    interview_id: str
    question_index: int
    answer_text: str

def _generate_case_study_questions_ai(job_description: str, num_questions: int, profile_text: str = "", industry: str = "General", language: str = "English") -> list:
    """Generate case study questions using AI based on JD skills."""
    system_prompt = f"""You are an expert HR interviewer who creates deep, scenario-based case study questions for the '{industry}' industry.
    
    CRITICAL REQUIREMENT: You MUST generate the questions and scenarios STRICTLY in the {language} language. Do NOT use English unless {language} is English.
    
You must return ONLY a valid JSON array of objects. Each object must have:
- "scenario": A detailed real-world business scenario (3-5 sentences) situated in the '{industry}' industry that places the candidate in a specific situation
- "question": The specific question asking what the candidate would do
- "skill_tested": The key skill being evaluated (e.g., "Team Management", "Conflict Resolution")
- "evaluation_criteria": Array of 3-4 things to look for in the answer

IMPORTANT: Do NOT ask coding or technical questions. Focus on leadership, management, communication, problem-solving, and business strategy scenarios relevant to the '{industry}' sector."""

    user_prompt = f"""Based on the following Job Description, create exactly {num_questions} scenario-based case study questions.

Job Description:
{job_description[:1500]}

{f'Candidate Profile: {profile_text[:500]}' if profile_text else ''}

Extract key non-technical skills from the JD (like team management, stakeholder communication, project planning, conflict resolution, etc.) and create realistic business scenarios that test those skills.

Each scenario should describe a specific situation the candidate might face in this role, and ask them to write their strategy/approach.

Return ONLY a JSON array. Example format:
[
  {{
    "scenario": "You have just joined as a Project Manager and discover that two senior team members have a long-standing disagreement about the project architecture...",
    "question": "How would you handle this situation to ensure project delivery stays on track while maintaining team morale?",
    "skill_tested": "Conflict Resolution & Team Management",
    "evaluation_criteria": ["Problem identification", "Stakeholder management", "Communication strategy", "Resolution approach"]
  }}
]"""

    try:
        from app.ai.ai_client import chat_completion
        response_text = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )
        # Extract JSON array from response
        import json, re
        json_match = re.search(r'\[[\s\S]*\]', response_text)
        if json_match:
            questions = json.loads(json_match.group())
            if isinstance(questions, list) and len(questions) > 0:
                validated_questions = []
                for q in questions:
                    # Normalize keys to handle AI inconsistencies
                    norm_q = {str(k).lower(): v for k, v in q.items()}
                    
                    scenario = norm_q.get("scenario") or norm_q.get("situation", "")
                    question_text = norm_q.get("question") or norm_q.get("task", "")
                    skill = norm_q.get("skill_tested", "Scenario")
                    eval_criteria = norm_q.get("evaluation_criteria", [])
                    
                    if scenario and question_text:
                        validated_questions.append({
                            "scenario": scenario,
                            "question": question_text,
                            "skill_tested": skill,
                            "evaluation_criteria": eval_criteria
                        })
                        
                if validated_questions:
                    return validated_questions[:num_questions]
    except Exception as e:
        print(f"[CASE STUDY] AI generation failed: {e}")
    
    return None  # Signal to use offline fallback


def _generate_case_study_questions_offline(job_description: str, num_questions: int, industry: str = "General", language: str = "English") -> list:
    """Generate offline case study questions by extracting skills from JD."""
    jd_lower = job_description.lower()
    
    # Map of skills to scenario templates
    from app.data.industry_fallback_data import INDUSTRY_CASE_STUDIES
    # Try to get specific industry scenarios first
    if language != "English":
        try:
            from app.data.offline_language_fallback import OFFLINE_LANGUAGE_CASE_STUDIES
            lang_cases = OFFLINE_LANGUAGE_CASE_STUDIES.get(language, [])
            if lang_cases:
                import random
                selected = random.sample(lang_cases, min(num_questions, len(lang_cases)))
                results = []
                for idx, c in enumerate(selected):
                    sep = "।" if "।" in c else "."
                    parts = c.split(sep, 1)
                    if len(parts) > 1 and parts[1].strip():
                        scenario = parts[0].strip() + sep
                        question = parts[1].strip()
                    else:
                        scenario = c
                        question = c
                    results.append({
                        "id": str(idx + 1),
                        "scenario": scenario,
                        "question": question,
                        "skill_tested": "Scenario",
                        "difficulty": "Medium",
                        "time_limit": 300,
                        "evaluation_criteria": ["Analysis", "Problem Solving", "Communication"]
                    })
                return results
        except ImportError:
            pass

    industry_cases = INDUSTRY_CASE_STUDIES.get(industry)
    if industry_cases:
        skill_scenarios = industry_cases
    else:
        skill_scenarios = {
            "team management": {
                "scenario": f"You are leading a cross-functional team in the {industry} sector. Two senior team members have conflicting ideas on how to approach a major project phase, leading to delays and low morale.",
                "question": "How would you mediate this conflict and get the team back on track?",
                "skill_tested": "Conflict Resolution & Leadership",
                "evaluation_criteria": ["Neutral mediation", "Focus on project goals", "Active listening", "Clear decision-making"]
            },
            "project planning": {
                "scenario": f"Your {industry} project has just lost 20% of its budget due to company-wide cuts, but the delivery deadline remains the same. The client still expects all core features.",
                "question": "How do you re-plan the project delivery and communicate this to the stakeholders?",
                "skill_tested": "Project Management & Communication",
                "evaluation_criteria": ["Prioritization/MVP focus", "Resource reallocation", "Transparent communication", "Risk management"]
            },
            "stakeholder management": {
                "scenario": f"A key stakeholder in your {industry} project keeps changing their requirements late in the development cycle, causing scope creep and team frustration.",
                "question": "What is your strategy to manage these changes without damaging the client relationship?",
                "skill_tested": "Stakeholder Management & Scope Control",
                "evaluation_criteria": ["Change management process", "Setting boundaries", "Impact analysis communication", "Relationship building"]
            },
            "agile delivery": {
                "scenario": f"You are transitioning a traditional waterfall team to Agile methodologies for a critical {industry} product release. The team is highly resistant to daily standups and sprint planning.",
                "question": "How do you drive Agile adoption while ensuring the product release is not delayed?",
                "skill_tested": "Change Management & Agile Methodologies",
                "evaluation_criteria": ["Iterative adoption", "Focus on value", "Addressing concerns", "Team coaching"]
            },
            "risk management": {
                "scenario": f"Two weeks before a major {industry} product launch, you discover a critical compliance issue that might delay the release by a month. Leadership is pushing to launch anyway.",
                "question": "How do you handle the situation with leadership and your team?",
                "skill_tested": "Risk Management & Integrity",
                "evaluation_criteria": ["Impact analysis", "Risk mitigation strategies", "Courageous communication", "Alternative solutions"]
            },
            "communication": {
                "scenario": "Your company is going through a major organizational restructuring. You need to communicate changes to your team that will affect their roles, reporting structure, and some may face relocation.",
                "question": "How would you plan and execute this communication? What would you say, when, and how would you handle the emotional responses?",
                "skill_tested": "Communication & Change Management",
                "evaluation_criteria": ["Empathy", "Transparency", "Timing", "Follow-up support"]
            },
            "problem solving": {
                "scenario": "A critical production system has failed during peak business hours. The technical team estimates 4-6 hours for a fix, but the business impact is $50,000 per hour. There's a workaround that is 80% effective but can be deployed in 30 minutes.",
                "question": "Walk through your decision-making process. What would you do, who would you involve, and how would you communicate to stakeholders?",
                "skill_tested": "Problem Solving & Decision Making",
                "evaluation_criteria": ["Analytical thinking", "Risk assessment", "Communication under pressure", "Decision speed"]
            },
            "project": {
                "scenario": "You are managing a project that is 3 weeks behind schedule and 15% over budget. The client is expecting a demo next week, and your best developer just submitted their resignation.",
                "question": "What is your action plan to address these simultaneous challenges and deliver a successful outcome?",
                "skill_tested": "Project Management & Crisis Handling",
                "evaluation_criteria": ["Prioritization", "Resource management", "Client management", "Contingency planning"]
            },
            "negotiation": {
                "scenario": "A key vendor has informed you that they are increasing their prices by 40% effective next quarter. This vendor provides a critical component for your product, and switching vendors would take 6 months.",
                "question": "How would you approach this negotiation? What alternatives would you explore, and what would your strategy be?",
                "skill_tested": "Negotiation & Vendor Management",
                "evaluation_criteria": ["Negotiation tactics", "Alternative exploration", "Cost-benefit analysis", "Relationship management"]
            },
            "agile": {
                "scenario": "Your team has been using Waterfall methodology but management wants to transition to Agile. Half the team is excited, but the other half is resistant to change. You have a major release in 2 months.",
                "question": "How would you plan and execute this transition while maintaining productivity and team cohesion?",
                "skill_tested": "Agile Transformation & Change Management",
                "evaluation_criteria": ["Change management", "Training approach", "Gradual adoption strategy", "Measuring success"]
            },
            "client": {
                "scenario": "An important client has escalated a complaint to your CEO about the quality of service they have been receiving. Your investigation reveals that the client's expectations were never properly documented, and your team has been delivering what they understood.",
                "question": "How would you resolve this situation with the client, prevent it from happening again, and address any internal process gaps?",
                "skill_tested": "Client Relationship Management",
                "evaluation_criteria": ["Client empathy", "Root cause analysis", "Process improvement", "Relationship recovery"]
            },
            "budget": {
                "scenario": "You have been asked to reduce your department's operating budget by 20% without laying off any employees. Current expenses include software licenses, training programs, travel, and contractor costs.",
                "question": "Present your strategy for achieving this budget reduction while maintaining team productivity and morale.",
                "skill_tested": "Budget Management & Optimization",
                "evaluation_criteria": ["Financial analysis", "Creative solutions", "Impact assessment", "Prioritization"]
            }
        }
    
    # Find matching skills from JD
    matched_questions = []
    for skill_key, question_data in skill_scenarios.items():
        if skill_key in jd_lower:
            matched_questions.append(question_data)
    
    # If not enough matches, add generic ones
    all_questions = list(skill_scenarios.values())
    for q in all_questions:
        if q not in matched_questions:
            matched_questions.append(q)
        if len(matched_questions) >= num_questions:
            break
    
    return matched_questions[:num_questions]


@router.post("/case-study/start")
async def start_case_study_round(
    req: CaseStudyStartRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    
    # Check if case study round already exists
    existing = interview.get("case_study_round")
    if existing and existing.get("questions"):
        return {
            "interview_id": req.interview_id,
            "case_study_round": existing,
            "resumed": True,
        }
    
    job_description = interview.get("job_description", "") or interview.get("profile_text", "")
    profile_text = interview.get("profile_text", "")
    
    # Get the number of questions and industry from the session
    link_id = interview.get("link_id", "")
    session = interview_sessions_collection.find_one({"link_id": link_id}) if link_id else None
    num_questions = (session or {}).get("case_study_count", 3) or 3
    num_questions = max(1, min(8, num_questions))
    industry = (session or {}).get("industry", "General")
    language = interview.get("language", "English")
    
    # Try AI first, fall back to offline
    import asyncio
    questions = await asyncio.to_thread(_generate_case_study_questions_ai, job_description, num_questions, profile_text, industry, language)
    if not questions:
        print(f"[CASE STUDY] Using offline fallback for {num_questions} questions")
        questions = await asyncio.to_thread(_generate_case_study_questions_offline, job_description, num_questions, industry, language)
        
    # Normalize question shape
    normalized_questions = []
    for idx, q in enumerate(questions):
        text = q.get('text') or q.get('scenario') or q.get('question') or ''
        normalized_questions.append({
            "id": q.get("id") or f"cs_{idx}",
            "type": "case_study",
            "text": text,
            **q
        })
        normalized_questions[-1]["text"] = text # Ensure text is strictly set
    questions = normalized_questions
    
    case_study_round = {
        "status": "active",
        "questions": questions,
        "answers": [None] * len(questions),
        "current_question": 0,
        "total_questions": len(questions),
        "started_at": datetime.now(timezone.utc).isoformat(),
    }
    
    interviews_collection.update_one(
        {"id": req.interview_id},
        {"$set": {"case_study_round": case_study_round}}
    )
    if get_session(req.interview_id):
        interview = get_session(req.interview_id)
        if interview:
            interview["case_study_round"] = case_study_round
            set_session(req.interview_id, interview)
    
    return {
        "interview_id": req.interview_id,
        "case_study_round": case_study_round,
        "resumed": False,
    }


@router.post("/case-study/submit-answer")
def submit_case_study_answer(
    req: CaseStudyAnswerRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    case_study = interview.get("case_study_round")
    if not case_study:
        raise HTTPException(status_code=400, detail="Case study round not started")
    
    answers = case_study.get("answers", [])
    if 0 <= req.question_index < len(answers):
        answers[req.question_index] = {
            "answer_text": req.answer_text,
            "submitted_at": datetime.now(timezone.utc).isoformat()
        }
    
    interviews_collection.update_one(
        {"id": req.interview_id},
        {"$set": {
            "case_study_round.answers": answers,
            "case_study_round.current_question": req.question_index + 1
        }}
    )
    
    return {"status": "saved", "question_index": req.question_index}

@router.get("/coding-round/{interview_id}")
def get_coding_round(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=interview_id, allow_completed=True)
    interview = get_interview_or_404(interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round:
        raise HTTPException(status_code=404, detail="Coding round not started")
    return {"interview_id": interview_id, "coding_round": coding_round, "tests": build_coding_test_payload(coding_round)}


def _run_coding_feedback(req: CodingRoundCheckpointRequest, feedback_mode: str) -> Dict[str, Any]:
    interview = get_interview_or_404(req.interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round or not coding_round.get("task"):
        raise HTTPException(status_code=400, detail="Coding round not started")

    if feedback_mode == "checkpoint":
        feedback_count = coding_round.get("ai_feedback_count", 0)
        if feedback_count >= 2:
            raise HTTPException(
                status_code=400,
                detail="Your AI feedback limit is over! You can only get AI feedback 2 times."
            )
        coding_round["ai_feedback_count"] = feedback_count + 1

    latest_code = req.code or ""
    latest_explanation = req.explanation or ""
    unchanged = (
        latest_code.strip() == (coding_round.get("latest_code", "") or "").strip()
        and latest_explanation.strip() == (coding_round.get("latest_explanation", "") or "").strip()
        and coding_round.get("latest_feedback")
        and feedback_mode == "checkpoint"
    )
    if unchanged:
        return {
            "interview_id": req.interview_id,
            "coding_round": coding_round,
            "feedback": coding_round.get("latest_feedback"),
            "ai_feedback_count": coding_round.get("ai_feedback_count", 0),
            "ai_feedback_remaining": max(0, 2 - coding_round.get("ai_feedback_count", 0)),
            "cached": True,
        }

    feedback = run_coding_round(
        task=coding_round["task"],
        answer_summary=coding_round.get("answer_summary", ""),
        code=latest_code,
        explanation=latest_explanation,
        language=req.language,
        prior_feedback=coding_round.get("latest_feedback", ""),
        feedback_mode=feedback_mode,
    )

    checkpoint = {
        "at": datetime.now(timezone.utc).isoformat(),
        "language": req.language,
        "code_length": len(latest_code),
        "explanation_length": len(latest_explanation),
        "feedback": feedback,
        "mode": feedback_mode,
    }

    # Automatically run tests on the final submitted code so the admin can see the test results
    if feedback_mode == "final" and latest_code.strip():
        try:
            from app.services.services import run_code_against_tests
            run_result = run_code_against_tests(latest_code, coding_round["task"], req.language or "python")
            coding_round["latest_run"] = {
                "at": checkpoint["at"],
                **run_result,
            }
        except Exception as e:
            print(f"Auto-eval execution failed: {e}")

    coding_round["latest_code"] = latest_code
    coding_round["latest_explanation"] = latest_explanation
    coding_round["language"] = req.language
    coding_round["latest_feedback"] = feedback
    coding_round["updated_at"] = checkpoint["at"]
    coding_round.setdefault("checkpoints", []).append(checkpoint)
    if feedback_mode == "final":
        coding_round["status"] = "completed"
        coding_round["final_evaluation"] = feedback
        coding_round["completed_at"] = checkpoint["at"]

    persist_coding_round(req.interview_id, coding_round)
    return {
        "interview_id": req.interview_id,
        "coding_round": coding_round,
        "feedback": feedback,
        "ai_feedback_count": coding_round.get("ai_feedback_count", 0),
        "ai_feedback_remaining": max(0, 2 - coding_round.get("ai_feedback_count", 0)),
        "cached": False,
    }


@router.post("/coding-round/checkpoint")
def coding_round_checkpoint(
    req: CodingRoundCheckpointRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    return _run_coding_feedback(req, "checkpoint")


@router.post("/coding-round/submit")
def coding_round_submit(
    req: CodingRoundSubmitRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    return _run_coding_feedback(req, "final")


@router.post("/coding-round/run")
def coding_round_run(
    req: CodingRoundRunRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round or not coding_round.get("task"):
        raise HTTPException(status_code=400, detail="Coding round not started")
    result = run_code_against_tests(req.code or "", coding_round["task"], req.language or "python")
    coding_round["latest_code"] = req.code or ""
    coding_round["latest_explanation"] = req.explanation or coding_round.get("latest_explanation", "")
    coding_round["language"] = req.language or "python"
    coding_round["latest_run"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        **result,
    }
    persist_coding_round(req.interview_id, coding_round)
    return {
        "interview_id": req.interview_id,
        "run_result": result,
        "tests": build_coding_test_payload(coding_round),
    }


@router.post("/coding-round/observe")
def coding_round_observe(
    req: CodingRoundObserveRequest,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=req.interview_id)
    interview = get_interview_or_404(req.interview_id)
    coding_round = interview.get("coding_round")
    if not coding_round or not coding_round.get("task"):
        raise HTTPException(status_code=400, detail="Coding round not started")

    observation = observe_coding_intent(
        task=coding_round["task"],
        code=req.code or "",
        explanation=req.explanation or "",
        language=req.language or "python",
    )
    coding_round["last_observation"] = {
        "at": datetime.now(timezone.utc).isoformat(),
        **observation,
    }
    persist_coding_round(req.interview_id, coding_round)
    return {"interview_id": req.interview_id, "observation": observation}

@router.get("/interview/{interview_id}/ai-summary")
def interview_ai_summary(
    interview_id: str,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, interview_id=interview_id, allow_completed=True)
    answers = answers_collection.find({"interview_id": interview_id, "ai_score": {"$ne": None}})
    scores = [a.get("ai_score", 0) for a in answers]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0

    return {
        "interview_id": interview_id,
        "average_score": avg_score,
        "total_questions": len(scores)
    }

from pydantic import BaseModel
class InterviewAlert(BaseModel):
    type: str
    message: str

from fastapi import Request
import json

@router.post("/interview/{interview_id}/alert")
async def log_interview_alert(
    interview_id: str,
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_monitoring_security),
):
    _require_candidate_session(credentials, link_id=interview_id)
    try:
        body_bytes = await request.body()
        data = json.loads(body_bytes)
        alert_type = data.get("type", "warning")
        alert_message = data.get("message", "Unknown alert")
    except Exception:
        # Fallback if invalid JSON
        alert_type = "warning"
        alert_message = "Invalid alert data received"
        
    interview_sessions_collection.update_one(
        {"link_id": interview_id},
        {"$push": {"alerts": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": alert_type,
            "message": alert_message
        }}}
    )
    return {"status": "success"}

# ─── Helper: Generate AI Summary (Recommendation + S&W) ─────────────────────
def generate_interview_summary(candidate_name: str, answers_data: list) -> dict:
    """
    Generate interview summary via typed_ai_layer (type-safe, compressed, token-optimized).
    """
    # Priority 0: LangGraph Layer
    try:
        from app.data.interview_graphs import run_summary_graph
        result = run_summary_graph(candidate_name, answers_data)
        if result and "recommendation" in result:
            return result
    except ImportError:
        pass
    except Exception as e:
        print(f"[interview_graphs] summary failed, falling back: {e}")

    # Priority 1: Typed AI layer (type-safe validated output)
    try:
        from app.ai.typed_ai_layer import generate_summary as _typed_summary
        result = _typed_summary(candidate_name, answers_data)
        if result and "recommendation" in result:
            return result
    except Exception as e:
        print(f"[typed_ai_layer] summary failed, using direct call: {e}")

    # ── Direct fallback (original logic) ──────────────────────────────────
    if not answers_data:
        return {
            "recommendation": "No Data",
            "strengths": "No answers provided.",
            "weaknesses": "No answers provided."
        }

    avg = sum(a.get("ai_score", 0) or 0 for a in answers_data) / len(answers_data)

    # TOKEN SAVE: Send compressed feedback instead of full answer text
    compressed_qa = "\n".join(
        f"Q{i+1}: {a.get('question_text','')[:120]}\n"
        f"Score: {a.get('ai_score', 0)}/100 | "
        f"Feedback: {(a.get('ai_feedback') or '')[:200]}"
        for i, a in enumerate(answers_data)
    )

    SYSTEM = (
        "You are a senior hiring manager. Analyze interview performance and return ONLY valid JSON. "
        "No markdown, no explanation."
    )
    USER = f"""Candidate: {candidate_name}
Average Score: {avg:.1f}/100

Interview Summary (Compressed):
{compressed_qa}

Return JSON with keys: recommendation (one of: Strong Hire, Hire, Borderline, No Hire),
strengths (2-3 sentences), weaknesses (2-3 sentences),
communication_score (0-100), communication_reasoning,
skills_score (0-100), skills_reasoning,
competencies_score (0-100), competencies_reasoning,
personality_score (0-100), personality_reasoning,
culture_fit_score (0-100), culture_fit_reasoning,
job_success_score (0-100), job_success_reasoning,
detected_accent (short string)."""

    prompt = USER  # kept for backward compat

    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": USER}
            ],
            model="openai/gpt-4o-mini",
            temperature=0.1,
        )
        res = extract_json(raw)
        if res:
            if not res.get("detected_accent") or str(res.get("detected_accent")).strip().lower() in ["unknown", "none", ""]:
                from app.services.language_accent_detector import detect_language_and_accent
                l_res = detect_language_and_accent(answers_data)
                res["detected_accent"] = l_res.get("detected_accent", "English (Indian Accent)")
            return res
        raise Exception("Invalid JSON returned")
    except Exception as e:
        print(f"Summary generation error: {e}")
        from app.services.language_accent_detector import detect_language_and_accent
        l_res = detect_language_and_accent(answers_data)
        # Fallback from score
        if avg >= 75:
            rec = "Strong Hire"
        elif avg >= 55:
            rec = "Hire"
        elif avg >= 35:
            rec = "Borderline"
        else:
            rec = "No Hire"
        return {
            "recommendation": rec,
            "strengths": "Summary generation failed — please review individual scores.",
            "weaknesses": "Summary generation failed — please review individual scores.",
            "communication_score": int(avg),
            "communication_reasoning": "N/A",
            "skills_score": int(avg),
            "skills_reasoning": "N/A",
            "competencies_score": int(avg),
            "competencies_reasoning": "N/A",
            "personality_score": int(avg),
            "personality_reasoning": "N/A",
            "culture_fit_score": int(avg),
            "culture_fit_reasoning": "N/A",
            "job_success_score": int(avg),
            "job_success_reasoning": "N/A",
            "detected_accent": l_res.get("detected_accent", "English (Indian Accent)")
        }


from pydantic import BaseModel, root_validator
class AgentFlowItem(BaseModel):
    context_title: str
    context_body: str
    is_enabled: bool = True
    title: Optional[str] = None
    instruction: Optional[str] = None
    body: Optional[str] = None

    @root_validator(pre=True)
    def normalize_legacy_fields(cls, values):
        if values.get('context_title') is None and values.get('title') is not None:
            values['context_title'] = values.get('title')
        if values.get('context_body') is None:
            if values.get('instruction') is not None:
                values['context_body'] = values.get('instruction')
            elif values.get('body') is not None:
                values['context_body'] = values.get('body')
        if values.get('is_enabled') is None:
            values['is_enabled'] = values.get('enabled', True)
        return values

class UpdateAgentFlowRequest(BaseModel):
    flow: List[AgentFlowItem]


def _normalize_text_field(value: Any) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    if isinstance(value, bool):
        return ""
    return str(value)


def normalize_agent_flow_read_item(item: Dict[str, Any]) -> Dict[str, Any]:
    context_title = item.get("context_title") if item.get("context_title") is not None else item.get("title", "")
    context_body = item.get("context_body") if item.get("context_body") is not None else item.get("body", item.get("instruction", ""))
    return {
        "context_title": _normalize_text_field(context_title),
        "context_body": _normalize_text_field(context_body),
        "is_enabled": bool(item.get("is_enabled", item.get("enabled", True))),
    }


def normalize_agent_flow_write_item(item: Dict[str, Any]) -> Dict[str, Any]:
    title = item.get("context_title") if item.get("context_title") is not None else item.get("title", "")
    body = item.get("context_body") if item.get("context_body") is not None else item.get("body", item.get("instruction", ""))
    return {
        "title": _normalize_text_field(title),
        "body": _normalize_text_field(body),
        "is_enabled": bool(item.get("is_enabled", item.get("enabled", True))),
    }

