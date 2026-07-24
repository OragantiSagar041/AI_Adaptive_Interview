import os
import sys
import traceback
from collections import defaultdict
from datetime import timedelta, timezone

from dotenv import load_dotenv
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
    load_dotenv(override=False)
    return (os.getenv("OMNI_DIMENSION_API_KEY") or "").strip()


def get_omni_voice_id() -> str:
    load_dotenv(override=False)
    return (os.getenv("OMNI_DIMENSION_VOICE_ID") or "").strip()


def get_omni_agent_id() -> str:
    load_dotenv(override=False)
    return (os.getenv("OMNI_DIMENSION_AGENT_ID") or "").strip()

# ---------------------------------------------------------------------------
# Global feature flags / mutable state
# ---------------------------------------------------------------------------

CLOUDINARY_CLEANUP_STARTED = False
RECORDING_RETENTION_DAYS = max(3, int(os.getenv("RECORDING_RETENTION_DAYS", "3")))

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

FRONTEND_URL = "https://www.hireiq.co.in"

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
            "Admin Dashboard",
            "Single Interview Creation",
            "Resume Parsing",
            "Email Invitation Sending",
            "Basic Analytics",
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
            "Everything in Free Trial",
            "Detailed Analytics",
            "Session Export",
            "Deactivated Candidate Control",
            "Email Notifications",
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
            "Everything in Basic",
            "Bulk Candidate Upload",
            "Live Monitoring",
            "Live Results Dashboard",
            "Priority Support",
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
            "All Features",
            "Master Dashboard",
            "Tenant Management",
            "Plan Management",
            "Billing Overview",
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
