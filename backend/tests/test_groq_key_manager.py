"""
tests/test_groq_key_manager.py
Unit tests for the GroqKeyManager — tests the fix for the production 503 bug.
Validates: transient failure tolerance, auto-recovery, reload, round-robin.
"""

import os
import sys
import pytest
from pathlib import Path
from dotenv import load_dotenv

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load keys from backend/.env so tests work without hardcoding secrets
_env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=_env_path, override=False)

# Read the real keys from env (populated by .env above)
_REAL_KEYS = os.getenv("GROQ_API_KEYS") or os.getenv("GROQ_API_KEY") or ""


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def make_manager(monkeypatch, keys: str):
    """Create a fresh GroqKeyManager with the given comma-separated keys."""
    # Must patch BEFORE importing so the singleton picks up the value
    monkeypatch.setenv("GROQ_API_KEYS", keys)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    # Force a fresh import so __init__ re-runs
    import importlib
    import app.ai.groq_manager as mod
    importlib.reload(mod)
    return mod.GroqKeyManager()


# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Keys load correctly from env
# ─────────────────────────────────────────────────────────────────────────────

def test_keys_load_from_env(monkeypatch):
    """Keys should be detected from GROQ_API_KEYS (loaded from .env)."""
    if not _REAL_KEYS:
        pytest.skip("GROQ_API_KEYS not found in .env or environment — skipping")
    # Use the real key count from .env — no hardcoding
    mgr = make_manager(monkeypatch, _REAL_KEYS)
    assert mgr.get_total_keys() > 0, "Should load at least 1 key from GROQ_API_KEYS in .env"


# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Round-robin rotation
# ─────────────────────────────────────────────────────────────────────────────

def test_round_robin_rotation(monkeypatch):
    """get_next_key() should cycle through keys in order."""
    mgr = make_manager(monkeypatch, "key_A,key_B,key_C")
    results = [mgr.get_next_key() for _ in range(6)]
    assert results == ["key_A", "key_B", "key_C", "key_A", "key_B", "key_C"]


# ─────────────────────────────────────────────────────────────────────────────
# Test 3 (BUG FIX): Single auth failure should NOT blacklist a key
# ─────────────────────────────────────────────────────────────────────────────

def test_single_failure_does_not_blacklist(monkeypatch):
    """
    A single AuthenticationError should NOT permanently remove a key.
    This was the primary root cause of the production 503 bug.
    """
    mgr = make_manager(monkeypatch, "key_A,key_B,key_C")
    assert mgr.get_total_keys() == 3

    mgr.mark_invalid("key_A")  # first failure — should NOT blacklist

    assert mgr.get_total_keys() == 3, (
        "BUG: key_A was removed after just ONE failure. "
        "This is what caused the production 503 error."
    )
    assert "key_A" in mgr.get_next_key() or mgr.get_total_keys() == 3


# ─────────────────────────────────────────────────────────────────────────────
# Test 4 (BUG FIX): Two consecutive failures should blacklist the key
# ─────────────────────────────────────────────────────────────────────────────

def test_two_consecutive_failures_blacklists(monkeypatch):
    """After 2 consecutive auth errors a key should be blacklisted."""
    mgr = make_manager(monkeypatch, "key_A,key_B,key_C")
    mgr.mark_invalid("key_A")
    mgr.mark_invalid("key_A")  # second consecutive failure → blacklist

    assert mgr.get_total_keys() == 2, "key_A should be blacklisted after 2 failures"
    assert "key_A" not in mgr.keys


# ─────────────────────────────────────────────────────────────────────────────
# Test 5 (BUG FIX): Auto-recovery when ALL keys are blacklisted
# ─────────────────────────────────────────────────────────────────────────────

def test_auto_recovery_when_all_keys_blacklisted(monkeypatch):
    """
    When all keys are blacklisted, the manager should auto-reload from env
    instead of permanently returning "" (causing endless 503).
    """
    mgr = make_manager(monkeypatch, "key_A,key_B")

    # Blacklist all keys by applying 2 failures each
    for key in ["key_A", "key_B"]:
        mgr.mark_invalid(key)
        mgr.mark_invalid(key)

    # After auto-recovery, keys should be available again
    assert mgr.get_total_keys() > 0, (
        "BUG: All keys are blacklisted with no recovery. "
        "This causes endless 503 errors in production."
    )
    assert mgr.get_next_key() != "", "get_next_key() should return a valid key after recovery"


# ─────────────────────────────────────────────────────────────────────────────
# Test 6: reload_keys() works explicitly
# ─────────────────────────────────────────────────────────────────────────────

def test_reload_keys_clears_blacklist(monkeypatch):
    """reload_keys() should clear the blacklist and restore all keys."""
    mgr = make_manager(monkeypatch, "key_A,key_B,key_C")

    mgr.mark_invalid("key_A")
    mgr.mark_invalid("key_A")  # blacklisted
    assert mgr.get_total_keys() == 2

    mgr.reload_keys()
    assert mgr.get_total_keys() == 3, "reload_keys() should clear blacklist"


# ─────────────────────────────────────────────────────────────────────────────
# Test 7: Empty env var → no keys, no crash
# ─────────────────────────────────────────────────────────────────────────────

def test_no_keys_configured(monkeypatch):
    """When no keys are configured, get_next_key() should return '' without crashing."""
    monkeypatch.delenv("GROQ_API_KEYS", raising=False)
    monkeypatch.delenv("GROQ_API_KEY", raising=False)

    import importlib
    import app.ai.groq_manager as mod
    importlib.reload(mod)
    mgr = mod.GroqKeyManager()

    assert mgr.get_total_keys() == 0
    assert mgr.get_next_key() == ""  # should not raise


# ─────────────────────────────────────────────────────────────────────────────
# Test 8: GROQ_API_KEY single key fallback
# ─────────────────────────────────────────────────────────────────────────────

def test_single_key_fallback(monkeypatch):
    """Should fall back to GROQ_API_KEY if GROQ_API_KEYS not set."""
    monkeypatch.delenv("GROQ_API_KEYS", raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "single_key_here")

    import importlib
    import app.ai.groq_manager as mod
    importlib.reload(mod)
    mgr = mod.GroqKeyManager()

    assert mgr.get_total_keys() == 1
    assert mgr.get_next_key() == "single_key_here"
