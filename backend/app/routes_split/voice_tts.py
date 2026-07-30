"""
app/routes_split/voice_tts.py — Voices, TTS, STT, voice-clone
Auto-split from routes.py lines 10360–10705.
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

from app.routes_split.superadmin import TTSRequest

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/admin/voices")
def get_admin_voices(current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns available Cartesia custom voices configured in the backend .env file.
    Keys like CARTESIA_VOICE_ID and CARTESIA_VOICE_ID_MALE are loaded.
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=False)
    
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
async def voice_clone_instant(
    audio: UploadFile = File(...),
    voice_name: Optional[str] = "CandidateVoice",
    candidate_session: dict = Depends(require_active_candidate),
):
    """
    Cartesia Instant Voice Cloning endpoint.
    Accepts a short audio sample (webm/mp3/wav), sends it to Cartesia,
    and returns a temporary voice_id that can be used for the session's TTS calls.
    Requires CARTESIA_API_KEY in the .env file.
    """
    import asyncio
    try:
        # pyrefly: ignore [missing-import]
        from cartesia import Cartesia
    except ImportError:
        raise HTTPException(status_code=500, detail="Cartesia SDK not installed. Run `pip install cartesia`.")

    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=False)


    api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Cartesia API key not configured. Voice cloning is unavailable.")

    allowed_audio_types = {
        "audio/webm",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/ogg",
        "audio/mp4",
        "application/octet-stream",
    }
    if audio.content_type not in allowed_audio_types:
        raise HTTPException(status_code=415, detail="Unsupported voice sample format")

    # Save the uploaded file to a private temporary location.
    ext = "webm"
    if audio.filename:
        ext = audio.filename.rsplit(".", 1)[-1].lower() if "." in audio.filename else "webm"
    temp_handle = tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}")
    temp_audio = temp_handle.name
    temp_handle.close()
    try:
        audio_bytes = await audio.read(10 * 1024 * 1024 + 1)
        if len(audio_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Voice sample exceeds 10 MB")
        if len(audio_bytes) < 1000:
            raise HTTPException(status_code=422, detail="Voice sample is too short")
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

        interview_sessions_collection.update_one(
            {"_id": candidate_session["_id"]},
            {
                "$set": {
                    "cloned_voice_id": voice_id,
                    "cloned_voice_created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        print(f"[VoiceClone] Created Cartesia voice_id={voice_id}")
        return {"voice_id": voice_id, "status": "success"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[VoiceClone] Cartesia Error: {e}")
        raise HTTPException(status_code=500, detail=f"Cartesia error: {str(e)}")
    finally:
        if os.path.exists(temp_audio):
            os.remove(temp_audio)

@router.post("/tts")
async def generate_tts(
    req: TTSRequest,
    candidate_session: dict = Depends(require_active_candidate),
):
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
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=False)
    cartesia_api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    session_voice_id = str(candidate_session.get("cloned_voice_id") or "").strip()
    requested_voice_id = str(req.voice_id or "").strip()
    if requested_voice_id and not (
        session_voice_id and hmac.compare_digest(requested_voice_id, session_voice_id)
    ):
        raise HTTPException(status_code=403, detail="Voice ID does not belong to this interview session")
    # A per-session clone takes priority over the configured global voice.
    cartesia_voice_id = session_voice_id or os.getenv("CARTESIA_VOICE_ID", "").strip()

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
    actual_cartesia_voice_id = cartesia_voice_id

    if req.use_custom_voice and cartesia_api_key and actual_cartesia_voice_id and not is_regional:
        try:
            import asyncio
            # pyrefly: ignore [missing-import]
            from cartesia import Cartesia

            def _call_cartesia():
                client = Cartesia(api_key=cartesia_api_key)
                result = client.tts.generate(
                    model_id="sonic-english",
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



stt_inflight_counter = 0

@router.post("/stt")
async def stt_endpoint(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    candidate_session: dict = Depends(require_active_candidate),
):
    """Transcribe audio via Groq Whisper with concurrency & rate limit tracking"""
    global stt_inflight_counter
    stt_inflight_counter += 1
    current_inflight = stt_inflight_counter
    req_id = uuid.uuid4().hex[:8]
    t0 = time.time()
    
    try:
        audio_content = await file.read(25 * 1024 * 1024 + 1)
        file_size = len(audio_content)
        if file_size > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Audio upload exceeds 25 MB")
        if file_size < 12_000:
            return {"transcript": ""}
        header_hex = audio_content[:16].hex() if file_size >= 16 else ""
        print(f"📊 [STT CONCURRENCY TRACE - REQ #{req_id}] Started | In-Flight Requests: {current_inflight} | File: {file.filename} ({file_size} bytes)")
        
        original_name = file.filename or "audio.webm"
        extension = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else "webm"
        if extension not in {"webm", "ogg", "mp4", "wav", "m4a", "mp3"}:
            extension = "webm"
        with tempfile.NamedTemporaryFile(delete=False, suffix=f".{extension}") as temp_file:
            temp_file.write(audio_content)
            temp_filename = temp_file.name
            
        try:
            iso_lang = language or "en"
            if iso_lang not in {"en", "hi", "te", "ta", "ml", "kn"}:
                raise HTTPException(status_code=422, detail="Unsupported transcription language")
            sys_prompt = "The speaker has an Indian English accent. Transcribe technical terms, programming concepts, and software engineering terminology accurately." if iso_lang == "en" else ""
            
            from app.groq_manager import groq_key_manager
            from groq import AsyncGroq, RateLimitError
            
            max_attempts = groq_key_manager.get_total_keys() or 1
            transcript = None
            last_error = None
            
            for _ in range(max_attempts):
                api_key = groq_key_manager.get_next_key()
                if not api_key:
                    raise HTTPException(status_code=503, detail="Voice transcription is temporarily unavailable.")
                
                groq_client = AsyncGroq(api_key=api_key)
                try:
                    with open(temp_filename, "rb") as f:
                        transcript = await groq_client.audio.transcriptions.create(
                            model="whisper-large-v3-turbo",
                            file=f,
                            language=iso_lang,
                            prompt=sys_prompt,
                            response_format="verbose_json",
                            temperature=0.0,
                        )
                    break
                except RateLimitError as e:
                    last_error = e
                    continue
                    
            if transcript is None:
                if last_error:
                    raise last_error
                raise HTTPException(status_code=503, detail="Transcription failed after exhausting all API keys.")
                
            valid_segments = []
            for segment in getattr(transcript, "segments", []) or []:
                no_speech = segment.get("no_speech_prob", 0) if isinstance(segment, dict) else getattr(segment, "no_speech_prob", 0)
                avg_logprob = segment.get("avg_logprob", 0) if isinstance(segment, dict) else getattr(segment, "avg_logprob", 0)
                compression = segment.get("compression_ratio", 0) if isinstance(segment, dict) else getattr(segment, "compression_ratio", 0)
                segment_text = segment.get("text", "") if isinstance(segment, dict) else getattr(segment, "text", "")
                if iso_lang == "en":
                    if no_speech > 0.45 or avg_logprob < -1.0 or compression > 2.4:
                        continue
                elif no_speech > 0.75 or compression > 2.4:
                    continue
                valid_segments.append(segment_text.strip())

            raw_text = str(getattr(transcript, "text", "") or "").strip()
            transcript_text = " ".join(value for value in valid_segments if value).strip()
            if not getattr(transcript, "segments", None):
                transcript_text = raw_text
            if transcript_text.lower() in {
                "thank you",
                "thank you.",
                "thanks",
                "thanks.",
                "okay",
                "okay.",
                "you",
                "bye",
                "bye.",
            }:
                transcript_text = ""
            dur = round(time.time() - t0, 3)
            print(f"✅ [STT CONCURRENCY TRACE - REQ #{req_id}] HTTP 200 OK | Latency: {dur}s")
            return {"transcript": transcript_text}
        finally:
            if os.path.exists(temp_filename):
                os.remove(temp_filename)
    except Exception as e:
        dur = round(time.time() - t0, 3)
        err_str = str(e)
        status_code = getattr(e, 'status_code', 500)
        if "429" in err_str or status_code == 429 or "rate_limit" in err_str.lower():
            print(f"🚨 [STT RATE LIMIT EXCEEDED - REQ #{req_id}] HTTP 429 TOO MANY REQUESTS | Latency: {dur}s | Error: {err_str}")
            raise HTTPException(status_code=429, detail=f"Groq Rate Limit Exceeded: {err_str}")
        else:
            print(f"❌ [STT CONCURRENCY ERROR - REQ #{req_id}] HTTP {status_code} | Latency: {dur}s | Error: {err_str}")
            raise HTTPException(status_code=status_code, detail=err_str)
    finally:
        stt_inflight_counter = max(0, stt_inflight_counter - 1)

# ─── Omni Dimension AI Calling Endpoints ──────────────────────────────────────

