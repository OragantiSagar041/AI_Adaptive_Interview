import os
from fastapi import APIRouter, Depends
from app.core.config import LAST_422_ERROR
from app.services.services import get_current_admin_details

router = APIRouter()

@router.get("/admin/last-error")
def get_last_error(current_admin: dict = Depends(get_current_admin_details)):
    return LAST_422_ERROR or {"status": "no errors"}


@router.get("/admin/groq-key-status")
def groq_key_status(current_admin: dict = Depends(get_current_admin_details)):
    """
    Diagnostic endpoint: shows the current state of the Groq key manager.
    Use this to debug STT 503 errors in production without reading logs.
    """
    from app.ai.groq_manager import groq_key_manager
    return {
        "total_loaded_keys": len(groq_key_manager._all_keys),
        "active_keys": groq_key_manager.get_total_keys(),
        "blacklisted_keys": len(groq_key_manager._bad_keys),
        "bad_key_failure_counts": groq_key_manager._bad_key_failure_counts,
        "env_GROQ_API_KEYS_set": bool(os.getenv("GROQ_API_KEYS")),
        "env_GROQ_API_KEY_set": bool(os.getenv("GROQ_API_KEY")),
        "stt_available": groq_key_manager.get_total_keys() > 0,
    }


@router.post("/admin/groq-reload-keys")
def groq_reload_keys(current_admin: dict = Depends(get_current_admin_details)):
    """
    Force-reload Groq API keys from environment variables and clear the blacklist.
    Use this to fix a STT 503 error caused by all keys being blacklisted,
    without needing to restart the server.
    """
    from app.ai.groq_manager import groq_key_manager
    groq_key_manager.reload_keys()
    return {
        "status": "reloaded",
        "active_keys": groq_key_manager.get_total_keys(),
        "stt_available": groq_key_manager.get_total_keys() > 0,
    }

