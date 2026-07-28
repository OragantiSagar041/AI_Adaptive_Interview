"""
app/routes_split/demo.py — Demo requests
Auto-split from routes.py lines 12229–12319.
"""

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
from app.routes_models import *
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

@router.post('/demo-request')
def create_demo_request(req: DemoRequestCreate):
    try:
        new_request = {
            'first_name': req.first_name,
            'last_name': req.last_name,
            'work_email': req.work_email,
            'mobile_number': req.mobile_number,
            'company_name': req.company_name,
            'help_text': req.help_text,
            'status': 'NEW',
            'created_at': datetime.utcnow().isoformat()
        }
        result = demo_requests_collection.insert_one(new_request)

        # Send email notification to master
        brevo_key = os.getenv("BREVO_API_KEY")
        master_email = os.getenv("MASTER_EMAIL", os.getenv("BREVO_SENDER_EMAIL", "support@hireiq.com"))
        if brevo_key and master_email:
            try:
                import requests
                email_html = f"""
                <html><body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #4f46e5;">New Demo Request</h2>
                    <p><b>Name:</b> {req.first_name} {req.last_name}</p>
                    <p><b>Company:</b> {req.company_name}</p>
                    <p><b>Email:</b> {req.work_email}</p>
                    <p><b>Mobile:</b> {req.mobile_number}</p>
                    <p><b>Message:</b><br>{req.help_text}</p>
                </body></html>
                """
                requests.post("https://api.brevo.com/v3/smtp/email", json={
                    "sender": {"name": "Hire IQ Alerts", "email": master_email},
                    "to": [{"email": master_email, "name": "Hire IQ Admin"}],
                    "subject": f"New Demo Request from {req.company_name}",
                    "htmlContent": email_html
                }, headers={"api-key": brevo_key, "content-type": "application/json"}, timeout=5)
            except Exception as email_err:
                print(f'Error sending demo request email: {email_err}')

        return {'status': 'success', 'id': str(result.inserted_id)}
    except Exception as e:
        print(f'Error saving demo request: {e}')
        raise HTTPException(status_code=500, detail='Failed to submit demo request')

@router.get('/master/demo-requests')
def get_master_demo_requests(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Only master admin can view demo requests')
    
    try:
        requests_cursor = demo_requests_collection.find().sort('created_at', -1)
        requests = []
        for req in requests_cursor:
            req['id'] = str(req['_id'])
            del req['_id']
            requests.append(req)
        return {'status': 'success', 'data': requests}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put('/master/demo-requests/{request_id}')
def update_demo_request_status(request_id: str, req: DemoRequestUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Not authorized')
    try:
        result = demo_requests_collection.update_one(
            {'_id': ObjectId(request_id)},
            {'$set': {'status': req.status}}
        )
        if result.modified_count == 1:
            return {'status': 'success'}
        else:
            raise HTTPException(status_code=404, detail='Request not found')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete('/master/demo-requests/{request_id}')
def delete_demo_request(request_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Not authorized')
    try:
        result = demo_requests_collection.delete_one({'_id': ObjectId(request_id)})
        if result.deleted_count == 1:
            return {'status': 'success'}
        else:
            raise HTTPException(status_code=404, detail='Request not found')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


