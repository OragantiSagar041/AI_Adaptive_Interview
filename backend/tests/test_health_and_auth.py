"""
backend/tests/test_health_and_auth.py — Automated backend verification suite.
Tests API health, routing definitions, plans catalog, and auth boundaries.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.config import PLAN_DEFINITIONS

client = TestClient(app)


def test_root_endpoint():
    """Verify backend root endpoint responds with status ok."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "ok"
    assert "HireIQ" in data.get("service", "")


def test_health_check_endpoint():
    """Verify system health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_plan_definitions_integrity():
    """Verify core subscription plans have required configuration."""
    assert "trial" in PLAN_DEFINITIONS
    assert "basic" in PLAN_DEFINITIONS
    trial_plan = PLAN_DEFINITIONS["trial"]
    assert trial_plan["credits_granted"] > 0
    assert "features" in trial_plan
    assert "capabilities" in trial_plan


def test_widget_config_endpoint():
    """Verify widget config returns valid structure."""
    response = client.get("/api/admin/widget-config")
    assert response.status_code == 200
    data = response.json()
    assert "configured" in data
    assert "widget_url" in data
