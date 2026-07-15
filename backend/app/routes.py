# ---------------------------------------------------------------------------
# Standard library
# ---------------------------------------------------------------------------
import os
import sys
import io
import json
import hmac
import math
import uuid
import html
import time
import random
import base64
import shutil
import hashlib
import textwrap
import asyncio
import subprocess
import tempfile
import threading
import traceback
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from app.services import parse_iso_datetime
from app.session_store import get_session, delete_session
from pymongo import ReturnDocument

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ---------------------------------------------------------------------------
# Third-party
# ---------------------------------------------------------------------------
import bcrypt
import jwt
import requests
import cloudinary
import cloudinary.uploader
import cloudinary.api
import edge_tts
import PyPDF2
from bson import ObjectId
from docx import Document
from dotenv import load_dotenv
from groq import AsyncGroq
from pydantic import BaseModel, validator, Field
from starlette.background import BackgroundTask

from fastapi import (
    APIRouter, Depends, File, Form, HTTPException, Request, UploadFile,
    WebSocket, WebSocketDisconnect, BackgroundTasks
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles

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
from routes import voice_routes

from .models import *
from .database import *
from .config import *
from . import omni_dimension_client
from .services import *
from app.session_store import get_session, set_session, delete_session

load_dotenv()


router = APIRouter()


@router.get("/admin/last-error")
def get_last_error(current_admin: dict = Depends(get_current_admin_details)):
    return LAST_422_ERROR or {"status": "no errors"}

@router.get("/api/plans")
def get_plans():
    plans_list = []
    try:
        plans_cursor = plans_collection.find({})
        for p in plans_cursor:
            if p.get("plan_name", "").lower() == "owner":
                continue
            plans_list.append({
                "id": str(p["_id"]),
                "plan_name": p.get("plan_name", "Unknown Plan"),
                "credits": p.get("credits_granted", 0),
                "price": p.get("price", 0),
                "features": p.get("features", []),
                "summary": p.get("summary", "")
            })
    except Exception as e:
        print(f"[API Plans] MongoDB error: {e}. Falling back to default plans.")
    
    # Fallback to in-memory PLAN_DEFINITIONS if MongoDB collection is empty
    if not plans_list:
        for key, plan in PLAN_DEFINITIONS.items():
            if key == "owner":
                continue
            plans_list.append({
                "id": key,
                "plan_name": plan["label"],
                "credits": plan["credits_granted"],
                "price": plan["price"],
                "features": plan["features"],
                "summary": plan["summary"]
            })
            
    return {"status": "success", "data": plans_list}

class RazorpayOrderRequest(BaseModel):
    plan_name: str
    amount_inr: float
    credits: int


# Startup functions (to be called by main.py lifespan)
def startup_event_cloudinary():
    global CLOUDINARY_CLEANUP_STARTED
    if not CLOUDINARY_CLEANUP_STARTED:
        import threading
        threading.Thread(target=cloudinary_cleanup_loop, daemon=True).start()
        CLOUDINARY_CLEANUP_STARTED = True


# In-memory storage (replace with database in production)
    # interviews = {}

def get_or_create_candidate(name: str) -> str:
    row = candidates_collection.find_one({"name": name})

    if row:
        return str(row["_id"])

    custom_id = get_next_sequence_value("candidate", "CAN")
    result = candidates_collection.insert_one({
        "name": name,
        "custom_id": custom_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    return str(result.inserted_id)


def load_interview_from_db(interview_id: str) -> Optional[Dict[str, Any]]:
    row = interviews_collection.find_one({"id": interview_id})
    if not row:
        return None

    try:
        loaded_questions = json.loads(row.get("questions", "[]"))
    except Exception:
        loaded_questions = []

    interview = {
        "id": interview_id,
        "source": row.get("source"),
        "profile_text": row.get("profile_text", ""),
        "questions": loaded_questions,
        "answers": {},
        "created_at": row.get("created_at"),
        "coding_round": row.get("coding_round"),
        "case_study_round": row.get("case_study_round"),
    }
    set_session(interview_id, interview)
    return interview


def get_interview_or_404(interview_id: str) -> Dict[str, Any]:
    interview = get_session(interview_id) or load_interview_from_db(interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


def get_answer_history(interview_id: str) -> List[Dict[str, Any]]:
    return list(answers_collection.find({"interview_id": interview_id}).sort("question_id", 1))


def build_answer_summary(answers_data: List[Dict[str, Any]]) -> str:
    if not answers_data:
        return "No completed verbal answers were found."

    blocks = []
    for item in answers_data[-5:]:
        answer_text = (item.get("answer_text") or "").strip()
        if len(answer_text) > 280:
            answer_text = answer_text[:280].rstrip() + "..."
        blocks.append(
            f"Question: {item.get('question_text', '')}\n"
            f"Answer: {answer_text}\n"
            f"AI Score: {item.get('ai_score', 0)}"
        )
    return "\n\n".join(blocks)


def persist_coding_round(interview_id: str, coding_round: Dict[str, Any]) -> None:
    interview = get_session(interview_id)
    if interview:
        interview["coding_round"] = coding_round
        set_session(interview_id, interview)
    interviews_collection.update_one(
        {"id": interview_id},
        {"$set": {"coding_round": coding_round}},
        upsert=False,
    )


def build_coding_test_payload(coding_round: Dict[str, Any]) -> Dict[str, Any]:
    task = coding_round.get("task", {})
    test_cases = task.get("test_cases", [])
    visible = [case for case in test_cases if case.get("visible")]
    hidden = [case for case in test_cases if not case.get("visible")]
    return {
        "visible_cases": [
            {
                "id": case.get("id"),
                "input": case.get("input"),
                "output": case.get("expected"),
            }
            for case in visible[:3]
        ],
        "hidden_case_count": len(hidden[:4]),
        "total_case_count": len(test_cases[:7]),
    }


@router.post("/generate-next-question")
def api_gen_next_question(req: NextQuestionRequest):
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
        new_question = generate_followup_question(
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


@router.post("/upload-resume")
@router.post("/upload-resume/")
def upload_resume(
    file: UploadFile = File(...),
    source: str = Form("resume")
):
    ALLOWED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and TXT are allowed for security reasons.")
    
    if getattr(file, "size", 0) and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
    try:
        print(f"Uploading resume with source: {source}")

        # Read file content
        content = file.file.read()

        # Extract text based on file type
        content_str = extract_text_from_file(content, file.filename)

        if not content_str.strip():
            raise HTTPException(status_code=400, detail="No readable text found in the file")

        # Generate interview ID
        interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        # Analyze the resume
        profile_analysis = analyze_resume_or_jd(content_str)

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
                "created_at": datetime.now(timezone.utc).isoformat()
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
def start_interview(
    content: str = Form(...),
    source: str = Form("resume")
):
    try:
        print(f"Starting interview with source: {source}")

        interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

        # ✅ STEP-3.2 → AI ANALYSIS (CORRECT PLACE)
        profile_analysis = analyze_resume_or_jd(content)

        # Generate questions based on Source (Resume vs JD)
        questions = generate_mock_questions(content, source)

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
        try:
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
        except Exception as db_e:
            print(f" DB Save Error: {db_e}")

        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
                "hireiq_final_result": session.get("decision") or "pending"
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
def get_interview_summary(interview_id: str):
    """Get a summary of the interview including all questions and answers."""
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
def chat(req: ChatRequest):
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
        return {"reply": f"Sorry, I am currently unavailable. ({str(e)})"}

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
):
    current_session_id.set(interview_id)
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

    # ── STEP 3: Fire AI scoring in a BACKGROUND THREAD ─────────────────────
    def _score_in_background():
        try:
            ai_result = analyze_answer(
                question_text,
                answer_text,
                context,
                time_spent_seconds=t_spent,
                time_limit_seconds=t_limit,
                language=language
            )
            keywords = ai_result.get("keywords", [])
            keywords_str = ",".join(keywords) if isinstance(keywords, list) else str(keywords)

            answers_collection.update_one(
                {"interview_id": interview_id, "question_id": question_id},
                {"$set": {
                    "ai_score": ai_result.get("overall_score", 0),
                    "content_score": ai_result.get("content_score", 0),
                    "relevance_score": ai_result.get("relevance_score", 0),
                    "time_score": ai_result.get("time_score", 0),
                    "clarity_score": ai_result.get("clarity_score", 50),
                    "technical_depth_score": ai_result.get("technical_depth_score", 50),
                    "confidence_score": ai_result.get("confidence_score", 50),
                    "ai_feedback": ai_result.get("feedback", "No feedback"),
                    "ai_keywords": keywords_str,
                    "corrected_answer": ai_result.get("corrected_answer", "N/A"),
                    "scoring_status": "complete"
                }}
            )
            print(f"✅ Background scoring complete for Q{question_id}: {ai_result.get('overall_score', 0)}/100")
        except Exception as e:
            print(f"⚠️ Background scoring failed for Q{question_id}: {e}")
            answers_collection.update_one(
                {"interview_id": interview_id, "question_id": question_id},
                {"$set": {"scoring_status": "failed", "ai_score": 0}}
            )

        # ── Post-scoring checks: Recalculate avg_score (composite) and trigger completion events if ready ──
        try:
            answers = list(answers_collection.find({"interview_id": interview_id}))
            scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
            verbal_avg = sum(scores) / len(scores) if scores else 0

            # ── Composite score: blend with coding / case study if present ──
            try:
                from score_rounds import compute_coding_score, compute_case_study_score, blend_scores
                interview_row = interviews_collection.find_one({"id": interview_id})
                interview_format = (interview_row or {}).get("interview_format", "Standard") if interview_row else "Standard"
                coding_round_data = (interview_row or {}).get("coding_round") if interview_row else None
                case_study_data   = (interview_row or {}).get("case_study_round") if interview_row else None

                coding_s     = compute_coding_score(coding_round_data, interview_format, language) if coding_round_data else None
                case_study_s = compute_case_study_score(case_study_data, context, language) if case_study_data else None
                avg_score    = blend_scores(verbal_avg, coding_s, case_study_s)

                if coding_s is not None:
                    print(f"📊 Coding score: {coding_s}/100 (format={interview_format})")
                if case_study_s is not None:
                    print(f"📊 Case study score: {case_study_s}/100")
                print(f"📊 Composite avg_score: {avg_score}/100 (verbal={verbal_avg:.1f})")
            except Exception as blend_err:
                print(f"⚠️ Composite blend error (falling back to verbal): {blend_err}")
                avg_score = verbal_avg

            session = interview_sessions_collection.find_one({"interview_id": interview_id})
            if session:
                interview_sessions_collection.update_one(
                    {"_id": session["_id"]},
                    {"$set": {"avg_score": round(avg_score, 1)}}
                )
                sync_session_to_application(session.get("link_id"))
                
                # If session is completed, check if all answers are now scored
                if session.get("status") == "completed" and not session.get("notification_sent"):
                    all_scored = all(a.get("scoring_status") in ("complete", "failed") for a in answers)
                    if all_scored:
                        # NEW: Generate Multi-Dimensional Analysis!
                        from analyze_dimensions import analyze_interview_dimensions
                        transcript = [{"Q": a.get("question_text"), "A": a.get("answer_text")} for a in answers]
                        dimensions = analyze_interview_dimensions(transcript, context, language)
                        
                        interview_sessions_collection.update_one(
                            {"_id": session["_id"]},
                            {"$set": {
                                "multi_dimensional_analysis": dimensions,
                                "notification_sent": True
                            }}
                        )
                        
                        # Append 'IQ' to candidate's custom_id if not present
                        candidate_id = session.get("candidate_id")
                        if candidate_id:
                            try:
                                from bson import ObjectId
                                cand = candidates_collection.find_one({"_id": ObjectId(candidate_id)})
                                if cand and cand.get("custom_id") and not cand["custom_id"].endswith("IQ"):
                                    candidates_collection.update_one(
                                        {"_id": ObjectId(candidate_id)},
                                        {"$set": {"custom_id": f"{cand['custom_id']}IQ"}}
                                    )
                            except: pass
                            
                        sync_session_to_application(session.get("link_id"))

                        # Send notification!
                        link_id = session.get("link_id")
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
                            except: pass
                        
                        if candidate_email:
                            send_submission_notification(
                                candidate_email=candidate_email,
                                candidate_name=candidate_name,
                                admin_email=admin_email,
                                avg_score=avg_score,
                                total_questions=len(answers)
                            )
                            print(f"✅ Submission notification sent for {candidate_name} from background thread")
                        
                        from app import tasks
                        tasks.generate_report_task.delay(interview_id=interview_id)
        except Exception as e:
            print(f"⚠️ Error checking session completion in background thread: {e}")

    thread = threading.Thread(target=_score_in_background, daemon=True)
    thread.start()

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
def save_behavioral_data(data: BehavioralData):
    """Saves per-question behavioral and proctoring metrics"""
    try:
        answers_collection.update_many(
            {"interview_id": data.interview_id, "question_id": data.question_id},
            {"$set": {
                "wpm": data.wpm,
                "pause_count": data.pause_count,
                "filler_count": data.filler_count,
                "time_spent_seconds": data.time_spent_seconds,
                "keyword_match_pct": data.keyword_match_pct,
                "tab_switches": data.tab_switches,
                "face_alerts": data.face_alerts,
                "noise_alerts": data.noise_alerts
            }}
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
def start_coding_round(req: CodingRoundStartRequest):
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
    
    task = generate_coding_task(profile_text, answers_data, interview_type, industry=industry)
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
        from ai_client import chat_completion
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
    from industry_fallback_data import INDUSTRY_CASE_STUDIES
    # Try to get specific industry scenarios first
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_CASE_STUDIES
            lang_cases = OFFLINE_LANGUAGE_CASE_STUDIES.get(language, [])
            if lang_cases:
                import random
                selected = random.sample(lang_cases, min(num_questions, len(lang_cases)))
                results = []
                for idx, c in enumerate(selected):
                    results.append({
                        "id": str(idx + 1),
                        "scenario": c["scenario"],
                        "question": c["task"],
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
async def start_case_study_round(req: CaseStudyStartRequest):
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
def submit_case_study_answer(req: CaseStudyAnswerRequest):
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
def get_coding_round(interview_id: str):
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
        "cached": False,
    }


@router.post("/coding-round/checkpoint")
def coding_round_checkpoint(req: CodingRoundCheckpointRequest):
    return _run_coding_feedback(req, "checkpoint")


@router.post("/coding-round/submit")
def coding_round_submit(req: CodingRoundSubmitRequest):
    return _run_coding_feedback(req, "final")


@router.post("/coding-round/run")
def coding_round_run(req: CodingRoundRunRequest):
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
def coding_round_observe(req: CodingRoundObserveRequest):
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
def interview_ai_summary(interview_id: str):
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
async def log_interview_alert(interview_id: str, request: Request):
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
    # Priority 1: Typed AI layer (type-safe validated output)
    try:
        from typed_ai_layer import generate_summary as _typed_summary
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
        if res: return res
        raise Exception("Invalid JSON returned")
    except Exception as e:
        print(f"Summary generation error: {e}")
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
            "detected_accent": "Unknown"
        }


from pydantic import BaseModel
class AgentFlowItem(BaseModel):
    context_title: str
    context_body: str
    is_enabled: bool = True

class UpdateAgentFlowRequest(BaseModel):
    flow: List[AgentFlowItem]

@router.get("/admin/agent-flow")
def get_agent_flow():
    from app.config import OMNI_DIMENSION_API_KEY, OMNI_AGENT_ID
    import requests
    if not OMNI_DIMENSION_API_KEY:
        raise HTTPException(status_code=500, detail="OMNI_DIMENSION_API_KEY is not set.")
    
    if not OMNI_AGENT_ID:
        raise HTTPException(status_code=500, detail="OMNI_AGENT_ID is not configured.")
    
    agent_id = OMNI_AGENT_ID
    headers = {"Authorization": f"Bearer {OMNI_DIMENSION_API_KEY}"}
    try:
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
            return {"success": True, "flow": flow_data}
        else:
            print(f"[Omnidimension] GET agent flow failed [status={res.status_code}]")
            raise HTTPException(status_code=res.status_code, detail="Failed to fetch agent flow from upstream API.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/admin/agent-flow")
def update_agent_flow(req: UpdateAgentFlowRequest):
    from app.config import OMNI_DIMENSION_API_KEY, OMNI_AGENT_ID
    import requests
    if not OMNI_DIMENSION_API_KEY:
        raise HTTPException(status_code=500, detail="OMNI_DIMENSION_API_KEY is not set.")
    
    if not OMNI_AGENT_ID:
        raise HTTPException(status_code=500, detail="OMNI_AGENT_ID is not configured.")
    
    agent_id = OMNI_AGENT_ID
    headers = {"Authorization": f"Bearer {OMNI_DIMENSION_API_KEY}", "Content-Type": "application/json"}
    
    # We only send the context_breakdown (conversational flow)
    payload = {
        "context_breakdown": [item.dict() for item in req.flow]
    }
    
    try:
        res = requests.put(f"https://backend.omnidim.io/api/v1/agents/{agent_id}", headers=headers, json=payload, timeout=10)
        if res.status_code == 200:
            return {"success": True, "message": "Agent flow updated successfully."}
        else:
            print(f"[Omnidimension] PUT agent flow failed [status={res.status_code}]")
            raise HTTPException(status_code=res.status_code, detail="Failed to update agent flow on upstream API.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/interview/{link_id}")
def get_interview_details(link_id: str):
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
                "total_time_minutes": 0.0
            },
            "alerts": [],
            "answers": answers
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

    # Fallback: If results exist but status is still 'started', mark as 'completed'
    if current_status == 'started' and actual_interview_id:
        if answers_collection.find_one({"interview_id": actual_interview_id}):
            print(f" Fallback: Marking session {link_id} as completed because results exist.")
            interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"status": "completed"}})

    def get_url_from_raw_path(rpath):
        if not rpath: return None
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
    total_time = 0

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

    # 2. Calculate composite AI summary score
    avg_score = 0
    if results:
        scores = [r["ai_score"] for r in results if r["ai_score"] is not None]
        verbal_avg = round(sum(scores) / len(scores), 1) if scores else 0

        # Blend with coding / case study rounds if present
        try:
            from score_rounds import compute_coding_score, compute_case_study_score, blend_scores
            interview_record_for_score = interviews_collection.find_one({"id": actual_interview_id}) if actual_interview_id else None
            if interview_record_for_score:
                interview_format_cs = interview_record_for_score.get("interview_format", "Standard")
                lang_cs = interview_record_for_score.get("language", "English")
                ctx_cs  = f"Candidate's {interview_record_for_score.get('source','Resume')}: {interview_record_for_score.get('profile_text','')}"
                coding_rd  = interview_record_for_score.get("coding_round")
                case_std   = interview_record_for_score.get("case_study_round")
                coding_s   = compute_coding_score(coding_rd, interview_format_cs, lang_cs) if coding_rd else None
                case_s     = compute_case_study_score(case_std, ctx_cs, lang_cs) if case_std else None
                avg_score  = blend_scores(verbal_avg, coding_s, case_s)
            else:
                avg_score = verbal_avg
        except Exception as blend_err:
            print(f"⚠️ complete-session blend error: {blend_err}")
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
        detected_accent = saved_accent
    else:
        summary = generate_interview_summary(candidate_name or "Candidate", results)
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
        detected_accent = summary.get("detected_accent", "Unknown")
        
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
                        "avg_score": avg_score
                    }}
                )
            except Exception as e:
                print(f"Summary cache error: {e}")
            sync_session_to_application(link_id)

    response_payload = {
        "interview_id": link_id,
        "actual_interview_id": actual_interview_id,
        "candidate_id": session_data.get("candidate_id"),
        "candidate_name": candidate_name or "Candidate",
        "candidate_email": session_data.get("candidate_email") or session_data.get("email", ""),
        "candidate_phone": session_data.get("candidate_phone") or session_data.get("phone", ""),
        "interview_title": session_data.get("interview_title") or session_data.get("job_title", ""),
        "experience": session_data.get("experience", ""),
        "location": session_data.get("location", ""),
        "notice_period": session_data.get("notice_period", ""),
        "current_ctc": session_data.get("current_ctc", ""),
        "expected_ctc": session_data.get("expected_ctc", ""),
        "current_company": session_data.get("current_company", ""),
        "status": session_data.get("status", "completed"),
        "decision": session_data.get("decision", ""),
        "resume_text": session_data.get("resume_text", ""),
        "job_description_text": session_data.get("job_description", ""),
        "date": created_at,
        "source": session_data.get("source") or "Job Description / Resume",
        "avg_score": avg_score,
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
        "recording_url": recording_url,
        "screen_recording_url": screen_recording_url,
        "completion_reason": session_data.get("completion_reason"),
        "integrity": {
            "total_tab_switches": total_tab_switches,
            "total_face_alerts": total_face_alerts,
            "total_noise_alerts": total_noise_alerts,
            "total_time_minutes": round(total_time / 60, 1)
        },
        "alerts": session_data.get("alerts", []),
        "answers": results,
        "candidate_feedback": session_data.get("candidate_feedback", "")
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


    if actual_interview_id:
        interview_record = interviews_collection.find_one({"id": actual_interview_id})
        if interview_record:
            if interview_record.get("coding_round"):
                response_payload["coding_round"] = interview_record.get("coding_round")
            if interview_record.get("case_study_round"):
                response_payload["case_study_round"] = interview_record.get("case_study_round")
            # Add profile/resume text and job description for ATS analysis
            response_payload["profile_text"] = interview_record.get("profile_text", "")
            response_payload["job_description"] = interview_record.get("job_description", "")
            # Fill interview_title from interview record if not already set from session
            if not response_payload.get("interview_title"):
                response_payload["interview_title"] = (
                    interview_record.get("title") or
                    interview_record.get("interview_title") or
                    interview_record.get("job_title", "")
                )
                
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
    # Retrieve Resume/JD context from the CURRENT in-memory session (not historical DB data)
    if req.interview_id and get_session(req.interview_id):
         profile_text = get_session(req.interview_id).get("profile_text", "")
         source = get_session(req.interview_id).get("source", "Resume")
         language = get_session(req.interview_id).get("language", "English")
         context = f"Candidate's {source}: {profile_text}"
    
    result = analyze_answer(req.question, req.answer, context, language=language)

    # Delete existing to avoid duplicates
    answers_collection.delete_many({"interview_id": req.interview_id, "question_id": req.question_id})

    # Store in DB
    try:
        answers_collection.insert_one({
            "interview_id": req.interview_id,
            "question_id": req.question_id,
            "question_text": req.question,
            "answer_text": req.answer,
            "ai_score": result.get("overall_score", 0),
            "ai_feedback": result.get("feedback", ""),
            "ai_keywords": json.dumps(result.get("keywords", [])),
            "corrected_answer": result.get("corrected_answer", ""),
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
    file: UploadFile = File(...)
):
    if getattr(file, "size", 0) and file.size > 500 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recording too large. Maximum size is 500MB.")
        
    try:
        # Create directory for temporary recordings if it doesn't exist
        recordings_dir = os.path.join(UPLOAD_FOLDER, "recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        
        # Generate filename
        prefix = "camera" if recording_type == "camera" else "screen"
        filename = f"{interview_id}_{prefix}_recording.webm"
        file_path = os.path.join(recordings_dir, filename)
        
        # Save file locally first since it can be large
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Upload to Cloudinary
        try:
            upload_result = cloudinary.uploader.upload_large(
                file_path,
                resource_type="video",
                folder="mock_interview_recordings"
            )
            normalized_path = upload_result.get("secure_url")
            cloudinary_public_id = upload_result.get("public_id")
            
            # Clean up local file after successful upload
            os.remove(file_path)
            
        except Exception as cloud_e:
            print(f"Error uploading to cloudinary: {cloud_e}")
            # Fallback to local path if cloudinary fails
            normalized_path = file_path.replace("\\\\", "/")
            cloudinary_public_id = None

        # Update database
        uploaded_at = datetime.now(timezone.utc)
        
        path_key = "recording_path" if recording_type == "camera" else "screen_recording_path"
        
        update_data = {
            path_key: normalized_path,
            f"{path_key}_uploaded_at": uploaded_at.isoformat(),
            f"{path_key}_expires_at": (uploaded_at + timedelta(days=RECORDING_RETENTION_DAYS)).isoformat(),
            f"{path_key}_retention_days": RECORDING_RETENTION_DAYS,
            f"{path_key}_storage": "cloudinary" if cloudinary_public_id else "local"
        }
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
            print(f" Recording uploaded but no DB record matched interview_id={interview_id}, link_id={link_id}")
        
        return {
            "status": "success",
            "file_path": normalized_path,
            "recording_url": normalized_path,
            "saved_to_interviews": interview_update.matched_count > 0,
            "saved_to_session": session_update.matched_count > 0
        }
    except Exception as e:
        print(f"Error saving full recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/generate-report/{interview_id}")
def generate_report(interview_id: str):
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
    
    # Calculate Average Score
    if answers:
        scores = [row[2] for row in answers if row[2] is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        
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
            safe_eval = coding_round["final_evaluation"].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
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

def send_submission_notification(candidate_email: str, candidate_name: str, admin_email: str, avg_score: float, total_questions: int):
    """Send test submission notification to both admin and candidate."""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=True)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email_addr = os.getenv("BREVO_SENDER_EMAIL")
    if not api_key:
        return False

    # Email to candidate
    candidate_html = f"""
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px; background-color: #f1f5f9; min-height: 100%;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 24px 32px; text-align: left;">
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">✅ Interview Submitted Successfully</h2>
            </div>
            <div style="padding: 32px; background-color: #ffffff;">
                <p style="font-size: 16px; color: #0f172a; text-align: left; margin: 0 0 20px 0;">Dear <b>{candidate_name}</b>,</p>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">Thank you for completing your AI-powered interview. Your responses have been successfully submitted and are now being reviewed.</p>
                <div style="background-color: #f0fdf4; border-radius: 8px; padding: 15px; margin: 24px 0; border: 1px solid #bbf7d0; text-align: left;">
                    <p style="margin: 0; color: #166534; font-size: 14px;">📊 <b>Questions Answered:</b> {total_questions}</p>
                </div>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">Our recruitment team will review your performance and get back to you shortly. Please keep an eye on your email for further updates.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 24px 0;">
                <p style="color: #64748b; font-size: 14px; margin: 0; text-align: left; line-height: 1.6;">Best regards,<br/><b style="color: #4f46e5;">Hire IQ Recruiting</b></p>
            </div>
        </div>
        <div style="max-width: 600px; margin: 24px auto 0; text-align: center;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Powered by Hire IQ AI Assessments</p>
        </div>
    </body></html>
    """

    # Email to admin
    score_color = "#10b981" if avg_score >= 60 else "#ef4444"
    admin_html = f"""
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px; background-color: #f1f5f9; min-height: 100%;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
            <div style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0; padding: 24px 32px; text-align: left;">
                <h2 style="color: #0f172a; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.02em;">📋 New Interview Submission</h2>
            </div>
            <div style="padding: 32px; background-color: #ffffff;">
                <p style="font-size: 16px; color: #0f172a; text-align: left; margin: 0 0 20px 0;">A candidate has completed their interview:</p>
                <div style="background-color: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #e2e8f0; border-left: 4px solid #6366f1; text-align: left;">
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>👤 Candidate:</b> {candidate_name}</p>
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>📧 Email:</b> {candidate_email}</p>
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>📊 Questions Answered:</b> {total_questions}</p>
                    <p style="margin: 5px 0; color: #475569; font-size: 14px;"><b>🏆 Average Score:</b> <span style="color: {score_color}; font-weight: 700; font-size: 18px;">{avg_score:.1f}/100</span></p>
                </div>
                <p style="color: #475569; line-height: 1.6; font-size: 14px; margin: 10px 0; text-align: left;">Login to the admin panel to review the full results, video recording, and AI analysis.</p>
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 24px 0;">
                <p style="color: #64748b; font-size: 14px; margin: 0; text-align: left; line-height: 1.6;">— AI Interview System</p>
            </div>
        </div>
    </body></html>
    """

    results = []
    url = "https://api.brevo.com/v3/smtp/email"
    headers = {"api-key": api_key, "content-type": "application/json"}

    # Send to candidate
    try:
        res = requests.post(url, json={
            "sender": {"name": sender_name, "email": sender_email_addr},
            "to": [{"email": candidate_email, "name": candidate_name}],
            "subject": "Your Interview Has Been Submitted — Mock Interview",
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
    from redis_manager import manager
    import json
    
    # Try cache first
    cache_key = f"dashboard_stats:{current_admin.get('company_id')}:{current_admin.get('admin_id')}:{admin_id or 'none'}"
    if manager.redis:
        cached = await manager.redis.get(cache_key)
        if cached:
            return json.loads(cached)

    try:
        query = {"company_id": current_admin.get("company_id")}
        
        if current_admin.get("role") in ["admin", "super_admin", "master"]:
            admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])})
            credits = admin_doc.get("credits", 0) if admin_doc else 0
        else:
            comp_id = current_admin.get("company_id")
            if comp_id:
                company = companies_collection.find_one({"_id": ObjectId(comp_id)})
                credits = company.get("credits", 0) if company else 0
            else:
                credits = 0
        
        # Data Isolation:
        # If the user is a standard admin, force the query to their own admin_id
        if current_admin.get("role") == "admin":
            query["created_by"] = current_admin["admin_id"]
        # If the user is a super admin and requested a specific admin's data, filter by it
        elif admin_id:
            query["created_by"] = admin_id
            
        all_sessions = list(interview_sessions_collection.find(
            query,
            {"created_at": 1, "status": 1, "decision": 1, "avg_score": 1, "is_deactivated": 1, "expires_at": 1, "created_by": 1, "candidate_email": 1, "email": 1}
        ))
        now = datetime.now(timezone.utc)
        
        active_sessions = [s for s in all_sessions if not s.get("is_deactivated", False)]
        total = len(active_sessions)
        pending = 0
        completed = 0
        started = 0
        expired = 0
        selected = 0
        rejected = 0
        total_score = 0
        scored_count = 0
        today_count = 0
        week_count = 0
        
        seen_emails = set()
        
        for s in all_sessions:
            if s.get("is_deactivated", False):
                continue
                
            email = s.get("candidate_email") or s.get("email")
            if email:
                seen_emails.add(email.strip().lower())
                
            status = s.get("status", "pending")
            if status == "pending" and s.get("expires_at"):
                try:
                    exp_dt = datetime.fromisoformat(s["expires_at"].replace('Z', '+00:00'))
                    if exp_dt.tzinfo is None:
                        exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                    if now > exp_dt:
                        status = "expired"
                        interview_sessions_collection.update_one({"_id": s["_id"]}, {"$set": {"status": "expired"}})
                except Exception:
                    pass
            elif status == "started":
                time_ref_str = s.get("started_at") or s.get("created_at")
                if time_ref_str:
                    try:
                        time_ref = datetime.fromisoformat(time_ref_str.replace('Z', '+00:00'))
                        if time_ref.tzinfo is None:
                            time_ref = time_ref.replace(tzinfo=timezone.utc)
                        duration_mins = int(s.get("interview_duration") or 30)
                        buffer_mins = max(120, duration_mins * 2)
                        if (now - time_ref).total_seconds() > (buffer_mins * 60):
                            status = "expired"
                            interview_sessions_collection.update_one({"_id": s["_id"]}, {"$set": {"status": "expired"}})
                    except Exception:
                        pass
            
            if status == "completed":
                completed += 1
            elif status == "started":
                started += 1
            elif status == "expired":
                expired += 1
            else:
                pending += 1
            
            if s.get("decision") == "selected":
                selected += 1
            elif s.get("decision") == "rejected":
                rejected += 1
            
            if s.get("avg_score") is not None:
                total_score += s["avg_score"]
                scored_count += 1
            
            try:
                created = datetime.fromisoformat(s.get("created_at", ""))
                if created.date() == now.date():
                    today_count += 1
                if (now - created).days <= 7:
                    week_count += 1
            except Exception:
                pass
                
        # Merge stats from AI Calling interested candidates
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if current_admin.get("role") == "admin":
                jobs_query["admin_id"] = current_admin["admin_id"]
            elif admin_id:
                jobs_query["admin_id"] = admin_id
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "interest": {"$regex": "interested", "$options": "i"}
            }
            apps = list(job_applications_collection.find(app_query, {"email": 1, "score": 1, "applied_at": 1, "updated_at": 1}))
            
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
            "credits": credits
        }
        
        if manager.redis:
            await manager.redis.setex(cache_key, 30, json.dumps(stats))
            
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
    rows = list(interview_sessions_collection.find(query).sort("created_at", -1))
    now = datetime.now(timezone.utc)
    
    export_data = []
    for row in rows:
        current_status = row.get("status", "pending")
        if current_status == "pending" and row.get("expires_at"):
            try:
                exp_dt = datetime.fromisoformat(row["expires_at"].replace('Z', '+00:00'))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if now > exp_dt:
                    current_status = "expired"
                    interview_sessions_collection.update_one({"_id": row["_id"]}, {"$set": {"status": "expired"}})
            except Exception:
                pass
        elif current_status == "started":
            time_ref_str = row.get("started_at") or row.get("created_at")
            if time_ref_str:
                try:
                    time_ref = datetime.fromisoformat(time_ref_str.replace('Z', '+00:00'))
                    if time_ref.tzinfo is None:
                        time_ref = time_ref.replace(tzinfo=timezone.utc)
                    duration_mins = int(row.get("interview_duration") or 30)
                    buffer_mins = max(120, duration_mins * 2)
                    if (now - time_ref).total_seconds() > (buffer_mins * 60):
                        current_status = "expired"
                        interview_sessions_collection.update_one({"_id": row["_id"]}, {"$set": {"status": "expired"}})
                except Exception:
                    pass
        
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

