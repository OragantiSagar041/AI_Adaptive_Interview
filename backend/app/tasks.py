import os
import logging
import json

from app.celery_app import celery_app
from analyze_answer import analyze_answer
from mongo_db import (
    answers_collection, 
    interviews_collection, 
    interview_sessions_collection,
    admins_collection,
    candidates_collection
)
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit
import requests
from celery.exceptions import MaxRetriesExceededError

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Task: score an interview answer in the background
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="app.tasks.score_answer_task", max_retries=3)
def score_answer_task(
    self,
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
        logger.info(f"Scoring answer for interview {interview_id}, Q{question_id} (Attempt {self.request.retries + 1})")
        ai_result = analyze_answer(
            question_text,
            answer_text,
            context,
            time_spent_seconds=time_spent_seconds,
            time_limit_seconds=time_limit_seconds,
            language=language,
        )

        # Spoken language detection using existing AI/LLM - runs only once per interview
        try:
            session_doc = interview_sessions_collection.find_one(
                {"$or": [{"link_id": interview_id}, {"interview_id": interview_id}]},
                {"detected_accent": 1}
            )
            current_accent = session_doc.get("detected_accent") if session_doc else None
            if not current_accent or current_accent == "Unknown":
                from typed_ai_layer import detect_spoken_language
                detected = detect_spoken_language(answer_text)
                if detected and detected != "Unknown":
                    interview_sessions_collection.update_one(
                        {"$or": [{"link_id": interview_id}, {"interview_id": interview_id}]},
                        {"$set": {"detected_accent": detected}}
                    )
        except Exception as lang_err:
            logger.warning(f"Language detection background update failed: {lang_err}")

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
                    "clarity_score": ai_result.get("clarity_score", 50),
                    "technical_depth_score": ai_result.get("technical_depth_score", 50),
                    "confidence_score": ai_result.get("confidence_score", 50),
                    "ai_feedback": ai_result.get("feedback", "No feedback"),
                    "ai_keywords": keywords_str,
                    "corrected_answer": ai_result.get("corrected_answer", "N/A"),
                    "scoring_status": "complete",
                }
            },
        )
        logger.info(f"Background scoring complete for Q{question_id}: {ai_result.get('overall_score', 0)}/100")

        # Post-scoring checks: Recalculate avg_score (composite) and trigger completion events if ready
        try:
            answers = list(answers_collection.find({"interview_id": interview_id}))
            scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
            verbal_avg = sum(scores) / len(scores) if scores else 0

            # Composite score: blend with coding / case study if present
            try:
                from score_rounds import compute_coding_score, compute_case_study_score, blend_scores
                session_rec = interview_sessions_collection.find_one({"interview_id": interview_id})
                if not session_rec:
                    session_rec = interview_sessions_collection.find_one({"link_id": interview_id})
                
                actual_interview_id = session_rec.get("interview_id") if session_rec else interview_id
                interview_row = interviews_collection.find_one({"id": actual_interview_id})
                
                interview_format = "Standard"
                if session_rec and session_rec.get("interview_format"):
                    interview_format = session_rec["interview_format"]
                elif interview_row and interview_row.get("interview_format"):
                    interview_format = interview_row["interview_format"]
                coding_round_data = (interview_row or {}).get("coding_round") if interview_row else None
                case_study_data   = (interview_row or {}).get("case_study_round") if interview_row else None

                coding_s     = compute_coding_score(coding_round_data, interview_format, language) if coding_round_data else None
                case_study_s = compute_case_study_score(case_study_data, context, language) if case_study_data else None
                avg_score    = blend_scores(verbal_avg, coding_s, case_study_s)
            except Exception as blend_err:
                logger.warning(f"Composite blend error (falling back to verbal): {blend_err}")
                avg_score = verbal_avg

            session = interview_sessions_collection.find_one(
                {"$or": [{"interview_id": interview_id}, {"link_id": interview_id}]}
            )
            if session:
                interview_sessions_collection.update_one(
                    {"_id": session["_id"]},
                    {"$set": {"avg_score": round(avg_score, 1)}}
                )
                from app.routes import sync_session_to_application
                sync_session_to_application(session.get("link_id"))
                
                # If session is completed, check if all answers are now scored
                if session.get("status") == "completed" and not session.get("notification_sent"):
                    all_scored = all(a.get("scoring_status") in ("complete", "failed") for a in answers)
                    if all_scored:
                        # Atomic lock: Flip notification_sent from False/None to True.
                        # Only the worker that successfully performs this swap acquires the lock.
                        from pymongo import ReturnDocument
                        locked_session = interview_sessions_collection.find_one_and_update(
                            {
                                "_id": session["_id"],
                                "status": "completed",
                                "notification_sent": {"$ne": True}
                            },
                            {"$set": {"notification_sent": True}},
                            return_document=ReturnDocument.BEFORE
                        )
                        
                        if locked_session:
                            # Generate Multi-Dimensional Analysis!
                            from analyze_dimensions import analyze_interview_dimensions
                            transcript = [{"Q": a.get("question_text"), "A": a.get("answer_text")} for a in answers]
                            dimensions = analyze_interview_dimensions(transcript, context, language)
                            
                            interview_sessions_collection.update_one(
                                {"_id": session["_id"]},
                                {"$set": {
                                    "multi_dimensional_analysis": dimensions
                                }}
                            )
                            
                            # Append 'IQ' to candidate's custom_id if not present
                            candidate_id = session.get("candidate_id")
                            if candidate_id:
                                try:
                                    from bson import ObjectId
                                    query = {"_id": ObjectId(candidate_id)} if ObjectId.is_valid(candidate_id) else {"custom_id": candidate_id}
                                    cand = candidates_collection.find_one(query)
                                    if cand and cand.get("custom_id") and not cand["custom_id"].endswith("IQ"):
                                        candidates_collection.update_one(
                                            query,
                                            {"$set": {"custom_id": f"{cand['custom_id']}IQ"}}
                                        )
                                except Exception as cand_err:
                                    logger.warning(f"Failed to append IQ to custom_id: {cand_err}")
                                    
                            sync_session_to_application(session.get("link_id"))

                            # Send notification!
                            link_id = session.get("link_id")
                            candidate_name = session.get("candidate_name", "Candidate")
                            candidate_email = session.get("candidate_email", "")
                            admin_id = session.get("created_by", "")
                            admin_email = ""
                            if admin_id:
                                try:
                                    from bson import ObjectId
                                    admin = admins_collection.find_one({"_id": ObjectId(admin_id)})
                                    if admin:
                                        admin_email = admin.get("email", "")
                                except: pass
                            
                            if candidate_email:
                                from app.routes import send_submission_notification
                                send_submission_notification(
                                    candidate_email=candidate_email,
                                    candidate_name=candidate_name,
                                    admin_email=admin_email,
                                    avg_score=avg_score,
                                    total_questions=len(answers)
                                )
                                logger.info(f"Submission notification sent for {candidate_name} from background Celery task")
                            
                            # Trigger generate report task
                            generate_report_task.delay(interview_id=actual_interview_id)
        except Exception as post_err:
            logger.error(f"Error checking session completion in Celery task: {post_err}")

        return {"status": "success", "question_id": question_id, "score": ai_result.get("overall_score", 0)}
    except Exception as e:
        logger.warning(f"Attempt {self.request.retries + 1} failed for Q{question_id} scoring: {e}")
        try:
            # Exponential backoff: 2s, 4s, 8s
            countdown = 2 ** (self.request.retries + 1)
            raise self.retry(exc=e, countdown=countdown)
        except MaxRetriesExceededError:
            logger.error(f"Background scoring permanently failed for Q{question_id} after maximum retries.")
            answers_collection.update_one(
                {"interview_id": interview_id, "question_id": question_id},
                {"$set": {"scoring_status": "failed", "ai_score": 0}},
            )
            raise e


