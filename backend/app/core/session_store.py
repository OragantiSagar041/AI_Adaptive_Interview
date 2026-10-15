import json
import os
import ssl
import redis
from typing import Optional, Dict, Any

_redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
SESSION_TTL = 3600  # 1 hour

_fallback_store: Dict[str, Any] = {}
_use_fallback = False
_redis = None

try:
    kwargs = {
        "decode_responses": True,
        "socket_connect_timeout": 2.0,
        "socket_timeout": 2.0,
        "protocol": 2,
    }
    if _redis_url.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = ssl.CERT_NONE

    _client = redis.Redis.from_url(_redis_url, **kwargs)
    _client.ping()
    _redis = _client
except Exception as e:
    print(f"WARNING: Redis session store unavailable ({e}) — falling back to in-memory store.")
    _use_fallback = True
    _redis = None

def get_session(interview_id: str) -> Optional[Dict[str, Any]]:
    if _use_fallback or not _redis:
        return _fallback_store.get(interview_id)
    try:
        raw = _redis.get(f"session:{interview_id}")
        return json.loads(raw) if raw else None
    except Exception as e:
        return _fallback_store.get(interview_id)

def set_session(interview_id: str, data: Dict[str, Any]) -> None:
    if _use_fallback or not _redis:
        _fallback_store[interview_id] = data
        return
    try:
        _redis.setex(f"session:{interview_id}", SESSION_TTL, json.dumps(data))
    except Exception as e:
        _fallback_store[interview_id] = data

def delete_session(interview_id: str) -> None:
    if _use_fallback or not _redis:
        _fallback_store.pop(interview_id, None)
        return
    try:
        _redis.delete(f"session:{interview_id}")
    except Exception as e:
        _fallback_store.pop(interview_id, None)
