from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Optional, Dict, Any, Union
from app.schemas.models import *
from app.services.live_monitoring_security import validate_snapshot_dataurl

MAX_SNAPSHOT_BYTES = 250_000


class RazorpayOrderRequest(BaseModel):
    plan_name: str
    signup_form: Optional[Dict[str, Any]] = None
    amount_inr: Optional[float] = None
    credits: Optional[int] = None


# Startup functions (to be called by main.py lifespan)
class ChatRequest(BaseModel):
    message: str
class AnswerRequest(BaseModel):
    interview_id: str
    candidate_name: str
    question_id: int
    question_text: str
    answer_text: str
    


class BehavioralData(BaseModel):
    interview_id: str
    question_id: str
    wpm: float = 0
    pause_count: int = 0
    filler_count: int = 0
    time_spent_seconds: int = 0
    keyword_match_pct: float = 0
    tab_switches: int = 0
    face_alerts: int = 0
    noise_alerts: int = 0

class CodingRoundStartRequest(BaseModel):
    interview_id: str

class CodingRoundCheckpointRequest(BaseModel):
    interview_id: str
    code: str = ""
    explanation: str = ""
    language: str = "python"


class CodingRoundSubmitRequest(CodingRoundCheckpointRequest):
    pass


class CodingRoundRunRequest(CodingRoundCheckpointRequest):
    pass


class CodingRoundObserveRequest(CodingRoundCheckpointRequest):
    pass


class CaseStudyStartRequest(BaseModel):
    interview_id: str

class CaseStudyAnswerRequest(BaseModel):
    interview_id: str
    question_index: int
    answer_text: str

class InterviewAlert(BaseModel):
    type: str
    message: str

class AgentFlowItem(BaseModel):
    context_title: str
    context_body: str
    is_enabled: bool = True
    title: Optional[str] = None
    instruction: Optional[str] = None
    body: Optional[str] = None

    @root_validator(pre=True)
    def normalize_legacy_fields(cls, values):
        if values.get('context_title') is None and values.get('title') is not None:
            values['context_title'] = values.get('title')
        if values.get('context_body') is None:
            if values.get('instruction') is not None:
                values['context_body'] = values.get('instruction')
            elif values.get('body') is not None:
                values['context_body'] = values.get('body')
        if values.get('is_enabled') is None:
            values['is_enabled'] = values.get('enabled', True)
        return values

class UpdateAgentFlowRequest(BaseModel):
    flow: List[AgentFlowItem]


class AnalyzeRequest(BaseModel):
    interview_id: Optional[str] = None
    question_id: Optional[int] = None
    question: str
    answer: str

class DecisionRequest(BaseModel):
    link_id: str
    decision: str # 'selected' or 'rejected'
    admin_id: Optional[str] = None

class RecordingUploadFailure(BaseModel):
    interview_id: str
    link_id: Optional[str] = None


class BulkCandidate(BaseModel):
    candidate_name: str
    candidate_email: str
    resume_text: str = ""
    record_video: bool = True  # Task 5: Per-candidate video toggle
    experience: str = ""
    location: str = ""
    current_ctc: str = ""
    expected_ctc: str = ""
    current_company: str = ""
    notice_period: str = ""
    candidate_phone: Optional[str] = ""

    @validator('candidate_name')
    def name_must_not_be_numeric(cls, v):
        if v.strip().isdigit():
            raise ValueError("Candidate Name cannot be purely numeric")
        return v

class BulkCreateSession(BaseModel):
    candidates: List[BulkCandidate]
    job_description: str
    admin_id: str
    interview_duration: int = 30
    record_video: bool = True  # Global default
    interview_format: str = "Standard"  # "Standard" or "Voice"
    interview_type: str = "Technical"
    industry_type: str = "General"
    language: str = "English"
    case_study_count: int = 3
    custom_email_html: str = ""  # Task 1: Optional admin-edited email
    jd_file_url: Optional[str] = None
    scheduled_start: str = ""  # Task 4
    scheduled_end: str = ""    # Task 4
    hr_screening: HRScreening = HRScreening()  # HR screening preferences
    custom_questions: Union[str, List[str]] = ""
    ai_instructions: Union[str, List[str]] = ""
    voice_clone: bool = False
    custom_voice_id: str = ""

    @validator('scheduled_end')
    def validate_dates(cls, v, values):
        start = values.get('scheduled_start')
        if start and v:
            try:
                # Basic ISO format validation check (will be parsed fully in logic)
                start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                end_dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
                if start_dt >= end_dt:
                    raise ValueError("scheduled_end must be after scheduled_start")
            except ValueError as e:
                if "scheduled_end must be after" in str(e):
                    raise e
                # Ignore strict ISO parse errors here to allow legacy fallback formats
        return v

class ProctoringViolationRequest(BaseModel):
    interview_id: Optional[str] = ""
    link_id: Optional[str] = ""
    candidate_id: Optional[str] = ""
    violation_type: str
    details: Optional[str] = ""
    timestamp: Optional[str] = ""


class CopilotMessage(BaseModel):
    role: str
    content: str

class CopilotRequest(BaseModel):
    message: str
    history: list[CopilotMessage] = []
    admin_id: Optional[str] = None
    session_id: Optional[str] = None

class CopilotExecuteRequest(BaseModel):
    action: str
    data: dict

class ATSRequest(BaseModel):
    resume_text: str
    jd_text: str

class CandidateFeedbackRequest(BaseModel):
    feedback_text: str

class CompleteSessionRequest(BaseModel):
    warnings: int = 0
    reason: str = "normal"
    total_tab_switches: int = 0
    total_face_alerts: int = 0
    total_noise_alerts: int = 0
    total_fullscreen_exits: int = 0

