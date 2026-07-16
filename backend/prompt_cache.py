"""
prompt_cache.py — Lightweight in-memory TTL cache for AI responses.

Prevents identical resume/JD inputs from triggering redundant API calls.
Cache entries expire after TTL_SECONDS (default: 5 minutes).
"""

import hashlib
import time
from typing import Any, Dict, Optional

_cache: Dict[str, Dict[str, Any]] = {}
TTL_SECONDS = int(300)  # 5 minutes


def _hash_key(text: str, operation: str) -> str:
    """Create a deterministic cache key from text content + operation name."""
    raw = f"{operation}::{text.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get(text: str, operation: str) -> Optional[Any]:
    """Return cached result if it exists and has not expired. Otherwise None."""
    key = _hash_key(text, operation)
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["ts"] > TTL_SECONDS:
        del _cache[key]
        return None
    print(f"[prompt_cache] HIT  op={operation} key={key[:12]}...")
    return entry["value"]


def set(text: str, operation: str, value: Any) -> None:
    """Store a result in the cache."""
    key = _hash_key(text, operation)
    _cache[key] = {"value": value, "ts": time.time()}
    print(f"[prompt_cache] SET  op={operation} key={key[:12]}... entries={len(_cache)}")


def clear_expired() -> int:
    """Remove all expired entries. Returns count removed."""
    now = time.time()
    expired = [k for k, v in _cache.items() if now - v["ts"] > TTL_SECONDS]
    for k in expired:
        del _cache[k]
    return len(expired)


def stats() -> Dict[str, Any]:
    """Return cache statistics."""
    now = time.time()
    active = sum(1 for v in _cache.values() if now - v["ts"] <= TTL_SECONDS)
    return {"total_entries": len(_cache), "active_entries": active, "ttl_seconds": TTL_SECONDS}


print("[OK] prompt_cache.py loaded | TTL=300s in-memory cache ready")
