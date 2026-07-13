# ---------------------------------------------------------------------------
# Standard library
# ---------------------------------------------------------------------------
import os
import sys
import io
import json
import hmac
import math
import uuid
import html
import time
import random
import base64
import shutil
import hashlib
import textwrap
import asyncio
import subprocess
import tempfile
import threading
import traceback
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# ---------------------------------------------------------------------------
# Third-party
# ---------------------------------------------------------------------------
import bcrypt
import jwt
import requests
import cloudinary
import cloudinary.uploader
import cloudinary.api
import edge_tts
import PyPDF2
from bson import ObjectId
from docx import Document
from dotenv import load_dotenv
from groq import AsyncGroq
from pydantic import BaseModel
from starlette.background import BackgroundTask

from fastapi import (
    Depends, File, Form, HTTPException, Request, UploadFile,
    WebSocket, WebSocketDisconnect,
)
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

# ---------------------------------------------------------------------------
# Internal / project
# ---------------------------------------------------------------------------
from ai_client import chat_completion, extract_json
from analyze_answer import analyze_answer
from coding_graph import generate_coding_task, observe_coding_intent, run_coding_round
from industry_fallback_data import INDUSTRY_TECHNICAL_QUESTIONS, INDUSTRY_CASE_STUDIES
from redis_manager import manager

try:
    from typed_ai_layer import parse_resume as _typed_parse_resume
    from typed_ai_layer import generate_summary as _typed_generate_summary
    from typed_ai_layer import generate_followup as _typed_generate_followup
    _TYPED_LAYER_AVAILABLE = True
except ImportError:
    _TYPED_LAYER_AVAILABLE = False
    print("[WARN] typed_ai_layer not available")

from .models import *
from .database import *
from .config import *

load_dotenv()

def cloudinary_cleanup_loop():
    while True:
        try:
            now = datetime.now(timezone.utc)
            cutoff = now - timedelta(days=RECORDING_RETENTION_DAYS)
            
            print(f"[Cleanup] Running Cloudinary maintenance (Cutoff: {cutoff.isoformat()})...")
            
            old_recordings = interviews_collection.find({
                "cloudinary_public_id": {"$exists": True, "$ne": ""},
                "$or": [
                    {"recording_expires_at": {"$lt": now.isoformat()}},
                    {
                        "recording_expires_at": {"$exists": False},
                        "recording_uploaded_at": {"$lt": cutoff.isoformat()}
                    }
                ]
            })
            
            count = 0
            for rec in old_recordings:
                public_id = rec.get("cloudinary_public_id")
                created_at = rec.get("created_at", "unknown")
                if public_id:
                    try:
                        print(f" [Cleanup] Deleting old recording {public_id} (Created: {created_at})")
                        cloudinary.uploader.destroy(public_id, resource_type="video")
                        interviews_collection.update_one(
                            {"_id": rec["_id"]},
                            {"$unset": {
                                "recording_path": "",
                                "cloudinary_public_id": "",
                                "recording_uploaded_at": "",
                                "recording_expires_at": "",
                                "recording_retention_days": "",
                                "recording_storage": ""
                            }}
                        )
                        count += 1
                    except Exception as e:
                        print(f"[Error] [Cleanup] Error deleting {public_id}: {e}")
            
            if count > 0:
                print(f"[OK] [Cleanup] Successfully removed {count} old recordings.")
                
        except Exception as e:
            print(f"[Error] [Cleanup] Loop error: {e}")
        
        # Run once every 24 hours
        time.sleep(86400)

# Configuration
def normalize_plan_key(plan_name: Optional[str]) -> str:
    if not plan_name:
        return "trial"
    return PLAN_ALIASES.get(str(plan_name).strip().lower(), "trial")

def get_plan_definition(plan_name: Optional[str]) -> Dict[str, Any]:
    plan_key = normalize_plan_key(plan_name)
    base = PLAN_DEFINITIONS.get(plan_key, PLAN_DEFINITIONS["trial"])
    return {
        "plan_key": plan_key,
        "label": base["label"],
        "credits_granted": base["credits_granted"],
        "price": base["price"],
        "summary": base["summary"],
        "features": list(base["features"]),
        "capabilities": dict(base["capabilities"]),
    }

def serialize_plan(plan_doc: Dict[str, Any]) -> Dict[str, Any]:
    definition = get_plan_definition(plan_doc.get("plan_name"))
    return {
        "id": str(plan_doc["_id"]),
        "plan_key": definition["plan_key"],
        "plan_name": definition["label"],
        "credits_granted": plan_doc.get("credits_granted", definition["credits_granted"]),
        "price": plan_doc.get("price", definition["price"]),
        "features": plan_doc.get("features", definition["features"]),
        "summary": definition["summary"],
        "capabilities": definition["capabilities"],
        "is_unlimited": plan_doc.get("is_unlimited", False),
        "is_owner_plan": plan_doc.get("is_owner_plan", False),
    }

def get_subscription_status(expiry: Optional[str]) -> Dict[str, Any]:
    if not expiry:
        return {
            "expiry_iso": expiry,
            "expiry_dt": None,
            "is_expired": False,
            "days_remaining": None,
            "warning": False,
            "warning_message": "",
        }

    try:
        expiry_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        remaining_seconds = (expiry_dt - now).total_seconds()
        is_expired = remaining_seconds <= 0
        days_remaining = 0 if is_expired else max(0, math.ceil(remaining_seconds / 86400))
        warning = not is_expired and days_remaining <= 2
        warning_message = (
            f"Your subscription expires in {days_remaining} day{'s' if days_remaining != 1 else ''}. Renew soon to avoid interruption."
            if warning else ""
        )
        return {
            "expiry_iso": expiry,
            "expiry_dt": expiry_dt,
            "is_expired": is_expired,
            "days_remaining": days_remaining,
            "warning": warning,
            "warning_message": warning_message,
        }
    except Exception:
        return {
            "expiry_iso": expiry,
            "expiry_dt": None,
            "is_expired": False,
            "days_remaining": None,
            "warning": False,
            "warning_message": "",
        }

def get_admin_plan_context(user: Dict[str, Any]) -> Dict[str, Any]:
    # Default fallback
    company = None
    if user.get("company_id"):
        company = companies_collection.find_one({"_id": ObjectId(user["company_id"])})
        
    subscription_plan = company.get("subscription_plan") if company else user.get("subscription_plan")
    subscription_expiry = company.get("subscription_expiry") if company else user.get("subscription_expiry")
    
    definition = get_plan_definition(subscription_plan)
    if user.get("role") == "admin":
        if "credits" in user:
            credits = user.get("credits", 0)
        else:
            admin_doc = admins_collection.find_one({"_id": ObjectId(user.get("admin_id"))})
            credits = admin_doc.get("credits", 0) if admin_doc else 0
    else:
        credits = company.get("credits", 0) if company else user.get("credits", 0)
        
    is_expired = credits <= 0
    warning = not is_expired and credits <= 5
    warning_message = "Your plan credits are running low (5 or fewer left). Please renew your subscription to avoid interruption." if warning else ""

    return {
        "plan_key": definition["plan_key"],
        "plan_label": definition["label"],
        "capabilities": definition["capabilities"],
        "features": definition["features"],
        "summary": definition["summary"],
        "credits": credits,
        "is_expired": is_expired,
        "warning": warning,
        "warning_message": warning_message,
        "days_remaining": None,
    }

def require_admin_capability(admin_id: str, capability: str, detail: str):
    try:
        user = admins_collection.find_one({"_id": ObjectId(admin_id)})
    except Exception as e:
        print(f"[Error] require_admin_capability (admin_id={admin_id}): {e}")
        user = None

    if not user:
        print(f"[Error] Admin user not found in DB for ID: {admin_id}")
        raise HTTPException(status_code=404, detail="Admin account not found")
    if user.get("role") == "master":
        return user

    plan_context = get_admin_plan_context(user)
    if not plan_context["capabilities"].get(capability, False):
        raise HTTPException(status_code=403, detail=detail)
    return user

def run_code_against_tests(code: str, task: Dict[str, Any], language: str) -> Dict[str, Any]:
    function_name = task.get("function_name") or "solve"
    tests = task.get("test_cases", [])
    language = (language or "python").lower()

    if not code.strip():
        return _runner_error("No code was provided.")

    if language == "python":
        return _run_python_locally(code, tests, function_name)
    elif language in ["javascript", "typescript"]:
        return _run_js_locally(code, tests, function_name, language)
    else:
        return _run_compiled_mock(code, tests, function_name, language)

def _run_js_locally(code: str, tests: list, function_name: str, language: str) -> Dict[str, Any]:
    import tempfile
    import os
    import subprocess
    import json

    tests_json = json.dumps(json.dumps(tests))
    
    # Strip type annotations if it's typescript to run natively in node
    # Since we can't reliably strip all TS natively without tsc, we'll try to run it as JS.
    # Note: For simple types, it might fail in node, but this is the best effort local run.
    harness = f"""
const tests = JSON.parse({tests_json});
const results = [];

// Fallback to strip basic TS types if it's selected as TS but run in Node
{code.replace(": string[]", "").replace(": number", "").replace(": any", "")}

for (const test of tests) {{
    try {{
        let inputArgs = test.input;
        if (!Array.isArray(inputArgs)) {{
            inputArgs = [inputArgs];
        }}
        
        let output;
        if (typeof {function_name} === 'function') {{
            output = {function_name}(...inputArgs);
        }} else {{
            throw new Error("Function '" + "{function_name}" + "' not found.");
        }}
        
        const expected = test.expected !== undefined ? test.expected : test.output;
        const passed = JSON.stringify(output) === JSON.stringify(expected);
        
        results.push({{
            id: test.id,
            visible: test.visible !== false,
            passed: passed,
            input: inputArgs,
            output: output,
            expected: expected
        }});
    }} catch (e) {{
        results.push({{
            id: test.id,
            visible: test.visible !== false,
            passed: false,
            input: test.input,
            output: "Runtime Error: " + e.message,
            expected: test.expected !== undefined ? test.expected : test.output
        }});
    }}
}}
console.log("\\n" + JSON.stringify(results));
"""

    import requests
    
    payload = {
        "language": "javascript",
        "version": "18.15.0",
        "files": [
            {
                "name": "main.js",
                "content": harness
            }
        ]
    }
    
    try:
        response = requests.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=10)
        if response.status_code != 200:
            print(f"[Piston JS] HTTP {response.status_code} — falling back to LLM evaluation")
            return _evaluate_code_with_llm(code, tests, function_name, "javascript")
        data = response.json()
        
        if "run" in data:
            run_result = data["run"]
            stdout = run_result.get("stdout", "").strip()
            stderr = run_result.get("stderr", "").strip()
            
            if stdout:
                try:
                    lines = stdout.split("\\n")
                    for line in reversed(lines):
                        if line.startswith("[") and line.endswith("]"):
                            results_obj = json.loads(line)
                            class MockResult:
                                pass
                            mock_res = MockResult()
                            mock_res.stdout = line
                            mock_res.stderr = stderr
                            return _collect_runner_output(mock_res, tests)
                except Exception:
                    pass
            
            if stderr:
                return _runner_error(f"Execution Error: {stderr}", tests)
            else:
                return _runner_error(f"Execution failed or produced invalid output.\\nOutput: {stdout}", tests)
        else:
            return _runner_error(f"Invalid response from Piston API: {data}", tests)
            
    except requests.exceptions.Timeout:
        print("[Piston JS] Timeout — falling back to LLM evaluation")
        return _evaluate_code_with_llm(code, tests, function_name, "javascript")
    except Exception as e:
        print(f"[Piston JS] Error: {e} — falling back to LLM evaluation")
        return _evaluate_code_with_llm(code, tests, function_name, "javascript")

