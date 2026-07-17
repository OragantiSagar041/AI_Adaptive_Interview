import json
from ai_client import chat_completion, extract_json

def analyze_interview_dimensions(transcript, context, language="English"):
    """
    Analyzes the entire interview transcript and generates a 6-dimensional
    performance analysis.
    
    transcript: List of dicts, e.g. [{"Q": "Question", "A": "Answer"}, ...]
    """
    if not transcript:
        return {}

    transcript_text = ""
    for i, t in enumerate(transcript):
        transcript_text += f"Q{i+1}: {t.get('Q', '')}\nA{i+1}: {t.get('A', '')}\n\n"

    prompt = f"""
You are an expert technical recruiter and behavioral psychologist evaluating a candidate's complete interview.

Context (Candidate Resume / Job Description):
{context}

Interview Transcript:
{transcript_text}

CRITICAL LANGUAGE REQUIREMENT:
You MUST provide your AI reasoning STRICTLY in the {language} language. Do NOT use English for reasoning unless {language} is English.

Your task is to analyze the entire interview and score the candidate (0-100) across these 6 dimensions:
1. "Technical Skills": technical depth, accuracy of knowledge, problem-solving.
2. "Behavioral Competencies": past experiences, conflict resolution, leadership, adaptability.
3. "Personality & Traits": confidence, enthusiasm, resilience, attitude.
4. "Communication & Clarity": articulation, conciseness, ability to explain complex topics.
5. "Culture Fit": alignment with modern tech culture, teamwork, growth mindset.
6. "Predicted Job Success": overall readiness for the role based on the context.

Respond ONLY with a valid JSON object in exactly this format. Do not include markdown formatting or extra text outside the JSON.
{{
  "Technical Skills": {{
    "score": 85,
    "reasoning": "Short explanation..."
  }},
  "Behavioral Competencies": {{
    "score": 90,
    "reasoning": "Short explanation..."
  }},
  "Personality & Traits": {{
    "score": 80,
    "reasoning": "Short explanation..."
  }},
  "Communication & Clarity": {{
    "score": 88,
    "reasoning": "Short explanation..."
  }},
  "Culture Fit": {{
    "score": 85,
    "reasoning": "Short explanation..."
  }},
  "Predicted Job Success": {{
    "score": 87,
    "reasoning": "Short explanation..."
  }}
}}
"""
    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": "You are a JSON-only API. You output raw JSON strictly matching the requested format."},
                {"role": "user", "content": prompt}
            ],
            model="openai/gpt-4o-mini",
            temperature=0.3
        )
        
        data_str = extract_json(raw)
        result = json.loads(data_str)
        return result
    except Exception as e:
        print(f"Error in multi-dimensional analysis: {e}")
        # FALLBACK: Offline Mode
        return {
          "Technical Skills": {"score": 0, "reasoning": "Analysis unavailable (Offline Mode)"},
          "Behavioral Competencies": {"score": 0, "reasoning": "Analysis unavailable (Offline Mode)"},
          "Personality & Traits": {"score": 0, "reasoning": "Analysis unavailable (Offline Mode)"},
          "Communication & Clarity": {"score": 0, "reasoning": "Analysis unavailable (Offline Mode)"},
          "Culture Fit": {"score": 0, "reasoning": "Analysis unavailable (Offline Mode)"},
          "Predicted Job Success": {"score": 0, "reasoning": "Analysis unavailable (Offline Mode)"}
        }
