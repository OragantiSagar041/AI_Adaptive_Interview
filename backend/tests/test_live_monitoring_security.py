import base64
from datetime import datetime, timedelta, timezone

import jwt
import pytest

from app.live_monitoring_security import (
    MONITORING_SCOPE,
    admin_can_access_session,
    admin_can_receive_dashboard_event,
    create_monitoring_token,
    decode_monitoring_token,
    validate_snapshot_dataurl,
)


SECRET = "test-only-secret-that-is-at-least-32-bytes"
ALGORITHM = "HS256"


def test_monitoring_token_is_scoped_to_one_link():
    token = create_monitoring_token(SECRET, ALGORITHM, "session-link-123", "int-123", 30)
    payload = decode_monitoring_token(SECRET, ALGORITHM, token, "session-link-123")

    assert payload["scope"] == MONITORING_SCOPE
    assert payload["interview_id"] == "int-123"
    with pytest.raises(ValueError):
        decode_monitoring_token(SECRET, ALGORITHM, token, "different-session")


def test_expired_monitoring_token_is_rejected():
    token = jwt.encode(
        {
            "scope": MONITORING_SCOPE,
            "link_id": "session-link-123",
            "interview_id": "int-123",
            "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
        },
        SECRET,
        algorithm=ALGORITHM,
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_monitoring_token(SECRET, ALGORITHM, token, "session-link-123")


def test_snapshot_validation_accepts_small_image_and_rejects_oversized_image():
    small = "data:image/jpeg;base64," + base64.b64encode(b"small-image").decode("ascii")
    assert validate_snapshot_dataurl(small, max_bytes=100) == small

    oversized = "data:image/jpeg;base64," + base64.b64encode(b"x" * 101).decode("ascii")
    with pytest.raises(ValueError, match="exceeds"):
        validate_snapshot_dataurl(oversized, max_bytes=100)


def test_snapshot_validation_rejects_non_image_payloads():
    payload = "data:text/plain;base64," + base64.b64encode(b"not-an-image").decode("ascii")
    with pytest.raises(ValueError, match="JPEG, PNG, or WebP"):
        validate_snapshot_dataurl(payload, max_bytes=100)


def test_live_session_access_is_tenant_and_role_scoped():
    session = {"company_id": "company-a", "created_by": "admin-a"}

    assert admin_can_access_session({"role": "master"}, session)
    assert admin_can_access_session({"role": "super_admin", "company_id": "company-a"}, session)
    assert not admin_can_access_session({"role": "super_admin", "company_id": "company-b"}, session)
    assert admin_can_access_session(
        {"role": "admin", "company_id": "company-a", "admin_id": "admin-a"},
        session,
    )
    assert not admin_can_access_session(
        {"role": "admin", "company_id": "company-a", "admin_id": "admin-b"},
        session,
    )


def test_dashboard_events_are_filtered_by_company_and_creator():
    event = {"company_id": "company-a", "created_by": "admin-a"}

    assert admin_can_receive_dashboard_event({"role": "master"}, event)
    assert admin_can_receive_dashboard_event({"role": "super_admin", "company_id": "company-a"}, event)
    assert not admin_can_receive_dashboard_event({"role": "super_admin", "company_id": "company-b"}, event)
    assert admin_can_receive_dashboard_event(
        {"role": "admin", "company_id": "company-a", "admin_id": "admin-a"},
        event,
    )
    assert not admin_can_receive_dashboard_event(
        {"role": "admin", "company_id": "company-a", "admin_id": "admin-b"},
        event,
    )
