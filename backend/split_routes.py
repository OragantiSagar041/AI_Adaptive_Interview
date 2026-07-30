"""
split_routes.py — Splits app/routes.py into domain-specific route files.

Run from the backend/ directory:
    python split_routes.py

What it does:
1. Reads app/routes.py
2. Copies lines 1-563 into app/routes_core.py (shared helpers, auth deps, models)
3. Copies line ranges for each domain into app/routes/<domain>.py
4. Keeps the original routes.py intact as routes_legacy.py (backup)
5. Creates a new thin app/routes.py that re-exports everything via a combined router
6. Updates app/main.py to import from the split files
"""

import os
import shutil
import re

SRC = os.path.join("app", "routes.py")
LEGACY = os.path.join("app", "routes_legacy.py")
ROUTES_DIR = os.path.join("app", "routes_split")

# ── Read source ────────────────────────────────────────────────────────────────
with open(SRC, encoding="utf-8") as f:
    lines = f.readlines()

total = len(lines)
print(f"[OK] Read {total} lines from {SRC}")

# ── Backup ──────────────────────────────────────────────────────────────────────
shutil.copy2(SRC, LEGACY)
print(f"[OK] Backup saved to {LEGACY}")

# ── Create output directory ─────────────────────────────────────────────────────
os.makedirs(ROUTES_DIR, exist_ok=True)
open(os.path.join(ROUTES_DIR, "__init__.py"), "w").close()
print(f"[OK] Created {ROUTES_DIR}/")

# ── Helper: write a slice of lines to a file ────────────────────────────────────
def write_slice(path: str, header: str, start: int, end: int, extra_header: str = ""):
    """Write lines[start-1:end] (1-indexed) to path, prepending header."""
    content = header + extra_header + "".join(lines[start - 1 : end])
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    line_count = end - start + 1
    print(f"[OK] {path}  ({line_count} lines, src:{start}-{end})")

# ── Common imports header that every split file needs ───────────────────────────
# Each file imports the shared helpers from routes_core.py

CORE_IMPORT = '''# ---------------------------------------------------------------------------
# Shared helpers — imported from routes_core (the original routes.py skeleton)
# ---------------------------------------------------------------------------
from app.routes_core import (
    router as _base,   # unused — each file defines its own router
    # auth / session helpers
    get_current_admin, get_current_admin_details, require_master_user,
    # candidate monitoring helpers
    _create_candidate_monitoring_token, _validate_candidate_monitoring_token,
    _require_candidate_session, _require_admin_session_access,
    _get_authorized_live_session, _get_authorized_creator_ids,
    _decode_dashboard_websocket_admin,
    # utility helpers
    sync_session_status, get_or_create_candidate,
    load_interview_from_db, get_interview_or_404,
    get_answer_history, build_answer_summary,
    persist_coding_round, build_coding_test_payload,
    process_temp_cloudinary_upload, broadcast_profile_update,
    startup_event_cloudinary,
    # commonly used names from models / database / config (star-imported in core)
)

'''

# ── Domain definitions ─────────────────────────────────────────────────────────
# Each tuple: (filename, description, src_start, src_end)
# We use 0 for end to mean "to EOF"
DOMAINS = [
    # filename,           description,                           start,  end
    ("interview",        "Interview session, questions, coding", 565,    2051),
    ("admin_dashboard",  "Admin dashboard, stats, copilot",      2052,   4009),
    ("candidates",       "Resume, sessions, violations",         4010,   6464),
    ("session_complete", "Feedback, complete-session, live",     6465,   7107),
    ("master",           "Master login, companies, tenants",     7108,   7321),
    ("notifications",    "Notifications CRUD",                   7322,   7505),
    ("auth",             "Admin login, register, Firebase, OTP", 7506,   7820),
    ("payments",         "Razorpay, Stripe, plans",              7821,   8681),
    ("master_admins",    "Master admins management",             8682,   9009),
    ("credits",          "Credit requests",                      9010,   9166),
    ("ws_dashboard",     "WebSocket dashboard + admin dash",     9167,   9591),
    ("superadmin",       "SuperAdmin routes",                    9592,  10359),
    ("voice_tts",        "Voices, TTS, STT, voice-clone",       10360,  10705),
    ("ai_calls",         "AI calling agent routes",             10706,  11646),
    ("coding_chat",      "Coding round chat",                   11647,  11879),
    ("jobs",             "Jobs and applications",               11880,  12228),
    ("demo",             "Demo requests",                       12229,  12319),
    ("notes_superadmin2","Notes + superadmin extra routes",     12320,  12908),
]

