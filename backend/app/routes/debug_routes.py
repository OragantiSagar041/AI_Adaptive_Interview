from fastapi import APIRouter, Depends
from app.core.config import LAST_422_ERROR
from app.services.services import get_current_admin_details

router = APIRouter()

@router.get("/admin/last-error")
def get_last_error(current_admin: dict = Depends(get_current_admin_details)):
    return LAST_422_ERROR or {"status": "no errors"}
