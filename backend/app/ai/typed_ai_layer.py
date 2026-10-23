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

from app.ai.ai_client import chat_completion
from app.ai.ai_schemas import AnswerScore, FollowupQuestion, InterviewSummary, ResumeAnalysis
from app.ai.prompt_cache import get as cache_get, set as cache_set

# ── Static system prompts (cached by OpenRouter) ──────────────────────────

_RESUME_SYSTEM = (
    "You are a resume parser. Extract key information and return ONLY valid JSON. "
    "No markdown, no explanation, no extra text."
)

_SCORING_SYSTEM = (
    "You are a senior technical interview evaluator calibrated to real-world spoken interview standards.\n"
    "SPOKEN INTERVIEW CONTEXT & PHONETIC TOLERANCE:\n"
    "1. This is a conversational verbal response (~30-90s) delivered over a microphone, NOT a written exam.\n"
    "2. Transcribed via Speech-to-Text (STT): accommodate phonetic transcription artifacts and homophones (e.g. 'ELBO' for 'Elbow', 'Sihlhout' for 'Silhouette', 'sequel' for 'SQL'). Never penalize STT misspellings.\n"
    "3. Positive milestone scoring: reward core definition (20-25), mechanism flow (20-25), and practical techniques (15-20). Do not demand formulas unless specifically requested.\n"
    "SCORING RUBRIC (Pure Accuracy Model):\n"
    "1. CONTENT QUALITY (0-70 pts): 50-70=Solid verbal explanation of concepts & steps, 30-49=Partial explanation, 0-29=Major conceptual errors.\n"
    "2. RELEVANCE (0-30 pts): 25-30=Directly answers question, 15-24=Mostly on point, 0-14=Off-topic.\n"
    "3. TIME SCORE: Strictly 0 (disabled).\n"
    "Return VALID JSON ONLY. No markdown."
)

_SUMMARY_SYSTEM = (
    "You are a senior hiring manager. Analyze interview performance data and return ONLY valid JSON. "
    "No markdown, no explanation."
)

_FOLLOWUP_SYSTEM = (
    "You are an intelligent technical interviewer. Generate ONE follow-up question as valid JSON. "
    "CRITICAL SPOKEN INTERVIEW FORMAT: This is a spoken interview conducted over a microphone. "
    "NEVER ask the candidate to 'write code', 'write a function', 'write a script', or 'write a SQL query'. "
    "NEVER ask them to dictate raw code. Instead, ask them to explain concepts, describe their approach, or walk through logic verbally. "
    "No markdown, no explanation."
)


# ── Helpers ────────────────────────────────────────────────────────────────

def sanitize_verbal_question_text(text: str) -> str:
    """
    Ensure technical questions are framed for verbal/spoken answers.
    Converts prompts like 'Write a python function to...' into verbal walk-through questions.
    """
    if not text:
        return text
    cleaned = text.strip()

    # Replace "Write a SQL query to ..." -> "How would you structure a SQL query to ..."
    cleaned = re.sub(
        r'(?i)^(?:can you\s+|please\s+)?write (?:a |an )?(sql query|query)\s+(?:to|that|for)\s+',
        r'How would you structure a \1 to ',
        cleaned
    )
    # Replace "Write a [python/java/...] function/method/script/program/algorithm to ..." -> "How would you approach designing a \1 to ..."
    cleaned = re.sub(
        r'(?i)^(?:can you\s+|please\s+)?write (?:a |an )?((?:python |java |javascript |c\+\+ |go |sql )?(?:function|method|script|program|algorithm|code snippet|query))\s+(?:to|that|for)\s+',
        r'How would you approach designing a \1 to ',
        cleaned
    )
    # Replace "Write code to ..." -> "Walk me through how you would structure code to "
    cleaned = re.sub(
        r'(?i)^(?:can you\s+|please\s+)?write (?:some |the )?code\s+(?:to|that|for)\s+',
        r'Walk me through how you would structure code to ',
        cleaned
    )
    # Replace any leftover "write a query/function to" inside sentence
    cleaned = re.sub(
        r'(?i)\bwrite (?:a |an )?(sql query|query)\s+(?:to|that|for)\s+',
        r'structure a \1 to ',
        cleaned
    )
    cleaned = re.sub(
        r'(?i)\bwrite (?:a |an )?((?:python |java |javascript |c\+\+ |go )?(?:function|script|method))\s+(?:to|that|for)\s+',
        r'design a \1 to ',
        cleaned
    )
    # Replace "code a solution..." or "implement a function to..."
    cleaned = re.sub(
        r'(?i)^(?:can you\s+|please\s+)?(?:implement|code) (?:a |an )?((?:python |java |javascript )?(?:function|method|solution|query))\s+(?:to|that|for)\s+',
        r'How would you approach implementing a \1 to ',
        cleaned
    )
    if cleaned != text.strip() and not re.search(r'\b(walk me through|explain|describe)\b', cleaned, re.IGNORECASE):
        if cleaned.endswith('.'):
            cleaned = cleaned[:-1] + '. Walk me through your approach verbally.'
        elif cleaned.endswith('?'):
            cleaned = cleaned[:-1] + ', and walk me through your approach?'
    return cleaned


