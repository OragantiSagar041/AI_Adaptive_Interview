import json
from typing import Any, Dict, List, TypedDict, Optional
from app.ai.ai_client import chat_completion
from app.ai.ai_schemas import AnswerScore, InterviewQuestion, FollowupQuestion, InterviewSummary
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
