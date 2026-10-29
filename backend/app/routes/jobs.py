"""
app/routes_split/jobs.py — Jobs and applications
Auto-split from routes.py lines 11880–12228.
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
from app.services.services import get_current_admin_details
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

from app.routes.admin_dashboard import extract_info_from_resume
from app.routes.ai_calls import sync_call_status_helper

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

def extract_job_details_fallback(prompt: str) -> dict:
    """Robust rule-based and NLP fallback to extract and structure job details from prompt."""
    prompt_lower = prompt.lower()

    # 1. Title Extraction: Check direct Markdown / Role headers first
    title = None
    header_title_match = re.search(
        r'(?:^|\n)\s*[\*#_]*\s*(?:job\s+description|role|position|job\s+title)[\*#_:\s]*\s*([A-Za-z0-9\-\.\/\s\(\)]{3,60}?)(?=\n|\r|$)',
        prompt,
        re.IGNORECASE
    )
    if header_title_match:
        cand_t = header_title_match.group(1).strip()
        cand_t = re.sub(r'[\*_#]', '', cand_t).strip()
        if cand_t and len(cand_t) >= 3 and cand_t.lower() not in ["none", "open", "na", "job description"]:
            title = cand_t

    if not title:
        # Check for 'I have X requirement' pattern (e.g. 'I have ui-ux requirement')
        inline_req_match = re.search(
            r'(?:i have|we have|have)\s+([A-Za-z0-9\-\.\/ ]{2,40}?)\s+requirement',
            prompt,
            re.IGNORECASE
        )
        if inline_req_match:
            cand_req = inline_req_match.group(1).strip().lower()
            if re.search(r'ui[\s\-_/]?ux|ux designer|ui designer', cand_req):
                title = "UI/UX Designer"
            elif re.search(r'ai[\s\-_/]?ml|machine learning|ml engineer|ai engineer', cand_req):
                title = "AI/ML Engineer"
            elif "full stack" in cand_req or "fullstack" in cand_req:
                title = "Full Stack Developer"
            elif "devops" in cand_req:
                title = "DevOps Engineer"
            elif "python" in cand_req:
                title = "Python Developer"
            elif "java" in cand_req:
                title = "Software Developer (Java / Microservices)"

    if not title:
        role_ctx_match = re.search(
            r'(?:requirement of|role of|position of|hiring (?:for )?|looking for|need (?:an? )?|seeking (?:an? )?|opening for)\s+([A-Za-z0-9\-\./\s]+?)(?=\s+(?:having|with|for |\d+\s*yrs|\d+\s*years|fresher|salary|and\s+salary|skills|roles|experience|,|\.|$))',
            prompt,
            re.IGNORECASE
        )
        if role_ctx_match:
            cand = role_ctx_match.group(1).strip().lower()
            if re.search(r'ai[\s\-_/]?ml|machine learning|ml engineer|ai engineer', cand):
                title = "AI/ML Engineer"
            elif "data scientist" in cand:
                title = "Data Scientist"
            elif "data engineer" in cand:
                title = "Data Engineer"
            elif "full stack" in cand or "fullstack" in cand:
                title = "Full Stack Developer"
            elif "frontend" in cand or "front-end" in cand or "react" in cand:
                title = "Frontend Developer (React)"
            elif "backend" in cand or "back-end" in cand:
                title = "Backend Developer"
            elif "python" in cand:
                title = "Python Developer"
            elif "java" in cand or "microservice" in cand:
                title = "Software Developer (Java / Microservices)"
            elif "aws" in cand or "cloud" in cand:
                title = "AWS Cloud Engineer"
            elif "devops" in cand:
                title = "DevOps Engineer"
            elif "qa" in cand or "test" in cand or "quality" in cand:
                title = "QA Automation Engineer"
            elif re.search(r'ui[\s\-_/]?ux|ux designer|ui designer|designer', cand):
                title = "UI/UX Designer"
            else:
                title = role_ctx_match.group(1).strip().title()

    # Fallback to keyword matching if contextual indicator didn't match
    if not title:
        if re.search(r' ai[\s\-_/]?ml | ai\s*and\s*ml | machine learning engineer | ml engineer | ai engineer ', prompt_lower):
            title = "AI/ML Engineer"
        elif re.search(r' data scientist ', prompt_lower):
            title = "Data Scientist"
        elif re.search(r' data engineer ', prompt_lower):
            title = "Data Engineer"
        elif re.search(r' full\s*stack | fullstack ', prompt_lower):
            title = "Full Stack Developer"
        elif re.search(r' devops ', prompt_lower):
            title = "DevOps Engineer"
        elif re.search(r' aws | cloud engineer ', prompt_lower):
            title = "AWS Cloud Engineer"
        elif re.search(r' qa | test automation | quality assurance | sdet ', prompt_lower):
            title = "QA Automation Engineer"
        elif re.search(r' ui[\s\-_/]?ux | ui designer | ux designer | ui/ux ', prompt_lower):
            title = "UI/UX Designer"
        elif re.search(r' front[\s\-]?end | react developer ', prompt_lower):
            title = "Frontend Developer (React)"
        elif re.search(r' back[\s\-]?end ', prompt_lower):
            title = "Backend Developer"
        elif re.search(r' python developer | python engineer ', prompt_lower):
            title = "Python Developer"
        elif re.search(r' java developer | java engineer | microservice ', prompt_lower):
            title = "Software Developer (Java / Microservices)"
        elif re.search(r' software engineer ', prompt_lower):
            title = "Software Engineer"
        elif re.search(r' software developer | developer ', prompt_lower):
            title = "Software Developer"
        else:
            title = "Software Developer"

    # 2. Experience Extraction (e.g. fresher, 3–5 yrs, 2 yrs)
    exp = "2 – 4 Years"
    if "fresher" in prompt_lower or "entry level" in prompt_lower or "0 yr" in prompt_lower or "0 year" in prompt_lower:
        exp = "Fresher (0 – 1 Years)"
    else:
        exp_match = re.search(r'(\d+(?:\s*[\-–—to]\s*\d+)?)\s*(?:yrs?|years?|yoe)', prompt_lower)
        if exp_match:
            raw_val = exp_match.group(1).strip()
            m_parts = re.split(r'[\-–—]|(?:\s+to\s+)', raw_val)
            if len(m_parts) == 2 and m_parts[0].strip() and m_parts[1].strip():
                exp = f"{m_parts[0].strip()} – {m_parts[1].strip()} Years"
            else:
                exp = f"{m_parts[0].strip()} Years"

    # 3. Salary Extraction (e.g. 6 lpa, 8 lpa, 12 LPA)
    salary = "8 LPA"
    sal_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|lac|lakh|inr|per annum)', prompt_lower)
    if sal_match:
        salary = f"{sal_match.group(1).upper()} LPA"
    elif "6 lpa" in prompt_lower or "6lpa" in prompt_lower:
        salary = "6 LPA"
    elif "8 lpa" in prompt_lower or "8lpa" in prompt_lower:
        salary = "8 LPA"
    elif "10 lpa" in prompt_lower or "10lpa" in prompt_lower:
        salary = "10 LPA"
    elif "12 lpa" in prompt_lower or "12lpa" in prompt_lower:
        salary = "12 LPA"

    # 4. Service Agreement / Bond
    bond = "2-Year Bond"
    if "no bond" in prompt_lower or "0 bond" in prompt_lower or "0 yr bond" in prompt_lower or "without bond" in prompt_lower:
        bond = "No Bond"
    elif re.search(r'(\d+)\s*(?:yr|year)s?\s*bond', prompt_lower):
        b_num = re.search(r'(\d+)\s*(?:yr|year)s?\s*bond', prompt_lower).group(1)
        bond = f"{b_num}-Year Bond"
    elif "no bond" in prompt_lower or "none" in prompt_lower:
        bond = "No Bond"

    # 5. Work mode
    work_mode = "Remote"
    if "on-site" in prompt_lower or "onsite" in prompt_lower or "office" in prompt_lower:
        work_mode = "On-site"
    elif "hybrid" in prompt_lower:
        work_mode = "Hybrid"

    # 6. Location
    loc = "Hyderabad"
    loc_match = re.search(r' (?:location|located in|based in|city|in)\s+([A-Za-z]{3,20}(?:\s+[A-Za-z]{3,20})?) ', prompt_lower)
    if loc_match:
        cand_loc = loc_match.group(1).strip().title()
        if cand_loc.lower() not in ["this", "our", "the", "software", "developer", "engineer", "remote", "hybrid", "office", "years", "having", "offer", "skills", "jobs"]:
            loc = cand_loc

    # 7. Check if user provided explicit skills list in prompt (Section-based OR inline)
    explicit_skills = []
    # 7a. Section-based skills (e.g. **Required Skills:** \n - AWS \n - Docker)
    skills_sec_match = re.search(
        r'(?:^|\n)\s*[\*#_]*\s*(?:required\s+skills?|key\s+skills?|technical\s+skills?|skills\s*&?\s*technologies|skills)[\*#_:\s]*\n+([\s\S]*?)(?=\n\s*(?:[\*#_]*(?:Roles|Responsibilities|Mandatory|Certificat|Education|Experience|Preferred|Job Summary|How to Apply)\b|$))',
        prompt,
        re.IGNORECASE
    )
    if skills_sec_match:
        sec_lines = [l.strip() for l in skills_sec_match.group(1).splitlines() if l.strip()]
        for l in sec_lines:
            cleaned = re.sub(r'^[•\-\*"\d\.\)]\s*', '', l).strip()
            cleaned = re.sub(r'[\*_]', '', cleaned).strip()
            if cleaned and cleaned.lower() not in ['skills', 'roles', 'responsibilities', 'post a job']:
                explicit_skills.append(cleaned)

    # 7b. Inline skills (e.g. skills: Python, Django, SQL)
    if not explicit_skills:
        skills_match = re.search(
            r"skills(?:\s+roles)?(?:\s+and\s+responsibilities)?\s*(?:are|include|:|is|\n)?\s*([A-Za-z0-9\-\.\,\/\+\(\)\&\s]+?)(?=\s+(?:but\b|and\s+salary\b|salary\b|bond\b|having\b|experience\b|and\s+certification|certifications?\s+are|\bpassout\b|\.\s*$)|\Z)",
            prompt,
            re.IGNORECASE
        )
        if skills_match:
            raw_seg = skills_match.group(1).strip()
            # Strip trailing '. and certifications...' if regex didn't catch it
            raw_seg = re.sub(r'\.?\s*(?:and\s+)?certifications?.*$', '', raw_seg, flags=re.IGNORECASE).strip()
            parts = [s.strip() for s in re.split(r"[,|;\n]", raw_seg) if s.strip()]
            for p in parts:
                clean = re.sub(r'^(?:and|or)\s+', '', p, flags=re.IGNORECASE).strip()
                clean = re.sub(r'[\.]$', '', clean).strip()
                if clean and clean.lower() not in ['and', 'or', 'skills', 'roles', 'responsibilities', 'post a job', 'post', 'job']:
                    explicit_skills.append(clean)

    # 8. Check if user provided explicit roles & responsibilities
    explicit_roles = []
    roles_sec_match = re.search(
        r'(?:^|\n)\s*[\*#_]*\s*(?:roles?\s*(?:and|&)?\s*responsibilities|key\s+responsibilities|responsibilities)[\*#_:\s]*\n+([\s\S]*?)(?=\n\s*(?:[\*#_]*(?:Mandatory|Certificat|Required Skills|Skills|Education|Experience|Preferred|Job Summary|How to Apply)\b|$))',
        prompt,
        re.IGNORECASE
    )
    if roles_sec_match:
        sec_lines = [l.strip() for l in roles_sec_match.group(1).splitlines() if l.strip()]
        for l in sec_lines:
            cleaned = re.sub(r'^[•\-\*"\d\.\)]\s*', '', l).strip()
            cleaned = re.sub(r'[\*_]', '', cleaned).strip()
            if cleaned and len(cleaned) >= 5:
                explicit_roles.append(cleaned)

    # 9. Check if user provided explicit Job Summary
    summary_match = re.search(
        r'(?:^|\n)\s*[\*#_]*\s*(?:job\s+summary|summary|about\s+the\s+role)[\*#_:\s]*\n*([\s\S]*?)(?=\n\s*(?:[\*#_]*(?:Required Skills|Skills|Roles|Responsibilities|Mandatory|Certificat|Education|Experience|Preferred|How to Apply)\b|$))',
        prompt,
        re.IGNORECASE
    )
    explicit_summary = summary_match.group(1).strip() if summary_match and len(summary_match.group(1).strip()) >= 15 else None

    # 10. Certifications Extraction (Section & Inline)
    certifications = []
    certification_intro = ""
    cert_sec_match = re.search(
        r'(?:^|\n)\s*[\*#_]*\s*(?:mandatory\s+)?(?:certifications?|certificates?)(?:\s+requirements?)?[\*#_:\s]*\n+([\s\S]*?)(?=\n\s*(?:[\*#_]*(?:Education|Preferred|Experience|Salary|Roles|Skills|Responsibilities|Qualifications|Job Summary|How to Apply)\b|$))',
        prompt,
        re.IGNORECASE
    )
    if cert_sec_match:
        sec_lines = [l.strip() for l in cert_sec_match.group(1).splitlines() if l.strip()]
        for l in sec_lines:
            cleaned = re.sub(r'^[•\-\*"\d\.\)]\s*', '', l).strip()
            cleaned = re.sub(r'[\*_]', '', cleaned).strip()
            if not cleaned:
                continue
            if any(w in cleaned.lower() for w in ['completed at least', 'following certification', 'must have completed', 'mandatory:']) or cleaned.endswith(':'):
                if not certification_intro:
                    certification_intro = cleaned
            else:
                certifications.append(cleaned)
    else:
        inline_cert_match = re.search(
            r'(?:(?:mandatory\s+)?certifications?(?:\s+requirements?)?|certificates?(?:\s+required)?)\s*(?:are|:|include|is|\n)\s*([A-Za-z0-9\-\.\,\/\+\(\)\&\s]+?)(?=\s+(?:but\b|and\s+salary\b|salary\b|bond\b|having\b|experience\b|skills\b|and\s+must\b|\bpassout\b|\bstream\b|\.\s*$)|\Z)',
            prompt,
            re.IGNORECASE
        )
        if inline_cert_match:
            raw_c = inline_cert_match.group(1).strip()
            # Also strip any trailing 'and must be YEAR, YEAR passout...' text
            raw_c = re.sub(r'\s+and\s+must\s+be\b.*$', '', raw_c, flags=re.IGNORECASE).strip()
            raw_c = re.sub(r'\s+must\s+be\b.*$', '', raw_c, flags=re.IGNORECASE).strip()
            parts = [s.strip() for s in re.split(r'[,|;\n]', raw_c) if s.strip()]
            for p in parts:
                clean_p = re.sub(r'^(?:and|or)\s+', '', p, flags=re.IGNORECASE).strip()
                clean_p = re.sub(r'[\.]$', '', clean_p).strip()
                # Skip bare year numbers, passout conditions, stream conditions
                if not clean_p:
                    continue
                if re.match(r'^\d{4}$', clean_p):  # bare year like '2024'
                    continue
                if re.search(r'\bpassout\b|\bstream\b|\bmust be\b|\bany stream\b', clean_p, re.IGNORECASE):
                    continue
                if clean_p.lower() not in ['and', 'or', 'none', 'no', 'skills', 'roles']:
                    certifications.append(clean_p)

    # 11. Role Profiles: Tailored technical stack, responsibilities, and competencies
    title_l = title.lower()
    if "ai" in title_l or "ml" in title_l or "machine learning" in title_l:
        default_skills = ["Python", "Machine Learning", "Deep Learning", "SQL", "NLP", "Generative AI", "LLMs", "TensorFlow", "PyTorch", "FastAPI", "Docker", "AWS/Azure"]
        summary = explicit_summary or (
            f"We are seeking an ambitious {title} ({exp}) to build innovative machine learning, deep learning, and Generative AI solutions. "
            f"You will design predictive models, fine-tune LLMs, engineer automated data pipelines, and deploy scalable AI microservices into production."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Model Development & Architecture: Design, train, and optimize deep learning, machine learning, and NLP models using PyTorch, TensorFlow, and Scikit-Learn.",
            "Generative AI & LLMs: Implement state-of-the-art Generative AI applications, prompt engineering, RAG pipelines, and LLM fine-tuning workflows.",
            "Data Preprocessing & Pipelines: Build robust data ingestion, feature engineering, and high-performance querying pipelines with SQL, Pandas, and NumPy.",
            "Model Deployment & APIs: Package and deploy machine learning models as high-throughput REST APIs using FastAPI, Flask, and Docker containers.",
            "Cloud & MLOps: Scale AI workloads, manage model registries, and track production performance across cloud platforms (AWS / Azure).",
            "Collaborative Engineering: Collaborate actively with data engineers, software developers, and product teams to translate complex business challenges into intelligent AI systems."
        ]
        technical_skills = {
            "Languages": "Python, SQL",
            "AI & Deep Learning": "TensorFlow, PyTorch, Deep Learning, Neural Networks",
            "Generative AI & NLP": "LLMs, Generative AI, Prompt Engineering, NLP, Transformers",
            "Machine Learning": "Scikit-Learn, Pandas, NumPy, Feature Engineering",
            "API & Deployment": "FastAPI, Flask, REST APIs, Docker, Model Deployment",
            "Cloud & DevOps": "AWS / Azure, Git, CI/CD"
        }
    elif "full stack" in title_l:
        default_skills = ["React", "Node.js", "TypeScript", "JavaScript", "MongoDB", "PostgreSQL", "Express.js", "REST APIs", "Docker", "Git"]
        summary = explicit_summary or (
            f"We are seeking a versatile {title} ({exp}) to build end-to-end web applications. "
            f"You will design intuitive frontend interfaces with React, develop scalable backend APIs with Node.js/Python, and manage database persistence."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Frontend Engineering: Build responsive, performant user interfaces using React, TypeScript, and modern CSS frameworks.",
            "Backend Development: Design, develop, and maintain secure, high-throughput RESTful APIs and microservices with Node.js / Express or Python.",
            "Database Architecture: Model relational and NoSQL schemas, write optimized queries, and manage data persistence with PostgreSQL and MongoDB.",
            "DevOps & Containerization: Containerize applications with Docker, manage CI/CD pipelines, and deploy on modern cloud platforms.",
            "Testing & Reliability: Write comprehensive unit, integration, and end-to-end test suites to ensure robust software quality.",
            "Collaborative Engineering: Participate in architecture reviews, sprint planning, and code reviews across cross-functional engineering teams."
        ]
        technical_skills = {
            "Frontend": "React.js, TypeScript, JavaScript (ES6+), HTML5, CSS3, Tailwind CSS",
            "Backend": "Node.js, Express.js, RESTful APIs, Microservices",
            "Databases": "PostgreSQL, MongoDB, Redis",
            "Tools & DevOps": "Git, Docker, CI/CD Pipelines, Postman",
            "Testing": "Jest, React Testing Library, Cypress"
        }
    elif "ui/ux" in title_l or "designer" in title_l:
        default_skills = ["Figma", "Adobe XD", "Wireframing", "Prototyping", "User Research", "UI Design", "Design Systems", "Usability Testing"]
        summary = explicit_summary or (
            f"We are seeking a creative {title} ({exp}) to craft intuitive, user-centered digital experiences for web and mobile platforms. "
            f"You will transform complex workflows into elegant user interfaces, wireframes, interactive prototypes, and design systems."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "User Research & Personas: Conduct user interviews, competitive analysis, and map comprehensive customer journey flows.",
            "Wireframing & Prototyping: Create low and high-fidelity wireframes, interactive prototypes, and mockups using Figma and Adobe XD.",
            "Design Systems & Style Guides: Build, maintain, and scale comprehensive design systems, component libraries, and visual guidelines.",
            "Developer Handoff: Collaborate closely with frontend engineers to ensure design fidelity and responsive, pixel-perfect implementation.",
            "Usability & Accessibility: Advocate for user empathy, intuitive interactions, and WCAG accessibility standards across all platforms."
        ]
        technical_skills = {
            "Design Tools": "Figma, Adobe XD, Sketch, Photoshop, Illustrator",
            "Prototyping": "Figma Interactive Components, ProtoPie, InVision",
            "UX Methodologies": "User Journey Mapping, Information Architecture, Wireframing, Usability Testing",
            "Accessibility & Standards": "WCAG 2.1 Accessibility, Responsive Web & Mobile Design Patterns"
        }
    elif "python" in title_l:
        default_skills = ["Python", "FastAPI", "Django", "PostgreSQL", "Docker", "Redis", "REST APIs", "Linux"]
        summary = explicit_summary or (
            f"We are seeking an experienced {title} ({exp}) to join our engineering team. "
            f"You will build, optimize, and maintain high-performance, asynchronous backend services and scalable data pipelines. "
            f"The ideal candidate possesses strong proficiency in Python, FastAPI, relational databases, and modern cloud deployment practices."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Backend Development: Design, develop, and maintain robust, high-throughput backend services and APIs using Python, FastAPI, and Django.",
            "Database Architecture & ORM: Model relational schemas, optimize complex queries, and manage data persistence with PostgreSQL and SQLAlchemy / Tortoise ORM.",
            "API Design & Integrations: Build secure, performant RESTful endpoints, API gateways, and asynchronous task queues with Redis and Celery.",
            "Linux & Containerization: Containerize applications with Docker, manage microservices configurations, and operate comfortably in Linux server environments.",
            "Testing & Code Quality: Write unit, integration, and end-to-end test suites using PyTest, ensuring high test coverage, reliability, and security.",
            "Collaborative Engineering: Actively contribute to code reviews, system design discussions, agile sprint cycles, and technical documentation."
        ]
        technical_skills = {
            "Primary Language": "Python 3.10+ (AsyncIO, Generators, Type Hinting, OOPs)",
            "Frameworks": "FastAPI, Django, Flask, SQLAlchemy",
            "Databases": "PostgreSQL, MySQL, Redis, MongoDB",
            "Architecture": "RESTful APIs, Microservices, Asynchronous Event-Driven",
            "Operating System": "Linux / Unix (Command line usage, shell scripting, process management)",
            "Tools & DevOps": "Docker, Git, CI/CD Pipelines, Postman",
            "Testing": "PyTest, Unittest, Mock"
        }
    elif "java" in title_l or "microservice" in prompt_lower:
        default_skills = ["Java", "Spring Boot", "Microservices", "Hibernate", "SQL", "Linux", "REST APIs", "Docker"]
        summary = explicit_summary or (
            f"We are seeking an experienced {title} ({exp}) to join our core engineering team. "
            f"You will be responsible for building, optimizing, and maintaining scalable enterprise software applications. "
            f"The ideal candidate possesses strong expertise in Core & Advanced Java, Spring Framework, Hibernate ORM, Microservices, and Linux environments."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Backend Development: Design, build, and maintain high-performance, reusable, and reliable Java code using Spring Boot and Microservices architecture.",
            "Database Design & Management: Write, optimize, and manage complex SQL queries, stored procedures, and schema designs. Implement Object-Relational Mapping (ORM) using Hibernate / JPA.",
            "API Development: Create and consume secure, RESTful web services and integrate third-party APIs across modern Microservices workflows.",
            "Linux Environment: Work comfortably within Linux/Unix operating systems to manage services, inspect logs, automate routine tasks with basic shell scripts, and handle deployments.",
            "Testing & Quality Assurance: Write clean unit and integration tests (JUnit/Mockito) to ensure software robustness, reliability, and security compliance.",
            "Collaborative Engineering: Participate actively in code reviews, technical documentation, sprint planning, and debugging in an Agile framework."
        ]
        technical_skills = {
            "Primary Language": "Java (Java 8/11/17 — Multithreading, Streams, OOPs, Collections)",
            "Frameworks": "Spring, Spring Boot, Spring MVC, Spring Data JPA, Hibernate ORM",
            "Architecture": "Microservices, REST APIs, API Gateways, Distributed Systems",
            "Databases": "Relational SQL (MySQL, PostgreSQL, Oracle, or MS SQL Server)",
            "Operating System": "Linux / Unix (Command line usage, shell scripting, system logs)",
            "Tools & DevOps": "Docker, Git, Maven / Gradle, Postman",
            "Testing": "JUnit, Mockito"
        }
    elif "aws" in title_l or "devops" in title_l or "cloud" in title_l:
        default_skills = ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Python", "CloudFormation"]
        summary = explicit_summary or (
            f"We are seeking an experienced {title} ({exp}) to design, automate, and maintain resilient cloud infrastructure. "
            f"You will spearhead continuous integration, container orchestration, and cloud reliability across multi-region environments."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Cloud Infrastructure: Architect, configure, and maintain highly available and resilient infrastructure on AWS using Terraform or CloudFormation.",
            "Container Orchestration: Deploy, scale, and manage containerized workloads using Docker and Kubernetes (EKS/ECS).",
            "CI/CD Automation: Build and maintain automated build, test, and deployment pipelines using modern CI/CD tooling.",
            "Monitoring & Observability: Implement centralized logging, tracing, and metrics with Prometheus, Grafana, and CloudWatch.",
            "Security & Governance: Enforce cloud security best practices, IAM least privilege access, and infrastructure compliance standards.",
            "Incident Response & Reliability: Troubleshoot production incidents, optimize infrastructure costs, and ensure high system uptime."
        ]
        technical_skills = {
            "Cloud Platform": "AWS (EC2, S3, RDS, ECS, EKS, Lambda, CloudFront, VPC)",
            "Infrastructure as Code": "Terraform, CloudFormation",
            "Containers": "Docker, Kubernetes, Helm",
            "CI/CD": "GitHub Actions, GitLab CI, Jenkins",
            "Monitoring": "Prometheus, Grafana, CloudWatch",
            "Scripting & OS": "Bash, Python, Linux (Ubuntu/Debian, Amazon Linux)",
            "Testing & Security": "SonarQube, Trivy, IAM policies"
        }
    elif "frontend" in title_l or "react" in title_l:
        default_skills = ["React", "JavaScript", "TypeScript", "Tailwind CSS", "Redux Toolkit", "REST APIs", "HTML5/CSS3"]
        summary = explicit_summary or (
            f"We are seeking a talented {title} ({exp}) to craft exceptional, responsive user interfaces and scalable frontend architectures. "
            f"You will turn complex user workflows into fluid, intuitive web experiences."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "UI Development: Build modern, responsive, and accessible user interfaces using React, TypeScript, and Tailwind CSS.",
            "State Management & Architecture: Architect predictable client-side state using Redux Toolkit, Context API, or TanStack Query.",
            "API Integration: Consume and integrate RESTful APIs and WebSocket feeds with robust error handling and loading indicators.",
            "Performance Optimization: Optimize core web vitals, bundle sizes, lazy loading, and rendering performance across browsers.",
            "Testing & Code Quality: Write unit and component tests using Vitest, Jest, and React Testing Library.",
            "Collaborative Engineering: Work closely with UI/UX designers and backend engineers in agile iterations."
        ]
        technical_skills = {
            "Primary Languages": "JavaScript (ES6+), TypeScript, HTML5, CSS3",
            "Frameworks & UI": "React.js, Next.js, Tailwind CSS, Redux Toolkit",
            "Architecture": "Single Page Applications (SPA), Server-Side Rendering (SSR), RESTful APIs",
            "Testing": "Jest, React Testing Library, Vitest",
            "Tools & Build": "Vite, Webpack, Git, npm/yarn"
        }
    elif "data scientist" in title_l:
        default_skills = ["Python", "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "Scikit-Learn", "SQL"]
        summary = explicit_summary or (
            f"We are seeking a data-driven {title} ({exp}) to develop predictive machine learning models and extract actionable intelligence from complex datasets."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Model Development: Design, train, and evaluate machine learning and deep learning models using Python, Scikit-Learn, and PyTorch / TensorFlow.",
            "Data Pipeline Engineering: Clean, preprocess, and engineer features from massive structured and unstructured datasets.",
            "Model Deployment: Deploy predictive models as scalable REST APIs using FastAPI or Docker containers.",
            "Experimentation & Insights: Design A/B tests, perform rigorous statistical analysis, and present findings to key stakeholders."
        ]
        technical_skills = {
            "Languages": "Python, SQL, R",
            "ML Frameworks": "TensorFlow, PyTorch, Scikit-Learn, XGBoost",
            "Data Processing": "Pandas, NumPy, Apache Spark",
            "Deployment & Tools": "Docker, MLflow, FastAPI, Git"
        }
    elif "qa" in title_l or "test" in title_l:
        default_skills = ["Selenium", "Cypress", "PyTest", "Test Automation", "Postman", "JIRA", "CI/CD", "SQL"]
        summary = explicit_summary or (
            f"We are seeking a detail-oriented {title} ({exp}) to build robust test automation frameworks and ensure high software reliability."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Test Framework Engineering: Design and maintain automated UI and API test suites using Selenium, Cypress, and PyTest.",
            "API Testing: Validate backend services and RESTful endpoints using Postman and automated scripts.",
            "CI/CD Integration: Integrate automated test suites into continuous integration pipelines to catch regressions early.",
            "Defect Management: Log, track, and verify software defects using JIRA, collaborating closely with developers."
        ]
        technical_skills = {
            "Automation Tools": "Selenium, Cypress, Playwright",
            "Testing Frameworks": "PyTest, JUnit, TestNG",
            "API Testing": "Postman, RestAssured",
            "CI/CD & Tools": "Jenkins, GitHub Actions, JIRA, Git"
        }
    else:
        default_skills = ["Python", "JavaScript", "SQL", "Docker", "REST APIs", "Linux", "Git"]
        summary = explicit_summary or (
            f"We are seeking an experienced {title} ({exp}) to join our core engineering team. "
            f"You will build, optimize, and maintain scalable software applications and services. "
            f"The ideal candidate possesses strong expertise in modern programming practices, APIs, and cloud deployments."
        )
        roles = explicit_roles if len(explicit_roles) >= 2 else [
            "Software Development: Design, build, and maintain high-performance, reusable, and reliable code.",
            "Database Management: Write, optimize, and manage complex SQL queries and relational schema designs.",
            "API Engineering: Create and consume secure RESTful web services and integrate third-party APIs.",
            "Environment & DevOps: Work within Linux/Unix environments, manage containerized services with Docker, and handle deployments.",
            "Testing & Quality: Write clean unit and integration tests to ensure software robustness and security compliance.",
            "Collaborative Engineering: Participate actively in code reviews, technical documentation, and Agile sprint planning."
        ]
        technical_skills = {
            "Languages": "Python, SQL, JavaScript",
            "Frameworks": "RESTful APIs, Web Services",
            "Databases": "PostgreSQL, MySQL, Redis",
            "Operating System": "Linux / Unix",
            "Tools & CI/CD": "Git, Docker, Postman",
            "Testing": "PyTest, Unittest"
        }

    # If the user explicitly provided skills, use them directly; otherwise use role's default skills
    skills_list = explicit_skills if len(explicit_skills) >= 2 else default_skills

    # Extract Education & Preferred Candidate if provided in prompt
    edu_match = re.search(r'(?:^|\n)\s*[\*#_]*\s*Education[\*#_:\s]*\s*([^\n]+)', prompt, re.IGNORECASE)
    pref_match = re.search(r'(?:^|\n)\s*[\*#_]*\s*Preferred(?:\s+Candidate)?[\*#_:\s]*\s*([^\n]+)', prompt, re.IGNORECASE)

    qualifications = []
    if edu_match:
        qualifications.append(f"Education: {edu_match.group(1).strip()}")
    else:
        qualifications.append("Education: B.E. / B.Tech / M.C.A. / M.Tech in Computer Science, Information Technology, or a related field.")

    qualifications.append(f"Experience: Minimum {exp} of professional engineering experience.")

    # Extract passout year condition (e.g. 'must be 2024, 2025, 2026 passout and any stream is okay')
    passout_match = re.search(
        r'must\s+be\s+([\d\s,\/\-]+(?:and\s+[\d]+)?)\s*(?:passout|pass[\s-]?out|batch)',
        prompt,
        re.IGNORECASE
    )
    stream_match = re.search(r'any\s+stream\s+(?:is\s+)?okay', prompt, re.IGNORECASE)
    if passout_match:
        years_raw = passout_match.group(1).strip().rstrip(',').strip()
        years_parts = [y.strip() for y in re.split(r'[,\/\s]+', years_raw) if re.match(r'^\d{4}$', y.strip())]
        if years_parts:
            passout_str = f"Passout Year: {' / '.join(years_parts)} batch"
            if stream_match:
                passout_str += " (Any stream accepted)"
            qualifications.append(passout_str)
    elif stream_match:
        qualifications.append("Stream: Any stream / discipline accepted")

    if pref_match:
        qualifications.append(f"Preferred Candidate: {pref_match.group(1).strip()}")

    qualifications.extend([
        "Problem Solving: Strong analytical, algorithmic, and debugging skills.",
        "Communication: Clear oral and written technical communication skills."
    ])

    # Clean, non-redundant formatted description (NO "How to Apply", NO duplicate metadata)
    desc_sections = [
        f"Job Summary\n{summary}\n",
        "Key Responsibilities\n" + "\n".join([f"• {r}" for r in roles]) + "\n"
    ]

    # Only include Mandatory Certification Requirement if certifications were mentioned
    if certifications:
        cert_section = "Mandatory Certification Requirement\n"
        if certification_intro:
            cert_section += f"{certification_intro}\n"
        cert_section += "\n".join([f"• {c}" for c in certifications]) + "\n"
        desc_sections.append(cert_section)

    desc_sections.append("Qualifications & Requirements\n" + "\n".join([f"• {q}" for q in qualifications]))

    full_description = "\n".join(desc_sections).strip()

    return {
        "title": title,
        "experience": exp,
        "salary": salary,
        "bond": bond,
        "workMode": work_mode,
        "location": loc,
        "skills": ", ".join(skills_list),
        "certifications": certifications,
        "certification_intro": certification_intro,
        "summary": summary,
        "description": full_description,
        "roles_and_responsibilities": roles,
        "technical_skills": technical_skills,
        "qualifications": qualifications
    }

@router.post("/api/jobs/generate-ai")
@router.post("/jobs/generate-ai")
def generate_job_with_ai(payload: dict, current_admin: dict = Depends(get_current_admin_details)):
    prompt = payload.get("prompt", "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Prompt is required")

    company_name = current_admin.get("company_name") or current_admin.get("name") or "Arah Infotech"

    system_prompt = (
        "You are an expert HR Director and Technical Hiring Manager.\n"
        "Given a recruiter's job requirement prompt, extract all specified details (job title, experience, salary, bond, skills, location, workMode, certifications) "
        "and generate a complete, professional, highly structured, industry-standard job posting in strict JSON format.\n\n"
        "CRITICAL RULES TO AVOID REPETITION & IRRELEVANT SKILLS:\n"
        "1. SKILLS RULE: If the recruiter prompt mentions any specific skills/technologies, return ONLY those exact skills in 'skills'. DO NOT add extra skills. If no skills are mentioned in the prompt, only then provide 5-6 standard relevant skills.\n"
        "2. CERTIFICATION RULE: If the prompt mentions certifications or certificates (e.g. 'Mandatory Certification Requirement', 'AWS Certified...', 'CKA', etc.), extract them into a 'certifications' array AND include a 'Mandatory Certification Requirement' section in 'description' listing them. If NO certifications are mentioned in the prompt, set 'certifications': [] and DO NOT add any certification section.\n"
        "3. Do NOT include 'How to Apply' in the description text.\n"
        "4. Do NOT repeat or include metadata lines ('Role:', 'Experience:', 'Fixed Salary:', 'Service Agreement:', 'Location:', 'Employment Type:') inside 'description', as those are already displayed in UI cards.\n"
        "5. Do NOT include an 'Employment Terms & Service Agreement' section repeating CTC and Bond.\n"
        "6. Ensure technical skills, responsibilities, and qualifications match the exact technology specified in the prompt.\n\n"
        "The generated 'description' field MUST contain ONLY:\n"
        "Job Summary\n<concise 2-3 sentence summary>\n\n"
        "Key Responsibilities\n• <Category>: <Details>\n\n"
        "[Mandatory Certification Requirement (ONLY IF CERTIFICATIONS ARE MENTIONED IN PROMPT)]\n\n"
        "Qualifications & Requirements\n• <Education, Experience, Problem Solving, Communication>\n\n"
        "JSON Schema:\n"
        "{\n"
        '  "title": "Exact job title (e.g. DevOps Engineer)",\n'
        '  "experience": "e.g. 3 – 5 Years",\n'
        '  "salary": "e.g. 8 LPA",\n'
        '  "bond": "e.g. 2-Year Bond",\n'
        '  "workMode": "Remote, Hybrid, or On-site",\n'
        '  "location": "e.g. Hyderabad",\n'
        '  "skills": "Comma-separated list of skills (ONLY mentioned skills if specified in prompt)",\n'
        '  "certifications": ["List of extracted certifications from prompt, or empty list if none"],\n'
        '  "summary": "2-3 sentence executive job summary",\n'
        '  "description": "Clean description with only Job Summary, Key Responsibilities, [Mandatory Certification Requirement if mentioned], Qualifications",\n'
        '  "roles_and_responsibilities": ["Cloud Infrastructure: ...", "CI/CD Automation: ..."],\n'
        '  "technical_skills": {"Primary Language": "...", "Frameworks": "...", "Databases": "...", "Operating System": "...", "Tools & DevOps": "...", "Testing": "..."},\n'
        '  "qualifications": ["Education: ...", "Experience: ...", "Problem Solving: ...", "Communication: ..."]\n'
        "}\n\n"
        "Return ONLY the valid JSON object, without markdown code fences or conversational text."
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Recruiter requirement prompt: {prompt}\nCompany Name: {company_name}"}
    ]

    fallback_data = extract_job_details_fallback(prompt)

    try:
        raw_res = chat_completion(messages=messages, temperature=0.3, timeout=12)
        parsed = extract_json(raw_res)
        if isinstance(parsed, dict) and parsed.get("title"):
            if not parsed.get("experience"): parsed["experience"] = fallback_data.get("experience", "4 – 5 Years")
            if not parsed.get("workMode"): parsed["workMode"] = fallback_data.get("workMode", "Remote")
            if not parsed.get("location"): parsed["location"] = fallback_data.get("location", "Hyderabad")
            if parsed.get("location"): parsed["location"] = re.sub(r'\s*\/\s*(?:Remote|Hybrid|On-site)', '', str(parsed["location"]), flags=re.IGNORECASE).strip()
            if not parsed.get("salary"): parsed["salary"] = fallback_data.get("salary", "8 LPA")
            if not parsed.get("bond"): parsed["bond"] = fallback_data.get("bond", "2-Year Bond")
            if isinstance(parsed.get("skills"), list):
                parsed["skills"] = ", ".join(parsed["skills"])
            if parsed.get("description"):
                parsed["description"] = re.sub(r'How to Apply[\s\S]*$', '', parsed["description"], flags=re.IGNORECASE).strip()
            
            # Ensure title consistency
            if fallback_data.get("title") and fallback_data["title"] != "Software Developer":
                if ("ai" in fallback_data["title"].lower() or "ml" in fallback_data["title"].lower()) and "python" in parsed.get("title", "").lower():
                    parsed["title"] = fallback_data["title"]
                elif "devops" in fallback_data["title"].lower() and "developer" in parsed.get("title", "").lower():
                    parsed["title"] = fallback_data["title"]
                elif not parsed.get("title") or parsed.get("title") == "Software Developer":
                    parsed["title"] = fallback_data["title"]

            if "fresher" in prompt.lower() or "entry level" in prompt.lower():
                parsed["experience"] = "Fresher (0 – 1 Years)"
            elif fallback_data.get("experience"):
                parsed["experience"] = fallback_data["experience"]

            if fallback_data.get("skills"):
                parsed["skills"] = fallback_data["skills"]

            # Preserve certifications from fallback if user specified them
            if fallback_data.get("certifications"):
                parsed["certifications"] = fallback_data["certifications"]
                parsed["certification_intro"] = fallback_data.get("certification_intro", "")
                if "certification" not in parsed.get("description", "").lower():
                    cert_blk = "\n\nMandatory Certification Requirement\n"
                    if fallback_data.get("certification_intro"):
                        cert_blk += f"{fallback_data['certification_intro']}\n"
                    cert_blk += "\n".join([f"• {c}" for c in fallback_data["certifications"]])
                    parsed["description"] = parsed.get("description", "").strip() + cert_blk
            else:
                parsed["certifications"] = []
                parsed["certification_intro"] = ""

            return {"status": "success", "job": parsed}
    except Exception as e:
        logger.warning(f"AI job generation via LLM fallback to rule extractor: {e}")

    return {"status": "success", "job": fallback_data}

@router.post("/api/jobs")
@router.post("/jobs")
def create_job(job: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    job_dict = job.dict()
    if job_dict.get("location"):
        cleaned_loc = re.sub(r'\s*\/\s*(?:Remote|Hybrid|On-site)', '', str(job_dict["location"]), flags=re.IGNORECASE).strip()
        job_dict["location"] = cleaned_loc if cleaned_loc else str(job_dict["location"]).strip()
    job_dict["custom_id"] = get_next_sequence_value("job", "JOB")
    
    admin_id = current_admin["admin_id"]
    role = current_admin.get("role", "admin")
    
    # Store isolation & creator metadata
    job_dict["company_id"] = current_admin.get("company_id")
    job_dict["admin_id"] = admin_id
    job_dict["created_by_id"] = admin_id
    job_dict["created_by_role"] = role
    creator_name = current_admin.get("name") or current_admin.get("username") or "Admin"
    job_dict["created_by_name"] = creator_name
    job_dict["created_by_email"] = current_admin.get("email") or ""
    job_dict["created_by"] = creator_name
    
    # Custom format: JOB-[custom_id]-[role]-[admin_id_suffix]
    safe_role = str(role).replace("_", "").lower()
    suffix = str(admin_id)[-4:] if len(str(admin_id)) >= 4 else str(admin_id)
    job_id = f"{job_dict['custom_id']}-{safe_role}-{suffix}"
    
    job_dict["job_id"] = job_id
    job_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    job_dict["application_count"] = 0
    
    result = jobs_collection.insert_one(job_dict)
    job_dict["_id"] = str(result.inserted_id)
    
    return {"status": "success", "job": job_dict}

@router.get("/api/jobs")
@router.get("/jobs")
def get_admin_jobs(page: int = 1, limit: int = 20, current_admin: dict = Depends(get_current_admin_details)):
    # Validate and clamp pagination parameters
    if page < 1:
        raise HTTPException(status_code=400, detail="page must be >= 1")
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    skip = (page - 1) * limit

    role = current_admin.get("role")
    admin_id = current_admin.get("admin_id")
    company_id = current_admin.get("company_id")

    query = {}
    if company_id:
        query["company_id"] = company_id
        
    if role != "master":
        query["admin_id"] = {"$in": _get_authorized_creator_ids(current_admin)}
    total_jobs = jobs_collection.count_documents(query)
    jobs = list(jobs_collection.find(query).sort("created_at", -1).skip(skip).limit(limit))
    for j in jobs:
        raw_id = j["_id"]
        j["_id"] = str(raw_id)
        if not j.get("created_at"):
            try:
                obj_id = raw_id if isinstance(raw_id, ObjectId) else ObjectId(str(raw_id))
                j["created_at"] = obj_id.generation_time.isoformat()
            except Exception:
                pass
    return {
        "status": "success", 
        "jobs": jobs,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_jobs": total_jobs,
            "total_pages": (total_jobs + limit - 1) // limit if limit > 0 else 1
        }
    }

@router.put("/api/jobs/{job_id}")
@router.put("/jobs/{job_id}")
def update_job(job_id: str, job_update: JobCreate, current_admin: dict = Depends(get_current_admin_details)):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") and job.get("admin_id") not in allowed_ids and current_admin.get("role") != "master":
        raise HTTPException(status_code=403, detail="Access denied")

    update_data = {k: v for k, v in job_update.dict().items() if v is not None}
    if update_data.get("location"):
        cleaned_loc = re.sub(r'\s*\/\s*(?:Remote|Hybrid|On-site)', '', str(update_data["location"]), flags=re.IGNORECASE).strip()
        update_data["location"] = cleaned_loc if cleaned_loc else str(update_data["location"]).strip()
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    # Preserve original creator ownership (admin_id & company_id) so job is not disowned or hidden
    if not update_data.get("admin_id"):
        update_data["admin_id"] = job.get("admin_id") or current_admin.get("admin_id")
    if not update_data.get("company_id") and job.get("company_id"):
        update_data["company_id"] = job.get("company_id")

    result = jobs_collection.update_one({"_id": job["_id"]}, {"$set": update_data})
    if result.matched_count == 0:
        jobs_collection.update_one({"job_id": job_id}, {"$set": update_data})
        
    return {"status": "success", "message": "Job updated"}

@router.delete("/api/jobs/{job_id}")
@router.delete("/jobs/{job_id}")
def delete_job(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    result = jobs_collection.delete_one({"job_id": job_id})
    if result.deleted_count == 0:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            result = jobs_collection.delete_one({"_id": ObjectId(job_id)})
    return {"status": "success", "message": "Job deleted"}

@router.get("/api/public/jobs/{job_id}")
@router.get("/public/jobs/{job_id}")
def get_public_job(job_id: str):
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    raw_id = job["_id"]
    job["_id"] = str(raw_id)
    if not job.get("created_at"):
        try:
            obj_id = raw_id if isinstance(raw_id, ObjectId) else ObjectId(str(raw_id))
            job["created_at"] = obj_id.generation_time.isoformat()
        except Exception:
            pass
    return {"status": "success", "job": job}

@router.get("/api/public/jobs/company/{company_id}")
@router.get("/public/jobs/company/{company_id}")
def get_public_company_jobs(company_id: str):
    """
    Fetch all active public jobs for a specific company.
    Mirrors the dashboard logic by only selecting jobs created by authorized admins.
    """
    from bson import ObjectId
    
    # 1. Get the company name
    company_name = "Unknown Company"
    try:
        company = companies_collection.find_one({"_id": ObjectId(company_id)})
        if company:
            company_name = company.get("name") or company.get("company_name", "Unknown Company")
    except Exception:
        pass
        
    # 2. Get all authorized admin IDs for this company
    admin_ids = []
    try:
        org_admins = list(admins_collection.find({"company_id": company_id}, {"_id": 1}))
        admin_ids = [str(a["_id"]) for a in org_admins]
        # Also include the company_id itself just in case it acts as an admin_id in some legacy records
        if company_id not in admin_ids:
            admin_ids.append(company_id)
    except Exception:
        admin_ids = [company_id]
        
    # 3. Query jobs that belong to these admins (exactly how dashboard does it)
    query = {
        "admin_id": {"$in": admin_ids}
    }
    
    jobs = list(jobs_collection.find(query).sort("created_at", -1))
    
    # 4. Clean up jobs for public consumption
    public_jobs = []
    for j in jobs:
        raw_id = j["_id"]
        j["_id"] = str(raw_id)
        if not j.get("created_at"):
            try:
                obj_id = raw_id if isinstance(raw_id, ObjectId) else ObjectId(str(raw_id))
                j["created_at"] = obj_id.generation_time.isoformat()
            except Exception:
                pass
        public_jobs.append(j)
        
    return {
        "status": "success", 
        "company_name": company_name, 
        "jobs": public_jobs
    }
UPLOAD_RESUMES_DIR = os.path.join(os.getcwd(), "uploads", "resumes")
UPLOAD_COVER_LETTERS_DIR = os.path.join(os.getcwd(), "uploads", "cover_letters")
os.makedirs(UPLOAD_RESUMES_DIR, exist_ok=True)
os.makedirs(UPLOAD_COVER_LETTERS_DIR, exist_ok=True)

@router.get("/api/public/resumes/{filename}")
@router.get("/public/resumes/{filename}")
def get_uploaded_resume_file(filename: str):
    """Serve locally stored resumes if not using Cloudinary."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_RESUMES_DIR, safe_filename)
    if not os.path.exists(file_path):
        from fastapi.responses import HTMLResponse
        return HTMLResponse(
            content="""
            <div style="font-family: ui-sans-serif, system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #f8fafc; color: #64748b; margin: 0; padding: 20px; text-align: center;">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px; color: #94a3b8;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line></svg>
                <h3 style="margin: 0 0 8px 0; color: #334155; font-size: 1.125rem; font-weight: 600;">Resume File Not Found</h3>
                <p style="margin: 0; font-size: 0.875rem; max-width: 300px;">The original resume document could not be located on the server. It may have been deleted or moved.</p>
            </div>
            """,
            status_code=404
        )
    media_type = "application/pdf" if safe_filename.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(file_path, media_type=media_type)

