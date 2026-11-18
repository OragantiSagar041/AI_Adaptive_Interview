import json
import os
import re
from hashlib import sha1
from typing import Any, Dict, List, Optional, TypedDict

from app.ai.ai_client import chat_completion, extract_json as _safe_json_extract

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


def _truncate(text: Any, max_length: int = 2000) -> str:
    if isinstance(text, dict) or isinstance(text, list):
        import json
        text = json.dumps(text)
    elif not isinstance(text, str):
        text = str(text or "")
    text = text.strip()
    return text[:max_length] + "..." if len(text) > max_length else text


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
            {"id": 8, "input": [[8], ["Sam"]], "expected": ["Alex"], "visible": False},
            {"id": 9, "input": [[9], ["Alex"]], "expected": ["Alex"], "visible": False},
            {"id": 10, "input": [[10], ["Sam"]], "expected": ["Sam"], "visible": False},
            {"id": 11, "input": [[11], ["Alex"]], "expected": ["Sam"], "visible": False},
            {"id": 12, "input": [[12], ["Sam"]], "expected": ["Alex"], "visible": False},
            {"id": 13, "input": [[13], ["Alex"]], "expected": ["Alex"], "visible": False},
            {"id": 14, "input": [[14], ["Sam"]], "expected": ["Sam"], "visible": False},
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
    
    # Normalize constraints
    constraints = normalized.get("constraints")
    if not isinstance(constraints, list):
        normalized["constraints"] = [str(constraints)] if constraints else fallback["constraints"]
        
    # Normalize examples
    examples = normalized.get("examples")
    if not isinstance(examples, list):
        normalized["examples"] = fallback["examples"]
        
    fn_name = normalized.get("function_name") or (
        _extract_function_name(normalized.get("starter_function_signature", ""))
        if normalized.get("starter_function_signature")
        else "solution"
    )
    signature = normalized.get("starter_function_signature") or f"def {fn_name}(*args):"
    normalized["starter_function_signature"] = signature
    normalized["function_name"] = fn_name
    normalized["recommended_language"] = normalized.get("recommended_language") or "python"
    test_cases = normalized.get("test_cases") or fallback["test_cases"]
    normalized["test_cases"] = [_normalize_test_case(case, idx + 1) for idx, case in enumerate(test_cases[:14])]
    if len(normalized["test_cases"]) < 14:
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


def _llm_json(system_prompt: str, user_prompt: str, fallback: Dict[str, Any], temperature: float = 0.1) -> Dict[str, Any]:
    try:
        content = chat_completion(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=DEFAULT_MODEL,
            temperature=temperature,
            timeout=60,
        )
        result = _safe_json_extract(content)
        return result if result else _safe_json(content, fallback)
    except Exception as exc:
        fallback = dict(fallback) if isinstance(fallback, dict) else {}
        fallback.setdefault("coach_message", f"AI feedback unavailable right now: {exc}")
        return fallback


import random

_CODING_TITLE_STOPWORDS = {
    "a", "an", "the", "of", "in", "on", "to", "for", "with", "and", "or",
    "live", "coding", "challenge", "problem", "task", "write", "function",
    "calculator", "analyzer", "finder", "checker", "system", "manager",
}


def _normalize_coding_key(text: Any) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(text or "").lower()).strip()


def _coding_title_tokens(text: Any) -> set:
    return set(re.findall(r"[a-z0-9]+", str(text or "").lower())) - _CODING_TITLE_STOPWORDS


def _is_coding_task_duplicate(
    task: Optional[Dict[str, Any]],
    exclude_titles: Optional[List[str]] = None,
    exclude_functions: Optional[List[str]] = None,
) -> bool:
    if not isinstance(task, dict):
        return False
    title_norm = _normalize_coding_key(task.get("title"))
    fn_norm = _normalize_coding_key(task.get("function_name"))
    title_tokens = _coding_title_tokens(task.get("title"))

    for ex_fn in (exclude_functions or []):
        ex_fn_norm = _normalize_coding_key(ex_fn)
        if fn_norm and ex_fn_norm and fn_norm == ex_fn_norm and fn_norm not in ("solve", "solution", "main"):
            return True

    for ex_title in (exclude_titles or []):
        ex_norm = _normalize_coding_key(ex_title)
        if not ex_norm or not title_norm:
            continue
        if title_norm == ex_norm or title_norm in ex_norm or ex_norm in title_norm:
            return True
        ex_tokens = _coding_title_tokens(ex_title)
        if title_tokens and ex_tokens:
            inter = title_tokens & ex_tokens
            union = title_tokens | ex_tokens
            jaccard = len(inter) / len(union) if union else 0.0
            min_overlap = len(inter) / min(len(title_tokens), len(ex_tokens))
            if jaccard >= 0.50 or min_overlap >= 0.67:
                return True
    return False


