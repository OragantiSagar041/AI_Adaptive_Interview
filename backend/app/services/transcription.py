import os
import re
import asyncio
import tempfile
import subprocess
import shutil
from typing import Optional
from difflib import SequenceMatcher
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from groq import Groq, RateLimitError
from app.services.candidate_auth import require_active_candidate
from app.ai.groq_manager import groq_key_manager

router = APIRouter()

# ---------------------------------------------------------------------------
# Audio preprocessing: convert to 16kHz mono WAV, normalize, trim silence
# ---------------------------------------------------------------------------
def preprocess_audio(input_path: str, output_path: str) -> bool:
    """
    Uses ffmpeg to:
      1. Resample to 16kHz (Whisper's native sample rate)
      2. Convert to mono
      3. Apply high-pass filter (remove low-freq rumble)
      4. Normalize loudness
      5. Trim leading/trailing silence (< -35dB for 0.3s)
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False

    cmd = [
        ffmpeg,
        "-y",
        "-i", input_path,
        "-ar", "16000",
        "-ac", "1",
        # Only safe spectral filters — no silenceremove (cuts first/last word) and no loudnorm (distorts fast speech).
        # WebRTC autoGainControl + noiseSuppression already handles gain and silence in the browser.
        "-af", "highpass=f=80,lowpass=f=7500",
        "-c:a", "pcm_s16le",
        output_path,
    ]
    try:
        result = subprocess.run(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30
        )
        return result.returncode == 0 and os.path.exists(output_path) and os.path.getsize(output_path) > 4096
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Hallucination / garbage filters
# ---------------------------------------------------------------------------
HALLUCINATION_PATTERNS = re.compile(
    r"^\s*(thank\s*you|thanks|bye|okay|ok|you|tsh|tch|shh|hmm|uh|um|mm|"
    r"i\s*am\s*not\s*spoken|am\s*i\s*not\s*spoken|i\s*am\s*not|"
    r"go\s*to\s*(the\s*)?next\s*slide|thank\s*you\s*for\s*watching|"
    r"subscribe|like\s*and\s*subscribe|comment\s*below|"
    r"\.\.\.|…)\s*[.,!?]*\s*$",
    re.IGNORECASE,
)

REPETITION_PATTERN = re.compile(r"(\b\w+\b)(\s+\1){3,}", re.IGNORECASE)  # word repeated 4+ times


def is_likely_hallucination(text: str, segments: list) -> bool:
    """Multi-signal hallucination detector."""
    if not text or len(text.strip()) < 2:
        return True

    t = text.strip()

    # 1. Hardcoded phrase list
    if HALLUCINATION_PATTERNS.match(t):
        return True

    # 2. Excessive repetition (Whisper loops)
    if REPETITION_PATTERN.search(t):
        return True

    # 3. Segment-level confidence checks
    if segments:
        total_chars = 0
        weighted_logprob = 0.0
        for seg in segments:
            no_speech = seg.get("no_speech_prob", 0) if isinstance(seg, dict) else getattr(seg, "no_speech_prob", 0)
            avg_logprob = seg.get("avg_logprob", 0) if isinstance(seg, dict) else getattr(seg, "avg_logprob", 0)
            seg_text = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")
            seg_len = len(seg_text.strip())

            # If any segment is mostly silence, flag it
            if no_speech > 0.65 and seg_len < 10:
                return True

            if seg_len:
                total_chars += seg_len
                weighted_logprob += avg_logprob * seg_len

        # Global low confidence
        if total_chars > 0 and (weighted_logprob / total_chars) < -1.2:
            # Unless it's long and looks like real words
            if total_chars < 30:
                return True

    # 4. Compression ratio check (repetition loops)
    if len(t) > 20:
        unique_chars = len(set(t.lower()))
        if unique_chars < 6:  # e.g., "tsh tsh tsh tsh"
            return True

    return False


def clean_whisper_text(text: str) -> str:
    """Post-process raw Whisper output."""
    if not text:
        return ""

    # Remove non-lexical fillers aggressively
    text = re.sub(r"\b(tsh|tch|shh|hmm+|uh+|um+|mm+|ah+|eh+|oh+)\b[.,]?", "", text, flags=re.IGNORECASE)
    # Remove standalone repeated punctuation
    text = re.sub(r"\s*([.,!?]){2,}\s*", r"\1 ", text)
    # Fix spacing
    text = re.sub(r"\s+", " ", text).strip()
    return text


# ---------------------------------------------------------------------------
# Prompt builder: SHORT style-prefix, not an essay
# ---------------------------------------------------------------------------
def build_prompt(candidate_name: str, known_terms: Optional[str], iso_lang: str) -> str:
    """
    Whisper prompt works best as a short example of the *style* of speech expected.
    Keep it under ~100 tokens. Do NOT write instructions.
    """
    if iso_lang != "en":
        # Native language prompts stay minimal
        native = {
            "te": "నమస్కారం, నేను ఇంటర్వ్యూ ఇస్తున్నాను.",
            "hi": "नमस्ते, मैं साक्षात्कार दे रहा हूँ।",
            "ta": "வணக்கம், நான் நேர்காணலில் பங்கேற்கிறேன்.",
            "ml": "നമസ്കാരം, ഞാൻ അഭിമുഖത്തിൽ പങ്കെടുക്കുന്നു.",
            "kn": "ನಮಸ್ಕಾರ, ನಾನು ಸಂದರ್ಶನದಲ್ಲಿದ್ದೇನೆ.",
        }
        return native.get(iso_lang, "")

    # English: short context phrase with Indian English style + tech terms
    terms_hint = ""
    if known_terms:
        clean = [t.strip() for t in known_terms.split(",") if t.strip()]
        if clean:
            terms_hint = " " + ", ".join(clean[:8])  # cap to avoid long prompt

    # This is an *example* of the speech style, not an instruction:
    prompt = (
        f"Hi, I'm {candidate_name}. I have experience in React, Node.js, Python, and AWS. "
        f"We built microservices with PostgreSQL and Redis.{terms_hint}"
    )
    # Hard cap prompt length (Whisper prefers < 224 tokens)
    return prompt[:220]


# ---------------------------------------------------------------------------
# Name fixer (isolated fuzzy matcher)
# ---------------------------------------------------------------------------
def _similarity(a, b):
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()

def _fix_candidate_name(text: str, candidate_name: str) -> str:
    if not text or not candidate_name or candidate_name.lower() in {"candidate", "user", "unknown"}:
        return text

    clean_name = candidate_name.strip()
    name_parts = [p for p in clean_name.split() if len(p) >= 2]
    if not name_parts:
        return text

    words = text.split()
    n_words = len(words)
    k = len(name_parts)

    i = 0
    while i <= n_words - k:
        window = " ".join(words[i:i+k])
        if _similarity(window, clean_name) >= 0.75:
            words[i:i+k] = [clean_name]
            n_words = len(words)
            i += 1
            continue
        i += 1

    for p in name_parts:
        for idx, w in enumerate(words):
            stripped = "".join(c for c in w if c.isalnum())
            if len(stripped) >= 3 and _similarity(stripped, p) >= 0.80:
                prefix = w[:len(w) - len(w.lstrip(".,!?;:\"'"))]
                suffix = w[len(w.rstrip(".,!?;:\"'")):]
                words[idx] = f"{prefix}{p}{suffix}"

    return " ".join(words)


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    candidate_name: str = Form(...),
    language: str = Form("English"),
    known_terms: Optional[str] = Form(None),
    fallback_text: Optional[str] = Form(None),  # Web Speech API fallback from frontend
    candidate_session: dict = Depends(require_active_candidate),
):
    candidate_name = candidate_name.strip()[:200] or "Candidate"
    allowed = {"Hindi", "Telugu", "Tamil", "Malayalam", "Kannada", "English"}
    if language not in allowed:
        raise HTTPException(status_code=422, detail="Unsupported interview language")

    data = await audio.read(25 * 1024 * 1024 + 1)
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio upload exceeds 25 MB")

    # Reject tiny audio blobs (headers only, no speech)
    if len(data) < 3000:
        return {"text": fallback_text or ""}

    ext = "webm"
    if audio.filename and "." in audio.filename:
        ext = audio.filename.rsplit(".", 1)[-1].lower()
    if ext not in ("webm", "ogg", "mp4", "wav", "m4a", "mp3"):
        ext = "webm"

    # -----------------------------------------------------------------------
    # Save raw file
    # -----------------------------------------------------------------------
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as f:
        f.write(data)
        raw_path = f.name

    # -----------------------------------------------------------------------
    # Preprocess to 16kHz WAV
    # -----------------------------------------------------------------------
    processed_path = raw_path + "_16k.wav"
    preprocessed = preprocess_audio(raw_path, processed_path)
    path_to_send = processed_path if preprocessed else raw_path

    try:
        lang_map = {
            "Hindi": "hi", "Telugu": "te", "Tamil": "ta",
            "Malayalam": "ml", "Kannada": "kn", "English": "en",
        }
        iso_lang = lang_map.get(language, "en")

        sys_prompt = build_prompt(candidate_name, known_terms, iso_lang)

        max_attempts = groq_key_manager.get_total_keys() or 1
        transcription = None
        last_error = None

        # Try full model first, fallback to turbo
        models = ["whisper-large-v3", "whisper-large-v3-turbo"]

        for _ in range(max_attempts):
            api_key = groq_key_manager.get_next_key()
            if not api_key:
                raise HTTPException(status_code=503, detail="Voice transcription temporarily unavailable.")

            client = Groq(api_key=api_key)

            for model in models:
                def call_api():
                    with open(path_to_send, "rb") as f:
                        return client.audio.transcriptions.create(
                            file=(os.path.basename(path_to_send), f.read()),
                            model=model,
                            language=iso_lang,
                            prompt=sys_prompt,
                            response_format="verbose_json",
                            temperature=0.0,
                        )

                try:
                    transcription = await asyncio.to_thread(call_api)
                    break  # success
                except RateLimitError as e:
                    last_error = e
                    continue
                except Exception as e:
                    # If full model fails (e.g., not available), try next model
                    if model == models[-1]:
                        raise
                    continue
            if transcription:
                break

        if transcription is None:
            if last_error:
                raise last_error
            raise HTTPException(status_code=503, detail="Transcription failed.")

        # -------------------------------------------------------------------
        # Parse & filter segments
        # -------------------------------------------------------------------
        segments = getattr(transcription, "segments", []) or []
        raw_text = str(getattr(transcription, "text", "") or "").strip()

        valid_texts = []
        for seg in segments:
            no_speech = seg.get("no_speech_prob", 0) if isinstance(seg, dict) else getattr(seg, "no_speech_prob", 0)
            avg_logprob = seg.get("avg_logprob", 0) if isinstance(seg, dict) else getattr(seg, "avg_logprob", 0)
            compression = seg.get("compression_ratio", 0) if isinstance(seg, dict) else getattr(seg, "compression_ratio", 0)
            seg_text = seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")

            # Drop definite garbage
            if no_speech > 0.7:
                continue
            if compression > 2.5:
                continue
            if avg_logprob < -1.5 and no_speech > 0.4:
                continue

            valid_texts.append(seg_text.strip())

        text = " ".join(valid_texts).strip()
        if not text and raw_text:
            text = raw_text

        text = clean_whisper_text(text)

        # Final hallucination gate
        if is_likely_hallucination(text, segments):
            text = ""

        # If Whisper produced nothing usable, use browser's Web Speech API text
        if not text and fallback_text:
            text = fallback_text.strip()

        # Name fix only for English (avoid corrupting native scripts)
        if iso_lang == "en" and text:
            text = _fix_candidate_name(text, candidate_name)

    except HTTPException:
        raise
    except Exception as exc:
        # If backend fails entirely, fallback to browser STT so user isn't stuck
        if fallback_text:
            return {"text": fallback_text.strip()}
        raise HTTPException(status_code=503, detail="Voice transcription failed. Please retry.")
    finally:
        try:
            os.remove(raw_path)
        except Exception:
            pass
        if preprocessed:
            try:
                os.remove(processed_path)
            except Exception:
                pass

    return {"text": text}
