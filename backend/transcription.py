import os
import tempfile
from difflib import SequenceMatcher
from fastapi import APIRouter, UploadFile, File, Form
from groq import Groq

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
    candidate_name: str = Form(...)
):
    data = await audio.read()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
        f.write(data)
        path = f.name

    try:
        # Get Groq API key from environment
        groq_api_key = os.environ.get("GROQ_API_KEY")
        if not groq_api_key:
            return {"error": "GROQ_API_KEY not found in environment."}

        client = Groq(api_key=groq_api_key)

        with open(path, "rb") as file:
            transcription = client.audio.transcriptions.create(
                file=(os.path.basename(path), file.read()),
                model="distil-whisper-large-v3-en",
                prompt=f"This is a job interview. The candidate's name is {candidate_name}. Proper nouns and technical terms may appear.",
                response_format="json",
                language="en"
            )

        text = transcription.text.strip()
        text = fix_name(text, candidate_name)
    except Exception as e:
        text = f"Transcription failed: {str(e)}"
    finally:
        os.remove(path)

    return {"text": text}