def _evaluate_code_with_llm(code: str, tests: list, function_name: str, language: str) -> Dict[str, Any]:
    system_prompt = (
        f"You are a strict {language} compiler and code evaluator. You must evaluate the user's code against the provided test cases. "
        "Return ONLY a valid JSON object matching this schema. NO markdown, NO explanations.\n"
        "{\n"
        "  \"status\": \"ok\" | \"error\",\n"
        "  \"runtime_error\": \"<string if compilation or runtime fails, else null>\",\n"
        "  \"output\": \"<any stdout printed by code, else empty string>\",\n"
        "  \"all_passed\": <boolean>,\n"
        "  \"visible_results\": [\n"
        "    { \"id\": \"...\", \"visible\": true, \"passed\": <bool>, \"input\": [...], \"output\": \"<actual output>\", \"expected\": \"<expected output>\" }\n"
        "  ],\n"
        "  \"hidden_summary\": { \"passed\": <int>, \"total\": <int> }\n"
        "}"
    )
    
    user_prompt = f"Language: {language}\nFunction: {function_name}\n\nCode:\n```\n{code}\n```\n\nTest Cases:\n{json.dumps(tests, indent=2)}\n\nEvaluate the code against these tests and return the JSON results."
    
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]
    
    # This automatically uses OpenRouter, falling back to HuggingFace if quota is exceeded
    try:
        raw_response = chat_completion(messages, model="openai/gpt-4o-mini", temperature=0.1)
        
        result = extract_json(raw_response)
        if not result:
            return _runner_error("Execution failed (AI evaluator returned invalid output).", tests)
            
        return result
    except Exception as e:
        print(f"[LLM Evaluator] Error: {e}")
        return _runner_error("Execution failed: AI evaluation quota exceeded or unavailable.", tests)

def _generate_jdoodle_script(code: str, tests: list, function_name: str, language: str) -> str:
    script = ""
    if language == "go":
        calls = "\n".join([f'    fmt.Printf("%%v\\n", {function_name}({", ".join([_go_literal(arg) for arg in (t["input"] if isinstance(t["input"], list) else [t["input"]])])}))' for t in tests])
        script = f"""package main
import "fmt"
{code}
func main() {{
{calls}
}}"""
    elif language == "rust":
        calls = "\n".join([f'    println!("{{:?}}", {function_name}({", ".join([_rust_literal(arg) for arg in (t["input"] if isinstance(t["input"], list) else [t["input"]])])}));' for t in tests])
        script = f"""{code}
fn main() {{
{calls}
}}"""
    elif language == "cpp" or language == "cpp17":
        calls = "\n".join([f'    print_val({function_name}({", ".join([_cpp_literal(arg) for arg in (t["input"] if isinstance(t["input"], list) else [t["input"]])])}));' for t in tests])
        script = f"""#include <iostream>
#include <vector>
#include <string>

template<typename T> void print_val(T t) {{ std::cout << t << "\\n"; }}
template<typename T> void print_val(std::vector<T> v) {{
    std::cout << "[";
    for(size_t i=0; i<v.size(); ++i) {{ std::cout << v[i] << (i==v.size()-1 ? "" : ","); }}
    std::cout << "]\\n";
}}

{code}

int main() {{
{calls}
    return 0;
}}"""
    elif language == "java":
        calls = "\n".join([f'        printVal({function_name}({", ".join([_java_literal(arg) for arg in (t["input"] if isinstance(t["input"], list) else [t["input"]])])}));' for t in tests])
        # Find if the user provided a class name, otherwise default to Main
        class_name = "Solution" if "class Solution" in code else "Main"
        # We wrap their code if they didn't write a class, else we just inject the main method
        if "class " not in code:
            code = f"public class Main {{\n{code}\n}}"
            class_name = "Main"
            
        # Instead of parsing their class, for JDoodle we can just make a Main class that calls their Solution class.
        # If they wrote `class Solution`, we just append a Main class.
        script = f"""import java.util.*;

{code}

public class JdoodleMain {{
    static void printVal(Object o) {{
        if (o instanceof int[]) System.out.println(Arrays.toString((int[])o));
        else if (o instanceof String[]) System.out.println(Arrays.toString((String[])o));
        else if (o instanceof Object[]) System.out.println(Arrays.toString((Object[])o));
        else System.out.println(o);
    }}
    public static void main(String[] args) {{
{calls.replace(function_name, class_name + "." + function_name if "class" in code and "static" in code else "new " + class_name + "()." + function_name)}
    }}
}}"""
    return script

def _run_jdoodle_api(code: str, tests: list, function_name: str, language: str) -> Dict[str, Any]:
    client_id = os.getenv("JDOODLE_CLIENT_ID")
    client_secret = os.getenv("JDOODLE_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise ValueError("JDoodle credentials missing from .env")
        
    jdoodle_langs = {"go": "go", "cpp": "cpp17", "rust": "rust", "java": "java"}
    jdoodle_lang = jdoodle_langs.get(language, language)
    
    script = _generate_jdoodle_script(code, tests, function_name, language)
    
    payload = {
        "clientId": client_id,
        "clientSecret": client_secret,
        "script": script,
        "language": jdoodle_lang,
        "versionIndex": "0"
    }
    
    import requests
    try:
        res = requests.post("https://api.jdoodle.com/v1/execute", json=payload, timeout=15)
        if res.status_code != 200:
            raise ValueError(f"JDoodle API returned {res.status_code}: {res.text}")
    except requests.exceptions.Timeout:
        return _runner_error("JDoodle compilation timed out (15s limit). Please try again.", tests)
    except Exception as e:
        return _runner_error(f"JDoodle execution failed: {e}", tests)
        
    data = res.json()
    if data.get("error"):
        return _runner_error(data["error"], tests)
        
    output_lines = data.get("output", "").strip().split("\n")
    
    # Map the output lines back to tests
    visible_results = []
    hidden_passed = 0
    hidden_total = 0
    
    for i, test in enumerate(tests):
        out_val = output_lines[i] if i < len(output_lines) else ""
        expected_val = str(test.get("expected"))
        # Basic normalization for comparison
        passed = out_val.strip().replace(" ", "") == expected_val.strip().replace(" ", "")
        
        if test.get("visible", True):
            visible_results.append({
                "id": test.get("id"),
                "visible": True,
                "passed": passed,
                "input": test.get("input"),
                "output": out_val,
                "expected": test.get("expected")
            })
        else:
            if passed: hidden_passed += 1
            hidden_total += 1
            
    return {
        "status": "ok",
        "runtime_error": None,
        "output": data.get("output", ""),
        "visible_results": visible_results,
        "hidden_summary": {"passed": hidden_passed, "total": hidden_total},
        "all_passed": (hidden_passed == hidden_total) and all(r["passed"] for r in visible_results)
    }

def _run_compiled_mock(code: str, tests: list, function_name: str, language: str) -> Dict[str, Any]:
    # 1. Base validation
    if not code.strip() or (len(code.strip()) < 50 and "Write your solution here" in code):
        return _runner_error(f"Cannot compile {language}: Code is empty or missing implementation.", tests)
        
    # 2. Try JDoodle True Compiler (Priority 1)
    try:
        return _run_jdoodle_api(code, tests, function_name, language)
    except Exception as e:
        print(f"JDoodle API failed (Quota exceeded or missing keys): {e}")
        
    # 3. Try LLM Execution (Priority 2 Fallback)
    try:
        llm_result = _evaluate_code_with_llm(code, tests, function_name, language)
        if "visible_results" in llm_result and "hidden_summary" in llm_result:
            return llm_result
    except Exception as e:
        print(f"LLM Code Evaluation failed (Quota exceeded or error): {e}")
        
    # 4. Final Fallback: Return Error instead of auto-passing
    return _runner_error(
        f"API Quota Exhausted: Could not compile {language} code. Please try again later.",
        tests
    )

def _runner_error(message: str, tests: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    if tests is None:
        return {
            "status": "error",
            "runtime_error": message,
            "visible_results": [],
            "hidden_summary": {"passed": 0, "total": 14},
        }
    
    visible_tests = [t for t in tests if t.get("visible", True)]
    hidden_tests = [t for t in tests if not t.get("visible", True)]
    
    visible_results = [
        {
            "id": t.get("id"),
            "visible": True,
            "passed": False,
            "input": t.get("input"),
            "output": f"Error: {message}",
            "expected": t.get("expected") if t.get("expected") is not None else t.get("output")
        }
        for t in visible_tests
    ]
    
    return {
        "status": "error",
        "runtime_error": message,
        "visible_results": visible_results,
        "hidden_summary": {"passed": 0, "total": len(hidden_tests)},
    }


def _collect_runner_output(result: subprocess.CompletedProcess, tests: List[Dict[str, Any]] = None) -> Dict[str, Any]:
    if result.returncode != 0:
        return _runner_error((result.stderr or result.stdout or "Unknown execution error").strip(), tests)

    stdout = result.stdout.strip()
    try:
        # User code might print to stdout. The test harness prints JSON on the last line.
        lines = stdout.split('\n')
        json_str = lines[-1] if lines else "[]"
        all_results = json.loads(json_str)
        console_out = '\n'.join(lines[:-1]).strip()
    except Exception:
        # If no valid JSON, it's either a script or a crash
        return _runner_error(stdout or result.stderr or "The runner returned an invalid response.", tests)

    visible_results = [row for row in all_results if row.get("visible")]
    hidden_results = [row for row in all_results if not row.get("visible")]
    
    # If the user script just prints, and there are no results, return their output
    if not all_results and console_out:
        return {
            "status": "ok",
            "runtime_error": None,
            "output": console_out,
            "visible_results": [],
            "hidden_summary": {"passed": 0, "total": 0},
            "all_passed": False,
        }

    return {
        "status": "ok",
        "runtime_error": None,
        "output": console_out,
        "visible_results": visible_results,
        "hidden_summary": {
            "passed": sum(1 for row in hidden_results if row.get("passed")),
            "total": len(hidden_results),
        },
        "all_passed": all(row.get("passed") for row in all_results) if all_results else False,
    }


def _supports_simple_multilang(value: Any) -> bool:
    if isinstance(value, (int, float, str, bool)) or value is None:
        return True
    if isinstance(value, list):
        return all(_supports_simple_multilang(item) for item in value)
    return False


def _js_literal(value: Any) -> str:
    return json.dumps(value)


def _java_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        if not value:
            return "new int[]{}"
        if all(isinstance(item, int) for item in value):
            return "new int[]{" + ", ".join(str(item) for item in value) + "}"
        if all(isinstance(item, str) for item in value):
            return "new String[]{" + ", ".join(json.dumps(item) for item in value) + "}"
    raise ValueError("This test input is not supported for Java execution.")


def _go_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int) or isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        if not value:
            return "[]int{}"
        if all(isinstance(item, int) for item in value):
            return "[]int{" + ", ".join(str(item) for item in value) + "}"
        if all(isinstance(item, str) for item in value):
            return "[]string{" + ", ".join(json.dumps(item) for item in value) + "}"
    raise ValueError("Unsupported Go argument type.")


def _cpp_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int) or isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, list):
        if not value:
            return "std::vector<int>{}"
        if all(isinstance(item, int) for item in value):
            return "std::vector<int>{" + ", ".join(str(item) for item in value) + "}"
        if all(isinstance(item, str) for item in value):
            return "std::vector<std::string>{" + ", ".join(json.dumps(item) for item in value) + "}"
    raise ValueError("Unsupported C++ argument type.")


