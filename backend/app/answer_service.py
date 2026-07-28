"""Single persistence path for interview answers.

Both HTTP and realtime transports call this module so an answer always has the
same validation, idempotent upsert, version guard, and scoring behavior.
"""

from datetime import datetime, timezone
import logging
from typing import Any, Dict
from uuid import uuid4

from mongo_db import answers_collection, interviews_collection


MAX_QUESTION_TEXT_LENGTH = 20_000
MAX_ANSWER_TEXT_LENGTH = 100_000
logger = logging.getLogger(__name__)


def _bounded_text(value: Any, *, field: str, maximum: int, required: bool = True) -> str:
    text = str(value or "").strip()
    if required and not text:
        raise ValueError(f"{field} is required")
    if len(text) > maximum:
        raise ValueError(f"{field} exceeds the {maximum} character limit")
    return text


def _bounded_seconds(value: Any, default: int, maximum: int) -> int:
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        parsed = default
    return max(0, min(parsed, maximum))


def persist_answer_and_enqueue_scoring(
    *,
    interview_id: Any,
    question_id: Any,
    question_text: Any,
    answer_text: Any,
    candidate_name: Any = "Candidate",
    time_spent_seconds: Any = 0,
    time_limit_seconds: Any = 120,
) -> Dict[str, Any]:
    normalized_interview_id = _bounded_text(
        interview_id, field="interview_id", maximum=200
    )
    normalized_question_id = _bounded_text(
        question_id, field="question_id", maximum=200
    )
    normalized_question_text = _bounded_text(
        question_text, field="question_text", maximum=MAX_QUESTION_TEXT_LENGTH
    )
    normalized_answer_text = _bounded_text(
        answer_text, field="answer_text", maximum=MAX_ANSWER_TEXT_LENGTH
    )
    normalized_candidate_name = _bounded_text(
        candidate_name,
        field="candidate_name",
        maximum=500,
        required=False,
    ) or "Candidate"
    spent = _bounded_seconds(time_spent_seconds, 0, 24 * 60 * 60)
    limit = _bounded_seconds(time_limit_seconds, 120, 24 * 60 * 60)

    context = ""
    language = "English"
    interview = interviews_collection.find_one(
        {"id": normalized_interview_id},
        {"source": 1, "profile_text": 1, "language": 1},
    )
    if interview:
        context = (
            f"Candidate's {interview.get('source', 'Resume')}: "
            f"{interview.get('profile_text', '')}"
        )
        language = interview.get("language") or "English"

    answer_version = uuid4().hex
    now = datetime.now(timezone.utc).isoformat()
    answer_document = {
        "interview_id": normalized_interview_id,
        "question_id": normalized_question_id,
        "question_text": normalized_question_text,
        "answer_text": normalized_answer_text,
        "candidate_name": normalized_candidate_name,
        "answer_version": answer_version,
        "ai_score": None,
        "content_score": None,
        "relevance_score": None,
        "time_score": None,
        "time_spent_seconds": spent,
        "time_limit_seconds": limit,
        "ai_feedback": "Scoring in progress...",
        "ai_keywords": "",
        "corrected_answer": "Scoring in progress...",
        "scoring_status": "pending",
        "updated_at": now,
    }

    # Older clients stored numeric question IDs while newer clients send strings.
    # Canonicalize the legacy record before the atomic upsert so one question can
    # never appear twice in scoring/report calculations.
    if normalized_question_id.isdigit():
        numeric_question_id = int(normalized_question_id)
        legacy = answers_collection.find_one({
            "interview_id": normalized_interview_id,
            "question_id": numeric_question_id,
        })
        if legacy:
            canonical = answers_collection.find_one({
                "interview_id": normalized_interview_id,
                "question_id": normalized_question_id,
            })
            if canonical:
                answers_collection.delete_one({"_id": legacy["_id"]})
            else:
                answers_collection.update_one(
                    {"_id": legacy["_id"]},
                    {"$set": {"question_id": normalized_question_id}},
                )

    answers_collection.update_one(
        {
            "interview_id": normalized_interview_id,
            "question_id": normalized_question_id,
        },
        {
            "$set": answer_document,
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    from app import tasks

    scoring_status = "pending"
    try:
        tasks.score_answer_task.delay(
            interview_id=normalized_interview_id,
            question_id=normalized_question_id,
            question_text=normalized_question_text,
            answer_text=normalized_answer_text,
            context=context,
            time_spent_seconds=spent,
            time_limit_seconds=limit,
            language=language,
            answer_version=answer_version,
        )
    except Exception:
        scoring_status = "queue_failed"
        logger.exception(
            "Answer was saved but could not be queued for scoring: interview=%s question=%s",
            normalized_interview_id,
            normalized_question_id,
        )
        answers_collection.update_one(
            {
                "interview_id": normalized_interview_id,
                "question_id": normalized_question_id,
                "answer_version": answer_version,
            },
            {
                "$set": {
                    "scoring_status": scoring_status,
                    "ai_feedback": "Scoring is delayed and will retry automatically.",
                    "queue_failed_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )

    return {
        "status": "saved",
        "scoring_status": scoring_status,
        "answer_version": answer_version,
    }
