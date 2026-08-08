import os
import asyncio
import tempfile
from functools import lru_cache
from difflib import SequenceMatcher
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from groq import Groq, RateLimitError
from app.services.candidate_auth import require_active_candidate
from app.ai.groq_manager import groq_key_manager

router = APIRouter()

def similarity(a, b):
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

@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    candidate_name: str = Form(...),
    language: str = Form("English"),
    known_terms: Optional[str] = Form(None),
    candidate_session: dict = Depends(require_active_candidate),
):
    candidate_name = candidate_name.strip()[:200] or "Candidate"
    allowed_languages = {"Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "English"}
    if language not in allowed_languages:
        raise HTTPException(status_code=422, detail="Unsupported interview language")

    data = await audio.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio upload exceeds 25 MB")

    # Use the original filename extension so Groq gets correct format
    original_filename = audio.filename or 'audio.webm'
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else 'webm'
    if ext not in ('webm', 'ogg', 'mp4', 'wav', 'm4a', 'mp3'):
        ext = 'webm'

    # Reject tiny audio blobs under 3KB (headers only, no actual speech data)
    MIN_AUDIO_BYTES = 3000
    if len(data) < MIN_AUDIO_BYTES:
        return {"text": ""}

    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as f:
        f.write(data)
        path = f.name

    try:
        # Map frontend language names to ISO-639-1 for Whisper
        lang_map = {
            "Hindi": "hi",
            "Telugu": "te",
            "Tamil": "ta",
            "Malayalam": "ml",
            "Kannada": "kn",
            "English": "en"
        }
        iso_lang = lang_map.get(language, "en")
        
        # Initial prompt strategy:
        native_prompts = {
            "te": "నమస్కారం. నేను ఒక ఇంటర్వ్యూ ఇస్తున్నాను.",
            "hi": "नमस्ते। मैं एक साक्षात्कार दे रहा हूँ।",
            "ta": "வணக்கம். நான் ஒரு நேர்காணலில் பங்கேற்கிறேன்.",
            "ml": "നമസ്കാരം. ഞാൻ ഒരു അഭിമുഖത്തിൽ പങ്കെടുക്കുകയാണ്.",
            "kn": "ನಮಸ್ಕಾರ. ನಾನು ಒಂದು ಸಂದರ್ಶನದಲ್ಲಿ ಭಾಗವಹಿಸುತ್ತಿದ್ದೇನೆ.",
        }
        if iso_lang == "en":
            known_terms_hint = ""
            if known_terms:
                clean_terms = [t.strip() for t in (known_terms.split(",") if isinstance(known_terms, str) else known_terms) if t.strip()]
                if clean_terms:
                    known_terms_hint = f" The candidate may mention these specific proper nouns, companies, technologies, or terms: {', '.join(clean_terms)}."
            sys_prompt = f"Technical software engineering job interview with Indian and international English accents. Candidate name is {candidate_name}.{known_terms_hint} Accurately transcribe all programming concepts (Python, Java, JavaScript, TypeScript, C++, SQL), frameworks (React, Node.js, FastAPI, Django), databases (MongoDB, PostgreSQL, Redis), cloud tools (AWS, Docker, Kubernetes), APIs, and system design terms verbatim."
        else:
            sys_prompt = native_prompts.get(iso_lang, "")

        max_attempts = groq_key_manager.get_total_keys() or 1
        transcription = None
        last_error = None
        
        for _ in range(max_attempts):
            api_key = groq_key_manager.get_next_key()
            if not api_key:
                raise HTTPException(status_code=503, detail="Voice transcription is temporarily unavailable.")
                
            client = Groq(api_key=api_key)

            def call_transcription_api():
                with open(path, "rb") as file:
                    return client.audio.transcriptions.create(
                        file=(os.path.basename(path), file.read()),
                        model="whisper-large-v3-turbo",
                        language=iso_lang,
                        prompt=sys_prompt,
                        response_format="verbose_json",
                        temperature=0.0
                    )
            
            try:
                transcription = await asyncio.to_thread(call_transcription_api)
                break # Success
            except RateLimitError as e:
                last_error = e
                continue # Try next key
            except Exception as e:
                # Other errors like 400 Bad Request, etc.
                raise
                
        if transcription is None:
            if last_error:
                raise last_error
            raise HTTPException(status_code=503, detail="Transcription failed after exhausting all API keys.")

        valid_texts = []
        segments = getattr(transcription, 'segments', [])
        raw_text = str(getattr(transcription, "text", "") or "").strip()
        if segments:
            for seg in segments:
                no_speech_prob = seg.get('no_speech_prob', 0) if isinstance(seg, dict) else getattr(seg, 'no_speech_prob', 0)
                avg_logprob = seg.get('avg_logprob', 0) if isinstance(seg, dict) else getattr(seg, 'avg_logprob', 0)
                compression_ratio = seg.get('compression_ratio', 0) if isinstance(seg, dict) else getattr(seg, 'compression_ratio', 0)
                seg_text = seg.get('text', '') if isinstance(seg, dict) else getattr(seg, 'text', '')
                
                # Only drop definite silence or severe repetition loops
                if no_speech_prob > 0.85 or compression_ratio > 2.5:
                    continue
                # If avg_logprob is extremely low (< -2.0) and no_speech > 0.5, skip unintelligible noise
                if avg_logprob < -2.0 and no_speech_prob > 0.5:
                    continue
                    
                valid_texts.append(seg_text.strip())

            text = " ".join(valid_texts).strip()
            if not text and raw_text:
                text = raw_text
        else:
            text = raw_text

        # Only fix name for English – fix_name splits on spaces, which corrupts
        # native scripts (Telugu, Hindi, etc.) and injects the English name.
        if iso_lang == "en":
            text = fix_candidate_name(text, candidate_name)
        
        # Filter common Whisper hallucinations on silent/background noise
        hallucinations = {
            "thank you", "i am not spoken", "am i not spoken",
            "i am not", "bye", "okay", "you", "thanks", "tsh",
            "go to next slide", "go to the next slide",
            "thank you for watching", "subscribe", "next slide"
        }
        if text.lower().rstrip(".,!?") in hallucinations:
            text = ""

        import re
        # Aggressively filter out non-lexical sounds and Whisper static interpretations
        text = re.sub(r'\b(tsh|tch|shh|hmm|uh|um|mm)\b[.,]?', '', text, flags=re.IGNORECASE)
        # Remove repeated non-lexical artifacts like "Tsh, Tsh, Tsh"
        text = re.sub(r'(?i)\b(tsh|tch)[\s,]+', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
            
    except HTTPException:
        raise
    except Exception:
        # Never return an operational error as candidate speech; older behavior
        # caused the frontend to save "Transcription failed: ..." as an answer.
        raise HTTPException(status_code=503, detail="Voice transcription failed. Please retry.")
    finally:
        os.remove(path)

    return {"text": text}
