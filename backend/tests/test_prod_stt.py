"""
tests/test_prod_stt.py
Production-level integration test suite for the STT endpoint.
Hits the live production ECS backend directly.

Run with:
    pytest backend/tests/test_prod_stt.py -v -s
"""

import io
import os
import time
import struct
import wave
import pytest
import requests

# Production backend URL
PROD_URL = "https://si-833f8dc5b3744730a6d03e74c2be9486.ecs.us-east-1.on.aws"
LOCAL_URL = "http://127.0.0.1:8000"

# Toggle: True = hit production, False = hit local dev server
USE_PROD = True
BASE = PROD_URL if USE_PROD else LOCAL_URL

SESSION = requests.Session()
SESSION.timeout = 30


def make_silent_wav(duration_seconds=0.1):
    """Generates a minimal valid WAV file with pure silence."""
    sample_rate = 16000
    n_samples = int(sample_rate * duration_seconds)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{n_samples}h", *([0] * n_samples)))
    return buf.getvalue()


def make_speech_wav(duration_seconds=0.5, amplitude=8000):
    """Generates a WAV with a 440 Hz sine wave - passes silence gate."""
    import math
    sample_rate = 16000
    n_samples = int(sample_rate * duration_seconds)
    samples = [int(amplitude * math.sin(2 * math.pi * 440 * i / sample_rate)) for i in range(n_samples)]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{n_samples}h", *samples))
    return buf.getvalue()


class TestProdHealth:
    """Basic connectivity checks."""

    def test_health_endpoint(self):
        """Production /health must return 200 healthy."""
        r = SESSION.get(f"{BASE}/health")
        assert r.status_code == 200, f"Health check failed: {r.status_code} {r.text}"
        assert r.json().get("status") == "healthy"
        print(f"\n[PASS] Health: {r.json()}")

    def test_root_endpoint(self):
        """Production / must return 200 with HireIQ service name."""
        r = SESSION.get(f"{BASE}/")
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert "HireIQ" in data.get("service", "")
        print(f"\n[PASS] Root: {data}")


class TestGroqKeyStatus:
    """
    Tests the new diagnostic endpoints.
    NOTE: These will return 404 until the fix is deployed to production.
    After deployment they should return 401/403 (auth required).
    """

    def test_groq_key_status_requires_auth_or_not_deployed(self):
        """Returns 401/403 (deployed) or 404 (not yet deployed)."""
        r = SESSION.get(f"{BASE}/admin/groq-key-status")
        assert r.status_code in [401, 403, 404], (
            f"Unexpected status {r.status_code}."
        )
        if r.status_code == 404:
            print("\n[INFO] /admin/groq-key-status returned 404 - fix not yet deployed to production.")
        else:
            print(f"\n[PASS] /admin/groq-key-status auth guard: HTTP {r.status_code}")

    def test_groq_reload_keys_requires_auth_or_not_deployed(self):
        """Returns 401/403 (deployed) or 404/405 (not yet deployed)."""
        r = SESSION.post(f"{BASE}/admin/groq-reload-keys")
        assert r.status_code in [401, 403, 404, 405], (
            f"Unexpected status {r.status_code}."
        )
        if r.status_code in [404, 405]:
            print("\n[INFO] /admin/groq-reload-keys returned 404/405 - fix not yet deployed.")
        else:
            print(f"\n[PASS] /admin/groq-reload-keys auth guard: HTTP {r.status_code}")


class TestSttEndpointSecurity:
    """Tests the /stt endpoint auth boundary."""

    def test_stt_requires_candidate_session(self):
        """STT endpoint must reject unauthenticated requests."""
        wav = make_silent_wav()
        r = SESSION.post(
            f"{BASE}/stt",
            files={"file": ("audio.wav", wav, "audio/wav")},
        )
        assert r.status_code in [401, 403, 422], (
            f"Expected auth error, got {r.status_code}: {r.text}"
        )
        print(f"\n[PASS] /stt auth guard: HTTP {r.status_code}")


