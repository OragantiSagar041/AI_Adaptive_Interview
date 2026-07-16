import os
import tempfile
from functools import lru_cache
from difflib import SequenceMatcher
from fastapi import APIRouter, UploadFile, File, Form
from groq import Groq

router = APIRouter()

# Module-level cached Groq client — created once on first use.
# Avoids the overhead of re-authenticating + setting up an HTTP session
# inside every /transcribe request.
@lru_cache(maxsize=1)
def _get_groq_client() -> Groq:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not found in environment.")
    return Groq(api_key=api_key)

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
    language: str = Form("English")
):
    data = await audio.read()

    # Use the original filename extension so Groq gets correct format
    original_filename = audio.filename or 'audio.webm'
    ext = original_filename.rsplit('.', 1)[-1].lower() if '.' in original_filename else 'webm'
    if ext not in ('webm', 'ogg', 'mp4', 'wav', 'm4a', 'mp3'):
        ext = 'webm'

    # Reject tiny audio blobs — they're almost always silence or background noise
    # and are the #1 cause of Whisper hallucination. A valid utterance in any language
    # takes at least ~0.8 seconds which at typical webm bitrates is > 10 KB.
    MIN_AUDIO_BYTES = 12000
    if len(data) < MIN_AUDIO_BYTES:
        return {"text": ""}

    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as f:
        f.write(data)
        path = f.name

    try:
        # Use the cached Groq singleton instead of creating a new client per request.
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            return {"error": "GROQ_API_KEY not found in environment."}

        client = _get_groq_client()
        
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
        # - English: English sentence to prime accent and vocabulary.
        # - Regional languages: A short native-script sentence.
        #   CRITICAL: The prompt MUST be in the target script. An English prompt
        #   forces Whisper to translate or hallucinate in English.
        native_prompts = {
            "te": "నమస్కారం. నేను ఒక ఇంటర్వ్యూ ఇస్తున్నాను.",
            "hi": "नमस्ते। मैं एक साक्षात्कार दे रहा हूँ।",
            "ta": "வணக்கம். நான் ஒரு நேர்காணலில் பங்கேற்கிறேன்.",
            "ml": "നമസ്കാരം. ഞാൻ ഒരു അഭിമുഖത്തിൽ പങ്കെടുക്കുകയാണ്.",
            "kn": "ನಮಸ್ಕಾರ. ನಾನು ಒಂದು ಸಂದರ್ಶನದಲ್ಲಿ ಭಾಗವಹಿಸುತ್ತಿದ್ದೇನೆ.",
        }
        if iso_lang == "en":
            sys_prompt = f"The speaker has an Indian English accent. This is a highly technical software engineering job interview. The candidate's name is {candidate_name}. Transcribe technical terms, acronyms, and programming concepts accurately."
        else:
            sys_prompt = native_prompts.get(iso_lang, "")

        with open(path, "rb") as file:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(path), file.read()),
                model="whisper-large-v3-turbo",
                language=iso_lang,
                prompt=sys_prompt,
                response_format="verbose_json",
                temperature=0.0
            )

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
                if iso_lang == "en":
                    if no_speech_prob > 0.45 or avg_logprob < -1.0 or compression_ratio > 2.4:
                        continue
                else:
                    # For regional languages: only discard definite silence or
                    # severe repetition loops. avg_logprob is intentionally NOT
                    # checked here — it's naturally lower for regional scripts.
                    if no_speech_prob > 0.75 or compression_ratio > 2.4:
                        continue
                    
                valid_texts.append(seg_text.strip())
            # Fallback: if every segment was filtered out, use the raw transcription text
            # This prevents silent failures where the user spoke but nothing is returned.
            text = " ".join(valid_texts).strip() or transcription.text.strip()
        else:
            text = transcription.text.strip()

        # Only fix name for English – fix_name splits on spaces, which corrupts
        # native scripts (Telugu, Hindi, etc.) and injects the English name.
        if iso_lang == "en":
            text = fix_name(text, candidate_name)
        
        # Filter common Whisper hallucinations on silent/background noise
        hallucinations = [
            "thank you.", "thank you", "i am not spoken.", "am i not spoken?",
            "i am not.", "bye.", "okay.", "okay", "you", "thanks.", "thanks", "tsh."
        ]
        if text.lower() in hallucinations:
            text = ""

        import re
        # Aggressively filter out non-lexical sounds and Whisper static interpretations
        text = re.sub(r'\b(tsh|tch|shh|hmm|uh|um|mm)\b[.,]?', '', text, flags=re.IGNORECASE)
        # Remove repeated non-lexical artifacts like "Tsh, Tsh, Tsh"
        text = re.sub(r'(?i)\b(tsh|tch)[\s,]+', '', text)
        text = re.sub(r'\s+', ' ', text).strip()
            
    except Exception as e:
        text = f"Transcription failed: {str(e)}"
    finally:
        os.remove(path)

    return {"text": text}