# Startup functions (to be called by main.py lifespan)
async def startup_event_db_and_email():
    import mongo_db
    await mongo_db.init_db_indexes()
    global EMAIL_SCHEDULER_STARTED
    # Create default MASTER admin if not exists
    try:
        master_row = admins_collection.find_one({"username": "master"})
        if not master_row:
            import secrets
            master_pw = os.getenv("DEFAULT_MASTER_PASSWORD") or secrets.token_urlsafe(12)
            hashed_pw = hash_password(master_pw)
            default_email = os.getenv("BREVO_SENDER_EMAIL", "no-reply@mockinterview.com")
            admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
                "username": "master",
                "password": hashed_pw,
                "email": default_email,
                "role": "master",
                "subscription_plan": "master",
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"Default master created: master / {master_pw} (Email: {default_email})")
            
        row = admins_collection.find_one({"username": "admin"})
        if not row:
            import secrets
            admin_pw = os.getenv("DEFAULT_ADMIN_PASSWORD") or secrets.token_urlsafe(12)
            hashed_pw = hash_password(admin_pw)
            default_email = os.getenv("BREVO_SENDER_EMAIL", "no-reply@mockinterview.com")
            admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
                "username": "admin",
                "password": hashed_pw,
                "email": default_email,
                "role": "super_admin",
                "subscription_plan": "advance",
                "subscription_start": datetime.now(timezone.utc).isoformat(),
                "subscription_expiry": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
            print(f"Default admin created: admin / {admin_pw} (Email: {default_email})")
        else:
            # Upgrade legacy admin to tenant
            update_data = {}
            if not row.get("email"): update_data["email"] = os.getenv("BREVO_SENDER_EMAIL", "no-reply@mockinterview.com")
            if not row.get("role"): update_data["role"] = "tenant"
            if not row.get("subscription_plan"):
                update_data["subscription_plan"] = "advance"
                update_data["subscription_start"] = datetime.now(timezone.utc).isoformat()
                update_data["subscription_expiry"] = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
            if update_data:
                admins_collection.update_one({"username": "admin"}, {"$set": update_data})
    except Exception as e:
        print(f"Error checking/creating admin: {e}")

    # Seed default plans if they don't exist
    try:
        default_plans = [
            {
                "plan_name": "Free Trial",
                "credits_granted": get_plan_definition("trial")["credits_granted"],
                "price": get_plan_definition("trial")["price"],
                "features": get_plan_definition("trial")["features"],
                "is_unlimited": False,
                "is_owner_plan": False
            },
            {
                "plan_name": "Basic",
                "credits_granted": get_plan_definition("basic")["credits_granted"],
                "price": get_plan_definition("basic")["price"],
                "features": get_plan_definition("basic")["features"],
                "is_unlimited": False,
                "is_owner_plan": False
            },
            {
                "plan_name": "Advance",
                "credits_granted": get_plan_definition("advance")["credits_granted"],
                "price": get_plan_definition("advance")["price"],
                "features": get_plan_definition("advance")["features"],
                "is_unlimited": False,
                "is_owner_plan": False
            },
            {
                "plan_name": "Owner",
                "credits_granted": get_plan_definition("owner")["credits_granted"],
                "price": get_plan_definition("owner")["price"],
                "features": get_plan_definition("owner")["features"],
                "is_unlimited": True,
                "is_owner_plan": True
            }
        ]
        for plan in default_plans:
            existing = plans_collection.find_one({"plan_name": plan["plan_name"]})
            if not existing:
                plans_collection.insert_one(plan)
                print(f"Seeded plan: {plan['plan_name']}")
    except Exception as e:
        print(f"Error seeding plans: {e}")

    if not EMAIL_SCHEDULER_STARTED:
        threading.Thread(target=invitation_email_scheduler_loop, daemon=True).start()
        EMAIL_SCHEDULER_STARTED = True

@router.get("/api/interview/{interview_id}/insights")
def get_interview_insights(interview_id: str):
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
    load_dotenv(env_path, override=True)
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
        <p>Best Regards,<br/>Mock Interview</p>
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

@router.post("/admin/profile")
def update_profile(data: UpdateProfileRequest, current_admin: str = Depends(get_current_admin)):
    try:
        from bson import ObjectId
        
        admin_id_obj = ObjectId(str(data.admin_id))
        admin = admins_collection.find_one({"_id": admin_id_obj})
        if not admin:
            raise HTTPException(status_code=404, detail="Admin not found")
            
        update_fields = {}
        
        if data.old_password and data.new_password:
            if not verify_password(data.old_password, admin["password"]):
                raise HTTPException(status_code=400, detail="Incorrect old password")
            update_fields["password"] = hash_password(data.new_password)
            
        if data.email:
            update_fields["email"] = data.email
        if data.username:
            update_fields["username"] = data.username
        if data.company_name:
            update_fields["company_name"] = data.company_name
            
        if not update_fields:
            return {"status": "success", "message": "No changes made."}
            
        admins_collection.update_one({"_id": admin_id_obj}, {"$set": update_fields})
        
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
    email = None
    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    if email_match:
        email = email_match.group(0)
        
    name = None
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    # First non-empty line that doesn't look like an email or phone
    for line in lines[:10]:
        if len(line) < 40 and not re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', line) and not re.search(r'\d{10}', line):
            name = line
            break
    
    return {"name": name, "email": email}

@router.post("/admin/parse-resume")
async def parse_resume(file: UploadFile = File(...), current_admin: dict = Depends(get_current_admin_details)):
    ALLOWED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and TXT are allowed for security reasons.")
        
    if getattr(file, "size", 0) and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
    content = await file.read()
    text = extract_text_from_file(content, file.filename)
    info = extract_info_from_resume(text)
    return {
        "status": "success",   
        "text": text,
        "name": info.get("name"), 
        "email": info.get("email")
    }

@router.get("/admin/candidate/check")
def check_candidate(email: str, current_admin: dict = Depends(get_current_admin_details)):
    try:
        # Check if candidate exists for this company
        session = interview_sessions_collection.find_one(
            {"company_id": current_admin.get("company_id"), "candidate_email": email},
            sort=[("created_at", -1)]
        )
        if session and session.get("resume_text"):
            return {
                "exists": True,
                "resume_text": session.get("resume_text"),
                "candidate_name": session.get("candidate_name")
            }
        return {"exists": False}
    except Exception as e:
        return {"exists": False, "error": str(e)}

@router.post("/admin/create-session")
def create_session(data: CreateSession, current_admin: dict = Depends(get_current_admin_details)):
    company_id = current_admin.get("company_id")
    
    # ATOMIC DEDUCTION (Prevents race conditions leading to negative credits)
    if company_id:
        res = companies_collection.update_one(
            {"_id": ObjectId(company_id), "credits": {"$gte": 1}},
            {"$inc": {"credits": -1}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail="Insufficient company credits (or concurrent request).")
            
    if current_admin.get("role") == "admin":
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": 1}},
            {"$inc": {"credits": -1}}
        )
        if res.modified_count == 0:
            if company_id:
                companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": 1}})
            raise HTTPException(status_code=403, detail="Insufficient admin credits (or concurrent request).")
    elif not company_id:
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": 1}},
            {"$inc": {"credits": -1}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail="Insufficient admin credits.")

    link_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    # Task 4: If scheduled, use scheduled_end as expiry; otherwise 24h
    if data.scheduled_end:
        try:
            expires_at = datetime.fromisoformat(data.scheduled_end).isoformat()
        except Exception:
            expires_at = (now + timedelta(hours=24)).isoformat()
    else:
        expires_at = (now + timedelta(hours=24)).isoformat()
    
    session_doc = {
        "link_id": link_id,
        "candidate_id": f"CAN{random.randint(1000, 9999)}",
        "candidate_name": data.candidate_name.title(),
        "candidate_email": data.candidate_email,
        "resume_text": data.resume_text,
        "job_description": data.job_description,
        "custom_email_html": data.custom_email_html,
        "created_by": data.admin_id,
        "company_id": current_admin.get("company_id"),
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "interview_duration": data.interview_duration,
        "interview_format": data.interview_format,
        "interview_type": data.interview_type,
        "language": data.language,
        "record_video": data.record_video,
        "status": "pending",
        "hr_screening": data.hr_screening.dict(),
        "custom_questions": data.custom_questions,
        "ai_instructions": data.ai_instructions,
        "case_study_count": data.case_study_count,
        "industry": data.industry,
        "voice_clone": data.voice_clone,
        "custom_voice_id": data.custom_voice_id,
        "application_id": data.application_id,
        "candidate_phone": data.candidate_phone
    }
    
    # Task 4: Store scheduled time window
    if data.scheduled_start:
        session_doc["scheduled_start"] = data.scheduled_start
    if data.scheduled_end:
        session_doc["scheduled_end"] = data.scheduled_end
    
    interview_sessions_collection.insert_one(session_doc)
    
    # Credits were already deducted atomically at the beginning of the request.
    # _id is already populated by insert_one
    
    link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
    
    email_result = queue_or_send_interview_email(session_doc, link_url)
    
    return {
        "status": "success", 
        "link_id": link_id, 
        "link_url": link_url,
        "email_sent": email_result["email_sent"],
        "email_scheduled": email_result["email_scheduled"],
        "email_send_at": email_result["email_send_at"]
    }


# ── Bulk Session Models ────────────────────────────────────────────────────────
class BulkCandidate(BaseModel):
    candidate_name: str
    candidate_email: str
    resume_text: str = ""
    record_video: bool = True  # Task 5: Per-candidate video toggle

    @validator('candidate_name')
    def name_must_not_be_numeric(cls, v):
        if v.strip().isdigit():
            raise ValueError("Candidate Name cannot be purely numeric")
        return v