# ── Minimal header for each split file ─────────────────────────────────────────
BASE_IMPORTS = """\
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
from ai_client import chat_completion, extract_json, current_session_id
from analyze_answer import analyze_answer
from coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from redis_manager import manager
import transcription
from mongo_db import client as mongo_client
from app.services import *
from app.services import parse_iso_datetime
from app.session_store import get_session, set_session, delete_session as delete_cached_session
from app.models import *
from app.database import *
from app.config import *
from app import omni_dimension_client
from app.live_monitoring_security import (
    MONITORING_SCOPE, admin_can_access_session,
    create_monitoring_token, decode_monitoring_token,
    validate_snapshot_dataurl,
)
from app.candidate_auth import require_active_candidate
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from interview_graphs import run_followup_graph

# Re-import shared helpers from routes_core
from app.routes_core import (
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

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

"""

# ── Write each domain file ──────────────────────────────────────────────────────
for fname, desc, start, end in DOMAINS:
    out_path = os.path.join(ROUTES_DIR, f"{fname}.py")
    header = f'"""\napp/routes_split/{fname}.py — {desc}\nAuto-split from routes.py lines {start}–{end}.\n"""\n\n'
    header += BASE_IMPORTS
    write_slice(out_path, header, start, end)

# ── Write routes_core.py (shared helpers, lines 1-564) ─────────────────────────
core_path = os.path.join("app", "routes_core.py")
core_header = '''\
"""
app/routes_core.py — Shared helpers, auth dependencies, and utility functions.
All split route files import from here. This was originally the top of routes.py.

DO NOT add route handlers here. Only shared code belongs here.
"""
'''
write_slice(core_path, core_header, 1, 564)

# ── Write new thin app/routes.py that re-exports everything ────────────────────
NEW_ROUTES = '''\
"""
app/routes.py — Compatibility shim.

This file re-exports all routers from the split domain files so that
app/main.py continues to work with `from app.routes import router`.

The original monolithic routes.py has been split into:
  app/routes_split/<domain>.py

The backup of the original is: app/routes_legacy.py
"""
from fastapi import APIRouter

# Import and merge all domain routers into a single combined router
from app.routes_split.interview        import router as interview_router
from app.routes_split.admin_dashboard  import router as admin_dashboard_router
from app.routes_split.candidates       import router as candidates_router
from app.routes_split.session_complete import router as session_complete_router
from app.routes_split.master           import router as master_router
from app.routes_split.notifications    import router as notifications_router
from app.routes_split.auth             import router as auth_router
from app.routes_split.payments         import router as payments_router
from app.routes_split.master_admins    import router as master_admins_router
from app.routes_split.credits          import router as credits_router
from app.routes_split.ws_dashboard     import router as ws_dashboard_router
from app.routes_split.superadmin       import router as superadmin_router
from app.routes_split.voice_tts        import router as voice_tts_router
from app.routes_split.ai_calls         import router as ai_calls_router
from app.routes_split.coding_chat      import router as coding_chat_router
from app.routes_split.jobs             import router as jobs_router
from app.routes_split.demo             import router as demo_router
from app.routes_split.notes_superadmin2 import router as notes_superadmin2_router

# Re-export startup hooks so main.py can still call them
from app.routes_core import startup_event_cloudinary, startup_event_db_and_email

# Also re-export auth helpers so routes_subscription.py can still import them
from app.routes_core import (
    get_current_admin,
    get_current_admin_details,
    require_master_user,
    get_razorpay_credentials,
)

# Combined router — main.py does: app.include_router(router)
router = APIRouter()
router.include_router(interview_router)
router.include_router(admin_dashboard_router)
router.include_router(candidates_router)
router.include_router(session_complete_router)
router.include_router(master_router)
router.include_router(notifications_router)
router.include_router(auth_router)
router.include_router(payments_router)
router.include_router(master_admins_router)
router.include_router(credits_router)
router.include_router(ws_dashboard_router)
router.include_router(superadmin_router)
router.include_router(voice_tts_router)
router.include_router(ai_calls_router)
router.include_router(coding_chat_router)
router.include_router(jobs_router)
router.include_router(demo_router)
router.include_router(notes_superadmin2_router)
'''

with open(SRC, "w", encoding="utf-8") as f:
    f.write(NEW_ROUTES)
print(f"[OK] Wrote new thin app/routes.py (shim)")

print("\n[OK] Split complete! Files created:")
for fname, _, start, end in DOMAINS:
    size = end - start + 1
    print(f"    app/routes_split/{fname}.py  ({size} lines)")
print(f"    app/routes_core.py  (564 lines, shared helpers)")
print(f"    app/routes_legacy.py  ({total} lines, original backup)")
print("\nNext: run `python -c \"from app.routes import router\"` to verify imports.")
