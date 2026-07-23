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
import asyncio
from contextlib import asynccontextmanager
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
from app.routes_conversation_flow import router as conversation_flow_router
import transcription                # Voice transcription sub-router
from routes import voice_routes     # WebRTC voice routes
from app import config

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------
from pymongo import ASCENDING, DESCENDING
from mongo_db import interview_sessions_collection

# ---------------------------------------------------------------------------
# Redis singleton — created ONCE at module load, reused by every request.
# Creating Redis.from_url() inside dispatch() was adding connection overhead
# on every single API call. A module-level client is thread-safe for read/write.
# ---------------------------------------------------------------------------
import os
import redis as _redis_module

_REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
_TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "false").lower() == "true"
_last_rate_limit_cleanup = 0.0
try:
    # socket_connect_timeout: max seconds to wait for TCP connection
    # socket_timeout: max seconds to wait for any command response (incl. PING)
    _redis_client = _redis_module.Redis.from_url(
        _REDIS_URL,
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    _redis_client.ping()  # verify Redis is reachable at startup
except _redis_module.exceptions.RedisError:
    # RedisError is the base class for ConnectionError, TimeoutError,
    # AuthenticationError, etc. — any Redis failure falls back gracefully.
    print("WARNING: Redis unavailable at startup — falling back to in-memory rate limiting.")
    _redis_client = None
except Exception:
    # Catch any other unexpected error (e.g. DNS failure) without crashing startup.
    print("WARNING: Redis init failed — falling back to in-memory rate limiting.")
    _redis_client = None

from app.routes import startup_event_cloudinary, startup_event_db_and_email

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Initializing MongoDB Indexes...")
    try:
        interview_sessions_collection.create_index([("company_id", ASCENDING), ("status", ASCENDING)])
        interview_sessions_collection.create_index([("company_id", ASCENDING), ("created_at", DESCENDING)])
        interview_sessions_collection.create_index([("company_id", ASCENDING), ("created_by", ASCENDING), ("status", ASCENDING)])
        interview_sessions_collection.create_index([("company_id", ASCENDING), ("created_by", ASCENDING), ("created_at", DESCENDING)])
        interview_sessions_collection.create_index([("link_id", ASCENDING)], unique=True)
        print("MongoDB Indexes Initialized Successfully!")
    except Exception as e:
        print(f"Failed to initialize indexes: {e}")
        
    startup_event_cloudinary()
    await startup_event_db_and_email()
    await voice_routes.start_realtime_services()
    try:
        yield
    finally:
        await voice_routes.stop_realtime_services()

app = FastAPI(
    title="HireIQ AI Interview Platform",
    description="Backend API for HireIQ AI-powered interviews",
    version="2.0.0",
    lifespan=lifespan,
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        global _last_rate_limit_cleanup
        # Live monitor polling/heartbeats are intentionally frequent and low-risk.
        if request.url.path in config.RATE_LIMIT_EXEMPT_PATHS or request.url.path.startswith(config.RATE_LIMIT_EXEMPT_PREFIXES):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        if _TRUST_PROXY_HEADERS:
            real_ip = request.headers.get("x-real-ip", "").strip()
            forwarded_for = request.headers.get("x-forwarded-for", "")
            client_ip = real_ip or (forwarded_for.split(",")[0].strip() if forwarded_for else client_ip)

        # Normalize a trailing slash so duplicate FastAPI route spellings cannot
        # bypass the stricter bucket (for example /start-interview/).
        path = request.url.path.rstrip("/") or "/"
        if path == "/api/public/jobs/parse-resume":
            request_limit = config.PUBLIC_RESUME_RATE_LIMIT
            bucket = "public-resume"
        elif path in config.EXPENSIVE_RATE_LIMIT_PATHS:
            request_limit = config.EXPENSIVE_RATE_LIMIT
            bucket = "expensive"
        else:
            request_limit = config.RATE_LIMIT
            bucket = "general"

        try:
            if _redis_client is None:
                raise _redis_module.exceptions.ConnectionError("Redis not available")
            key = f"rl:{bucket}:{client_ip}"
            count = await asyncio.to_thread(_redis_client.incr, key)
            if count == 1:
                await asyncio.to_thread(_redis_client.expire, key, config.RATE_LIMIT_WINDOW)
            if count > request_limit:
                return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down."})
        except _redis_module.exceptions.RedisError:
            # Fallback: in-memory rate limiting (local dev / Redis down)
            now = time.time()
            if now - _last_rate_limit_cleanup >= config.RATE_LIMIT_WINDOW:
                cutoff = now - config.RATE_LIMIT_WINDOW
                for existing_key, timestamps in list(config.request_counts.items()):
                    recent = [timestamp for timestamp in timestamps if timestamp >= cutoff]
                    if recent:
                        config.request_counts[existing_key] = recent
                    else:
                        config.request_counts.pop(existing_key, None)
                _last_rate_limit_cleanup = now
            memory_key = f"{bucket}:{client_ip}"
            if memory_key not in config.request_counts and len(config.request_counts) >= 50_000:
                return JSONResponse(status_code=429, content={"detail": "Rate limiter is at capacity. Please retry shortly."})
            if memory_key not in config.request_counts:
                config.request_counts[memory_key] = []
            config.request_counts[memory_key] = [ts for ts in config.request_counts[memory_key] if now - ts < config.RATE_LIMIT_WINDOW]
            if len(config.request_counts[memory_key]) >= request_limit:
                return JSONResponse(status_code=429, content={"detail": "Too many requests. Please slow down. (Local Mode)"})
            config.request_counts[memory_key].append(now)
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        if os.getenv("ENV", "local").lower() == "production":
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return response

# --- Middleware ---
# Middlewares are executed top-down. We want CORSMiddleware to be the outermost (last added)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
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
    allow_origin_regex=os.getenv("CORS_ORIGIN_REGEX") or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Local uploads are a development fallback only. Production recordings are
# private Cloudinary assets and must never be exposed by an unauthenticated
# static-file mount.
import os as _os
if _os.getenv("ENV", "local") != "production" and _os.path.isdir("uploads"):
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# --- Routers ---
app.include_router(router)
app.include_router(conversation_flow_router)
app.include_router(transcription.router)
app.include_router(voice_routes.router)

from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
def validation_exception_handler(request, exc):
    config.LAST_422_ERROR = {"errors": exc.errors(), "path": request.url.path}
    print(f"Validation error on {request.url.path}: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(exc.errors())})

# ---------------------------------------------------------------------------
# Health / root
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"status": "ok", "service": "HireIQ Backend"}


@app.get("/health")
def health():
    return {"status": "healthy"}
