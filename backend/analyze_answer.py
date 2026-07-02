import json
from ai_client import chat_completion, extract_json

# Route AI scoring through typed_ai_layer for type-safe, validated outputs
try:
    from typed_ai_layer import score_answer as _typed_score
    _TYPED_LAYER_AVAILABLE = True
except ImportError:
    _TYPED_LAYER_AVAILABLE = False

# STATIC SYSTEM PROMPT — extracted so OpenRouter can cache it between calls.
# This saves ~400 tokens on every answer scored.
_SCORING_SYSTEM_PROMPT = """You are a senior technical interview evaluator calibrated to the same standards as HireVue, Karat, and Google hiring panels.

SCORING RUBRIC:
1. CONTENT QUALITY (0-50 pts): depth, accuracy, examples, STAR structure.
   40-50=Exceptional, 28-39=Good, 15-27=Weak, 0-14=Poor
2. RELEVANCE (0-30 pts): how directly the answer addresses the question.
   25-30=Direct, 17-24=Mostly, 8-16=Partial, 0-7=Irrelevant
3. TIME EFFICIENCY (0-20 pts): optimal use of allotted time.

RULES:
- Score the CANDIDATE'S ANSWER only, not the suggested answer.
- overall_score = content_score + relevance_score + time_score (max 100).
- Also score clarity_score, technical_depth_score, confidence_score (each 0-100).
- Return VALID JSON ONLY."""


