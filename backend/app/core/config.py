import os
import sys
import traceback
from collections import defaultdict
from datetime import timedelta, timezone

# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
import cloudinary
import cloudinary.uploader
import cloudinary.api
from groq import AsyncGroq
from fastapi.security import HTTPBearer

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

load_dotenv(override=False)

# ---------------------------------------------------------------------------
# Third-party client setup
# ---------------------------------------------------------------------------

# groq_client is removed to support dynamic key rotation via groq_manager

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://user:password@localhost:5432/hireiq")


def get_omni_dimension_api_key() -> str:
    load_dotenv(override=True)
    return (os.getenv("OMNI_DIMENSION_API_KEY") or "").strip()


def get_omni_voice_id() -> str:
    load_dotenv(override=True)
    return (os.getenv("OMNI_DIMENSION_VOICE_ID") or "").strip()


def get_omni_agent_id() -> str:
    load_dotenv(override=True)
    return (os.getenv("OMNI_DIMENSION_AGENT_ID") or "").strip()

# ---------------------------------------------------------------------------
# Global feature flags / mutable state
# ---------------------------------------------------------------------------

CLOUDINARY_CLEANUP_STARTED = False
RECORDING_RETENTION_DAYS = max(3, int(os.getenv("RECORDING_RETENTION_DAYS", "3")))

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

_ENV = os.getenv("ENV", "local").lower()
_DEFAULT_FRONTEND = "https://hireiq.co.in" if _ENV == "production" else "http://localhost:5173"
FRONTEND_URL = os.getenv("FRONTEND_URL", _DEFAULT_FRONTEND).rstrip("/")

# ---------------------------------------------------------------------------
# Plan definitions
# ---------------------------------------------------------------------------

PLAN_DEFINITIONS = {
    "trial": {
        "label": "Free Trial",
        "credits_granted": 10,
        "price": 0,
        "summary": "Core single-interview setup for evaluating the platform before rollout.",
        "features": [
            "Dashboard",
            "Interviews",
            "Create Interview",
            "Jobs",
            "Settings"
        ],
        "capabilities": {
            "single_interview": True,
            "bulk_interviews": False,
            "resume_parsing": True,
            "export_sessions": False,
            "live_monitoring": False,
            "deactivated_candidates": False,
            "detailed_analytics": False,
        },
    },
    "basic": {
        "label": "Basic",
        "credits_granted": 250,
        "price": 2500,
        "summary": "Adds richer review and control workflows for growing hiring teams.",
        "features": [
            "Dashboard",
            "Interviews",
            "Qualified Candidates",
            "Rejected Candidates",
            "Create Interview",
            "Jobs",
            "Settings"
        ],
        "capabilities": {
            "single_interview": True,
            "bulk_interviews": False,
            "resume_parsing": True,
            "export_sessions": True,
            "live_monitoring": False,
            "deactivated_candidates": True,
            "detailed_analytics": True,
        },
    },
    "advance": {
        "label": "Advance",
        "credits_granted": 400,
        "price": 3999,
        "summary": "Unlocks the full hiring workflow including bulk send and live monitoring.",
        "features": [
            "Super Admin Dashboard",
            "Dashboard",
            "Interviews",
            "Qualified Candidates",
            "Export CSV",
            "Rejected Candidates",
            "Talent Pool Management",
            "Create Interview",
            "Single Candidate",
            "Bulk Send",
            "Select Candidate from AI Calls",
            "Resume Parsing",
            "ATS Score",
            "Email Preview",
            "Custom Screening Questions",
            "Custom AI Interviewer Instructions",
            "Language",
            "Industry Type",
            "Interview Schedule",
            "Record Interview Video",
            "Voice Cloning",
            "HR Screening Questions",
            "Standard (Text/Form Based)",
            "Voice AI (Real-time Speech)",
            "Technical (+ Coding)",
            "Normal (Standard AI)",
            "Non-Tech (Case Studies)",
            "AI Calling Agent",
            "Conversational Flow",
            "Jobs",
            "Recruiters",
            "Credit Management",
            "Subscription Management",
            "Integrations",
            "Security",
            "Active Security Alerts",
            "Settings"
        ],
        "capabilities": {
            "single_interview": True,
            "bulk_interviews": True,
            "resume_parsing": True,
            "export_sessions": True,
            "live_monitoring": True,
            "deactivated_candidates": True,
            "detailed_analytics": True,
        },
    },
    "owner": {
        "label": "Owner",
        "credits_granted": 1000000,
        "price": 0,
        "summary": "Internal owner access.",
        "features": [
            "Super Admin Dashboard",
            "Dashboard",
            "Interviews",
            "Qualified Candidates",
            "Rejected Candidates",
            "Create Interview",
            "AI Calling Agent",
            "Conversational Flow",
            "Jobs",
            "Recruiters",
            "Credit Management",
            "Subscription Management",
            "Integrations",
            "Security",
            "Settings"
        ],
        "capabilities": {
            "single_interview": True,
            "bulk_interviews": True,
            "resume_parsing": True,
            "export_sessions": True,
            "live_monitoring": True,
            "deactivated_candidates": True,
            "detailed_analytics": True,
        },
    },
}

