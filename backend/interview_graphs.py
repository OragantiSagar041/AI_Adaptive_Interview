import json
from typing import Any, Dict, List, TypedDict, Optional
from ai_client import chat_completion
from ai_schemas import AnswerScore, InterviewQuestion, FollowupQuestion, InterviewSummary
from typed_ai_layer import _parse_with_schema, _extract_json_robust, _truncate

try:
    from langgraph.graph import END, StateGraph
except ImportError:
    raise ImportError("LangGraph is not installed or available")


# ─── COMMON HELPERS ──────────────────────────────────────────────────────────

def _llm_json(system_prompt: str, user_prompt: str, schema_class=None, fallback=None, model="openai/gpt-4o-mini", temperature=0.1) -> Any:
    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model,
            temperature=temperature
        )
        if schema_class:
            return _parse_with_schema(raw, schema_class, fallback).to_dict()
        else:
            data = _extract_json_robust(raw)
            return data if data else fallback
    except Exception as e:
        print(f"Graph LLM Error: {e}")
        return fallback.to_dict() if hasattr(fallback, "to_dict") else fallback

# ─── 1. ANSWER SCORING GRAPH ────────────────────────────────────────────────

class AnswerScoringState(TypedDict, total=False):
    question: str
    answer: str
    context: str
    time_context: str
    time_score_hint: str
    language: str
    
    # internal
    ideal_answer: str
    key_facts_required: List[str]
    facts_mentioned: List[str]
    is_relevant: bool
    
    # final output
    result: Dict[str, Any]

def as_extract_facts(state: AnswerScoringState) -> AnswerScoringState:
    sys_prompt = "You are an expert interviewer. Generate an ideal answer and extract 3-5 core factual concepts required."
    usr_prompt = f"Question: {state.get('question')}\nContext: {state.get('context')}\n\nReturn JSON: {{'ideal_answer': '...', 'key_facts_required': ['fact1']}}"
    res = _llm_json(sys_prompt, usr_prompt, fallback={"ideal_answer": "N/A", "key_facts_required": []})
    
    state["ideal_answer"] = res.get("ideal_answer", "N/A")
    state["key_facts_required"] = res.get("key_facts_required", [])
    return state

def as_analyze_candidate(state: AnswerScoringState) -> AnswerScoringState:
    sys_prompt = "Analyze if the candidate mentioned the required facts. Is the answer relevant? Return JSON."
    usr_prompt = f"Candidate Answer: {state.get('answer')}\nRequired Facts: {state.get('key_facts_required')}\n\nReturn JSON: {{'is_relevant': true, 'facts_mentioned': ['fact1']}}"
    res = _llm_json(sys_prompt, usr_prompt, fallback={"is_relevant": False, "facts_mentioned": []})
    
    # Be forgiving if boolean is string
    rel = res.get("is_relevant", False)
    if isinstance(rel, str):
        rel = rel.lower() == 'true'
        
    state["is_relevant"] = rel
    state["facts_mentioned"] = res.get("facts_mentioned", [])
    return state

def as_compute_score(state: AnswerScoringState) -> AnswerScoringState:
    sys_prompt = "Score the answer based on facts hit, relevance, and time. Return JSON conforming to the schema."
    usr_prompt = f"""
Candidate Answer: {state.get('answer')}
Is Relevant: {state.get('is_relevant')}
Required Facts: {state.get('key_facts_required')}
Facts Hit: {state.get('facts_mentioned')}
Time Context: {state.get('time_context')}
Time Hint: {state.get('time_score_hint')}

Return JSON matching AnswerScore schema. Include 'corrected_answer': '{state.get('ideal_answer')}'.
    """
    fallback = AnswerScore(feedback="Failed to score.", overall_score=0, content_score=0, relevance_score=0)
    result = _llm_json(sys_prompt, usr_prompt, schema_class=AnswerScore, fallback=fallback)
    
    result["key_facts_required"] = state.get("key_facts_required", [])
    result["facts_mentioned_by_candidate"] = state.get("facts_mentioned", [])
    result["is_relevant"] = state.get("is_relevant", False)
    
    state["result"] = result
    return state

def build_answer_scoring_graph():
    g = StateGraph(AnswerScoringState)
    g.add_node("extract_facts", as_extract_facts)
    g.add_node("analyze_candidate", as_analyze_candidate)
    g.add_node("compute_score", as_compute_score)
    g.set_entry_point("extract_facts")
    g.add_edge("extract_facts", "analyze_candidate")
    g.add_edge("analyze_candidate", "compute_score")
    g.add_edge("compute_score", END)
    return g.compile()

