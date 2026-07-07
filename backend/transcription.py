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
        
        if iso_lang == "en":
            sys_prompt = f"The speaker has an Indian English accent. This is a highly technical software engineering job interview. The candidate's name is {candidate_name}. Transcribe technical terms, acronyms, and programming concepts accurately."
        else:
            sys_prompt = f"This is a job interview. The candidate's name is {candidate_name}. Proper nouns and technical terms may appear."

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
                
                # Filter out segments that are likely just noise/hallucinations
                # - High no_speech_prob means it's likely background noise
                # - Low avg_logprob means the model is wildly guessing
                # - High compression_ratio (> 2.4) means the model is stuck in a repetitive hallucination loop (e.g. "Tons of, Tons of, Tons of")
                if no_speech_prob > 0.45 or avg_logprob < -1.0 or compression_ratio > 2.4:
                    continue
                    
                valid_texts.append(seg_text.strip())
            text = " ".join(valid_texts).strip()
        else:
            text = transcription.text.strip()

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