def _rust_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int) or isinstance(value, float):
        return str(value)
    if isinstance(value, str):
        # Rust json.dumps outputs standard quotes which usually works for String::from("...")
        return f"String::from({json.dumps(value)})"
    if isinstance(value, list):
        if not value:
            return "vec![]"
        if all(isinstance(item, int) for item in value):
            return "vec![" + ", ".join(str(item) for item in value) + "]"
        if all(isinstance(item, str) for item in value):
            return "vec![" + ", ".join(f"String::from({json.dumps(item)})" for item in value) + "]"
    raise ValueError("Unsupported Rust argument type.")


def _java_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "double"
    if isinstance(value, str):
        return "String"
    if isinstance(value, list):
        if not value:
            return "int[]"
        if all(isinstance(item, int) for item in value):
            return "int[]"
        if all(isinstance(item, str) for item in value):
            return "String[]"
    raise ValueError("Unsupported Java argument type.")


def _c_literal(value: Any) -> str:
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return json.dumps(value)
    raise ValueError("This test input is not supported for C execution.")


def _c_type(value: Any) -> str:
    if isinstance(value, bool):
        return "int"
    if isinstance(value, int):
        return "int"
    if isinstance(value, str):
        return "const char*"
    raise ValueError("Unsupported C argument type.")



def _run_python_locally(code: str, tests: list, function_name: str) -> Dict[str, Any]:
    # Test cases - loaded via json.loads to correctly convert JSON true/false/null to Python True/False/None
    tests_json = json.dumps(json.dumps(tests))
    harness = f"""
import json
import sys

# User code
{code}

# Test cases
tests = json.loads({tests_json})
results = []
function_name = "{function_name}"

if function_name in dir():
    func = eval(function_name)
elif function_name in locals():
    func = locals()[function_name]
else:
    func = None

if func is not None:
    for test in tests:
        try:
            input_args = test.get("input", [])
            if not isinstance(input_args, list):
                input_args = [input_args]
            
            output = func(*input_args)
            expected = test.get("expected") if test.get("expected") is not None else test.get("output")
            
            passed = (output == expected)
            
            results.append({{
                "id": test.get("id"),
                "visible": test.get("visible", True),
                "passed": passed,
                "input": input_args,
                "output": output,
                "expected": expected
            }})
        except Exception as e:
            results.append({{
                "id": test.get("id"),
                "visible": test.get("visible", True),
                "passed": False,
                "input": test.get("input"),
                "output": f"Runtime Error: {{type(e).__name__}}: {{str(e)}}",
                "expected": test.get("expected") if test.get("expected") is not None else test.get("output")
            }})
    print("\\n" + json.dumps(results))
else:
    sys.stderr.write(f"Execution Error: Function '{function_name}' not found. Please ensure your function is named exactly '{function_name}'.\\n")
    sys.exit(1)
"""

    import requests
    
    payload = {
        "language": "python",
        "version": "3.10.0",
        "files": [
            {
                "name": "main.py",
                "content": harness
            }
        ]
    }
    
    try:
        response = requests.post("https://emkc.org/api/v2/piston/execute", json=payload, timeout=10)
        if response.status_code != 200:
            print(f"[Piston Python] HTTP {response.status_code} — falling back to LLM evaluation")
            return _evaluate_code_with_llm(code, tests, function_name, "python")
        data = response.json()
        
        if "run" in data:
            run_result = data["run"]
            # Try to parse the stdout as our JSON results array
            stdout = run_result.get("stdout", "").strip()
            stderr = run_result.get("stderr", "").strip()
            
            if stdout:
                try:
                    # Look for the last JSON array in the output (since candidate might have print statements)
                    lines = stdout.split("\\n")
                    for line in reversed(lines):
                        if line.startswith("[") and line.endswith("]"):
                            results_obj = json.loads(line)
                            # Mock the result object to pass to _collect_runner_output
                            class MockResult:
                                pass
                            mock_res = MockResult()
                            mock_res.stdout = line
                            mock_res.stderr = stderr
                            return _collect_runner_output(mock_res, tests)
                except Exception:
                    pass
            
            # If we couldn't parse the JSON or it crashed
            if stderr:
                return _runner_error(f"Execution Error: {stderr}", tests)
            else:
                return _runner_error(f"Execution failed or produced invalid output.\\nOutput: {stdout}", tests)
        else:
            return _runner_error(f"Invalid response from Piston API: {data}", tests)
            
    except requests.exceptions.Timeout:
        print("[Piston Python] Timeout — falling back to LLM evaluation")
        return _evaluate_code_with_llm(code, tests, function_name, "python")
    except Exception as e:
        print(f"[Piston Python] Error: {e} — falling back to LLM evaluation")
        return _evaluate_code_with_llm(code, tests, function_name, "python")
def extract_skills(text: str) -> List[str]:
    """Extract skills from resume text."""
    skills = []
    common_skills = [
        # Programming Languages
        "Python", "JavaScript", "Java", "C++", "C#", "PHP", "Ruby", "Swift", "Kotlin", "Go", "Rust", "TypeScript",
        # Web Technologies
        "HTML", "CSS", "React", "Angular", "Vue.js", "Node.js", "Django", "Flask", "Spring", "ASP.NET", "Express.js",
        # Databases
        "SQL", "MySQL", "PostgreSQL", "MongoDB", "Oracle", "SQLite", "Redis", "Cassandra",
        # Cloud & DevOps
        "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "Terraform", "Ansible", "Jenkins", "Git", "CI/CD",
        # Data Science
        "Data Science", "Machine Learning", "Deep Learning", "Data Analysis", "Pandas", "NumPy", "TensorFlow", "PyTorch", "scikit-learn",
        # Other
        "REST API", "GraphQL", "Microservices", "Agile", "Scrum", "TDD", "OOP", "Functional Programming"
    ]
    
    for skill in common_skills:
        if skill.lower() in text.lower():
            skills.append(skill)
    
    return list(dict.fromkeys(skills))[:8]  # Remove duplicates and limit to 8 skills

def analyze_resume_or_jd(text: str):
    """Parse resume/JD via typed_ai_layer (type-safe, cached, token-optimized)."""
    # Priority 1: Typed AI layer (type-safe validated output)
    if _TYPED_LAYER_AVAILABLE:
        try:
            return _typed_parse_resume(text)
        except Exception as e:
            print(f"[typed_ai_layer] parse_resume failed, falling back: {e}")

    # Priority 2: Direct fallback with 2000-char truncation
    profile_text = (text or "").strip()[:2000]
    SYSTEM = (
        "You are a resume parser. Extract key information and return ONLY valid JSON. "
        "No markdown, no explanation."
    )
    USER = f"""Extract from this resume/JD:
{{
  "skills": [],
  "projects": [],
  "tools_and_technologies": [],
  "experience_level": "",
  "domains": [],
  "important_keywords": []
}}
Content: {profile_text}"""

    try:
        raw_text = chat_completion(
            messages=[
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": USER}
            ],
            model="openai/gpt-4o-mini",
            temperature=0.0,
        )
        res = extract_json(raw_text)
        if res: return res
        return {"skills": [], "projects": [], "tools_and_technologies": [], "experience_level": "Unknown", "domains": [], "important_keywords": []}
    except Exception as e:
        print(f"Resume Analysis Error: {e}")
        return {"skills": [], "projects": [], "tools_and_technologies": [], "experience_level": "Unknown", "domains": [], "important_keywords": []}
    
def extract_experiences(text: str) -> List[Dict]:
    """Extract work experiences from resume text."""
    experiences = []
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if any(role in line_lower for role in ['developer', 'engineer', 'analyst', 'specialist', 'manager', 'designer', 'researcher', 'scientist']):
            exp = {
                "title": line,
                "company": lines[i+1] if i+1 < len(lines) and len(lines[i+1]) < 50 else "a company"
            }
            # Avoid adding duplicate experiences
            if not any(e['title'] == exp['title'] and e['company'] == exp['company'] for e in experiences):
                experiences.append(exp)
                if len(experiences) >= 3:  # Limit to 3 experiences
                    break
    
    return experiences

def extract_projects(text: str) -> List[Dict]:
    """Extract projects from resume text."""
    projects = []
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    
    for i, line in enumerate(lines):
        line_lower = line.lower()
        if ("project" in line_lower or "portfolio" in line_lower) and len(line.split()) < 5:
            project = {
                "name": line.replace("Project:", "").replace("project:", "").strip(),
                "description": lines[i+1] if i+1 < len(lines) and 10 < len(lines[i+1]) < 200 else ""
            }
            # Avoid adding duplicate projects
            if not any(p['name'] == project['name'] for p in projects):
                projects.append(project)
    
    return projects

