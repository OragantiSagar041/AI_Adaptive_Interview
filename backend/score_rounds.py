"""
score_rounds.py
---------------
Composite scoring helpers for coding round and case study round.

Coding Score (Standard Interview):
  100% based on test cases passed ratio → (all_passed / all_total) * 100

Coding Score (Voice Interview with Zara):
  60% test cases ratio + 40% AI evaluation of verbal explanation

Case Study Score:
  AI evaluates each candidate answer against its scenario question → avg 0–100

blend_scores():
  Combines verbal, coding, case_study into a single weighted final score.
"""

from typing import Optional, Dict, Any
from ai_client import chat_completion, extract_json


# ──────────────────────────────────────────────────────────
# CODING ROUND SCORE
# ──────────────────────────────────────────────────────────

def compute_coding_score(
    coding_round: Dict[str, Any],
    interview_format: str = "Standard",
    language: str = "English",
) -> float:
    """
    Returns a 0–100 coding score.

    For Standard interviews → purely based on test case pass ratio.
    For Voice interviews    → 60% test cases + 40% verbal explanation quality.
    """
    if not coding_round:
        return 0.0

    # ── Test-case ratio ────────────────────────────────────
    test_score = _compute_test_case_ratio(coding_round)

    is_voice = (interview_format or "").lower() in ("voice", "zara")

    if not is_voice:
        return round(test_score, 1)

    # ── Voice: add explanation quality ────────────────────
    explanation_score = _evaluate_explanation(coding_round, language)
    combined = (test_score * 0.60) + (explanation_score * 0.40)
    return round(combined, 1)


def _compute_test_case_ratio(coding_round: Dict[str, Any]) -> float:
    """
    Looks at the most recent run result stored in coding_round["latest_run"]
    and computes what % of tests passed (both visible and hidden).
    Falls back to 0 if no run data exists.
    """
    latest_run = coding_round.get("latest_run") or {}

    visible = latest_run.get("visible_results", []) or []
    hidden  = latest_run.get("hidden_summary", {}) or {}

    vis_pass  = sum(1 for r in visible if r.get("passed"))
    vis_total = len(visible)

    hid_pass  = hidden.get("passed", 0)
    hid_total = hidden.get("total", 0)

    total_pass  = vis_pass  + hid_pass
    total_tests = vis_total + hid_total

    if total_tests == 0:
        # No test run yet – give 0
        return 0.0

    return (total_pass / total_tests) * 100.0


def _evaluate_explanation(coding_round: Dict[str, Any], language: str = "English") -> Optional[float]:
    """
    Asks the AI to score (0–100) how well the candidate explained their
    approach verbally (stored in coding_round["latest_explanation"]).
    """
    explanation = (coding_round.get("latest_explanation") or "").strip()
    task        = coding_round.get("task", {}) or {}
    code        = (coding_round.get("latest_code") or "").strip()

    if not explanation or not task:
        return 0.0

    task_title = task.get("title", "coding problem")
    task_desc  = task.get("description", "")

    prompt = f"""You are a senior technical interviewer evaluating a candidate's verbal explanation of their coding solution.

Problem: {task_title}
Description: {task_desc[:500]}

Candidate's Code:
{code[:800]}

Candidate's Verbal Explanation:
{explanation[:600]}

CRITICAL LANGUAGE REQUIREMENT:
You MUST evaluate based on technical accuracy. But respond ONLY with valid JSON.

Score the explanation from 0 to 100 based on:
1. Technical accuracy – does the explanation correctly describe what the code does?
2. Clarity – is the approach clearly communicated?
3. Technique awareness – does the candidate mention the algorithm/data structure they used?

Respond ONLY with:
{{"score": <number 0-100>, "reason": "<one sentence>"}}"""

    try:
        resp = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=120,
        )
        data = extract_json(resp or "")
        score = float(data.get("score", 0))
        return max(0.0, min(100.0, score))
    except Exception as e:
        print(f"[score_rounds] Explanation eval error: {e}")
        return None