# ── Phonetic & Acoustic Normalizer for Spoken Tech Interviews ─────────────

_PHONETIC_REPLACEMENTS: List[Tuple[re.Pattern, str]] = [
    # Clustering & ML
    (re.compile(r'\b(?:the\s+)?elbo\s+method\b', re.IGNORECASE), 'elbow method'),
    (re.compile(r'\belbo\s+(curve|graph|plot|point|technique|rule)\b', re.IGNORECASE), r'elbow \1'),
    (re.compile(r'\b(?:sihlhout|silhoute|silhoutte|silhoutee|silhouete|silhuette|silhuet|silhout)\s*(?:method|score|analysis|technique)?\b', re.IGNORECASE), 'silhouette method'),
    (re.compile(r'\b(?:k\s*means|k\s*mean)\b', re.IGNORECASE), 'K-Means'),
    (re.compile(r'\b(?:k\s*n\s*n)\b', re.IGNORECASE), 'KNN'),
    (re.compile(r'\b(?:s\s*v\s*m)\b', re.IGNORECASE), 'SVM'),
    (re.compile(r'\b(?:p\s*c\s*a)\b', re.IGNORECASE), 'PCA'),
    (re.compile(r'\b(?:x\s*g\s*boost|xg\s*boost)\b', re.IGNORECASE), 'XGBoost'),
    (re.compile(r'\b(?:circuit\s+learn|scikit\s+learn|sci\s*kit\s*learn)\b', re.IGNORECASE), 'Scikit-Learn'),
    (re.compile(r'\b(?:pie\s*torch|py\s*torch)\b', re.IGNORECASE), 'PyTorch'),
    (re.compile(r'\b(?:tensor\s*flow)\b', re.IGNORECASE), 'TensorFlow'),
    (re.compile(r'\b(?:gradient\s+descent|stochastic\s+gradient\s+descent)\b', re.IGNORECASE), 'Gradient Descent'),
    (re.compile(r'\b(?:over\s*fitting)\b', re.IGNORECASE), 'overfitting'),
    (re.compile(r'\b(?:under\s*fitting)\b', re.IGNORECASE), 'underfitting'),
    (re.compile(r'\b(?:hyper\s*parameter|hyper\s*parameters)\b', re.IGNORECASE), 'hyperparameter'),

    # Databases & Backend
    (re.compile(r'\b(?:sequel|cquel)\b', re.IGNORECASE), 'SQL'),
    (re.compile(r'\b(?:no\s*sequel|no\s*sql)\b', re.IGNORECASE), 'NoSQL'),
    (re.compile(r'\b(?:postgres\s*sequel|postgre\s*sql|postgres)\b', re.IGNORECASE), 'PostgreSQL'),
    (re.compile(r'\b(?:mongo\s*db|mongo)\b', re.IGNORECASE), 'MongoDB'),
    (re.compile(r'\b(?:reddis|red-is)\b', re.IGNORECASE), 'Redis'),
    (re.compile(r'\b(?:elastic\s*search)\b', re.IGNORECASE), 'Elasticsearch'),

    # Web & DevOps
    (re.compile(r'\b(?:jason|j\s*son)\b', re.IGNORECASE), 'JSON'),
    (re.compile(r'\b(?:rest\s*full|rest\s*api|rest\s*apis)\b', re.IGNORECASE), 'REST API'),
    (re.compile(r'\b(?:graph\s*q\s*l|graph\s*ql)\b', re.IGNORECASE), 'GraphQL'),
    (re.compile(r'\b(?:kubernets|k\s*8\s*s|k8s)\b', re.IGNORECASE), 'Kubernetes'),
    (re.compile(r'\b(?:dockers)\b', re.IGNORECASE), 'Docker'),
    (re.compile(r'\b(?:git\s*hub)\b', re.IGNORECASE), 'GitHub'),
    (re.compile(r'\b(?:git\s*lab)\b', re.IGNORECASE), 'GitLab'),
    (re.compile(r'\b(?:c\s*i\s*c\s*d|ci\s*cd)\b', re.IGNORECASE), 'CI/CD'),

    # Programming & Architecture
    (re.compile(r'\b(?:a\s*sync|a-sync)\b', re.IGNORECASE), 'async'),
    (re.compile(r'\b(?:a\s*sync\s*await|async\s*a\s*wait)\b', re.IGNORECASE), 'async/await'),
    (re.compile(r'\b(?:oops|oops\s*concepts?)\b', re.IGNORECASE), 'OOP'),
    (re.compile(r'\b(?:micro\s*services?|micro\s*service)\b', re.IGNORECASE), 'microservices'),
    (re.compile(r'\b(?:multi\s*threading|multi\s*threaded)\b', re.IGNORECASE), 'multithreading'),
    (re.compile(r'\b(?:data\s*base|data\s*bases)\b', re.IGNORECASE), 'database'),
]