def generate_resume_questions(resume_text: str, language: str = "English", industry: str = "General") -> List[Dict[str, str]]:
    """Generate interview questions based on candidate's resume using AI."""
    print("Generating questions from resume...")
    
    if language != "English":
        return []
        
    experiences = extract_experiences(resume_text)
    projects = extract_projects(resume_text)
    skills = extract_skills(resume_text)
    
    questions = []
    
    intro_q_text = "Can you please introduce yourself and tell us about your professional background?"
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_INTRO_QUESTIONS
            intro_q_text = OFFLINE_LANGUAGE_INTRO_QUESTIONS.get(language, intro_q_text)
        except ImportError:
            pass
        
    # 1. Self Introduction (First 2 questions)
    intro_questions = [
        {
            "id": 1,
            "question": intro_q_text,
            "difficulty": "Easy",
            "type": "Self-Introduction",
            "category": "Basic"
        },
        {
            "id": 2,
            "question": "What motivated you to pursue a career in this field, and what are your key strengths?",
            "difficulty": "Easy",
            "type": "Self-Introduction",
            "category": "Background"
        }
    ]
    questions.extend(intro_questions)
    
    # 2. Basic Skills Questions (Questions 3-4)
    if skills:
        # Take top 2 skills for basic questions
        for skill in skills[:2]:
            questions.append({
                "id": len(questions) + 1,
                "question": f"How would you rate your proficiency in {skill} and what projects have you used it in?",
                "difficulty": "Easy",
                "type": "Technical",
                "category": f"{skill} Basics"
            })
    
    # 3. Experience Questions (Middle Questions)
    for i, exp in enumerate(experiences[:2]):  # Limit to 2 experiences
        company = exp.get('company', 'your previous role')
        title = exp.get('title', '')
        industry_context = f" in the {industry} sector" if industry and industry.lower() not in ["general", ""] else ""
        
        questions.append({
            "id": len(questions) + 1,
            "question": f"At {company} as a {title}{industry_context}, what were your key responsibilities and achievements?",
            "difficulty": "Medium",
            "type": "Experience",
            "category": "Work History"
        })
        
        # Add a follow-up question about challenges
        if i == 0:  # Only add one challenge question
            questions.append({
                "id": len(questions) + 1,
                "question": f"What was the most challenging project you worked on at {company} and how did you handle it?",
                "difficulty": "Medium",
                "type": "Problem-Solving",
                "category": "Work Challenges"
            })
    
    # 4. Advanced Skills Questions (After Experience)
    if len(skills) > 2:  # If we have more than 2 skills
        for skill in skills[2:4]:  # Take next 2 skills for advanced questions
            questions.append({
                "id": len(questions) + 1,
                "question": f"Can you explain a complex problem you solved using {skill}? What was your approach and what did you learn?",
                "difficulty": "Hard",
                "type": "Technical",
                "category": f"Advanced {skill}"
            })
    
    # 5. Project Questions (If we need more questions)
    if len(questions) < 8 and projects:  # If we don't have enough questions yet
        for proj in projects[:1]:  # Limit to 1 project
            title = proj.get('title', 'a project')
            
            questions.append({
                "id": len(questions) + 1,
                "question": f"Tell me about your project '{title}'. What was your role, and what technologies did you use?",
                "difficulty": "Medium",
                "type": "Project",
                "category": "Projects"
            })
    
    # 6. Future and Closing Questions (Last 2 questions)
    future_questions = [
        {
            "question": "What technical skills are you currently working to improve, and how are you going about it?",
            "difficulty": "Easy",
            "type": "Career Development",
            "category": "Future Goals"
        },
        {
            "question": "Where do you see your career in the next 3-5 years, and how does this position align with your goals?",
            "difficulty": "Medium",
            "type": "Career Goals",
            "category": "Future Planning"
        }
    ]
    
    # Add future questions with proper IDs
    for q in future_questions:
        questions.append({
            "id": len(questions) + 1,
            **q
        })
    
    # Ensure we have at least 10 questions
    generic_questions = [
        "Can you describe a time when you had to work under pressure to meet a tight deadline?",
        "How do you approach learning new technologies or programming languages?",
        "Can you explain a technical concept to someone who doesn't have a technical background?",
        "What development tools and IDEs are you most comfortable using, and why?",
        "How do you handle code reviews and feedback on your work?",
        "What version control systems have you worked with, and what's your experience with them?",
        "Can you describe your experience with testing and quality assurance processes?",
        "How do you stay updated with the latest industry trends and technologies?",
        "What's your approach to debugging complex issues in your code?",
        "Can you describe a time when you had to collaborate with a difficult team member and how you handled it?"
    ]
    
    # Add generic questions if we don't have enough
    while len(questions) < 10 and generic_questions:
        questions.append({
            "id": len(questions) + 1,
            "question": generic_questions.pop(0),
            "difficulty": "Medium",
            "type": "General",
            "category": "Professional Development"
        })
    
    # Ensure we don't have too many questions
    if len(questions) > 25:
        questions = questions[:25]
    
    print(f"Generated {len(questions)} questions for the interview")
    return questions

def extract_text_from_file(file_content: bytes, filename: str) -> str:
    """Extract text content from different file types."""
    file_extension = filename.lower().split('.')[-1]

    try:
        if file_extension == 'pdf':
            # Extract text from PDF
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_content))
            text = ""
            for page in pdf_reader.pages:
                text += page.extract_text() + "\n"
            return text.strip()

        elif file_extension in ['docx', 'doc']:
            # Extract text from DOCX
            doc = Document(io.BytesIO(file_content))
            text = ""
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
            return text.strip()

        elif file_extension == 'txt':
            # Handle plain text files
            return file_content.decode('utf-8')

        else:
            # Try to decode as UTF-8 text for other formats
            return file_content.decode('utf-8')

    except Exception as e:
        print(f"Error extracting text from {filename}: {e}")
        # Fallback: try to decode as UTF-8
        try:
            return file_content.decode('utf-8', errors='ignore')
        except:
            raise HTTPException(status_code=400, detail=f"Unable to process file {filename}. Supported formats: PDF, DOCX, TXT")

def generate_jd_questions(jd_text: str, ai_instructions: str = "", interview_type: str = "Technical", industry: str = "General", language: str = "English") -> List[Dict[str, str]]:
    """Generate interview questions based on Job Description using AI."""
    print(f"Generating questions from Job Description for {interview_type} interview...")
    
    intro_q_text = "Can you please introduce yourself and tell us why you are interested in this specific role?"
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_INTRO_QUESTIONS
            intro_q_text = OFFLINE_LANGUAGE_INTRO_QUESTIONS.get(language, intro_q_text)
        except ImportError:
            pass

    questions = [
        {
            "id": 1,
            "question": intro_q_text,
            "difficulty": "Easy",
            "type": "Self-Introduction",
            "category": "Basic"
        }
    ]

    instruction_block = f"\n    Additional Admin Instructions to Follow:\n    {ai_instructions}\n" if ai_instructions else ""
    
    # Inject language requirement if not English
    if language != "English":
        instruction_block += f"\n    CRITICAL REQUIREMENT: You MUST generate all questions and interact STRICTLY in the {language} language. Do NOT use English unless {language} is English.\n"

    if interview_type == "Non-Technical":
        prompt = f"""
        You are an expert Management Consultant and HR recruiter constructing a rigorous Case Study and Scenario-based interview for the '{industry}' industry.{instruction_block}
        
        Job Description:
        {jd_text[:4000]}
        
        Task:
        1. IDENTIFY the specific Job Role/Title from the Job Description and tailor all questions specifically for that level and position.
        2. EXTRACT top 5 critical business, management, or functional keywords from the Job Description (e.g., 'Team Management', 'Stakeholder Communication', 'Agile Delivery', 'Conflict Resolution').
        3. GENERATE 6 Case Study and Scenario questions testing these exact keywords.
           - CRITICAL INDUSTRY ALIGNMENT: EVERY SINGLE QUESTION MUST be explicitly framed within the '{industry}' industry. Use industry-specific terminology, business models, and common scenarios. Do not use generic software or business examples.
           - Instead of generic "Tell me about a time" questions, present a sharp, focused business scenario or case study situated within the '{industry}' industry and ask how they would solve it.
           - The extracted keywords MUST be the central theme of the case studies.
           - Do NOT ask technical coding or syntax questions. Focus on problem-solving, leadership, team management, and strategic thinking.
           - Act as a real human interviewer. NEVER say "According to the job description". Just ask the question directly.
           - CRITICAL LENGTH CONSTRAINT: Keep every question strictly under 2-3 sentences. Make it conversational, punchy, and direct. Do NOT generate multi-part essay questions.
        """
    else:
        prompt = f"""
        You are an expert technical recruiter constructing a rigorous interview for the '{industry}' industry.{instruction_block}
        
        Job Description:
        {jd_text[:4000]}
        
        Task:
        1. IDENTIFY the specific Job Role/Title from the Job Description and tailor all questions specifically for that level and position.
        2. EXTRACT top 5 critical technical keywords/skills from the Job Description (e.g., 'React', 'AWS', 'System Design').
        3. GENERATE 6 specific interview questions testing these exact skills.
           - CRITICAL INDUSTRY ALIGNMENT: EVERY SINGLE QUESTION MUST be explicitly framed within the '{industry}' industry. Use industry-specific terminology, technical challenges, and use-cases. Do not use generic examples.
           - The questions and scenarios should be highly relevant to the '{industry}' industry.
           - The extracted keywords MUST be the focus of the questions.
           - Do NOT ask generic "soft skill" questions unless the JD emphasizes them.
           - Vary difficulty: Start with basic checks, move to scenario-based/hard problems.
           - Act as a real human interviewer. NEVER say "According to the job description" or "You mentioned in your resume". Just ask the question directly.
           - CRITICAL LENGTH CONSTRAINT: Keep every question strictly under 2-3 sentences. Make it conversational, punchy, and direct. Do NOT generate multi-part essay questions.
        """

    prompt += f"""
    
    Return STRICT JSON format:
    {{
        "extracted_keywords": ["Skill1", "Skill2", ...],
        "questions": [
            {{
                "question": "Specific question testing a skill...",
                "difficulty": "Medium",
                "type": "Technical",
                "category": "Skill Name"
            }}
        ]
    }}
    """

    try:
        raw = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-4o-mini"
        )
        data = extract_json(raw) or {}
        
        # Log extracted keywords for debugging/logging
        print(f" Extracted JD Keywords: {data.get('extracted_keywords', [])}")
        
        # Add generated questions to the list
        for q in data.get("questions", []):
            questions.append({
                "id": len(questions) + 1,
                "question": q["question"],
                "difficulty": q.get("difficulty", "Medium"),
                "type": q.get("type", "General"),
                "category": q.get("category", "JD Requirement")
            })

            
    except Exception as e:
        print(f"Error generating JD questions: {e}")
        if language != "English":
            return []
        
        # --- OFFLINE/FALLBACK MODE ---
        # If API fails, try to extract keywords manually using Regex/List
        common_keywords = [
            "Python", "Java", "React", "Angular", "Vue", "AWS", "Azure", "Docker", "Kubernetes", "SQL", 
            "NoSQL", "Git", "CI/CD", "Machine Learning", "AI", "Data Science", "Spring", "Node.js", 
            "JavaScript", "TypeScript", "C++", "C#", ".NET", "Go", "Rust", "Swift", "Kotlin", "Flutter"
        ]
        
        found_keywords = []
        for kw in common_keywords:
            if kw.lower() in jd_text.lower():
                found_keywords.append(kw)
        
        print(f" Offline Mode: Found keywords {found_keywords}")
        
        if found_keywords:
            for i, kw in enumerate(found_keywords[:5]): # Top 5 matched
                questions.append({
                    "id": len(questions) + 1,
                    "question": f"Can you describe your experience with {kw} and a challenging problem you solved using it?",
                    "difficulty": "Medium",
                    "type": "Technical",
                    "category": f"{kw} Skill"
                })
        else:
             # Genuine Fallback if absolutely no keywords matched
             questions.extend([
                {
                    "id": 2,
                    "question": "What specifically attracted you to the technical requirements of this position?",
                    "difficulty": "Medium",
                    "type": "General",
                    "category": "Fit"
                },
                {
                    "id": 3,
                    "question": "Can you walk us through your most significant technical achievement relevant to this role?",
                    "difficulty": "Hard",
                    "type": "Project",
                    "category": "Experience"
                }
            ])

    return questions

