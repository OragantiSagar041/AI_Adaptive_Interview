from fastapi import APIRouter, UploadFile, File, Form
import whisper, tempfile, os
from difflib import SequenceMatcher
import imageio_ffmpeg

# Add imageio_ffmpeg to PATH so whisper can find it automatically without system-level ffmpeg installation
os.environ["PATH"] += os.pathsep + os.path.dirname(imageio_ffmpeg.get_ffmpeg_exe())

router = APIRouter()
model = None

def get_model():
    global model
    if model is None:
        model = whisper.load_model("small")
    return model

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

    whisper_model = get_model()
    result = whisper_model.transcribe(
        path,
        language="en",
        task="transcribe",
        fp16=False,
        initial_prompt=(
            f"This is a job interview. "
            f"The candidate's name is {candidate_name}. "
            f"Proper nouns and technical terms may appear."
        )
    )

    os.remove(path)

    text = result["text"].strip()
    text = fix_name(text, candidate_name)

    return {"text": text}
