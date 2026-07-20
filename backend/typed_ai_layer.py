"""
typed_ai_layer.py -- Type-safe AI execution layer using Pydantic v2 validation.

Replaces interview_graph.py (LangGraph) for all LINEAR AI calls.
Uses the existing ai_client.chat_completion() for the actual HTTP call,
then validates the response through strict Pydantic models instead of
the fragile extract_json() regex approach.

LangGraph (coding_graph.py) is NOT replaced -- it handles the stateful
multi-step coding round which genuinely needs a graph.
"""

from __future__ import annotations
import json
import re
import time
from typing import Any, Dict, List, Optional

from ai_client import chat_completion
from ai_schemas import AnswerScore, FollowupQuestion, InterviewSummary, ResumeAnalysis
from prompt_cache import get as cache_get, set as cache_set

# ── Static system prompts (cached by OpenRouter) ──────────────────────────

_RESUME_SYSTEM = (
    "You are a resume parser. Extract key information and return ONLY valid JSON. "
    "No markdown, no explanation, no extra text."
)

_SCORING_SYSTEM = (
    "You are a senior technical interview evaluator calibrated to HireVue, Karat, and Google standards.\n"
    "You MUST use the Machine Reading Inference (MRI) workflow:\n"
    "1. GENERATE the perfect, ideal answer to the question (output as 'corrected_answer').\n"
    "2. EXTRACT 3 to 5 core factual concepts required from your ideal answer (output as 'key_facts_required').\n"
    "3. ANALYZE the candidate's transcript and strictly list which of those exact facts they successfully mentioned (output as 'facts_mentioned_by_candidate').\n"
    "4. CALCULATE the score STRICTLY based on the ratio of facts hit vs facts required.\n"
    "SCORING RUBRIC:\n"
    "1. CONTENT QUALITY (0-50 pts): 40-50=Hit all facts, 28-39=Missed 1-2 minor facts, 15-27=Missed major facts, 0-14=Hit 0 facts or factually incorrect.\n"
    "2. RELEVANCE (0-30 pts): 25-30=Direct, 17-24=Mostly, 8-16=Partial, 0-7=Irrelevant.\n"
    "3. TIME EFFICIENCY (0-20 pts): optimal use of allotted time.\n"
    "CRITICAL RULE: You MUST evaluate if the candidate actually answered the question. Set 'is_relevant' to false if they talked about something else, gave a nonsense answer, or said they don't know.\n"
    "Return VALID JSON ONLY. No markdown."
)

_SUMMARY_SYSTEM = (
    "You are a senior hiring manager. Analyze interview performance data and return ONLY valid JSON. "
    "No markdown, no explanation."
)

_FOLLOWUP_SYSTEM = (
    "You are an intelligent technical interviewer. Generate ONE follow-up question as valid JSON. "
    "No markdown, no explanation."
)


# ── Helpers ────────────────────────────────────────────────────────────────

def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text[:limit] if len(text) > limit else text


def _extract_json_robust(text: str) -> Optional[Dict]:
    """Robustly extract a JSON object from AI text (handles markdown fences)."""
    if not text:
        return None
    # Strip markdown fences
    text = re.sub(r"```(?:json)?", "", text).strip()
    # Find first { ... }
    start = text.find("{")
    end = text.rfind("}") + 1
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start:end])
    except json.JSONDecodeError:
        return None


def _parse_with_schema(raw: str, schema_class, fallback):
    """Parse AI response into a Pydantic schema, returning fallback on failure."""
    data = _extract_json_robust(raw)
    if not data:
        return fallback
    try:
        return schema_class(**data)
    except Exception:
        # Pydantic validation failed -- try with only known fields
        known_fields = schema_class.model_fields.keys()
        filtered = {k: v for k, v in data.items() if k in known_fields}
        try:
            return schema_class(**filtered)
        except Exception:
            return fallback


# ── 1. Resume Parser ───────────────────────────────────────────────────────

def parse_resume(profile_text: str) -> dict:
    """
    Parse resume/JD and extract structured skills/experience.
    Cached for 5 minutes -- same resume won't hit the API twice.
    Token-optimized: sends max 2000 chars.
    """
    text = _truncate(profile_text, 2000)
    cached = cache_get(text, "parse_resume")
    if cached:
        return cached

    user_msg = f"""Extract from this resume/JD and return JSON:
{{
  "skills": [],
  "projects": [],
  "tools_and_technologies": [],
  "experience_level": "",
  "domains": [],
  "important_keywords": []
}}
Content: {text}"""

    fallback = ResumeAnalysis()

    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": _RESUME_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            model="openai/gpt-4o-mini",
            temperature=0.0,
            timeout=30,
        )
        result = _parse_with_schema(raw, ResumeAnalysis, fallback)
        result_dict = result.to_dict()
        cache_set(text, "parse_resume", result_dict)
        return result_dict
    except Exception as e:
        print(f"[typed_ai_layer] parse_resume error: {e}")
        result_dict = fallback.to_dict()
        # CACHE THE FALLBACK for 60 seconds so we don't hang the app if API is down
        cache_set(text, "parse_resume", result_dict)
        return result_dict