def generate_mock_questions(text: str, source: str, num_questions: int = 6, resume_text: str = None, jd_text: str = None, hr_screening: dict = None, custom_questions: str = "", ai_instructions: str = "", interview_type: str = "Technical", industry: str = "General", language: str = "English") -> List[Dict[str, str]]:
    """
    Generate structured interview questions.
    Structure: Self-Intro → Technical Middle → HR Screening (if enabled) → Closing
    
    When API is available: calls AI to generate dynamic middle questions.
    When API is down: uses smart keyword-extraction from resume/JD to build questions offline.
    
    hr_screening: dict with keys ask_work_mode, ask_preferred_location, ask_current_location, ask_bond.
    When any is True, additional HR screening questions are appended before closing.
    """
    num_questions = max(4, num_questions)
    
    intro_q_text = "Can you please introduce yourself and tell us why you are interested in this specific role?"
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_INTRO_QUESTIONS
            intro_q_text = OFFLINE_LANGUAGE_INTRO_QUESTIONS.get(language, intro_q_text)
        except ImportError:
            pass

    opening = [
        {
            "id": 1,
            "question": intro_q_text,
            "difficulty": "Easy",
            "type": "Self-Introduction",
            "category": "Basic"
        }
    ]
    
    closing = [
        {
            "question": "What do you consider your biggest strengths and weaknesses?",
            "difficulty": "Easy",
            "type": "Self-Assessment",
            "category": "Strengths & Weaknesses"
        },
        {
            "question": "Where do you see yourself in the next 5 years, and how does this role fit into that vision?",
            "difficulty": "Easy",
            "type": "Career Goals",
            "category": "Future Plans"
        }
    ]
    if num_questions >= 10:
        closing.append({
            "question": "Do you have any questions for us about the team, the role, or the company?",
            "difficulty": "Easy",
            "type": "Closing",
            "category": "Candidate Questions"
        })
    
    # Translate closing questions if language is not English
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_CLOSING_QUESTIONS
            lang_closing = OFFLINE_LANGUAGE_CLOSING_QUESTIONS.get(language, [])
            if lang_closing:
                for i, q in enumerate(closing):
                    if i < len(lang_closing):
                        q["question"] = lang_closing[i]
        except ImportError:
            pass
    
    middle_count = num_questions - len(opening) - len(closing)
    middle_count = max(1, middle_count)
    
    middle_questions = []
    
    try:
        # 1. Inject custom questions FIRST if provided
        if custom_questions:
            custom_q_list = [q.strip() for q in custom_questions.split('\n') if q.strip()]
            for cq in custom_q_list:
                middle_questions.append({
                    "question": cq,
                    "difficulty": "Medium",
                    "type": "Technical",
                    "category": "Custom Question"
                })
            print(f" Loaded {len(custom_q_list)} custom questions")
            
        # 2. Add AI questions (Instructions and JD/Resume)
        if "resume" in source.lower():
            ai_questions = generate_resume_questions(text, language=language, industry=industry)
        else:
            ai_questions = generate_jd_questions(text, ai_instructions=ai_instructions, interview_type=interview_type, industry=industry, language=language)
        
        ai_added = 0
        for q in ai_questions:
            qtype = q.get("type", "").lower()
            qcat = q.get("category", "").lower()
            if any(x in qtype for x in ["self-intro", "introduction", "career", "future"]):
                continue
            if any(x in qcat for x in ["basic", "background", "future goals", "closing"]):
                continue
            middle_questions.append(q)
            ai_added += 1
            
        print(f" AI generated {ai_added} technical/instruction questions")
        
    except Exception as e:
        print(f" AI question generation failed: {e}")
        print(" Falling back to smart offline question generator...")
    
    # ── OFFLINE FALLBACK: Extract skills/projects and build timeline-based questions ──
    # Only run offline fallback if we don't have enough questions
    if len(middle_questions) < middle_count:
        offline_questions = _generate_offline_questions(resume_text or "", jd_text or text, num_questions, interview_type, industry=industry, language=language)
        middle_questions.extend(offline_questions)
        print(f" Offline generator added {len(offline_questions)} questions")
    
    # Only truncate if we exceeded the requested middle count by offline fallback,
    # but don't truncate Custom + AI questions if they naturally exceed it.
    if len(middle_questions) > middle_count and not custom_questions:
        middle_questions = middle_questions[:middle_count]

    
    all_questions = []
    idx = 1
    
    for q in opening:
        q["id"] = idx
        all_questions.append(q)
        idx += 1
    for q in middle_questions:
        q["id"] = idx
        all_questions.append(q)
        idx += 1
    
    # ── HR SCREENING QUESTIONS (inserted before closing) ──
    if hr_screening:
        screening_questions = _generate_hr_screening_questions(hr_screening, jd_text or text)
        for q in screening_questions:
            q["id"] = idx
            all_questions.append(q)
            idx += 1
    
    for q in closing:
        q["id"] = idx
        all_questions.append(q)
        idx += 1
    
    return all_questions


