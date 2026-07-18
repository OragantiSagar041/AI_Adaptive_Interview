import json
import os
import sys

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from ai_client import chat_completion

prompt = f"""You are a professional ATS (Applicant Tracking System) evaluator. You MUST use the Machine Reading Inference (MRI) workflow:
1. EXTRACT 10 to 15 core factual requirements from the Job Description (output as 'jd_key_requirements').
2. ANALYZE the candidate's Resume and strictly list which of those exact requirements they successfully met (output as 'resume_matched_requirements').
3. CALCULATE the scores STRICTLY based on the ratio of requirements hit vs required using the categories below.
Return ONLY valid JSON.

SCORING RUBRIC (weights must sum to 100%):
- keyword_matching (25%): Exact keyword matches against the identified groups (languages, frameworks, databases, etc.)
- semantic_similarity (20%): Partial matches, conceptual overlap, and synonyms between resume and JD
- experience_alignment (25%): Work experience relevance, years of experience, and industry alignment
- project_relevance (15%): Relevance of past projects, achievements, and portfolio to the JD
- education (10%): Degree, field of study, and academic qualifications alignment
- formatting_ats (5%): Resume structure clarity, ATS-friendly formatting, and parseability

Job Description:
We are looking for a senior backend developer with at least 5 years of Python experience, proficient in FastAPI, Redis, and MongoDB.

Resume:
John Doe. Senior Software Engineer. 6 years of Python experience. Built scalable backends using FastAPI and MongoDB. Uses Redis for caching.

Return this EXACT JSON (all score fields are integers 0-100, weighted_total is the weighted average):
{{
  "jd_key_requirements": ["req1", "req2"],
  "resume_matched_requirements": ["req1"],
  "keyword_matching": {{"score": 0, "note": "brief reason"}},
  "semantic_similarity": {{"score": 0, "note": "brief reason"}},
  "experience_alignment": {{"score": 0, "note": "brief reason"}},
  "project_relevance": {{"score": 0, "note": "brief reason"}},
  "education": {{"score": 0, "note": "brief reason"}},
  "formatting_ats": {{"score": 0, "note": "brief reason"}},
  "weighted_total": 0,
  "matched_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "summary": "2-3 sentence overall assessment and recommendations for improvement"
}}"""

try:
    print("Calling AI client...")
    raw = chat_completion(
        messages=[
            {"role": "system", "content": "You are a precise ATS scoring engine. Return ONLY valid JSON. No markdown. No explanation outside the JSON."},
            {"role": "user", "content": prompt},
        ],
        model="openai/gpt-4o-mini",
        temperature=0.0,
        timeout=30,
        max_tokens=1500,
    )
    print("RAW RESPONSE:")
    print(raw)
    
    import re
    raw_clean = re.sub(r"```(?:json)?", "", raw).strip()
    start = raw_clean.find("{")
    end = raw_clean.rfind("}") + 1
    if start != -1 and end > start:
        data = json.loads(raw_clean[start:end])
        print("JSON PARSED SUCCESSFULLY:")
        print(json.dumps(data, indent=2))
        print("MRI WORKFLOW: SUCCESS")
    else:
        print("COULD NOT FIND JSON IN RESPONSE")
except Exception as e:
    print(f"FAILED: {e}")