def analyze_answer(
    question: str,
    answer: str,
    context: str = "",
    time_spent_seconds: int = 0,
    time_limit_seconds: int = 120,
    language: str = "English"
):
    """
    Analyze a candidate's interview answer and return a structured score.

    Scoring Rubric (industry-standard, calibrated against HireVue / Karat norms):
      - Content Quality   : 50 pts  (depth, accuracy, examples, structure)
      - Relevance         : 30 pts  (how directly the answer addresses the question)
      - Time Efficiency   : 20 pts  (optimal use of allotted time — not too short, not padding)

    Final overall_score = weighted sum (0–100).
    """
    # Short-circuit for empty/placeholder answers
    if not answer or not answer.strip() or answer.strip() in [
        "Transcribing...", "Your speech will appear here automatically...", "(Skipped)"
    ]:
        return {
            "corrected_answer": "No answer provided.",
            "grammar_score": 0,
            "relevance_score": 0,
            "clarity_score": 0,
            "content_score": 0,
            "time_score": 0,
            "overall_score": 0,
            "feedback": "No answer was recorded for this question.",
        }

    # ── Time efficiency context ──────────────────────────────────────────────
    time_context = ""
    time_score_hint = ""
    if time_spent_seconds > 0 and time_limit_seconds > 0:
        pct = time_spent_seconds / time_limit_seconds
        if pct < 0.20:
            time_context = (
                f"The candidate answered in {time_spent_seconds}s out of {time_limit_seconds}s allowed "
                f"({int(pct*100)}% of time used). This is very short — likely insufficient depth."
            )
            time_score_hint = "time_score should be 0–10 (far too brief)."
        elif pct < 0.40:
            time_context = (
                f"The candidate answered in {time_spent_seconds}s out of {time_limit_seconds}s allowed "
                f"({int(pct*100)}% of time used). Answer may lack sufficient detail."
            )
            time_score_hint = "time_score should be 10–14 (too short)."
        elif pct <= 0.85:
            time_context = (
                f"The candidate answered in {time_spent_seconds}s out of {time_limit_seconds}s allowed "
                f"({int(pct*100)}% of time used). Good time management."
            )
            time_score_hint = "time_score should be 16–20 (optimal range)."
        elif pct <= 1.05:
            time_context = (
                f"The candidate answered in {time_spent_seconds}s out of {time_limit_seconds}s allowed "
                f"({int(pct*100)}% of time used). Used nearly all time — good."
            )
            time_score_hint = "time_score should be 14–18 (slightly long but acceptable)."
        else:
            time_context = (
                f"The candidate went over time: {time_spent_seconds}s used vs {time_limit_seconds}s allowed "
                f"({int(pct*100)}% of limit). Answer was padded or rambling."
            )
            time_score_hint = "time_score should be 8–12 (over time, penalised)."
    else:
        time_context = "Time data not available."
        time_score_hint = "time_score should be 12 (neutral default when time data is missing)."

    # TOKEN SAVE: Cap answer at 600 words — adequate for full scoring
    answer_words = answer.split()
    if len(answer_words) > 600:
        answer = " ".join(answer_words[:600]) + " ...[truncated]"

    # USER message — concise, variable data only (system prompt is cached above)
    prompt = f"""Score this interview answer. Language for feedback: {language}.

Context: {context[:500] if context else 'N/A'}
Question: "{question[:300]}"
Answer: "{answer}"
Time: {time_context}
{time_score_hint}

Return VALID JSON ONLY:
{{
  "corrected_answer": "...",
  "content_score": 0,
  "relevance_score": 0,
  "time_score": 0,
  "overall_score": 0,
  "clarity_score": 0,
  "technical_depth_score": 0,
  "confidence_score": 0,
  "feedback": "...",
  "keywords": ["key1", "key2"]
}}"""

    try:
        # Use Typed AI layer for type-safe, validated JSON output
        if _TYPED_LAYER_AVAILABLE:
            result = _typed_score(
                question=question,
                answer=answer,
                context=context,
                time_spent_seconds=time_spent_seconds,
                time_limit_seconds=time_limit_seconds,
                language=language,
                time_context=time_context,
                time_score_hint=time_score_hint,
            )
        else:
            # Direct fallback if typed_ai_layer not available
            content = chat_completion(
                messages=[
                    {"role": "system", "content": _SCORING_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                model="openai/gpt-4o-mini",
                temperature=0.01,
                timeout=45,
            )
            result = extract_json(content)
            if not result:
                raise Exception("No JSON found in AI response")

        # ── Safety checks ──────────────────────────────────────────────────
        word_count = len(answer.split())

        # Very short answers (< 10 words): hard cap score
        if word_count < 10 and result.get("overall_score", 0) > 25:
            result["content_score"] = min(result.get("content_score", 0), 8)
            result["relevance_score"] = min(result.get("relevance_score", 0), 5)
            result["overall_score"] = (
                result["content_score"]
                + result.get("relevance_score", 0)
                + result.get("time_score", 0)
            )
            if "too short" not in result.get("feedback", "").lower():
                result["feedback"] = (
                    "Your answer was too short to evaluate meaningfully. "
                    "Please provide a detailed response. "
                    + result.get("feedback", "")
                )

        # Ensure overall_score is the sum of components (prevent AI hallucination)
        computed = (
            result.get("content_score", 0)
            + result.get("relevance_score", 0)
            + result.get("time_score", 0)
        )
        if abs(computed - result.get("overall_score", 0)) > 5:
            result["overall_score"] = min(100, max(0, computed))

        return result

    except Exception as e:
        print(f"⚠️ Analysis API Failed: {e}")

        # ── FALLBACK: Heuristic scoring (offline mode) ─────────────────────
        word_count = len(answer.split())

        # Content score heuristic
        if word_count < 10:
            content_score = 8
            feedback = f"⚠️ AI Offline. Answer too short ({word_count} words). Provide more detail."
        elif word_count < 30:
            content_score = 18
            feedback = f"⚠️ AI Offline. Short answer ({word_count} words). More depth expected."
        else:
            content_score = min(int(word_count * 0.8), 40)
            feedback = f"⚠️ AI Offline. Your answer was recorded ({word_count} words). Check API credits for real analysis."

        # Relevance heuristic (neutral when offline)
        relevance_score = 15

        # Time score heuristic
        time_score = 12  # neutral default
        if time_spent_seconds > 0 and time_limit_seconds > 0:
            pct = time_spent_seconds / time_limit_seconds
            if 0.40 <= pct <= 0.85:
                time_score = 18
            elif pct < 0.20:
                time_score = 5
            elif pct > 1.10:
                time_score = 8

        overall = min(100, content_score + relevance_score + time_score)

        # ── DYNAMIC INSIGHTS HEURISTICS (Offline Mode) ─────────────────
        # 1. Clarity (Based on WPM)
        wpm = 0
        clarity_score = 50
        if time_spent_seconds > 0:
            wpm = (word_count / time_spent_seconds) * 60
            if 110 <= wpm <= 160:
                clarity_score = 85  # Good conversational pace
            elif 80 <= wpm < 110 or 160 < wpm <= 190:
                clarity_score = 65  # A bit slow or fast
            else:
                clarity_score = 45  # Too slow or too fast
                
        # 2. Confidence (Based on hedging words)
        hedging_words = [" um ", " uh ", " like ", " i mean ", " sort of ", " kind of ", " maybe ", " probably ", " i guess ", " not sure "]
        lower_ans = " " + answer.lower() + " "
        hedge_count = sum(lower_ans.count(h) for h in hedging_words)
        confidence_score = max(20, 90 - (hedge_count * 5))
        if word_count < 20: 
            confidence_score = min(confidence_score, 40)
            
        # 3. Technical Depth (Based on vocabulary richness / long words)
        words = answer.split()
        long_words = [w for w in words if len(w) > 7]
        richness_ratio = len(long_words) / word_count if word_count > 0 else 0
        if richness_ratio > 0.30:
            technical_depth_score = 85
        elif richness_ratio > 0.15:
            technical_depth_score = 65
        else:
            technical_depth_score = 45
        if word_count < 20:
            technical_depth_score = min(technical_depth_score, 40)
            
        # Hard fail if no words spoken
        if word_count == 0:
            clarity_score = 0
            confidence_score = 0
            technical_depth_score = 0

        return {
            "corrected_answer": "Analysis unavailable (Offline Mode)",
            "content_score": content_score,
            "relevance_score": relevance_score,
            "time_score": time_score,
            "overall_score": overall,
            "clarity_score": clarity_score,
            "technical_depth_score": technical_depth_score,
            "confidence_score": confidence_score,
            "feedback": feedback,
            "keywords": ["Offline"],
        }


print("[OK] analyze_answer.py loaded | time-aware scoring with industry-standard rubric")
