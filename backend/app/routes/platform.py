from fastapi import APIRouter, File, UploadFile, Depends, HTTPException
from app.db.database import platform_settings_collection
from app.routes.auth import get_current_admin_details
import cloudinary
import cloudinary.uploader

router = APIRouter()

@router.get("/settings")
def get_platform_settings():
    settings = platform_settings_collection.find_one({"_id": "global_settings"})
    if not settings:
        return {
            "hireiq_logo_url": "https://raw.githubusercontent.com/OragantiSagar041/AI_Adaptive_Interview/pavan/Front-end/public/hireiq_new_logo.png"
        }
    return {
        "hireiq_logo_url": settings.get("hireiq_logo_url", "https://raw.githubusercontent.com/OragantiSagar041/AI_Adaptive_Interview/pavan/Front-end/public/hireiq_new_logo.png")
    }

@router.post("/upload-logo")
def upload_platform_logo(
    file: UploadFile = File(...),
    current_admin: dict = Depends(get_current_admin_details)
):
    if current_admin.get("role") != "master":
        raise HTTPException(status_code=403, detail="Only Master can upload platform logo")
        
    try:
        upload_result = cloudinary.uploader.upload(
            file.file,
            folder="platform_assets",
            resource_type="image"
        )
        secure_url = upload_result.get("secure_url")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cloudinary upload failed: {str(e)}")
        
    platform_settings_collection.update_one(
        {"_id": "global_settings"},
        {"$set": {"hireiq_logo_url": secure_url}},
        upsert=True
    )
    
    return {
        "status": "success",
        "hireiq_logo_url": secure_url
    }
