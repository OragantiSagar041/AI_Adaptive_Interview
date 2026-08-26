from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from app.services.services import get_current_admin_details
from app.core.config import get_omni_dimension_api_key, get_omni_voice_id
from scripts.sync_omni_data import sync_all_omni_data

router = APIRouter()

@router.post("/api/calls/sync-all")
def trigger_omni_sync(
    current_admin: dict = Depends(get_current_admin_details),
    omni_api_key: Optional[str] = Header(default=None, alias="X-Omni-Dimension-API-Key"),
    voice_id: Optional[str] = Header(default=None, alias="X-Omni-Dimension-Voice-ID")
):
    """
    Trigger a full synchronization of all Omni Dimension AI Voice Agent data for the user's account:
    Uses the provided API Key and Voice ID from headers/admin session or environment fallbacks.
    Synchronizes:
    1. Conversation Flow
    2. Assistant Details
    3. Call Configuration
    4. Knowledge Base
    5. Integrations
    6. Post-Call Settings
    7. Recent Calls & Transcripts
    8. Candidate Approvals Mapping
    9. Bulk Dialer Batches
    """
    try:
        effective_key = (omni_api_key or current_admin.get("omni_api_key") or get_omni_dimension_api_key() or "").strip()
        effective_voice = (voice_id or current_admin.get("voice_id") or get_omni_voice_id() or "").strip()

        success, stats = sync_all_omni_data(api_key=effective_key, voice_id=effective_voice)
        if success:
            return {
                "success": True, 
                "message": f"Omni Dimension data for account (Voice ID: {effective_voice or 'default'}) synced successfully to local project!",
                "stats": stats
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to sync Omni Dimension data for this account.")
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Omni Sync Error: {str(e)}"})