class TestGroqKeyManagerUnit:
    """Direct unit tests of GroqKeyManager against the local fixed code."""

    def test_keys_are_loaded(self):
        """GroqKeyManager should load keys from env at runtime."""
        # Real keys are read from the GROQ_API_KEYS environment variable.
        # Never hardcode secrets in test files — set them as env vars or CI secrets.
        if not os.getenv("GROQ_API_KEYS") and not os.getenv("GROQ_API_KEY"):
            pytest.skip("GROQ_API_KEYS not set in environment — skipping key count check")
        from app.ai.groq_manager import groq_key_manager
        count = groq_key_manager.get_total_keys()
        assert count > 0, f"No Groq keys loaded! Count={count}"
        print(f"\n[PASS] GroqKeyManager loaded {count} key(s)")

    def test_single_auth_failure_does_not_kill_key(self):
        """Core bug fix: a single AuthenticationError must NOT remove the key."""
        from app.ai.groq_manager import GroqKeyManager
        mgr = GroqKeyManager()
        if mgr.get_total_keys() == 0:
            pytest.skip("No keys in env")

        initial = mgr.get_total_keys()
        first_key = mgr.get_next_key()
        mgr.mark_invalid(first_key)  # single transient 401

        assert mgr.get_total_keys() == initial, (
            "REGRESSION: A single auth failure removed the key permanently. "
            "This was the production 503 root cause."
        )
        print(f"\n[PASS] Single failure did not blacklist. Active: {mgr.get_total_keys()}")

    def test_get_next_key_never_returns_empty_with_valid_env(self):
        """get_next_key() must return a non-empty string when env has valid keys."""
        from app.ai.groq_manager import GroqKeyManager
        mgr = GroqKeyManager()
        if mgr.get_total_keys() == 0:
            pytest.skip("No keys in env")

        key = mgr.get_next_key()
        assert key, "get_next_key() returned empty string even though keys are loaded"
        assert key.startswith("gsk_"), f"Unexpected key format: {key[:10]}..."
        print(f"\n[PASS] get_next_key() returned valid key: {key[:12]}...")

    def test_reload_keys_restores_blacklisted_keys(self):
        """reload_keys() should clear blacklist and restore all keys."""
        from app.ai.groq_manager import GroqKeyManager
        mgr = GroqKeyManager()
        if mgr.get_total_keys() == 0:
            pytest.skip("No keys in env")

        initial_count = mgr.get_total_keys()
        first_key = mgr.get_next_key()

        # Force-blacklist via 2 consecutive failures
        mgr.mark_invalid(first_key)
        mgr.mark_invalid(first_key)

        mgr.reload_keys()
        assert mgr.get_total_keys() == initial_count, (
            f"After reload, expected {initial_count} keys, got {mgr.get_total_keys()}"
        )
        print(f"\n[PASS] reload_keys() restored {mgr.get_total_keys()} key(s)")


class TestProductionSttLatency:
    """Latency and 503-absence test for the live production STT endpoint."""

    def test_stt_does_not_return_503(self):
        """
        STT must NOT return 503.
        Expected: 401/403/422 (auth required) or 200 (silence gate hit).
        A 503 means Groq keys are not being loaded in the running container.
        """
        wav = make_silent_wav(0.5)
        start = time.time()
        try:
            r = SESSION.post(
                f"{BASE}/stt",
                files={"file": ("audio.wav", wav, "audio/wav")},
                timeout=15,
            )
            latency = time.time() - start
            status = r.status_code
        except requests.exceptions.Timeout:
            pytest.fail("STT endpoint timed out after 15 seconds in production")
        except requests.exceptions.ConnectionError as e:
            pytest.fail(f"Could not connect to production backend: {e}")

        print(f"\n[INFO] /stt -> HTTP {status} in {latency:.2f}s")
        assert status != 503, (
            f"Production STT returned 503!\n"
            f"Response: {r.text[:300]}\n\n"
            f"Root cause: Groq keys not loaded in the running ECS container.\n"
            f"Fix: Deploy the updated groq_manager.py to production."
        )
        assert status in [200, 401, 403, 422], (
            f"Unexpected status {status}: {r.text[:300]}"
        )
        print(f"[PASS] /stt returned {status} (not 503) in {latency:.2f}s")
