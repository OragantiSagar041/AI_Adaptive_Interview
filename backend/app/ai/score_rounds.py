"""
score_rounds.py
---------------
Composite scoring helpers for coding round and case study round.

Verbal Question-Answer Score:
  80 marks max based on dynamically weighted technical questions.

Coding Score / Case Study Score:
  20 marks max based strictly on test cases passed ratio (or case study AI evaluation).

Final Composite Score:
  Out of 100 marks total (Round 1 Score + Round 2 Score)
"""

from typing import Optional, Dict, Any
from app.ai.ai_client import chat_completion, extract_json


# ──────────────────────────────────────────────────────────
# CODING ROUND SCORE
# ──────────────────────────────────────────────────────────

def compute_coding_score(
    coding_round: Dict[str, Any],
    interview_format: str = "Standard",
    language: str = "English",
) -> float:
    """
    Returns a 0–100 coding score based ONLY on test cases passed ratio.
    """
    if not coding_round:
        return 0.0

    # ── Test-case ratio ────────────────────────────────────
    return round(_compute_test_case_ratio(coding_round), 1)


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

    prompt = f"""You are a senior executive interviewer evaluating a candidate's written case study strategy.

CRITICAL ANTI-HALLUCINATION GUARDRAILS:
1. Evaluate STRICTLY based on the exact statements in the candidate's written text.
2. Do NOT assume, infer, or fabricate any candidate tools, experience, or action steps that are not explicitly written.
3. If a candidate answer is vague, incomplete, or off-topic, score it strictly lower without inventing unstated context.

Context (Job description / candidate profile):
{context[:500]}

Case Study Questions and Candidate Answers:
{qa_block}

SCORING RUBRIC (0-100 per scenario):
1. Relevant Action Plan (0-40 pts): Did the candidate directly address the specific scenario requirements in their text?
2. Operational Feasibility (0-30 pts): Are the steps mentioned actionable and realistic?
3. Problem Identification & Structure (0-30 pts): Does the response present a clear, structured strategy?

Respond ONLY with a valid JSON object in exactly this format:
{{
  "scores": [<score_for_scenario_1>, <score_for_scenario_2>, ...],
  "avg_score": <average of all scores>
}}"""

    try:
        resp = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.1
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
    Weighted blend (100 marks total):
    - Q&A Accuracy (22 interview questions): 60 marks max (verbal_score * 0.60)
    - Coding Accuracy (test cases passed):     40 marks max (coding_score * 0.40)
    """
    has_coding     = coding_score is not None
    has_case_study = case_study_score is not None

    if has_coding:
        blended = (verbal_score * 0.60) + (coding_score * 0.40)
    elif has_case_study:
        blended = (verbal_score * 0.60) + (case_study_score * 0.40)
    else:
        blended = verbal_score

    return round(blended, 1)

# ==============================================================================
# DYNAMIC COMMON SCORING ENGINE (ONLINE & OFFLINE)
# ==============================================================================

# Max case study questions allowed (each = 10 marks of Round 2)
MAX_CASE_STUDY_QUESTIONS = 3

def get_question_weight(question: dict) -> float:
    """
    Calculate the dynamic weight of a single question.
    Every question has equal marks, so weight is always 1.0.
    """
    return 1.0


def get_marks_split(interview_type: str, n_case_study_questions: int = 0) -> tuple:
    """
    Returns (round1_max, round2_max) based on interview type.

    - Technical (+ Coding)     → (80, 20)  fixed
    - Normal (Standard AI)     → (100, 0)  verbal only
    - Non-Technical (Case Studies) → dynamic: each case study Q = 10 marks (max 3 Qs)
        e.g. 1Q → (90, 10), 2Q → (80, 20), 3Q → (70, 30)
    """
    itype = str(interview_type).strip().lower()
    if itype == "technical":
        return (80.0, 20.0)
    elif itype in ("non-technical", "non_technical", "non tech", "nontech"):
        n = min(max(int(n_case_study_questions), 0), MAX_CASE_STUDY_QUESTIONS)
        round2_max = n * 10.0
        round1_max = 100.0 - round2_max
        return (round1_max, round2_max)
    else:
        # Normal (Standard AI) and any other type → 100/0
        return (100.0, 0.0)


def calculate_round1_score(questions: list, answers: list, interview_type: str = "Technical", n_case_study_questions: int = 0) -> float:
    """
    Dynamically distributes Round 1 marks across verbal/technical questions.
    HR Screening questions are excluded from the AI score.
    Unanswered / skipped / missing answers receive 0.

    Max marks depend on interview_type:
      - Technical            → 80 marks
      - Normal               → 100 marks
      - Non-Technical        → (100 - n_case_study_questions × 10) marks
    """
    if not questions:
        return 0.0

    round1_max, _ = get_marks_split(interview_type, n_case_study_questions)

    # Exclude HR Screening questions so they don't count towards marks
    eval_questions = [q for q in questions if str(q.get("type", "")).lower() != "hr screening"]

    if not eval_questions:
        return 0.0

    total_weight = 0.0
    q_weights = {}
    for q in eval_questions:
        qid = str(q.get("id"))
        w = get_question_weight(q)
        q_weights[qid] = w
        total_weight += w

    if total_weight == 0:
        return 0.0

    # Create lookup for answers
    ans_lookup = {str(a.get("question_id")): a for a in answers}

    round1_score = 0.0

    for q in eval_questions:
        qid = str(q.get("id"))
        w = q_weights[qid]

        # Max marks for this specific question (proportional share of round1_max)
        q_max_marks = (w / total_weight) * round1_max

        ans = ans_lookup.get(qid)
        if ans and ans.get("ai_score") is not None:
            ai_score_100 = float(ans.get("ai_score", 0))
            q_marks_obtained = (ai_score_100 / 100.0) * q_max_marks
            round1_score += q_marks_obtained

    return round(min(round1_max, max(0.0, round1_score)), 1)


def calculate_coding_score(coding_round: dict) -> float:
    """
    Returns a max of 20 marks based strictly on test cases passed ratio.
    Used only for Technical (+ Coding) interviews.
    """
    if not coding_round:
        return 0.0

    test_case_ratio_pct = _compute_test_case_ratio(coding_round)
    coding_score = (test_case_ratio_pct / 100.0) * 20.0
    return round(min(20.0, max(0.0, coding_score)), 1)


def calculate_case_study_round2_score(case_study_round: dict, n_questions: int, context: str = "", language: str = "English") -> float:
    """
    Returns the Round 2 score for Non-Technical (Case Studies) interviews.
    Each question is worth 10 marks (max 3 questions = max 30 marks).
    The AI evaluates answers 0-100, then we scale to the per-question mark allocation.
    """
    if not case_study_round:
        return 0.0

    n = min(max(int(n_questions), 0), MAX_CASE_STUDY_QUESTIONS)
    if n == 0:
        return 0.0

    round2_max = n * 10.0

    # Get AI score out of 100 for the case study
    cs_score_100 = compute_case_study_score(case_study_round, context, language) or 0.0

    # Scale to round2_max
    round2_score = (cs_score_100 / 100.0) * round2_max
    return round(min(round2_max, max(0.0, round2_score)), 1)


def calculate_final_score(round1_score: float, round2_score: float = 0.0) -> float:
    """
    Sums Round 1 and Round 2 for a max Final Score of 100.
    Works for all interview types since the per-type caps are enforced upstream.
    """
    final = round1_score + round2_score
    return round(min(100.0, max(0.0, final)), 1)

