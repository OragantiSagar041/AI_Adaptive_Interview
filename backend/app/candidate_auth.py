"""Reusable candidate-session authentication for AI/media sub-routers."""

import hmac
from typing import Dict, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import ALGORITHM, JWT_SECRET_KEY
from app.live_monitoring_security import MONITORING_SCOPE
from mongo_db import interview_sessions_collection


candidate_security = HTTPBearer(auto_error=False)


def require_active_candidate(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(candidate_security),
) -> Dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="Candidate session token is required")
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[ALGORITHM],
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired candidate session token") from exc

    link_id = str(payload.get("link_id") or "")
    interview_id = str(payload.get("interview_id") or "")
    if payload.get("scope") != MONITORING_SCOPE or not link_id or not interview_id:
        raise HTTPException(status_code=401, detail="Invalid candidate session token scope")

    session = interview_sessions_collection.find_one(
        {"link_id": link_id},
        {
            "link_id": 1,
            "interview_id": 1,
            "status": 1,
            "is_deactivated": 1,
            "cloned_voice_id": 1,
        },
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.get("is_deactivated") or session.get("status") != "started":
        raise HTTPException(status_code=403, detail="This interview session is not active")
    if not hmac.compare_digest(str(session.get("interview_id") or ""), interview_id):
        raise HTTPException(status_code=403, detail="Candidate token no longer matches this interview")
    return session