# ── 2. Answer Scorer ───────────────────────────────────────────────────────

def score_answer(
    question: str,
    answer: str,
    context: str = "",
    time_spent_seconds: int = 0,
    time_limit_seconds: int = 120,
    language: str = "English",
    time_context: str = "",
    time_score_hint: str = "",
) -> dict:
    """
    Score a candidate answer. Returns validated AnswerScore dict.
    Token-optimized: answer capped at 600 words, context at 500 chars.
    """
    # Cap answer length
    words = answer.split()
    if len(words) > 600:
        answer = " ".join(words[:600]) + " ...[truncated]"

    user_msg = f"""Score this interview answer. Language for feedback: {language}.

Context: {_truncate(context, 500) or 'N/A'}
Question: "{_truncate(question, 300)}"
Answer: "{answer}"
Time info: {time_context}
{time_score_hint}

Return VALID JSON ONLY:
{{
  "is_relevant": true,
  "corrected_answer": "...",
  "key_facts_required": ["fact 1", "fact 2"],
  "facts_mentioned_by_candidate": ["fact 1"],
  "content_score": 0,
  "relevance_score": 0,
  "time_score": 0,
  "overall_score": 0,
  "clarity_score": 0,
  "technical_depth_score": 0,
  "confidence_score": 0,
  "feedback": "...",
  "keywords": []
}}"""

    fallback = AnswerScore(
        feedback="AI scoring unavailable.",
        overall_score=0,
        content_score=0,
        relevance_score=0,
        time_score=0,
    )

    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": _SCORING_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            model="openai/gpt-4o-mini",
            temperature=0.01,
            timeout=45,
        )
        result = _parse_with_schema(raw, AnswerScore, fallback)
        
        # Enforce strict zero-tolerance for irrelevant or nonsense answers
        word_count = len(answer.split())
        facts_hit = len(result.facts_mentioned_by_candidate)
        
        # Aggressive Hallucination Filters:
        # 1. If it's physically too short to be a valid technical answer (< 5 words).
        # 2. If it's short (< 15 words) but somehow got a high score (hallucinated).
        # 3. If AI explicitly flagged it as irrelevant or gave it a failing rubric score.
        # 4. If the AI generated facts, but the candidate hit 0 of them.
        is_too_short = word_count < 5
        is_short_hallucination = (word_count < 15 and result.overall_score > 40)
        is_rubric_fail = not result.is_relevant or (result.relevance_score <= 10) or (result.content_score <= 14)
        is_zero_facts = (len(result.key_facts_required) > 0 and facts_hit == 0)
        
        if is_too_short or is_short_hallucination or is_rubric_fail or is_zero_facts:
            result.overall_score = 0
            result.content_score = 0
            result.relevance_score = 0
            result.time_score = 0
            
        return result.to_dict()
    except Exception as e:
        print(f"[typed_ai_layer] score_answer error: {e}")
        return fallback.to_dict()


# ── 3. Interview Summary ───────────────────────────────────────────────────

def generate_summary(candidate_name: str, answers_data: List[Dict]) -> dict:
    """
    Generate the final interview summary.
    Token-optimized: sends compressed feedback snippets, not full answer text.
    """
    if not answers_data:
        return InterviewSummary().to_dict()

    avg = sum(a.get("ai_score", 0) or 0 for a in answers_data) / len(answers_data)

    # COMPRESSED Q&A -- feedback snippet instead of full answer text (~70% token saving)
    compressed_qa = "\n".join(
        f"Q{i+1}: {_truncate(a.get('question_text', ''), 120)}\n"
        f"Score: {a.get('ai_score', 0)}/100 | Feedback: {_truncate(a.get('ai_feedback', ''), 200)}"
        for i, a in enumerate(answers_data)
    )

    user_msg = f"""Candidate: {candidate_name}
Average Score: {avg:.1f}/100

Interview Summary (Compressed):
{compressed_qa}

Return JSON with ALL these keys:
recommendation (one of: "Strong Hire","Hire","Borderline","No Hire"),
strengths (2-3 sentences), weaknesses (2-3 sentences),
communication_score (0-100), communication_reasoning (1 sentence),
skills_score (0-100), skills_reasoning (1 sentence),
competencies_score (0-100), competencies_reasoning (1 sentence),
personality_score (0-100), personality_reasoning (1 sentence),
culture_fit_score (0-100), culture_fit_reasoning (1 sentence),
job_success_score (0-100), job_success_reasoning (1 sentence),
detected_accent (short string)."""

    # Score-based fallback
    rec = "Strong Hire" if avg >= 75 else "Hire" if avg >= 55 else "Borderline" if avg >= 35 else "No Hire"
    fallback = InterviewSummary(
        recommendation=rec,
        strengths="Summary generation failed. Review individual scores.",
        weaknesses="Summary generation failed. Review individual scores.",
        communication_score=int(avg), skills_score=int(avg),
        competencies_score=int(avg), personality_score=int(avg),
        culture_fit_score=int(avg), job_success_score=int(avg),
    )

    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": _SUMMARY_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            model="openai/gpt-4o-mini",
            temperature=0.1,
            timeout=45,
        )
        result = _parse_with_schema(raw, InterviewSummary, fallback)
        return result.to_dict()
    except Exception as e:
        print(f"[typed_ai_layer] generate_summary error: {e}")
        return fallback.to_dict()


