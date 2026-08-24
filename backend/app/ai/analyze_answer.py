import json
from app.ai.ai_client import chat_completion, extract_json

# Route AI scoring through LangGraph workflows
try:
    from app.data.interview_graphs import run_answer_scoring_graph
    _GRAPH_LAYER_AVAILABLE = True
except ImportError:
    _GRAPH_LAYER_AVAILABLE = False

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


def _dynamic_offline_evaluation(
    question: str,
    answer: str,
    context: str = "",
    time_spent_seconds: int = 0,
    time_limit_seconds: int = 120,
) -> dict:
    import re
    
    stop_words = {
        "a", "an", "the", "and", "or", "but", "if", "because", "as", "what", "which",
        "who", "whom", "this", "that", "these", "those", "am", "is", "are", "was", "were",
        "be", "been", "being", "have", "has", "had", "having", "do", "does", "did", "doing",
        "how", "why", "when", "where", "can", "could", "should", "would", "may", "might",
        "must", "shall", "to", "of", "in", "for", "on", "with", "at", "by", "from", "up",
        "about", "into", "over", "after", "your", "my", "our", "you", "me", "we", "us",
        "explain", "describe", "tell", "candidate", "question", "answer", "role", "using"
    }

    def tokenize(text: str):
        words = re.findall(r'\b[a-zA-Z0-9_+#\.-]+\b', (text or "").lower())
        return [w for w in words if w not in stop_words and len(w) > 1]

    q_tokens = set(tokenize(question))
    c_tokens = set(tokenize(context))
    words_list = (answer or "").split()
    a_tokens = tokenize(answer)
    a_token_set = set(a_tokens)
    word_count = len(words_list)

    if word_count == 0:
        return {
            "content_score": 0,
            "relevance_score": 0,
            "time_score": 0,
            "clarity_score": 0,
            "confidence_score": 0,
            "technical_depth_score": 0,
            "feedback": "No answer recorded.",
            "keywords": []
        }

    # 1. RELEVANCE SCORE (0–30 pts): Measures how directly the answer addresses question terms
    q_matches = q_tokens.intersection(a_token_set)
    q_overlap_ratio = len(q_matches) / len(q_tokens) if q_tokens else 0.5
    c_matches = c_tokens.intersection(a_token_set)
    c_overlap_ratio = len(c_matches) / len(c_tokens) if c_tokens else 0.0

    if q_tokens:
        if q_overlap_ratio >= 0.60:
            relevance_s = int(24 + (q_overlap_ratio - 0.60) * 15)
        elif q_overlap_ratio >= 0.30:
            relevance_s = int(16 + (q_overlap_ratio - 0.30) * 26.6)
        elif q_overlap_ratio >= 0.10:
            relevance_s = int(8 + (q_overlap_ratio - 0.10) * 40)
        else:
            relevance_s = int(q_overlap_ratio * 80)
    else:
        relevance_s = 15
    relevance_s = max(0, min(30, relevance_s))

    # 2. CONTENT SCORE (0–50 pts): Concept coverage, structural reasoning, and response depth
    explanation_indicators = {
        "because", "therefore", "thus", "for example", "for instance", "such as",
        "however", "although", "consequently", "result", "firstly", "secondly",
        "finally", "specifically", "implemented", "solved", "process", "approach",
        "using", "method", "solution", "advantage", "benefit", "impact", "designed"
    }
    lower_ans = answer.lower()
    exp_count = sum(1 for exp in explanation_indicators if exp in lower_ans)

    coverage_score = min(25, int(len(q_matches) * 5))
    structure_score = min(15, exp_count * 4)
    length_depth_score = min(10, int(word_count / 15))

    content_s = coverage_score + structure_score + length_depth_score
    content_s = max(0, min(50, content_s))

    # 3. TIME SCORE (0–20 pts)
    time_s = 12
    if time_spent_seconds > 0 and time_limit_seconds > 0:
        pct = time_spent_seconds / time_limit_seconds
        if 0.35 <= pct <= 0.85:
            time_s = 18
        elif 0.20 <= pct < 0.35:
            time_s = 14
        elif pct < 0.20:
            time_s = 5
        elif pct > 1.10:
            time_s = 8

    # 4. TECHNICAL DEPTH SCORE (0–100 pts)
    domain_vocab = {
        "code", "data", "system", "algorithm", "database", "api", "function", "method",
        "class", "object", "interface", "server", "client", "network", "security",
        "performance", "optimiz", "framework", "architecture", "component", "state",
        "testing", "deploy", "pipeline", "async", "sync", "thread", "process", "logic",
        "model", "schema", "query", "index", "cache", "frontend", "backend", "fullstack",
        "design", "management", "lead", "team", "project", "strategy", "deliver", "scale"
    }
    matched_domain_terms = set()
    for word in a_token_set:
        for term in domain_vocab:
            if term in word:
                matched_domain_terms.add(word)

    tech_ratio = len(matched_domain_terms) / len(a_token_set) if a_token_set else 0
    if tech_ratio > 0.15 or len(matched_domain_terms) >= 4:
        technical_depth_score = 85
    elif tech_ratio > 0.08 or len(matched_domain_terms) >= 2:
        technical_depth_score = 65
    elif len(matched_domain_terms) >= 1:
        technical_depth_score = 50
    else:
        technical_depth_score = 35

    # 5. CLARITY SCORE (0–100 pts)
    clarity_score = 50
    if time_spent_seconds > 0 and word_count > 0:
        wpm = (word_count / time_spent_seconds) * 60
        if 110 <= wpm <= 160:
            clarity_score = 85
        elif 80 <= wpm < 110 or 160 < wpm <= 190:
            clarity_score = 65
        else:
            clarity_score = 45
    elif word_count >= 15:
        clarity_score = 70

    # 6. CONFIDENCE SCORE (0–100 pts)
    hedging_words = [" um ", " uh ", " like ", " i mean ", " sort of ", " kind of ", " maybe ", " probably ", " i guess ", " not sure "]
    padded_ans = " " + lower_ans + " "
    hedge_count = sum(padded_ans.count(h) for h in hedging_words)
    confidence_score = max(20, 90 - (hedge_count * 5))

    extracted_keywords = list(q_matches)[:5] if q_matches else list(a_token_set)[:5]
    feedback = (
        f"Offline Analysis: Evaluated dynamically against question concepts. "
        f"Matched {len(q_matches)} key concept(s) from the question."
    )

    return {
        "content_score": content_s,
        "relevance_score": relevance_s,
        "time_score": time_s,
        "clarity_score": clarity_score,
        "technical_depth_score": technical_depth_score,
        "confidence_score": confidence_score,
        "feedback": feedback,
        "keywords": extracted_keywords if extracted_keywords else ["Offline"],
    }


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
        # Use LangGraph based multi-step scoring
        if _GRAPH_LAYER_AVAILABLE:
            result_dict = run_answer_scoring_graph(
                question=question,
                answer=answer,
                context=context,
                time_spent=time_spent_seconds,
                time_limit=time_limit_seconds,
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
            result_dict = extract_json(content)
            if not result_dict:
                raise Exception("No JSON found in AI response")
            
    except Exception as e:
        print(f"⚠️ Analysis API Failed: {e}")

        # ── FALLBACK: Dynamic offline scoring (evaluate answer against actual question) ──
        result_dict = _dynamic_offline_evaluation(
            question=question,
            answer=answer,
            context=context,
            time_spent_seconds=time_spent_seconds,
            time_limit_seconds=time_limit_seconds,
        )

    # ── COMMON PROCESSING: Enforce Math & Guardrails ──
    content_s = int(result_dict.get("content_score", 0))
    relevance_s = int(result_dict.get("relevance_score", 0))
    time_s = int(result_dict.get("time_score", 0))
    
    # Guardrails against single-word hallucinations & offline stubs
    if len(answer_words) < 5:
        # An answer this short is fundamentally invalid (Hard Zero Rule)
        content_s = 0
        relevance_s = 0
        time_s = 0
        result_dict["feedback"] = "Answer is too short to evaluate. Please provide a full, detailed explanation."
    elif len(answer_words) < 10:
        content_s = min(content_s, 8)
        relevance_s = min(relevance_s, 5)
        if "too short" not in result_dict.get("feedback", "").lower():
            result_dict["feedback"] = (
                "Your answer was too short to evaluate meaningfully. "
                "Please provide a detailed response. "
                + result_dict.get("feedback", "")
            )
            
    # Clamp rubric components before computing overall_score
    content_s = max(0, min(50, content_s))
    relevance_s = max(0, min(30, relevance_s))
    time_s = max(0, min(20, time_s))
    
    result_dict["content_score"] = content_s
    result_dict["relevance_score"] = relevance_s
    result_dict["time_score"] = time_s
    
    # STRICT OVERRIDE: overall_score MUST be the mathematical sum
    result_dict["overall_score"] = content_s + relevance_s + time_s

    # Final constraints for secondary components
    for k in ["clarity_score", "technical_depth_score", "confidence_score"]:
        result_dict[k] = max(0, min(100, int(result_dict.get(k, 0))))
    
    return result_dict




print("[OK] analyze_answer.py loaded | time-aware scoring with industry-standard rubric")