def _generate_offline_questions(resume_text: str, jd_text: str, total_count: int, interview_type: str = "Technical", industry: str = "General", language: str = "English") -> List[Dict[str, str]]:
    """
    Intelligent Interview Coach Offline Generator
    Adapts based on Total Time (total_count) and Presence of Resume (Single vs Bulk).
    Ensures a continuous flow of questions spanning Self-Intro, Skills, Projects, JD, and HR.
    """
    import re
    questions = []
    
    has_resume = bool(resume_text and len(resume_text.strip()) > 50)
    text_to_parse = (resume_text + " " + jd_text).lower()
    jd_lower = jd_text.lower()
    
    # ── 1. Extract Technical Skills ──
    tech_keywords = [
        "Python", "Java", "JavaScript", "TypeScript", "React", "Angular", "Vue", "Node.js",
        "Express", "Django", "Flask", "FastAPI", "Spring Boot", "Spring", ".NET", "C#", "C++",
        "Go", "Rust", "Swift", "Kotlin", "Flutter", "React Native", "PHP", "Ruby", "Rails",
        "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Jenkins", "CI/CD", "Terraform",
        "SQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "DynamoDB",
        "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "NLP", "Computer Vision",
        "REST API", "GraphQL", "Microservices", "System Design", "Data Structures",
        "Algorithms", "HTML", "CSS", "Tailwind", "Bootstrap", "Git", "Linux",
        "Agile", "Scrum", "JIRA", "Figma"
    ]
    
    resume_skills = [kw for kw in tech_keywords if kw.lower() in resume_text.lower()] if has_resume else []
    jd_skills = [kw for kw in tech_keywords if kw.lower() in jd_lower]
    
    generic_skills = ["programming fundamentals", "system architecture", "version control", "database design", "debugging"]
    hr_questions = [
        "Tell me about a time you faced a difficult challenge at work and how you overcame it.",
        "How do you handle tight deadlines or stressful situations?",
        "Describe a situation where you had a conflict with a team member. How was it resolved?",
        "What motivates you the most in your professional career?",
        "How do you prioritize your tasks when you have multiple urgent requests?",
        "Tell me about a time you had to learn a new concept quickly.",
        "What is your proudest professional achievement?",
        "Describe a time you failed or made a mistake. What did you learn from it?",
        "How do you ensure you stay updated with industry trends?",
        "Can you share an example of how you successfully worked in a remote or distributed team?"
    ]
    
    # We apportion the questions to ensure an endless stream depending on total_count
    target = max(10, total_count + 15) # Generate significantly more to ensure an endless flow
    
    # ── If language is NOT English, use fully translated offline questions ──
    if language != "English":
        try:
            from offline_language_fallback import OFFLINE_LANGUAGE_TECHNICAL_QUESTIONS, OFFLINE_LANGUAGE_TEMPLATE_QUESTIONS, OFFLINE_LANGUAGE_CASE_STUDY_TEMPLATES
            lang_tech = OFFLINE_LANGUAGE_TECHNICAL_QUESTIONS.get(language, [])
            lang_tmpl = OFFLINE_LANGUAGE_TEMPLATE_QUESTIONS.get(language, [])
            lang_case = OFFLINE_LANGUAGE_CASE_STUDY_TEMPLATES.get(language, [])
        except ImportError:
            lang_tech = []
            lang_tmpl = []
            lang_case = []
            
        if interview_type == "Non-Technical":
            non_tech_keywords = ["Team Management", "Leadership", "Stakeholder Management", "Conflict Resolution", "Project Management", "Agile", "Budgeting", "Client Relations"]
            jd_non_tech = [kw for kw in non_tech_keywords if kw.lower() in jd_lower]
            if not jd_non_tech: jd_non_tech = ["Team Collaboration", "Problem Solving", "Time Management"]
            
            if lang_case:
                for i in range(max(10, target)):
                    skill = jd_non_tech[i % len(jd_non_tech)]
                    template = lang_case[i % len(lang_case)]
                    try:
                        q_text = template.format(skill=skill, industry=industry)
                    except (KeyError, IndexError):
                        q_text = template.replace("{skill}", skill).replace("{industry}", industry)
                    questions.append({
                        "question": q_text,
                        "difficulty": ["Medium", "Hard"][i % 2],
                        "type": "Behavioral",
                        "category": f"{skill} Case Study"
                    })
            return questions[:target]
        else:
            # Get skills from resume/JD to personalize template questions
            skills_to_ask = resume_skills if resume_skills else jd_skills
            if not skills_to_ask:
                skills_to_ask = generic_skills
            
            # Add all the pre-translated technical questions
            for i, q_text in enumerate(lang_tech):
                questions.append({
                    "question": q_text,
                    "difficulty": ["Easy", "Medium", "Hard"][i % 3],
                    "type": "Technical",
                    "category": "Technical Expertise"
                })
            
            # Add skill-specific questions using translated templates
            if lang_tmpl:
                for i in range(max(10, target - len(questions))):
                    skill = skills_to_ask[i % len(skills_to_ask)]
                    template = lang_tmpl[i % len(lang_tmpl)]
                    try:
                        q_text = template.format(skill=skill, industry=industry)
                    except (KeyError, IndexError):
                        q_text = template.replace("{skill}", skill).replace("{industry}", industry)
                    questions.append({
                        "question": q_text,
                        "difficulty": ["Medium", "Hard"][i % 2],
                        "type": "Technical",
                        "category": f"{skill} Expertise"
                    })
            
            return questions[:target]
    
    # --- PHASE 1: SELF-INTRO / BACKGROUND ---
    if has_resume:
        questions.append({"question": "Can you briefly walk me through your professional journey and what led you to apply for this role?", "difficulty": "Easy", "type": "Background", "category": "Experience"})
        questions.append({"question": "What specifically caught your eye about this firm and the job description we posted?", "difficulty": "Easy", "type": "Motivation", "category": "Motivation"})
    else:
        questions.append({"question": "Could you provide a high-level overview of your background and your core expertise?", "difficulty": "Easy", "type": "Background", "category": "Experience"})
        questions.append({"question": "What is the single most important skill you bring to the table that aligns with this role?", "difficulty": "Easy", "type": "Motivation", "category": "Skills"})
        
    # --- PHASE 2: SKILLS OR SCENARIOS ---
    if interview_type == "Non-Technical":
        non_tech_keywords = [
            "Team Management", "Leadership", "Stakeholder Management", "Conflict Resolution", 
            "Project Management", "Agile", "Budgeting", "Client Relations", 
            "Strategic Planning", "Process Improvement", "Risk Management"
        ]
        jd_non_tech = [kw for kw in non_tech_keywords if kw.lower() in jd_lower]
        if not jd_non_tech: jd_non_tech = ["Team Collaboration", "Problem Solving", "Time Management"]
        
        case_study_templates = [
            f"Imagine you are leading a critical project involving {{skill}} within the {industry} industry, but two key stakeholders strongly disagree on the direction. Walk me through your step-by-step strategy to resolve this.",
            f"You are tasked with improving our current approach to {{skill}} for a leading {industry} company with a limited budget and a tight deadline. How do you plan your delivery?",
            f"Your team in the {industry} sector is underperforming in the area of {{skill}}. How would you diagnose the root cause and implement a turnaround plan?",
            f"A major client in the {industry} space is unhappy with recent deliverables related to {{skill}}. How do you handle the immediate conversation and what is your remediation plan?",
            f"Describe a hypothetical scenario in the {industry} industry where {{skill}} processes break down entirely. What are your immediate actions to stabilize operations and communicate with leadership?"
        ]
        
        skills_count = max(3, int(target * 0.25))
        for i in range(skills_count):
            skill = jd_non_tech[i % len(jd_non_tech)]
            template = case_study_templates[i % len(case_study_templates)]
            q = template.format(skill=skill)
            questions.append({"question": q, "difficulty": "Medium", "type": "Behavioral", "category": f"{skill} Case Study"})
    else:
        skills_to_ask = resume_skills if resume_skills else jd_skills
        if not skills_to_ask: skills_to_ask = generic_skills
        skills_count = max(3, int(target * 0.25))
        
        # Pull industry specific questions if available
        industry_q = []
        
        if not industry_q:
            industry_q = INDUSTRY_TECHNICAL_QUESTIONS.get(industry, [])
        
        for i in range(skills_count):
            skill = skills_to_ask[i % len(skills_to_ask)]
            
            if i < len(industry_q):
                q = industry_q[i].replace("Information Technology", skill)
                q = industry_q[i] # Just use the industry specific question
                category = f"{industry} Expertise"
            else:
                if i % 3 == 0:
                    q = f"In the context of the {industry} industry, how would you rate your proficiency with {skill}? Can you describe a significant project where you utilized it to solve a complex problem?"
                elif i % 3 == 1:
                    q = f"What are some common pitfalls or challenges you encounter when working with {skill} on {industry} projects, and how do you mitigate them?"
                else:
                    q = f"If you were to mentor a junior developer entering the {industry} sector on {skill}, what core principles would you emphasize?"
                category = f"{skill} Deep-Dive"
                
            questions.append({"question": q, "difficulty": "Medium", "type": "Technical", "category": category})
    # --- PHASE 3: PROJECTS ---
    projects_count = max(2, int(target * 0.15))
    if has_resume:
        project_patterns = [r'(?:project|built|developed|created|designed)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s\-]{3,30})']
        found_projects = []
        for pattern in project_patterns:
            found_projects.extend([m.strip() for m in re.findall(pattern, resume_text, re.IGNORECASE) if len(m.strip()) > 3])
        found_projects = list(set(found_projects))
        
        for i in range(projects_count):
            proj = found_projects[i % len(found_projects)] if found_projects else "your most complex technical project"
            if i % 2 == 0:
                q = f"Let's discuss {proj}. Walk me through the architecture and the major technical decisions you made."
            else:
                q = f"Regarding {proj}, what was the most difficult bug or bottleneck you encountered and how did you resolve it?"
            questions.append({"question": q, "difficulty": "Hard", "type": "Project", "category": "Architecture"})
    else:
        for i in range(projects_count):
            if i % 2 == 0:
                q = "Tell me about the most impactful project you have delivered in your career. What was your specific contribution?"
            else:
                q = "Walk me through a project where the requirements were vague or constantly changing. How did you manage it?"
            questions.append({"question": q, "difficulty": "Medium", "type": "Project", "category": "Execution"})

    # --- PHASE 4: JOB DESCRIPTION COMPLIANCE ---
    jd_count = max(3, int(target * 0.25))
    jd_focus = jd_skills if jd_skills else ["the core tools required for this position", "our tech stack"]
    for i in range(jd_count):
        focus = jd_focus[i % len(jd_focus)]
        if i % 2 == 0:
            q = f"This role heavily involves {focus}. Could you share an experience that demonstrates your readiness for this?"
        else:
            q = f"In the context of the job description requiring strong {focus} expertise, how do you handle scalable architectures?"
        questions.append({"question": q, "difficulty": "Hard", "type": "Role Fit", "category": "JD Requirement"})

    # --- PHASE 5: HR / BEHAVIORAL ---
    hr_count = max(5, int(target * 0.25))
    for i in range(hr_count):
        q = hr_questions[i % len(hr_questions)]
        questions.append({"question": q, "difficulty": "Medium", "type": "Behavioral", "category": "HR/Culture"})

    return questions


def _generate_hr_screening_questions(hr_screening: dict, jd_text: str) -> List[Dict[str, str]]:
    """
    Generate HR screening questions based on admin preferences.
    Tries to extract relevant info from the JD first for contextual questions.
    Falls back to well-crafted static questions if AI is unavailable.
    """
    questions = []
    if not hr_screening:
        return questions

    work_mode = hr_screening.get("work_mode", "")
    location = hr_screening.get("location", "")
    ask_bond = hr_screening.get("ask_bond", False)

    if not any([work_mode, location, ask_bond]):
        return questions

    # Try AI-powered contextual question generation
    try:
        topics = []
        if work_mode:
            topics.append(f"confirmation of {work_mode} work mode preference")
        if location == "Preferred":
            topics.append("preferred work location and willingness to relocate")
        elif location == "Current":
            topics.append("current location and commute feasibility")
        if ask_bond:
            topics.append("current bond/service agreement status, notice period, and availability to join")

        topic_list = "\\n".join(f"- {t}" for t in topics)
        prompt = (
            f"You are an HR interviewer. Based on the following job description, "
            f"generate exactly {len(topics)} screening question(s) for these topics:\\n"
            f"{topic_list}\\n\\n"
            f"Job Description:\\n{jd_text[:3000]}\\n\\n"
            "Rules:\\n"
            "- Extract any relevant details from the JD (like location, work mode) and reference them.\\n"
            "- Each question should be conversational and professional.\\n"
            '- Return ONLY a valid JSON array of objects with keys: "question", "difficulty", "type", "category".\\n'
            '- difficulty should be "Easy" for all.\\n'
            '- type should be "HR Screening".\\n'
            '- category: "Work Mode", "Preferred Location", "Current Location", or "Bond/Notice Period".\\n'
        )

        raw = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-4o-mini"
        )
        ai_questions = extract_json(raw)
        if ai_questions and isinstance(ai_questions, list) and len(ai_questions) > 0:
            for q in ai_questions:
                if isinstance(q, dict) and q.get("question"):
                    questions.append({
                        "question": q["question"],
                        "difficulty": q.get("difficulty", "Easy"),
                        "type": "HR Screening",
                        "category": q.get("category", "HR Screening")
                    })
            print(f"AI generated {len(questions)} HR screening questions")
            return questions
    except Exception as e:
        print(f"AI HR screening question generation failed: {e}")

    # Fallback: Static contextual questions
    if work_mode:
        questions.append({
            "question": f"This role requires a {work_mode} work arrangement. Are you comfortable with this setup?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Work Mode"
        })
    if location == "Preferred":
        questions.append({
            "question": "What is your preferred work location? If the role is based in a different city, would you be open to relocating?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Preferred Location"
        })
    elif location == "Current":
        questions.append({
            "question": "Where are you currently located? How would you manage the commute or transition to our office?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Current Location"
        })
    if ask_bond:
        questions.append({
            "question": "Are you currently under any service agreement or bond with your current employer? What is your notice period, and how soon would you be available to join if selected?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Bond/Notice Period"
        })

    print(f"Added {len(questions)} static HR screening questions")
    return questions

    ask_work_mode = hr_screening.get("ask_work_mode", False)
    ask_preferred_location = hr_screening.get("ask_preferred_location", False)
    ask_current_location = hr_screening.get("ask_current_location", False)
    ask_bond = hr_screening.get("ask_bond", False)

    if not any([ask_work_mode, ask_preferred_location, ask_current_location, ask_bond]):
        return questions

    # Try AI-powered contextual question generation
    try:
        topics = []
        if ask_work_mode:
            topics.append("work mode preference (on-site, remote, or hybrid)")
        if ask_preferred_location:
            topics.append("preferred work location and willingness to relocate")
        if ask_current_location:
            topics.append("current location and commute feasibility")
        if ask_bond:
            topics.append("current bond/service agreement status, notice period, and availability to join")

        topic_list = "\n".join(f"- {t}" for t in topics)
        prompt = (
            f"You are an HR interviewer. Based on the following job description, "
            f"generate exactly {len(topics)} screening question(s) for these topics:\n"
            f"{topic_list}\n\n"
            f"Job Description:\n{jd_text[:3000]}\n\n"
            "Rules:\n"
            "- Extract any relevant details from the JD (like location, work mode) and reference them.\n"
            "- Each question should be conversational and professional.\n"
            '- Return ONLY a valid JSON array of objects with keys: "question", "difficulty", "type", "category".\n'
            '- difficulty should be "Easy" for all.\n'
            '- type should be "HR Screening".\n'
            '- category: "Work Mode", "Preferred Location", "Current Location", or "Bond/Notice Period".\n'
        )

        raw = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-4o-mini"
        )
        ai_questions = extract_json(raw)
        if ai_questions and isinstance(ai_questions, list) and len(ai_questions) > 0:
            for q in ai_questions:
                if isinstance(q, dict) and q.get("question"):
                    questions.append({
                        "question": q["question"],
                        "difficulty": q.get("difficulty", "Easy"),
                        "type": "HR Screening",
                        "category": q.get("category", "HR Screening")
                    })
            print(f"AI generated {len(questions)} HR screening questions")
            return questions
    except Exception as e:
        print(f"AI HR screening question generation failed: {e}")

    # Fallback: Static contextual questions
    if ask_work_mode:
        questions.append({
            "question": "This role may require a specific work arrangement. What is your preferred work mode - on-site, remote, or hybrid? Are you flexible if the company requires a particular arrangement?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Work Mode"
        })
    if ask_preferred_location:
        questions.append({
            "question": "What is your preferred work location? If the role is based in a different city, would you be open to relocating? Do you have any location constraints we should be aware of?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Preferred Location"
        })
    if ask_current_location:
        questions.append({
            "question": "Where are you currently located? If the office is in a different city, how would you manage the commute or transition? Are you already based near the job location?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Current Location"
        })
    if ask_bond:
        questions.append({
            "question": "Are you currently under any service agreement or bond with your current employer? What is your notice period, and how soon would you be available to join if selected?",
            "difficulty": "Easy",
            "type": "HR Screening",
            "category": "Bond/Notice Period"
        })

    print(f"Added {len(questions)} static HR screening questions")
    return questions