# ── 4. Follow-up Question Generator ───────────────────────────────────────

def generate_followup(
    answer_text: str,
    resume_context: str,
    jd_text: str,
    current_q_id: int,
    followup_streak: int,
    language: str = "English",
) -> dict:
    """
    Generate a dynamic follow-up question.
    Token-optimized: answer capped at 300 chars, context at 500 chars.
    """
    answer_short = _truncate(answer_text, 300)
    resume_short = _truncate(resume_context, 500)
    jd_short = _truncate(jd_text, 500)

    if followup_streak < 3:
        user_msg = f"""Generate ONE follow-up interview question in {language} based on this answer.
Candidate's Last Answer: "{answer_short}"
Resume Context: {resume_short}

Rules:
- Ask directly, never say "You mentioned" or "Based on your answer"
- Under 2 sentences, conversational and punchy
- Dig into a project, technology, or specific claim they made

Return JSON: {{"question": "...", "difficulty": "Medium", "type": "Follow-up", "category": "Deep Dive"}}"""
    else:
        user_msg = f"""Change topic. Generate ONE new interview question in {language} from this JD.
Job Description: {jd_short}

Rules: Ask a role-specific question. Under 2 sentences.
Return JSON: {{"question": "...", "difficulty": "Medium", "type": "JD-Based", "category": "Role Requirement"}}"""

    import random
    OFFLINE_FALLBACKS = {
        "English": ["Could you elaborate on that?", "Can you walk me through a specific example?", "What challenges did you face there?"],
        "Hindi": ["क्या आप इस पर थोड़ा और विस्तार से बता सकते हैं?"],
        "Telugu": ["దయచేసి దాని గురించి కొంచెం వివరంగా చెప్పగలరా?"],
        "Tamil": ["அதைப்பற்றி கொஞ்சம் விரிவாக கூற முடியுமா?"],
    }

    fallback = FollowupQuestion(
        id=current_q_id + 1,
        question=random.choice(OFFLINE_FALLBACKS.get(language, OFFLINE_FALLBACKS["English"])),
    )

    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": _FOLLOWUP_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            model="openai/gpt-4o-mini",
            temperature=0.5,
            timeout=20,
        )
        result = _parse_with_schema(raw, FollowupQuestion, fallback)
        result.id = current_q_id + 1
        return result.to_dict()
    except Exception as e:
        print(f"[typed_ai_layer] generate_followup error: {e}")
        fallback.id = current_q_id + 1
        return fallback.to_dict()

def detect_spoken_language(text: str) -> str:
    """
    Detect the spoken language of the candidate's answer text using LLM.
    Returns the capitalized name of the language (e.g., 'English', 'Hindi', 'Marathi', etc.) or 'Unknown'.
    """
    if not text or not text.strip():
        return "Unknown"
        
    prompt = (
        "Identify the primary spoken language of this text. Respond with ONLY the capitalized name of the language "
        "(e.g., 'English', 'Hindi', 'Marathi', 'Telugu', 'Tamil', etc.). If the language is not clear or if it is "
        "gibberish/silence/nonsense, respond with ONLY the word 'Unknown'. No markdown, no punctuation, no extra words.\n\n"
        f"Text: \"{text}\""
    )
    try:
        response = chat_completion(
            messages=[
                {"role": "system", "content": "You are a language detection tool. You respond with exactly one capitalized word or 'Unknown'."},
                {"role": "user", "content": prompt}
            ],
            model="openai/gpt-4o-mini",
            temperature=0.0
        )
        detected = (response or "").strip().replace(".", "").replace('"', '').replace("'", "")
        # Basic validation: must be a single word (e.g. English, Hindi, etc.)
        if len(detected.split()) == 1 and detected != "Unknown":
            return detected.capitalize()
    except Exception as e:
        print(f"Language detection failed: {e}")
    return "Unknown"


print("[OK] typed_ai_layer.py loaded | Type-safe AI layer active")