class BulkCreateSession(BaseModel):
    candidates: List[BulkCandidate]
    job_description: str
    admin_id: str
    interview_duration: int = 30
    record_video: bool = True  # Global default
    interview_format: str = "Standard"  # "Standard" or "Voice"
    interview_type: str = "Technical"
    industry_type: str = "General"
    language: str = "English"
    case_study_count: int = 3
    custom_email_html: str = ""  # Task 1: Optional admin-edited email
    scheduled_start: str = ""  # Task 4
    scheduled_end: str = ""    # Task 4
    hr_screening: HRScreening = HRScreening()  # HR screening preferences
    custom_questions: str = ""
    ai_instructions: str = ""
    voice_clone: bool = False
    custom_voice_id: str = ""

    @validator('scheduled_end')
    def validate_dates(cls, v, values):
        start = values.get('scheduled_start')
        if start and v:
            try:
                # Basic ISO format validation check (will be parsed fully in logic)
                start_dt = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
                end_dt = datetime.datetime.fromisoformat(v.replace("Z", "+00:00"))
                if start_dt >= end_dt:
                    raise ValueError("scheduled_end must be after scheduled_start")
            except ValueError as e:
                if "scheduled_end must be after" in str(e):
                    raise e
                # Ignore strict ISO parse errors here to allow legacy fallback formats
        return v

@router.post("/admin/bulk-create-sessions")
def bulk_create_sessions(data: BulkCreateSession, background_tasks: BackgroundTasks, current_admin: dict = Depends(get_current_admin_details)):
    from bson import ObjectId
    from bson.errors import InvalidId
    
    # ENFORCE SUBSCRIPTION PLAN
    if current_admin.get("role") not in ["super_admin", "master"]:
        try:
            admin_oid = ObjectId(data.admin_id)
        except InvalidId:
            raise HTTPException(status_code=400, detail="Invalid admin ID format")
            
        admin_user = admins_collection.find_one({"_id": admin_oid})
        if not admin_user:
            raise HTTPException(status_code=404, detail="Admin not found")
        if admin_user.get("role") != "master":
            require_admin_capability(
                data.admin_id,
                "bulk_interviews",
                "Bulk interviews require the Advance subscription plan. Please upgrade to continue.",
            )

    """
    Create interview sessions for multiple candidates at once.
    Each candidate gets their own unique link and receives an email invitation.
    Returns a per-candidate result list with link_id, link_url, and email_sent status.
    """
    if not data.candidates:
        raise HTTPException(status_code=400, detail="No candidates provided")
        
    num_candidates = len(data.candidates)
    company_id = current_admin.get("company_id")
    
    # ATOMIC DEDUCTION (Prevents race conditions leading to negative credits)
    if company_id:
        res = companies_collection.update_one(
            {"_id": ObjectId(company_id), "credits": {"$gte": num_candidates}},
            {"$inc": {"credits": -num_candidates}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail=f"Insufficient company credits (or concurrent request). You need {num_candidates} credits.")
            
    if current_admin.get("role") == "admin":
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": num_candidates}},
            {"$inc": {"credits": -num_candidates}}
        )
        if res.modified_count == 0:
            if company_id:
                companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": num_candidates}})
            raise HTTPException(status_code=403, detail=f"Insufficient admin credits (or concurrent request). You need {num_candidates} credits.")
    elif not company_id:
        res = admins_collection.update_one(
            {"_id": ObjectId(current_admin["admin_id"]), "credits": {"$gte": num_candidates}},
            {"$inc": {"credits": -num_candidates}}
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=403, detail=f"Insufficient admin credits. You need {num_candidates} credits.")

    session_docs = []
    results = []
    now = datetime.now(timezone.utc)
    scheduled_expiry = parse_iso_datetime(data.scheduled_end)
    expiry_iso = scheduled_expiry.isoformat() if scheduled_expiry else (now + timedelta(hours=24)).isoformat()

    # Step 1: Prepare documents
    for candidate in data.candidates:
        link_id = str(uuid.uuid4())
        link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
        
        session_doc = {
            "link_id": link_id,
            "candidate_id": f"CAN{random.randint(1000, 9999)}",
            "candidate_name": candidate.candidate_name.title(),
            "candidate_email": candidate.candidate_email,
            "resume_text": candidate.resume_text,
            "job_description": data.job_description,
            "custom_email_html": data.custom_email_html,
            "created_by": data.admin_id,
            "company_id": current_admin.get("company_id"),
            "created_at": now.isoformat(),
            "expires_at": expiry_iso,
            "interview_duration": data.interview_duration,
            "interview_format": data.interview_format,
            "interview_type": data.interview_type,
            "industry_type": data.industry_type,
            "language": data.language,
            "case_study_count": data.case_study_count,
            "record_video": candidate.record_video,  # Task 5: Per-candidate video
            "voice_clone": data.voice_clone,
            "custom_voice_id": data.custom_voice_id,
            "status": "pending",
            "hr_screening": data.hr_screening.dict(),
            "custom_questions": data.custom_questions,
            "ai_instructions": data.ai_instructions
        }
        if data.scheduled_start:
            session_doc["scheduled_start"] = data.scheduled_start
            start_dt = parse_iso_datetime(data.scheduled_start)
            if start_dt:
                send_at = start_dt - timedelta(minutes=15)
                if send_at > now:
                    session_doc["invite_email_status"] = "pending"
                    session_doc["invite_email_send_at"] = send_at.isoformat()
                    session_doc["invite_email_sent_at"] = None
        if data.scheduled_end:
            session_doc["scheduled_end"] = data.scheduled_end

        if "invite_email_status" not in session_doc:
            session_doc["invite_email_status"] = "sent"
            session_doc["invite_email_send_at"] = now.isoformat()
            session_doc["invite_email_sent_at"] = now.isoformat()
            
        session_docs.append(session_doc)
        
        results.append({
            "candidate_name": candidate.candidate_name.title(),
            "candidate_email": candidate.candidate_email,
            "link_id": link_id,
            "link_url": link_url,
            "email_sent": False,
            "email_scheduled": False,
            "email_send_at": "",
            "status": "success",
            "error": None,
            "session_doc": session_doc # Temp storage for email queueing
        })

    # Step 2: Batch Insert to MongoDB
    try:
        if session_docs:
            insert_result = interview_sessions_collection.insert_many(session_docs)
            for doc, object_id in zip(session_docs, insert_result.inserted_ids):
                doc["_id"] = object_id
    except Exception as db_err:
        print(f" Bulk DB Insert Error: {db_err}")
        # If the batch fails, mark all as failed
        for r in results:
            r["status"] = "error"
            r["error"] = f"DB batch error: {db_err}"
            r["link_id"] = None
            r["link_url"] = None

    # Step 3: Trigger Background Emails
    successful = sum(1 for r in results if r["status"] == "success")  # Only deduct credits for actually successful DB inserts
    email_jobs = []
    
    for r in results:
        if r["status"] == "success":
            doc = r.pop("session_doc") # Remove temp doc before returning JSON
            # ObjectId is not JSON serializable for Celery
            if "_id" in doc:
                doc["_id"] = str(doc["_id"])
            email_jobs.append({"doc": doc, "link_url": r["link_url"]})
            # Optimistically mark as sent/scheduled since we dispatch to background
            r["email_sent"] = not doc.get("invite_email_send_at") or doc["invite_email_status"] == "sent"
            r["email_scheduled"] = doc.get("invite_email_status") == "pending"
            r["email_send_at"] = doc.get("invite_email_send_at") or ""
        else:
            r.pop("session_doc", None)

    # Queue the slow email sending process to run in the background (Celery)
    from app.tasks import process_bulk_emails_task
    process_bulk_emails_task.delay(email_jobs)

    print(f" Bulk sessions created: {successful}/{len(results)}")
    
    # Refund failed candidates (credits were deducted atomically beforehand)
    failed = num_candidates - successful
    if failed > 0:
        company_id = current_admin.get("company_id")
        if company_id:
            companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": failed}})
            
        if current_admin.get("role") == "admin":
            admins_collection.update_one({"_id": ObjectId(current_admin["admin_id"])}, {"$inc": {"credits": failed}})
        elif not company_id:
            admins_collection.update_one({"_id": ObjectId(current_admin["admin_id"])}, {"$inc": {"credits": failed}})

    return {
        "status": "success",
        "total": len(results),
        "successful": successful,
        "failed": len(results) - successful,
        "results": results
    }


@router.get("/session/{link_id}")
def get_session_by_link(link_id: str):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if row:
        expires_at = row.get("expires_at")
        now = datetime.now(timezone.utc)
        
        # Check if the link has expired
        is_expired = False
        if expires_at:
            try:
                expiration_time = parse_iso_datetime(expires_at)
                if now > expiration_time:
                    is_expired = True
            except Exception as e:
                print(f"Error parsing expiration time: {e}")
        
        # Task 4: Check if interview is within scheduled time window
        is_before_schedule = False
        scheduled_start = row.get("scheduled_start", "")
        scheduled_end = row.get("scheduled_end", "")
        if scheduled_start:
            try:
                start_time = parse_iso_datetime(scheduled_start)
                if now < start_time:
                    is_before_schedule = True
            except Exception:
                pass
        if scheduled_end:
            try:
                end_time = parse_iso_datetime(scheduled_end)
                if now > end_time:
                    is_expired = True
            except Exception:
                pass
                
        return {
            "status": "success",
            "candidate_name": row.get("candidate_name"),
            "resume_text": row.get("resume_text"),
            "job_description": row.get("job_description"),
            "session_status": row.get("status"),
            "interview_duration": int(row.get("interview_duration") or 30) if row.get("interview_duration") else 30,
            "interview_format": row.get("interview_format", "Standard"),
            "is_expired": is_expired,
            "is_before_schedule": is_before_schedule,
            "scheduled_start": scheduled_start,
            "scheduled_end": scheduled_end,
            "record_video": row.get("record_video", True),
            "is_deactivated": row.get("is_deactivated", False),
            "language": row.get("language", "English"),
            "interview_type": row.get("interview_type", "Technical"),
            "voice_clone": row.get("voice_clone", False),
            "custom_voice_id": row.get("custom_voice_id", "")
        }
    else:
        raise HTTPException(status_code=404, detail="Session not found")
@router.get("/admin/sessions")
def get_all_sessions(
    current_admin: dict = Depends(get_current_admin_details), 
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    sort_by: str = "score", 
    deactivated: str = "false",
    admin_id: Optional[str] = None
):
    company_id = current_admin.get("company_id")
    if deactivated == "all":
        query_filter = {"company_id": company_id}
    elif deactivated == "true":
        query_filter = {"company_id": company_id, "is_deactivated": True}
    else:
        # Default: only active
        query_filter = {"company_id": company_id, "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]}
        
    # Data Isolation:
    if current_admin.get("role") == "admin":
        query_filter["created_by"] = current_admin["admin_id"]
    elif admin_id:
        query_filter["created_by"] = admin_id

    
    if (start_date and start_date.strip()) or (end_date and end_date.strip()):
        date_filter = {}
        if start_date and start_date.strip():
            date_filter["$gte"] = start_date
        if end_date and end_date.strip():
            date_filter["$lte"] = end_date + "T23:59:59"
        query_filter["created_at"] = date_filter
    
    sort_field = [("created_at", -1)] if sort_by == "date" else [("avg_score", -1), ("created_at", -1)]
    
    projection = {
        "link_id": 1, "candidate_id": 1, "candidate_name": 1, "candidate_email": 1, "status": 1, 
        "created_at": 1, "expires_at": 1, "interview_duration": 1, "interview_id": 1, 
        "avg_score": 1, "overall_recommendation": 1, "decision": 1, 
        "recording_path": 1, "record_video": 1, "is_deactivated": 1
    }
    
    rows = list(interview_sessions_collection.find(query_filter, projection).sort(sort_field))
    
    # Pre-fetch recording paths to prevent N+1 query problem
    interview_ids_to_fetch = [row.get("interview_id") for row in rows if row.get("interview_id") and not row.get("recording_path")]
    interview_doc_map = {}
    if interview_ids_to_fetch:
        interview_docs = list(interviews_collection.find({"id": {"$in": interview_ids_to_fetch}}, {"id": 1, "recording_path": 1}))
        for doc in interview_docs:
            interview_doc_map[doc.get("id")] = doc.get("recording_path")
    
    sessions = []
    now = datetime.now(timezone.utc)
    for row in rows:
        has_video = False
        interview_id = row.get("interview_id")
        rec_path = row.get("recording_path")
        
        if interview_id and not rec_path:
            rec_path = interview_doc_map.get(interview_id)
        if rec_path:
            # Cloudinary URLs are DB-backed remote videos; local fallbacks need a file check.
            if rec_path.startswith("http") or os.path.exists(rec_path):
                has_video = True
                
        status = row.get("status", "pending")
        if status == "pending" and row.get("expires_at"):
            try:
                exp_dt = datetime.fromisoformat(row["expires_at"].replace('Z', '+00:00'))
                if exp_dt.tzinfo is None:
                    exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                if now > exp_dt:
                    status = "expired"
                    interview_sessions_collection.update_one({"_id": row["_id"]}, {"$set": {"status": "expired"}})
            except Exception:
                pass
        elif status == "started":
            time_ref_str = row.get("started_at") or row.get("created_at")
            if time_ref_str:
                try:
                    time_ref = datetime.fromisoformat(time_ref_str.replace('Z', '+00:00'))
                    if time_ref.tzinfo is None:
                        time_ref = time_ref.replace(tzinfo=timezone.utc)
                    duration_mins = int(row.get("interview_duration") or 30)
                    buffer_mins = max(120, duration_mins * 2)
                    if (now - time_ref).total_seconds() > (buffer_mins * 60):
                        status = "expired"
                        interview_sessions_collection.update_one({"_id": row["_id"]}, {"$set": {"status": "expired"}})
                except Exception:
                    pass

        sessions.append({
            "link_id": row.get("link_id"),
            "candidate_id": row.get("candidate_id"),
            "candidate_name": row.get("candidate_name"),
            "candidate_email": row.get("candidate_email"),
            "status": status,
            "created_at": row.get("created_at"),
            "expires_at": row.get("expires_at"),
            "interview_duration": row.get("interview_duration"),
            "interview_id": interview_id,
            "avg_score": row.get("avg_score"),
            "recommendation": row.get("overall_recommendation"),
            "decision": row.get("decision"),
            "has_video": has_video,
            "record_video": row.get("record_video", True),
            "is_deactivated": row.get("is_deactivated", False)
        })
        
    return {"status": "success", "sessions": sessions}

@router.delete("/admin/sessions/{link_id}")
def delete_session(link_id: str, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if current_admin.get("role") != "master" and row.get("company_id") != current_admin.get("company_id"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    # Delete from interview tracking
    interview_id = row.get("interview_id")
    if interview_id:
        interviews_collection.delete_one({"id": interview_id})
        answers_collection.delete_many({"interview_id": interview_id})
        if get_session(interview_id):
            delete_session(interview_id)
            
    # Delete the session link
    interview_sessions_collection.delete_one({"link_id": link_id})
    
    return {"status": "success", "message": "Session deleted"}

@router.post("/admin/sessions/{link_id}/deactivate")
def deactivate_session(link_id: str, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_admin.get("role") != "master" and row.get("company_id") != current_admin.get("company_id"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"is_deactivated": True}})
    return {"status": "success"}

@router.post("/admin/sessions/{link_id}/activate")
def activate_session(link_id: str, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_admin.get("role") != "master" and row.get("company_id") != current_admin.get("company_id"):
        raise HTTPException(status_code=403, detail="Access denied")
        
    interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"is_deactivated": False}})
    return {"status": "success"}

@router.post("/admin/sessions/{link_id}/reschedule")
def reschedule_session(link_id: str, new_expiry: str = Form(...), new_start: str = Form(None), current_admin: dict = Depends(require_role("admin", "super_admin"))):
    """
    Reschedule an interview by updating its expires_at date 
    and resetting its status to pending (if it was expired).
    """
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_admin.get("role") != "master" and row.get("company_id") != current_admin.get("company_id"):
        raise HTTPException(status_code=403, detail="Access denied")
    update_data = {
        "expires_at": new_expiry,
        "status": "pending",
        "is_deactivated": False # Ensure it's active if rescheduled
    }
    
    if new_start:
        update_data["scheduled_start"] = new_start
    
    # Also update scheduled_end if it exists for consistency
    update_data["scheduled_end"] = new_expiry
    result = interview_sessions_collection.update_one(
        {"link_id": link_id}, 
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
        
    # Fetch the updated session for email dispatch
    updated_session = interview_sessions_collection.find_one({"link_id": link_id})
    link_url = f"{FRONTEND_URL}/interview?session_id={link_id}"
    
    # Re-send the invitation email to the candidate
    email_result = queue_or_send_interview_email(updated_session, link_url)
    
    return {
        "status": "success", 
        "message": "Session rescheduled and email sent",
        "email_sent": email_result.get("email_sent", False),
        "email_scheduled": email_result.get("email_scheduled", False)
    }

@router.post("/start-session-interview")
@router.post("/start_session_interview")
def start_session_interview(link_id: str = Form(...)):
    current_session_id.set(link_id)
    row = interview_sessions_collection.find_one({"link_id": link_id})
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
        
    candidate_name = row.get("candidate_name")
    candidate_email = row.get("candidate_email")
    resume_text = row.get("resume_text")
    job_description = row.get("job_description")
    status = row.get("status")
    interview_type = row.get("interview_type", "Technical")
    num_questions = row.get("num_questions")
    raw_duration = row.get("interview_duration")
    try:
        interview_duration = int(raw_duration) if raw_duration and int(raw_duration) > 0 else 30
    except (ValueError, TypeError):
        interview_duration = 30
    print(f"[TIMER DEBUG] link_id={link_id}, raw interview_duration from DB={row.get('interview_duration')}, used={interview_duration}")
    existing_interview_id = row.get("interview_id")
    expires_at = row.get("expires_at")
    
    # Check if the link has expired
    if expires_at:
        try:
            expiration_time = parse_iso_datetime(expires_at)
            if datetime.now(timezone.utc) > expiration_time:
                return {
                    "is_expired": True,
                    "message": "This interview link has expired. Please contact your administrator."
                }
        except Exception as e:
            print(f"Error parsing expiration time in start_session_interview: {e}")
            
    # Check scheduled restrictions (Task 4)
    scheduled_start = row.get("scheduled_start")
    scheduled_end = row.get("scheduled_end")
    if scheduled_start:
        try:
            start_time = parse_iso_datetime(scheduled_start)
            if datetime.now(timezone.utc) < start_time:
                return {
                    "is_before_schedule": True,
                    "scheduled_start": scheduled_start,
                    "scheduled_end": scheduled_end
                }
        except Exception as e:
            print(f"Error parsing scheduled_start time in start_session_interview: {e}")

    if scheduled_end:
        try:
            end_time = parse_iso_datetime(scheduled_end)
            if datetime.now(timezone.utc) > end_time:
                return {
                    "is_expired": True,
                    "message": "This interview window has ended. Please contact your administrator."
                }   
        except Exception as e:
            print(f"Error parsing scheduled_end time in start_session_interview: {e}")
    
    # If session was already started or completed, don't restart — return status
    if status in ('started', 'completed') and existing_interview_id:
        if status == 'started':
            from datetime import timedelta
            started_at_str = row.get("started_at")
            if started_at_str:
                try:
                    started_at = parse_iso_datetime(started_at_str)
                    # Block resuming if time elapsed exceeds duration + 5 minutes buffer
                    if datetime.now(timezone.utc) > started_at + timedelta(minutes=interview_duration + 5):
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {"$set": {"status": "completed"}}
                        )
                        status = "completed"
                except Exception as e:
                    print(f"Error parsing started_at: {e}")

        if status == 'completed':
            return {
                "already_started": True,
                "session_status": status,
                "candidate_name": candidate_name,
                "interview_id": existing_interview_id,
                "interview_duration": interview_duration
            }
        
        # Status is 'started' — reload the existing interview and return first question
        existing = get_session(existing_interview_id)
        if not existing:
            row2 = interviews_collection.find_one({"id": existing_interview_id})
            if row2:
                try:
                    loaded_questions = json.loads(row2.get("questions", "[]"))
                    existing = {
                        "id": existing_interview_id,
                        "source": row2.get("source"),
                        "profile_text": row2.get("profile_text", ""),
                        "questions": loaded_questions,
                        "answers": {},
                        "created_at": row2.get("created_at")
                    }
                    set_session(existing_interview_id, existing)
                except Exception:
                    existing = None
        
        if existing and existing.get("questions"):
            questions = existing["questions"]

            # ── Find the last answered question so we can resume from there ──
            resume_question_id = None
            try:
                answered_docs = list(answers_collection.find(
                    {"interview_id": existing_interview_id},
                    {"question_id": 1, "_id": 0}
                ))
                if answered_docs:
                    answered_ids = [
                        int(a["question_id"]) for a in answered_docs
                        if a.get("question_id") is not None
                    ]
                    if answered_ids:
                        last_answered = max(answered_ids)
                        # Resume at the next unanswered question (capped to last question)
                        next_q_id = last_answered + 1
                        if next_q_id <= len(questions):
                            resume_question_id = next_q_id
                        else:
                            resume_question_id = last_answered  # already done all
                            
            except Exception as resume_err:
                print(f" Could not determine resume question: {resume_err}")

            resume_question = next(
                (q for q in questions if int(q["id"]) == resume_question_id),
                questions[0]
            ) if resume_question_id else questions[0]
            
            # Determine if we should skip the verbal round entirely upon resume
            all_verbal_answered = False
            try:
                if answered_ids and len(answered_ids) >= len(questions):
                    all_verbal_answered = True
            except:
                pass

            return {
                "status": "started",
                "interview_id": existing_interview_id,
                "questions": questions,
                "first_question": resume_question,
                "resume_question_id": resume_question_id or 1,
                "total_questions": len(questions),
                "candidate_name": candidate_name,
                "interview_duration": interview_duration,
                "interview_type": interview_type,
                "interview_format": row.get("interview_format", "Standard"),
                "record_video": row.get("record_video", True),
                "all_verbal_answered": all_verbal_answered,
                "started_at": row.get("started_at")
            }
        
        # Fallback: regenerate if questions lost
        return {
            "already_started": True,
            "session_status": status,
            "candidate_name": candidate_name,
            "interview_id": existing_interview_id,
            "interview_duration": interview_duration
        }
    
    # Always generate a full pool of questions — interview is time-based,
    # candidates answer as many as they can within the interview_duration timer
    num_questions_to_generate = 20
    
    # Generate Questions
    source = "job_description" if job_description and len(job_description) > 50 else "resume"
    content_str = job_description if source == "job_description" else resume_text
    
    profile_analysis = analyze_resume_or_jd(content_str)
    
    hr_screening = row.get("hr_screening")
    custom_questions_text = row.get("custom_questions", "")
    ai_instructions_text = row.get("ai_instructions", "")
    language = row.get("language", "English")
    industry_val = row.get("industry") or row.get("industry_type") or "General"
    
    if language != "English":
        ai_instructions_text += f"\n\nCRITICAL REQUIREMENT: You MUST generate all questions and interact STRICTLY in the {language} language. Do NOT use English."
    
    # ── Strategy 3: Load pre-cached questions if already generated ──────────
    pre_cached_questions = row.get("pre_generated_questions")
    if pre_cached_questions:
        try:
            questions = json.loads(pre_cached_questions) if isinstance(pre_cached_questions, str) else pre_cached_questions
            if questions:
                print(f"⚡ Loaded {len(questions)} pre-cached questions instantly (no AI call needed)")
            else:
                raise ValueError("Empty questions list")
        except Exception:
            questions = None
    else:
        questions = None

    if not questions:
        print("🤖 Generating questions via AI (not pre-cached)...")
        questions = generate_mock_questions(
            content_str, 
            source, 
            num_questions=num_questions_to_generate, 
            resume_text=resume_text, 
            jd_text=job_description,
            hr_screening=hr_screening,
            custom_questions=custom_questions_text,
            ai_instructions=ai_instructions_text,
            interview_type=interview_type,
            industry=industry_val,
            language=language
        )
    
    if not questions:
        raise HTTPException(status_code=400, detail="Failed to generate questions")

    interview_id = f"int_{int(datetime.now(timezone.utc).timestamp())}_{uuid.uuid4().hex[:8]}"

    # Store interview data (RAM)
    set_session(interview_id, {
        "id": interview_id,
        "source": source,
        "profile_text": content_str[:5000],
        "profile_analysis": profile_analysis,
        "questions": questions,
        "answers": {},
        "created_at": datetime.now(timezone.utc).isoformat(),
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "status": status,
        "language": language
    })
    
    # Store interview data (DB)
    try:
        interviews_collection.insert_one({
            "id": interview_id,
            "source": source,
            "profile_text": content_str[:5000],
            "questions": json.dumps(questions),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "language": language
        })
        
        # Update session status AND cache questions for instant future loads
        interview_sessions_collection.update_one(
            {"link_id": link_id},
            {"$set": {
                "status": "started", 
                "interview_id": interview_id,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "pre_generated_questions": json.dumps(questions)  # cache for instant reload
            }}
        )
    except Exception as db_e:
        print(f" DB Save Error: {db_e}")
    return {
        "status": "started",
        "interview_id": interview_id,
        "questions": questions,
        "first_question": questions[0] if questions else None,
        "total_questions": len(questions),
        "candidate_name": candidate_name,
        "interview_duration": interview_duration,
        "interview_format": row.get("interview_format", "Standard"),
        "interview_type": interview_type,
        "record_video": row.get("record_video", True),
        "started_at": datetime.now(timezone.utc).isoformat()
    }

