import os
import logging
import json

from app.celery_app import celery_app
from analyze_answer import analyze_answer
from mongo_db import answers_collection, interviews_collection, interview_sessions_collection
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit
import requests

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Task: score an interview answer in the background
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.score_answer_task")
def score_answer_task(
    interview_id: str,
    question_id: int,
    question_text: str,
    answer_text: str,
    context: str,
    time_spent_seconds: int,
    time_limit_seconds: int,
    language: str,
):
    try:
        logger.info(f"Scoring answer for interview {interview_id}, Q{question_id}")
        ai_result = analyze_answer(
            question_text,
            answer_text,
            context,
            time_spent_seconds=time_spent_seconds,
            time_limit_seconds=time_limit_seconds,
            language=language,
        )
        keywords = ai_result.get("keywords", [])
        keywords_str = ",".join(keywords) if isinstance(keywords, list) else str(keywords)

        answers_collection.update_one(
            {"interview_id": interview_id, "question_id": question_id},
            {
                "$set": {
                    "ai_score": ai_result.get("overall_score", 0),
                    "content_score": ai_result.get("content_score", 0),
                    "relevance_score": ai_result.get("relevance_score", 0),
                    "time_score": ai_result.get("time_score", 0),
                    "ai_feedback": ai_result.get("feedback", "No feedback"),
                    "ai_keywords": keywords_str,
                    "corrected_answer": ai_result.get("corrected_answer", "N/A"),
                    "scoring_status": "complete",
                }
            },
        )
        logger.info(f"Background scoring complete for Q{question_id}: {ai_result.get('overall_score', 0)}/100")
        return {"status": "success", "question_id": question_id, "score": ai_result.get("overall_score", 0)}
    except Exception as e:
        logger.error(f"Background scoring failed for Q{question_id}: {e}")
        answers_collection.update_one(
            {"interview_id": interview_id, "question_id": question_id},
            {"$set": {"scoring_status": "failed", "ai_score": 0}},
        )
        return {"status": "failed", "error": str(e)}


# ---------------------------------------------------------------------------
# Task: send invitation email via Brevo
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.send_email_task")
def send_email_task(
    candidate_email: str,
    candidate_name: str,
    link_url: str,
    duration: int,
    job_description: str,
    custom_html: str = "",
    scheduled_start: str = "",
    scheduled_end: str = "",
):
    logger.info(f"Sending email via Celery to {candidate_email}")

    # Import here to avoid circular imports at module load time
    from app.services import build_default_interview_email_html

    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")

    try:
        html_content = (
            custom_html.strip()
            if custom_html and custom_html.strip()
            else build_default_interview_email_html(
                candidate_name, duration, job_description, link_url, scheduled_start, scheduled_end
            )
        )

        if not BREVO_API_KEY:
            logger.warning("BREVO_API_KEY not set — skipping email send")
            return {"status": "skipped", "reason": "no_api_key"}

        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
        }
        payload = {
            "sender": {
                "name": "HireIQ Recruiting",
                "email": os.getenv("BREVO_SENDER_EMAIL", "no-reply@mockinterview.com"),
            },
            "to": [{"email": candidate_email, "name": candidate_name}],
            "subject": "Invitation to your AI Mock Interview",
            "htmlContent": html_content,
        }

        from app.services import should_attach_job_description_pdf, generate_job_description_pdf_base64
        if should_attach_job_description_pdf(job_description):
            payload["attachment"] = [{
                "name": "job_description.pdf",
                "content": generate_job_description_pdf_base64(job_description)
            }]

        response = requests.post(url, json=payload, headers=headers, timeout=10)
        logger.info(f"Email sent status: {response.status_code}")
        return {"status": response.status_code}
    except Exception as e:
        logger.error(f"Email sending failed: {e}")
        return {"status": "failed", "error": str(e)}


# ---------------------------------------------------------------------------
# Task: generate PDF interview report
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.generate_report_task")
def generate_report_task(interview_id: str):
    logger.info(f"Generating PDF report for {interview_id}")

    # Import here to avoid circular imports at module load time
    from app.routes import generate_report

    try:
        file_path = generate_report(interview_id)
        logger.info(f"Report generated successfully: {file_path}")
        return {"status": "success", "file_path": file_path}
    except Exception as e:
        logger.error(f"Failed to generate report: {e}")
        return {"status": "failed", "error": str(e)}

# ---------------------------------------------------------------------------
# Task: process bulk emails in background (offloads the loop from FastAPI)
# ---------------------------------------------------------------------------

@celery_app.task(name="app.tasks.process_bulk_emails_task")
def process_bulk_emails_task(jobs: list):
    logger.info(f"Processing {len(jobs)} bulk email jobs in Celery...")
    # Import here to avoid circular dependencies
    from app.services import queue_or_send_interview_email
    for job in jobs:
        try:
            queue_or_send_interview_email(job["doc"], job["link_url"], skip_db_update=True)
        except Exception as email_err:
            logger.error(f"Bulk Email Error for {job['doc'].get('candidate_email')}: {email_err}")
    logger.info(f"Finished processing {len(jobs)} bulk email jobs.")
    return {"status": "success", "jobs_processed": len(jobs)}