# ---------------------------------------------------------------------------
# Task: send invitation email via Brevo
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="app.tasks.send_email_task", max_retries=3)
def send_email_task(
    self,
    candidate_email: str,
    candidate_name: str,
    link_url: str,
    duration: int,
    job_description: str,
    custom_html: str = "",
    scheduled_start: str = "",
    scheduled_end: str = "",
    jd_file_url: str = None,
):
    logger.info(f"Sending email via Celery to {candidate_email} (Attempt {self.request.retries + 1})")

    # Import here to avoid circular imports at module load time
    from app.services import build_default_interview_email_html

    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
    if not BREVO_API_KEY:
        logger.warning("BREVO_API_KEY not set — skipping email send")
        return {"status": "skipped", "reason": "no_api_key"}

    try:
        html_content = (
            custom_html.strip()
            if custom_html and custom_html.strip()
            else build_default_interview_email_html(
                candidate_name, duration, job_description, link_url, scheduled_start, scheduled_end
            )
        )

        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json",
        }
        payload = {
            "sender": {
                "name": "HireIQ Recruiting",
                "email": os.getenv("BREVO_SENDER_EMAIL", "no-reply@hireiq.co.in"),
            },
            "to": [{"email": candidate_email, "name": candidate_name}],
            "subject": "Invitation to your HireIQ AI Interview",
            "htmlContent": html_content,
        }

        from app.services import should_attach_job_description_pdf, generate_job_description_pdf_base64
        if should_attach_job_description_pdf(job_description):
            payload["attachment"] = [{
                "name": "job_description.pdf",
                "content": generate_job_description_pdf_base64(job_description)
            }]

        response = requests.post(url, json=payload, headers=headers, timeout=10)
        
        # Raise HTTP errors for retry mechanism
        if response.status_code >= 400:
            response.raise_for_status()

        logger.info(f"Email sent successfully to {candidate_email}, status: {response.status_code}")
        return {"status": response.status_code}
    except Exception as e:
        logger.warning(f"Attempt {self.request.retries + 1} failed for email to {candidate_email}: {e}")
        try:
            countdown = 5 * (self.request.retries + 1)  # 5s, 10s, 15s
            raise self.retry(exc=e, countdown=countdown)
        except MaxRetriesExceededError:
            logger.error(f"Email sending permanently failed to {candidate_email} after maximum retries.")
            try:
                interview_sessions_collection.update_one(
                    {"candidate_email": candidate_email},
                    {"$set": {"invite_email_status": "failed"}}
                )
            except Exception as db_err:
                logger.warning(f"Could not update invite_email_status in DB: {db_err}")
            raise e


