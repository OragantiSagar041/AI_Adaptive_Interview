import os
import logging
import json

from app.core.celery_app import celery_app
from app.ai.analyze_answer import analyze_answer
from app.db.mongo_db import (
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

@celery_app.task(name="app.tasks.requeue_delayed_answer_scoring")
def requeue_delayed_answer_scoring():
    """Recover answers saved while the broker or worker queue was unavailable."""
    recovered = 0
    cursor = answers_collection.find(
        {"scoring_status": "queue_failed"},
        {
            "interview_id": 1,
            "question_id": 1,
            "question_text": 1,
            "answer_text": 1,
            "time_spent_seconds": 1,
            "time_limit_seconds": 1,
            "answer_version": 1,
        },
    ).limit(100)
    for answer in cursor:
        interview_id = str(answer.get("interview_id") or "")
        question_id = str(answer.get("question_id") or "")
        answer_version = str(answer.get("answer_version") or "")
        claimed = answers_collection.find_one_and_update(
            {
                "_id": answer["_id"],
                "scoring_status": "queue_failed",
                "answer_version": answer_version,
            },
            {"$set": {"scoring_status": "pending"}},
        )
        if not claimed:
            continue

        interview = interviews_collection.find_one(
            {"id": interview_id},
            {"source": 1, "profile_text": 1, "language": 1},
        ) or {}
        context = (
            f"Candidate's {interview.get('source', 'Resume')}: "
            f"{interview.get('profile_text', '')}"
        )
        try:
            score_answer_task.delay(
                interview_id=interview_id,
                question_id=question_id,
                question_text=answer.get("question_text", ""),
                answer_text=answer.get("answer_text", ""),
                context=context,
                time_spent_seconds=int(answer.get("time_spent_seconds") or 0),
                time_limit_seconds=int(answer.get("time_limit_seconds") or 120),
                language=interview.get("language") or "English",
                answer_version=answer_version,
            )
            recovered += 1
        except Exception:
            answers_collection.update_one(
                {
                    "_id": answer["_id"],
                    "scoring_status": "pending",
                    "answer_version": answer_version,
                },
                {"$set": {"scoring_status": "queue_failed"}},
            )
            logger.exception(
                "Failed to requeue delayed scoring for interview=%s question=%s",
                interview_id,
                question_id,
            )
    return {"requeued": recovered}

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
    answer_version: str = "",
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

        # Spoken language and accent detection - runs with full NLP / LLM multi-tier engine
        try:
            session_doc = interview_sessions_collection.find_one(
                {"$or": [{"link_id": interview_id}, {"interview_id": interview_id}]},
                {"detected_accent": 1, "detected_language": 1, "language": 1, "candidate_phone": 1, "location": 1, "link_id": 1}
            )
            current_accent = session_doc.get("detected_accent") if session_doc else None
            interview_lang = language or (session_doc.get("language") if session_doc else "English") or "English"
            should_detect = False
            if not current_accent or current_accent.strip().lower() in ["unknown", "none", ""]:
                should_detect = True
            elif "(" not in current_accent and len(answer_text.strip()) >= 15:
                should_detect = True
            elif current_accent.lower().startswith("english") and interview_lang.lower() != "english":
                should_detect = True

            if should_detect and answer_text.strip():
                from app.services.language_accent_detector import detect_language_and_accent
                l_res = detect_language_and_accent(
                    answer_text,
                    candidate_profile=session_doc,
                    interview_language=interview_lang
                )
                detected = l_res.get("detected_accent")
                det_lang = l_res.get("language")
                if detected and detected != "Unknown":
                    update_res = interview_sessions_collection.update_one(
                        {"$or": [{"link_id": interview_id}, {"interview_id": interview_id}]},
                        {"$set": {
                            "detected_accent": detected,
                            "detected_language": det_lang,
                            "language": det_lang
                        }}
                    )
                    # Sync to application immediately so the details card is updated in real-time
                    if session_doc:
                        link_id = session_doc.get("link_id")
                        if link_id:
                            from app.routes.interview import sync_session_to_application
                            sync_session_to_application(link_id)
        except Exception as lang_err:
            logger.warning(f"Language detection background update failed: {lang_err}")

        keywords = ai_result.get("keywords", [])
        keywords_str = ",".join(keywords) if isinstance(keywords, list) else str(keywords)

        answer_filter = {"interview_id": interview_id, "question_id": str(question_id)}
        if answer_version:
            answer_filter["answer_version"] = answer_version
        update_result = answers_collection.update_one(
            answer_filter,
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
        if update_result.matched_count == 0:
            logger.info(
                "Discarded stale scoring result for interview %s Q%s",
                interview_id,
                question_id,
            )
            return {"status": "stale", "question_id": question_id}
        logger.info(f"Background scoring complete for Q{question_id}: {ai_result.get('overall_score', 0)}/100")

        # Post-scoring checks: Recalculate avg_score (composite) and trigger completion events if ready
        try:
            answers = list(answers_collection.find({"interview_id": interview_id}))
            scores = [a.get("ai_score", 0) for a in answers if a.get("ai_score") is not None]
            verbal_avg = sum(scores) / len(scores) if scores else 0

            # Composite score: blend with coding / case study if present
            try:
                from app.ai.score_rounds import (
                    compute_case_study_score,
                    calculate_round1_score, calculate_coding_score,
                    calculate_case_study_round2_score, calculate_final_score,
                    get_marks_split
                )
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

                # Determine interview type for scoring model selection
                interview_type = "Technical"
                if interview_row and interview_row.get("interview_type"):
                    interview_type = interview_row["interview_type"]
                elif session_rec and session_rec.get("interview_type"):
                    interview_type = session_rec["interview_type"]

                coding_round_data = (interview_row or {}).get("coding_round") if interview_row else None
                case_study_data   = (interview_row or {}).get("case_study_round") if interview_row else None

                # Count case study questions for Non-Tech dynamic split
                n_cs_questions = 0
                if case_study_data:
                    n_cs_questions = len(case_study_data.get("questions", []) or [])

                # Extract questions for dynamic Round 1 scoring
                questions = []
                if interview_row and interview_row.get("questions"):
                    questions = interview_row["questions"]
                    if isinstance(questions, str):
                        import json
                        try:
                            questions = json.loads(questions)
                        except:
                            questions = []
                elif session_rec and session_rec.get("pre_generated_questions"):
                    import json
                    try:
                        questions = json.loads(session_rec["pre_generated_questions"])
                    except:
                        pass

                # Round 1: dynamic verbal score based on interview type
                round1_s = calculate_round1_score(questions, answers, interview_type=interview_type, n_case_study_questions=n_cs_questions)

                # Round 2: depends on interview type
                round2_s = 0.0
                itype_lower = str(interview_type).strip().lower()
                if itype_lower == "technical" and coding_round_data:
                    round2_s = calculate_coding_score(coding_round_data)
                elif itype_lower in ("non-technical", "non_technical", "non tech", "nontech") and case_study_data:
                    language = (interview_row or {}).get("language", "English")
                    context  = f"Profile: {(interview_row or {}).get('profile_text', '')}"
                    round2_s = calculate_case_study_round2_score(case_study_data, n_cs_questions, context, language)
                # Normal / other types: round2_s stays 0.0

                avg_score = calculate_final_score(round1_s, round2_s)

            except Exception as blend_err:
                logger.warning(f"Composite blend error (falling back to verbal_avg): {blend_err}")
                avg_score = verbal_avg
            session = interview_sessions_collection.find_one(
                {"$or": [{"interview_id": interview_id}, {"link_id": interview_id}]}
            )
            if session:
                interview_sessions_collection.update_one(
                    {"_id": session["_id"]},
                    {"$set": {
                        "score": round(avg_score, 1),
                        "avg_score": round(avg_score, 1),
                        "round1_score": round(round1_s, 1),
                        "round2_score": round(round2_s, 1)
                    }}
                )
                from app.routes.interview import sync_session_to_application
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
                            from app.ai.analyze_dimensions import analyze_interview_dimensions
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
                                except Exception: pass
                            
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
        if self.request.retries < self.max_retries:
            countdown = 2 ** (self.request.retries + 1)
            raise self.retry(exc=e, countdown=countdown)
        logger.error(f"Background scoring permanently failed for Q{question_id} after maximum retries.")
        failed_filter = {"interview_id": interview_id, "question_id": str(question_id)}
        if answer_version:
            failed_filter["answer_version"] = answer_version
        answers_collection.update_one(
            failed_filter,
            {
                "$set": {
                    "scoring_status": "failed",
                    "ai_score": 0,
                    "ai_feedback": "Automatic scoring failed after multiple retries.",
                }
            },
        )
        raise


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
    company_name: str = "HireIQ",
):
    logger.info(f"Sending email via Celery to {candidate_email} (Attempt {self.request.retries + 1})")

    # Import here to avoid circular imports at module load time
    from app.services.services import build_default_interview_email_html

    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
    if not BREVO_API_KEY:
        logger.warning("BREVO_API_KEY not set — skipping email send")
        return {"status": "skipped", "reason": "no_api_key"}

    try:
        html_content = (
            custom_html.strip()
            if custom_html and custom_html.strip()
            else build_default_interview_email_html(
                candidate_name, duration, job_description, link_url, scheduled_start, scheduled_end, company_name
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

        from app.services.services import should_attach_job_description_pdf, generate_job_description_pdf_base64
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
    from app.routes.admin_dashboard import generate_report

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
    from app.services.services import queue_or_send_interview_email
    
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

# ---------------------------------------------------------------------------
# Task: send recruiter credentials email
# ---------------------------------------------------------------------------

@celery_app.task(bind=True, name="app.tasks.send_recruiter_credentials_email_task", max_retries=3)
def send_recruiter_credentials_email_task(
    self,
    recruiter_email: str,
    recruiter_name: str,
    username: str,
    password: str,
    description: str = "",
):
    logger.info(f"Sending credentials email to {recruiter_email} (Attempt {self.request.retries + 1})")

    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
    if not BREVO_API_KEY:
        logger.warning("BREVO_API_KEY not set — skipping email send")
        return {"status": "skipped", "reason": "no_api_key"}

    try:
        FRONTEND_URL = os.getenv("FRONTEND_URL", "https://www.hireiq.co.in")
        login_url = f"{FRONTEND_URL}/login"
        
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #4F46E5;">Welcome to HireIQ, {recruiter_name}!</h2>
                <p>An administrator has provisioned a new recruiter account for you.</p>
                <div style="background-color: #F8FAFC; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p><strong>Username:</strong> {username}</p>
                    <p><strong>Password:</strong> {password}</p>
                </div>
                <p><strong>Additional Details:</strong></p>
                <p>{description or "You can now log in and manage your AI interviews and candidates."}</p>
                <div style="margin-top: 30px;">
                    <a href="{login_url}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Login to HireIQ</a>
                </div>
                <p style="margin-top: 30px; font-size: 0.9em; color: #64748b;">
                    Please change your password after logging in for the first time.
                </p>
                <br>
                <p>Best Regards,<br>The HireIQ Team</p>
            </body>
        </html>
        """

        import requests
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
            "to": [{"email": recruiter_email, "name": recruiter_name}],
            "subject": "Your HireIQ Recruiter Account Credentials",
            "htmlContent": html_content,
        }

        response = requests.post(url, headers=headers, json=payload)
        response.raise_for_status()
        logger.info(f"Credentials email sent successfully to {recruiter_email}")
        return response.json()
    except Exception as e:
        logger.error(f"Failed to send credentials email to {recruiter_email}: {e}")
        try:
            from celery.exceptions import MaxRetriesExceededError
            self.retry(exc=e, countdown=2 ** self.request.retries)
        except MaxRetriesExceededError:
            logger.error("Max retries exceeded for credentials email.")
        raise