def normalize_stt_technical_terms(text: str) -> str:
    """
    Clean and normalize common phonetic Speech-to-Text misspellings of tech terms.
    Preserves original meaning while fixing acoustic recognition errors.
    """
    if not text or not isinstance(text, str):
        return text or ""

    normalized = text
    for pattern, replacement in _PHONETIC_REPLACEMENTS:
        normalized = pattern.sub(replacement, normalized)

    normalized = re.sub(r'\s+', ' ', normalized).strip()
    return normalized


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
        # Secondary recovery: remove trailing commas before closing braces/brackets
        try:
            cleaned = re.sub(r",\s*([\]}])", r"\1", text[start:end])
            return json.loads(cleaned)
        except Exception:
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
    # Normalize Speech-to-Text acoustic mishearings before scoring
    answer = normalize_stt_technical_terms(answer)

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
        
        # Enforce strict zero-tolerance for truly empty, nonsense, or trivial answers
        word_count = len(answer.split())
        
        # Guardrails:
        # 1. If it's physically too short to be a valid technical answer (< 5 words).
        # 2. If it's short (< 15 words) but somehow got a high score (hallucinated).
        # 3. If explicitly marked as completely irrelevant and relevance <= 5.
        is_too_short = word_count < 5
        is_short_hallucination = (word_count < 15 and result.overall_score > 40)
        is_rubric_fail = (not result.is_relevant and result.relevance_score <= 5)
        
        if is_too_short or is_short_hallucination or is_rubric_fail:
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
- Spoken interview format: DO NOT ask to write code, write queries, or dictate syntax. Ask them to explain or walk through their approach verbally.

Return JSON: {{"question": "...", "difficulty": "Medium", "type": "Follow-up", "category": "Deep Dive"}}"""
    else:
        user_msg = f"""Change topic. Generate ONE new interview question in {language} from this JD.
Job Description: {jd_short}

Rules:
- Ask a role-specific question. Under 2 sentences.
- Spoken interview format: DO NOT ask to write code, write queries, or dictate syntax. Ask them to explain or walk through their approach verbally.

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
        res_dict = result.to_dict()
        if res_dict.get("question"):
            res_dict["question"] = sanitize_verbal_question_text(res_dict["question"])
        return res_dict
    except Exception as e:
        print(f"[typed_ai_layer] generate_followup error: {e}")
        fallback.id = current_q_id + 1
        fb_dict = fallback.to_dict()
        if fb_dict.get("question"):
            fb_dict["question"] = sanitize_verbal_question_text(fb_dict["question"])
        return fb_dict

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
        detected = (response or "").strip().replace(".", "").replace('"', '').replace("'", "").capitalize()
        
        canonical_languages = {"English", "Hindi", "Telugu", "Tamil", "Marathi", "Gujarati", "Bengali", "Kannada", "Malayalam", "Punjabi", "Odia", "Assamese", "Urdu", "Sanskrit", "Spanish", "French", "German", "Chinese", "Japanese", "Korean", "Arabic", "Russian", "Portuguese", "Italian"}
        
        # Robust parsing: check if any canonical language matches as a substring of the cleaned response
        matched_lang = None
        for lang in canonical_languages:
            if lang.lower() in detected.lower():
                matched_lang = lang
                break
        
        if matched_lang:
            return matched_lang
            
        if len(detected.split()) == 1 and detected in canonical_languages:
            return detected
    except Exception as e:
        print(f"Language detection failed: {e}")
        
    # Offline linguistic & script fallback
    try:
        from app.services.language_accent_detector import detect_language_and_accent
        l_res = detect_language_and_accent(text)
        return l_res.get("language") or "English"
    except Exception as e:
        print(f"Language detection offline fallback error: {e}")
        
    return "English"


print("[OK] typed_ai_layer.py loaded | Type-safe AI layer active")