# ---------------------------------------------------------------------------
# Task: generate PDF interview report
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="app.tasks.generate_report_task", max_retries=3)
def generate_report_task(self, interview_id: str):
    logger.info(f"Generating PDF report for {interview_id} (Attempt {self.request.retries + 1})")

    # Import here to avoid circular imports at module load time
    from app.routes import generate_report

    try:
        file_path = generate_report(interview_id)
        logger.info(f"Report generated successfully: {file_path}")
        return {"status": "success", "file_path": file_path}
    except Exception as e:
        logger.warning(f"Attempt {self.request.retries + 1} failed for report generation for {interview_id}: {e}")
        try:
            countdown = 5 * (self.request.retries + 1)
            raise self.retry(exc=e, countdown=countdown)
        except MaxRetriesExceededError:
            logger.error(f"PDF generation permanently failed for {interview_id} after maximum retries.")
            raise e

# ---------------------------------------------------------------------------
# Task: process bulk emails in background (offloads the loop from FastAPI)
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="app.tasks.process_bulk_emails_task", max_retries=3)
def process_bulk_emails_task(self, jobs: list):
    logger.info(f"Processing {len(jobs)} bulk email jobs in Celery (Attempt {self.request.retries + 1})...")
    # Import here to avoid circular dependencies
    from app.services import queue_or_send_interview_email
    
    failures = []
    for job in jobs:
        try:
            queue_or_send_interview_email(job["doc"], job["link_url"], skip_db_update=True)
        except Exception as email_err:
            logger.error(f"Bulk Email Error for {job['doc'].get('candidate_email')}: {email_err}")
            failures.append(job)
            
    if failures:
        logger.warning(f"Bulk email processing encountered {len(failures)} failures out of {len(jobs)} jobs.")
        try:
            # Retry bulk emails execution only for the failed jobs
            countdown = 10 * (self.request.retries + 1)
            raise self.retry(exc=Exception(f"Failed jobs count: {len(failures)}"), countdown=countdown, kwargs={"jobs": failures})
        except MaxRetriesExceededError as e:
            logger.error("Bulk email processing permanently failed for some jobs after maximum retries.")
            raise e
            
    logger.info(f"Finished processing all {len(jobs)} bulk email jobs.")
    return {"status": "success", "jobs_processed": len(jobs)}
