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
        "explain", "describe", "tell", "candidate", "question", "answer", "role", "using",
        "hello", "hi", "hey", "name"
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
            "content_score": 0, "relevance_score": 0, "time_score": 0,
            "clarity_score": 0, "confidence_score": 0, "technical_depth_score": 0,
            "feedback": "No answer recorded.", "keywords": []
        }

    # HR / LOGISTICS BYPASS
    # Simple questions (like relocation, on-site, notice period) do not require technical essays.
    lower_q = question.lower()
    hr_keywords = ["comfortable", "willing to", "relocate", "on-site", "onsite", "remote", "hybrid", "notice period", "salary", "shift", "located"]
    is_hr_question = any(kw in lower_q for kw in hr_keywords)

    if is_hr_question and word_count >= 4:
        lower_ans = answer.lower()
        positive_words = {"yes", "yeah", "okay", "sure", "ready", "fine", "agree", "can", "will", "am", "do"}
        if any(pw in lower_ans for pw in positive_words):
            return {
                "content_score": 45,  # 45/50
                "relevance_score": 30, # 30/30
                "time_score": 15,     # 15/20
                "clarity_score": 85,
                "technical_depth_score": 0,
                "confidence_score": 90,
                "feedback": "Offline Analysis: Provided a clear, direct answer to the screening question.",
                "keywords": ["Screening"]
            }

    # EXPANDED TECHNICAL VOCABULARY
    domain_vocab = {
        "code", "data", "system", "algorithm", "database", "api", "function", "method",
        "class", "object", "interface", "server", "client", "network", "security",
        "performance", "optimiz", "framework", "architecture", "component", "state",
        "testing", "deploy", "pipeline", "async", "sync", "thread", "process", "logic",
        "model", "schema", "query", "index", "cache", "frontend", "backend", "fullstack",
        "design", "management", "lead", "team", "project", "strategy", "deliver", "scale",
        # Modern Tech / ML / AI
        "python", "java", "javascript", "react", "node", "aws", "cloud", "azure", "sql",
        "nosql", "machine", "learning", "deep", "ai", "ml", "llm", "llms", "rag", "nlp",
        "pandas", "numpy", "docker", "kubernetes", "git", "ci/cd", "agile", "scrum", "vision"
    }
    
    matched_domain_terms = set()
    for word in a_token_set:
        for term in domain_vocab:
            if term in word:
                matched_domain_terms.add(word)

    # 1. RELEVANCE SCORE (0-30 pts)
    q_matches = q_tokens.intersection(a_token_set)
    q_overlap_ratio = len(q_matches) / len(q_tokens) if q_tokens else 0.5
    
    # PARROT CHECK: Is the answer just repeating the question?
    parrot_ratio = len(q_matches) / len(a_token_set) if a_token_set else 0.0
    is_parroting = parrot_ratio > 0.65 and len(matched_domain_terms) < 3

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
        
    # Boost relevance if they used strong domain terminology (e.g. introductory questions)
    if len(matched_domain_terms) >= 3 and relevance_s < 20:
        relevance_s = min(30, relevance_s + int(len(matched_domain_terms) * 3))

    if is_parroting:
        relevance_s = 0 # Heavily penalize repeating the question

    relevance_s = max(0, min(30, relevance_s))

    # 2. CONTENT SCORE (0-70 pts) -> The "Pure Accuracy" Model
    explanation_indicators = {
        "because", "therefore", "thus", "for example", "for instance", "such as",
        "however", "although", "consequently", "result", "firstly", "secondly",
        "finally", "specifically", "implemented", "solved", "process", "approach",
        "using", "method", "solution", "advantage", "benefit", "impact", "designed"
    }
    lower_ans = answer.lower()
    exp_count = sum(1 for exp in explanation_indicators if exp in lower_ans)

    # Technical Score (Max 40 points): Heavy reward for hitting technical vocabulary
    tech_score = min(40, int(len(matched_domain_terms) * 8))
    
    # Coverage & Structure (Max 30 points): Reward for answering the prompt and explaining well
    coverage_score = min(20, int(len(q_matches) * 5))
    structure_score = min(10, exp_count * 3)

    if is_parroting:
        tech_score = 0
        coverage_score = 0
        structure_score = 0

    content_s = tech_score + coverage_score + structure_score
    content_s = max(0, min(70, content_s))

    # 3. TIME SCORE (0 pts - Disabled in Pure Accuracy Model)
    time_s = 0

    # 4. TECHNICAL DEPTH SCORE (0-100 pts)
    tech_ratio = len(matched_domain_terms) / len(a_token_set) if a_token_set else 0
    if tech_ratio > 0.15 or len(matched_domain_terms) >= 4:
        technical_depth_score = 85
    elif tech_ratio > 0.08 or len(matched_domain_terms) >= 2:
        technical_depth_score = 65
    elif len(matched_domain_terms) >= 1:
        technical_depth_score = 50
    else:
        technical_depth_score = 35
        
    if is_parroting:
        technical_depth_score = 0

    # 5. CLARITY SCORE (0-100 pts)
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

    # 6. CONFIDENCE SCORE (0-100 pts)
    hedging_words = [" um ", " uh ", " like ", " i mean ", " sort of ", " kind of ", " maybe ", " probably ", " i guess ", " not sure "]
    padded_ans = " " + lower_ans + " "
    hedge_count = sum(padded_ans.count(h) for h in hedging_words)
    confidence_score = max(20, 90 - (hedge_count * 5))

    extracted_keywords = list(q_matches)[:3] + list(matched_domain_terms)[:2] if (q_matches or matched_domain_terms) else ["Offline"]
    
    if is_parroting:
        feedback = "Offline Analysis: Candidate repeated the question rather than providing a meaningful answer."
    else:
        feedback = (
            f"Offline Analysis: Evaluated dynamically. "
            f"Matched {len(q_matches)} question concept(s) and {len(matched_domain_terms)} technical term(s)."
        )

    return {
        "content_score": content_s,
        "relevance_score": relevance_s,
        "time_score": time_s,
        "clarity_score": clarity_score,
        "technical_depth_score": technical_depth_score,
        "confidence_score": confidence_score,
        "feedback": feedback,
        "keywords": extracted_keywords,
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

    Scoring Rubric (Pure Accuracy Model):
      - Content Quality   : 70 pts  (technical depth, accuracy, examples, structure)
      - Relevance         : 30 pts  (how directly the answer addresses the question, 0 if parroting)
      - Time Efficiency   : 0 pts   (disabled)

    Final overall_score = content_score + relevance_score (max 100).
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

    # TOKEN SAVE: Cap answer at 600 words - adequate for full scoring
    answer_words = answer.split()
    if len(answer_words) > 600:
        answer = " ".join(answer_words[:600]) + " ...[truncated]"

    # USER message - concise, variable data only (system prompt is cached above)
    prompt = f"""Score this interview answer. Language for feedback: {language}.

Context: {context[:500] if context else 'N/A'}
Question: "{question[:300]}"
Answer: "{answer}"

RULES:
- Score the CANDIDATE'S ANSWER only, not the suggested answer.
- overall_score = content_score + relevance_score (max 100).
- content_score is max 70.
- relevance_score is max 30.
- time_score MUST be strictly 0.
- Also score clarity_score, technical_depth_score, confidence_score (each 0-100).
- Return VALID JSON ONLY.

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
    content_s = max(0, min(70, content_s))
    relevance_s = max(0, min(30, relevance_s))
    time_s = 0 # Time score is disabled in Pure Accuracy model
    
    result_dict["content_score"] = content_s
    result_dict["relevance_score"] = relevance_s
    result_dict["time_score"] = time_s
    
    # STRICT OVERRIDE: overall_score MUST be the mathematical sum
    result_dict["overall_score"] = content_s + relevance_s

    # Final constraints for secondary components
    for k in ["clarity_score", "technical_depth_score", "confidence_score"]:
        result_dict[k] = max(0, min(100, int(result_dict.get(k, 0))))
    
    return result_dict




print("[OK] analyze_answer.py loaded | time-aware scoring with industry-standard rubric")
