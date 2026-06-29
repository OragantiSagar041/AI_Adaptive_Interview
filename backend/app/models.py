import sys
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

from typing import Any, Dict, List, Optional
from pydantic import BaseModel


# ---------------------------------------------------------------------------
# Pydantic request / response models
# ---------------------------------------------------------------------------

class NextQuestionRequest(BaseModel):
    interview_id: str
    current_question_id: int
    answer_text: str

class ViolationRequest(BaseModel):
    type: str
    count: int
    timestamp: str

class AdminLogin(BaseModel):
    username: str
    password: str

class SubAdminCreate(BaseModel):
    username: str
    password: str
    email: str
    name: str
    credits: int = 0

class CreditRequestCreate(BaseModel):
    amount: int
    reason: Optional[str] = None

class CreditRequestUpdate(BaseModel):
    status: str  # 'approved' or 'rejected'

class TenantCreate(BaseModel):
    company_name: str
    username: str
    password: str
    email: str
    subscription_plan: str  # "trial", "basic", "advance"
    credits: int = 10  # Default initial credits

class TenantUpdate(BaseModel):
    subscription_plan: str
    add_days: int = 0
    add_credits: int = 0

class HRScreening(BaseModel):
    work_mode: str = ""
    location: str = ""
    ask_bond: bool = False

class CreateSession(BaseModel):
    candidate_name: str
    candidate_email: str
    resume_text: str
    job_description: str
    admin_id: str
    interview_duration: int = 30  # minutes
    record_video: bool = True
    interview_format: str = "Standard"  # "Standard" or "Voice"
    interview_type: str = "Technical"
    industry: str = "General"
    language: str = "English"
    custom_email_html: str = ""
    scheduled_start: str = ""
    scheduled_end: str = ""
    hr_screening: HRScreening = HRScreening()
    custom_questions: str = ""
    ai_instructions: str = ""
    case_study_count: int = 0

class ForgotPasswordRequest(BaseModel):
    username: str
    email: str

class VerifyOTPRequest(BaseModel):
    username: str
    otp: str

class ResetPasswordRequest(BaseModel):
    username: str
    otp: str
    new_password: str

class UpdateProfileRequest(BaseModel):
    admin_id: str
    email: Optional[str] = None
    username: Optional[str] = None
    company_name: Optional[str] = None
    old_password: Optional[str] = None
    new_password: Optional[str] = None

class EmailPreviewRequest(BaseModel):
    candidate_name: str
    candidate_email: str
    job_description: str
    duration: int = 30
    scheduled_start: str = ""
    scheduled_end: str = ""