def score_answer(question: str, answer: str):
    prompt = f"""
You are an interview evaluator.

Question:
{question}

Candidate Answer:
{answer}

Evaluate on:
1. Relevance
2. Clarity
3. Technical depth (if applicable)
4. Confidence

Return STRICT JSON only:
{{
  "score": 0-10,
  "feedback": "short constructive feedback",
  "keywords": ["keyword1", "keyword2"]
}}
"""

    raw = chat_completion(
        messages=[{"role": "user", "content": prompt}],
        model="openai/gpt-4o-mini"
    )
    return extract_json(raw) or {"score": 0, "feedback": "Error", "keywords": []}

# --- ADAPTIVE INTERVIEW LOGIC ---

def generate_followup_question(answer_text: str, resume_context: str, jd_text: str, current_q_id: int, followup_streak: int, language: str = "English") -> Dict:
    if followup_streak < 3:
        prompt = f"""
        You are an intelligent technical interviewer.
        
        CRITICAL LANGUAGE REQUIREMENT:
        You MUST generate the follow-up question and output STRICTLY in the {language} language. Do NOT use English unless {language} is English.

        Context:
        - Candidate Resume Summary: {resume_context[:1000]}...
        - Candidate's Last Answer: "{answer_text}"
        
        Task:
        Generate ONE follow-up interview question (JSON) to dig deeper into what the candidate just said.
        - Act as a human interviewer making a natural conversation. 
        - NEVER say "You mentioned in your answer" or "Based on your answer". Ask directly!
        - If they mentioned a Project, ask about architectural decisions or challenges in THAT project.
        - If they mentioned a specific Tech Stack (e.g., React, Python), ask a conceptual question about it.
        - If their answer was vague, ask them to clarify specific examples.
        - CRITICAL LENGTH CONSTRAINT: Keep your follow-up strictly under 2 sentences. It must sound like a natural, brief spoken conversation.
        
        Return STRICT JSON:
        {{
            "question": "The actual question string...",
            "difficulty": "Medium",
            "type": "Follow-up",
            "category": "Deep Dive"
        }}
        """
    else:
        prompt = f"""
        You are an intelligent technical interviewer.
        
        Context:
        - Job Description: {jd_text[:1000]}...
        
        Task:
        Change the topic and ask ONE new interview question (JSON) based strictly on the Job Description.
        - Act as a human interviewer making a natural conversation.
        - Frame the question based on the skills, requirements, or responsibilities mentioned in the JD.
        
        Return STRICT JSON:
        {{
            "question": "The actual question string...",
            "difficulty": "Medium",
            "type": "JD-Based",
            "category": "Role Requirement"
        }}
        """
    
    try:
        raw = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-4o-mini"
        )
        q_data = extract_json(raw)
        if not q_data:
            raise Exception("Invalid JSON returned")
        
        # Add ID
        q_data["id"] = current_q_id + 1
        return q_data
    except Exception as e:
        print(f"Error generating follow-up: {e}")
        # --- OFFLINE FALLBACK ---
        import random
        fallback_followups = {
            "English": ["Could you elaborate a bit more on that point?", "Can you walk me through a specific example from your experience?", "What challenges did you face there, and how did you overcome them?", "Could you explain the reasoning behind your approach?"],
            "Hindi": ["क्या आप इस पर थोड़ा और विस्तार से बता सकते हैं?", "क्या आप अपने पिछले अनुभव से एक विशिष्ट उदाहरण दे सकते हैं?", "वहां आपको किन चुनौतियों का सामना करना पड़ा, और आपने उन्हें कैसे पार किया?", "क्या आप अपने दृष्टिकोण के पीछे का कारण बता सकते हैं?"],
            "Telugu": ["దయచేసి దాని గురించి కొంచెం వివరంగా చెప్పగలరా?", "మీ గత అనుభవం నుండి ఒక నిర్దిష్ట ఉదాహరణ ఇవ్వగలరా?", "అక్కడ మీరు ఎలాంటి సవాళ్లను ఎదుర్కొన్నారు, మరియు వాటిని ఎలా అధిగమించారు?", "మీ విధానం వెనుక ఉన్న కారణాన్ని వివరించగలరా?"],
            "Tamil": ["அதைப்பற்றி கொஞ்சம் விரிவாக கூற முடியுமா?", "உங்கள் முந்தைய அனுபவத்திலிருந்து ஒரு குறிப்பிட்ட உதாரணத்தை கொடுக்க முடியுமா?", "அங்கு நீங்கள் என்ன சவால்களை எதிர்கொண்டீர்கள், அவற்றை எவ்வாறு சமாளித்தீர்கள்?", "உங்கள் அணுகுமுறைக்கு பின்னணியில் உள்ள காரணத்தை விளக்க முடியுமா?"],
            "Malayalam": ["അതിനെക്കുറിച്ച് കുറച്ചുകൂടി വിശദീകരിക്കാമോ?", "നിങ്ങളുടെ മുൻകാല അനുഭവത്തിൽ നിന്ന് ഒരു പ്രത്യേക ഉദാഹരണം നൽകാമോ?", "അവിടെ നിങ്ങൾ എന്തൊക്കെ വെല്ലുവിളികൾ നേരിട്ടു, അവ എങ്ങനെ മറികടന്നു?", "നിങ്ങളുടെ സമീപനത്തിന് പിന്നിലെ കാരണം വിശദീകരിക്കാമോ?"],
            "Kannada": ["ದಯವಿಟ್ಟು ಅದರ ಬಗ್ಗೆ ಸ್ವಲ್ಪ ಹೆಚ್ಚು ವಿವರಿಸಬಹುದೇ?", "ನಿಮ್ಮ ಹಿಂದಿನ ಅನುಭವದಿಂದ ನಿರ್ದಿಷ್ಟ ಉದಾಹರಣೆಯನ್ನು ನೀಡಬಲ್ಲಿರಾ?", "ಅಲ್ಲಿ ನೀವು ಯಾವ ಸವಾಲುಗಳನ್ನು ಎದುರಿಸಿದ್ದೀರಿ ಮತ್ತು ಅವುಗಳನ್ನು ಹೇಗೆ ನಿವಾರಿಸಿದ್ದೀರಿ?", "ನಿಮ್ಮ ವಿಧಾನದ ಹಿಂದಿನ ಕಾರಣವನ್ನು ವಿವರಿಸಬಹುದೇ?"]
        }
        
        fallback_list = fallback_followups.get(language, fallback_followups["English"])
        
        return {
            "id": current_q_id + 1,
            "question": random.choice(fallback_list),
            "difficulty": "Medium",
            "type": "Follow-up",
            "category": "Deep Dive"
        }

def hash_password(password: str) -> str:
    # bcrypt limits passwords to 72 bytes. Truncate if necessary.
    pwd_bytes = password.encode('utf-8')[:72]
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if len(hashed_password) == 64 and all(c in '0123456789abcdefABCDEF' for c in hashed_password):
        return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password
    try:
        pwd_bytes = plain_password.encode('utf-8')[:72]
        hash_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hash_bytes)
    except Exception:
        return False

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(days=7)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=ALGORITHM)

def get_current_admin_details(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[ALGORITHM])
        admin_id: str = payload.get("sub")
        company_id: str = payload.get("company_id")
        role: str = payload.get("role", "tenant")
        if admin_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return {"admin_id": admin_id, "company_id": company_id, "role": role}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def get_current_admin(details: dict = Depends(get_current_admin_details)):
    return details["admin_id"]

def require_role(*allowed_roles):
    """Create a dependency that enforces role-based access. Master role always has access."""
    def checker(current_admin: dict = Depends(get_current_admin_details)):
        role = current_admin.get("role", "")
        if role not in allowed_roles and role != "master":
            raise HTTPException(status_code=403, detail=f"Access denied. Required role: {', '.join(allowed_roles)}")
        return current_admin
    return checker


def parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        else:
            parsed = parsed.astimezone(timezone.utc)
        return parsed
    except Exception:
        return None

def format_datetime_for_display(value: str) -> str:
    """Parse ISO datetime and return a formatted IST string."""
    dt = parse_iso_datetime(value)
    if not dt:
        return value
    # Convert to IST (UTC+5:30)
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    ist_dt = dt.astimezone(ist_offset)
    return ist_dt.strftime("%d %b %Y, %I:%M %p")

def should_attach_job_description_pdf(job_description: str) -> bool:
    text = (job_description or "").strip()
    return len(text) > JOB_DESCRIPTION_PDF_THRESHOLD or text.count("\n") > 12