# ──────────────────────────────────────────────────────────
# CASE STUDY ROUND SCORE
# ──────────────────────────────────────────────────────────

def compute_case_study_score(
    case_study_round: Dict[str, Any],
    context: str = "",
    language: str = "English",
) -> Optional[float]:
    """
    Returns a 0–100 case study score by asking the AI to evaluate each
    candidate answer against its scenario question.
    """
    if not case_study_round:
        return None

    questions = case_study_round.get("questions", []) or []
    answers   = case_study_round.get("answers", []) or []

    if not questions or not answers:
        return None

    # Pair questions with their answers
    pairs = []
    for i, q in enumerate(questions):
        q_text = ""
        if isinstance(q, dict):
            q_text = (
                q.get("scenario") or
                q.get("question") or
                q.get("text") or
                q.get("title") or
                str(q)
            )
        elif isinstance(q, str):
            q_text = q

        a_text = ""
        if i < len(answers):
            ans = answers[i]
            if isinstance(ans, dict):
                a_text = ans.get("answer_text") or ""
            elif isinstance(ans, str):
                a_text = ans

        if q_text and a_text:
            pairs.append((q_text, a_text))

    if not pairs:
        return None

    # Build a single AI call to evaluate all pairs at once
    qa_block = ""
    for idx, (q, a) in enumerate(pairs, 1):
        qa_block += f"\nScenario {idx}:\nQ: {q[:400]}\nA: {a[:500]}\n"

    prompt = f"""You are an expert business analyst and technical interviewer evaluating case study answers.

Context (Job description / candidate profile):
{context[:500]}

Case Study Questions and Candidate Answers:
{qa_block}

CRITICAL LANGUAGE REQUIREMENT:
Evaluate based on content quality regardless of the language used. Respond ONLY in valid JSON.

For each scenario, score the answer from 0–100 based on:
1. Relevance – does the answer address the specific scenario?
2. Practicality – is the proposed solution realistic and actionable?
3. Depth of reasoning – does the candidate show analytical thinking?

Respond ONLY with a valid JSON object in exactly this format:
{{
  "scores": [<score_for_scenario_1>, <score_for_scenario_2>, ...],
  "avg_score": <average of all scores>
}}"""

    try:
        resp = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
        )
        data = extract_json(resp or "")
        scores = data.get("scores")
        if scores and isinstance(scores, list):
            valid_scores = [float(s) for s in scores if isinstance(s, (int, float, str)) and str(s).replace('.', '', 1).isdigit()]
            avg = sum(valid_scores) / len(valid_scores) if valid_scores else 0.0
        else:
            avg = float(data.get("avg_score", 0))
        return round(max(0.0, min(100.0, avg)), 1)
    except Exception as e:
        print(f"[score_rounds] Case study eval error: {e}")
        return None


# ──────────────────────────────────────────────────────────
# BLENDING
# ──────────────────────────────────────────────────────────

def blend_scores(
    verbal_score: float,
    coding_score: Optional[float] = None,
    case_study_score: Optional[float] = None,
) -> float:
    """
    Weighted blend:
    - Only verbal          → 100% verbal
    - verbal + coding      → 50% verbal + 50% coding
    - verbal + case_study  → 50% verbal + 50% case_study
    - all three            → 34% verbal + 33% coding + 33% case_study
    """
    has_coding     = coding_score is not None
    has_case_study = case_study_score is not None

    if has_coding and has_case_study:
        blended = (verbal_score * 0.34) + (coding_score * 0.33) + (case_study_score * 0.33)
    elif has_coding:
        blended = (verbal_score * 0.50) + (coding_score * 0.50)
    elif has_case_study:
        blended = (verbal_score * 0.50) + (case_study_score * 0.50)
    else:
        blended = verbal_score

    return round(blended, 1)
