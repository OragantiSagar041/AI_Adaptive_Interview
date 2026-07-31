import base64
import hmac
from datetime import datetime, timedelta, timezone
from typing import Any, Dict

import jwt


MONITORING_SCOPE = "candidate_monitoring"
ALLOWED_SNAPSHOT_PREFIXES = (
    "data:image/jpeg;base64,",
    "data:image/png;base64,",
    "data:image/webp;base64,",
)


def create_monitoring_token(
    secret: str,
    algorithm: str,
    link_id: str,
    interview_id: str,
    duration_minutes: int,
) -> str:
    ttl_minutes = max(30, min(int(duration_minutes or 30) + 30, 12 * 60))
    return jwt.encode(
        {
            "scope": MONITORING_SCOPE,
            "link_id": link_id,
            "interview_id": interview_id,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes),
        },
        secret,
        algorithm=algorithm,
    )


def decode_monitoring_token(secret: str, algorithm: str, token: str, expected_link_id: str) -> Dict[str, Any]:
    payload = jwt.decode(token, secret, algorithms=[algorithm])
    token_link_id = str(payload.get("link_id") or "")
    if payload.get("scope") != MONITORING_SCOPE or not hmac.compare_digest(token_link_id, expected_link_id):
        raise ValueError("Monitoring token does not match this session")
    return payload


def validate_snapshot_dataurl(value: str, max_bytes: int) -> str:
    if len(value) > max_bytes * 2:
        raise ValueError("Snapshot payload is too large")
    if not value.startswith(ALLOWED_SNAPSHOT_PREFIXES):
        raise ValueError("Snapshot must be a JPEG, PNG, or WebP data URL")
    encoded = value.split(",", 1)[1]
    try:
        decoded_size = len(base64.b64decode(encoded, validate=True))
    except (ValueError, TypeError) as exc:
        raise ValueError("Snapshot contains invalid base64 data") from exc
    if decoded_size > max_bytes:
        raise ValueError(f"Snapshot exceeds the {max_bytes // 1000} KB limit")
    return value


def admin_can_access_session(current_admin: Dict[str, Any], session: Dict[str, Any]) -> bool:
    role = current_admin.get("role")
    if role == "master":
        return True
    if role not in {"admin", "super_admin"}:
        return False

    admin_company_id = str(current_admin.get("company_id") or "")
    session_company_id = str(session.get("company_id") or "")
    if not admin_company_id or not hmac.compare_digest(admin_company_id, session_company_id):
        return False
    if role == "admin":
        return str(session.get("created_by") or "") == str(current_admin.get("admin_id") or "")
    return True


def admin_can_receive_dashboard_event(current_admin: Dict[str, Any], event: Dict[str, Any]) -> bool:
    role = current_admin.get("role")
    if role == "master":
        return True
    if role not in {"admin", "super_admin"}:
        return False
    if str(current_admin.get("company_id") or "") != str(event.get("company_id") or ""):
        return False
    if role == "admin":
        if event.get("type") == "profile_update":
            return str(current_admin.get("admin_id") or "") == str(event.get("admin_id") or "")
        return str(current_admin.get("admin_id") or "") == str(event.get("created_by") or "")
    return True