def generate_job_description_pdf_base64(job_description: str) -> str:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left_margin = 50
    top = height - 60
    line_height = 16

    pdf.setTitle("Job Description")
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(left_margin, top, "Job Description")
    y = top - 28

    pdf.setFont("Helvetica", 10)
    for paragraph in (job_description or "").splitlines() or [""]:
        wrapped_lines = simpleSplit(paragraph or " ", "Helvetica", 10, width - (left_margin * 2))
        for line in wrapped_lines:
            if y < 60:
                pdf.showPage()
                pdf.setFont("Helvetica", 10)
                y = height - 60
            pdf.drawString(left_margin, y, line)
            y -= line_height
        y -= 6

    pdf.save()
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")

def build_job_description_block(job_description: str) -> str:
    text = (job_description or "").strip()
    if not text:
        return '<p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6;">Job description will be shared separately.</p>'

    if should_attach_job_description_pdf(text):
        summary = html.escape(textwrap.shorten(" ".join(text.split()), width=260, placeholder="..."))
        return (
            '<p style="margin: 0 0 12px 0; color: #4b5563; font-size: 14px; line-height: 1.6; text-align: left;">'
            f'{summary}</p>'
            '<p style="margin: 0; color: #6b7280; font-size: 13px; line-height: 1.5; font-style: italic; text-align: left;">'
            'The full job description is attached as a PDF so the email stays clean and easy to read.'
            '</p>'
        )

    formatted_jd = "<br/>".join(html.escape(line) for line in text.splitlines()) or html.escape(text)
    return f'<p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.6; text-align: left;">{formatted_jd}</p>'

def build_schedule_block(scheduled_start: str = "", scheduled_end: str = "") -> str:
    if not scheduled_start:
        return ""

    schedule_block = f'<p style="color: #4b5563; line-height: 1.6; font-size: 14px; margin: 0 0 4px 0;">'
    schedule_block += f'<strong style="color: #111827;">Scheduled Date & Time:</strong> {format_datetime_for_display(scheduled_start)}'
    
    end_dt = parse_iso_datetime(scheduled_end) if scheduled_end else None
    if end_dt:
        ist_offset = timezone(timedelta(hours=5, minutes=30))
        ist_end_dt = end_dt.astimezone(ist_offset)
        schedule_block += f' - {ist_end_dt.strftime("%I:%M %p")} (IST)'
    else:
        schedule_block += ' (IST)'
    schedule_block += '</p>'
    
    schedule_block += (
        '<div style="background-color: #f9fafb; border-left: 3px solid #6b7280; padding: 12px 16px; margin-top: 12px;">'
        '<p style="margin: 0; color: #374151; font-size: 13px; line-height: 1.5;">'
        '<b>Note:</b> The assessment link will only be active during the scheduled time window. Access will be granted 15 minutes prior to the start time.'
        '</p>'
        '</div>'
    )
    return schedule_block

def build_default_interview_email_html(candidate_name: str, duration: int, job_description: str, full_link: str, scheduled_start: str = "", scheduled_end: str = "") -> str:
    schedule_block = build_schedule_block(scheduled_start, scheduled_end)
    job_description_block = build_job_description_block(job_description)

    expiry_message = ""
    if not scheduled_start:
        expiry_message = (
            '<div style="background-color: #f9fafb; border-left: 3px solid #6b7280; padding: 12px 16px; margin-top: 12px;">'
            '<p style="margin: 0; color: #374151; font-size: 13px; line-height: 1.5;">'
            '<b>Note:</b> This assessment link is valid for exactly <b>24 hours</b> from the time of this email.'
            '</p>'
            '</div>'
        )

    return f"""
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 40px 20px; background-color: #f3f4f6; min-height: 100%;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e5e7eb; border-top: 4px solid #1e3a8a; overflow: hidden;">
            
            <!-- Header -->
            <div style="padding: 40px 40px 20px 40px;">
                <h1 style="color: #111827; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.01em;">Interview Invitation</h1>
            </div>

            <!-- Body -->
            <div style="padding: 0 40px 40px 40px; background-color: #ffffff;">
                <p style="font-size: 15px; color: #374151; text-align: left; margin: 0 0 20px 0; line-height: 1.6;">Dear {html.escape(candidate_name)},</p>
                <p style="color: #4b5563; line-height: 1.6; font-size: 14px; margin: 0 0 24px 0; text-align: left;">We are pleased to invite you to an online assessment as part of our interview process. This assessment is designed to give you an opportunity to showcase your skills and experience.</p>
                
                <!-- Role Details Box -->
                <div style="border: 1px solid #e5e7eb; padding: 20px; margin: 0 0 24px 0; background-color: #ffffff;">
                    <h3 style="margin: 0 0 12px 0; font-size: 13px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Role Information</h3>
                    {job_description_block}
                </div>
                
                <!-- Details grid -->
                <div style="margin: 0 0 32px 0;">
                    <p style="color: #4b5563; line-height: 1.6; font-size: 14px; margin: 0 0 8px 0;">
                        <strong style="color: #111827;">Assessment Duration:</strong> {duration} minutes
                    </p>
                    {schedule_block}
                    {expiry_message}
                </div>
                
                <!-- CTA Button -->
                <div style="text-align: center; margin: 40px 0;">
                    <a href="{full_link}" style="background-color: #4f46e5; background-image: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 50px; font-weight: 700; font-size: 16px; display: inline-block; box-shadow: 0 4px 15px rgba(79, 70, 229, 0.3); text-transform: uppercase; letter-spacing: 0.02em;">
                        Start Interview
                    </a>
                </div>
                
                <!-- Guidelines -->
                <div style="background-color: #fff1f2; border-radius: 12px; padding: 24px; margin: 30px 0 0 0; border: 1px solid #fecaca; border-left: 5px solid #e11d48;">
                    <h3 style="margin: 0 0 16px; font-size: 15px; color: #9f1239; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">⚠️ Important Guidelines</h3>
                    <ul style="margin: 0; padding-left: 20px; color: #be123c; font-size: 14px; line-height: 1.6;">
                        <li style="margin-bottom: 8px;"><b>Full-Screen Mode:</b> Must be maintained at all times. Tab switching is recorded as a violation.</li>
                        <li style="margin-bottom: 8px;"><b>Video Proctoring:</b> Your camera remains active for face tracking and integrity checks.</li>
                        <li style="margin-bottom: 8px;"><b>Environment:</b> Join from a quiet, well-lit room. Background noise or voices may affect your evaluation.</li>
                        <li><b>Screen Sharing:</b> You must share your entire screen during the session.</li>
                    </ul>
                </div>

                <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: left;">
                    <p style="margin: 0; color: #b91c1c; font-size: 14px; font-weight: 500;">⚠️ <b>Important:</b> Please join only during the scheduled time window. If no schedule is set, the link remains valid for 24 hours.</p>
                </div>
                
                <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 24px 0;">
                <p style="color: #64748b; font-size: 14px; margin: 0; text-align: left; line-height: 1.6;">Best regards,<br/><b style="color: #4f46e5;">Hire IQ Recruiting</b></p>
            </div>
        </div>
    </body>
    </html>
    """

def compute_invite_send_at(scheduled_start: str = "") -> Optional[datetime]:
    start_dt = parse_iso_datetime(scheduled_start)
    if not start_dt:
        return None
    return start_dt - timedelta(minutes=15)

def queue_or_send_interview_email(session_doc: Dict[str, Any], link_url: str, skip_db_update: bool = False) -> Dict[str, Any]:
    scheduled_start = session_doc.get("scheduled_start", "")
    send_at = compute_invite_send_at(scheduled_start)
    now = datetime.now(timezone.utc)

    if send_at and send_at > now:
        if not skip_db_update:
            interview_sessions_collection.update_one(
                {"_id": session_doc["_id"]},
                {"$set": {
                    "invite_email_status": "pending",
                    "invite_email_send_at": send_at.isoformat(),
                    "invite_email_sent_at": None
                }}
            )
        return {
            "email_sent": False,
            "email_scheduled": True,
            "email_send_at": send_at.isoformat()
        }

    # Celery: Push email sending to background
    from app import tasks  # local import to avoid circular imports
    tasks.send_email_task.delay(
        candidate_email=session_doc.get("candidate_email", ""),
        candidate_name=session_doc.get("candidate_name", ""),
        link_url=link_url,
        duration=session_doc.get("interview_duration", 30),
        job_description=session_doc.get("job_description", ""),
        custom_html=session_doc.get("custom_email_html", ""),
        scheduled_start=session_doc.get("scheduled_start", ""),
        scheduled_end=session_doc.get("scheduled_end", "")
    )
    email_sent = True # Async operation queued successfully

    if not skip_db_update:
        interview_sessions_collection.update_one(
            {"_id": session_doc["_id"]},
            {"$set": {
                "invite_email_status": "sent" if email_sent else "failed",
                "invite_email_send_at": (send_at.isoformat() if send_at else now.isoformat()),
                "invite_email_sent_at": (now.isoformat() if email_sent else None)
            }}
        )
    return {
        "email_sent": email_sent,
        "email_scheduled": False,
        "email_send_at": (send_at.isoformat() if send_at else now.isoformat())
    }

def send_interview_email(candidate_email: str, candidate_name: str, link_url: str, duration: int, job_description: str, custom_html: str = "", scheduled_start: str = "", scheduled_end: str = ""):
    import os
    import requests
    from dotenv import load_dotenv

    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    load_dotenv(env_path, override=True)
    brevo_api_key = os.getenv("BREVO_API_KEY")
    sender_name = "Hire IQ Recruiting"
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "no-reply@mockinterview.com")

    if not brevo_api_key:
        print("Warning: BREVO_API_KEY not found in environment")
        return False

    full_link = link_url if link_url.startswith("http") else f"{os.getenv('FRONTEND_URL', 'https://ai-adaptive-interview.vercel.app')}{link_url}"

    html_content = custom_html.strip() if custom_html and custom_html.strip() else build_default_interview_email_html(
        candidate_name=candidate_name,
        duration=duration,
        job_description=job_description,
        full_link=full_link,
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end
    )

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": candidate_email, "name": candidate_name}],
        "subject": "Interview Invitation by Mock Interview",
        "htmlContent": html_content
    }

    if should_attach_job_description_pdf(job_description):
        payload["attachment"] = [{
            "name": "job_description.pdf",
            "content": generate_job_description_pdf_base64(job_description)
        }]

    try:
        response = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            json=payload,
            headers={
                "accept": "application/json",
                "api-key": brevo_api_key,
                "content-type": "application/json"
            }
        , timeout=10)
        response.raise_for_status()
        print(f"Email successfully sent to {candidate_email}")
        return True
    except Exception as e:
        print(f"Failed to send email to {candidate_email}: {e}")
        return False


def require_master_user(master_id: str) -> Dict[str, Any]:
    try:
        master = admins_collection.find_one({"_id": ObjectId(master_id), "role": "master"})
    except Exception:
        master = None
    if not master:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return master

