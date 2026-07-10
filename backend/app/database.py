import os
from dotenv import load_dotenv
from mongo_db import (
    candidates_collection,
    interviews_collection,
    answers_collection,
    admins_collection,
    companies_collection,
    interview_sessions_collection,
    plans_collection,
    credit_requests_collection,
    notifications_collection,
    omni_call_logs_collection,
)

load_dotenv()

__all__ = [
    "candidates_collection",
    "interviews_collection",
    "answers_collection",
    "admins_collection",
    "companies_collection",
    "interview_sessions_collection",
    "plans_collection",
    "credit_requests_collection",
    "notifications_collection",
    "omni_call_logs_collection",
]
