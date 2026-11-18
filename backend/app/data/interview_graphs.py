import json
import re
from typing import Any, Dict, List, TypedDict, Optional
from app.ai.ai_client import chat_completion
from app.ai.ai_schemas import AnswerScore, InterviewQuestion, FollowupQuestion, InterviewSummary, RecruiterQuestionItem
from app.ai.typed_ai_layer import _parse_with_schema, _extract_json_robust, _truncate, sanitize_spoken_interview_question, sanitize_verbal_question_text

try:
    from langgraph.graph import END, StateGraph
except ImportError:
    raise ImportError("LangGraph is not installed or available")


# ─── COMMON HELPERS ──────────────────────────────────────────────────────────

def _llm_json(system_prompt: str, user_prompt: str, schema_class=None, fallback=None, model="openai/gpt-4o-mini", temperature=0.1, max_tokens: int = 4096) -> Any:
    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
        if schema_class:
            parsed = _parse_with_schema(raw, schema_class, fallback)
            return parsed.to_dict() if hasattr(parsed, "to_dict") else parsed
        else:
            data = _extract_json_robust(raw)
            return data if data else fallback
    except Exception as e:
        err_msg = str(e).lower()
        print(f"Graph LLM Error: {e}")
        # Propagate quota exhaustion so offline fallback can catch it
        if "quota" in err_msg or "rate limit" in err_msg or "offline" in err_msg:
            raise e
        return fallback.to_dict() if hasattr(fallback, "to_dict") else fallback

# ─── 1. ANSWER SCORING GRAPH ────────────────────────────────────────────────

class AnswerScoringState(TypedDict, total=False):
    question: str
    answer: str
    context: str
    time_context: str
    time_score_hint: str
    language: str
    ai_instructions: str
    
    # internal
    ideal_answer: str
    key_facts_required: List[str]
    facts_mentioned: List[str]
    is_relevant: bool
    
    # final output
    result: Dict[str, Any]

def as_evaluate_answer(state: AnswerScoringState) -> AnswerScoringState:
    raw_answer = state.get("answer", "")
    from app.ai.typed_ai_layer import normalize_stt_technical_terms
    cleaned_answer = normalize_stt_technical_terms(raw_answer)
    ai_inst = state.get("ai_instructions", "").strip()

    try:
        from app.ai.analyze_answer import _normalize_closed_answer
        norm_closed = _normalize_closed_answer(raw_answer)
        if norm_closed in ("true", "false", "yes", "no"):
            cleaned_answer = f"{norm_closed.capitalize()} (STT transcription: '{raw_answer.strip()}')"
    except Exception:
        pass

    inst_section = ""
    if ai_inst:
        inst_section = (
            f"\nCUSTOM RECRUITER INSTRUCTIONS (STRICT OVERRIDE):\n"
            f"{ai_inst}\n\n"
            f"SPECIAL FORMAT / SCORING OVERRIDE RULES:\n"
            f"- If the recruiter instructions specify that questions should be answered with a single word or short direct phrase "
            f"(such as 'Yes/No', 'True/False', specific technical terms, keywords, or one-word answers) and award 100% for the correct response:\n"
            f"  * Check if this question is a direct, closed-ended, or one-word answer question.\n"
            f"  * STT REPETITIONS: Candidates speaking into microphone frequently produce repeated words (e.g. 'true true', 'false false', 'fal false', 'yes yes'). Treat 'true true' identically to 'True', and 'false false' identically to 'False'.\n"
            f"  * If the candidate answered with the correct single word, term, or appropriate Yes/No/True/False (e.g. 'Stack', 'Python', 'Yes', 'No', 'True', 'False', '404', 'Kubernetes'):\n"
            f"    award full credit: content_score = 70, relevance_score = 30, overall_score = 100.\n"
            f"  * If the candidate gave the wrong answer or an incorrect term:\n"
            f"    award content_score = 0, relevance_score = 10, overall_score = 10.\n"
            f"- For all standard open-ended questions where no special format is requested, strictly apply the standard Positive Milestone Rubric.\n"
        )

    sys_prompt = (
        "You are an expert technical interviewer evaluating a live candidate in a verbal/spoken interview conducted over a microphone.\n\n"
        "SPOKEN INTERVIEW CONTEXT & PHONETIC TOLERANCE:\n"
        "1. This is a conversational verbal response delivered in ~30-90 seconds, NOT a written exam or academic paper.\n"
        "2. Candidates speak into a microphone transcribed via Speech-to-Text (STT). Accommodate phonetic transcription errors and homophones "
        "(e.g., 'ELBO' for 'Elbow', 'Sihlhout' for 'Silhouette', 'sequel' for 'SQL', 'jason' for 'JSON'). NEVER penalize STT misspellings as technical inaccuracies.\n"
        "3. Do NOT penalize the candidate for omitting mathematical formulas, proofs, or textbook definitions unless the question explicitly asked for them.\n\n"
        "POSITIVE MILESTONE RUBRIC (Pure Accuracy Model - Total Max 100):\n"
        "- CONTENT QUALITY (Max 70 pts):\n"
        "  * Core Understanding & Definition: 20-25 pts if they correctly define the concept/algorithm.\n"
        "  * Mechanism / Step-by-Step Flow: 20-25 pts if they explain how it works or how they would approach it.\n"
        "  * Techniques / Practical Application: 15-20 pts if they address methods, trade-offs, or solutions asked in the prompt.\n"
        "  * Benchmark: A clear, accurate verbal explanation covering the main concept, steps, and techniques MUST receive at least 50-60/70 for content.\n"
        "- RELEVANCE (Max 30 pts):\n"
        "  * Directly answers the prompt without evasiveness or repeating the question: 25-30 pts.\n"
        "  * Partially addresses: 15-24 pts.\n"
        "  * Off-topic: 0-14 pts.\n"
        "- TIME SCORE: Strictly 0 (disabled in Pure Accuracy Model).\n\n"
        "FEEDBACK GUIDELINES:\n"
        "- Always acknowledge what the candidate correctly articulated first.\n"
        "- Provide constructive, professional suggestions for what could make the answer even stronger (e.g. edge cases, trade-offs).\n"
        "- Never criticize STT spelling quirks in feedback.\n\n"
        "Return VALID JSON with keys:\n"
        "- 'overall_score': integer (content_score + relevance_score, 0-100)\n"
        "- 'content_score': integer (0-70)\n"
        "- 'relevance_score': integer (0-30)\n"
        "- 'time_score': 0\n"
        "- 'feedback': string (constructive, professional summary)\n"
        "- 'ideal_answer': string (concise 2-3 sentence verbal model answer)\n"
        "- 'key_facts_required': list of 3-5 core concepts\n"
        "- 'facts_mentioned_by_candidate': list of concepts candidate touched upon\n"
        "- 'is_relevant': boolean"
    )
    usr_prompt = (
        f"Question: {state.get('question')}\n"
        f"Context: {state.get('context')}\n"
        f"Candidate Spoken Answer: {cleaned_answer}\n"
        f"Language: {state.get('language', 'English')}\n"
        f"{inst_section}\n"
        "Score the candidate fairly based on spoken interview standards. Return JSON."
    )
    
    fallback = AnswerScore(feedback="Failed to score.", overall_score=0, content_score=0, relevance_score=0).to_dict()
    res = _llm_json(sys_prompt, usr_prompt, fallback=fallback, max_tokens=2500)
    
    # If we received the exact hardcoded fallback, it means the LLM failed completely.
    # Raise an exception so that `analyze_answer.py` can catch it and run `_dynamic_offline_evaluation`.
    if res.get("feedback") == "Failed to score." and res.get("overall_score") == 0:
        raise Exception("Graph LLM failed to score answer, triggering offline evaluation fallback.")
    
    candidate_feedback = res.get("feedback")
    if not candidate_feedback or candidate_feedback == "Failed to score.":
        candidate_feedback = "Candidate provided a relevant technical answer addressing the core concepts."

    c_score = int(res.get("content_score", 0))
    r_score = int(res.get("relevance_score", 0))
    # Ensure overall score is mathematically consistent with Pure Accuracy Model
    o_score = res.get("overall_score")
    if o_score is None or o_score == 0 and (c_score > 0 or r_score > 0):
        o_score = c_score + r_score
    else:
        o_score = int(o_score)

    result = AnswerScore(
        feedback=candidate_feedback,
        overall_score=o_score,
        content_score=c_score,
        relevance_score=r_score,
        corrected_answer=res.get("ideal_answer", "")
    ).to_dict()
    
    result["key_facts_required"] = res.get("key_facts_required", [])
    result["facts_mentioned_by_candidate"] = res.get("facts_mentioned_by_candidate", [])
    result["is_relevant"] = res.get("is_relevant", True)
    result["clarity_score"] = int(res.get("clarity_score", 75))
    result["technical_depth_score"] = int(res.get("technical_depth_score", c_score))
    result["confidence_score"] = int(res.get("confidence_score", 80))
    
    state["result"] = result
    return state