def _offline_coding_fallback(
    profile_text: str,
    exclude_titles: Optional[List[str]] = None,
    exclude_functions: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    profile_lower = (profile_text or "").lower()
    
    tasks_pool = [
        {
            "title": "Find Duplicate Emails",
            "description": "Write a function that receives a list of email strings and returns a list containing only the unique duplicate email addresses.",
            "input_format": "A list of strings.",
            "output_format": "A list of strings containing unique duplicate emails.",
            "constraints": ["1 <= records.length <= 10^4"],
            "examples": [{"input": '["a@x.com", "b@x.com", "a@x.com"]', "output": '["a@x.com"]', "explanation": "a@x.com appears twice."}],
            "evaluation_focus": ["Hash Set / Data Structures", "O(N) Complexity"],
            "starter_function_signature": "def find_duplicates(records):",
            "function_name": "find_duplicates",
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
                {"id": 8, "input": [["x@x.com", "y@x.com", "x@x.com", "z@x.com", "z@x.com"]], "expected": ["x@x.com", "z@x.com"], "visible": False},
                {"id": 9, "input": [["a", "b", "a", "b"]], "expected": ["a", "b"], "visible": False},
                {"id": 10, "input": [["a", "b", "c", "d", "e"]], "expected": [], "visible": False},
                {"id": 11, "input": [["q", "q", "q", "q"]], "expected": ["q"], "visible": False},
                {"id": 12, "input": [["dup", "dup"]], "expected": ["dup"], "visible": False},
                {"id": 13, "input": [["a", "b", "c", "d", "a", "b", "c"]], "expected": ["a", "b", "c"], "visible": False},
                {"id": 14, "input": [["one", "two", "three"]], "expected": [], "visible": False},
            ],
        },
        {
            "title": "Two Sum Target Pair",
            "description": "Write a function that finds indices of two numbers in an array that add up to a target integer.",
            "input_format": "An array of integers `nums` and an integer `target`.",
            "output_format": "An array of two indices [i, j].",
            "constraints": ["2 <= nums.length <= 10^4"],
            "examples": [{"input": "[2, 7, 11, 15], 9", "output": "[0, 1]", "explanation": "nums[0] + nums[1] == 9."}],
            "evaluation_focus": ["Array Indexing", "Hash Map Optimization"],
            "starter_function_signature": "def two_sum(nums, target):",
            "function_name": "two_sum",
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": [[2, 7, 11, 15], 9], "expected": [0, 1], "visible": True},
                {"id": 2, "input": [[3, 2, 4], 6], "expected": [1, 2], "visible": True},
                {"id": 3, "input": [[3, 3], 6], "expected": [0, 1], "visible": True},
                {"id": 4, "input": [[1, 5, 2, 7], 8], "expected": [0, 3], "visible": False},
                {"id": 5, "input": [[-1, -2, -3, -4, -5], -8], "expected": [2, 4], "visible": False},
                {"id": 6, "input": [[10, 25, 35, 40], 50], "expected": [0, 3], "visible": False},
                {"id": 7, "input": [[0, 4, 3, 0], 0], "expected": [0, 3], "visible": False},
                {"id": 8, "input": [[-3, 4, 3, 90], 0], "expected": [0, 2], "visible": False},
                {"id": 9, "input": [[1, 2], 3], "expected": [0, 1], "visible": False},
                {"id": 10, "input": [[5, 75, 25], 100], "expected": [1, 2], "visible": False},
                {"id": 11, "input": [[1, 9, 4, 8], 10], "expected": [0, 1], "visible": False},
                {"id": 12, "input": [[2, 5, 7, 8], 10], "expected": [0, 3], "visible": False},
                {"id": 13, "input": [[100, 200, 300], 500], "expected": [1, 2], "visible": False},
                {"id": 14, "input": [[4, 4], 8], "expected": [0, 1], "visible": False},
            ],
        },
        {
            "title": "Max Subarray Sum",
            "description": "Given an integer array `nums`, find the contiguous subarray with the largest sum and return its sum.",
            "input_format": "An array of integers `nums`.",
            "output_format": "An integer representing max sum.",
            "constraints": ["1 <= nums.length <= 10^5"],
            "examples": [{"input": "[-2,1,-3,4,-1,2,1,-5,4]", "output": "6", "explanation": "[4,-1,2,1] has largest sum 6."}],
            "evaluation_focus": ["Kadane's Algorithm", "Dynamic Programming"],
            "starter_function_signature": "def max_sub_array(nums):",
            "function_name": "max_sub_array",
            "difficulty": "Medium",
            "recommended_language": "python",
            "timebox_minutes": 25,
            "test_cases": [
                {"id": 1, "input": [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], "expected": 6, "visible": True},
                {"id": 2, "input": [[1]], "expected": 1, "visible": True},
                {"id": 3, "input": [[5, 4, -1, 7, 8]], "expected": 23, "visible": True},
                {"id": 4, "input": [[-1]], "expected": -1, "visible": False},
                {"id": 5, "input": [[-2, -1]], "expected": -1, "visible": False},
                {"id": 6, "input": [[1, 2, 3, 4, 5]], "expected": 15, "visible": False},
                {"id": 7, "input": [[-1, -2, -3]], "expected": -1, "visible": False},
                {"id": 8, "input": [[0, 0, 0]], "expected": 0, "visible": False},
                {"id": 9, "input": [[2, -1, 2]], "expected": 3, "visible": False},
                {"id": 10, "input": [[-2, 3, 2, -1]], "expected": 5, "visible": False},
                {"id": 11, "input": [[10, -5, 10]], "expected": 15, "visible": False},
                {"id": 12, "input": [[-5, 10, -2, 4]], "expected": 12, "visible": False},
                {"id": 13, "input": [[1, -1, 1, -1, 1]], "expected": 1, "visible": False},
                {"id": 14, "input": [[100, -100, 200]], "expected": 200, "visible": False},
            ],
        },
        {
            "title": "Valid Parentheses Matcher",
            "description": "Given a string `s` containing only '(', ')', '{', '}', '[' and ']', determine if the input brackets are properly balanced and nested.",
            "input_format": "A string `s` of bracket characters.",
            "output_format": "Boolean `True` if balanced, otherwise `False`.",
            "constraints": ["0 <= s.length <= 10^4"],
            "examples": [{"input": '"()[]{}"', "output": "true", "explanation": "All brackets close in valid order."}],
            "evaluation_focus": ["Stack Data Structure", "Edge Case Handling"],
            "starter_function_signature": "def is_valid_brackets(s):",
            "function_name": "is_valid_brackets",
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": ["()[]{}"], "expected": True, "visible": True},
                {"id": 2, "input": ["(]"], "expected": False, "visible": True},
                {"id": 3, "input": ["({[]})"], "expected": True, "visible": True},
                {"id": 4, "input": [""], "expected": True, "visible": False},
                {"id": 5, "input": ["("], "expected": False, "visible": False},
                {"id": 6, "input": [")"], "expected": False, "visible": False},
                {"id": 7, "input": ["([)]"], "expected": False, "visible": False},
                {"id": 8, "input": ["{[]}"], "expected": True, "visible": False},
                {"id": 9, "input": ["((()))"], "expected": True, "visible": False},
                {"id": 10, "input": ["((())"], "expected": False, "visible": False},
                {"id": 11, "input": ["[]{}(())"], "expected": True, "visible": False},
                {"id": 12, "input": ["}{"], "expected": False, "visible": False},
                {"id": 13, "input": ["[[[[]]]]"], "expected": True, "visible": False},
                {"id": 14, "input": ["[({})](]"], "expected": False, "visible": False},
            ],
        },
        {
            "title": "First Non-Repeating Character",
            "description": "Given a string `s`, find the index of the first character that does not repeat anywhere in the string. Return -1 if none exists.",
            "input_format": "A lowercase string `s`.",
            "output_format": "Integer index of the first unique character, or -1.",
            "constraints": ["0 <= s.length <= 10^5"],
            "examples": [{"input": '"leetcode"', "output": "0", "explanation": "'l' appears once at index 0."}],
            "evaluation_focus": ["Frequency Counting", "Two-Pass O(N) Scan"],
            "starter_function_signature": "def first_unique_char(s):",
            "function_name": "first_unique_char",
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": ["leetcode"], "expected": 0, "visible": True},
                {"id": 2, "input": ["loveleetcode"], "expected": 2, "visible": True},
                {"id": 3, "input": ["aabb"], "expected": -1, "visible": True},
                {"id": 4, "input": [""], "expected": -1, "visible": False},
                {"id": 5, "input": ["z"], "expected": 0, "visible": False},
                {"id": 6, "input": ["aadadaad"], "expected": -1, "visible": False},
                {"id": 7, "input": ["abcabcx"], "expected": 6, "visible": False},
                {"id": 8, "input": ["swiss"], "expected": 1, "visible": False},
                {"id": 9, "input": ["racecar"], "expected": 3, "visible": False},
                {"id": 10, "input": ["aabbccd"], "expected": 6, "visible": False},
                {"id": 11, "input": ["xxyz"], "expected": 2, "visible": False},
                {"id": 12, "input": ["bbbb"], "expected": -1, "visible": False},
                {"id": 13, "input": ["abac"], "expected": 1, "visible": False},
                {"id": 14, "input": ["python"], "expected": 0, "visible": False},
            ],
        },
        {
            "title": "Merge Overlapping Intervals",
            "description": "Given an array of intervals `[start, end]`, merge all overlapping intervals and return an array of non-overlapping intervals sorted by start time.",
            "input_format": "A list of `[start, end]` integer pairs.",
            "output_format": "A sorted list of merged `[start, end]` pairs.",
            "constraints": ["0 <= intervals.length <= 10^4"],
            "examples": [{"input": "[[1,3],[2,6],[8,10],[15,18]]", "output": "[[1,6],[8,10],[15,18]]", "explanation": "[1,3] and [2,6] overlap."}],
            "evaluation_focus": ["Sorting", "Interval Merging"],
            "starter_function_signature": "def merge_intervals(intervals):",
            "function_name": "merge_intervals",
            "difficulty": "Medium",
            "recommended_language": "python",
            "timebox_minutes": 25,
            "test_cases": [
                {"id": 1, "input": [[[1, 3], [2, 6], [8, 10], [15, 18]]], "expected": [[1, 6], [8, 10], [15, 18]], "visible": True},
                {"id": 2, "input": [[[1, 4], [4, 5]]], "expected": [[1, 5]], "visible": True},
                {"id": 3, "input": [[[5, 6], [1, 2]]], "expected": [[1, 2], [5, 6]], "visible": True},
                {"id": 4, "input": [[]], "expected": [], "visible": False},
                {"id": 5, "input": [[[1, 10], [2, 3], [4, 5]]], "expected": [[1, 10]], "visible": False},
                {"id": 6, "input": [[[1, 4], [0, 4]]], "expected": [[0, 4]], "visible": False},
                {"id": 7, "input": [[[1, 4], [0, 1]]], "expected": [[0, 4]], "visible": False},
                {"id": 8, "input": [[[1, 4], [2, 3]]], "expected": [[1, 4]], "visible": False},
                {"id": 9, "input": [[[2, 3], [4, 5], [6, 7], [1, 10]]], "expected": [[1, 10]], "visible": False},
                {"id": 10, "input": [[[1, 2]]], "expected": [[1, 2]], "visible": False},
                {"id": 11, "input": [[[1, 3], [4, 6], [7, 9]]], "expected": [[1, 3], [4, 6], [7, 9]], "visible": False},
                {"id": 12, "input": [[[1, 5], [2, 6], [3, 7]]], "expected": [[1, 7]], "visible": False},
                {"id": 13, "input": [[[10, 12], [8, 10], [6, 8]]], "expected": [[6, 12]], "visible": False},
                {"id": 14, "input": [[[0, 0], [1, 1]]], "expected": [[0, 0], [1, 1]], "visible": False},
            ],
        },
        {
            "title": "Longest Substring Without Repeating Characters",
            "description": "Given a string `s`, find the length of the longest contiguous substring that contains no duplicate characters.",
            "input_format": "A string `s`.",
            "output_format": "An integer representing the maximum unique substring length.",
            "constraints": ["0 <= s.length <= 5 * 10^4"],
            "examples": [{"input": '"abcabcbb"', "output": "3", "explanation": 'The answer is "abc", length 3.'}],
            "evaluation_focus": ["Sliding Window", "Hash Map Index Tracking"],
            "starter_function_signature": "def longest_unique_substring(s):",
            "function_name": "longest_unique_substring",
            "difficulty": "Medium",
            "recommended_language": "python",
            "timebox_minutes": 25,
            "test_cases": [
                {"id": 1, "input": ["abcabcbb"], "expected": 3, "visible": True},
                {"id": 2, "input": ["bbbbb"], "expected": 1, "visible": True},
                {"id": 3, "input": ["pwwkew"], "expected": 3, "visible": True},
                {"id": 4, "input": [""], "expected": 0, "visible": False},
                {"id": 5, "input": [" "], "expected": 1, "visible": False},
                {"id": 6, "input": ["au"], "expected": 2, "visible": False},
                {"id": 7, "input": ["dvdf"], "expected": 3, "visible": False},
                {"id": 8, "input": ["abba"], "expected": 2, "visible": False},
                {"id": 9, "input": ["abcdef"], "expected": 6, "visible": False},
                {"id": 10, "input": ["tmmzuxt"], "expected": 5, "visible": False},
                {"id": 11, "input": ["aabaab!bb"], "expected": 3, "visible": False},
                {"id": 12, "input": ["nfpdmpi"], "expected": 5, "visible": False},
                {"id": 13, "input": ["ohvhjdml"], "expected": 6, "visible": False},
                {"id": 14, "input": ["ckilbkd"], "expected": 5, "visible": False},
            ],
        },
        {
            "title": "Product of Array Except Self",
            "description": "Given an integer array `nums`, return an array `answer` such that `answer[i]` equals the product of all elements of `nums` except `nums[i]`, without using division.",
            "input_format": "An array of integers `nums`.",
            "output_format": "An array of integers representing products except self.",
            "constraints": ["2 <= nums.length <= 10^5"],
            "examples": [{"input": "[1,2,3,4]", "output": "[24,12,8,6]", "explanation": "Prefix and suffix products multiply cleanly."}],
            "evaluation_focus": ["Prefix & Suffix Products", "O(N) Without Division"],
            "starter_function_signature": "def product_except_self(nums):",
            "function_name": "product_except_self",
            "difficulty": "Medium",
            "recommended_language": "python",
            "timebox_minutes": 25,
            "test_cases": [
                {"id": 1, "input": [[1, 2, 3, 4]], "expected": [24, 12, 8, 6], "visible": True},
                {"id": 2, "input": [[-1, 1, 0, -3, 3]], "expected": [0, 0, 9, 0, 0], "visible": True},
                {"id": 3, "input": [[2, 3]], "expected": [3, 2], "visible": True},
                {"id": 4, "input": [[0, 0]], "expected": [0, 0], "visible": False},
                {"id": 5, "input": [[1, 1, 1, 1]], "expected": [1, 1, 1, 1], "visible": False},
                {"id": 6, "input": [[5, 2, 3]], "expected": [6, 15, 10], "visible": False},
                {"id": 7, "input": [[-1, -2, -3]], "expected": [6, 3, 2], "visible": False},
                {"id": 8, "input": [[0, 4, 5]], "expected": [20, 0, 0], "visible": False},
                {"id": 9, "input": [[2, 2, 2]], "expected": [4, 4, 4], "visible": False},
                {"id": 10, "input": [[10, 0, 0]], "expected": [0, 0, 0], "visible": False},
                {"id": 11, "input": [[1, 2, 0, 4]], "expected": [0, 0, 8, 0], "visible": False},
                {"id": 12, "input": [[3, 4, 5, 6]], "expected": [120, 90, 72, 60], "visible": False},
                {"id": 13, "input": [[-2, 3, -4]], "expected": [-12, 8, -6], "visible": False},
                {"id": 14, "input": [[7, 1]], "expected": [1, 7], "visible": False},
            ],
        },
        {
            "title": "Best Time to Buy and Sell Stock",
            "description": "Given an array `prices` where `prices[i]` is the price of a stock on day `i`, return the maximum profit achievable from one buy followed by one sell. Return 0 if no profit is possible.",
            "input_format": "An array of non-negative integers `prices`.",
            "output_format": "An integer representing maximum single-transaction profit.",
            "constraints": ["1 <= prices.length <= 10^5"],
            "examples": [{"input": "[7,1,5,3,6,4]", "output": "5", "explanation": "Buy at 1, sell at 6 for profit 5."}],
            "evaluation_focus": ["Greedy One-Pass", "Running Minimum Tracking"],
            "starter_function_signature": "def max_profit(prices):",
            "function_name": "max_profit",
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": [[7, 1, 5, 3, 6, 4]], "expected": 5, "visible": True},
                {"id": 2, "input": [[7, 6, 4, 3, 1]], "expected": 0, "visible": True},
                {"id": 3, "input": [[2, 4, 1]], "expected": 2, "visible": True},
                {"id": 4, "input": [[1]], "expected": 0, "visible": False},
                {"id": 5, "input": [[1, 2]], "expected": 1, "visible": False},
                {"id": 6, "input": [[2, 1]], "expected": 0, "visible": False},
                {"id": 7, "input": [[3, 3, 3]], "expected": 0, "visible": False},
                {"id": 8, "input": [[1, 2, 3, 4, 5]], "expected": 4, "visible": False},
                {"id": 9, "input": [[5, 1, 2, 10]], "expected": 9, "visible": False},
                {"id": 10, "input": [[10, 2, 8, 1, 9]], "expected": 8, "visible": False},
                {"id": 11, "input": [[0, 5, 0, 10]], "expected": 10, "visible": False},
                {"id": 12, "input": [[4, 2, 1, 7]], "expected": 6, "visible": False},
                {"id": 13, "input": [[6, 1, 3, 2, 4, 7]], "expected": 6, "visible": False},
                {"id": 14, "input": [[100, 180, 260, 310, 40, 535, 695]], "expected": 655, "visible": False},
            ],
        },
        {
            "title": "Rotate Array by K Steps",
            "description": "Given an integer array `nums` and a non-negative integer `k`, return the array rotated to the right by `k` steps.",
            "input_format": "An array of integers `nums` and integer `k`.",
            "output_format": "The right-rotated integer array.",
            "constraints": ["0 <= nums.length <= 10^5", "0 <= k <= 10^5"],
            "examples": [{"input": "[1,2,3,4,5,6,7], 3", "output": "[5,6,7,1,2,3,4]", "explanation": "Rotated 3 steps to the right."}],
            "evaluation_focus": ["Modulo Normalization", "Array Slicing / Reversal"],
            "starter_function_signature": "def rotate_array(nums, k):",
            "function_name": "rotate_array",
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": [[1, 2, 3, 4, 5, 6, 7], 3], "expected": [5, 6, 7, 1, 2, 3, 4], "visible": True},
                {"id": 2, "input": [[-1, -100, 3, 99], 2], "expected": [3, 99, -1, -100], "visible": True},
                {"id": 3, "input": [[1, 2, 3], 4], "expected": [3, 1, 2], "visible": True},
                {"id": 4, "input": [[], 3], "expected": [], "visible": False},
                {"id": 5, "input": [[1], 10], "expected": [1], "visible": False},
                {"id": 6, "input": [[1, 2, 3], 0], "expected": [1, 2, 3], "visible": False},
                {"id": 7, "input": [[1, 2, 3], 3], "expected": [1, 2, 3], "visible": False},
                {"id": 8, "input": [[1, 2], 1], "expected": [2, 1], "visible": False},
                {"id": 9, "input": [[1, 2], 3], "expected": [2, 1], "visible": False},
                {"id": 10, "input": [[5, 6, 7, 8], 1], "expected": [8, 5, 6, 7], "visible": False},
                {"id": 11, "input": [[5, 6, 7, 8], 2], "expected": [7, 8, 5, 6], "visible": False},
                {"id": 12, "input": [[10, 20, 30, 40, 50], 7], "expected": [40, 50, 10, 20, 30], "visible": False},
                {"id": 13, "input": [[0, 0, 1], 1], "expected": [1, 0, 0], "visible": False},
                {"id": 14, "input": [[9, 8, 7, 6], 6], "expected": [7, 6, 9, 8], "visible": False},
            ],
        },
        {
            "title": "Run-Length String Compression",
            "description": "Write a function that performs run-length encoding on string `s` by replacing consecutive identical characters with the character followed by its count (e.g., 'aaabbc' -> 'a3b2c1'). Return empty string for empty input.",
            "input_format": "A string `s`.",
            "output_format": "The run-length encoded string.",
            "constraints": ["0 <= s.length <= 10^4"],
            "examples": [{"input": '"aaabbc"', "output": '"a3b2c1"', "explanation": "3 a's, 2 b's, 1 c."}],
            "evaluation_focus": ["Two-Pointer String Scan", "Linear Builder Pattern"],
            "starter_function_signature": "def compress_string(s):",
            "function_name": "compress_string",
            "difficulty": "Easy",
            "recommended_language": "python",
            "timebox_minutes": 20,
            "test_cases": [
                {"id": 1, "input": ["aaabbc"], "expected": "a3b2c1", "visible": True},
                {"id": 2, "input": ["abcd"], "expected": "a1b1c1d1", "visible": True},
                {"id": 3, "input": ["aaaaa"], "expected": "a5", "visible": True},
                {"id": 4, "input": [""], "expected": "", "visible": False},
                {"id": 5, "input": ["x"], "expected": "x1", "visible": False},
                {"id": 6, "input": ["aabbcc"], "expected": "a2b2c2", "visible": False},
                {"id": 7, "input": ["aabba"], "expected": "a2b2a1", "visible": False},
                {"id": 8, "input": ["wwwwwaaadexxxxxx"], "expected": "w5a3d1e1x6", "visible": False},
                {"id": 9, "input": ["11122"], "expected": "1322", "visible": False},
                {"id": 10, "input": ["AAaa"], "expected": "A2a2", "visible": False},
                {"id": 11, "input": ["zzzz"], "expected": "z4", "visible": False},
                {"id": 12, "input": ["ababa"], "expected": "a1b1a1b1a1", "visible": False},
                {"id": 13, "input": ["bbccc"], "expected": "b2c3", "visible": False},
                {"id": 14, "input": ["mmnnpp"], "expected": "m2n2p2", "visible": False},
            ],
        },
        {
            "title": "Count Subarrays With Target Sum",
            "description": "Given an integer array `nums` and an integer `k`, return the total number of contiguous subarrays whose sum equals `k`.",
            "input_format": "An integer array `nums` and target integer `k`.",
            "output_format": "Integer count of subarrays summing to `k`.",
            "constraints": ["1 <= nums.length <= 2 * 10^4"],
            "examples": [{"input": "[1,1,1], 2", "output": "2", "explanation": "Two subarrays [1,1] sum to 2."}],
            "evaluation_focus": ["Prefix Sum Hash Map", "O(N) Complexity"],
            "starter_function_signature": "def subarray_sum_count(nums, k):",
            "function_name": "subarray_sum_count",
            "difficulty": "Medium",
            "recommended_language": "python",
            "timebox_minutes": 25,
            "test_cases": [
                {"id": 1, "input": [[1, 1, 1], 2], "expected": 2, "visible": True},
                {"id": 2, "input": [[1, 2, 3], 3], "expected": 2, "visible": True},
                {"id": 3, "input": [[1, -1, 0], 0], "expected": 3, "visible": True},
                {"id": 4, "input": [[0, 0, 0], 0], "expected": 6, "visible": False},
                {"id": 5, "input": [[5], 5], "expected": 1, "visible": False},
                {"id": 6, "input": [[5], 3], "expected": 0, "visible": False},
                {"id": 7, "input": [[3, 4, 7, 2, -3, 1, 4, 2], 7], "expected": 4, "visible": False},
                {"id": 8, "input": [[-1, -1, 1], 0], "expected": 1, "visible": False},
                {"id": 9, "input": [[2, 2, 2], 4], "expected": 2, "visible": False},
                {"id": 10, "input": [[1, 2, 1, 2, 1], 3], "expected": 4, "visible": False},
                {"id": 11, "input": [[10, -10, 10], 10], "expected": 3, "visible": False},
                {"id": 12, "input": [[4, 5, 0, -2, -3, 1], 5], "expected": 3, "visible": False},
                {"id": 13, "input": [[1, 2, 3, 4], 10], "expected": 1, "visible": False},
                {"id": 14, "input": [[2, -2, 2, -2], 0], "expected": 4, "visible": False},
            ],
        },
    ]

    available = [
        t for t in tasks_pool
        if not _is_coding_task_duplicate(t, exclude_titles, exclude_functions)
    ]
    if not available:
        return None
    return random.choice(available)


