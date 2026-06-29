import asyncio
from app.services import run_code_against_tests

def run_tests():
    python_task = {
        "function_name": "add",
        "test_cases": [
            {"id": 1, "input": [1, 2], "expected": 3},
            {"id": 2, "input": [5, 5], "expected": 10}
        ]
    }
    
    python_code = "def add(a, b):\n    return a + b\n"
    
    js_task = {
        "function_name": "multiply",
        "test_cases": [
            {"id": 1, "input": [2, 3], "expected": 6},
            {"id": 2, "input": [5, 5], "expected": 25}
        ]
    }
    
    js_code = "function multiply(a, b) {\n    return a * b;\n}\n"
    
    java_task = {
        "function_name": "solve",
        "test_cases": [
            {"id": 1, "input": [1], "expected": 1}
        ]
    }
    java_code = "public class Solution { public static int solve(int x) { return x; } }"

    print("--- Testing Python Execution ---")
    py_res = run_code_against_tests(python_code, python_task, "python")
    print(py_res)
    
    print("\n--- Testing JS Execution ---")
    js_res = run_code_against_tests(js_code, js_task, "javascript")
    print(js_res)
    
    print("\n--- Testing Java (Mock) Execution ---")
    java_res = run_code_against_tests(java_code, java_task, "java")
    print(java_res)

if __name__ == "__main__":
    run_tests()