@router.post("/session/{interview_id}/violation")
def log_violation(interview_id: str, violation: ViolationRequest):
    print(f" VIOLATION detected for session {interview_id}: {violation.type} (#{violation.count}) at {violation.timestamp}")
    try:
        interview_sessions_collection.update_one(
            {"interview_id": interview_id},
            {"$push": {"violations": violation.dict()}}
        )
        return {"status": "success"}
    except Exception as e:
        print(f" Error logging violation: {e}")
        return {"status": "error", "message": str(e)}


class ProctoringViolationRequest(BaseModel):
    interview_id: Optional[str] = ""
    link_id: Optional[str] = ""
    candidate_id: Optional[str] = ""
    violation_type: str
    details: Optional[str] = ""
    timestamp: Optional[str] = ""


@router.post("/proctoring/violation")
def log_proctoring_violation(data: ProctoringViolationRequest):
    """
    Unified proctoring violation endpoint.
    Accepts interview_id OR link_id to locate the session.
    Stores violation in session.violations[] and increments violation_count.
    Returns current violation_count so the caller can enforce termination threshold.
    """
    ts = data.timestamp or datetime.now(timezone.utc).isoformat()

    violation_doc = {
        "type": data.violation_type,
        "details": data.details or "",
        "candidate_id": data.candidate_id or "",
        "timestamp": ts,
    }

    try:
        # Locate session by interview_id first, then link_id as fallback
        query: dict = {}
        if data.interview_id:
            query = {"interview_id": data.interview_id}
        elif data.link_id:
            query = {"link_id": data.link_id}
        else:
            return {"status": "error", "message": "interview_id or link_id required"}

        result = interview_sessions_collection.find_one_and_update(
            query,
            {
                "$push": {"violations": violation_doc},
                "$inc":  {"violation_count": 1},
            },
            return_document=True,   # return updated document
            projection={"violation_count": 1, "_id": 0},
        )

        violation_count = result.get("violation_count", 1) if result else 1
        print(f"[Proctoring] {data.violation_type} | session={data.interview_id or data.link_id} | total={violation_count}")

        return {
            "status": "success",
            "violation_count": violation_count,
        }
    except Exception as e:
        print(f"[Proctoring] Error logging violation: {e}")
        return {"status": "error", "message": str(e)}


@router.post("/admin/update-decision")
@router.post("/admin/update_decision")
def update_decision(data: DecisionRequest, current_admin: dict = Depends(require_role("admin", "super_admin"))):
    print(f" Decision Update Request: link_id={data.link_id}, decision={data.decision}")
    try:
        if data.link_id.startswith("ai_call_"):
            app_id = data.link_id.replace("ai_call_", "")
            from bson import ObjectId
            try:
                app = job_applications_collection.find_one({"_id": ObjectId(app_id)})
            except Exception:
                app = None
            if not app:
                app = job_applications_collection.find_one({"omni_call_id": app_id})
            if not app:
                raise HTTPException(status_code=404, detail="AI Call candidate not found")
                
            job_applications_collection.update_one({"_id": app["_id"]}, {"$set": {"decision": data.decision}})
            
            name = app.get("name") or "Candidate"
            email = app.get("email")
            jd = app.get("job_description") or ""
            
            load_dotenv(override=True)
            email_sent = False
            email_reason = "No candidate email found"
            if email:
                email_sent = send_decision_email(email, name, data.decision, jd)
                email_reason = "Success" if email_sent else "Email service error (Brevo API failed)"
            
            return {"status": "success", "decision": data.decision, "email_sent": email_sent, "email_reason": email_reason}

        # 1. Fetch candidate details for email
        row = interview_sessions_collection.find_one({"link_id": data.link_id})
        if not row:
            print(f" Session NOT found for link_id: {data.link_id}")
            raise HTTPException(status_code=404, detail="Session not found")
        
        if current_admin.get("role") != "master" and row.get("company_id") != current_admin.get("company_id"):
            raise HTTPException(status_code=403, detail="Access denied")
        
        name = row.get("candidate_name")
        email = row.get("candidate_email")
        jd = row.get("job_description")
        print(f" Candidate: {name}, Email: {email}")
        
        # 2. Update DB
        interview_sessions_collection.update_one({"link_id": data.link_id}, {"$set": {"decision": data.decision}})
        print(f" DB Updated for {data.link_id}")
        
        # 3. Send Email
        load_dotenv(override=True)
        email_sent = False
        email_reason = "No candidate email found"
        if email:
            email_sent = send_decision_email(email, name, data.decision, jd)
            print(f" Email sent: {email_sent}")
            email_reason = "Success" if email_sent else "Email service error (Brevo API failed)"
        else:
            print(" No email found for candidate, skipping notification.")
        
        return {"status": "success", "decision": data.decision, "email_sent": email_sent, "email_reason": email_reason}
    except Exception as e:
        print(f" Decision update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def send_decision_email(email: str, name: str, decision: str, jd: str):
    import requests
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=True)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    
    if not api_key: return False

    subject = "Interview Result - Invitation for next steps" if decision == 'selected' else "Application Status Update"
    
    if decision == 'selected':
        html = f"""
        <html><body>
            <h3>Congratulations {name}!</h3>
            <p>We are pleased to inform you that you have successfully cleared the AI interview for the role.</p>
            <p><b>Next Steps:</b> Our recruitment team will reach out to you shortly for the final technical/HR round. Please stay reachable on this email.</p>
            <p>Best Regards,<br/>Hire IQ Recruiting Team</p>
        </body></html>
        """
    else:
        html = f"""
        <html><body>
            <h3>Application Update</h3>
            <p>Dear {name},</p>
            <p>Thank you for taking the time to interview with us. Unfortunately, we have decided not to move forward with your application at this time.</p>
            <p>We were impressed with your background, but we had many qualified candidates for this role. We wish you the very best in your job search.</p>
            <p>Best Regards,<br/>Hire IQ Recruiting Team</p>
        </body></html>
        """

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": name}],
        "subject": subject,
        "htmlContent": html
    }
    
    try:
        res = requests.post("https://api.brevo.com/v3/smtp/email", json=payload, headers={
            "api-key": api_key, "content-type": "application/json"
        }, timeout=10)
        if res.status_code >= 300:
            print(f" Brevo Error: {res.status_code} - {res.text}")
        return res.status_code < 300
    except Exception as email_err:
        print(f" Email sending error: {email_err}")
        return False

class CopilotMessage(BaseModel):
    role: str
    content: str

class CopilotRequest(BaseModel):
    message: str
    history: list[CopilotMessage] = []
    admin_id: Optional[str] = None

@router.post("/admin/copilot")
def admin_copilot_chat(request: CopilotRequest, raw_request: Request, current_admin: dict = Depends(get_current_admin_details)):
    try:
        from ai_client import chat_completion
        from mongo_db import db
        
        role = current_admin.get("role", "admin")
        admin_id = current_admin.get("admin_id")
        company_id = current_admin.get("company_id")
        
        def strip_markdown(text: str) -> str:
            if not text:
                return ""
            import re
            t = re.sub(r'```[a-zA-Z0-9]*', '', text)
            t = re.sub(r'\*\*|__|\*|_|#', '', t)
            return t.strip()
        
        # 1. Dynamic platform routing metadata (Filtered and capped to save tokens)
        dynamic_endpoints = []
        for r in getattr(raw_request.app, "routes", []):
            if hasattr(r, "path") and hasattr(r, "methods") and ("/admin" in r.path or "/api/plans" in r.path):
                if "notification" in r.path or "ws" in r.path:
                    continue
                methods_str = ", ".join(r.methods - {"HEAD", "OPTIONS"})
                if methods_str:
                    endpoint_name = r.endpoint.__name__ if hasattr(r, "endpoint") else ""
                    docstring = ""
                    if hasattr(r, "endpoint") and r.endpoint.__doc__:
                        docstring = r.endpoint.__doc__.strip().split('\n')[0].strip()
                    doc_suffix = f" -> {docstring}" if docstring else ""
                    dynamic_endpoints.append(f"- Endpoint `{r.path}` ({methods_str}) [Handler: {endpoint_name}]{doc_suffix}")
        endpoints_context = "\n".join(dynamic_endpoints[:5])
 
        # 2. Dynamic database collections and records count (Filtered to essential collections)
        dynamic_collections = []
        try:
            coll_names = db.list_collection_names()
            important_colls = {"jobs", "job_applications", "interview_sessions", "admins"}
            for col in coll_names:
                if col in important_colls:
                    doc_count = db[col].count_documents({})
                    dynamic_collections.append(f"- Collection '{col}': {doc_count} documents")
        except Exception as db_err:
            dynamic_collections.append(f"- Database query failed: {db_err}")
        db_context_meta = "\n".join(dynamic_collections)
 
        # 3. Dynamic subscription plans (Capped)
        dynamic_plans = []
        try:
            plans = list(plans_collection.find({}, {"_id": 0}))
            for p in plans[:3]:
                dynamic_plans.append(f"- Plan: {p.get('name', 'N/A')} (Key: {p.get('plan_key', 'N/A')}) | Price: {p.get('price_monthly', 0)} USD/mo | Credits: {p.get('credits_granted', 0)}")
        except Exception:
            pass
        plans_context = "\n".join(dynamic_plans)

        system_prompt = f"""You are the 'Hire IQ Admin Copilot', a specialized AI assistant embedded within the Admin Dashboard of the Hire IQ Mock Interview platform.
You are currently talking to a user with the role: {role.upper()}.

YOUR PURPOSE:
Your purpose is to help the admin understand and navigate this website, AND to perform specific administrative actions when requested.

DYNAMIC MODULE & FEATURE RECOGNITION:
Do not rely on hardcoded feature or module names. You must dynamically inspect the platform structure using the context details provided below:
1. "DYNAMIC PLATFORM MODULES & ROUTING METADATA": Outlines all available API routes, endpoints, HTTP methods, and module descriptions.
2. "DYNAMIC DATABASE SCHEMA & COLLECTIONS METADATA": Outlines MongoDB tables and count of records, reflecting available features.
3. "ACTIVE SUBSCRIPTION PLANS": Outlines all plans, credit grants, and prices.
Use this information to answer user questions about any module, view, or functionality of the platform, even if new ones are added dynamically.

YOU MUST SUPPORT:
1. General HireIQ conversations (e.g. greetings, role explanations, HireIQ small talk).
2. Platform questions (answering how any module, endpoint, or system feature works by mapping them to the active routes and database context).
3. Navigation help (guiding the admin to pages by mapping their query to the listed Admin / Tenant routes).
4. Candidate, job, and application queries (using the context data provided below to answer user questions about candidates, scores, job applications, job details, and status).
5. Email drafting (drafting feedback, rejection, or selection emails for candidates).
6. Email sending (routing to the 'send_feedback' action).
7. Admin creation (routing to the 'create_admin' action).
8. Credit management (routing to 'request_credits', 'transfer_credits', or 'buy_credits' actions).

CRITICAL RULES:
1. Direct LLM Responses: For HireIQ-related queries (categories 1 to 5), you must answer the user directly. Keep your answers concise, accurate, and professional.
2. Action Responses: For action requests (categories 6 to 8), you must output exactly one short sentence confirming the action, followed IMMEDIATELY by a JSON block.
   The JSON block MUST be exactly in this format:
   ```json
   {{
       "action": "action_name",
       ... (other required fields)
   }}
   ```
   Supported actions and roles:
   - send_feedback: Available for admin and super_admin. Schema: `{{'action': 'send_feedback', 'candidate_email': '...', 'content': '...'}}`
   - request_credits: Available for admin only. Schema: `{{'action': 'request_credits', 'amount': ..., 'reason': '...'}}`
   - transfer_credits: Available for super_admin only. Schema: `{{'action': 'transfer_credits', 'admin_username': '...', 'amount': ...}}`
   - buy_credits: Available for super_admin only. Schema: `{{'action': 'buy_credits', 'amount': ...}}`
   - create_admin: Available for super_admin only. Schema: `{{'action': 'create_admin', 'username': '...', 'email': '...'}}`
3. Formatting Rules:
   - You MUST format all responses as clean, structured, numbered or bulleted lists.
   - You MUST NOT use any Markdown formatting such as **bold**, *italics*, _underscores_, or code blocks in your responses unless the user explicitly requests them (or for the required JSON action blocks).
   - Responses should be plain, professional, clean, and easy to read while preserving the same information.
4. Unrelated Topics: For any topic unrelated to HireIQ (such as general knowledge, coding help, non-HireIQ conversation, general assistant questions), you MUST politely decline. Use this fallback response: "I'm sorry, I can only help you with questions related to the HireIQ platform, its dashboard, candidate data, and standard admin actions."
5. Do NOT echo or repeat the user's question. Provide the answer or the action directly.
"""

        context_data = ""
        context_data += "\n--- DYNAMIC PLATFORM MODULES & ROUTING METADATA ---\n"
        context_data += endpoints_context + "\n"
        
        context_data += "\n--- DYNAMIC DATABASE SCHEMA & COLLECTIONS METADATA ---\n"
        context_data += db_context_meta + "\n"
        
        if plans_context:
            context_data += "\n--- ACTIVE SUBSCRIPTION PLANS ---\n"
            context_data += plans_context + "\n"

        # Fetch recent jobs and applications
        recent_jobs = []
        recent_apps = []
        
        if role in ["admin", "super_admin"]:
            # Query jobs
            jobs_query = {}
            if role == "admin":
                jobs_query["admin_id"] = admin_id
            else:  # super_admin
                jobs_query["company_id"] = company_id
            
            recent_jobs = list(jobs_collection.find(
                jobs_query, 
                {"job_id": 1, "title": 1, "department": 1, "location": 1, "_id": 0}
            ).sort("created_at", -1).limit(3))
            
            if recent_jobs:
                job_ids = [j.get("job_id") for j in recent_jobs if j.get("job_id")]
                recent_apps = list(job_applications_collection.find(
                    {"job_id": {"$in": job_ids}}, 
                    {"name": 1, "email": 1, "score": 1, "status": 1, "applied_at": 1, "job_id": 1, "_id": 0}
                ).sort("applied_at", -1).limit(3))

        if role == "admin":
            recent_sessions = list(interview_sessions_collection.find(
                {"created_by": admin_id, "status": "completed"},
                {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "decision": 1, "_id": 0}
            ).sort("created_at", -1).limit(3))
            if recent_sessions:
                context_data += "\n--- YOUR RECENT CANDIDATE MOCK INTERVIEWS ---\n"
                for s in recent_sessions:
                    context_data += f"- Candidate: {s.get('candidate_name', 'Unknown')} | Email: {s.get('candidate_email', 'Unknown')} | Score: {s.get('avg_score', 'N/A')}/100 | Decision: {s.get('decision', 'None')}\n"

        elif role == "super_admin":
            sub_admins = list(admins_collection.find({"created_by": admin_id}, {"username": 1, "email": 1, "credits": 1, "_id": 0}).limit(3))
            if sub_admins:
                context_data += "\n--- YOUR SUB-ADMINS ---\n"
                for sa in sub_admins:
                    context_data += f"- Username: {sa.get('username')} | Email: {sa.get('email')} | Credits: {sa.get('credits')}\n"
                    
            recent_sessions = list(interview_sessions_collection.find(
                {"company_id": company_id, "status": "completed"},
                {"candidate_name": 1, "candidate_email": 1, "avg_score": 1, "decision": 1, "created_by": 1, "_id": 0}
            ).sort("created_at", -1).limit(3))
            if recent_sessions:
                context_data += "\n--- COMPANY CANDIDATE MOCK INTERVIEWS ---\n"
                for s in recent_sessions:
                    context_data += f"- Candidate: {s.get('candidate_name')} | Email: {s.get('candidate_email')} | Score: {s.get('avg_score')} | Created By ID: {s.get('created_by')}\n"

        if recent_jobs:
            context_data += "\n--- ACTIVE/RECENT JOBS ---\n"
            for j in recent_jobs:
                context_data += f"- Job ID: {j.get('job_id')} | Title: {j.get('title')} | Dept: {j.get('department', 'N/A')} | Loc: {j.get('location', 'N/A')}\n"
                
        if recent_apps:
            context_data += "\n--- RECENT JOB APPLICATIONS ---\n"
            for a in recent_apps:
                context_data += f"- Applicant: {a.get('name')} | Email: {a.get('email')} | Job ID: {a.get('job_id')} | Score: {a.get('score', 'N/A')} | Status: {a.get('status', 'N/A')} | Applied At: {a.get('applied_at', 'N/A')}\n"

        if role == "master":
            total_super_admins = admins_collection.count_documents({"role": "tenant"})
            total_admins = admins_collection.count_documents({})
            total_interviews = interview_sessions_collection.count_documents({})
            completed_interviews = interview_sessions_collection.count_documents({"status": "completed"})
            
            context_data += f"\n--- PLATFORM METRICS ---\n"
            context_data += f"- Total Super Admins (Tenants): {total_super_admins}\n"
            context_data += f"- Total Sub-Admins: {total_admins}\n"
            context_data += f"- Total Interviews Created: {total_interviews}\n"
            context_data += f"- Total Interviews Completed: {completed_interviews}\n"

        system_prompt += f"\n{context_data}"
        
        messages = [{"role": "system", "content": system_prompt}]
        history_list = request.history or []
        for msg in history_list[-2:]:
            if msg.role in ["user", "assistant"]:
                messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": request.message})
        
        try:
            response_text = chat_completion(messages, temperature=0.3)
            
            if not response_text or not str(response_text).strip():
                raise ValueError("Empty response from AI")
                
            import json
            import re
            
            action_required = None
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', response_text, re.DOTALL)
            if json_match:
                try:
                    action_data = json.loads(json_match.group(1))
                    if "action" in action_data:
                        action_required = action_data
                        response_text = response_text.replace(json_match.group(0), "").strip()
                except:
                    pass
                    
            return {"reply": strip_markdown(response_text), "action_required": action_required}
            
        except Exception as e:
            print(f"Warning: Copilot AI failed: {e}")
            
            # Offline Fallback Logic
            msg_lower = request.message.lower()
            
            offline_responses = {
                "generate interview questions": "- Navigate to the 'Create Interview' or 'Bulk Send' page.\n- Input your Job Description (JD).\n- The platform will automatically generate interview questions tailored to the JD.",
                "rank candidates": "- Navigate to the 'Results' dashboard.\n- View the candidates sorted by their ATS Score and overall interview performance score.",
                "draft feedback emails": "- Navigate to the candidate's specific results page.\n- Click the 'Send Feedback Email' button.\n- A customized draft feedback email will be generated automatically.",
                "api": "- Configuration: API keys are configured in the 'Settings' section.\n- Quota Limits: If you run out of API quota, the system switches to offline fallbacks for scoring and copilot help.",
                "quota": "- System Quota: If your API quota limit is reached, essential features will switch to using offline fallback logic.",
                "buy credits": "- Purchase Credits: Go to the 'Plan & Usage' section of your dashboard.\n- Contact Admin: Alternatively, contact the master administrator for support.",
                "transfer credits": "- Admin Dashboard: Navigate to the 'Admins' dashboard page.\n- Transfer: Use the 'Add Credits' button next to the sub-admin's account name.",
                "create admin": "- Sub-Admins Page: Go to the 'Admins' page in the dashboard.\n- Create Recruiter: Click on the 'Create Admin' button.",
                "hello": f"- Status: Currently operating in offline fallback mode for your {role} account.\n- Reason: API quota has been exceeded.\n- Support: I can answer basic platform navigation and configuration questions.",
                "hi": f"- Status: Currently operating in offline mode.\n- Navigation: I can help you locate features or modules in the {role} dashboard."
            }
            
            for keyword, response in offline_responses.items():
                if keyword in msg_lower:
                    return {"reply": f"[Offline Mode] {strip_markdown(response)}"}
                    
            return {"reply": strip_markdown(f"[Offline Mode] - Status: AI connection is currently offline due to quota limits.\n- Support: I can only answer basic FAQ questions for your {role} account right now.")}

    except Exception as e:
        import traceback
        tb_str = traceback.format_exc()
        print(f"Error in admin_copilot_chat: {tb_str}")
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}\n{tb_str}")

