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
# pyrefly: ignore [missing-import]
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
from app.ai.ai_client import chat_completion, extract_json, current_session_id
from app.ai.analyze_answer import analyze_answer
from app.data.coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from app.data.industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from app.db.redis_manager import manager
import app.services.transcription as transcription
from app.db.mongo_db import client as mongo_client
from app.services.services import *
from app.services.services import parse_iso_datetime
from app.core.session_store import get_session, set_session, delete_session as delete_cached_session
from app.schemas.models import *
from app.db.database import *
from app.core.config import *
from app.ai import omni_dimension_client
from app.services.live_monitoring_security import (
    MONITORING_SCOPE, admin_can_access_session,
    create_monitoring_token, decode_monitoring_token,
    validate_snapshot_dataurl,
)
from app.services.candidate_auth import require_active_candidate
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from app.data.interview_graphs import run_followup_graph

# Re-import shared helpers from routes_core
from app.schemas.routes_models import *
from app.core.routes_core import (
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

@router.post('/master/demo-requests/{request_id}/send-email')
def send_demo_request_email(
    request_id: str,
    payload: DemoRequestSendEmail,
    current_admin: dict = Depends(get_current_admin_details)
):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Only master admin can send emails to demo leads')
    
    recipient_email = (payload.recipient_email or '').strip()
    if not recipient_email:
        raise HTTPException(status_code=400, detail='Recipient email is required')
    
    subject = (payload.subject or 'HireIQ Platform Demo & Next Steps').strip()
    message_text = (payload.message or '').strip()
    if not message_text:
        raise HTTPException(status_code=400, detail='Message body cannot be empty')
        
    # Format message body to HTML preserving paragraphs and breaks
    formatted_body = html.escape(message_text).replace('\n', '<br>')
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }}
    .email-container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); padding: 32px 28px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }}
    .header p {{ margin: 8px 0 0; opacity: 0.9; font-size: 13px; font-weight: 500; }}
    .content {{ padding: 32px 28px; font-size: 15px; line-height: 1.7; color: #334155; }}
    .footer {{ padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>HireIQ AI Interview Platform</h1>
      <p>Autonomous AI-Powered Candidate Assessment</p>
    </div>
    <div class="content">
      {formatted_body}
    </div>
    <div class="footer">
      <p style="margin: 0; font-weight: 600; color: #64748b;">HireIQ Operations & Client Success</p>
      <p style="margin: 4px 0 0;">You received this email in response to your demo inquiry on HireIQ.</p>
    </div>
  </div>
</body>
</html>"""
    
    import dotenv
    dotenv.load_dotenv(override=True)
    brevo_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL", os.getenv("MASTER_EMAIL", "support@hireiq.com"))
    sender_name = (os.getenv("BREVO_SENDER_NAME") or "Hire IQ").strip()
    
    email_sent = False
    error_detail = None
    
    if brevo_key:
        try:
            res = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                json={
                    "sender": {"name": sender_name, "email": sender_email},
                    "to": [{"email": recipient_email, "name": payload.recipient_name or recipient_email}],
                    "subject": subject,
                    "htmlContent": html_content
                },
                headers={"api-key": brevo_key, "content-type": "application/json"},
                timeout=10
            )
            if res.status_code in (200, 201, 202):
                email_sent = True
            else:
                logger.warning(f"Brevo send status {res.status_code}: {res.text}")
                error_detail = res.text
        except Exception as ex:
            logger.error(f"Error calling Brevo API: {ex}")
            error_detail = str(ex)
    else:
        logger.info(f"Simulated email send to {recipient_email} (BREVO_API_KEY not configured)")
        email_sent = True

    # Mark demo request as CONTACTED in MongoDB if valid ObjectId
    try:
        if request_id and request_id != "direct":
            demo_requests_collection.update_one(
                {'_id': ObjectId(request_id)},
                {
                    '$set': {
                        'status': 'CONTACTED',
                        'last_contacted_at': datetime.utcnow().isoformat()
                    },
                    '$push': {
                        'email_history': {
                            'subject': subject,
                            'recipient': recipient_email,
                            'sent_at': datetime.utcnow().isoformat(),
                            'sent_by': current_admin.get('username', 'master')
                        }
                    }
                }
            )
    except Exception as db_err:
        logger.warning(f"Failed to update demo request history: {db_err}")

    if not email_sent and error_detail:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {error_detail}")

    return {
        'status': 'success',
        'message': f'Email sent successfully to {recipient_email}',
        'simulated': not bool(brevo_key)
    }

# ---------------------------------------------------------------------------
# Contact Requests (Connect with Us)
# ---------------------------------------------------------------------------
@router.post('/contact-request')
def create_contact_request(req: ContactRequestCreate):
    try:
        new_request = {
            'first_name': req.first_name,
            'last_name': req.last_name,
            'company_email': req.company_email,
            'company_name': req.company_name,
            'message': req.message,
            'status': 'NEW',
            'created_at': datetime.utcnow().isoformat()
        }
        result = contact_requests_collection.insert_one(new_request)

        # Send email notification to master
        brevo_key = os.getenv("BREVO_API_KEY")
        master_email = os.getenv("MASTER_EMAIL", os.getenv("BREVO_SENDER_EMAIL", "support@hireiq.com"))
        if brevo_key and master_email:
            try:
                email_html = f"""
                <html><body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #06b6d4;">New Contact Inquiry (Connect with Us)</h2>
                    <p><b>Name:</b> {req.first_name} {req.last_name}</p>
                    <p><b>Company:</b> {req.company_name}</p>
                    <p><b>Email:</b> {req.company_email}</p>
                    <p><b>Message:</b><br>{req.message}</p>
                </body></html>
                """
                requests.post("https://api.brevo.com/v3/smtp/email", json={
                    "sender": {"name": "Hire IQ Alerts", "email": master_email},
                    "to": [{"email": master_email, "name": "Hire IQ Admin"}],
                    "subject": f"New Contact Inquiry from {req.company_name} ({req.first_name})",
                    "htmlContent": email_html
                }, headers={"api-key": brevo_key, "content-type": "application/json"}, timeout=5)
            except Exception as email_err:
                logger.error(f'Error sending contact request email: {email_err}')

        return {'status': 'success', 'id': str(result.inserted_id)}
    except Exception as e:
        logger.error(f'Error saving contact request: {e}')
        raise HTTPException(status_code=500, detail='Failed to submit contact request')

@router.get('/master/contact-requests')
def get_master_contact_requests(current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Only master admin can view contact requests')
    
    try:
        requests_cursor = contact_requests_collection.find().sort('created_at', -1)
        requests_list = []
        for req in requests_cursor:
            req['id'] = str(req['_id'])
            del req['_id']
            requests_list.append(req)
        return {'status': 'success', 'data': requests_list}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put('/master/contact-requests/{request_id}')
def update_contact_request_status(request_id: str, req: ContactRequestUpdate, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Not authorized')
    try:
        result = contact_requests_collection.update_one(
            {'_id': ObjectId(request_id)},
            {'$set': {'status': req.status}}
        )
        if result.modified_count == 1:
            return {'status': 'success'}
        else:
            raise HTTPException(status_code=404, detail='Request not found')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete('/master/contact-requests/{request_id}')
def delete_contact_request(request_id: str, current_admin: dict = Depends(get_current_admin_details)):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Not authorized')
    try:
        result = contact_requests_collection.delete_one({'_id': ObjectId(request_id)})
        if result.deleted_count == 1:
            return {'status': 'success'}
        else:
            raise HTTPException(status_code=404, detail='Request not found')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post('/master/contact-requests/{request_id}/send-email')
def send_contact_request_email(
    request_id: str,
    payload: DemoRequestSendEmail,
    current_admin: dict = Depends(get_current_admin_details)
):
    if current_admin.get('role') != 'master':
        raise HTTPException(status_code=403, detail='Only master admin can send emails')
    
    recipient_email = (payload.recipient_email or '').strip()
    if not recipient_email:
        raise HTTPException(status_code=400, detail='Recipient email is required')
    
    subject = (payload.subject or 'Thank you for connecting with HireIQ').strip()
    message_text = (payload.message or '').strip()
    if not message_text:
        raise HTTPException(status_code=400, detail='Message body cannot be empty')
        
    formatted_body = html.escape(message_text).replace('\n', '<br>')
    
    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }}
    .email-container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%); padding: 32px 28px; text-align: center; color: #ffffff; }}
    .header h1 {{ margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }}
    .header p {{ margin: 8px 0 0; opacity: 0.9; font-size: 13px; font-weight: 500; }}
    .content {{ padding: 32px 28px; font-size: 15px; line-height: 1.7; color: #334155; }}
    .footer {{ padding: 20px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="email-container">
    <div class="header">
      <h1>HireIQ Platform</h1>
      <p>Connect with Us — Client Relations</p>
    </div>
    <div class="content">
      {formatted_body}
    </div>
    <div class="footer">
      <p style="margin: 0; font-weight: 600; color: #64748b;">HireIQ Operations Team</p>
      <p style="margin: 4px 0 0;">You received this email in response to your inquiry on HireIQ.</p>
    </div>
  </div>
</body>
</html>"""
    
    import dotenv
    dotenv.load_dotenv(override=True)
    brevo_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL", os.getenv("MASTER_EMAIL", "support@hireiq.com"))
    sender_name = (os.getenv("BREVO_SENDER_NAME") or "Hire IQ").strip()
    
    email_sent = False
    error_detail = None
    
    if brevo_key:
        try:
            res = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                json={
                    "sender": {"name": sender_name, "email": sender_email},
                    "to": [{"email": recipient_email, "name": payload.recipient_name or recipient_email}],
                    "subject": subject,
                    "htmlContent": html_content
                },
                headers={
                    "api-key": brevo_key,
                    "content-type": "application/json"
                },
                timeout=10
            )
            if res.status_code in (200, 201, 202):
                email_sent = True
            else:
                error_detail = f"Brevo returned status {res.status_code}: {res.text}"
                logger.error(f"Brevo send error: {error_detail}")
        except Exception as ex:
            error_detail = str(ex)
            logger.error(f"Failed to send email via Brevo: {ex}")
    else:
        logger.info(f"[SIMULATED EMAIL] To: {recipient_email} | Subject: {subject}")
        email_sent = True

    try:
        if request_id and request_id != "direct":
            contact_requests_collection.update_one(
                {'_id': ObjectId(request_id)},
                {
                    '$set': {
                        'status': 'CONTACTED',
                        'last_contacted_at': datetime.utcnow().isoformat()
                    },
                    '$push': {
                        'email_history': {
                            'subject': subject,
                            'recipient': recipient_email,
                            'sent_at': datetime.utcnow().isoformat(),
                            'sent_by': current_admin.get('username', 'master')
                        }
                    }
                }
            )
    except Exception as db_err:
        logger.warning(f"Failed to update contact request history: {db_err}")

    if not email_sent and error_detail:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {error_detail}")

    return {
        'status': 'success',
        'message': f'Email sent successfully to {recipient_email}',
        'simulated': not bool(brevo_key)
    }


