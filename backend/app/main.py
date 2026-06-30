"""
app/main.py — FastAPI application factory.

This is the only place that:
  - Creates the FastAPI instance
  - Registers all middleware
  - Mounts all routers
  - Wires up startup/shutdown events

All business logic lives in services.py, routes.py, and tasks.py.
"""

import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

# ---------------------------------------------------------------------------
# Internal routers & modules
# ---------------------------------------------------------------------------
from app.routes import router       # Main API router (all endpoints)
import transcription                # Voice transcription sub-router
from routes import voice_routes     # WebRTC voice routes
from app import config

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------
from pymongo import ASCENDING, DESCENDING
from mongo_db import interview_sessions_collection

app = FastAPI(
    title="HireIQ AI Interview Platform",
    description="Backend API for AI-powered mock interviews",
    version="2.0.0",
)

@app.on_event("startup")
async def startup_event():
    print("Initializing MongoDB Indexes...")
    try:
        interview_sessions_collection.create_index([("company_id", ASCENDING), ("status", ASCENDING)])
        interview_sessions_collection.create_index([("company_id", ASCENDING), ("created_at", DESCENDING)])
        interview_sessions_collection.create_index([("link_id", ASCENDING)], unique=True)
        print("MongoDB Indexes Initialized Successfully!")
    except Exception as e:
        print(f"Failed to initialize indexes: {e}")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Live monitor polling/heartbeats are intentionally frequent and low-risk.
        if request.url.path in config.RATE_LIMIT_EXEMPT_PATHS or request.url.path.startswith(config.RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)
            
        forwarded_for = request.headers.get("x-forwarded-for", "")
        client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else "unknown")
        now = time.time()
        
        # Filter out old requests
        config.request_counts[client_ip] = [timestamp for timestamp in config.request_counts[client_ip] if now - timestamp < config.RATE_LIMIT_WINDOW]
        
        if len(config.request_counts[client_ip]) >= config.RATE_LIMIT:
            return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})
        
        config.request_counts[client_ip].append(now)
        return await call_next(request)

# --- Middleware ---
# Middlewares are executed top-down. We want CORSMiddleware to be the outermost (last added)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://ai-adaptive-interview.vercel.app",
        "https://www.hireiq.co.in",
        "https://hireiq.co.in",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "https://hire-ai-iq.netlify.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount uploads folder to serve files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- Routers ---
app.include_router(router)
app.include_router(transcription.router)
app.include_router(voice_routes.router)

from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    config.LAST_422_ERROR = {"errors": exc.errors(), "body": exc.body}
    print(f"================ 422 ERROR ON {request.url.path} ================")
    print("Errors:", exc.errors())
    print("Body:", exc.body)
    print("================================================================")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})

# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------

@app.get("/")
async def root():
    return {"status": "ok", "service": "HireIQ Backend"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