class CopilotExecuteRequest(BaseModel):
    action: str
    data: dict

@router.post("/admin/copilot/execute")
def admin_copilot_execute(request: CopilotExecuteRequest, current_admin: dict = Depends(get_current_admin_details)):
    try:
        role = current_admin.get("role", "admin")
        admin_id = current_admin.get("admin_id")
        
        if request.action == "send_feedback":
            email = request.data.get("candidate_email")
            content = request.data.get("content")
            if not email or not content:
                raise HTTPException(status_code=400, detail="Missing email or content")
                
            from app.services import send_interview_email
            # Simulate sending the plain text email using our existing service (it expects HTML but plain text works)
            send_interview_email(email, "Candidate", "", 30, "", custom_html=content.replace("\n", "<br>"))
            return {"status": "success", "message": f"Successfully sent feedback email to {email}."}
            
        elif request.action == "request_credits" and role == "admin":
            amount = request.data.get("amount", 10)
            reason = request.data.get("reason", "Requested via Copilot")
            
            from bson import ObjectId
            admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            if not admin_doc:
                raise HTTPException(status_code=404, detail="Admin not found")
                
            req = {
                "admin_id": admin_id,
                "admin_username": admin_doc.get("username", "Unknown"),
                "super_admin_id": admin_doc.get("created_by"),
                "amount": amount,
                "reason": reason,
                "status": "pending",
                "created_at": datetime.utcnow().isoformat()
            }
            credit_requests_collection.insert_one(req)
            return {"status": "success", "message": f"Successfully requested {amount} credits."}
            
        elif request.action == "transfer_credits" and role == "super_admin":
            target_username = request.data.get("admin_username")
            amount = request.data.get("amount")
            if not target_username or not amount:
                raise HTTPException(status_code=400, detail="Missing username or amount")
            
            # Find the admin
            target_admin = admins_collection.find_one({"username": target_username, "created_by": admin_id})
            if not target_admin:
                raise HTTPException(status_code=404, detail="Sub-admin not found")
                
            from bson import ObjectId
            # Perform transfer
            super_admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)})
            if super_admin_doc.get("credits", 0) < amount:
                raise HTTPException(status_code=400, detail="Insufficient credits")
                
            admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$inc": {"credits": -amount}})
            admins_collection.update_one({"_id": target_admin["_id"]}, {"$inc": {"credits": amount}})
            return {"status": "success", "message": f"Successfully transferred {amount} credits to {target_username}."}
            
        elif request.action == "create_admin" and role == "super_admin":
            username = request.data.get("username")
            email = request.data.get("email")
            if not username or not email:
                raise HTTPException(status_code=400, detail="Missing username or email")
                
            company_id = current_admin.get("company_id")
            if not company_id:
                raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
                
            if admins_collection.find_one({"username": username}):
                raise HTTPException(status_code=400, detail="Username already exists")
                
            import uuid
            default_password = f"SubAdmin{uuid.uuid4().hex[:6]}!"
            
            new_admin = {
                "username": username,
                "password": hash_password(default_password),
                "email": email,
                "name": username,
                "role": "admin",
                "company_id": company_id,
                "credits": 0,
                "login_enabled": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
            admins_collection.insert_one(new_admin)
            
            return {
                "status": "success",
                "message": f"Successfully created sub-admin '{username}' with email '{email}'. Temporary password: {default_password}"
            }
            
        elif request.action == "buy_credits" and role == "super_admin":
            amount = request.data.get("amount")
            if not amount:
                raise HTTPException(status_code=400, detail="Missing amount")
            try:
                amount = int(amount)
            except ValueError:
                raise HTTPException(status_code=400, detail="Amount must be an integer")
                
            checkout_url = f"https://checkout.stripe.com/pay/mock_session_{amount}_credits"
            return {
                "status": "success", 
                "message": f"Successfully generated a checkout link for {amount} credits: {checkout_url}"
            }
            
        else:
            raise HTTPException(status_code=400, detail=f"Unknown or unauthorized action: {request.action}")
            
    except HTTPException as he:
        raise he
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ATSRequest(BaseModel):
    resume_text: str
    jd_text: str

@router.post("/admin/ats-score")
async def calculate_ats_score(request: ATSRequest):
    try:
        resume_text = request.resume_text.strip()[:3000]
        jd_text = request.jd_text.strip()[:3000]
        
        if not resume_text or not jd_text:
            raise HTTPException(status_code=400, detail="Resume or JD is empty")
            
        # Offline Fallback logic: High-Accuracy Keyword Dictionary Match
        import re
        try:
            from offline_skills_dict import COMMON_SKILLS
        except ImportError:
            COMMON_SKILLS = set()
            
        resume_lower = resume_text.lower()
        jd_lower = jd_text.lower()
        
        # Extract common skills that exist in the Job Description
        jd_keywords = set()
        for skill in COMMON_SKILLS:
            # Use regex to match whole words/phrases to prevent partial matches
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, jd_lower):
                jd_keywords.add(skill)
        
        # If JD has no known keywords, fall back to basic extraction
        if not jd_keywords:
            words = set(re.findall(r'\b[a-z]{5,}\b', jd_lower))
            stop_words = {"about", "above", "after", "again", "against", "because", "before", "below", "between", "cannot", "could", "doing", "during", "further", "having", "herself", "himself", "itself", "myself", "ought", "ourselves", "themselves", "there", "these", "those", "through", "under", "until", "where", "which", "while", "would", "yourself", "yourselves", "experience", "years", "skills", "ability", "working", "knowledge", "strong", "understanding", "preferred", "required", "responsibilities", "requirements", "including"}
            jd_keywords = {w for w in words if w not in stop_words}
        
        matched = []
        missing = []
        
        for word in jd_keywords:
            pattern = r'\b' + re.escape(word) + r'\b'
            if re.search(pattern, resume_lower):
                matched.append(word.title())
            else:
                missing.append(word.title())
                
        # Sort lists (limit to top 15 for UI clarity)
        matched = sorted(matched)[:15]
        missing = sorted(missing)[:15]
        
        # Calculate score based ONLY on the validated dictionary skills
        total_keywords = len(jd_keywords)
        matched_count = len(matched)
        if total_keywords > 0:
            score = min(100, int((matched_count / total_keywords) * 100))
        else:
            score = 0
        
        if not matched and not missing:
            matched.append("No clear skills found")
            missing.append("No clear skills found")
            
        return {
            "score": score,
            "matched_skills": matched,
            "missing_skills": missing,
            "summary": "Offline Mode Active: This score is calculated using an offline keyword-matching algorithm because the AI Quota has been exceeded."
        }
            
    except HTTPException:
        raise
    except Exception as e:
        print(f" ATS Score endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CandidateFeedbackRequest(BaseModel):
    feedback_text: str

@router.post("/submit-feedback/{link_id}")
def submit_feedback(link_id: str, payload: CandidateFeedbackRequest):
    """Save candidate feedback into the interview session."""
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
def complete_session(link_id: str, payload: Optional[CompleteSessionRequest] = None):
    """Mark a session as completed and send notification emails (Task 3)."""
    try:
        session = interview_sessions_collection.find_one({"link_id": link_id})
        # Use default payload if none was sent by the client
        if payload is None:
            payload = CompleteSessionRequest()
        update_data = {
            "status": "completed", 
            "warnings": payload.warnings, 
            "completion_reason": payload.reason,
            "integrity": {
                "total_tab_switches": payload.total_tab_switches,
                "total_face_alerts": payload.total_face_alerts,
                "total_noise_alerts": payload.total_noise_alerts,
                "total_fullscreen_exits": payload.total_fullscreen_exits
            }
        }
        if session:
            candidate_id = session.get("candidate_id")
            if candidate_id and not candidate_id.endswith("IQ"):
                update_data["candidate_id"] = f"{candidate_id}IQ"
                
        interview_sessions_collection.update_one({"link_id": link_id}, {"$set": update_data})
        sync_session_to_application(link_id)
        
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
                        # Calculate final score
                        scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
                        avg_score = sum(scores) / len(scores) if scores else 0
                        
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {"$set": {
                                "avg_score": round(avg_score, 1),
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
                                    admin_company_id = admin.get("company_id")
                                    notifications_collection.insert_one({
                                        "title": "Interview Complete",
                                        "message": f"Candidate '{candidate_name}' has completed their interview. Avg score: {round(avg_score, 1)}/10.",
                                        "type": "candidate",
                                        "recipient_role": "admin",
                                        "company_id": admin_company_id,
                                        "read": False,
                                        "created_at": datetime.now(timezone.utc).isoformat()
                                    })
                            except: pass
                            
                        if candidate_email:
                            send_submission_notification(
                                candidate_email=candidate_email,
                                candidate_name=candidate_name,
                                admin_email=admin_email,
                                avg_score=avg_score,
                                total_questions=len(answers)
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


@router.post("/live-heartbeat")
async def live_heartbeat(data: LiveHeartbeatRequest):
    """Candidate browser sends a heartbeat every ~5 s with camera snapshot and quality metrics."""
    snap_data = {
        "ts": datetime.now(timezone.utc).isoformat(),
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
    }
    
    from redis_manager import manager
    import json
    if manager.redis:
        await manager.redis.setex(f"live_snapshot:{data.link_id}", 60, json.dumps(snap_data))
        # Publish update to dashboard websocket channel
        payload = {"type": "live_snapshot", "link_id": data.link_id, "data": snap_data}
        await manager.redis.publish("dashboard:updates", json.dumps(payload))
    else:
        _live_snapshots[data.link_id] = snap_data
        
    return {"status": "ok"}


@router.get("/admin/live-snapshot/{link_id}")
async def get_live_snapshot(link_id: str):
    """Admin polls latest candidate live snapshot and quality metrics."""
    from redis_manager import manager
    import json
    
    snap = None
    if manager.redis:
        snap_json = await manager.redis.get(f"live_snapshot:{link_id}")
        if snap_json:
            snap = json.loads(snap_json)
    else:
        snap = _live_snapshots.get(link_id)

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
    }


@router.get("/admin/ongoing-interviews")
def get_ongoing_interviews(admin_id: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    """Return all in-progress (status=started) sessions for this admin with live status."""
    admin_uuid = current_admin["admin_id"]
    require_admin_capability(
        admin_uuid,
        "live_monitoring",
        "Live monitoring is available on the Advance plan only.",
    )
    query_filter = {
        "company_id": current_admin.get("company_id"),
        "status": "started",
        "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
    }
    
    # Data Isolation:
    if current_admin.get("role") == "admin":
        query_filter["created_by"] = current_admin["admin_id"]
    elif admin_id:
        query_filter["created_by"] = admin_id

    rows = list(interview_sessions_collection.find(
        query_filter, 
        {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_id": 1, "started_at": 1}
    ).sort("created_at", -1))

    sessions = []
    for row in rows:
        link_id = row.get("link_id", "")
        snap = _live_snapshots.get(link_id, {})

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
        })

    return {"sessions": sessions, "count": len(sessions)}


@router.websocket("/ws/webrtc/{role}/{link_id}")
async def webrtc_endpoint(websocket: WebSocket, role: str, link_id: str, token: Optional[str] = None):
    with open("webrtc_debug.log", "a") as f:
        f.write(f"\\n--- New Connection ---\\nRole: {role}, Link ID: {link_id}\\nToken: {token}\\n")
    
    if role == "candidate":
        await manager.connect_candidate(websocket, link_id)
    elif role == "admin":
        if not token:
            with open("webrtc_debug.log", "a") as f:
                f.write("No token provided. Closing with 1008.\\n")
            await websocket.close(code=1008)
            return
        try:
            jwt.decode(token, JWT_SECRET_KEY, algorithms=[ALGORITHM])
            await manager.connect_admin(websocket, link_id)
            with open("webrtc_debug.log", "a") as f:
                f.write("Admin connected successfully.\\n")
        except jwt.PyJWTError as e:
            with open("webrtc_debug.log", "a") as f:
                f.write(f"JWT Decode Error: {str(e)}\\n")
            await websocket.close(code=1008)
            return
        except Exception as e:
            with open("webrtc_debug.log", "a") as f:
                f.write(f"Other Error: {str(e)}\\n{traceback.format_exc()}\\n")
            await websocket.close(code=1011)
            return
    else:
        await websocket.close()
        return

    try:
        while True:
            data = await websocket.receive_json()
            # Signaling relay
            if role == "candidate":
                await manager.send_to_admins(link_id, data)
                
                # Parse telemetry data if it's there
                if data.get("type") == "telemetry":
                    if "_live_snapshots" not in globals():
                        globals()["_live_snapshots"] = {}
                    existing_snapshot = globals()["_live_snapshots"].get(link_id, {})
                    telemetry_payload = data.get("data", {}) or {}
                    proctoring_status = telemetry_payload.get("proctoring_status", {}) or {}
                    globals()["_live_snapshots"][link_id] = {
                        **existing_snapshot,
                        "ts": datetime.now(timezone.utc).isoformat(),
                        "audio_level": telemetry_payload.get("audio_level", existing_snapshot.get("audio_level", 0)),
                        "current_question": telemetry_payload.get("current_question", existing_snapshot.get("current_question", "")),
                        "total_questions": telemetry_payload.get("total_questions", existing_snapshot.get("total_questions")),
                        "proctoring_alerts": telemetry_payload.get("proctoring_alerts", existing_snapshot.get("proctoring_alerts", 0)),
                        "last_alert_type": proctoring_status.get("lastAlertType") or existing_snapshot.get("last_alert_type"),
                        "face_visible": proctoring_status.get("faceVisible", existing_snapshot.get("face_visible")),
                        "face_count": proctoring_status.get("faceCount", existing_snapshot.get("face_count", 0)),
                        "multi_face": proctoring_status.get("multiFace", existing_snapshot.get("multi_face", False)),
                        "phone_detected": proctoring_status.get("phoneDetected", existing_snapshot.get("phone_detected", False)),
                        "eye_contact_lost": proctoring_status.get("eyeContactLost", existing_snapshot.get("eye_contact_lost", False)),
                    }
            elif role == "admin":
                await manager.send_to_candidate(link_id, data)
    except WebSocketDisconnect:
        with open("webrtc_debug.log", "a") as f:
            f.write(f"WebSocketDisconnect for role {role}, link_id {link_id}\\n")
        if role == "candidate":
            manager.disconnect_candidate(link_id)
            await manager.send_to_admins(link_id, {"type": "candidate_disconnected"})
        elif role == "admin":
            manager.disconnect_admin(websocket, link_id)
    except Exception as e:
        with open("webrtc_debug.log", "a") as f:
            f.write(f"Exception in while loop: {str(e)}\\n{traceback.format_exc()}\\n")


# --------------------------------------------------------------------------------
# MASTER & SUBSCRIPTION APIs
# --------------------------------------------------------------------------------
@router.post("/master/login")
def master_login(data: AdminLogin):
    user = admins_collection.find_one({"username": data.username, "role": "master"})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid master credentials")
    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid master credentials")
        
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user["role"], "company_id": str(user.get("company_id", ""))})
    return {
        "status": "success",
        "master_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "role": user["role"]
    }

@router.get("/master/companies")
def get_companies(master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
        
    companies = list(companies_collection.find())
    
    result = []
    for c in companies:
        company_id = str(c["_id"])
        # Create a mock user dict to pass to get_admin_plan_context
        mock_user = {"company_id": company_id}
        plan_context = get_admin_plan_context(mock_user)
        
        session_filter = {"company_id": company_id}
        total_sessions = interview_sessions_collection.count_documents(session_filter)
        completed_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "completed"})
        started_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "started"})
        pending_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "pending"})
        deactivated_sessions = interview_sessions_collection.count_documents({**session_filter, "is_deactivated": True})
        
        # Get primary admin email
        primary_admin = admins_collection.find_one({"company_id": company_id, "role": "super_admin"})
        email = primary_admin.get("email", "") if primary_admin else ""
        username = primary_admin.get("username", "") if primary_admin else ""
        login_enabled = primary_admin.get("login_enabled", True) if primary_admin else False
        
        result.append({
            "id": company_id,
            "company_name": c.get("name", "Unknown"),
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
        })
    return {"status": "success", "data": result}

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
        "login_enabled": True,
        "created_at": start.isoformat()
    }
    
    new_tenant["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_tenant)
    
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
def update_company(company_id: str, data: TenantUpdate, master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
        
    company = companies_collection.find_one({"_id": ObjectId(company_id)})
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
        
    update_fields = {"subscription_plan": data.subscription_plan}
    
    if data.add_days > 0:
        current_expiry = company.get("subscription_expiry")
        now = datetime.now(timezone.utc)
        
        try:
            exp_dt = datetime.fromisoformat(current_expiry) if current_expiry else now
            if exp_dt < now:
                exp_dt = now # If already expired, start from today
            
            new_expiry = exp_dt + timedelta(days=data.add_days)
            update_fields["subscription_expiry"] = new_expiry.isoformat()
        except Exception:
            update_fields["subscription_expiry"] = (now + timedelta(days=data.add_days)).isoformat()
            
    if data.add_credits > 0:
        current_credits = company.get("credits", 0)
        update_fields["credits"] = current_credits + data.add_credits
            
    companies_collection.update_one({"_id": ObjectId(company_id)}, {"$set": update_fields})
    return {"status": "success", "message": "Company updated successfully"}

@router.post("/master/companies/{company_id}/login")
def set_company_login(company_id: str, payload: Dict[str, bool], master_id: str = Depends(get_current_admin)):
    require_master_user(master_id)
    enabled = bool(payload.get("login_enabled", True))
    result = admins_collection.update_many(
        {"company_id": company_id},
        {"$set": {"login_enabled": enabled}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Tenant not found")
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

@router.get("/api/notifications")
def get_notifications(current_admin: dict = Depends(get_current_admin_details)):
    try:
        role = current_admin["role"]
        company_id = current_admin["company_id"]
        
        # Filter based on role
        if role == "master":
            query = {"recipient_role": "master"}
        elif role in ["super_admin", "superadmin"]:
            query = {"recipient_role": "superadmin", "company_id": company_id}
        else:
            query = {"recipient_role": "admin", "company_id": company_id}
            
        notifications = list(notifications_collection.find(query).sort("created_at", -1))
        
        # Seed mock data if empty
        if not notifications:
            import datetime
            now = datetime.datetime.now(datetime.timezone.utc)
            if role == "master":
                mock_data = [
                    {
                        "title": "Welcome to Master Console",
                        "message": "Welcome to the Hire IQ Master Control Panel. Here you can monitor system status, subscription plans, and manage tenants.",
                        "type": "system",
                        "recipient_role": "master",
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=2)).isoformat()
                    },
                    {
                        "title": "Subscription Renewed",
                        "message": "Tenant 'Google Cloud Partner' renewed their Advanced plan successfully.",
                        "type": "payment",
                        "recipient_role": "master",
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=6)).isoformat()
                    },
                    {
                        "title": "System Check Completed",
                        "message": "Automatic daily backup and database indexes health check succeeded.",
                        "type": "system",
                        "recipient_role": "master",
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=1)).isoformat()
                    }
                ]
            elif role in ["super_admin", "superadmin"]:
                mock_data = [
                    {
                        "title": "Welcome to Hire IQ",
                        "message": "Welcome to your Admin Management. You can manage your team, check candidate results, and provision interviews.",
                        "type": "system",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=1)).isoformat()
                    },
                    {
                        "title": "Interview Created",
                        "message": "A new interview template 'Senior React Developer' has been created successfully.",
                        "type": "activity",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=4)).isoformat()
                    },
                    {
                        "title": "Credits Request Approved",
                        "message": "Your request for additional interview credits was approved by the master administrator.",
                        "type": "credits",
                        "recipient_role": "superadmin",
                        "company_id": company_id,
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=1)).isoformat()
                    }
                ]
            else: # admin / tenant
                mock_data = [
                    {
                        "title": "Welcome to Hire IQ",
                        "message": "Welcome to the Admin console. Create, run, and review candidate coding and voice interviews.",
                        "type": "system",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=3)).isoformat()
                    },
                    {
                        "title": "New Interview Complete",
                        "message": "Candidate 'John Doe' has completed Python Technical Interview. Avg score: 8.5/10.",
                        "type": "candidate",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": False,
                        "created_at": (now - datetime.timedelta(hours=5)).isoformat()
                    },
                    {
                        "title": "Credits Assigned",
                        "message": "Your team leader has assigned 20 credits to your admin account.",
                        "type": "credits",
                        "recipient_role": "admin",
                        "company_id": company_id,
                        "read": True,
                        "created_at": (now - datetime.timedelta(days=2)).isoformat()
                    }
                ]
            notifications_collection.insert_many(mock_data)
            notifications = list(notifications_collection.find(query).sort("created_at", -1))
            
        for n in notifications:
            n["id"] = str(n["_id"])
            n["_id"] = str(n["_id"])
            
        return {"status": "success", "data": notifications}

    except Exception as e:
        import traceback
        print(f"ERROR IN /api/notifications: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/notifications/{notification_id}/read")
