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

from app.routes.superadmin import TTSRequest

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/admin/voices")
def get_admin_voices(current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns available Cartesia custom voices configured in the backend .env file.
    Keys like CARTESIA_VOICE_ID and CARTESIA_VOICE_ID_1 are loaded.
    Attempts to fetch human-readable voice names from Cartesia where available.
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=True)
    
    cartesia_api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    cartesia_client = None
    if cartesia_api_key:
        try:
            from cartesia import Cartesia
            cartesia_client = Cartesia(api_key=cartesia_api_key)
        except Exception as e:
            logger.warning(f"Could not initialize Cartesia in get_admin_voices: {e}")

    def _get_cartesia_name(voice_id: str) -> Optional[str]:
        if not cartesia_client or not voice_id:
            return None
        try:
            v_obj = cartesia_client.voices.get(id=voice_id)
            return getattr(v_obj, "name", None)
        except Exception:
            return None

    voices = []
    seen_ids = set()

    # Collect configured CARTESIA_VOICE_ID_* entries
    for key, value in sorted(os.environ.items()):
        if key.startswith("CARTESIA_VOICE_ID_") and value:
            val = str(value).strip()
            name_part = key.replace("CARTESIA_VOICE_ID_", "").replace("_", " ").title()
            real_name = _get_cartesia_name(val)
            display_name = f"{name_part} ({real_name})" if real_name else name_part
            voices.append({"name": display_name, "id": val})
            seen_ids.add(val)

    # Default configured voice
    default_voice_id = str(os.getenv("CARTESIA_VOICE_ID") or "").strip()
    if default_voice_id and default_voice_id not in seen_ids:
        real_name = _get_cartesia_name(default_voice_id)
        display_name = f"Default Voice ({real_name})" if real_name else "Default Voice"
        voices.insert(0, {"name": display_name, "id": default_voice_id})
            
    return {"status": "success", "voices": voices}