def generate_coding_task(
    profile_text: str,
    answers_data: List[Dict[str, Any]],
    interview_type: str = "Technical",
    industry: str = "General",
    language: str = "English",
    exclude_titles: Optional[List[str]] = None,
    exclude_functions: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    answers_summary = "\n".join(
        f"- Q: {a.get('question_text', '')}\n  A: {_truncate(a.get('answer_text', ''), 220)}"
        for a in (answers_data or [])[-5:]
    )
    exclude_titles = [str(t).strip() for t in (exclude_titles or []) if str(t).strip()]
    exclude_functions = [str(f).strip() for f in (exclude_functions or []) if str(f).strip()]
    fallback = _offline_coding_fallback(profile_text, exclude_titles=exclude_titles, exclude_functions=exclude_functions)

    exclude_block = ""
    if exclude_titles or exclude_functions:
        lines = []
        if exclude_titles:
            lines.append("ALREADY USED CODING TITLES / PROBLEMS (STRICTLY FORBIDDEN TO REPEAT OR REPHRASE):")
            lines.extend(f"- {t}" for t in exclude_titles[:30])
        if exclude_functions:
            lines.append("ALREADY USED FUNCTION NAMES (DO NOT REUSE): " + ", ".join(exclude_functions[:30]))
        exclude_block = "\n" + "\n".join(lines) + "\n"

    algorithmic_themes = [
        "Hash Map / Frequency Aggregation",
        "Sliding Window / Contiguous Subarray or Substring",
        "Stack / Monotonic Stack / Bracket or Expression Parsing",
        "Intervals / Sorting & Merging Ranges",
        "Two Pointers / In-place Array Partitioning",
        "Prefix Sum / Cumulative Metrics",
        "String Parsing / Run-Length Encoding or Log Normalization",
        "Greedy Optimization / Scheduling",
        "Dynamic Programming / Optimal Substructure",
        "Queue / Rate Limiting or Stream Window Simulation",
    ]
    chosen_theme = algorithmic_themes[len(exclude_titles) % len(algorithmic_themes)]
    temp = 0.6 if exclude_titles else 0.2

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
{exclude_block}
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
CRITICAL: All text fields (title, description, constraints, evaluation_focus) MUST be written in {language}. Do NOT use English unless {language} is English.
"""
    else:
        system_prompt = (
            f"You design realistic live-coding interview tasks tailored to the '{industry}' industry. "
            f"NEVER repeat or rephrase any previously used coding task. Return valid JSON only."
        )
        user_prompt = f"""
Create a brand-new, completely unique single coding round tailored to this candidate.
REQUIRED ALGORITHMIC PATTERN FOR THIS TASK: {chosen_theme}

Profile:
{_truncate(profile_text, 2500)}

Recent interview answers:
{answers_summary or "- No answers available"}
{exclude_block}
Return JSON with:
- title (MUST be completely different from every excluded title above)
- description
- input_format
- output_format
- constraints (array)
- examples (array of objects with input, output, explanation)
- evaluation_focus (array)
- starter_function_signature
- function_name (MUST be completely different from every excluded function name above)
- difficulty
- recommended_language
- timebox_minutes
- test_cases (exactly 14 items, each with input as JSON array args, expected, visible where first 3 are true and last 11 are false)

Make the task a pure function problem using only cross-language friendly inputs and outputs such as strings, numbers, booleans, or flat arrays. It should be solvable in 20-30 minutes and suitable for Python, JavaScript, Java, or C. The context and scenario of the problem MUST be heavily themed around the '{industry}' industry.
All text fields MUST be written in English.
"""

    result = _llm_json(system_prompt, user_prompt, fallback or {}, temperature=temp)
    normalized = _normalize_task(result) if isinstance(result, dict) and result.get("title") else None
    if normalized and not _is_coding_task_duplicate(normalized, exclude_titles, exclude_functions):
        return normalized
    if fallback and not _is_coding_task_duplicate(fallback, exclude_titles, exclude_functions):
        return _normalize_task(fallback)
    return None


def _prepare_context(state: CodingRoundState) -> CodingRoundState:
    state["latest_change"] = state.get("latest_change") or _build_latest_change(
        state.get("code", ""), state.get("explanation", "")
    )
    state["context_packet"] = _build_context_packet(state)
    return state


def _coach_candidate(state: CodingRoundState) -> CodingRoundState:
    fallback = {
        "coach_message": "Keep your implementation focused on solving the problem step-by-step and handling boundary conditions.",
        "strengths": ["Good attempt at structuring the core logic."],
        "risks": ["Check potential edge cases and input boundary conditions."],
        "next_steps": ["Walk through the algorithm with sample inputs to verify edge cases."],
        "scorecard": {
            "problem_understanding": 65,
            "implementation": 60,
            "communication": 60,
            "overall": 62,
        },
    }
    system_prompt = """
You are an expert technical interviewer and coding coach.
Review the candidate's currently written code for the given problem.
Analyze:
1. Logic correctness & approach.
2. Potential bugs, syntax/runtime issues, or missed edge cases.
3. Time & space complexity.
4. Suggestions to improve without giving away the full solution code.

Return strict JSON only.
""".strip()
    final_mode = state.get("feedback_mode") == "final"
    user_prompt = f"""
Compact context packet:
{state.get("context_packet", "")}

Return JSON with:
- coach_message: A clear, encouraging, and direct code review paragraph (max 120 words) analyzing what the candidate wrote so far.
- strengths: array of 2-3 specific positive observations about their written code or logic.
- risks: array of 2-3 specific bugs, edge cases missed, or performance bottlenecks in their code.
- next_steps: array of 2-3 actionable hints or steps they should take to fix/complete their code.
- scorecard: object with problem_understanding (0-100), implementation (0-100), communication (0-100), overall (0-100)
{"- hiring_signal: short assessment" if final_mode else ""}
{"- final_recommendation: one of Strong Hire, Hire, Borderline, No Hire" if final_mode else ""}
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