ANSWER_SCORING_GRAPH = build_answer_scoring_graph()

def run_answer_scoring_graph(question, answer, context, time_spent, time_limit, language, time_context, time_score_hint):
    state: AnswerScoringState = {
        "question": question,
        "answer": answer,
        "context": context,
        "time_context": time_context,
        "time_score_hint": time_score_hint,
        "language": language
    }
    final_state = ANSWER_SCORING_GRAPH.invoke(state)
    return final_state.get("result", AnswerScore().to_dict())

# ─── 2. QUESTION GENERATION GRAPH ──────────────────────────────────────────

class QuestionGenerationState(TypedDict, total=False):
    resume_text: str
    jd_text: str
    num_questions: int
    interview_type: str
    industry: str
    language: str
    
    # internal
    extracted_topics: List[str]
    drafts: List[Dict]
    
    # final output
    result: List[Dict]

def qg_parse_context(state: QuestionGenerationState) -> QuestionGenerationState:
    sys = "Extract key topics from JD/Resume for interview questions."
    usr = f"JD: {state.get('jd_text', '')}\nResume: {state.get('resume_text', '')}\nReturn JSON: {{'topics': ['topic1']}}"
    res = _llm_json(sys, usr, fallback={"topics": ["General Experience"]})
    state["extracted_topics"] = res.get("topics", ["General Experience"])
    return state

def qg_draft_questions(state: QuestionGenerationState) -> QuestionGenerationState:
    num = state.get("num_questions", 6)
    lang = state.get("language", "English")
    sys = f"Draft technical interview questions as a JSON array. CRITICAL: You MUST generate all question texts strictly in the {lang} language. Do NOT use English."
    usr = f"Topics: {state.get('extracted_topics')}\nGenerate {num} questions in language {lang}.\nReturn JSON: {{'questions': [{{'question':'...', 'difficulty':'Medium', 'type':'Technical', 'category':'Core'}}]}}"
    res = _llm_json(sys, usr, fallback={"questions": []})
    state["drafts"] = res.get("questions", [])
    return state

def qg_validate_format(state: QuestionGenerationState) -> QuestionGenerationState:
    drafts = state.get("drafts", [])
    lang = state.get("language", "English")
    valid_qs = []
    for i, d in enumerate(drafts):
        try:
            default_q = "Could you describe your experience with technology?"
            if lang != "English":
                try:
                    from offline_language_fallback import OFFLINE_LANGUAGE_TECHNICAL_QUESTIONS
                    lang_tech = OFFLINE_LANGUAGE_TECHNICAL_QUESTIONS.get(lang, [])
                    if lang_tech:
                        default_q = lang_tech[i % len(lang_tech)]
                except Exception:
                    pass
            q = _parse_with_schema(json.dumps(d), InterviewQuestion, InterviewQuestion(question=default_q, id=i+1))
            q.id = i + 1
            item = q.to_dict()
            item["_generation_origin"] = "LLM" if item.get("question") != default_q else "validation fallback"
            valid_qs.append(item)
        except Exception:
            pass
    if not valid_qs:
        fallback_q = "Could you tell me about your experience?"
        if lang != "English":
            try:
                from offline_language_fallback import OFFLINE_LANGUAGE_INTRO_QUESTIONS
                fallback_q = OFFLINE_LANGUAGE_INTRO_QUESTIONS.get(lang, fallback_q)
            except Exception:
                pass
        item = InterviewQuestion(question=fallback_q, id=1).to_dict()
        item["_generation_origin"] = "validation fallback"
        valid_qs = [item]
    state["result"] = valid_qs
    return state

def build_question_generation_graph():
    g = StateGraph(QuestionGenerationState)
    g.add_node("parse_context", qg_parse_context)
    g.add_node("draft_questions", qg_draft_questions)
    g.add_node("validate_format", qg_validate_format)
    g.set_entry_point("parse_context")
    g.add_edge("parse_context", "draft_questions")
    g.add_edge("draft_questions", "validate_format")
    g.add_edge("validate_format", END)
    return g.compile()

QUESTION_GENERATION_GRAPH = build_question_generation_graph()

def run_question_generation_graph(resume, jd, num_questions, interview_type, industry, language):
    state: QuestionGenerationState = {
        "resume_text": resume or "",
        "jd_text": jd or "",
        "num_questions": num_questions,
        "interview_type": interview_type,
        "industry": industry,
        "language": language
    }
    final_state = QUESTION_GENERATION_GRAPH.invoke(state)
    return final_state.get("result", [])