def build_answer_scoring_graph():
    g = StateGraph(AnswerScoringState)
    g.add_node("evaluate_answer", as_evaluate_answer)
    g.set_entry_point("evaluate_answer")
    g.add_edge("evaluate_answer", END)
    return g.compile()

ANSWER_SCORING_GRAPH = build_answer_scoring_graph()

def run_answer_scoring_graph(question, answer, context, time_spent, time_limit, language, time_context, time_score_hint, ai_instructions=""):
    state: AnswerScoringState = {
        "question": question,
        "answer": answer,
        "context": context,
        "time_context": time_context,
        "time_score_hint": time_score_hint,
        "language": language,
        "ai_instructions": ai_instructions or ""
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
    ai_instructions: str
    
    # internal
    extracted_topics: List[str]
    drafts: List[Dict]
    
    # final output
    result: List[Dict]



def qg_generate_all(state: QuestionGenerationState) -> QuestionGenerationState:
    num = state.get("num_questions", 6)
    lang = state.get("language", "English")
    industry = state.get("industry", "General")
    int_type = state.get("interview_type", "Technical")
    ai_inst = state.get("ai_instructions", "").strip()
    if ai_inst:
        inst_block = (
            f"\n======================================================\n"
            f"CRITICAL MANDATORY INSTRUCTIONS FROM RECRUITER (STRICT OVERRIDE):\n"
            f"{ai_inst}\n\n"
            f"STRICT COMPLIANCE RULES (HIGHEST PRIORITY IN THE SYSTEM):\n"
            f"1. OVERRIDE MANDATE: These recruiter instructions OVERRIDE any default focus or assumptions from the Job Description or Resume.\n"
            f"2. SENIORITY & LEVEL CALIBRATION (FRESHER TO CEO): Strictly calibrate question scope and depth to any requested level:\n"
            f"   - Executive / C-Suite / CEO / Founder: Focus on organizational vision, P&L responsibility, board governance, capital allocation, scaling businesses, culture building, and crisis leadership.\n"
            f"   - Director / VP / Engineering Manager: Focus on multi-team management, hiring strategy, architecture roadmap, budget, delivery under pressure, and cross-functional stakeholder alignment.\n"
            f"   - Senior / Experienced Professional: Focus on advanced architecture, complex problem-solving, trade-offs, system resilience, and mentoring junior engineers.\n"
            f"   - Fresher / Entry-Level / Graduate: Focus on foundational fundamentals, conceptual understanding, coding principles, problem-solving mindset, and project coursework.\n"
            f"3. DOMAIN & TOPIC ALLOCATION: If specific topics, percentages, or ratios are requested (e.g., '60% ML, 20% Banking, 20% Real Estate' or 'Focus 100% on Healthcare Compliance'), you MUST STRICTLY allocate the questions to match that exact breakdown across the {num} questions.\n"
            f"4. UNLISTED TOPICS: Even if an instructed topic, domain, or business scenario is NOT mentioned in the candidate's Resume or Job Description, you MUST STILL generate questions directly covering that topic as commanded by the recruiter.\n"
            f"5. TECHNICAL & NON-TECHNICAL ADAPTABILITY: Seamlessly handle both Technical engineering interviews (coding concepts, system architecture) and Non-Technical leadership, management, product, operations, sales, and strategy interviews.\n"
            f"6. QUESTION FORMAT & STRUCTURE OVERRIDE: If the recruiter specifically instructs questions to be one-word answers, Yes/No, or True/False (or closed-ended direct format), you MUST frame the questions so they can be answered definitively with a single word or boolean (e.g., 'True or False: In Python, strings are immutable?', 'What data structure operates on a Last-In, First-Out principle?', 'Have you worked with Kubernetes in production?').\n"
            f"======================================================\n"
        )
    else:
        inst_block = ""

    lower_ai = (ai_inst or "").lower()
    is_closed_format = (
        ("yes" in lower_ai and "no" in lower_ai) or
        ("true" in lower_ai and "false" in lower_ai) or
        ("one word" in lower_ai or "single word" in lower_ai or "1 word" in lower_ai or "one-word" in lower_ai or "single-word" in lower_ai)
    )

    if is_closed_format:
        if "true" in lower_ai and "false" in lower_ai:
            target_fmt = "True or False"
            ex_q = "True or False: In Python, strings are immutable."
        elif "yes" in lower_ai and "no" in lower_ai:
            target_fmt = "Yes or No"
            ex_q = "Have you worked with Kubernetes in production?"
        else:
            target_fmt = "One-Word / Direct Factual Answer"
            ex_q = "What data structure operates on a Last-In, First-Out principle?"

        spoken_format_constraint = (
            f"\nCRITICAL FORMAT MANDATE - 100% OF QUESTIONS MUST BE {target_fmt.upper()}:\n"
            f"- The recruiter has explicitly instructed that ALL questions in this interview MUST be {target_fmt} questions.\n"
            f"- You MUST generate EVERY SINGLE ONE of the {num} questions strictly in {target_fmt} format.\n"
            f"- DO NOT generate open-ended questions, self-introduction questions, career goals, or discussion questions.\n"
            f"- Every question must have an unequivocal, definitive {target_fmt} answer based on the candidate's domain/JD.\n"
            f"- Example valid question: '{ex_q}'\n"
        )
    else:
        spoken_format_constraint = (
            "\nCRITICAL INTERVIEW FORMAT - SPOKEN/ORAL ONLY:\n"
            "- This is an oral conversational interview where the candidate speaks verbally (speech-to-text).\n"
            "- There is NO code editor, IDE, compiler, or code-writing box available in the interview platform.\n"
            "- NEVER ask the candidate to 'write code', 'write a function', 'write a script', 'provide code examples', 'sketch code', or provide syntax snippets.\n"
            "- ALWAYS frame every question to be verbally answerable: ask the candidate to explain their step-by-step logic, architectural workflow, trade-offs between approaches, debugging methodology, or performance optimization strategies.\n"
        )

    sys = (
        f"You are an elite, executive-caliber recruiter and interviewer for the {industry} industry. "
        f"Generate {num} {int_type} interview questions. {inst_block}\n"
        f"Format and Rules:\n"
        f"- Tailor questions specifically to the candidate's Resume and Job Description, BUT STRICTLY ADHERE to all recruiter instructions, seniority calibrations, and topic percentages above.\n"
        f"- MAXIMUM TOPIC DIVERSITY: Every single question MUST test a completely DISTINCT skill, tool, or concept from the JD/Resume. DO NOT repeat or rephrase the same concept across questions.\n"
        f"{spoken_format_constraint}"
        f"CRITICAL: All questions MUST be generated strictly in {lang}. Do NOT use English unless the selected language is English. "
        "Return JSON."
    )

    gen_instruction = (
        f"Generate EXACTLY {num} {target_fmt} questions based on the candidate's skills and JD where each question can be answered definitively in a single word or boolean.\n"
        if is_closed_format else
        f"Generate {num} highly relevant questions in {lang} that the candidate can explain verbally without writing code.\n"
    )

    usr = (
        f"{inst_block}\n"
        f"Industry: {industry}\n"
        f"Interview Type: {int_type}\n"
        f"JD: {state.get('jd_text', '')}\n"
        f"Resume: {state.get('resume_text', '')}\n"
        f"Topics: {state.get('extracted_topics', [])}\n"
        f"{spoken_format_constraint}\n"
        f"{gen_instruction}"
        f"FINAL CHECK: Ensure the generated questions STRICTLY fulfill all Custom Recruiter Instructions (including any requested topic percentages or domains)!\n"
        "Return JSON: {'questions': [{'question':'...', 'difficulty':'Medium', 'type':'Technical/Behavioral', 'category':'Core'}]}"
    )

    try:
        res = _llm_json(sys, usr, fallback={"questions": []}, temperature=0.7, max_tokens=4096)
        state["drafts"] = res.get("questions", [])
    except Exception as e:
        # If LLM call fails (quota or network), fall back to empty drafts to trigger validation fallback
        print(f"LLM generation failed ({e}). Using offline fallback.")
        state["drafts"] = []
    return state

def qg_validate_format(state: QuestionGenerationState) -> QuestionGenerationState:
    drafts = state.get("drafts", [])
    lang = state.get("language", "English")
    int_type = state.get("interview_type", "Technical")
    is_non_tech = str(int_type).strip().lower() in ("non-technical", "non_technical", "non tech", "nontech")
    valid_qs = []
    seen_questions = set()  # dedup guard

    for i, d in enumerate(drafts):
        try:
            lower_ai = (state.get("ai_instructions") or "").lower()
            is_closed = (
                ("yes" in lower_ai and "no" in lower_ai) or
                ("true" in lower_ai and "false" in lower_ai) or
                ("one word" in lower_ai or "single word" in lower_ai or "1 word" in lower_ai or "one-word" in lower_ai or "single-word" in lower_ai)
            )
            if is_closed:
                if "true" in lower_ai and "false" in lower_ai:
                    default_q = "True or False: In modern software architectures, components should be decoupled to promote maintainability."
                elif "yes" in lower_ai and "no" in lower_ai:
                    default_q = "Have you worked with core production technologies in this domain?"
                else:
                    default_q = "What is the primary programming language or runtime utilized in this domain?"
            else:
                default_q = "Could you describe a challenging situation in your previous role and how you handled it?" if is_non_tech else "Could you describe your experience with technology?"
            if lang != "English":
                try:
                    from app.data.offline_language_fallback import OFFLINE_LANGUAGE_TECHNICAL_QUESTIONS
                    lang_tech = OFFLINE_LANGUAGE_TECHNICAL_QUESTIONS.get(lang, [])
                    if lang_tech and i < len(lang_tech):  # only use index if within bounds — no modulo cycling
                        default_q = lang_tech[i]
                except Exception:
                    pass
            q = _parse_with_schema(json.dumps(d), InterviewQuestion, InterviewQuestion(question=default_q, id=i+1))
            q.id = i + 1
            # Sanitize to ensure the question is verbally answerable (no 'write code' commands)
            q.question = sanitize_spoken_interview_question(q.question)
            item = q.to_dict()
            if item.get("question"):
                item["question"] = sanitize_verbal_question_text(item["question"])
            q_text = item.get("question", "").strip().lower()
            if q_text and q_text not in seen_questions:  # skip duplicates
                seen_questions.add(q_text)
                item["_generation_origin"] = "LLM" if item.get("question") != default_q else "validation fallback"
                valid_qs.append(item)
        except Exception:
            pass
    if not valid_qs:
        print("[Validation] No valid questions parsed. Returning empty list to trigger offline fallback.")
        # Returning empty lets the robust offline generator handle it gracefully without duplication.

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

def run_question_generation_graph(resume, jd, num_questions, interview_type, industry, language, ai_instructions=""):
    state: QuestionGenerationState = {
        "resume_text": resume or "",
        "jd_text": jd or "",
        "num_questions": num_questions,
        "interview_type": interview_type,
        "industry": industry,
        "language": language,
        "ai_instructions": ai_instructions or ""
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
    ai_instructions: str
    
    # internal
    gap_analysis: str
    
    # final
    result: Dict[str, Any]

def fu_generate_all(state: FollowUpState) -> FollowUpState:
    ai_inst = state.get("ai_instructions", "").strip()
    sys = "Analyze the candidate's answer to identify a missing depth, then draft a follow-up question. Keep it conversational."
    if ai_inst:
        sys += f"\n\nCRITICAL INTERVIEWER PERSONA AND BEHAVIORAL RULES (STRICTLY ADOPT THIS PERSONA, TONE, AND TOPICAL FOCUS):\n{ai_inst}"
    usr = f"Q: {state.get('original_question')}\nA: {state.get('answer')}\nLanguage: {state.get('language')}"
    if ai_inst:
        usr += f"\nSpecific Interviewer Rules to Follow: {ai_inst[:400]}"
    usr += "\nReturn JSON for FollowupQuestion schema with fields 'question' and 'expected_answer'."
    res = _llm_json(sys, usr, schema_class=FollowupQuestion, fallback=FollowupQuestion(question="Can you elaborate on that?").to_dict())
    
    if hasattr(res, 'to_dict'):
        res = res.to_dict()
    if "question" in res and res["question"]:
        res["question"] = sanitize_spoken_interview_question(res["question"])
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

def run_followup_graph(answer, resume, jd, q_id, streak, language, ai_instructions=""):
    if streak >= 3:
        from app.ai.typed_ai_layer import generate_followup
        return generate_followup(answer, resume, jd, q_id, streak, language, ai_instructions=ai_instructions)
        
    state: FollowUpState = {
        "answer": answer,
        "resume_context": resume,
        "jd_text": jd,
        "current_q_id": q_id,
        "followup_streak": streak,
        "language": language,
        "ai_instructions": ai_instructions or ""
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
    avg_score = int(avg)
    rec = "Strong Hire" if avg >= 75 else "Hire" if avg >= 55 else "Borderline" if avg >= 35 else "No Hire"
    fallback = InterviewSummary(
        recommendation=rec,
        communication_score=avg_score,
        skills_score=avg_score,
        competencies_score=avg_score,
        personality_score=avg_score,
        culture_fit_score=avg_score,
        job_success_score=avg_score,
    )
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



# ─── 5. RECRUITER-LED 2-SECOND GLANCEABLE CHEAT SHEET GENERATOR ─────────────

def _safe_recruiter_id(val: Any, default: int = 1) -> Any:
    if val is None or val == "":
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return str(val)

def _build_recruiter_fallback_item(
    idx: Any,
    q_text: str,
    category: str = "Core Technical",
    difficulty: str = "Medium",
    question_type: str = "discussion",
    coding_task: Optional[Dict[str, Any]] = None,
    case_study: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    safe_idx = _safe_recruiter_id(idx, 1)
    safe_diff = str(difficulty or "Medium").capitalize()
    default_summary = (
        f"Coding Challenge: {coding_task.get('title', 'Algorithm')} — Evaluate optimal complexity, edge cases, and code execution."
        if question_type == "coding" and coding_task
        else "Case Study Scenario — Evaluate structured problem-solving, stakeholder prioritization, and risk mitigation."
        if question_type == "case_study"
        else "Evaluate whether the candidate explains the core mechanism, real-world trade-offs, and practical execution clearly."
    )
    default_key_points = (
        ["Optimal time and space complexity", "Handles edge cases (null, empty, duplicates)", "Clean modular code structure", "Passes visible & hidden tests"]
        if question_type == "coding"
        else ["Structured framework (STAR method)", "Clear stakeholder communication", "Measurable metrics & KPIs", "Risk & contingency planning"]
        if question_type == "case_study"
        else [
            "Clear definition of the core concept or problem",
            "Concrete steps or architecture used in practice",
            "Awareness of edge cases, trade-offs, or performance impact",
        ]
    )
    default_model_answer = (
        f"Optimal Solution: Formulate an optimal algorithm for {coding_task.get('title', 'the challenge')} with optimal complexity. Must handle boundary conditions and explain algorithmic trade-offs."
        if question_type == "coding" and coding_task
        else (
            "A strong candidate should clearly define the underlying concept, walk through a concrete example or "
            "implementation from their experience, and discuss trade-offs, bottlenecks, or error-handling considerations."
        )
    )

    fallback_dict = {
        "id": safe_idx,
        "question": str(q_text or ""),
        "quick_summary": default_summary,
        "key_points": default_key_points,
        "model_answer": default_model_answer,
        "category": str(category or ("Coding Challenge" if question_type == "coding" else "Case Study" if question_type == "case_study" else "Core Technical")),
        "difficulty": safe_diff,
        "question_type": str(question_type or "discussion"),
        "coding_task": coding_task,
        "case_study": case_study,
    }

    try:
        return RecruiterQuestionItem(**fallback_dict).to_dict()
    except Exception:
        return fallback_dict


def enrich_questions_with_cheat_sheet(
    questions: List[Dict[str, Any]],
    resume_text: str = "",
    jd_text: str = "",
    language: str = "English",
    difficulty: str = "Medium",
) -> List[Dict[str, Any]]:
    """Populate quick_summary, key_points, and model_answer for existing questions that lack them."""
    if not questions:
        return []

    needs_enrichment = [
        q for q in questions
        if isinstance(q, dict) and (not q.get("model_answer") or not q.get("quick_summary"))
    ]
    if not needs_enrichment:
        out = []
        for i, q in enumerate(questions, start=1):
            item = dict(q)
            item["id"] = _safe_recruiter_id(item.get("id"), i)
            out.append(item)
        return out

    q_lines = "\n".join(
        f"{i+1}. {q.get('question') or q.get('text', '')}"
        for i, q in enumerate(questions)
        if isinstance(q, dict) and (q.get("question") or q.get("text"))
    )

    sys_prompt = (
        "You are a Senior Principal Architect creating an instant 2-second Q&A cheat sheet for a non-technical recruiter "
        "conducting a live human interview. For each numbered question below, provide:\n"
        "- quick_summary: 1 clear sentence summarizing the ideal answer for 2-second glanceability.\n"
        "- key_points: 2 to 4 concise bullet strings of must-mention concepts.\n"
        "- model_answer: A complete, authoritative 2-4 sentence ideal answer.\n"
        "- category: Short category label (e.g. 'Core Technical', 'Resume Deep Dive', 'System Design', 'Behavioral').\n"
        f"Generate all content in {language}. Return VALID JSON ONLY: {{\"items\": [{{ \"index\": 1, \"quick_summary\": \"...\", \"key_points\": [\"...\"], \"model_answer\": \"...\", \"category\": \"...\" }}]}}"
    )
    usr_prompt = (
        f"Job Description Context: {_truncate(jd_text or '', 1500)}\n"
        f"Candidate Resume Context: {_truncate(resume_text or '', 1500)}\n\n"
        f"Questions:\n{q_lines}\n\n"
        "Return JSON with an 'items' list matching every question 1-to-1."
    )

    enriched_map: Dict[int, Dict[str, Any]] = {}
    try:
        res = _llm_json(sys_prompt, usr_prompt, fallback={"items": []}, temperature=0.2, max_tokens=4096)
        items = res.get("items", []) if isinstance(res, dict) else []
        for idx_pos, item in enumerate(items):
            if not isinstance(item, dict):
                continue
            key_idx = int(item.get("index") or (idx_pos + 1))
            enriched_map[key_idx] = item
    except Exception as e:
        print(f"[RecruiterCheatSheet] Enrichment LLM failed, using structured fallback: {e}")

    final_list: List[Dict[str, Any]] = []
    for i, raw_q in enumerate(questions, start=1):
        if not isinstance(raw_q, dict):
            continue
        q_text = (raw_q.get("question") or raw_q.get("text") or "").strip()
        if not q_text:
            continue
        match = enriched_map.get(i, {})
        q_cat = raw_q.get("category") or match.get("category") or "Core Technical"
        q_diff = raw_q.get("difficulty") or difficulty or "Medium"
        fb = _build_recruiter_fallback_item(i, q_text, category=q_cat, difficulty=q_diff, question_type=raw_q.get("question_type") or "discussion", coding_task=raw_q.get("coding_task"), case_study=raw_q.get("case_study"))
        item_entry = {
            "id": _safe_recruiter_id(raw_q.get("id"), i),
            "question": q_text,
            "quick_summary": (raw_q.get("quick_summary") or match.get("quick_summary") or fb["quick_summary"]).strip(),
            "key_points": raw_q.get("key_points") or match.get("key_points") or fb["key_points"],
            "model_answer": (raw_q.get("model_answer") or match.get("model_answer") or fb["model_answer"]).strip(),
            "category": q_cat,
            "difficulty": str(q_diff or "Medium").capitalize(),
            "question_type": str(raw_q.get("question_type") or fb.get("question_type") or "discussion"),
            "coding_task": raw_q.get("coding_task") or fb.get("coding_task"),
            "case_study": raw_q.get("case_study") or fb.get("case_study"),
        }
        try:
            validated = RecruiterQuestionItem(**item_entry).to_dict()
        except Exception:
            validated = item_entry
        final_list.append(validated)
    return final_list


def _detect_candidate_tech_stack(profile_blob: str) -> str:
    """Detects candidate's primary programming language and core stack from resume and JD."""
    blob_lower = (profile_blob or "").lower()
    scores = {
        "python": len(re.findall(r"\b(python|django|fastapi|flask|pandas|numpy|pytorch|tensorflow|scikit)\b", blob_lower)),
        "javascript": len(re.findall(r"\b(javascript|js|react|reactjs|vue|vuejs|angular|node|nodejs|express|nextjs)\b", blob_lower)),
        "typescript": len(re.findall(r"\b(typescript|ts|nest|nestjs)\b", blob_lower)),
        "java": len(re.findall(r"\b(java|spring|springboot|hibernate|jvm)\b", blob_lower)),
        "cpp": len(re.findall(r"\b(c\+\+|cpp|c programming)\b", blob_lower)),
    }
    if scores["typescript"] > scores["javascript"]:
        return "typescript"
    if scores["javascript"] > 0 and scores["javascript"] >= scores["python"]:
        return "javascript"
    chosen_lang = max(scores, key=scores.get)
    return chosen_lang if scores[chosen_lang] > 0 else "python"


_RECRUITER_Q_STOPWORDS = {
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "into",
    "and", "or", "but", "if", "then", "that", "this", "these", "those",
    "it", "its", "you", "your", "we", "our", "they", "their", "how", "what",
    "why", "when", "where", "which", "who", "would", "could", "should",
    "can", "do", "does", "did", "have", "has", "had", "will", "about",
    "explain", "describe", "walk", "me", "through", "tell", "give", "using",
    "use", "used", "approach", "handle", "design", "live", "coding",
    "challenge", "case", "scenario", "question", "core", "continuous",
    "evaluation", "system", "production",
}


def _normalize_recruiter_text(text: Any) -> str:
    s = str(text or "").lower().strip()
    s = re.sub(r"^(?:live\s+coding\s+challenge|case\s+scenario|continuous\s+evaluation\s*\d*)\s*[:\-—]+\s*", "", s)
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return s


def _recruiter_tokens(text: Any) -> set:
    norm = _normalize_recruiter_text(text)
    return {t for t in norm.split() if len(t) > 1 and t not in _RECRUITER_Q_STOPWORDS}


def extract_coding_title_from_text(text: Any) -> str:
    s = str(text or "").strip()
    m = re.match(r"^(?:live\s+coding\s+challenge|coding\s+challenge)\s*[:\-—]\s*([^—\-\n]+)", s, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip()
    return ""


def is_recruiter_question_duplicate(
    q_text: str,
    existing_texts: List[str],
    coding_title: str = "",
    coding_function: str = "",
    existing_coding_titles: Optional[List[str]] = None,
    existing_coding_functions: Optional[List[str]] = None,
    case_title: str = "",
    existing_case_titles: Optional[List[str]] = None,
) -> bool:
    """
    Strict multi-signal duplicate detector covering exact, substring, fuzzy sequence,
    concept/token overlap, coding challenge title/function, and case-study title.
    """
    from difflib import SequenceMatcher

    cand_norm = _normalize_recruiter_text(q_text)
    cand_tokens = _recruiter_tokens(q_text)

    # 1. Coding challenge title & function check
    ct = (coding_title or extract_coding_title_from_text(q_text) or "").strip()
    ct_norm = _normalize_recruiter_text(ct)
    cf_norm = _normalize_recruiter_text(coding_function)

    if cf_norm and cf_norm not in ("solve", "solution", "main"):
        for exf in (existing_coding_functions or []):
            if _normalize_recruiter_text(exf) == cf_norm:
                return True

    if ct_norm:
        ct_tokens = _recruiter_tokens(ct)
        for ext in (existing_coding_titles or []):
            ext_norm = _normalize_recruiter_text(ext)
            if not ext_norm:
                continue
            if ct_norm == ext_norm or ct_norm in ext_norm or ext_norm in ct_norm:
                return True
            ext_tokens = _recruiter_tokens(ext)
            if ct_tokens and ext_tokens:
                inter = ct_tokens & ext_tokens
                union = ct_tokens | ext_tokens
                if (len(inter) / len(union) >= 0.50) or (len(inter) / min(len(ct_tokens), len(ext_tokens)) >= 0.67):
                    return True

    # 2. Case study title check
    cst_norm = _normalize_recruiter_text(case_title)
    if cst_norm:
        for exc in (existing_case_titles or []):
            exc_norm = _normalize_recruiter_text(exc)
            if exc_norm and (cst_norm == exc_norm or cst_norm in exc_norm or exc_norm in cst_norm):
                return True

    if not cand_norm:
        return True

    # 3. Textual + conceptual similarity check against all existing question texts
    for existing in (existing_texts or []):
        ex_norm = _normalize_recruiter_text(existing)
        if not ex_norm:
            continue
        if cand_norm == ex_norm:
            return True
        if len(cand_norm) >= 24 and len(ex_norm) >= 24 and (cand_norm in ex_norm or ex_norm in cand_norm):
            return True

        # Check coding title embedded inside existing text
        if ct_norm:
            ex_ct = extract_coding_title_from_text(existing)
            ex_ct_norm = _normalize_recruiter_text(ex_ct)
            if ex_ct_norm and (ct_norm == ex_ct_norm or ct_norm in ex_ct_norm or ex_ct_norm in ct_norm):
                return True

        ex_tokens = _recruiter_tokens(existing)
        if cand_tokens and ex_tokens:
            inter = cand_tokens & ex_tokens
            union = cand_tokens | ex_tokens
            jaccard = len(inter) / len(union) if union else 0.0
            min_overlap = len(inter) / min(len(cand_tokens), len(ex_tokens))
            if jaccard >= 0.45 or (min_overlap >= 0.65 and len(inter) >= 3):
                return True

        if SequenceMatcher(None, cand_norm[:220], ex_norm[:220]).ratio() >= 0.72:
            return True

    return False


def generate_recruiter_cheat_sheet_questions(
    resume_text: str = "",
    jd_text: str = "",
    num_questions: int = 8,
    interview_type: str = "Technical",
    industry: str = "General",
    language: str = "English",
    difficulty: str = "Medium",
    custom_questions: str = "",
    ai_instructions: str = "",
    exclude_questions: Optional[List[str]] = None,
    start_id: int = 1,
    exclude_coding_titles: Optional[List[str]] = None,
    exclude_coding_functions: Optional[List[str]] = None,
    exclude_case_titles: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate upfront and continuous Q&A cheat-sheet items (question, quick_summary, key_points, model_answer)
    tailored to the interview type (Technical, Coding, Non-Technical / Case Studies, Normal) for Recruiter-Led calls.
    Strictly deduplicates discussion, case-study, AND coding challenges against all previously generated questions.
    """
    num_questions = max(1, min(int(num_questions or 8), 20))
    start_id = max(1, int(start_id or 1))
    is_continuation = start_id > 1 or bool(exclude_questions)
    iv_type_norm = (interview_type or "").strip().lower()
    is_non_tech = any(k in iv_type_norm for k in ("non-technical", "non technical", "normal", "case", "behavioral", "management", "hr"))
    is_coding_eligible = any(k in iv_type_norm for k in ("coding", "technical", "tech", "software", "developer"))

    # Build ordered exclusion lists (preserve all existing questions + coding/case titles)
    seen_texts: List[str] = [str(q).strip() for q in (exclude_questions or []) if str(q).strip()]
    seen_coding_titles: List[str] = [str(t).strip() for t in (exclude_coding_titles or []) if str(t).strip()]
    seen_coding_functions: List[str] = [str(f).strip() for f in (exclude_coding_functions or []) if str(f).strip()]
    seen_case_titles: List[str] = [str(c).strip() for c in (exclude_case_titles or []) if str(c).strip()]

    # Auto-extract any coding titles already embedded inside exclude_questions
    for eq in seen_texts:
        extracted_ct = extract_coding_title_from_text(eq)
        if extracted_ct and extracted_ct not in seen_coding_titles:
            seen_coding_titles.append(extracted_ct)

    # Filter custom questions so already-asked custom questions are NEVER re-included on continuation calls
    raw_custom_list = [q.strip() for q in str(custom_questions or "").split("\n") if q.strip()]
    custom_list = (
        []
        if is_continuation
        else [cq for cq in raw_custom_list if not is_recruiter_question_duplicate(cq, seen_texts)]
    )
    custom_section = ""
    if custom_list:
        custom_section = "\nMANDATORY CUSTOM QUESTIONS TO INCLUDE FIRST:\n" + "\n".join(f"- {cq}" for cq in custom_list[:num_questions])

    inst_section = f"\nRECRUITER INSTRUCTIONS:\n{ai_instructions.strip()}\n" if (ai_instructions or "").strip() else ""

    exclude_section = ""
    if seen_texts or seen_coding_titles:
        sample_excludes = seen_texts[-60:]
        parts = []
        if sample_excludes:
            parts.append(
                "\nCRITICAL — DO NOT REPEAT, REPHRASE, OR COVER THE SAME TOPIC AS ANY OF THESE EXISTING QUESTIONS:\n"
                + "\n".join(f"- {eq}" for eq in sample_excludes)
            )
        if seen_coding_titles:
            parts.append(
                "\nALREADY USED CODING CHALLENGES (NEVER REPEAT OR SIMILARLY REWORD):\n"
                + "\n".join(f"- {ct}" for ct in seen_coding_titles[-30:])
            )
        parts.append(
            "\nYou MUST generate completely fresh, distinct questions exploring NEW skills, edge cases, architecture layers, or failure modes not covered above."
        )
        exclude_section = "\n".join(parts)

    # Request extra candidates on continuation so strict deduplication still fills num_questions
    llm_target_count = min(20, num_questions + (3 if is_continuation else 0))

    # ── 1. Non-Technical / Normal: Scenario-Based Case Studies ─────────────────
    if is_non_tech:
        sys_prompt = (
            f"You are an executive HR and business case interviewer preparing a 2-second glanceable case-study cheat sheet "
            f"for a human recruiter conducting a live {interview_type} interview in the {industry} industry.\n"
            f"Generate EXACTLY {llm_target_count} realistic, completely unique scenario-based case study challenges based on the Candidate Resume and Job Description.\n"
            f"NEVER repeat or rephrase any previously asked scenario or dilemma.\n"
            f"For EVERY question you MUST return valid JSON with:\n"
            f"1. 'question': Clear scenario prompt & core dilemma the recruiter can read or display to the candidate.\n"
            f"2. 'quick_summary': 1 crisp sentence explaining ideal strategic framework (e.g. STAR method, stakeholder triage, risk mitigation).\n"
            f"3. 'key_points': List of 3 to 4 short bullet strings (must-hit KPIs, trade-offs, red flags to watch for).\n"
            f"4. 'model_answer': 2 to 4 sentences authoritative ideal strategic response.\n"
            f"5. 'category': 'Case Study'.\n"
            f"6. 'question_type': 'case_study'.\n"
            f"7. 'difficulty': '{difficulty}'.\n"
            f"8. 'case_study': {{\"title\": \"...\", \"scenario\": \"...\", \"dilemma\": \"...\", \"competencies\": [\"...\"], \"probing_questions\": [\"...\"]}}.\n"
            f"Generate everything strictly in {language}. Return VALID JSON ONLY: {{\"questions\": [...]}}."
        )
    else:
        # ── 2. Technical + Coding: Architectural Deep Dives + Coding Challenges ─
        sys_prompt = (
            f"You are a Senior Principal Architect preparing a 2-second glanceable Q&A cheat sheet for a human recruiter "
            f"conducting a live {interview_type} interview in the {industry} industry.\n"
            f"Generate EXACTLY {llm_target_count} completely unique, non-overlapping tailored questions based on the Candidate Resume and Job Description.\n"
            f"NEVER repeat, reword, or ask a near-duplicate of any previously asked question.\n"
            f"Include a balanced mix of:\n"
            f"- Deep practical system/stack architecture & debugging questions (question_type: 'discussion')\n"
            f"- Real-world problem solving, security, scaling, testing, & trade-offs\n"
            f"For EVERY question you MUST include:\n"
            f"1. 'question': Clear, conversational question the recruiter can read aloud.\n"
            f"2. 'quick_summary': 1 crisp sentence explaining the core answer for 2-second glanceability.\n"
            f"3. 'key_points': List of 2 to 4 short must-mention keywords/concepts.\n"
            f"4. 'model_answer': Complete, authoritative 2-4 sentence ideal answer.\n"
            f"5. 'category': e.g. 'Core Technical', 'System Design', 'Debugging & Incident Response', 'Security', or 'Performance'.\n"
            f"6. 'question_type': 'discussion'.\n"
            f"7. 'difficulty': '{difficulty}'.\n"
            f"Generate everything strictly in {language}. Return VALID JSON ONLY: {{\"questions\": [...]}}."
        )

    usr_prompt = (
        f"Job Description:\n{_truncate(jd_text or 'General role evaluation', 2200)}\n\n"
        f"Candidate Resume:\n{_truncate(resume_text or 'Candidate profile', 2200)}\n"
        f"{custom_section}\n{inst_section}\n{exclude_section}\n"
        "Return JSON with key 'questions'."
    )

    parsed_items: List[Dict[str, Any]] = []

    try:
        llm_temp = 0.65 if is_continuation else 0.35
        res = _llm_json(sys_prompt, usr_prompt, fallback={"questions": []}, temperature=llm_temp, max_tokens=4096)
        raw_qs = res.get("questions", []) if isinstance(res, dict) else []
        for idx, item in enumerate(raw_qs, start=1):
            if not isinstance(item, dict):
                continue
            q_text = (item.get("question") or "").strip()
            if not q_text:
                continue

            q_type = str(item.get("question_type") or ("case_study" if is_non_tech else "discussion")).strip().lower()
            if q_type not in ("discussion", "coding", "case_study"):
                q_type = "case_study" if is_non_tech else "discussion"

            coding_payload = item.get("coding_task") if q_type == "coding" and isinstance(item.get("coding_task"), dict) else None
            case_payload = item.get("case_study") if q_type == "case_study" and isinstance(item.get("case_study"), dict) else None

            c_title = (coding_payload or {}).get("title") or extract_coding_title_from_text(q_text)
            c_fn = (coding_payload or {}).get("function_name") or ""
            cs_title = (case_payload or {}).get("title") or ""

            if is_recruiter_question_duplicate(
                q_text,
                seen_texts,
                coding_title=c_title,
                coding_function=c_fn,
                existing_coding_titles=seen_coding_titles,
                existing_coding_functions=seen_coding_functions,
                case_title=cs_title,
                existing_case_titles=seen_case_titles,
            ):
                continue

            seen_texts.append(q_text)
            if c_title:
                seen_coding_titles.append(c_title)
            if c_fn:
                seen_coding_functions.append(c_fn)
            if cs_title:
                seen_case_titles.append(cs_title)

            q_cat = item.get("category") or ("Case Study" if q_type == "case_study" else "Coding Challenge" if q_type == "coding" else "Core Technical")

            fb = _build_recruiter_fallback_item(
                start_id + len(parsed_items),
                q_text,
                category=q_cat,
                difficulty=difficulty,
                question_type=q_type,
                coding_task=coding_payload,
                case_study=case_payload,
            )
            item_entry = {
                "id": start_id + len(parsed_items),
                "question": q_text,
                "quick_summary": (item.get("quick_summary") or fb["quick_summary"]).strip(),
                "key_points": item.get("key_points") if isinstance(item.get("key_points"), list) and item.get("key_points") else fb["key_points"],
                "model_answer": (item.get("model_answer") or fb["model_answer"]).strip(),
                "category": q_cat,
                "difficulty": str(item.get("difficulty") or difficulty or "Medium").capitalize(),
                "question_type": q_type,
                "coding_task": coding_payload,
                "case_study": case_payload,
            }
            try:
                validated = RecruiterQuestionItem(**item_entry).to_dict()
            except Exception:
                validated = item_entry
            parsed_items.append(validated)
            if len(parsed_items) >= num_questions:
                break
    except Exception as e:
        print(f"[RecruiterCheatSheet] LLM generation error: {e}")

    # ── 3. For Technical + Coding: Embed 1 strictly UNIQUE Coding Challenge ───
    if is_coding_eligible and not any(p.get("question_type") == "coding" for p in parsed_items):
        try:
            from app.data.coding_graph import _offline_coding_fallback, generate_coding_task
            profile_blob = f"{jd_text}\n{resume_text}"
            detected_lang = _detect_candidate_tech_stack(profile_blob)
            task_obj = None
            try:
                task_obj = generate_coding_task(
                    profile_blob,
                    [],
                    interview_type="Technical",
                    industry=industry,
                    language=detected_lang,
                    exclude_titles=seen_coding_titles,
                    exclude_functions=seen_coding_functions,
                )
            except Exception:
                pass
            if not task_obj or not task_obj.get("title"):
                task_obj = _offline_coding_fallback(
                    profile_blob,
                    exclude_titles=seen_coding_titles,
                    exclude_functions=seen_coding_functions,
                )
            if task_obj and task_obj.get("title"):
                task_obj["recommended_language"] = task_obj.get("recommended_language") or detected_lang
                ct_title = str(task_obj.get("title") or "Coding Challenge").strip()
                ct_fn = str(task_obj.get("function_name") or "").strip()
                ct_desc = str(task_obj.get("description") or "").strip()
                coding_q_text = f"Live Coding Challenge: {ct_title} — {ct_desc[:240]}..."

                if not is_recruiter_question_duplicate(
                    coding_q_text,
                    seen_texts,
                    coding_title=ct_title,
                    coding_function=ct_fn,
                    existing_coding_titles=seen_coding_titles,
                    existing_coding_functions=seen_coding_functions,
                ):
                    seen_texts.append(coding_q_text)
                    seen_coding_titles.append(ct_title)
                    if ct_fn:
                        seen_coding_functions.append(ct_fn)

                    coding_dict = {
                        "id": start_id + len(parsed_items),
                        "question": coding_q_text,
                        "quick_summary": f"Live Coding Challenge: {ct_title} — Candidate implements solution in Monaco Code Editor with test execution.",
                        "key_points": [
                            "Optimal time/space complexity",
                            "Handles edge cases & boundary conditions",
                            "Passes visible and hidden automated test cases",
                            "Clean, readable syntax & modular logic",
                        ],
                        "model_answer": (
                            f"Optimal algorithmic approach for {ct_title}: Expected complexity O(N) or O(N log N). "
                            f"Starter function: `{task_obj.get('starter_function_signature') or task_obj.get('function_name') or 'solve'}`. "
                            f"Candidate must explain data structure selection, trade-offs, and run test verification."
                        ),
                        "category": "Coding Challenge",
                        "difficulty": (task_obj.get("difficulty") or difficulty).capitalize(),
                        "question_type": "coding",
                        "coding_task": task_obj,
                    }
                    try:
                        coding_item = RecruiterQuestionItem(**coding_dict).to_dict()
                    except Exception:
                        coding_item = coding_dict

                    # Keep total length within num_questions: replace last discussion item if already full
                    if len(parsed_items) >= num_questions and num_questions >= 2:
                        parsed_items.pop()
                    insert_pos = min(len(parsed_items), 3) if len(parsed_items) >= 4 else len(parsed_items)
                    parsed_items.insert(insert_pos, coding_item)
                    for i, p in enumerate(parsed_items, start=start_id):
                        p["id"] = i
        except Exception as ct_err:
            print(f"[RecruiterCheatSheet] Coding challenge embed error: {ct_err}")

    # ── 4. Fallback fulfillment if LLM returned fewer than requested ──────────
    if len(parsed_items) < num_questions:
        if is_non_tech:
            try:
                from app.data.industry_fallback_data import INDUSTRY_CASE_STUDIES
                ind_key = industry if industry in INDUSTRY_CASE_STUDIES else "Information Technology"
                cases_dict = INDUSTRY_CASE_STUDIES.get(ind_key, INDUSTRY_CASE_STUDIES.get("Information Technology", {}))
                for c_key, c_data in cases_dict.items():
                    if len(parsed_items) >= num_questions:
                        break
                    c_scenario = c_data.get("scenario", "")
                    c_prompt = c_data.get("question", "")
                    c_title = c_key.replace("_", " ").title()
                    full_q = f"Case Scenario: {c_scenario}\n\nCore Question: {c_prompt}"
                    if is_recruiter_question_duplicate(
                        full_q,
                        seen_texts,
                        case_title=c_title,
                        existing_case_titles=seen_case_titles,
                    ):
                        continue
                    seen_texts.append(full_q)
                    seen_case_titles.append(c_title)
                    case_struct = {
                        "title": c_title,
                        "scenario": c_scenario,
                        "dilemma": c_prompt,
                        "competencies": c_data.get("evaluation_criteria", []),
                        "probing_questions": ["What metrics would you track?", "How would you handle pushback from leadership?"],
                    }
                    fb_item = _build_recruiter_fallback_item(
                        start_id + len(parsed_items),
                        full_q,
                        category="Case Study",
                        difficulty=difficulty,
                        question_type="case_study",
                        case_study=case_struct,
                    )
                    parsed_items.append(fb_item)
            except Exception as case_fb_err:
                print(f"[RecruiterCheatSheet] Case study fallback error: {case_fb_err}")

        defaults = [
            ("Walk me through the most complex project on your resume and the architectural decisions you made.", "Resume Deep Dive"),
            ("How do you debug a performance bottleneck or production outage in your primary stack?", "Problem Solving"),
            ("What trade-offs do you consider when designing data storage and caching for scale?", "System Design"),
            ("Tell me about a technical disagreement with a teammate and how you resolved it.", "Behavioral"),
            ("How do you balance technical debt vs shipping new features under tight deadlines?", "Engineering Leadership"),
            ("Describe how you design secure APIs and handle authentication/authorization at scale.", "System Security"),
            ("How do you approach end-to-end testing, observability, and zero-downtime deployments?", "DevOps & SRE"),
            ("How would you design a rate limiter for a high-traffic public REST API across multiple instances?", "System Design"),
            ("Explain how you prevent race conditions and ensure idempotency in payment or order-processing workflows.", "Distributed Systems"),
            ("How do you diagnose and resolve memory leaks or high CPU spikes in a running backend service?", "Performance"),
            ("What database indexing strategies do you apply when slow queries emerge under growing table sizes?", "Database Engineering"),
            ("How would you structure a CI/CD rollback plan when a schema migration causes unexpected failures?", "DevOps & SRE"),
            ("Compare synchronous REST calls with asynchronous message queues—when would you pick one over the other?", "Architecture"),
            ("How do you protect web applications against XSS, CSRF, SQL injection, and broken access control?", "System Security"),
            ("Explain how you design graceful degradation and circuit breakers when a third-party dependency slows down.", "Resilience"),
            ("Walk through how you conduct code reviews to raise engineering quality without blocking team velocity.", "Engineering Leadership"),
            ("How do you choose between SQL and NoSQL data models for a multi-tenant SaaS application?", "Database Engineering"),
            ("What metrics, logs, and distributed traces do you instrument first when launching a new microservice?", "Observability"),
            ("How do you optimize frontend bundle size, rendering latency, and API caching for slow client networks?", "Frontend Performance"),
            ("Tell me about a production bug that slipped past tests—what systemic safeguard did you add afterward?", "Incident Response"),
            ("How would you migrate a monolithic feature into an independent service without disrupting active users?", "Architecture"),
            ("Explain how you handle eventual consistency and stale cache invalidation across distributed nodes.", "Distributed Systems"),
            ("How do you prioritize and communicate scope trade-offs when an unexpected deadline change hits mid-sprint?", "Collaboration"),
            ("What concurrency primitives or async patterns do you rely on to prevent deadlocks and thread starvation?", "Core Technical"),
        ]
        for qt, cat in defaults:
            if len(parsed_items) >= num_questions:
                break
            if is_recruiter_question_duplicate(qt, seen_texts):
                continue
            seen_texts.append(qt)
            parsed_items.append(_build_recruiter_fallback_item(start_id + len(parsed_items), qt, category=cat, difficulty=difficulty))

    # Re-index cleanly from start_id
    for i, item in enumerate(parsed_items[:num_questions], start=start_id):
        item["id"] = i

    return parsed_items[:num_questions]