def mark_notification_read(notification_id: str, current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    # Security filter: ensure notification matches user's role and company
    notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if role == "master" and notif.get("recipient_role") != "master":
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"] and (notif.get("recipient_role") != "superadmin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "tenant" and (notif.get("recipient_role") != "admin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"read": True}}
    )
    return {"status": "success", "message": "Notification marked as read"}

@router.post("/api/notifications/read-all")
def mark_all_notifications_read(current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    if role == "master":
        query = {"recipient_role": "master", "read": False}
    elif role in ["super_admin", "superadmin"]:
        query = {"recipient_role": "superadmin", "company_id": company_id, "read": False}
    else:
        query = {"recipient_role": "admin", "company_id": company_id, "read": False}
        
    notifications_collection.update_many(query, {"$set": {"read": True}})
    return {"status": "success", "message": "All notifications marked as read"}

@router.delete("/api/notifications/{notification_id}")
def delete_master_notification(notification_id: str, current_admin: dict = Depends(get_current_admin_details)):
    role = current_admin["role"]
    company_id = current_admin["company_id"]
    
    notif = notifications_collection.find_one({"_id": ObjectId(notification_id)})
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    if role == "master" and notif.get("recipient_role") != "master":
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role in ["super_admin", "superadmin"] and (notif.get("recipient_role") != "superadmin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
    elif role == "tenant" and (notif.get("recipient_role") != "admin" or notif.get("company_id") != company_id):
        raise HTTPException(status_code=403, detail="Forbidden")
        
    notifications_collection.delete_one({"_id": ObjectId(notification_id)})
    return {"status": "success", "message": "Notification deleted"}

# 4. Modify existing Admin Login endpoint to return subscription details
class FirebaseAuthRequest(BaseModel):
    email: str
    name: str = ""

@router.post("/admin/firebase-auth")
def firebase_auth(data: FirebaseAuthRequest):
    normalized_email = data.email.strip().lower()
    
    # Try email match first, then username match
    user = admins_collection.find_one({"email": normalized_email, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"username": normalized_email, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"email": normalized_email})
    if not user:
        user = admins_collection.find_one({"username": normalized_email})
        
    if not user:
        # Register new admin with Free Trial
        now = datetime.now(timezone.utc)
        plan_def = get_plan_definition("Free Trial")
        credits_to_grant = plan_def.get("credits_granted", 10)
        expiry = now + timedelta(days=3650)
        
        new_admin = {
            "username": normalized_email,
            "email": normalized_email,
            "name": data.name or normalized_email.split("@")[0],
            "password": hash_password(str(uuid.uuid4())), # random password, they use firebase
            "role": "super_admin",
            "subscription_plan": "Free Trial",
            "subscription_expiry": expiry.isoformat(),
            "credits": credits_to_grant,
            "created_at": now.isoformat()
        }
        new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
        result = admins_collection.insert_one(new_admin)
        user = admins_collection.find_one({"_id": result.inserted_id})
        
    # Check login_enabled
    if user.get("login_enabled") == False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }
        
    plan_context = get_admin_plan_context(user)
    plan = plan_context["plan_label"]
    expiry = user.get("subscription_expiry")
            
    # Do NOT block login if expired, because they need to be able to access the dashboard to buy more credits!
    if plan_context["is_expired"]:
        print(f"User {user['username']} logged in with an expired subscription (Credits: {plan_context.get('credits')})")
        
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan,
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": expiry,
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
    }

@router.post("/admin/login")
def admin_login(data: AdminLogin):
    # Try username match first, then email match (for self-registered users)
    user = admins_collection.find_one({"username": data.username, "role": {"$ne": "master"}})
    if not user:
        user = admins_collection.find_one({"email": data.username, "role": {"$ne": "master"}})
    if not user:
        # Fallback: check without role filter
        user = admins_collection.find_one({"username": data.username})
        if not user:
            user = admins_collection.find_one({"email": data.username})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid username or password")
            
    if not verify_password(data.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    
    # Check login_enabled
    if user.get("login_enabled") == False:
        return {
            "status": "blocked",
            "message": "Your account login has been stopped by the administrator. Please contact support.",
        }
        
    plan_context = get_admin_plan_context(user)
    plan = plan_context["plan_label"]
    expiry = user.get("subscription_expiry")
            
    # Do NOT block login if expired, because they need to be able to access the dashboard to buy more credits!
    if plan_context["is_expired"]:
        print(f"User {user['username']} logged in with an expired subscription (Credits: {plan_context.get('credits')})")
        
    access_token = create_access_token(data={"sub": str(user["_id"]), "role": user.get("role", "tenant"), "company_id": str(user.get("company_id", ""))})
    return {
        "status": "success",
        "admin_id": str(user["_id"]),
        "token": access_token,
        "username": user["username"],
        "email": user.get("email", ""),
        "name": user.get("name", user.get("username", "")),
        "role": user.get("role", "tenant"),
        "subscription_plan": plan,
        "subscription_plan_key": plan_context["plan_key"],
        "subscription_expiry": expiry,
        "subscription_days_remaining": plan_context["days_remaining"],
        "subscription_warning": plan_context["warning"],
        "subscription_warning_message": plan_context["warning_message"],
        "plan_capabilities": plan_context["capabilities"],
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
    signup_form: dict

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
    result = []
    for p in plans:
        result.append(serialize_plan(p))
    return {"status": "success", "data": result}

@router.post("/master/plans")
def upsert_plan(data: PlanUpdate, master_id: str = Depends(get_current_admin), current_admin: str = Depends(get_current_admin)):
    """Master-only: create or update a plan"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    existing = plans_collection.find_one({"plan_name": data.plan_name})
    
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

    receipt = f"aii_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    payload = {
        "amount": int(plan_info["price"]) * 100,
        "currency": "INR",
        "receipt": receipt[:40],
        "notes": {
            "plan_name": plan_info["plan_name"],
            "email": signup["email"][:255],
            "company_name": signup["company_name"][:255],
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
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to initialize Razorpay payment: {str(exc)}")

@router.post("/api/razorpay/verify-payment")
def verify_razorpay_payment(data: RazorpayVerifyRequest):
    """Verify Razorpay signature and activate the paid subscription."""
    _, key_secret = get_razorpay_credentials()
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
def create_razorpay_upgrade_order(data: RazorpayUpgradeOrderRequest):
    """Create a Razorpay order for purchasing credits / upgrading."""
    key_id, key_secret = get_razorpay_credentials()
    admin = admins_collection.find_one({"_id": ObjectId(data.admin_id)})
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
            "upgrade_admin_id": data.admin_id,
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
        return {
            "status": "success",
            "razorpay_order_id": order_data["id"],
            "amount": order_data["amount"],
            "currency": order_data["currency"],
            "key_id": key_id
        }
    except Exception as e:
        print(f"Razorpay Upgrade error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/razorpay/verify-upgrade")
def verify_razorpay_upgrade(data: RazorpayUpgradeVerifyRequest):
    """Verify Razorpay signature and add credits to the user/company."""
    key_id, key_secret = get_razorpay_credentials()
    
    admin = admins_collection.find_one({"_id": ObjectId(data.admin_id)})
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

    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan selected")

    plan_def = get_plan_definition(plan_info["plan_name"])
    credits_to_grant = plan_def.get("credits_granted", 0)

    now = datetime.now(timezone.utc).isoformat()
    expiry = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()

    if admin.get("company_id"):
        # Update Company
        companies_collection.update_one(
            {"_id": ObjectId(admin["company_id"])},
            {
                "$set": {
                    "subscription_plan": data.plan_name,
                    "subscription_start": now,
                    "subscription_expiry": expiry,
                    "is_paid": True,
                },
                "$inc": {"credits": credits_to_grant}
            }
        )
    else:
        # Update Admin
        admins_collection.update_one(
            {"_id": ObjectId(data.admin_id)},
            {
                "$set": {
                    "subscription_plan": data.plan_name,
                    "subscription_start": now,
                    "subscription_expiry": expiry,
                    "is_paid": True,
                },
                "$inc": {"credits": credits_to_grant}
            }
        )
        
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
    
    plan_info = plans_collection.find_one({"plan_name": data.plan_name})
    if not plan_info:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if plan_info.get("price", 0) == 0:
        raise HTTPException(status_code=400, detail="Free plans don't require payment")
    
    frontend_url = os.getenv("FRONTEND_URL", "https://localhost:3000")
    
    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            customer_email=data.signup_form.get("email"),
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
                "name": data.signup_form.get("name", ""),
                "email": data.signup_form.get("email", ""),
                "password": data.signup_form.get("password", ""),
                "phone": data.signup_form.get("phone", ""),
                "plan": plan_info["plan_name"],
            },
        )
        return {"status": "success", "url": session.url}
    except Exception as e:
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
        
        metadata = session.get("metadata", {})
        name = metadata.get("name")
        email = metadata.get("email")
        password = metadata.get("password")
        plan_name = metadata.get("plan")
        
        if not all([name, email, password, plan_name]):
            return {"received": True}
        
        if admins_collection.find_one({"email": email}):
            return {"received": True}
        
        plan_info = plans_collection.find_one({"plan_name": plan_name})
        credits_granted = plan_info.get("credits_granted", 30) if plan_info else 30
        duration = plan_info.get("duration", 30) if plan_info else 30
        now = datetime.now(timezone.utc)
        
        admins_collection.insert_one({
        "custom_id": get_next_sequence_value("recruiter", "RC"),
            "username": email,
            "password": hash_password(password),
            "email": email,
            "name": name,
            "phone": metadata.get("phone", ""),
            "role": "super_admin",
            "subscription_plan": plan_name,
            "subscription_start": now.isoformat(),
            "subscription_expiry": (now + timedelta(days=duration)).isoformat(),
            "is_paid": True,
            "stripe_customer_id": session.get("customer"),
            "stripe_subscription_id": session.get("subscription"),
            "login_enabled": True,
            "created_at": now.isoformat()
        })
        print(f"Paid admin created via Stripe: {email} ({plan_name})")
    
    return {"received": True}

# --------------------------------------------------------------------------------
# MASTER: GET ALL ADMINS WITH SUBSCRIPTION DETAILS
# --------------------------------------------------------------------------------

@router.get("/master/admins")
def get_all_admins(master_id: str = Depends(get_current_admin)):
    """Master-only: Get all admins with subscription & revenue stats"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    all_admins = list(admins_collection.find({"role": {"$ne": "master"}}))
    now = datetime.now(timezone.utc)
    
    total_admins = len(all_admins)
    active_subs = 0
    total_revenue = 0
    
    admin_list = []
    for a in all_admins:
        exp_str = a.get("subscription_expiry")
        is_expired = False
        if exp_str:
            try:
                if now > datetime.fromisoformat(exp_str):
                    is_expired = True
            except:
                pass
        
        if not is_expired:
            active_subs += 1
        
        plan_name = a.get("subscription_plan", "Free Trial")
        plan_info = plans_collection.find_one({"plan_name": plan_name})
        if plan_info and a.get("is_paid"):
            total_revenue += plan_info.get("price", 0)
        
        admin_list.append({
            "id": str(a["_id"]),
            "username": a.get("username", ""),
            "name": a.get("name", a.get("username", "")),
            "email": a.get("email", ""),
            "subscription_plan": plan_name,
            "subscription_start": a.get("subscription_start", ""),
            "subscription_expiry": a.get("subscription_expiry", ""),
            "is_expired": is_expired,
            "is_paid": a.get("is_paid", False),
            "login_enabled": a.get("login_enabled", True),
            "created_at": a.get("created_at", "")
        })
    
    return {
        "status": "success",
        "stats": {
            "total_companies": total_admins,
            "active_subscriptions": active_subs,
            "estimated_revenue": total_revenue
        },
        "admins": admin_list
    }

@router.put("/master/admins/{admin_id}/toggle-login")
def toggle_admin_login(admin_id: str, master_id: str = Depends(get_current_admin)):
    """Master-only: Enable/disable an admin's login access"""
    master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    admin = admins_collection.find_one({"_id": ObjectId(admin_id)})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    
    current = admin.get("login_enabled", True)
    admins_collection.update_one(
        {"_id": ObjectId(admin_id)},
        {"$set": {"login_enabled": not current}}
    )
    return {"status": "success", "login_enabled": not current}

# --------------------------------------------------------------------------------
# SUPER ADMIN APIs
# --------------------------------------------------------------------------------

@router.get("/super-admin/admins")
def get_sub_admins(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
        
    admins = list(admins_collection.find({"company_id": company_id, "role": "admin"}, {"password": 0}))
    
    # Enrich with session count created by each admin
    for admin in admins:
        admin["id"] = str(admin["_id"])
        admin["_id"] = str(admin["_id"])
        admin["credits"] = admin.get("credits", 0)
        admin["sessions_created"] = interview_sessions_collection.count_documents({"admin_id": str(admin["id"])})
        
    return {"status": "success", "data": admins}

@router.post("/super-admin/admins")
def create_sub_admin(data: SubAdminCreate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
        
    # Check if username already exists
    if admins_collection.find_one({"username": data.username}):
        raise HTTPException(status_code=400, detail="Username already exists")
        
    new_admin = {
        "username": data.username,
        "password": hash_password(data.password),
        "email": data.email,
        "name": data.name,
        "role": "admin",
        "company_id": company_id,
        "credits": data.credits,
        "login_enabled": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    new_admin["custom_id"] = get_next_sequence_value("recruiter", "RC")
    admins_collection.insert_one(new_admin)
    return {"status": "success", "message": "Sub-admin created successfully"}

@router.post("/super-admin/admins/{admin_id}/toggle-status")
def toggle_sub_admin_status(admin_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    
    admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id), "company_id": company_id})
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Sub-admin not found")
        
    new_status = not admin_doc.get("login_enabled", True)
    admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$set": {"login_enabled": new_status}})
    return {"status": "success", "login_enabled": new_status}

@router.delete("/super-admin/admins/{admin_id}")
def delete_sub_admin(admin_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    
    result = admins_collection.delete_one({"_id": ObjectId(admin_id), "company_id": company_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sub-admin not found")
    return {"status": "success"}

class AddCreditsRequest(BaseModel):
    credits: int

@router.post("/super-admin/admins/{admin_id}/add-credits")
def add_sub_admin_credits(admin_id: str, data: AddCreditsRequest, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    
    admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id), "company_id": company_id})
    if not admin_doc:
        raise HTTPException(status_code=404, detail="Sub-admin not found")
        
    if admin_doc.get("login_enabled") == False:
        raise HTTPException(status_code=400, detail="Cannot add credits to a deactivated admin account.")

    # Deduct from Super Admin atomically
    super_admin_id = current_admin["admin_id"]
    sa_doc = admins_collection.find_one_and_update(
        {"_id": ObjectId(super_admin_id), "credits": {"$gte": data.credits}},
        {"$inc": {"credits": -data.credits}},
        return_document=ReturnDocument.AFTER
    )
    
    if not sa_doc:
        raise HTTPException(status_code=400, detail="Insufficient credits in Super Admin account.")
        
    # Add to Sub-Admin atomically
    updated_admin = admins_collection.find_one_and_update(
        {"_id": ObjectId(admin_id)},
        {"$inc": {"credits": data.credits}},
        return_document=ReturnDocument.AFTER
    )
    
    return {"status": "success", "credits": updated_admin.get("credits", 0), "super_admin_credits": sa_doc.get("credits", 0)}


@router.get("/super-admin/dashboard-stats")
def get_super_admin_dashboard_stats(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")
    company_id = current_admin.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="Super Admin is not associated with a company")
        
    admin_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])})
    credits = admin_doc.get("credits", 0) if admin_doc else 0
    
    company = companies_collection.find_one({"_id": ObjectId(company_id)})
    if company and "credits" in company:
        credits = company["credits"]
    
    session_filter = {"company_id": company_id}
    total_sessions = interview_sessions_collection.count_documents(session_filter)
    completed_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "completed"})
    pending_sessions = interview_sessions_collection.count_documents({**session_filter, "status": "pending"})
    
    # Usage over the last 7 days
    now = datetime.now(timezone.utc)
    chart_labels = []
    chart_data = []
    
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        start_of_day = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        end_of_day = start_of_day + timedelta(days=1)
        
        count = interview_sessions_collection.count_documents({
            **session_filter,
            "created_at": {
                "$gte": start_of_day.isoformat(),
                "$lt": end_of_day.isoformat()
            }
        })
        chart_labels.append(day.strftime("%m/%d"))
        chart_data.append(count)
        
    # Breakdown by admin
    admins = list(admins_collection.find({"company_id": company_id}))
    admin_labels = []
    admin_data = []
    for a in admins:
        name = a.get("name", a.get("username"))
        count = interview_sessions_collection.count_documents({"admin_id": str(a["_id"])})
        admin_labels.append(name)
        admin_data.append(count)

    return {
        "status": "success",
        "credits": credits,
        "total_sessions": total_sessions,
        "completed_sessions": completed_sessions,
        "pending_sessions": pending_sessions,
        "chart_labels": chart_labels,
        "chart_data": chart_data,
        "admin_labels": admin_labels,
        "admin_data": admin_data
    }