@router.post("/voice-clone-instant")
async def voice_clone_instant(
    audio: UploadFile = File(...),
    voice_name: Optional[str] = Form("CandidateVoice"),
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
            new_voice = client.voices.clone(
                filepath=temp_audio,
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
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=True)
    cartesia_api_key = os.getenv("CARTESIA_API_KEY", "").strip()
    default_cartesia_voice = os.getenv("CARTESIA_VOICE_ID", "").strip()
    session_cloned_voice = str(candidate_session.get("cloned_voice_id") or "").strip()
    session_custom_voice = str(candidate_session.get("custom_voice_id") or "").strip()
    requested_voice_id = str(req.voice_id or "").strip()

    # Security check: If a per-session clone exists and a different requested_voice_id is passed, reject.
    if session_cloned_voice and requested_voice_id and not hmac.compare_digest(requested_voice_id, session_cloned_voice):
        raise HTTPException(status_code=403, detail="Voice ID does not belong to this interview session")

    # Priority: on-the-fly session clone > interview-configured custom voice > requested voice > global default Cartesia voice
    target_voice_id = (
        session_cloned_voice
        or session_custom_voice
        or requested_voice_id
        or default_cartesia_voice
    )

    is_voice_cloning_enabled = bool(req.use_custom_voice)

    from fastapi.responses import StreamingResponse
    import io

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Build Edge TTS regional voice map (used as fallback for regional languages)
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

    # Cartesia multilingual language code mapping
    cartesia_language_map = {
        "english": "en",
        "hindi": "hi",
        "telugu": "te",
        "tamil": "ta",
        "kannada": "kn",
        "malayalam": "ml",
        "bengali": "bn",
        "marathi": "mr",
        "gujarati": "gu",
        "punjabi": "pa",
        "french": "fr",
        "german": "de",
        "spanish": "es",
        "japanese": "ja",
        "chinese": "zh",
        "russian": "ru",
        "arabic": "ar",
        "portuguese": "pt",
        "italian": "it",
        "korean": "ko",
        "dutch": "nl",
        "polish": "pl",
        "swedish": "sv",
        "turkish": "tr",
        "tagalog": "tl",
        "vietnamese": "vi",
        "indonesian": "id",
        "thai": "th",
    }
    cartesia_lang = cartesia_language_map.get(str(req.language or "English").strip().lower(), "en")

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Cartesia path — for ALL languages when keys are configured and voice cloning is enabled
    # ──────────────────────────────────────────────────────────────────────────
    if is_voice_cloning_enabled and cartesia_api_key and target_voice_id:
        try:
            import asyncio
            # pyrefly: ignore [missing-import]
            from cartesia import Cartesia

            def _call_cartesia(voice_id_to_use: str):
                client = Cartesia(api_key=cartesia_api_key)
                result = client.tts.generate(
                    model_id="sonic-latest",
                    transcript=req.text,
                    voice={"mode": "id", "id": voice_id_to_use},
                    language=cartesia_lang,
                    output_format={
                        "container": "mp3",
                        "encoding": "mp3",
                        "sample_rate": 44100,
                    },
                )
                return result.read()

            try:
                audio_bytes = await asyncio.get_event_loop().run_in_executor(
                    None, lambda: _call_cartesia(target_voice_id)
                )
            except Exception as primary_err:
                logger.warning(f"[TTS] Cartesia custom voice {target_voice_id} failed: {primary_err}. Attempting default voice.")
                if default_cartesia_voice and default_cartesia_voice != target_voice_id:
                    audio_bytes = await asyncio.get_event_loop().run_in_executor(
                        None, lambda: _call_cartesia(default_cartesia_voice)
                    )
                else:
                    raise primary_err

            if audio_bytes:
                print(f"[TTS] Cartesia: OK ({len(audio_bytes)} bytes) | voice={target_voice_id} | lang={cartesia_lang}")
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
        
        # Collect all audio chunks into a single bytes object for reliable playback
        audio_chunks = []
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_chunks.append(chunk["data"])
        audio_bytes = b"".join(audio_chunks)
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/mpeg")
    except Exception as edge_err:
        print(f"[TTS] Edge TTS Error: {edge_err}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {edge_err}")



from difflib import SequenceMatcher

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def fix_candidate_name(text: str, candidate_name: str) -> str:
    if not text or not candidate_name or candidate_name.lower() in {"candidate", "user", "unknown"}:
        return text
    
    clean_name = candidate_name.strip()
    name_parts = [p for p in clean_name.split() if len(p) >= 2]
    if not name_parts:
        return text
    
    words = text.split()
    n_words = len(words)
    k = len(name_parts)
    
    # 1. Multi-word phrase window match
    i = 0
    while i <= n_words - k:
        window = " ".join(words[i:i+k])
        if similarity(window, clean_name) >= 0.75:
            words[i:i+k] = [clean_name]
            n_words = len(words)
            i += 1
            continue
        i += 1

    # 2. Match individual name tokens
    for p in name_parts:
        for idx, w in enumerate(words):
            stripped_w = "".join(c for c in w if c.isalnum())
            if len(stripped_w) >= 3 and similarity(stripped_w, p) >= 0.80:
                prefix_punct = w[:len(w) - len(w.lstrip(".,!?;:\"'"))]
                suffix_punct = w[len(w.rstrip(".,!?;:\"'")):]
                words[idx] = f"{prefix_punct}{p}{suffix_punct}"

    return " ".join(words)

stt_inflight_counter = 0

@router.post("/stt")
async def stt_endpoint(
    file: UploadFile = File(...),
    language: Optional[str] = None,
    known_terms: Optional[str] = Form(None),
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
        if file_size < 3000:
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
            
            candidate_name = str(candidate_session.get("candidate_name") or "").strip()

            known_terms_hint = ""
            if known_terms:
                clean_terms = [t.strip() for t in (known_terms.split(",") if isinstance(known_terms, str) else known_terms) if t.strip()]
                if clean_terms:
                    known_terms_hint = ", ".join(clean_terms)

            # Whisper prompt should ONLY contain a comma-separated list of terms
            # to avoid the model treating conversational instructions as preceding text
            # and hallucinating them into the output.
            # NOTE: We deliberately DO NOT pass the candidate_name in the prompt because 
            # Whisper will aggressively hallucinate it if it hears background noise. 
            # We rely on the frontend's `formatCandidateName` to fix misspellings instead.
            sys_prompt = known_terms_hint if iso_lang == "en" else ""

            # Audio probing for WebM is omitted here because standard wave module cannot parse WebM.
            # We rely on the frontend's STT RMS silence gate (CHUNK_SEND_RMS_THRESHOLD) 
            # to filter out silence before it reaches the backend.

            from app.ai.groq_manager import groq_key_manager
            from groq import AsyncGroq, RateLimitError, AuthenticationError

            max_attempts = groq_key_manager.get_total_keys() or 1
            transcript = None
            last_error = None

            for _ in range(max_attempts):
                api_key = groq_key_manager.get_next_key()
                if not api_key:
                    raise HTTPException(status_code=503, detail="Voice transcription is temporarily unavailable — no valid Groq API keys.")

                groq_client = AsyncGroq(api_key=api_key)
                try:
                    with open(temp_filename, "rb") as f:
                        transcript = await groq_client.audio.transcriptions.create(
                            # whisper-large-v3 (not -turbo) — turbo hallucinates ~3× more
                            model="whisper-large-v3",
                            file=f,
                            language=iso_lang,
                            prompt=sys_prompt,
                            response_format="verbose_json",
                            temperature=0.0,
                        )
                    break  # success
                except AuthenticationError:
                    # Key is invalid/expired — blacklist it permanently and try next
                    groq_key_manager.mark_invalid(api_key)
                    continue
                except RateLimitError as e:
                    last_error = e
                    continue

            if transcript is None:
                if last_error:
                    raise last_error
                raise HTTPException(status_code=503, detail="Transcription failed after exhausting all API keys.")


            valid_segments = []
            hallucinated_segments = 0
            dropped_segment_texts = []
            for segment in getattr(transcript, "segments", []) or []:
                no_speech = segment.get("no_speech_prob", 0) if isinstance(segment, dict) else getattr(segment, "no_speech_prob", 0)
                avg_logprob = segment.get("avg_logprob", 0) if isinstance(segment, dict) else getattr(segment, "avg_logprob", 0)
                compression = segment.get("compression_ratio", 0) if isinstance(segment, dict) else getattr(segment, "compression_ratio", 0)
                segment_text = segment.get("text", "") if isinstance(segment, dict) else getattr(segment, "text", "")

                # ── Hallucination filters (calibrated for fast/accented speech) ──
                # avg_logprob < -1.5  — real speech (even fast/accented) stays above -1.2.
                #                       -0.7 was far too strict and was dropping real sentences.
                # compression > 2.4   — repetition loops only (normal speech ~1.0-1.8)
                # no_speech > 0.6     — high confidence silence; 0.4 was dropping real soft speech
                if avg_logprob < -1.5:
                    hallucinated_segments += 1
                    dropped_segment_texts.append(segment_text.strip())
                    continue
                if compression > 2.4:
                    hallucinated_segments += 1
                    dropped_segment_texts.append(segment_text.strip())
                    continue
                if no_speech > 0.6:
                    hallucinated_segments += 1
                    dropped_segment_texts.append(segment_text.strip())
                    continue
                # Pure single-token segments with no context are 90%+ hallucinations
                cleaned = segment_text.strip()
                if not cleaned:
                    continue
                if len(cleaned.split()) == 1 and len(cleaned) < 6:
                    # Common 1-5 char "phantom" tokens Whisper loves to emit
                    if cleaned.lower().rstrip(".,!?") in {
                        "you", "bye", "um", "uh", "hmm", "mm", "tsh",
                        "okay", "ok", "so", "and", "the", "a", "i",
                    }:
                        hallucinated_segments += 1
                        dropped_segment_texts.append(cleaned)
                        continue

                valid_segments.append(cleaned)

            raw_text = str(getattr(transcript, "text", "") or "").strip()
            transcript_text = " ".join(value for value in valid_segments if value).strip()

            # ── Sentence-level / global hallucination filter ──
            # Strip the well-known phantom phrases and short interjections Whisper
            # emits on silence or noise.
            HALLUCINATIONS = {
                "thank you", "thanks", "okay", "you", "bye",
                "um", "uh", "hmm", "mm", "go to next slide",
                "go to the next slide", "next slide", "thank you for watching",
                "subscribe", "i am not spoken", "am i not spoken", "i am not",
                "tsh", "thanks for watching", "the end", "goodbye", "see you",
                "thank you for listening", "like and subscribe", "please subscribe",
                "click the bell", "see you next time", "have a nice day",
                "thank you for your time", "i'll see you in the next video",
                "thanks for watching", "see you in the next video", "thank you so much",
                "thank you very much", "have a good day", "take care",
                "see you soon", "bye bye", "good night", "good morning",
                "thank you for joining", "thanks for joining", "please like",
                "don't forget to subscribe", "hit the like", "comment below",
                "thank you for your attention",
            }

            
            SUBSTRING_HALLUCINATIONS = [
                "amara.org", "transcribe verbatim", "tanscribe verbatim",
                "repented of the stupidity", "video clip", "the name of the person",
                "i thought of putting it here", "not able to read it",
                "adekitashi", "food, dhan", "subtitles by", "please subscribe",
                "subscribe to my channel", "click the bell", "thanks for watching",
                "thank you for watching", "like and subscribe"
            ]

            if transcript_text:
                # Substring scrub
                t_lower = transcript_text.lower()
                for bad_sub in SUBSTRING_HALLUCINATIONS:
                    if bad_sub in t_lower:
                        # If it contains massive hallucination blocks, just drop the whole text
                        transcript_text = ""
                        break

                cleaned_lower = transcript_text.lower().rstrip(".,!? ")
                # Drop the transcript entirely if it's a known hallucination
                if cleaned_lower in HALLUCINATIONS or transcript_text.strip() == "":
                    transcript_text = ""
                else:
                    # Drop hallucinated leading/trailing fragments while keeping
                    # any real words the candidate actually said.
                    words = transcript_text.split()
                    while words and words[0].lower().rstrip(".,!?") in HALLUCINATIONS:
                        words.pop(0)
                    while words and words[-1].lower().rstrip(".,!?") in HALLUCINATIONS:
                        words.pop()
                    transcript_text = " ".join(words).strip()

                    # If majority of segments were hallucinations, drop everything.
                    if valid_segments and hallucinated_segments > len(valid_segments):
                        transcript_text = ""
                    # If transcript is < 4 characters after cleaning, treat as noise
                    elif len(transcript_text) < 4:
                        transcript_text = ""

            # If a hallucinated segment contained real-looking text we dropped
            # (e.g. candidate name), still apply the candidate-name fix.
            if iso_lang == "en" and candidate_name and transcript_text:
                transcript_text = fix_candidate_name(transcript_text, candidate_name)

            dur = round(time.time() - t0, 3)
            if dropped_segment_texts:
                print(f"🚫 [STT HALLUCINATION FILTER] Rejected {len(dropped_segment_texts)} segments: {dropped_segment_texts[:3]}")
            print(f"✅ [STT CONCURRENCY TRACE - REQ #{req_id}] HTTP 200 OK | Latency: {dur}s | Transcript: {transcript_text[:50]}...")
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

