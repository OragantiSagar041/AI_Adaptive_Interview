"""
app/routes.py — Compatibility shim.

This file re-exports all routers from the split domain files so that
app/main.py continues to work with `from app.routes import router`.

The original monolithic routes.py has been split into:
  app/routes_split/<domain>.py

The backup of the original is: app/routes_legacy.py
"""
from fastapi import APIRouter

# Import and merge all domain routers into a single combined router
from app.routes_split.interview        import router as interview_router
from app.routes_split.admin_dashboard  import router as admin_dashboard_router
from app.routes_split.candidates       import router as candidates_router
from app.routes_split.session_complete import router as session_complete_router
from app.routes_split.master           import router as master_router
from app.routes_split.notifications    import router as notifications_router
from app.routes_split.auth             import router as auth_router
from app.routes_split.payments         import router as payments_router
from app.routes_split.master_admins    import router as master_admins_router
from app.routes_split.credits          import router as credits_router
from app.routes_split.ws_dashboard     import router as ws_dashboard_router
from app.routes_split.superadmin       import router as superadmin_router
from app.routes_split.voice_tts        import router as voice_tts_router
from app.routes_split.ai_calls         import router as ai_calls_router
from app.routes_split.coding_chat      import router as coding_chat_router
from app.routes_split.jobs             import router as jobs_router
from app.routes_split.demo             import router as demo_router
from app.routes_split.notes_superadmin2 import router as notes_superadmin2_router

# Re-export startup hooks so main.py can still call them
from app.routes_core import startup_event_cloudinary, startup_event_db_and_email

# Also include the routes_core router itself (contains /api/plans, /admin/last-error etc.)
from app.routes_core import router as core_router

# Also re-export auth helpers so routes_subscription.py can still import them
from app.routes_core import (
    get_current_admin,
    get_current_admin_details,
    require_master_user,
    get_razorpay_credentials,
)

# Combined router — main.py does: app.include_router(router)
router = APIRouter()
router.include_router(core_router)
router.include_router(interview_router)
router.include_router(admin_dashboard_router)
router.include_router(candidates_router)
router.include_router(session_complete_router)
router.include_router(master_router)
router.include_router(notifications_router)
router.include_router(auth_router)
router.include_router(payments_router)
router.include_router(master_admins_router)
router.include_router(credits_router)
router.include_router(ws_dashboard_router)
router.include_router(superadmin_router)
router.include_router(voice_tts_router)
router.include_router(ai_calls_router)
router.include_router(coding_chat_router)
router.include_router(jobs_router)
router.include_router(demo_router)
router.include_router(notes_superadmin2_router)
