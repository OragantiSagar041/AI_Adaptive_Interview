import json
import os
import re
from hashlib import sha1
from typing import Any, Dict, List, TypedDict

from ai_client import chat_completion, extract_json as _safe_json_extract

try:
    from langgraph.graph import END, StateGraph

    LANGGRAPH_AVAILABLE = True
except ImportError:
    END = None
    StateGraph = None
    LANGGRAPH_AVAILABLE = False


DEFAULT_MODEL = os.getenv("CODING_ROUND_MODEL", "openai/gpt-4o-mini")

# ai_client handles the OpenRouter→HuggingFace fallback automatically


class CodingRoundState(TypedDict, total=False):
    task: Dict[str, Any]
    answer_summary: str
    prior_feedback: str
    code: str
    explanation: str
    language: str
    feedback_mode: str
    latest_change: str
    context_packet: str
    response: Dict[str, Any]


# _get_client removed — all calls now go through ai_client.chat_completion()


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "\n...[truncated]"


def _safe_json(content: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        start = content.find("{")
        end = content.rfind("}") + 1
        if start == -1 or end <= start:
            return fallback
        return json.loads(content[start:end])
    except Exception:
        return fallback


def _extract_function_name(signature: str) -> str:
    signature = signature or ""
    match = re.search(r"def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", signature)
    if match:
        return match.group(1)
    return "solve"


def _extract_java_method_name(signature: str) -> str:
    signature = signature or ""
    match = re.search(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", signature)
    if match:
        return match.group(1)
    return "solve"


def _default_task() -> Dict[str, Any]:
    signature = "def winner(donuts, starter):"
    return {
        "title": "The Ultimate Donut Challenge",
        "description": (
            "Its the college Fest night. There is a Donuts Challenge between Alex and Sam. "
            "There are N donuts arranged in a row. Each player can eat one or two donuts at a time. "
            "The player who eats the last donut loses the game. Both take alternate turns to eat "
            "donuts and anyone can start. Consider Alex and Sam try their best to win. "
            "Your task is to find the winner.\n\n"
            "Complete the function winner given in the editor. It takes one integer array donuts "
            "representing the value of N and one string array containing name of the player who starts "
            "the game as parameters."
        ),
        "input_format": (
            "First line contains the S, the size of quantity array. The S subsequent lines contains the "
            "value of N for each test case. Next line contains S, the size of the player array. The S "
            "subsequent lines contains the name of player who starts first."
        ),
        "constraints": [
            "1 <= S <= 2 x 10^5",
            "1 <= N <= 2 x 10^7"
        ],
        "output_format": "Your function must return a string array containing the name of the winner for each test case.",
        "examples": [
            {
                "input": "1\n3\n1\nAlex",
                "output": "Alex",
                "explanation": "N = 3, Alex starts first. Alex wins by choosing optimal moves.",
            },
            {
                "input": "1\n2\n1\nSam",
                "output": "Sam",
                "explanation": "N = 2, Sam starts first. Sam wins by choosing optimal moves.",
            }
        ],
        "evaluation_focus": ["Correctness", "Game Theory", "Optimization"],
        "starter_function_signature": signature,
        "function_name": _extract_function_name(signature),
        "difficulty": "Medium",
        "recommended_language": "python",
        "timebox_minutes": 25,
        "test_cases": [
            {"id": 1, "input": [[3], ["Alex"]], "expected": ["Alex"], "visible": True},
            {"id": 2, "input": [[2], ["Sam"]], "expected": ["Sam"], "visible": True},
            {"id": 3, "input": [[1], ["Alex"]], "expected": ["Sam"], "visible": True},
            {"id": 4, "input": [[4], ["Sam"]], "expected": ["Alex"], "visible": False},
            {"id": 5, "input": [[5], ["Alex"]], "expected": ["Alex"], "visible": False},
            {"id": 6, "input": [[6], ["Sam"]], "expected": ["Sam"], "visible": False},
            {"id": 7, "input": [[7], ["Alex"]], "expected": ["Sam"], "visible": False},
        ],
    }


def _normalize_test_case(case: Dict[str, Any], case_id: int) -> Dict[str, Any]:
    raw_input = case.get("input", [])
    if not isinstance(raw_input, list):
        raw_input = [raw_input]
    return {
        "id": case.get("id", case_id),
        "input": raw_input,
        "expected": case.get("expected"),
        "visible": bool(case.get("visible", case_id <= 3)),
    }


def _normalize_task(task: Dict[str, Any]) -> Dict[str, Any]:
    fallback = _default_task()
    normalized = dict(fallback)
    normalized.update(task or {})
    signature = normalized.get("starter_function_signature") or fallback["starter_function_signature"]
    normalized["starter_function_signature"] = signature
    normalized["function_name"] = normalized.get("function_name") or _extract_function_name(signature)
    normalized["recommended_language"] = normalized.get("recommended_language") or "python"
    test_cases = normalized.get("test_cases") or fallback["test_cases"]
    normalized["test_cases"] = [_normalize_test_case(case, idx + 1) for idx, case in enumerate(test_cases[:7])]
    if len(normalized["test_cases"]) < 7:
        for extra in fallback["test_cases"][len(normalized["test_cases"]):]:
            normalized["test_cases"].append(extra)
    visible_count = sum(1 for case in normalized["test_cases"] if case["visible"])
    if visible_count < 3:
        for case in normalized["test_cases"]:
            case["visible"] = case["id"] <= 3
    return normalized


def _build_latest_change(code: str, explanation: str) -> str:
    code_hash = sha1((code or "").encode("utf-8")).hexdigest()[:10]
    note_hash = sha1((explanation or "").encode("utf-8")).hexdigest()[:10]
    return f"code_hash={code_hash}; explanation_hash={note_hash}; code_len={len(code or '')}; explanation_len={len(explanation or '')}"


def _build_context_packet(state: CodingRoundState) -> str:
    task = state.get("task", {})
    packet = {
        "task": {
            "title": task.get("title"),
            "difficulty": task.get("difficulty"),
            "starter_function_signature": task.get("starter_function_signature"),
            "evaluation_focus": task.get("evaluation_focus", []),
        },
        "candidate_context": _truncate(state.get("answer_summary", ""), 1200),
        "rolling_feedback_summary": _truncate(state.get("prior_feedback", ""), 700),
        "latest_change": state.get("latest_change") or _build_latest_change(
            state.get("code", ""), state.get("explanation", "")
        ),
        "spoken_logic": _truncate(state.get("explanation", ""), 1000),
        "code_snapshot": _truncate(state.get("code", ""), 3500),
        "language": state.get("language", "python"),
        "mode": state.get("feedback_mode", "checkpoint"),
    }
    return json.dumps(packet, ensure_ascii=True)


def _llm_json(system_prompt: str, user_prompt: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        content = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=DEFAULT_MODEL,
            temperature=0.1,
            timeout=60,
        )
        result = _safe_json_extract(content)
        return result if result else _safe_json(content, fallback)
    except Exception as exc:
        fallback = dict(fallback)
        fallback.setdefault("coach_message", f"AI feedback unavailable right now: {exc}")
        return fallback


def _offline_coding_fallback(profile_text: str) -> Dict[str, Any]:
    profile_lower = (profile_text or "").lower()
    
    if "sql" in profile_lower or "database" in profile_lower:
        signature = "def find_duplicates(records):"
        return {
            "title": "Find Duplicate Records",
            "description": "Write a function that identifies duplicate email addresses from a list of user records.",
            "input_format": "A list of strings representing emails.",
            "output_format": "A list of strings containing only the duplicate emails.",
            "constraints": ["O(N) time complexity", "O(N) space complexity"],
            "examples": [
                {
                    "input": '["a@x.com", "b@x.com", "a@x.com"]',
                    "output": '["a@x.com"]',
                    "explanation": "a@x.com appears twice in the input list, making it a duplicate."
                }
            ],
            "evaluation_focus": ["Correctness", "Performance"],
            "starter_function_signature": signature,
            "function_name": _extract_function_name(signature),
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": [["a@x.com", "b@x.com", "a@x.com"]], "expected": ["a@x.com"], "visible": True},
                {"id": 2, "input": [["a", "b", "c"]], "expected": [], "visible": True},
                {"id": 3, "input": [["a", "a", "a"]], "expected": ["a"], "visible": True},
                {"id": 4, "input": [["x", "y", "z", "x"]], "expected": ["x"], "visible": False},
                {"id": 5, "input": [[]], "expected": [], "visible": False},
                {"id": 6, "input": [["1", "2", "2"]], "expected": ["2"], "visible": False},
                {"id": 7, "input": [["1", "1", "2", "2"]], "expected": ["1", "2"], "visible": False},
            ],
        }
    elif "react" in profile_lower or "javascript" in profile_lower or "frontend" in profile_lower:
        signature = "def debounce_simulation(calls, delay):"
        return {
            "title": "Debounce Simulation",
            "description": "Write a function that takes an array of timestamps (integers) and a delay. Return the number of times a debounced function would actually execute.",
            "input_format": "A list of integers (timestamps) and an integer delay.",
            "output_format": "An integer representing the execution count.",
            "constraints": ["Assume timestamps are sorted in ascending order."],
            "examples": [
                {
                    "input": "[10, 20, 100], 50",
                    "output": "2",
                    "explanation": "Calls at 10 and 20 are grouped together since they fall within the 50ms delay window. The call at 100 is processed separately."
                }
            ],
            "evaluation_focus": ["Correctness", "Understanding of Debounce"],
            "starter_function_signature": signature,
            "function_name": _extract_function_name(signature),
            "difficulty": "Medium",
            "recommended_language": "javascript",
            "timebox_minutes": 25,
            "test_cases": [
                {"id": 1, "input": [[10, 20, 100], 50], "expected": 2, "visible": True},
                {"id": 2, "input": [[10, 20, 30], 50], "expected": 1, "visible": True},
                {"id": 3, "input": [[], 50], "expected": 0, "visible": True},
                {"id": 4, "input": [[10, 60, 110], 50], "expected": 3, "visible": False},
                {"id": 5, "input": [[10, 10, 10], 5], "expected": 1, "visible": False},
                {"id": 6, "input": [[0, 5, 10, 15, 20], 100], "expected": 1, "visible": False},
                {"id": 7, "input": [[100, 200, 300], 10], "expected": 3, "visible": False},
            ],
        }
    else:
        return _default_task()

def generate_coding_task(profile_text: str, answers_data: List[Dict[str, Any]], interview_type: str = "Technical", industry: str = "General") -> Dict[str, Any]:
    answers_summary = "\n".join(
        f"- Q: {a.get('question_text', '')}\n  A: {_truncate(a.get('answer_text', ''), 220)}"
        for a in answers_data[-5:]
    )
    fallback = _offline_coding_fallback(profile_text)
    
    if interview_type == "Non-Technical":
        system_prompt = (
            f"You design realistic written business and management case study tasks for the '{industry}' industry. Return valid JSON only."
        )
        user_prompt = f"""
Create a single written case study round tailored to this candidate.

Profile:
{_truncate(profile_text, 2500)}

Recent interview answers:
{answers_summary or "- No answers available"}

Return JSON with:
- title
- description (The detailed scenario the candidate must read and respond to)
- input_format (Leave empty)
- output_format (Leave empty)
- constraints (Leave empty or provide guidelines like "Max 500 words")
- examples (Empty array)
- evaluation_focus (array of strings, e.g., ["Strategic thinking", "Problem solving"])
- starter_function_signature (Empty string)
- function_name (Empty string)
- difficulty
- recommended_language (Must be exactly "markdown")
- timebox_minutes
- test_cases (Must be an empty array: [])

Make the task a deep business or management scenario in the '{industry}' industry that requires the candidate to type out a structured, written strategy. Do NOT ask for code.
"""
    else:
        system_prompt = (
            f"You design realistic live-coding interview tasks tailored to the '{industry}' industry. Return valid JSON only."
        )
        user_prompt = f"""
Create a single coding round tailored to this candidate.

Profile:
{_truncate(profile_text, 2500)}

Recent interview answers:
{answers_summary or "- No answers available"}

Return JSON with:
- title
- description
- input_format
- output_format
- constraints (array)
- examples (array of objects with input, output, explanation)
- evaluation_focus (array)
- starter_function_signature
- function_name
- difficulty
- recommended_language
- timebox_minutes
- test_cases (exactly 7 items, each with input as JSON array args, expected, visible where first 3 are true and last 4 are false)

Make the task a pure function problem using only cross-language friendly inputs and outputs such as strings, numbers, booleans, or flat arrays. It should be solvable in 20-30 minutes and suitable for Python, JavaScript, Java, or C. The context and scenario of the problem MUST be heavily themed around the '{industry}' industry.
"""

    result = _llm_json(system_prompt, user_prompt, fallback)
    return _normalize_task(result)


def _prepare_context(state: CodingRoundState) -> CodingRoundState:
    state["latest_change"] = state.get("latest_change") or _build_latest_change(
        state.get("code", ""), state.get("explanation", "")
    )
    state["context_packet"] = _build_context_packet(state)
    return state


def _coach_candidate(state: CodingRoundState) -> CodingRoundState:
    fallback = {
        "coach_message": "Keep your explanation tightly aligned with the code you just wrote.",
        "strengths": ["You are making progress."],
        "risks": ["The draft could not be analyzed fully."],
        "next_steps": ["Run through one example manually and explain the data flow."],
        "scorecard": {
            "problem_understanding": 50,
            "implementation": 50,
            "communication": 50,
            "overall": 50,
        },
    }
    system_prompt = """
You are an expert live-coding interviewer.
Give concise, practical coaching based only on the compact context packet.
Do not reveal a full solution unless the candidate is completely blocked.
Return strict JSON only.
""".strip()
    final_mode = state.get("feedback_mode") == "final"
    user_prompt = f"""
Compact context packet:
{state.get("context_packet", "")}

Return JSON with:
- coach_message: short paragraph
- strengths: array of 2-3 short bullets
- risks: array of 2-3 short bullets
- next_steps: array of 2-4 concrete actions
- scorecard: object with problem_understanding, implementation, communication, overall (0-100)
{"- hiring_signal: short assessment" if final_mode else ""}
{"- final_recommendation: one of Strong Hire, Hire, Borderline, No Hire" if final_mode else ""}

Keep checkpoint feedback under 120 words in coach_message.
"""
    state["response"] = _llm_json(system_prompt, user_prompt, fallback)
    return state


def _build_graph():
    if not LANGGRAPH_AVAILABLE:
        return None
    graph = StateGraph(CodingRoundState)
    graph.add_node("prepare_context", _prepare_context)
    graph.add_node("coach_candidate", _coach_candidate)
    graph.set_entry_point("prepare_context")
    graph.add_edge("prepare_context", "coach_candidate")
    graph.add_edge("coach_candidate", END)
    return graph.compile()


CODING_GRAPH = _build_graph()


def run_coding_round(
    task: Dict[str, Any],
    answer_summary: str,
    code: str,
    explanation: str,
    language: str,
    prior_feedback: str = "",
    feedback_mode: str = "checkpoint",
) -> Dict[str, Any]:
    state: CodingRoundState = {
        "task": task,
        "answer_summary": answer_summary,
        "prior_feedback": prior_feedback,
        "code": code or "",
        "explanation": explanation or "",
        "language": language or "python",
        "feedback_mode": feedback_mode,
    }
    if CODING_GRAPH is not None:
        result = CODING_GRAPH.invoke(state)
    else:
        result = _coach_candidate(_prepare_context(state))
    response = dict(result.get("response", {}))
    response["context_window_strategy"] = {
        "langgraph_enabled": LANGGRAPH_AVAILABLE,
        "uses_compact_summary": True,
        "code_chars_sent": len(_truncate(code or "", 3500)),
        "explanation_chars_sent": len(_truncate(explanation or "", 1000)),
    }
    return response


def observe_coding_intent(
    task: Dict[str, Any],
    code: str,
    explanation: str,
    language: str,
) -> Dict[str, Any]:
    fallback = {
        "inferred_intent": "The candidate appears to be building the requested solution, but the current draft could not be fully interpreted.",
        "interviewer_prompt": "Walk me through the exact data structure or control flow you are using right now.",
        "follow_up_focus": "logic clarity",
    }
    compact_task = {
        "title": task.get("title"),
        "description": task.get("description"),
        "function_name": task.get("function_name"),
    }
    system_prompt = (
        "You are a live coding interviewer. Infer what the candidate is trying to implement and ask one concise question. Return strict JSON only."
    )
    user_prompt = f"""
Task:
{json.dumps(compact_task, ensure_ascii=True)}

Language: {language}
Candidate explanation:
{_truncate(explanation, 700)}

Candidate code:
{_truncate(code, 2200)}

Return JSON with:
- inferred_intent
- interviewer_prompt
- follow_up_focus

Keep interviewer_prompt under 24 words and make it easy to speak aloud.
"""
    return _llm_json(system_prompt, user_prompt, fallback)