# --------------------------------------------------------------------------------
# CREDIT REQUEST APIs
# --------------------------------------------------------------------------------

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
    req = credit_requests_collection.find_one({"_id": ObjectId(request_id), "company_id": company_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
        
    if req["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request is already processed")
        
    if data.status not in ["approved", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
        
    credit_requests_collection.update_one(
        {"_id": ObjectId(request_id)},
        {"$set": {
            "status": data.status,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "processed_by": current_admin["admin_id"]
        }}
    )
    
    if data.status == "approved":
        amount = req["amount"]
        # Deduct from company (Super Admin's pool)
        if company_id:
            companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": -amount}})
        # Add to the requesting admin
        admins_collection.update_one({"_id": ObjectId(req["admin_id"])}, {"$inc": {"credits": amount}})
        
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

@router.websocket("/ws/dashboard")
async def dashboard_websocket(websocket: WebSocket):
    from redis_manager import manager
    await manager.connect_dashboard(websocket)
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_dashboard(websocket)

@router.get("/dashboard")
async def get_dashboard_aggregated_data(admin_id: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    try:
        from redis_manager import manager
        import json
        
        stats_data = await get_dashboard_stats(admin_id=admin_id, current_admin=current_admin)
        
        
        # Restore candidate query since the frontend still expects candidates in this payload
        c_query_filter = {
            "company_id": current_admin.get("company_id"),
            "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
        }
        if current_admin.get("role") == "admin":
            c_query_filter["created_by"] = current_admin["admin_id"]
        elif admin_id:
            c_query_filter["created_by"] = admin_id
            
        candidates_cursor = list(interview_sessions_collection.find(c_query_filter).sort("created_at", -1))
        
        # Get AI Calling interested candidates
        apps = []
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if current_admin.get("role") == "admin":
                jobs_query["admin_id"] = current_admin["admin_id"]
            elif admin_id:
                jobs_query["admin_id"] = admin_id
            jobs = list(jobs_collection.find(jobs_query))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            
            app_query = {
                "job_id": {"$in": job_ids},
                "$or": [
                    {"interest": {"$regex": "interested", "$options": "i"}},
                    {"decision": {"$in": ["selected", "rejected"]}}
                ]
            }
            apps = list(job_applications_collection.find(app_query))
        except Exception as e:
            print(f"Error fetching AI Calling candidates: {e}")
            
        seen_emails = set()
        candidates_list = []
        for c in candidates_cursor:
            email = c.get("candidate_email") or c.get("email")
            if email:
                seen_emails.add(email.strip().lower())
            c["id"] = str(c["_id"])
            c["_id"] = str(c["_id"])
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
                "decision": app.get("decision") or "selected",
                "status": "completed",
                "application_id": app_id,
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
        admin_user_doc = admins_collection.find_one({"_id": ObjectId(current_admin["admin_id"])})
        plan_ctx = get_admin_plan_context(admin_user_doc) if admin_user_doc else None
        has_live = plan_ctx.get("capabilities", {}).get("live_monitoring", False) if plan_ctx else False
        
        if has_live or current_admin.get("role") in ["master", "super_admin"]:
            query_filter = {
                "company_id": current_admin.get("company_id"),
                "status": "started",
                "$or": [{"is_deactivated": False}, {"is_deactivated": {"$exists": False}}]
            }
            if current_admin.get("role") == "admin":
                query_filter["created_by"] = current_admin["admin_id"]
            elif admin_id:
                query_filter["created_by"] = admin_id
            
            rows = list(interview_sessions_collection.find(
                query_filter,
                {"link_id": 1, "candidate_name": 1, "candidate_email": 1, "created_at": 1, "interview_id": 1, "started_at": 1}
            ).sort("created_at", -1))
            
            ongoing_monitored_count = len(rows)
            for row in rows:
                link_id = row.get("link_id", "")
                
                snap = {}
                if manager.redis:
                    snap_json = await manager.redis.get(f"live_snapshot:{link_id}")
                    if snap_json:
                        snap = json.loads(snap_json)
                else:
                    snap = _live_snapshots.get(link_id, {}) if "_live_snapshots" in globals() else {}
                online = False
                if snap.get("ts"):
                    try:
                        ts_dt = datetime.fromisoformat(snap["ts"].replace("Z", "+00:00"))
                        age_secs = (datetime.now(timezone.utc) - ts_dt).total_seconds()
                        online = age_secs < 60
                    except Exception:
                        pass
                
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
                    "link_id": row.get("link_id", ""),
                    "candidate_name": row.get("candidate_name", ""),
                    "candidate_email": row.get("candidate_email", ""),
                    "interview_title": row.get("interview_title", ""),
                    "session_id": str(row.get("_id", ""))
                }
                live_sessions.append(session_item)
                
                if online:
                    ongoing_live_count += 1
                else:
                    ongoing_alert_count += 1
                    
                if audio_level > 5:
                    ongoing_speaking_count += 1
                if current_question and "code" in str(current_question).lower():
                    ongoing_coding_count += 1

        credit_reqs = []
        if current_admin.get("role") in ["master", "super_admin"]:
            reqs = list(credit_requests_collection.find({"status": "pending"}).sort("created_at", -1))
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

@router.post("/api/export/excel")
def export_excel(data: ExportExcelRequest, current_admin: dict = Depends(get_current_admin_details)):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    try:
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Name", "Email", "Position", "Status", "Score", "Created"])
        for c in data.candidates:
            writer.writerow([
                c.get("candidate_name", ""),
                c.get("candidate_email", ""),
                c.get("interview_title", ""),
                c.get("status", ""),
                c.get("score", 0),
                c.get("created_at", "")
            ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
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
                        delete_session(interview_id)
                
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
                delete_session(interview_id)

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
            admin_doc = admins_collection.find_one({"_id": ObjectId(admin_id)}) if admin_id else None
            if admin_doc:
                company_id = admin_doc.get("company_id")
                if company_id:
                    companies_collection.update_one({"_id": ObjectId(company_id)}, {"$inc": {"credits": -amount}})
                admins_collection.update_one({"_id": ObjectId(admin_id)}, {"$inc": {"credits": amount}})
                
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
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
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
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
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
async def superadmin_dashboard(adminId: Optional[str] = None, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    return await get_dashboard_aggregated_data(admin_id=adminId, current_admin=current_admin)

@router.get("/api/superadmin/candidates/qualified")
@router.get("/superadmin/candidates/qualified")
def get_superadmin_qualified(adminId: Optional[str] = None, pipeline: Optional[str] = "all", current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get("role") not in ["super_admin", "master"]:
        raise HTTPException(status_code=403, detail="Super Admin access required")
    
    sessions = []
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": current_admin.get("company_id"), "decision": "selected"}
        if adminId:
            query["created_by"] = adminId
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
    
    # Get AI Calling interested candidates
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if adminId:
                jobs_query["admin_id"] = adminId
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
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
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
    if pipeline in ["all", "hireiq"]:
        query = {"company_id": current_admin.get("company_id"), "decision": "rejected"}
        if adminId:
            query["created_by"] = adminId
        sessions = list(interview_sessions_collection.find(query).sort("created_at", -1))
    
    # Get AI Calling rejected candidates
    apps = []
    if pipeline in ["all", "ai_calling"]:
        try:
            jobs_query = {"company_id": current_admin.get("company_id")}
            if adminId:
                jobs_query["admin_id"] = adminId
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
    for s in sessions:
        email = s.get("candidate_email") or s.get("email")
        if email:
            seen_emails.add(email.strip().lower())
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
    if admin_doc.get("company_id"):
        company = companies_collection.find_one({"_id": ObjectId(admin_doc["company_id"])})
        if company:
            admin_doc["company_name"] = company.get("name", "")
            if "credits" in company:
                admin_doc["credits"] = company["credits"]
    plan_context = get_admin_plan_context(admin_doc)
    admin_doc["is_expired"] = plan_context["is_expired"]
    admin_doc["subscription_plan_key"] = plan_context["plan_key"]
    return admin_doc

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
    session = interview_sessions_collection.find_one({"link_id": link_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    company_id = current_admin.get("company_id")
    if company_id and session.get("company_id") and session.get("company_id") != company_id:
        raise HTTPException(status_code=403, detail="Access denied to this session")
    # Reuse the existing admin endpoint logic
    return get_interview_details(link_id)


# -------------------------------------------------------------------------------------
# PREMIUM VOICE & INTERACTIVE CODING ROUND ENDPOINTS
# -------------------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str
    voice: str = "nova"
    language: str = "English"
    voice_id: Optional[str] = None   # Per-session cloned voice override
    use_custom_voice: bool = True    # Flag to determine if Cartesia should be used

@router.get("/admin/voices")
def get_admin_voices(current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns available Cartesia custom voices configured in the backend .env file.
    Keys like CARTESIA_VOICE_ID and CARTESIA_VOICE_ID_MALE are loaded.
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=True)
    
    voices = []
    
    # Check for the default one
    default_voice_id = os.getenv("CARTESIA_VOICE_ID")
    if default_voice_id:
        voices.append({"name": "Default Voice", "id": default_voice_id})
        
    # Check for anything starting with CARTESIA_VOICE_ID_
    for key, value in os.environ.items():
        if key.startswith("CARTESIA_VOICE_ID_") and value:
            # e.g., CARTESIA_VOICE_ID_MALE -> "Male"
            name_part = key.replace("CARTESIA_VOICE_ID_", "").replace("_", " ").title()
            voices.append({"name": name_part, "id": value})
            
    return {"status": "success", "voices": voices}

@router.post("/voice-clone-instant")
async def voice_clone_instant(audio: UploadFile = File(...), voice_name: Optional[str] = "CandidateVoice"):
    """
    Cartesia Instant Voice Cloning endpoint.
    Accepts a short audio sample (webm/mp3/wav), sends it to Cartesia,
    and returns a temporary voice_id that can be used for the session's TTS calls.
    Requires CARTESIA_API_KEY in the .env file.
    """
    import asyncio
    try:
        from cartesia import Cartesia
    except ImportError:
        raise HTTPException(status_code=500, detail="Cartesia SDK not installed. Run `pip install cartesia`.")

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=True)


    api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Cartesia API key not configured. Voice cloning is unavailable.")

    # Save the uploaded file to a temp location
    ext = "webm"
    if audio.filename:
        ext = audio.filename.rsplit(".", 1)[-1].lower() if "." in audio.filename else "webm"
    temp_audio = f"temp_voice_sample_{uuid.uuid4().hex}.{ext}"
    try:
        audio_bytes = await audio.read()
        with open(temp_audio, "wb") as f:
            f.write(audio_bytes)

        def _do_clone():
            client = Cartesia(api_key=api_key)
            # Clone the voice from the clip; voices.clone() returns VoiceMetadata directly
            with open(temp_audio, "rb") as clip_file:
                new_voice = client.voices.clone(
                    clip=clip_file,
                    name=voice_name or "CandidateVoice",
                    language="en",
                    description="Auto-cloned from interview voice sample",
                )
            return new_voice

        new_voice_data = await asyncio.get_event_loop().run_in_executor(None, _do_clone)
        voice_id = new_voice_data.id
        
        if not voice_id:
            raise Exception("No voice ID returned from Cartesia.")
            
        print(f"[VoiceClone] Created Cartesia voice_id={voice_id}")
        return {"voice_id": voice_id, "status": "success"}

    except Exception as e:
        print(f"[VoiceClone] Cartesia Error: {e}")
        raise HTTPException(status_code=500, detail=f"Cartesia error: {str(e)}")
    finally:
        if os.path.exists(temp_audio):
            os.remove(temp_audio)

@router.post("/tts")
async def generate_tts(req: TTSRequest):
    """
    Hybrid TTS: Cartesia (primary) → Microsoft Edge TTS (fallback).

    Strategy:
    - Cartesia is used for English when CARTESIA_API_KEY + CARTESIA_VOICE_ID are set.
      The sonic model is used for the cloned voice.
    - Regional languages always route directly to
      the native Microsoft Edge TTS neural voice for that language.
    - If Cartesia quota is exceeded, the API key is missing, or any other error
      occurs, the system silently falls back to the free Microsoft Edge TTS voice.
    """
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=True)
    cartesia_api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    # Per-session cloned voice (from /voice-clone-instant) takes priority over the global static voice
    cartesia_voice_id = (req.voice_id or "").strip() or os.getenv("CARTESIA_VOICE_ID", "").strip()

    from fastapi.responses import StreamingResponse
    import io

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Build Edge TTS regional voice map (used as fallback AND for regional languages)
    # ──────────────────────────────────────────────────────────────────────────
    base_edge_voice = "en-US-JennyNeural" if req.voice in ("shimmer", "nova") else "en-US-AriaNeural"
    edge_language_map = {
        "Hindi":     "hi-IN-SwaraNeural",
        "Telugu":    "te-IN-ShrutiNeural",
        "Tamil":     "ta-IN-PallaviNeural",
        "Malayalam": "ml-IN-SobhanaNeural",
        "Kannada":   "kn-IN-SapnaNeural",
        "English":   base_edge_voice,
    }
    requested_lang = req.language.title()
    edge_voice = edge_language_map.get(requested_lang, base_edge_voice)
    is_regional = requested_lang in edge_language_map and requested_lang != "English"

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Cartesia path — only for English when keys are configured
    # ──────────────────────────────────────────────────────────────────────────
    used_cartesia = False
    temp_filename = f"temp_tts_{uuid.uuid4().hex}.mp3"
    
    # Determine the actual voice ID to use
    actual_cartesia_voice_id = req.voice_id if req.voice_id else cartesia_voice_id

    if req.use_custom_voice and cartesia_api_key and actual_cartesia_voice_id and not is_regional:
        try:
            import asyncio
            from cartesia import Cartesia

            def _call_cartesia():
                client = Cartesia(api_key=cartesia_api_key)
                result = client.tts.generate(
                    model_id="sonic-2",
                    transcript=req.text,
                    voice={"mode": "id", "id": actual_cartesia_voice_id},
                    output_format={
                        "container": "mp3",
                        "encoding": "mp3",
                        "sample_rate": 44100,
                    },
                )
                return result.read()

            audio_bytes = await asyncio.get_event_loop().run_in_executor(None, _call_cartesia)

            if audio_bytes:
                print(f"[TTS] Cartesia: OK ({len(audio_bytes)} bytes) | voice={cartesia_voice_id}")
                return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")
            else:
                print(f"[TTS] Cartesia error: No audio returned. Falling back to Edge TTS.")

        except Exception as err:
            print(f"[TTS] Cartesia exception: {err}. Falling back to Edge TTS.")

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Edge TTS fallback 
    # ──────────────────────────────────────────────────────────────────────────
    try:
        print(f"[TTS] Using Microsoft Edge TTS | voice={edge_voice} | lang={requested_lang}")
        communicate = edge_tts.Communicate(req.text, edge_voice)
        
        async def edge_tts_stream():
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    yield chunk["data"]
                    
        return StreamingResponse(edge_tts_stream(), media_type="audio/mpeg")
    except Exception as edge_err:
        print(f"[TTS] Edge TTS Error: {edge_err}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {edge_err}")



@router.post("/stt")
async def stt_endpoint(file: UploadFile = File(...), language: Optional[str] = None):
    """Transcribe audio via Groq Whisper with optimized Indian English accent support"""
    try:
        audio_content = await file.read()
        
        temp_filename = f"temp_stt_{uuid.uuid4().hex}.webm"
        with open(temp_filename, "wb") as f:
            f.write(audio_content)
            
        try:
            with open(temp_filename, "rb") as f:
                # Use whisper-large-v3-turbo for better accuracy with Indian accents.
                # Pass initial_prompt to prime the model with Indian English context which
                # dramatically reduces hallucinations and accent-related transcription errors.
                # IMPORTANT: Only pass an English prompt if the target language is English!
                iso_lang = language or "en"
                sys_prompt = "The speaker has an Indian English accent. Transcribe technical terms, programming concepts, and software engineering terminology accurately." if iso_lang == "en" else ""
                
                transcript = await groq_client.audio.transcriptions.create(
                    model="whisper-large-v3-turbo",
                    file=f,
                    language=iso_lang,
                    prompt=sys_prompt,
                    temperature=0.0,  # Lower temperature = more deterministic, fewer hallucinations
                )
            return {"transcript": transcript.text}
        finally:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
    except Exception as e:
        print(f"STT Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ─── Omni Dimension AI Calling Endpoints ──────────────────────────────────────

@router.post("/api/calls/initiate/{session_id}")
async def initiate_ai_call(session_id: str, request: Request):
    """
    Initiates an outbound AI call via Omni Dimension for the given session.
    Expects a JSON body with an optional phone_number, if not already in DB.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}
    
    phone_number = body.get("phone_number")
    
    session_data = interview_sessions_collection.find_one({
        "$or": [{"id": session_id}, {"link_id": session_id}]
    })
    
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")
        
    candidate_name = session_data.get("candidate_name", "Candidate")
    # If phone_number was not passed in body, try to get from session (if it exists)
    if not phone_number:
        phone_number = session_data.get("candidate_phone")
        
    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required to initiate an AI call")

    interview_id = session_data.get("interview_id")
    interview_data = interviews_collection.find_one({"id": interview_id})
    if not interview_data:
        raise HTTPException(status_code=404, detail="Interview template not found")

    job_description = interview_data.get("job_description", "")
    resume_text = session_data.get("parsed_resume", "")
    skills = ", ".join(interview_data.get("skills", []))
    duration = interview_data.get("duration", 30)

    try:
        from . import omni_dimension_client
        response = omni_dimension_client.start_omni_call(
            phone_number=phone_number,
            candidate_name=candidate_name,
            job_description=job_description,
            resume_text=resume_text,
            duration=duration,
            skills=skills
        )
        
        call_id = response.get("call_id") if isinstance(response, dict) else str(response)
        
        # Save call info to session
        interview_sessions_collection.update_one(
            {"_id": session_data["_id"]},
            {"$set": {
                "ai_call_id": call_id,
                "ai_call_status": "initiated",
                "candidate_phone": phone_number
            }}
        )
        return {"status": "success", "call_id": call_id, "message": f"AI Call initiated to {phone_number}"}
    except Exception as e:
        print(f"Error initiating AI call: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ManualAICallRequest(BaseModel):
    phone_number: str
    candidate_name: Optional[str] = "Candidate"
    job_description: Optional[str] = ""
    resume_text: Optional[str] = ""
    duration: Optional[int] = 30
    skills: Optional[str] = ""

# (duplicate removed — see /api/calls/agent-settings below)

@router.post("/api/calls/initiate-manual")
async def initiate_manual_ai_call(
    phone_number: str = Form(...),
    candidate_name: Optional[str] = Form("Candidate"),
    job_description: Optional[str] = Form(""),
    duration: Optional[int] = Form(30),
    skills: Optional[str] = Form(""),
    job_id: Optional[str] = Form(None),
    application_id: Optional[str] = Form(None),
    resume: UploadFile = File(None)
):
    """
    Initiates an outbound AI call via Omni Dimension manually, without requiring an existing session.
    """
    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required")

    try:
        from . import omni_dimension_client
        from .services import extract_text_from_file
        
        resume_text = ""
        if resume and resume.filename:
            file_content = await resume.read()
            resume_text = extract_text_from_file(file_content, resume.filename)
        elif application_id:
            from bson import ObjectId
            import os
            try:
                app_doc = job_applications_collection.find_one({"_id": ObjectId(application_id)})
                if app_doc:
                    resume_text = app_doc.get("resume_text") or ""
                    if not resume_text and app_doc.get("resume_url"):
                        r_url = app_doc.get("resume_url")
                        if os.path.exists(r_url):
                            with open(r_url, "rb") as f:
                                resume_text = extract_text_from_file(f.read(), r_url)
                                if resume_text:
                                    job_applications_collection.update_one(
                                        {"_id": ObjectId(application_id)},
                                        {"$set": {"resume_text": resume_text}}
                                    )
            except Exception as e:
                print(f"Error loading resume in manual AI call: {e}")
            
        response = omni_dimension_client.start_omni_call(
            phone_number=phone_number,
            candidate_name=candidate_name,
            job_description=job_description,
            resume_text=resume_text,
            duration=duration,
            skills=skills
        )
        
        call_id = response.get("call_id") if isinstance(response, dict) else str(response)
        
        # Save to Omni call logs
        omni_call_logs_collection.insert_one({
            "call_id": call_id,
            "candidate_name": candidate_name,
            "phone_number": phone_number,
            "status": "initiated",
            "duration": "0m 0s",
            "recording_url": None,
            "job_id": job_id,
            "application_id": application_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        # Store calling data against the same application record
        app_doc = None
        if application_id:
            try:
                app_doc = job_applications_collection.find_one({"_id": ObjectId(application_id)})
            except Exception:
                pass
        
        if not app_doc and phone_number and job_id:
            app_doc = job_applications_collection.find_one({"job_id": job_id, "phone": phone_number})

        if app_doc:
            job_applications_collection.update_one(
                {"_id": app_doc["_id"]},
                {"$set": {
                    "job_id": job_id or app_doc.get("job_id"),
                    "application_id": str(app_doc["_id"]),
                    "resume_text": resume_text or app_doc.get("resume_text", ""),
                    "job_description": job_description or app_doc.get("job_description", ""),
                    "call_status": "initiated",
                    "omni_call_id": call_id,
                    "omni_call_details": {
                        "call_id": call_id,
                        "phone_number": phone_number,
                        "candidate_name": candidate_name,
                        "duration": "0m 0s",
                        "recording_url": None,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                }}
            )
        else:
            if job_id:
                new_app = {
                    "job_id": job_id,
                    "name": candidate_name,
                    "phone": phone_number,
                    "email": "",
                    "resume_url": "",
                    "linkedin_url": "",
                    "cover_letter": "",
                    "status": "Pending Review",
                    "applied_at": datetime.now(timezone.utc).isoformat(),
                    "resume_text": resume_text,
                    "job_description": job_description,
                    "call_status": "initiated",
                    "omni_call_id": call_id,
                    "omni_call_details": {
                        "call_id": call_id,
                        "phone_number": phone_number,
                        "candidate_name": candidate_name,
                        "duration": "0m 0s",
                        "recording_url": None,
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                }
                res = job_applications_collection.insert_one(new_app)
                job_applications_collection.update_one(
                    {"_id": res.inserted_id},
                    {"$set": {"application_id": str(res.inserted_id)}}
                )
        
        return {"status": "success", "call_id": call_id, "message": f"Manual AI Call initiated to {phone_number}"}
    except Exception as e:
        print(f"Error initiating manual AI call: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Omni Dimension Agent Data Routes ─────────────────────────────────────────

@router.get("/api/calls/agent-settings")
async def get_omni_agent_settings():
    """Fetch the Omni Dimension Agent settings."""
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        res = client.agent.list()
        bots = res.get('json', {}).get('bots', [])
        agent = next((b for b in bots if b.get('id') == agent_id), bots[0] if bots else {})
        return {"settings": agent}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Failed to fetch agent settings: {str(e)}"})


@router.get("/api/calls/knowledge-base")
async def get_omni_knowledge_base():
    """Fetch the Knowledge Base files from Omni Dimension."""
    from .omni_dimension_client import get_omni_client
    try:
        client = get_omni_client()
        res = client.knowledge_base.list()
        data = res.get('json', res)
        return {"files": data.get("files", []), "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/integrations")
async def get_omni_integrations():
    """Fetch integrations for the agent from Omni Dimension."""
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        res = client.integrations.get_agent_integrations(agent_id=agent_id)
        data = res.get('json', res)
        return {"integrations": data.get("integrations", []), "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/integrations/user")
async def get_user_integrations():
    from .omni_dimension_client import get_omni_client
    try:
        client = get_omni_client()
        res = client.integrations.get_user_integrations()
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        return {"integrations": data.get("integrations", []) if isinstance(data, dict) else [], "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

class CalendlyIntegrationRequest(BaseModel):
    name: str
    cal_api_key: str
    cal_id: str
    cal_timezone: str
    description: Optional[str] = ""

@router.post("/api/calls/integrations/calendly")
async def create_calendly_integration(req: CalendlyIntegrationRequest):
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        res = client.integrations.create_cal_integration(
            name=req.name,
            cal_api_key=req.cal_api_key,
            cal_id=req.cal_id,
            cal_timezone=req.cal_timezone,
            description=req.description
        )
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        
        # Depending on SDK response format, integration data might be nested
        integration_data = data.get("integration", data) if isinstance(data, dict) else data
        integration_id = integration_data.get("id") if isinstance(integration_data, dict) else getattr(integration_data, "id", None)
        
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        if integration_id:
            client.integrations.add_integration_to_agent(agent_id=agent_id, integration_id=integration_id)
            
        return {"success": True, "integration": integration_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

class CustomApiIntegrationRequest(BaseModel):
    name: str
    url: str
    method: str
    description: Optional[str] = ""
    headers: Optional[dict] = None
    body_type: Optional[str] = None
    body_content: Optional[dict] = None
    body_params: Optional[dict] = None
    query_params: Optional[dict] = None
    stop_listening: Optional[bool] = False
    request_timeout: Optional[int] = 10

@router.post("/api/calls/integrations/custom-api")
async def create_custom_api_integration(req: CustomApiIntegrationRequest):
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        res = client.integrations.create_custom_api_integration(
            name=req.name,
            url=req.url,
            method=req.method,
            description=req.description,
            headers=req.headers,
            body_type=req.body_type,
            body_content=req.body_content,
            body_params=req.body_params,
            query_params=req.query_params,
            stop_listening=req.stop_listening,
            request_timeout=req.request_timeout
        )
        data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
        
        integration_data = data.get("integration", data) if isinstance(data, dict) else data
        integration_id = integration_data.get("id") if isinstance(integration_data, dict) else getattr(integration_data, "id", None)
        
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        if integration_id:
            client.integrations.add_integration_to_agent(agent_id=agent_id, integration_id=integration_id)
            
        return {"success": True, "integration": integration_data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})

class DetachIntegrationRequest(BaseModel):
    integration_id: int

@router.post("/api/calls/integrations/detach")
async def detach_integration(req: DetachIntegrationRequest):
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        client.integrations.remove_integration_from_agent(agent_id=agent_id, integration_id=req.integration_id)
        return {"success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/call-config")
async def get_omni_call_config():
    """Fetch call configuration from agent settings."""
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        res = client.agent.list()
        bots = res.get('json', {}).get('bots', [])
        agent = next((b for b in bots if b.get('id') == agent_id), bots[0] if bots else {})
        config = {
            "silence_timeout": agent.get("silence_timeout"),
            "speech_speed": agent.get("speech_speed"),
            "max_call_duration_in_sec": agent.get("max_call_duration_in_sec"),
            "is_end_call_enabled": agent.get("is_end_call_enabled"),
            "end_call_condition": agent.get("end_call_condition"),
            "end_call_message": agent.get("end_call_message"),
            "voicemail_enabled": agent.get("voicemail_enabled"),
            "voicemail_message": agent.get("voicemail_message"),
            "background_noise_enabled": agent.get("background_noise_enabled"),
            "background_noice_name": agent.get("background_noice_name"),
            "background_audio_volume": agent.get("background_audio_volume"),
            "initial_ringing_sound_enabled": agent.get("initial_ringing_sound_enabled"),
            "is_transfer_enabled": agent.get("is_transfer_enabled"),
            "first_ideal_message": agent.get("first_ideal_message"),
            "second_ideal_message": agent.get("second_ideal_message"),
            "last_ideal_message": agent.get("last_ideal_message"),
            "user_idle_threshold_sec": agent.get("user_idle_threshold_sec"),
            "min_speech_duration_ms": agent.get("min_speech_duration_ms"),
        }
        return {"config": config, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/post-call-config")
async def get_omni_post_call_config():
    """Fetch post-call configuration from agent settings."""
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
        res = client.agent.list()
        bots = res.get('json', {}).get('bots', [])
        agent = next((b for b in bots if b.get('id') == agent_id), bots[0] if bots else {})
        post_call = agent.get("post_call_config_ids", [])
        return {"post_call_configs": post_call, "success": True}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/api/calls/recent-calls")
async def get_omni_recent_calls():
    """Fetch recent call logs directly from Omni Dimension SDK, including all evaluation scores."""
    from .omni_dimension_client import get_omni_client, OMNI_AGENT_ID
    try:
        client = get_omni_client()
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else None
        res = client.call.get_call_logs(agent_id=agent_id, page_size=50)
        # SDK always returns {"status": <int>, "json": <dict>}
        data = res.get('json', res) if isinstance(res, dict) else {}
        # Try all known keys the Omni Dimension API may use for the calls list
        calls = (
            data.get("calls")
            or data.get("call_log_data")
            or data.get("call_logs")
            or data.get("data")
            or data.get("results")
            or []
        )
        if not isinstance(calls, list):
            calls = []
        # Normalise each call record to extract evaluation / score fields
        normalised = []
        for c in calls:
            if not isinstance(c, dict):
                continue
            rec = dict(c)
            # Pull evaluation sub-object if present
            ev = rec.get("evaluation") or {}
            # Flatten evaluation fields to top-level for easy frontend access
            rec["sentiment_score"]            = ev.get("sentiment_score")            or rec.get("sentiment_score")
            rec["sentiment_analysis_details"] = ev.get("sentiment_analysis_details") or rec.get("sentiment_analysis_details")
            rec["cqs_score"]                  = ev.get("cqs_score")                  or rec.get("cqs_score")
            rec["cqs_score_message"]          = ev.get("cqs_score_message")          or rec.get("cqs_score_message")
            rec["metric_score_intent"]        = ev.get("metric_score_intent")        or rec.get("metric_score_intent")
            rec["metric_score_relevance"]     = ev.get("metric_score_relevance")     or rec.get("metric_score_relevance")
            rec["metric_score_latency"]       = ev.get("metric_score_latency")       or rec.get("metric_score_latency")
            rec["metric_score_coherence"]     = ev.get("metric_score_coherence")     or rec.get("metric_score_coherence")
            rec["p50_latency"]                = rec.get("p50_latency")
            rec["p99_latency"]                = rec.get("p99_latency")
            normalised.append(rec)
            
        return {"calls": normalised, "success": True, "total": len(normalised)}
    except Exception as e:
        import traceback
        print(f"[recent-calls ERROR] {traceback.format_exc()}")
        return JSONResponse(status_code=500, content={"detail": str(e)})

# ──────────────────────────────────────────────────────────────────────────────

@router.get("/api/calls/logs/{call_id}")
async def get_omni_call_log_details(call_id: str):
    """
    Fetches the detailed log for a specific call directly from Omni Dimension.
    """
    from . import omni_dimension_client
    try:
        response = omni_dimension_client.get_omni_call_status(call_id)
        if response and response.get('json') and response['json'].get('call_log_data'):
            log_data = response['json']['call_log_data'][0]
            
            # Flatten evaluation fields for the call itself
            ev = log_data.get("evaluation") or {}
            log_data["sentiment_score"]            = ev.get("sentiment_score")            or log_data.get("sentiment_score")
            log_data["sentiment_analysis_details"] = ev.get("sentiment_analysis_details") or log_data.get("sentiment_analysis_details")
            log_data["cqs_score"]                  = ev.get("cqs_score")                  or log_data.get("cqs_score")
            log_data["cqs_score_message"]          = ev.get("cqs_score_message")          or log_data.get("cqs_score_message")
            
            # Flatten interaction evaluation scores
            if "interactions" in log_data and isinstance(log_data["interactions"], list):
                for interaction in log_data["interactions"]:
                    int_ev = interaction.get("evaluation") or {}
                    interaction["metric_score_intent"]    = int_ev.get("metric_score_intent")    or interaction.get("metric_score_intent")
                    interaction["metric_score_relevance"] = int_ev.get("metric_score_relevance") or interaction.get("metric_score_relevance")
                    interaction["metric_score_latency"]   = int_ev.get("metric_score_latency")   or interaction.get("metric_score_latency")
                    interaction["metric_score_coherence"] = int_ev.get("metric_score_coherence") or interaction.get("metric_score_coherence")
            
            return {"log": log_data}
        raise HTTPException(status_code=404, detail="Call log details not found in Omni Dimension.")
    except Exception as e:
        print(f"Error fetching detailed call log {call_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def sync_call_status_helper(call_id: str, app_id: str = None):
    """
    Synchronizes call details from OmniDimension for a specific call_id.
    Updates the log in omni_call_logs and the corresponding application in job_applications.
    """
    from bson import ObjectId
    try:
        from . import omni_dimension_client
        status_response = omni_dimension_client.get_omni_call_status(str(call_id))
        if status_response and "call_logs" in status_response and status_response["call_logs"]:
            call_log_data = status_response["call_logs"][0]
            
            new_status = call_log_data.get("call_status", "initiated")
            duration_sec = call_log_data.get("duration_in_sec", 0)
            mins, secs = divmod(duration_sec, 60)
            duration_str = f"{mins}m {secs}s"
            recording_url = call_log_data.get("recording_url")
            
            # Extract evaluation, score, interest, transcript
            ev = call_log_data.get("evaluation") or {}
            score = ev.get("cqs_score") or call_log_data.get("cqs_score") or 0
            
            # Interest sentiment details or sentiment score
            interest = ev.get("sentiment_analysis_details") or ev.get("sentiment_score") or call_log_data.get("interest") or ""
            if not interest:
                interest = ev.get("summary") or ""
            
            # Transcript reconstruction
            transcript_list = []
            if "interactions" in call_log_data and isinstance(call_log_data["interactions"], list):
                interactions = call_log_data["interactions"]
                for interaction in interactions:
                    speaker = interaction.get("speaker", "Bot")
                    text = interaction.get("text", "")
                    if text:
                        transcript_list.append(f"{speaker}: {text}")
                        # Update interactions scores
                        int_ev = interaction.get("evaluation") or {}
                        interaction["metric_score_intent"]    = int_ev.get("metric_score_intent")    or interaction.get("metric_score_intent")
                        interaction["metric_score_relevance"] = int_ev.get("metric_score_relevance") or interaction.get("metric_score_relevance")
                        interaction["metric_score_latency"]   = int_ev.get("metric_score_latency")   or interaction.get("metric_score_latency")
                        interaction["metric_score_coherence"] = int_ev.get("metric_score_coherence") or interaction.get("metric_score_coherence")
            
            transcript_str = "\n".join(transcript_list)
            
            # Update call log
            log_fields = {
                "status": new_status,
                "duration": duration_str,
                "recording_url": recording_url,
                "cqs_score": score,
                "interest": interest,
                "transcript": transcript_str
            }
            if "interactions" in call_log_data:
                log_fields["interactions"] = call_log_data["interactions"]
                
            omni_call_logs_collection.update_one(
                {"call_id": call_id},
                {"$set": log_fields}
            )
            
            # Find the corresponding application document to update
            app_doc = None
            if app_id:
                try:
                    app_doc = job_applications_collection.find_one({"_id": ObjectId(app_id)})
                except Exception:
                    pass
            if not app_doc:
                app_doc = job_applications_collection.find_one({"omni_call_id": call_id})
            if not app_doc:
                phone_number = call_log_data.get("phone_number")
                if phone_number:
                    call_log = omni_call_logs_collection.find_one({"call_id": call_id})
                    if call_log and call_log.get("job_id"):
                        app_doc = job_applications_collection.find_one({
                            "job_id": call_log["job_id"], 
                            "phone": phone_number
                        })
            
            if app_doc:
                job_applications_collection.update_one(
                    {"_id": app_doc["_id"]},
                    {"$set": {
                        "call_status": new_status,
                        "interest": interest,
                        "score": score,
                        "transcript": transcript_str,
                        "omni_call_details": {
                            "call_id": call_id,
                            "phone_number": call_log_data.get("phone_number", app_doc.get("phone")),
                            "candidate_name": app_doc.get("name"),
                            "duration": duration_str,
                            "recording_url": recording_url,
                            "cqs_score": score,
                            "interest": interest,
                            "interactions": call_log_data.get("interactions", []),
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }
                    }}
                )
            return True
    except Exception as e:
        print(f"Error in sync_call_status_helper for call_id {call_id}: {e}")
    return False

@router.get("/api/calls/logs")
async def get_omni_call_logs():
    """
    Fetches all omni dimension call logs, updating pending calls with live data.
    """
    try:
        logs = list(omni_call_logs_collection.find().sort("created_at", -1))
        for log in logs:
            status = log.get("status", "").lower()
            if status not in ["completed", "failed", "no answer", "canceled"]:
                call_id = log.get("call_id")
                app_id = log.get("application_id")
                if call_id:
                    sync_call_status_helper(str(call_id), app_id)
            
        logs = list(omni_call_logs_collection.find().sort("created_at", -1))
        for log in logs:
            log["_id"] = str(log["_id"])
            
        return {"status": "success", "logs": logs}
    except Exception as e:
        print(f"Error fetching call logs: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/status/{session_id}")
async def check_ai_call_status(session_id: str):
    """
    Checks the status of the AI call for a given session.
    """
    session_data = interview_sessions_collection.find_one({
        "$or": [{"id": session_id}, {"link_id": session_id}]
    })
    
    if not session_data or not session_data.get("ai_call_id"):
        raise HTTPException(status_code=404, detail="AI call not found for this session")

    call_id = session_data["ai_call_id"]
    try:
        from . import omni_dimension_client
        status_response = omni_dimension_client.get_omni_call_status(call_id)
        
        # Update session with latest status if needed
        # status_response could contain duration, recording link, etc.
        
        return {"status": "success", "data": status_response}
    except Exception as e:
        print(f"Error checking AI call status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/calls/interested-candidates")
def get_interested_candidates(current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns all applications from job_applications_collection marked as interested from AI calling.
    For admin, filters by job owner.
    """
    try:
        query = {}
        if current_admin["role"] == "admin":
            # get all jobs owned by admin
            jobs = list(jobs_collection.find({"admin_id": current_admin["admin_id"]}))
            job_ids = [j.get("job_id") for j in jobs if j.get("job_id")]
            query["job_id"] = {"$in": job_ids}
            
        # We want applications where call_status is completed and interest is "Interested" (case-insensitive regex)
        query["interest"] = {"$regex": "interested", "$options": "i"}
        
        apps = list(job_applications_collection.find(query).sort("applied_at", -1))
        
        from .services import extract_text_from_file
        from bson import ObjectId
        import os
        
        updated_apps = []
        for a in apps:
            a["_id"] = str(a["_id"])
            if not a.get("resume_text") and a.get("resume_url"):
                r_url = a.get("resume_url")
                if os.path.exists(r_url):
                    try:
                        with open(r_url, "rb") as f:
                            text = extract_text_from_file(f.read(), r_url)
                            if text:
                                a["resume_text"] = text
                                job_applications_collection.update_one(
                                    {"_id": ObjectId(a["_id"])},
                                    {"$set": {"resume_text": text}}
                                )
                    except Exception as parse_err:
                        print(f"Failed to parse stored resume {r_url}: {parse_err}")
            updated_apps.append(a)
            
        return {"status": "success", "candidates": updated_apps}
    except Exception as e:
        print(f"Error fetching interested candidates: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CodingChatRequest(BaseModel):
    interview_id: str
    transcript: str
    code: str
    run_result: Optional[Dict[str, Any]] = None

@router.post("/coding-round/chat")
async def coding_round_chat(req: CodingChatRequest):
    """Provide conversational AI responses during the coding round"""
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
                passed_v = sum(1 for r in visible if r.get("passed"))
                total_v  = len(visible)
                passed_h = hidden.get("passed", 0)
                total_h  = hidden.get("total", 0)
                all_passed = rr.get("all_passed", False)

                failed_cases = [r for r in visible if not r.get("passed")]
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
        response = omni_dimension_client.start_omni_call(
            phone_number=data.phone_number,
            candidate_name=session.get("candidate_name", ""),
            job_description=session.get("job_description", ""),
            resume_text=session.get("resume_text", ""),
            duration=session.get("interview_duration", 15),
            skills=", ".join(session.get("custom_questions", []))
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

@router.post("/api/jobs")
def create_job(job: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    job_dict = job.dict()
    import random
    import string
    job_id = f"JOB-{''.join(random.choices(string.ascii_uppercase + string.digits, k=6))}"
    job_dict["job_id"] = job_id
    job_dict["admin_id"] = current_admin["admin_id"]
    job_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    job_dict["application_count"] = 0
    job_dict["custom_id"] = get_next_sequence_value("job", "JOB")
    result = jobs_collection.insert_one(job_dict)
    job_dict["_id"] = str(result.inserted_id)
    return {"status": "success", "job": job_dict}

@router.get("/api/jobs")
def get_admin_jobs(current_admin: dict = Depends(get_current_admin_details)):
    query = {}
    if current_admin["role"] == "admin":
         query["admin_id"] = current_admin["admin_id"]
    jobs = list(jobs_collection.find(query).sort("created_at", -1))
    for j in jobs:
        j["_id"] = str(j["_id"])
    return {"status": "success", "jobs": jobs}

@router.put("/api/jobs/{job_id}")
def update_job(job_id: str, job_update: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    update_data = job_update.dict()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = jobs_collection.update_one({"job_id": job_id}, {"$set": update_data})
    if result.matched_count == 0:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            result = jobs_collection.update_one({"_id": ObjectId(job_id)}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "success", "message": "Job updated"}

@router.delete("/api/jobs/{job_id}")
def delete_job(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    result = jobs_collection.delete_one({"job_id": job_id})
    if result.deleted_count == 0:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            result = jobs_collection.delete_one({"_id": ObjectId(job_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": "success", "message": "Job deleted"}

@router.get("/api/public/jobs/{job_id}")
def get_public_job(job_id: str):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job["_id"] = str(job["_id"])
    return {"status": "success", "job": job}

from fastapi import File, UploadFile, Form

@router.post("/api/public/jobs/{job_id}/apply")
def apply_for_job(job_id: str, application: JobApplicationCreate):
    """
    Accept a job application submitted as JSON by the public-facing form.
    Validates the job exists, persists the application, and increments
    the job's application_count atomically.
    """
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    actual_job_id = job.get("job_id") or str(job["_id"])
    app_dict = {
        "job_id": actual_job_id,
        "job_title": job.get("title"),
        "name": application.name,
        "email": application.email,
        "phone": application.phone,
        "resume_url": application.resume_url,
        "linkedin_url": application.linkedin_url,
        "cover_letter": application.cover_letter,
        "status": "Pending Review",
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }

    result = job_applications_collection.insert_one(app_dict)
    # Atomically increment application_count on the parent job
    jobs_collection.update_one(
        {"_id": job["_id"]},
        {"$inc": {"application_count": 1}},
    )
    print(f"[JobApply] New application for job_id={actual_job_id} by {application.email}, _id={result.inserted_id}")
    return {"status": "success", "message": "Application submitted successfully", "application_id": str(result.inserted_id)}

@router.get("/api/jobs/{job_id}/applications")
def get_job_applications(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns all applications submitted for a given job_id.
    Super-admins can view applications for any job; admins only for their own jobs.
    """
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Admins can only see applications for jobs they own (stored as admin_id since last fix)
    if current_admin["role"] == "admin" and job.get("admin_id") != current_admin["admin_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    actual_job_id = job.get("job_id") or str(job["_id"])
    applications = list(job_applications_collection.find({"job_id": actual_job_id}).sort("applied_at", -1))
    
    # Sync active calls
    for a in applications:
        call_status = (a.get("call_status") or "").lower()
        call_id = a.get("omni_call_id")
        if call_id and call_status and call_status not in ["completed", "failed", "no answer", "canceled"]:
            try:
                sync_call_status_helper(str(call_id), str(a["_id"]))
            except Exception as e:
                print(f"Failed to sync active call {call_id}: {e}")
                
    # Re-fetch after syncing to get fresh data
    applications = list(job_applications_collection.find({"job_id": actual_job_id}).sort("applied_at", -1))
    
    from .services import extract_text_from_file
    import os
    from bson import ObjectId
    
    for a in applications:
        a["_id"] = str(a["_id"])
        if not a.get("resume_text") and a.get("resume_url"):
            r_url = a.get("resume_url")
            if os.path.exists(r_url):
                try:
                    with open(r_url, "rb") as f:
                        text = extract_text_from_file(f.read(), r_url)
                        if text:
                            a["resume_text"] = text
                            job_applications_collection.update_one(
                                {"_id": ObjectId(a["_id"])},
                                {"$set": {"resume_text": text}}
                            )
                except Exception as parse_err:
                    print(f"Failed to parse stored resume {r_url}: {parse_err}")
                    
    return {"status": "success", "applications": applications, "total": len(applications)}

@router.patch("/api/jobs/{job_id}/applications/{app_id}/status")
def update_application_status(
    job_id: str,
    app_id: str,
    payload: dict,
    current_admin: dict = Depends(get_current_admin_details)
):
    """Update the status of a specific job application."""
    from bson import ObjectId as BsonObjectId
    new_status = payload.get("status", "").strip()
    allowed = {"Pending Review", "Shortlisted", "Interview Scheduled", "Rejected", "Hired"}
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")
    try:
        oid = BsonObjectId(app_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid application id")
    result = job_applications_collection.update_one(
        {"_id": oid},
        {"$set": {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {"status": "success", "message": f"Status updated to '{new_status}'"}

import PyPDF2
import io

@router.post("/api/public/jobs/parse-resume")
async def parse_resume(resume: UploadFile = File(...)):
    try:
        # Read the file content
        content = await resume.read()
        
        # We'll just handle PDFs for now as an example, but we can easily extend this
        extracted_text = ""
        if resume.filename.lower().endswith(".pdf"):
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                extracted_text += page.extract_text() + "\n"
        else:
            # If not PDF, just decode assuming txt or string (we can add docx later if needed)
            # Or just take a best effort for other text-based
            try:
                extracted_text = content.decode('utf-8', errors='ignore')
            except:
                extracted_text = ""

        if not extracted_text.strip():
             return {"status": "success", "data": {"name": "", "email": "", "phone": "", "linkedin_url": ""}}

        # Ensure text is not insanely large for the LLM context (truncate if necessary)
        extracted_text = extracted_text[:10000]

        prompt = f"""
        Extract the following information from the provided resume text. 
        Format the output strictly as JSON with keys: "name", "email", "phone", "linkedin_url".
        If a field is not found, leave it as an empty string. Do not include markdown formatting or comments.
        
        Resume Text:
        {extracted_text}
        """
        
        raw_response = chat_completion([{"role": "user", "content": prompt}])
        parsed_data = extract_json(raw_response) or {}
        
        return {
            "status": "success", 
            "data": {
                "name": parsed_data.get("name", ""),
                "email": parsed_data.get("email", ""),
                "phone": parsed_data.get("phone", ""),
                "linkedin_url": parsed_data.get("linkedin_url", "")
            }
        }
    except Exception as e:
        print(f"Error parsing resume: {e}")
        return {"status": "error", "data": {"name": "", "email": "", "phone": "", "linkedin_url": ""}}
