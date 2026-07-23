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

def as_evaluate_answer(state: AnswerScoringState) -> AnswerScoringState:
    sys_prompt = "You are an expert technical interviewer. Score the candidate's answer based on relevance, facts hit, and time spent. Return JSON matching the AnswerScore schema, but also include 'ideal_answer', 'key_facts_required' (list of facts), 'facts_mentioned_by_candidate' (list of facts), and 'is_relevant' (boolean)."
    usr_prompt = f"Question: {state.get('question')}\nContext: {state.get('context')}\nAnswer: {state.get('answer')}\nTime Context: {state.get('time_context')}\nTime Hint: {state.get('time_score_hint')}\nLanguage: {state.get('language')}\n\nReturn JSON."
    
    fallback = AnswerScore(feedback="Failed to score.", overall_score=0, content_score=0, relevance_score=0).to_dict()
    res = _llm_json(sys_prompt, usr_prompt, fallback=fallback)
    
    result = AnswerScore(
        feedback=res.get("feedback", fallback.get("feedback")),
        overall_score=res.get("overall_score", 0),
        content_score=res.get("content_score", 0),
        relevance_score=res.get("relevance_score", 0),
        corrected_answer=res.get("ideal_answer", "")
    ).to_dict()
    
    result["key_facts_required"] = res.get("key_facts_required", [])
    result["facts_mentioned_by_candidate"] = res.get("facts_mentioned_by_candidate", [])
    result["is_relevant"] = res.get("is_relevant", False)
    
    state["result"] = result
    return state

def build_answer_scoring_graph():
    g = StateGraph(AnswerScoringState)
    g.add_node("evaluate_answer", as_evaluate_answer)
    g.set_entry_point("evaluate_answer")
    g.add_edge("evaluate_answer", END)
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

def qg_generate_all(state: QuestionGenerationState) -> QuestionGenerationState:
    num = state.get("num_questions", 6)
    lang = state.get("language", "English")

    sys = (
        "You are an expert recruiter. Generate technical interview questions based on the candidate's "
        "Resume and Job Description. Extract key topics first, then write the questions. "
        f"All questions MUST be generated strictly in {lang}. Do NOT use English unless the selected language is English. "
        "Return JSON."
    )

    usr = (
        f"JD: {state.get('jd_text', '')}\n"
        f"Resume: {state.get('resume_text', '')}\n"
        f"Topics: {state.get('extracted_topics')}\n"
        f"Generate {num} questions in {lang}.\n"
        "Return JSON: {'questions': [{'question':'...', 'difficulty':'Medium', 'type':'Technical', 'category':'Core'}]}"
    )

    res = _llm_json(sys, usr, fallback={"questions": []}, temperature=0.7)

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
    g.add_node("generate_all", qg_generate_all)
    g.add_node("validate_format", qg_validate_format)
    g.set_entry_point("generate_all")
    g.add_edge("generate_all", "validate_format")
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

def fu_generate_all(state: FollowUpState) -> FollowUpState:
    sys = "Analyze the candidate's answer to identify a missing depth, then draft a follow-up question. Keep it conversational."
    usr = f"Q: {state.get('original_question')}\nA: {state.get('answer')}\nLanguage: {state.get('language')}\nReturn JSON for FollowupQuestion schema with fields 'question' and 'expected_answer'."
    res = _llm_json(sys, usr, schema_class=FollowupQuestion, fallback=FollowupQuestion(question="Can you elaborate on that?").to_dict())
    
    if hasattr(res, 'to_dict'):
        res = res.to_dict()
    res["id"] = state.get("current_q_id", 0) + 1
    state["result"] = res
    return state

def build_followup_graph():
    g = StateGraph(FollowUpState)
    g.add_node("generate_all", fu_generate_all)
    g.set_entry_point("generate_all")
    g.add_edge("generate_all", END)
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

def sg_draft_summary(state: SummaryState) -> SummaryState:
    sys = "Draft a final interview summary matching the InterviewSummary schema."
    ans = state.get("answers_data", [])
    avg = sum(a.get("ai_score", 0) or 0 for a in ans) / len(ans) if ans else 0
    compressed = "\n".join([f"Q: {a.get('question_text', '')[:50]} | Score: {a.get('ai_score', 0)}" for a in ans])
    usr = f"Candidate: {state.get('candidate_name')}\nStats: {avg} avg\nQA: {compressed}\nReturn JSON."
    fallback = InterviewSummary(recommendation="Borderline")
    res = _llm_json(sys, usr, schema_class=InterviewSummary, fallback=fallback)
    state["result"] = res.to_dict() if hasattr(res, 'to_dict') else res
    return state

def build_summary_graph():
    g = StateGraph(SummaryState)
    g.add_node("draft_summary", sg_draft_summary)
    g.set_entry_point("draft_summary")
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