class LiveHeartbeatRequest(BaseModel):
    link_id: str
    snapshot_dataurl: Optional[str] = None   # base64 PNG from candidate's camera canvas
    audio_level: Optional[float] = None       # 0–100 RMS amplitude
    internet_kbps: Optional[float] = None     # measured download speed in kbps
    current_question: Optional[int] = None
    total_questions: Optional[int] = None
    elapsed_seconds: Optional[int] = None
    video_fps: Optional[float] = None
    tab_active: Optional[bool] = True
    face_visible: Optional[bool] = None
    proctoring_alerts: int = 0
    alert_types: Optional[List[str]] = None
    last_alert_type: Optional[str] = None
    face_count: int = 0
    multi_face: bool = False
    phone_detected: bool = False
    eye_contact_lost: bool = False
    round_type: Optional[str] = None

    @validator("link_id")
    def validate_link_id(cls, value):
        if not 8 <= len(value) <= 128:
            raise ValueError("Invalid session link identifier")
        return value

    @validator("snapshot_dataurl")
    def validate_snapshot_field(cls, value):
        if value is None:
            return value
        return validate_snapshot_dataurl(value, MAX_SNAPSHOT_BYTES)

    @validator("audio_level")
    def validate_audio_level(cls, value):
        if value is not None and not 0 <= value <= 100:
            raise ValueError("Audio level must be between 0 and 100")
        return value

    @validator("alert_types")
    def validate_alert_types(cls, value):
        if value is not None and (len(value) > 25 or any(len(str(item)) > 64 for item in value)):
            raise ValueError("Too many or invalid alert types")
        return value

    @validator("round_type")
    def validate_round_type(cls, value):
        if value is None:
            return value
        normalized = value.strip().lower()
        if normalized not in {"verbal", "coding", "case_study"}:
            raise ValueError("Invalid interview round type")
        return normalized


class FirebaseAuthRequest(BaseModel):
    email: str
    name: str = ""

class PlanUpdate(BaseModel):
    plan_name: str
    credits_granted: int = 250
    price: int = 0
    features: list = []

class AdminRegister(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""
    company_name: str = ""
    plan: str = "Free Trial"

class StripeCheckoutRequest(BaseModel):
    plan_name: str
    signup_form: dict

class RazorpayOrderRequest(BaseModel):
    plan_name: str
    signup_form: Optional[Dict[str, Any]] = None
    amount_inr: Optional[float] = None
    credits: Optional[int] = None

class RazorpayVerifyRequest(BaseModel):
    plan_name: str
    signup_form: dict
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

class RazorpayUpgradeOrderRequest(BaseModel):
    plan_name: str
    admin_id: str

class RazorpayUpgradeVerifyRequest(BaseModel):
    plan_name: str
    admin_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str




class ExportExcelRequest(BaseModel):
    candidates: List[Dict[str, Any]]

class BulkDeleteRequest(BaseModel):
    ids: List[str]

class UpdateCreditRequestSchema(BaseModel):
    status: str

class SuperAdminPlanUpdate(BaseModel):
    subscription_plan: str

class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: str = Field("nova", max_length=100)
    language: str = Field("English", max_length=100)
    voice_id: Optional[str] = Field(None, max_length=200)
    use_custom_voice: bool = True    # Flag to determine if Cartesia should be used

class ManualAICallRequest(BaseModel):
    phone_number: str
    candidate_name: Optional[str] = "Candidate"
    job_description: Optional[str] = ""
    resume_text: Optional[str] = ""
    duration: Optional[int] = 30
    skills: Optional[str] = ""

# (duplicate removed — see /api/calls/agent-settings below)

class CalendlyIntegrationRequest(BaseModel):
    name: str
    cal_api_key: str
    cal_id: str
    cal_timezone: str
    description: Optional[str] = ""

class IntegrationJsonRequest(BaseModel):
    integration: dict

class CustomApiIntegrationRequest(BaseModel):
    name: str
    url: str
    method: str
    description: Optional[str] = ""
    headers: Optional[dict] = None
    body_type: Optional[str] = None
    body_content: Optional[dict] = None
    body_params: Optional[dict] = None
    query_params: Optional[dict] = None
    stop_listening: Optional[bool] = False
    request_timeout: Optional[int] = 10

class DetachIntegrationRequest(BaseModel):
    integration_id: int

class CallConfigRequestModel(BaseModel):
    silence_timeout: Optional[int] = None
    speech_speed: Optional[float] = None
    max_call_duration_in_sec: Optional[int] = None
    is_end_call_enabled: Optional[bool] = None
    end_call_condition: Optional[str] = None
    end_call_message: Optional[str] = None
    voicemail_enabled: Optional[bool] = None
    voicemail_message: Optional[str] = None
    background_noise_enabled: Optional[bool] = None
    background_noice_name: Optional[str] = None
    background_audio_volume: Optional[float] = None
    initial_ringing_sound_enabled: Optional[bool] = None
    is_transfer_enabled: Optional[bool] = None
    first_ideal_message: Optional[str] = None
    second_ideal_message: Optional[str] = None
    last_ideal_message: Optional[str] = None
    user_idle_threshold_sec: Optional[int] = None
    min_speech_duration_ms: Optional[int] = None

class CodingChatRequest(BaseModel):
    interview_id: str
    transcript: str
    code: str
    run_result: Optional[Dict[str, Any]] = None

class StartAICallRequest(BaseModel):
    phone_number: str

class SecurityPoliciesUpdate(BaseModel):
    require_2fa: bool
    strict_session_timeout: bool
    restrict_ip: bool

class RecruiterUpdate(BaseModel):
    name: str
    email: str
    role: str

class RecruiterMessage(BaseModel):
    subject: str
    body: str

