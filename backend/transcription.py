import os
import asyncio
import tempfile
from functools import lru_cache
from difflib import SequenceMatcher
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from groq import Groq, RateLimitError
from app.candidate_auth import require_active_candidate
from app.groq_manager import groq_key_manager

router = APIRouter()

def similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def fix_name(text, name):
    words = text.split()
    for i, w in enumerate(words):
        if similarity(w, name) > 0.75:
            words[i] = name
    return " ".join(words)

@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    candidate_name: str = Form(...),
    language: str = Form("English"),
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

    # Lower byte threshold so 2.5-second audio chunks pass through cleanly
    MIN_AUDIO_BYTES = 1500
    if len(data) < MIN_AUDIO_BYTES:
        return {"text": ""}

    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as f:
        f.write(data)
        path = f.name

    try:
        # Map frontend language names to ISO-639-1
        lang_map = {
            "Hindi": "hi",
            "Telugu": "te",
            "Tamil": "ta",
            "Malayalam": "ml",
            "Kannada": "kn",
            "English": "en"
        }
        iso_lang = lang_map.get(language, "en")
        
        # --- Deepgram API Support (Primary path if key configured) ---
        deepgram_key = os.getenv("DEEPGRAM_API_KEY")
        if deepgram_key:
            import requests as dg_requests
            try:
                headers = {
                    "Authorization": f"Token {deepgram_key}",
                    "Content-Type": f"audio/{ext}" if ext != 'm4a' else "audio/mp4"
                }
                url = f"https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language={iso_lang}"
                dg_res = dg_requests.post(url, headers=headers, data=data, timeout=8)
                if dg_res.status_code == 200:
                    dg_json = dg_res.json()
                    dg_transcript = dg_json.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
                    if dg_transcript.strip():
                        formatted = fix_name(dg_transcript.strip(), candidate_name)
                        link_id = str(candidate_session.get("link_id") or "")
                        if link_id and formatted:
                            try:
                                from redis_manager import manager
                                await manager.broadcast_to_link(link_id, {
                                    "type": "interview_transcript",
                                    "speaker": candidate_name,
                                    "text": formatted
                                })
                            except Exception as b_err:
                                print(f"[WebSocket Deepgram Broadcast Error] {b_err}")
                        return {"text": formatted}
            except Exception as dg_err:
                print(f"[Deepgram STT] Request error ({dg_err}) — falling back to Groq Whisper")
        
        # --- Groq Whisper API (Fallback path) ---
        native_prompts = {
            "te": "నమస్కారం. నేను ఒక ఇంటర్వ్యూ ఇస్తున్నాను.",
            "hi": "नमस्ते। मैं एक साक्षात्कार दे रहा हूँ।",
            "ta": "வணக்கம். நான் ஒரு நேர்காணலில் பங்கேற்கிறேன்.",
            "ml": "నమస్కారం. నేను ఒక ఇంటర్వ్యూ ఇస్తున్నాను.",
            "kn": "ನಮಸ್ಕಾರ. ನಾನು ಒಂದು ಸಂದರ್ಶನದಲ್ಲಿ ಭಾಗವಹಿಸುತ್ತಿದ್ದೇನೆ.",
        }
        if iso_lang == "en":
            sys_prompt = "Technical interview response."
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
                print(f"[STT Chunk Error] {e}")
                return {"text": ""}
                
        if transcription is None:
            if last_error:
                raise last_error
            raise HTTPException(status_code=503, detail="Transcription failed after exhausting all API keys.")

        valid_texts = []
        segments = getattr(transcription, 'segments', [])
        if segments:
            for seg in segments:
                # Handle both dict and object access safely based on SDK version
                no_speech_prob = seg.get('no_speech_prob', 0) if isinstance(seg, dict) else getattr(seg, 'no_speech_prob', 0)
                avg_logprob = seg.get('avg_logprob', 0) if isinstance(seg, dict) else getattr(seg, 'avg_logprob', 0)
                compression_ratio = seg.get('compression_ratio', 0) if isinstance(seg, dict) else getattr(seg, 'compression_ratio', 0)
                seg_text = seg.get('text', '') if isinstance(seg, dict) else getattr(seg, 'text', '')
                
                # Filter thresholds are relaxed for non-English languages because:
                # - Regional scripts (Telugu, Hindi, etc.) naturally have lower avg_logprob
                # - Using English-tuned thresholds silently drops all valid segments
                # Relaxed thresholds so candidate speech is never silently discarded
                if no_speech_prob > 0.85 or compression_ratio > 3.0:
                    continue
                    
                valid_texts.append(seg_text.strip())
            # If every segment was filtered out, treat it as silence. Falling back
            # to raw text here reintroduces Whisper's common silence hallucinations.
            text = " ".join(valid_texts).strip()
        else:
            text = transcription.text.strip()

        # Only fix name for English – fix_name splits on spaces, which corrupts
        # native scripts (Telugu, Hindi, etc.) and injects the English name.
        if iso_lang == "en":
            text = fix_name(text, candidate_name)
        
        # Filter common Whisper hallucinations on silent/background noise
        hallucinations = [
            "thank you.", "thank you", "i am not spoken.", "am i not spoken?",
            "i am not.", "bye.", "okay.", "okay", "you", "thanks.", "thanks", "tsh.",
            "transcribe technical terms", "programming concepts", "software engineering",
            "i am the guitar"
        ]
        text_lower = text.lower()
        if text_lower in hallucinations or any(h in text_lower for h in ["transcribe technical terms", "programming concepts", "software engineering", "i am the guitar"]):
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
    link_id = str(candidate_session.get("link_id") or "")
    if link_id and text:
        try:
            from redis_manager import manager
            await manager.broadcast_to_link(link_id, {
                "type": "interview_transcript",
                "speaker": candidate_name,
                "text": text
            })
        except Exception as b_err:
            print(f"[WebSocket STT Broadcast Error] {b_err}")

    return {"text": text}