# ─── 3. FOLLOW-UP GRAPH ────────────────────────────────────────────────────

class FollowUpState(TypedDict, total=False):
    answer: str
    resume_context: str
    jd_text: str
    current_q_id: int
    followup_streak: int
    language: str
    
    # internal
    gap_analysis: str
    
    # final
    result: Dict[str, Any]

def fu_analyze_gap(state: FollowUpState) -> FollowUpState:
    sys = "Analyze the candidate's answer and identify one missing depth/weakness."
    usr = f"Answer: {state.get('answer')}\nReturn JSON: {{'missing_depth': '...'}}"
    res = _llm_json(sys, usr, fallback={"missing_depth": "No obvious gaps."})
    state["gap_analysis"] = res.get("missing_depth", "No obvious gaps.")
    return state

def fu_draft_followup(state: FollowUpState) -> FollowUpState:
    sys = "Draft a follow-up question based on the missing depth. Keep it conversational."
    usr = f"Missing Depth: {state.get('gap_analysis')}\nLanguage: {state.get('language')}\nReturn JSON for FollowupQuestion schema."
    res = _llm_json(sys, usr, schema_class=FollowupQuestion, fallback=FollowupQuestion(question="Can you elaborate on that?"))
    res["id"] = state.get("current_q_id", 0) + 1
    state["result"] = res
    return state

def build_followup_graph():
    g = StateGraph(FollowUpState)
    g.add_node("analyze_gap", fu_analyze_gap)
    g.add_node("draft_followup", fu_draft_followup)
    g.set_entry_point("analyze_gap")
    g.add_edge("analyze_gap", "draft_followup")
    g.add_edge("draft_followup", END)
    return g.compile()

FOLLOW_UP_GRAPH = build_followup_graph()

def run_followup_graph(answer, resume, jd, q_id, streak, language):
    if streak >= 3:
        from typed_ai_layer import generate_followup
        return generate_followup(answer, resume, jd, q_id, streak, language)
        
    state: FollowUpState = {
        "answer": answer,
        "resume_context": resume,
        "jd_text": jd,
        "current_q_id": q_id,
        "followup_streak": streak,
        "language": language
    }
    final_state = FOLLOW_UP_GRAPH.invoke(state)
    return final_state.get("result", FollowupQuestion(id=q_id+1, question="Can you elaborate?").to_dict())

# ─── 4. SUMMARY GRAPH ───────────────────────────────────────────────────────

class SummaryState(TypedDict, total=False):
    candidate_name: str
    answers_data: List[Dict]
    
    # internal
    aggregate_stats: Dict
    
    # final
    result: Dict[str, Any]

def sg_aggregate(state: SummaryState) -> SummaryState:
    ans = state.get("answers_data", [])
    avg = sum(a.get("ai_score", 0) or 0 for a in ans) / len(ans) if ans else 0
    state["aggregate_stats"] = {"avg": avg, "count": len(ans)}
    return state

def sg_draft_summary(state: SummaryState) -> SummaryState:
    sys = "Draft a final interview summary matching the InterviewSummary schema."
    ans = state.get("answers_data", [])
    compressed = "\n".join([f"Q: {a.get('question_text', '')[:50]} | Score: {a.get('ai_score', 0)}" for a in ans])
    usr = f"Candidate: {state.get('candidate_name')}\nStats: {state.get('aggregate_stats')}\nQA: {compressed}\nReturn JSON."
    fallback = InterviewSummary(recommendation="Borderline")
    res = _llm_json(sys, usr, schema_class=InterviewSummary, fallback=fallback)
    state["result"] = res
    return state

def build_summary_graph():
    g = StateGraph(SummaryState)
    g.add_node("aggregate", sg_aggregate)
    g.add_node("draft_summary", sg_draft_summary)
    g.set_entry_point("aggregate")
    g.add_edge("aggregate", "draft_summary")
    g.add_edge("draft_summary", END)
    return g.compile()

SUMMARY_GRAPH = build_summary_graph()

def run_summary_graph(candidate_name, answers_data):
    state: SummaryState = {
        "candidate_name": candidate_name,
        "answers_data": answers_data
    }
    final_state = SUMMARY_GRAPH.invoke(state)
    return final_state.get("result", InterviewSummary().to_dict())