@router.get("/api/public/cover_letters/{filename}")
@router.get("/public/cover_letters/{filename}")
def get_uploaded_cover_letter_file(filename: str):
    """Serve locally stored cover letters."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_COVER_LETTERS_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Cover letter file not found")
    media_type = "application/pdf" if safe_filename.lower().endswith(".pdf") else "application/octet-stream"
    return FileResponse(file_path, media_type=media_type)


@router.post("/api/public/jobs/{job_id}/apply")
@router.post("/public/jobs/{job_id}/apply")
async def apply_for_job(
    job_id: str,
    request: Request,
    name: Optional[str] = Form(None),
    email: Optional[str] = Form(None),
    phone: Optional[str] = Form(None),
    resume_url: Optional[str] = Form(None),
    linkedin_url: Optional[str] = Form(None),
    cover_letter: Optional[str] = Form(None),
    resume_file: Optional[UploadFile] = File(None),
    cover_letter_file: Optional[UploadFile] = File(None),
):
    """
    Accept a job application submitted as multipart/form-data with file uploads
    or as JSON. Validates the job exists, extracts text from uploaded resumes/cover letters,
    persists the application document, and increments application_count.
    """
    try:
        job = jobs_collection.find_one({"job_id": job_id})
        if not job:
            from bson import ObjectId
            if ObjectId.is_valid(job_id):
                job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    except InvalidId:
        pass # Ignore InvalidId and proceed to 404
    except Exception as db_err:
        logger.error(f"[JobApply] Database error looking up job {job_id}: {db_err}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable. Please try again later.")

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    actual_job_id = job.get("job_id") or str(job["_id"])

    # Fallback to JSON payload if request was application/json
    content_type = request.headers.get("content-type", "").lower()
    if "application/json" in content_type:
        try:
            body = await request.json()
            name = body.get("name") or name
            email = body.get("email") or email
            phone = body.get("phone") or phone
            resume_url = body.get("resume_url") or resume_url
            linkedin_url = body.get("linkedin_url") or linkedin_url
            cover_letter = body.get("cover_letter") or cover_letter
        except Exception:
            pass

    if not name or not email:
        raise HTTPException(status_code=422, detail="Name and email are required to apply")

    from app.services.services import extract_text_from_file

    resume_filename = None
    resume_text = ""
    saved_resume_url = (resume_url or "").strip()

    # Process uploaded resume file
    if resume_file and resume_file.filename:
        resume_filename = resume_file.filename
        try:
            file_bytes = await resume_file.read()
            if len(file_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Resume file size exceeds 5MB limit")
            
            # Simple magic byte / extension check
            ext = os.path.splitext(resume_filename)[1].lower()
            if ext not in ['.pdf', '.docx', '.doc', '.txt']:
                raise HTTPException(status_code=400, detail="Invalid resume file type. Allowed: PDF, DOCX, DOC, TXT")
            
            if len(file_bytes) >= 4:
                header = file_bytes[:4]
                is_valid_magic = False
                if ext == '.pdf' and header == b'%PDF':
                    is_valid_magic = True
                elif ext == '.docx' and header == b'PK\x03\x04':
                    is_valid_magic = True
                elif ext == '.doc' and header == b'\xd0\xcf\x11\xe0':
                    is_valid_magic = True
                elif ext == '.txt':
                    is_valid_magic = True
                
                if not is_valid_magic:
                    raise HTTPException(status_code=400, detail="File content does not match its extension signature")
                
            if file_bytes:
                # Extract text
                extracted = extract_text_from_file(file_bytes, resume_filename)
                if extracted:
                    resume_text = extracted

                # Upload to Cloudinary or save locally
                cloud_uploaded = False
                try:
                    upload_res = cloudinary.uploader.upload(
                        file_bytes,
                        folder="job_resumes",
                        resource_type="raw"
                    )
                    if upload_res and upload_res.get("secure_url"):
                        saved_resume_url = upload_res.get("secure_url")
                        cloud_uploaded = True
                        logger.info(f"[JobApply] Resume uploaded to Cloudinary: {saved_resume_url}")
                except Exception as cloud_err:
                    logger.warning(f"Cloudinary resume upload skipped/failed: {cloud_err}")

                if not cloud_uploaded:
                    try:
                        unique_id = uuid.uuid4().hex[:10]
                        safe_name = f"{unique_id}_{os.path.basename(resume_filename)}"
                        local_path = os.path.join(UPLOAD_RESUMES_DIR, safe_name)
                        logger.info(f"[JobApply] Saving resume locally to: {local_path}")
                        with open(local_path, "wb") as f:
                            f.write(file_bytes)
                        saved_resume_url = f"/api/public/resumes/{safe_name}"
                        logger.info(f"[JobApply] Resume saved locally. URL: {saved_resume_url}")
                    except Exception as local_err:
                        logger.error(f"[JobApply] Local resume save FAILED: {local_err}", exc_info=True)
                        saved_resume_url = ""
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error processing uploaded resume file: {e}", exc_info=True)
            saved_resume_url = ""

    # If saved_resume_url is a bare filename (not a URL or path), clear it
    if saved_resume_url and not saved_resume_url.startswith(('http://', 'https://', '/')):
        logger.warning(f"[JobApply] Clearing invalid resume_url (bare filename): '{saved_resume_url}'")
        saved_resume_url = ""

    # Process uploaded cover letter file
    cover_letter_filename = None
    cover_letter_url = ""
    if cover_letter_file and cover_letter_file.filename:
        cover_letter_filename = cover_letter_file.filename
        try:
            cl_bytes = await cover_letter_file.read()
            if len(cl_bytes) > 5 * 1024 * 1024:
                raise HTTPException(status_code=400, detail="Cover letter file size exceeds 5MB limit")
                
            ext = os.path.splitext(cover_letter_filename)[1].lower()
            if ext not in ['.pdf', '.docx', '.doc', '.txt']:
                raise HTTPException(status_code=400, detail="Invalid cover letter file type. Allowed: PDF, DOCX, DOC, TXT")
                
            if cl_bytes:
                cl_extracted = extract_text_from_file(cl_bytes, cover_letter_filename)
                if cl_extracted and not cover_letter:
                    cover_letter = cl_extracted

                cloud_uploaded = False
                try:
                    upload_res = cloudinary.uploader.upload(
                        cl_bytes,
                        folder="job_cover_letters",
                        resource_type="auto"
                    )
                    if upload_res and upload_res.get("secure_url"):
                        cover_letter_url = upload_res.get("secure_url")
                        cloud_uploaded = True
                except Exception as cloud_err:
                    logger.warning(f"Cloudinary cover letter upload skipped/failed: {cloud_err}")

                if not cloud_uploaded:
                    unique_id = uuid.uuid4().hex[:10]
                    safe_name = f"{unique_id}_{os.path.basename(cover_letter_filename)}"
                    local_path = os.path.join(UPLOAD_COVER_LETTERS_DIR, safe_name)
                    with open(local_path, "wb") as f:
                        f.write(cl_bytes)
                    cover_letter_url = f"/api/public/cover_letters/{safe_name}"
        except Exception as e:
            logger.error(f"Error processing uploaded cover letter file: {e}")

    parsed_info = {}
    if resume_text:
        try:
            from app.services.resume_nlp_extractor import extract_candidate_info_nlp
            parsed_info = extract_candidate_info_nlp(resume_text) or {}
        except Exception as p_err:
            logger.warning(f"[JobApply] NLP info extraction error: {p_err}")

    app_dict = {
        "job_id": actual_job_id,
        "company_id": job.get("company_id"),
        "admin_id": job.get("admin_id"),
        "job_title": job.get("title"),
        "name": name,
        "email": email,
        "candidate_email": email,
        "phone": phone or "",
        "resume_url": saved_resume_url,
        "resume_filename": resume_filename,
        "resume_text": resume_text,
        "linkedin_url": linkedin_url or (parsed_info.get("linkedin_url") if isinstance(parsed_info, dict) else "") or "",
        "skills": parsed_info.get("skills", []) if isinstance(parsed_info, dict) else [],
        "experience": parsed_info.get("experience", "") if isinstance(parsed_info, dict) else "",
        "location": parsed_info.get("location", "") if isinstance(parsed_info, dict) else "",
        "current_company": parsed_info.get("current_company", "") if isinstance(parsed_info, dict) else "",
        "notice_period": parsed_info.get("notice_period", "") if isinstance(parsed_info, dict) else "",
        "cover_letter": cover_letter or "",
        "cover_letter_url": cover_letter_url,
        "cover_letter_filename": cover_letter_filename,
        "status": "Pending Review",
        "applied_at": datetime.now(timezone.utc).isoformat(),
    }

    result = job_applications_collection.insert_one(app_dict)
    # Atomically increment application_count on the parent job
    jobs_collection.update_one(
        {"_id": job["_id"]},
        {"$inc": {"application_count": 1}},
    )
    logger.info(f"[JobApply] New application for job_id={actual_job_id} by {email}, _id={result.inserted_id}")
    return {
        "status": "success",
        "message": "Application submitted successfully",
        "application_id": str(result.inserted_id),
        "resume_url": saved_resume_url,
        "resume_filename": resume_filename,
    }

@router.get("/api/jobs/{job_id}/applications")
@router.get("/jobs/{job_id}/applications")
def get_job_applications(job_id: str, current_admin: dict = Depends(get_current_admin_details)):
    """
    Returns all applications submitted for a given job_id.
    Enforces multi-tenant job access verification.
    """
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Data Isolation Check
    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    actual_job_id = job.get("job_id") or str(job["_id"])
    applications = list(job_applications_collection.find({"job_id": actual_job_id}).sort("applied_at", -1))
    
    # Sync active calls
    for a in applications:
        call_status = (a.get("call_status") or "").lower()
        call_id = a.get("omni_call_id")
        if call_id and call_status and call_status not in ["completed", "failed", "no answer", "canceled"]:
            try:
                sync_call_status_helper(str(call_id), str(a["_id"]))
            except Exception as e:
                print(f"Failed to sync active call {call_id}: {e}")
                
    # Re-fetch after syncing to get fresh data
    applications = list(job_applications_collection.find({"job_id": actual_job_id}).sort("applied_at", -1))
    
    from app.services.services import extract_text_from_file
    import os
    from bson import ObjectId
    
    for a in applications:
        a["_id"] = str(a["_id"])
        if not a.get("resume_text") and a.get("resume_url"):
            r_url = a.get("resume_url")
            try:
                text = None
                if os.path.exists(r_url):
                    with open(r_url, "rb") as f:
                        text = extract_text_from_file(f.read(), r_url)
                elif r_url.startswith("http://") or r_url.startswith("https://"):
                    resp = requests.get(r_url, timeout=10)
                    if resp.status_code == 200:
                        text = extract_text_from_file(resp.content, r_url)
                if text:
                    a["resume_text"] = text
                    job_applications_collection.update_one(
                        {"_id": ObjectId(a["_id"])},
                        {"$set": {"resume_text": text}}
                    )
            except Exception as parse_err:
                print(f"Failed to parse stored resume {r_url}: {parse_err}")
                    
    return {"status": "success", "applications": applications, "total": len(applications)}

@router.patch("/api/jobs/{job_id}/applications/{app_id}/status")
@router.patch("/jobs/{job_id}/applications/{app_id}/status")
def update_application_status(
    job_id: str,
    app_id: str,
    payload: dict,
    current_admin: dict = Depends(get_current_admin_details)
):
    """Update the status of a specific job application."""
    job = jobs_collection.find_one({"job_id": job_id})
    if not job:
        from bson import ObjectId
        if ObjectId.is_valid(job_id):
            job = jobs_collection.find_one({"_id": ObjectId(job_id)})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    allowed_ids = _get_authorized_creator_ids(current_admin)
    if job.get("admin_id") not in allowed_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    from bson import ObjectId as BsonObjectId
    new_status = payload.get("status", "").strip()
    allowed = {"Pending Review", "Shortlisted", "Interview Scheduled", "Rejected", "Hired"}
    if new_status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status. Allowed: {allowed}")
    try:
        oid = BsonObjectId(app_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid application id")

    app = job_applications_collection.find_one({"_id": oid})
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")

    actual_job_id = job.get("job_id") or str(job["_id"])
    if app.get("job_id") != actual_job_id:
        raise HTTPException(status_code=400, detail="Application does not belong to this job")

    now_iso = datetime.now(timezone.utc).isoformat()
    action_by_name = current_admin.get("name") or current_admin.get("username") or "Admin"
    action_by_email = current_admin.get("email") or ""
    action_by_role = current_admin.get("role") or "admin"
    action_by_id = current_admin.get("admin_id")

    log_entry = {
        "status": new_status,
        "action": f"Status changed to {new_status}",
        "action_by_id": action_by_id,
        "action_by_name": action_by_name,
        "action_by_email": action_by_email,
        "action_by_role": action_by_role,
        "timestamp": now_iso
    }

    result = job_applications_collection.update_one(
        {"_id": oid},
        {
            "$set": {
                "status": new_status,
                "updated_at": now_iso,
                "last_action_by_id": action_by_id,
                "last_action_by_name": action_by_name,
                "last_action_by_email": action_by_email,
                "last_action_by_role": action_by_role,
                "last_action_status": new_status,
                "last_action_at": now_iso
            },
            "$push": {
                "action_history": log_entry
            }
        }
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Application not found")
    return {
        "status": "success",
        "message": f"Status updated to '{new_status}'",
        "last_action_by_name": action_by_name,
        "last_action_by_role": action_by_role,
        "last_action_at": now_iso
    }

# pyrefly: ignore [missing-import]
import pypdf
import io

@router.post("/api/public/jobs/parse-resume")
@router.post("/public/jobs/parse-resume")
def parse_resume(resume: UploadFile = File(...)):
    try:
        allowed_extensions = {".pdf", ".docx", ".doc", ".txt"}
        filename = (resume.filename or "").lower()
        ext = os.path.splitext(filename)[1]
        
        allowed_types = {
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "text/plain",
            "application/octet-stream",
        }
        if ext not in allowed_extensions and resume.content_type and resume.content_type not in allowed_types:
            raise HTTPException(status_code=415, detail="Only PDF, DOCX, DOC, and TXT resumes are supported")

        if getattr(resume, "size", 0) and resume.size > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Resume exceeds the 10 MB limit")

        content = resume.file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Resume exceeds the 10 MB limit")
        
        from app.services.services import extract_text_from_file
        extracted_text = extract_text_from_file(content, resume.filename or "resume.pdf") or ""

        if not extracted_text.strip():
            return {
                "status": "success",
                "data": {
                    "name": "", "email": "", "phone": "", "linkedin_url": "",
                    "skills": [], "experience": "", "location": "", "resume_text": ""
                }
            }

        from app.services.resume_nlp_extractor import extract_candidate_info_nlp
        parsed_data = extract_candidate_info_nlp(extracted_text)
        if isinstance(parsed_data, dict):
            parsed_data["resume_text"] = extracted_text

        return {
            "status": "success", 
            "data": parsed_data
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error parsing resume: {e}")
        return {"status": "error", "message": str(e), "data": {"name": "", "email": "", "phone": "", "linkedin_url": "", "skills": [], "resume_text": ""}}

# ---------------------------------------------------------------------------
# Demo Requests
# ---------------------------------------------------------------------------
from app.schemas.models import DemoRequestCreate, DemoRequestUpdate
from app.db.mongo_db import demo_requests_collection
from bson import ObjectId
from datetime import datetime