PLAN_ALIASES = {
    "free trial": "trial",
    "trial": "trial",
    "basic": "basic",
    "advance": "advance",
    "advanced": "advance",
    "owner": "owner",
    "master": "owner",
}

# ---------------------------------------------------------------------------
# Runtime state
# ---------------------------------------------------------------------------

LAST_422_ERROR = None

request_counts = defaultdict(list)
RATE_LIMIT = 120  # general requests per minute per IP
EXPENSIVE_RATE_LIMIT = 20
PUBLIC_RESUME_RATE_LIMIT = 5
RATE_LIMIT_WINDOW = 60
EXPENSIVE_RATE_LIMIT_PATHS = {
    "/chat",
    "/stt",
    "/tts",
    "/transcribe",
    "/voice-clone-instant",
    "/start-interview",
    "/generate-next-question",
    "/generate-more-questions",
    "/coding-round/start",
    "/coding-round/chat",
    "/case-study/start",
    "/admin/ats-score",
}
RATE_LIMIT_EXEMPT_PATHS = {
    "/",
    "/health",
    "/live-heartbeat",
}
RATE_LIMIT_EXEMPT_PREFIXES = (
    "/superadmin/profile",
    "/api/notifications",
)

# ---------------------------------------------------------------------------
# JWT / auth
# ---------------------------------------------------------------------------

import hashlib as _hashlib

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise ValueError("FATAL ERROR: JWT_SECRET_KEY environment variable is not set. Refusing to start.")

# If the key is shorter than 32 bytes, derive a proper 32-byte key via SHA-256
# so the app doesn't crash and no InsecureKeyLengthWarning is raised.
_raw_key_bytes = JWT_SECRET_KEY.encode("utf-8")
if len(_raw_key_bytes) < 32:
    if os.getenv("ENV", "local").lower() == "production":
        raise ValueError("FATAL ERROR: JWT_SECRET_KEY must contain at least 32 bytes in production.")
    import warnings as _warnings
    _warnings.warn(
        f"JWT_SECRET_KEY is only {len(_raw_key_bytes)} bytes — deriving a 32-byte key via SHA-256. "
        "Set a 64-char key in your environment for production.",
        stacklevel=1,
    )
    JWT_SECRET_KEY = _hashlib.sha256(_raw_key_bytes).hexdigest()  # 64 hex chars = 32 bytes

ALGORITHM = "HS256"

security = HTTPBearer()

# ---------------------------------------------------------------------------
# Misc flags
# ---------------------------------------------------------------------------

EMAIL_SCHEDULER_STARTED = False
JOB_DESCRIPTION_PDF_THRESHOLD = 900

# ---------------------------------------------------------------------------
# Firebase Admin SDK initialization
# ---------------------------------------------------------------------------
import json as _json
import logging as _logging
import firebase_admin
from firebase_admin import credentials

_fb_logger = _logging.getLogger(__name__)

def init_firebase_admin():
    """
    Initialize Firebase Admin SDK once.
    Supports:
    1. Raw JSON string in FIREBASE_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS (e.g. from AWS Secrets Manager / ECS)
    2. File path in GOOGLE_APPLICATION_CREDENTIALS or local firebase_credentials.json
    3. Default Google Application Credentials fallback
    """
    if firebase_admin._apps:
        return firebase_admin.get_app()

    raw_env_val = os.environ.get("FIREBASE_CREDENTIALS_JSON") or os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or ""
    raw_env_val_stripped = raw_env_val.strip()

    # Case 1: Environment variable contains raw JSON string (AWS Secrets Manager)
    if raw_env_val_stripped.startswith("{") and raw_env_val_stripped.endswith("}"):
        try:
            cred_dict = _json.loads(raw_env_val_stripped)
            cred = credentials.Certificate(cred_dict)
            app = firebase_admin.initialize_app(cred)
            _fb_logger.info("Firebase Admin SDK initialized successfully from JSON environment variable.")
            return app
        except Exception as e:
            _fb_logger.error(f"Failed to initialize Firebase Admin SDK from JSON string: {e}")

    # Case 2: File path (e.g. /app/firebase_credentials.json or relative)
    google_creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") or "firebase_credentials.json"
    if google_creds_path and not google_creds_path.strip().startswith("{"):
        candidate_paths = [
            google_creds_path if os.path.isabs(google_creds_path) else os.path.abspath(google_creds_path),
            os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), google_creds_path),
            os.path.join(os.getcwd(), google_creds_path),
            os.path.join("/app", os.path.basename(google_creds_path)),
        ]
        for path in candidate_paths:
            if os.path.exists(path):
                try:
                    cred = credentials.Certificate(path)
                    app = firebase_admin.initialize_app(cred)
                    _fb_logger.info(f"Firebase Admin SDK initialized successfully from file: {path}")
                    return app
                except Exception as e:
                    _fb_logger.error(f"Failed to initialize Firebase Admin SDK from file {path}: {e}")
                    break

    # Case 3: Default application credentials fallback
    try:
        app = firebase_admin.initialize_app()
        _fb_logger.info("Firebase Admin SDK initialized with default application credentials.")
        return app
    except Exception as e:
        _fb_logger.warning(f"Could not initialize Firebase Admin SDK with default credentials: {e}")
        return None

