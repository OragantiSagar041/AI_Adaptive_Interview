import json
import os
import redis
from typing import Optional, Dict, Any

_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
SESSION_TTL = 3600  # 1 hour

_fallback_store = {}
_use_fallback = False

try:
    _redis = redis.Redis.from_url(_redis_url, decode_responses=True)
    _redis.ping()
except redis.exceptions.ConnectionError:
    print("WARNING: Redis not found! Falling back to in-memory session store (Not scalable, dev only)")
    _use_fallback = True

def get_session(interview_id: str) -> Optional[Dict[str, Any]]:
    if _use_fallback:
        return _fallback_store.get(interview_id)
    raw = _redis.get(f"session:{interview_id}")
    return json.loads(raw) if raw else None

def set_session(interview_id: str, data: Dict[str, Any]) -> None:
    if _use_fallback:
        _fallback_store[interview_id] = data
    else:
        _redis.setex(f"session:{interview_id}", SESSION_TTL, json.dumps(data))

def delete_session(interview_id: str) -> None:
    if _use_fallback:
        _fallback_store.pop(interview_id, None)
    else:
        _redis.delete(f"session:{interview_id}")
