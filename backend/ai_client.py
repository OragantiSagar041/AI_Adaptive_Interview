"""
ai_client.py — Unified AI completion layer with automatic fallback.

Strategy:
    1. PRIMARY:  OpenRouter  (GPT-4o-mini / Gemini Flash via paid key)
    2. FALLBACK: HuggingFace Inference API (free — Mistral-7B-Instruct-v0.3)

The module exposes ONE function:
    chat_completion(messages, model, temperature, timeout) -> str

It returns the raw assistant text. Callers do their own JSON parsing.

Quota-exhaustion detection:
    - HTTP 402 (Payment Required)  → switch to HuggingFace
    - HTTP 429 (Rate Limited)      → switch to HuggingFace
    - Any OpenAI client exception containing "402" or "429" or "quota"
    
Once a quota error is detected, ALL subsequent calls go to HuggingFace
for a configurable cool-down window (default 30 minutes) before retrying
OpenRouter again.
"""

import os
import time
import json
import threading
import requests as http_requests
from typing import List, Dict, Optional
from dotenv import load_dotenv

load_dotenv()

# ─── Configuration ───────────────────────────────────────────────────────────

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
HF_API_KEY = os.getenv("HF_API_KEY", "")  # Optional — HF free tier works without key but with rate limits

# HuggingFace model choices (in priority order — first available wins)
HF_MODELS = [
    "mistralai/Mistral-7B-Instruct-v0.3",
    "mistralai/Mistral-7B-Instruct-v0.2",
    "google/gemma-2-2b-it",
    "microsoft/Phi-3-mini-4k-instruct",
]

HF_INFERENCE_URL = "https://api-inference.huggingface.co/models/{model}/v1/chat/completions"

# OpenRouter → HuggingFace model mapping for best results
OPENROUTER_TO_HF = {
    "openai/gpt-4o-mini": HF_MODELS[0],
    "google/gemini-2.0-flash-001": HF_MODELS[0],
}

# Cool-down: after quota error, skip OpenRouter for this many seconds
QUOTA_COOLDOWN_SECONDS = int(os.getenv("QUOTA_COOLDOWN_SECONDS", "1800"))  # 30 min default

# ─── State ────────────────────────────────────────────────────────────────────

_lock = threading.Lock()
_quota_hit_at: float = 0.0          # timestamp when quota error was last seen
_active_hf_model: str = HF_MODELS[0]  # which HF model is currently working
_provider_override: Optional[str] = None  # Force a provider: "openrouter" | "huggingface" | None


def _is_in_cooldown() -> bool:
    """Check if we are in the quota cool-down window."""
    if _quota_hit_at == 0.0:
        return False
    return (time.time() - _quota_hit_at) < QUOTA_COOLDOWN_SECONDS


def _mark_quota_exhausted():
    """Record that OpenRouter quota was exhausted."""
    global _quota_hit_at
    with _lock:
        _quota_hit_at = time.time()
    print(f"⚠️  OpenRouter quota exhausted — switching to HuggingFace for {QUOTA_COOLDOWN_SECONDS}s")


def _is_quota_error(exc: Exception) -> bool:
    """Detect if an exception signals quota/rate-limit exhaustion."""
    msg = str(exc).lower()
    return any(kw in msg for kw in ["402", "429", "quota", "rate limit", "billing", "insufficient"])


# ─── OpenRouter Call ──────────────────────────────────────────────────────────

def _call_openrouter(
    messages: List[Dict[str, str]],
    model: str = "openai/gpt-4o-mini",
    temperature: float = 0.1,
    timeout: int = 45,
) -> str:
    """Call OpenRouter using the OpenAI-compatible endpoint via requests."""
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://ai-adaptive-interview.vercel.app",
        "X-Title": "AI Interview Platform",
    }
    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
    }
    resp = http_requests.post(url, headers=headers, json=payload, timeout=timeout)

    if resp.status_code in (402, 429):
        _mark_quota_exhausted()
        raise QuotaExhaustedError(f"OpenRouter returned {resp.status_code}: {resp.text[:200]}")

    if resp.status_code != 200:
        raise RuntimeError(f"OpenRouter error {resp.status_code}: {resp.text[:300]}")

    data = resp.json()
    return data["choices"][0]["message"]["content"]


# ─── HuggingFace Call ─────────────────────────────────────────────────────────

def _call_huggingface(
    messages: List[Dict[str, str]],
    model: str = "",
    temperature: float = 0.1,
    timeout: int = 120,
) -> str:
    """Call HuggingFace Inference API (free tier)."""
    global _active_hf_model
    hf_model = model or _active_hf_model

    url = HF_INFERENCE_URL.format(model=hf_model)
    headers = {"Content-Type": "application/json"}
    if HF_API_KEY:
        headers["Authorization"] = f"Bearer {HF_API_KEY}"

    payload = {
        "model": hf_model,
        "messages": messages,
        "temperature": max(temperature, 0.01),  # HF doesn't accept 0
        "max_tokens": 2048,
        "stream": False,
    }

    resp = http_requests.post(url, headers=headers, json=payload, timeout=timeout)

    if resp.status_code == 200:
        data = resp.json()
        # Standard OpenAI-compatible response
        if "choices" in data:
            return data["choices"][0]["message"]["content"]
        # Legacy HF format
        if isinstance(data, list) and len(data) > 0:
            return data[0].get("generated_text", "")
        return json.dumps(data)

    # If this model failed, try the next one in the list
    current_idx = HF_MODELS.index(hf_model) if hf_model in HF_MODELS else -1
    if current_idx < len(HF_MODELS) - 1:
        next_model = HF_MODELS[current_idx + 1]
        print(f"⚠️  HF model {hf_model} failed ({resp.status_code}), trying {next_model}...")
        _active_hf_model = next_model
        return _call_huggingface(messages, next_model, temperature, timeout)

    raise RuntimeError(f"All HuggingFace models failed. Last error {resp.status_code}: {resp.text[:300]}")


# ─── Custom Exception ────────────────────────────────────────────────────────

class QuotaExhaustedError(Exception):
    """Raised when OpenRouter quota is exhausted."""
    pass


# ─── Public API ───────────────────────────────────────────────────────────────

def chat_completion(
    messages: List[Dict[str, str]],
    model: str = "openai/gpt-4o-mini",
    temperature: float = 0.1,
    timeout: int = 45,
) -> str:
    """
    Send a chat completion request with automatic fallback.
    
    1. If OpenRouter is available and not in cool-down → use OpenRouter
    2. If quota exhausted or OpenRouter fails → fall back to HuggingFace
    
    Returns: raw assistant message text (caller parses JSON as needed)
    """
    # Determine the HF equivalent for fallback
    hf_model = OPENROUTER_TO_HF.get(model, _active_hf_model)

    # ── Check if we should skip OpenRouter entirely ──
    if _is_in_cooldown() or not OPENROUTER_API_KEY:
        provider = "huggingface"
    else:
        provider = "openrouter"

    # Allow env-var override for testing
    if _provider_override:
        provider = _provider_override

    # ── Try primary provider ──
    if provider == "openrouter":
        try:
            return _call_openrouter(messages, model, temperature, timeout)
        except QuotaExhaustedError:
            print("🔄 Falling back to HuggingFace (quota exhausted)...")
        except Exception as exc:
            if _is_quota_error(exc):
                _mark_quota_exhausted()
                print("🔄 Falling back to HuggingFace (quota error in exception)...")
            else:
                # Non-quota error — still try HF as safety net
                print(f"⚠️  OpenRouter error: {exc} — trying HuggingFace fallback...")

    # ── Fallback to HuggingFace ──
    try:
        return _call_huggingface(messages, hf_model, temperature, max(timeout, 120))
    except Exception as hf_exc:
        raise RuntimeError(
            f"Both OpenRouter and HuggingFace failed.\n"
            f"HuggingFace error: {hf_exc}"
        )


def chat_completion_safe(
    messages: List[Dict[str, str]],
    model: str = "openai/gpt-4o-mini",
    temperature: float = 0.1,
    timeout: int = 45,
    fallback_text: str = '{"error": "AI service unavailable"}',
) -> str:
    """
    Like chat_completion() but never raises — returns fallback_text on any error.
    Useful for non-critical paths.
    """
    try:
        return chat_completion(messages, model, temperature, timeout)
    except Exception as exc:
        print(f"⚠️  chat_completion_safe caught: {exc}")
        return fallback_text


def get_active_provider() -> str:
    """Return which provider is currently being used."""
    if _is_in_cooldown() or not OPENROUTER_API_KEY:
        return "huggingface"
    return "openrouter"


def get_status() -> Dict:
    """Return current AI client status for debugging."""
    return {
        "active_provider": get_active_provider(),
        "openrouter_key_set": bool(OPENROUTER_API_KEY),
        "hf_key_set": bool(HF_API_KEY),
        "active_hf_model": _active_hf_model,
        "in_cooldown": _is_in_cooldown(),
        "cooldown_remaining_s": max(0, QUOTA_COOLDOWN_SECONDS - (time.time() - _quota_hit_at)) if _quota_hit_at else 0,
    }


# ─── Helper for JSON extraction (used by callers) ────────────────────────────

def extract_json(text: str) -> Optional[Dict]:
    """Extract the first JSON object from a text string."""
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end <= start:
            return None
        return json.loads(text[start:end])
    except (json.JSONDecodeError, ValueError):
        return None


print(f"✅ ai_client.py loaded — Provider: {get_active_provider()}, HF model: {_active_hf_model}")
