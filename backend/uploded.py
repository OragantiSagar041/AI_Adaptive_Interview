from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import OpenAI
import os
import json
import tempfile
from typing import List, Dict
from pydantic import BaseModel
from analyze_answer import analyze_answer
import shutil
import uuid
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
import PyPDF2
from docx import Document
import io
import subprocess
import tempfile
from openai import OpenAI
import requests
from pydantic import BaseModel
from mongo_db import candidates_collection, interviews_collection, answers_collection, admins_collection, interview_sessions_collection
from datetime import datetime


load_dotenv()

# Configuration
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Health check for keeping Render awake
@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# Mount uploads folder to serve files
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://localhost:3000",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "https://ai-adaptive-interview.vercel.app",
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with database in production)
interviews = {}

def get_client():
    load_dotenv()
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        print("⚠️ Warning: OPENROUTER_API_KEY not found in environment")
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key
    )

def get_or_create_candidate(name: str) -> str:
    row = candidates_collection.find_one({"name": name})

    if row:
        return str(row["_id"])

    result = candidates_collection.insert_one({
        "name": name,
        "created_at": datetime.now().isoformat()
    })
    return str(result.inserted_id)


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
    prompt = f"""
    Analyze the following resume or job description and return STRICT JSON only:
    {{
      "skills": [],
      "projects": [],
      "tools_and_technologies": [],
      "experience_level": "",
      "domains": [],
      "important_keywords": []
    }}
    Content: {text}
    """

    try:
        response = get_client().chat.completions.create(
            model="google/gemini-2.0-flash-001", # OpenRouter model ID
            messages=[{"role": "user", "content": prompt}]
        )
        
        raw_text = response.choices[0].message.content
        # Extract JSON
        json_start = raw_text.find("{")
        json_end = raw_text.rfind("}") + 1
        return json.loads(raw_text[json_start:json_end])
    except Exception as e:
        print(f"OpenRouter Analysis Error: {e}")
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

def generate_resume_questions(resume_text: str) -> List[Dict[str, str]]:
    """Generate personalized interview questions based on resume content."""
    print("Generating personalized resume-specific questions...")
    
    # Extract structured information
    skills = extract_skills(resume_text)
    experiences = extract_experiences(resume_text)
    projects = extract_projects(resume_text)
    
    questions = []
    
    # 1. Self Introduction (First 2 questions)
    intro_questions = [
        {
            "id": 1,
            "question": "Can you please introduce yourself and tell us about your professional background?",
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
        
        questions.append({
            "id": len(questions) + 1,
            "question": f"At {company} as a {title}, what were your key responsibilities and achievements?",
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

def generate_jd_questions(jd_text: str) -> List[Dict[str, str]]:
    """Generate interview questions based on Job Description using AI."""
    print("Generating questions from Job Description...")
    
    questions = [
        {
            "id": 1,
            "question": "Can you please introduce yourself and tell us why you are interested in this specific role?",
            "difficulty": "Easy",
            "type": "Self-Introduction",
            "category": "Basic"
        }
    ]

    prompt = f"""
    You are an expert technical recruiter constructing a rigorous interview.
    
    Job Description:
    {jd_text[:4000]}
    
    Task:
    1. EXTRACT top 5 critical technical keywords/skills from the Job Description (e.g., 'React', 'AWS', 'System Design').
    2. GENERATE 6 specific interview questions testing these exact skills.
       - The extracted keywords MUST be the focus of the questions.
       - Do NOT ask generic "soft skill" questions unless the JD emphasizes them.
       - Vary difficulty: Start with basic checks, move to scenario-based/hard problems.
       - Act as a real human interviewer. NEVER say "According to the job description" or "You mentioned in your resume". Just ask the question directly.
    
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
        response = get_client().chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.choices[0].message.content
        start = raw.find("{")
        end = raw.rfind("}") + 1
        data = json.loads(raw[start:end])
        
        # Log extracted keywords for debugging/logging
        print(f"✅ Extracted JD Keywords: {data.get('extracted_keywords', [])}")
        
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
        
        print(f"⚠️ Offline Mode: Found keywords {found_keywords}")
        
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

def generate_mock_questions(text: str, source: str, num_questions: int = 6, resume_text: str = None, jd_text: str = None) -> List[Dict[str, str]]:
    """
    Generate structured interview questions.
    Structure: Self-Intro (1-2) → Technical Middle (N-4) → Closing (2-3)
    
    When API is available: calls AI to generate dynamic middle questions.
    When API is down:     uses smart keyword-extraction from resume/JD to build questions offline.
    """
    # Ensure num_questions is at least 4 (intro + at least 1 middle + closing)
    num_questions = max(4, num_questions)
    
    # ════════════════════════════════════════════════════════════════════
    # PHASE 1: Opening Questions (Self Introduction) — always 1 question
    # ════════════════════════════════════════════════════════════════════
    opening = [
        {
            "id": 1,
            "question": "Can you please introduce yourself and tell us why you are interested in this specific role?",
            "difficulty": "Easy",
            "type": "Self-Introduction",
            "category": "Basic"
        }
    ]
    
    # ════════════════════════════════════════════════════════════════════
    # PHASE 3: Closing Questions — always last 2-3
    # ════════════════════════════════════════════════════════════════════
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
    # Add a 3rd closing question if we have enough slots
    if num_questions >= 8:
        closing.append({
            "question": "Do you have any questions for us about the team, the role, or the company?",
            "difficulty": "Easy",
            "type": "Closing",
            "category": "Candidate Questions"
        })
    
    # ════════════════════════════════════════════════════════════════════
    # PHASE 2: Technical Middle Questions — fill remaining slots
    # ════════════════════════════════════════════════════════════════════
    middle_count = num_questions - len(opening) - len(closing)
    middle_count = max(1, middle_count)
    
    middle_questions = []
    
    # Try generating with AI first
    try:
        if "resume" in source.lower():
            ai_questions = generate_resume_questions(text)
        else:
            ai_questions = generate_jd_questions(text)
        
        # Strip the intro/closing from AI-generated questions (keep only technical ones)
        for q in ai_questions:
            qtype = q.get("type", "").lower()
            qcat = q.get("category", "").lower()
            # Skip intro-type and closing-type questions
            if any(x in qtype for x in ["self-intro", "introduction", "career", "future"]):
                continue
            if any(x in qcat for x in ["basic", "background", "future goals", "closing"]):
                continue
            middle_questions.append(q)
        
        print(f"✅ AI generated {len(middle_questions)} technical questions")
        
    except Exception as e:
        print(f"⚠️ AI question generation failed: {e}")
        print("📋 Falling back to smart offline question generator...")
    
    # ── OFFLINE FALLBACK: Extract skills/projects from resume+JD and build questions ──
    if len(middle_questions) < middle_count:
        combined_text = ""
        if resume_text:
            combined_text += resume_text + " "
        if jd_text:
            combined_text += jd_text + " "
        if not combined_text.strip():
            combined_text = text
        
        offline_questions = _generate_offline_questions(combined_text, middle_count - len(middle_questions))
        middle_questions.extend(offline_questions)
        print(f"📋 Offline generator added {len(offline_questions)} questions")
    
    # Trim to requested middle count
    middle_questions = middle_questions[:middle_count]
    
    # ════════════════════════════════════════════════════════════════════
    # ASSEMBLE: Opening → Middle → Closing with sequential IDs
    # ════════════════════════════════════════════════════════════════════
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
    
    for q in closing:
        q["id"] = idx
        all_questions.append(q)
        idx += 1
    
    print(f"📝 Total questions assembled: {len(all_questions)} (Opening: {len(opening)}, Middle: {len(middle_questions)}, Closing: {len(closing)})")
    return all_questions


def _generate_offline_questions(text: str, count: int) -> List[Dict[str, str]]:
    """
    Smart offline question generator. Extracts skills, projects, and experiences
    from resume/JD text using regex and keyword matching, then builds targeted questions.
    """
    import re
    
    text_lower = text.lower()
    questions = []
    
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
        "Agile", "Scrum", "JIRA", "Figma", "Power BI", "Tableau", "Excel",
        "Selenium", "Jest", "Pytest", "JUnit", "Cypress", "Pandas", "NumPy",
        "Apache Kafka", "RabbitMQ", "WebSocket", "OAuth", "JWT", "Firebase",
        "Salesforce", "SAP", "ServiceNow", "Hadoop", "Spark", "Databricks"
    ]
    
    found_skills = []
    for kw in tech_keywords:
        if kw.lower() in text_lower:
            found_skills.append(kw)
    
    # ── 2. Extract Project Names (look for patterns like "Project: XYZ" or "built XYZ") ──
    project_patterns = [
        r'(?:project|built|developed|created|designed)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s\-]{3,30})',
        r'(?:title|name)\s*[:\-]\s*([A-Za-z0-9\s\-]{3,40})'
    ]
    found_projects = []
    for pattern in project_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        found_projects.extend([m.strip() for m in matches if len(m.strip()) > 3])
    found_projects = list(set(found_projects))[:3]  # Limit to 3
    
    # ── 3. Extract Company Names (look for "at XYZ" or "Company: XYZ") ──
    company_patterns = [
        r'(?:at|@|company|organization|employer)\s*[:\-]?\s*([A-Z][A-Za-z0-9\s&\.\,]{2,30})',
    ]
    found_companies = []
    for pattern in company_patterns:
        matches = re.findall(pattern, text)
        found_companies.extend([m.strip().rstrip('.,:') for m in matches if len(m.strip()) > 2])
    found_companies = list(set(found_companies))[:2]
    
    # ── 4. Build questions from extracted data ──
    difficulty_cycle = ["Easy", "Medium", "Medium", "Hard", "Medium", "Hard", "Medium"]
    
    # Skill-based questions
    skill_templates = [
        ("How would you rate your proficiency in {skill}? Can you describe a project where you used it?", "Technical", "{skill} Basics"),
        ("Can you explain a complex problem you solved using {skill}? Walk us through your approach.", "Technical", "{skill} Deep Dive"),
        ("How does {skill} compare to alternative technologies you've used? When would you choose it over others?", "Comparison", "{skill} Analysis"),
        ("What best practices do you follow when working with {skill}?", "Technical", "{skill} Best Practices"),
    ]
    
    for i, skill in enumerate(found_skills):
        if len(questions) >= count:
            break
        template = skill_templates[i % len(skill_templates)]
        questions.append({
            "question": template[0].format(skill=skill),
            "difficulty": difficulty_cycle[i % len(difficulty_cycle)],
            "type": template[1],
            "category": template[2].format(skill=skill)
        })
    
    # Project-based questions
    for proj in found_projects:
        if len(questions) >= count:
            break
        questions.append({
            "question": f"Tell me about your project '{proj}'. What was your role, what challenges did you face, and what technologies did you use?",
            "difficulty": "Medium",
            "type": "Project",
            "category": "Projects"
        })
    
    # Experience-based questions
    for comp in found_companies:
        if len(questions) >= count:
            break
        questions.append({
            "question": f"Can you describe your key responsibilities and achievements while working at {comp}?",
            "difficulty": "Medium",
            "type": "Experience",
            "category": "Work History"
        })
    
    # Fill remaining with generic high-quality technical questions
    generic_questions = [
        {
            "question": "Can you walk us through your most significant technical achievement? What made it challenging?",
            "difficulty": "Medium",
            "type": "Technical",
            "category": "Achievement"
        },
        {
            "question": "How do you approach debugging a complex issue in production? Walk us through your process.",
            "difficulty": "Hard",
            "type": "Problem-Solving",
            "category": "Debugging"
        },
        {
            "question": "Describe a time when you had to learn a new technology quickly for a project. How did you approach it?",
            "difficulty": "Medium",
            "type": "Behavioral",
            "category": "Learning Ability"
        },
        {
            "question": "How do you ensure code quality in your projects? What tools and practices do you follow?",
            "difficulty": "Medium",
            "type": "Technical",
            "category": "Best Practices"
        },
        {
            "question": "Tell me about a time you disagreed with a technical decision on your team. How did you handle it?",
            "difficulty": "Medium",
            "type": "Behavioral",
            "category": "Teamwork"
        },
        {
            "question": "If you had to design a scalable system from scratch for this role, what architecture would you choose and why?",
            "difficulty": "Hard",
            "type": "System Design",
            "category": "Architecture"
        }
    ]
    
    for gq in generic_questions:
        if len(questions) >= count:
            break
        questions.append(gq)
    
    return questions[:count]

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

    response = get_client().chat.completions.create(
        model="openai/gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}]
    )

    raw = response.choices[0].message.content
    start = raw.find("{")
    end = raw.rfind("}") + 1
    return json.loads(raw[start:end])

# --- ADAPTIVE INTERVIEW LOGIC ---

class NextQuestionRequest(BaseModel):
    interview_id: str
    current_question_id: int
    answer_text: str

def generate_followup_question(answer_text: str, resume_context: str, current_q_id: int) -> Dict:
    prompt = f"""
    You are an intelligent technical interviewer.
    
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
    
    Return STRICT JSON:
    {{
        "question": "The actual question string...",
        "difficulty": "Medium",
        "type": "Follow-up",
        "category": "Deep Dive"
    }}
    """
    
    try:
        response = get_client().chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.choices[0].message.content
        start = raw.find("{")
        end = raw.rfind("}") + 1
        q_data = json.loads(raw[start:end])
        
        # Add ID
        q_data["id"] = current_q_id + 1
        return q_data
    except Exception as e:
        print(f"Error generating follow-up: {e}")
        # Raise error so the endpoint fails and frontend skips adaptive questions
        raise Exception("API Quota/Error (Offline Mode) - Follow-up generation skipped.")

@app.post("/generate-next-question")
def api_gen_next_question(req: NextQuestionRequest):
    if req.interview_id not in interviews:
        raise HTTPException(status_code=404, detail="Interview not found")
        
    interview = interviews[req.interview_id]
    
    try:
        # Generate the question
        new_question = generate_followup_question(
            req.answer_text, 
            interview.get("profile_text", ""),
            req.current_question_id
        )
    except Exception as e:
        # If API fails, return a 503 so frontend catches it and moves to next pre-generated question
        raise HTTPException(status_code=503, detail="AI generation failed")
    
    # Insert this new question into the list right after current
    # Find current index
    current_idx = -1
    for i, q in enumerate(interview["questions"]):
        if int(q["id"]) == req.current_question_id:
            current_idx = i
            break
            
    if current_idx != -1:
        # Check if we already have a follow-up (avoid infinite expansion if re-running)
        if current_idx + 1 < len(interview["questions"]):
             # If next question is already a "Follow-up", maybe replace it? 
             # For now, let's just INSERT it to be dynamic.
             # Shift IDs of subsequent questions
             for q in interview["questions"][current_idx+1:]:
                 q["id"] = int(q["id"]) + 1
                 
        interview["questions"].insert(current_idx + 1, new_question)
        
        # Update DB with new question list
        interviews_collection.update_one(
            {"id": req.interview_id}, 
            {"$set": {"questions": json.dumps(interview["questions"])}}
        )
        
        return new_question
    
    raise HTTPException(status_code=400, detail="Current question ID not found")


@app.post("/upload-resume")
@app.post("/upload-resume/")
async def upload_resume(
    file: UploadFile = File(...),
    source: str = Form("resume")
):
    try:
        print(f"Uploading resume with source: {source}")

        # Read file content
        content = await file.read()

        # Extract text based on file type
        content_str = extract_text_from_file(content, file.filename)

        if not content_str.strip():
            raise HTTPException(status_code=400, detail="No readable text found in the file")

        # Generate interview ID
        interview_id = f"int_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}"

        # Analyze the resume
        profile_analysis = analyze_resume_or_jd(content_str)

        # Generate questions
        questions = generate_mock_questions(content_str, source)

        if not questions:
            raise HTTPException(status_code=400, detail="Failed to generate questions")

        # Store interview data (RAM)
        interviews[interview_id] = {
            "id": interview_id,
            "source": source,
            "profile_text": content_str[:5000], # Store more text
            "profile_analysis": profile_analysis,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now().isoformat()
        }

        # Store interview data (DB)
        try:
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content_str[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now().isoformat()
            })
        except Exception as db_e:
            print(f"⚠️ DB Save Error: {db_e}")


        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")

@app.post("/start-interview")
@app.post("/start-interview/")
async def start_interview(
    content: str = Form(...),
    source: str = Form("resume")
):
    try:
        print(f"Starting interview with source: {source}")

        interview_id = f"int_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}"

        # ✅ STEP-3.2 → AI ANALYSIS (CORRECT PLACE)
        profile_analysis = analyze_resume_or_jd(content)

        # Generate questions based on Source (Resume vs JD)
        questions = generate_mock_questions(content, source)

        if not questions:
            raise HTTPException(status_code=400, detail="Failed to generate questions")

        # ✅ STEP-3.3 → STORE ANALYSIS HERE (RAM)
        interviews[interview_id] = {
            "id": interview_id,
            "source": source,
            "profile_text": content[:5000],
            "profile_analysis": profile_analysis,
            "questions": questions,
            "answers": {},
            "created_at": datetime.now().isoformat()
        }

        # Store interview data (DB)
        try:
            interviews_collection.insert_one({
                "id": interview_id,
                "source": source,
                "profile_text": content[:5000],
                "questions": json.dumps(questions),
                "created_at": datetime.now().isoformat()
            })
        except Exception as db_e:
            print(f"⚠️ DB Save Error: {db_e}")

        return {
            "interview_id": interview_id,
            "total_questions": len(questions),
            "first_question": questions[0]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/interview/{interview_id}/question/{question_id}")
async def get_question(interview_id: str, question_id: int):
    # Restore from DB if not in RAM
    if interview_id not in interviews:
        row = interviews_collection.find_one({"id": interview_id})
        if row:
            print(f"🔄 Restoring interview {interview_id} from DB...")
            try:
                loaded_questions = json.loads(row.get("questions", "[]"))
                interviews[interview_id] = {
                    "id": interview_id,
                    "source": row.get("source"),
                    "profile_text": row.get("profile_text"),
                    "questions": loaded_questions,
                    "answers": {},
                    "created_at": row.get("created_at")
                }
            except Exception as e:
                print(f"Restore failed: {e}")
    
    if interview_id not in interviews:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    interview = interviews[interview_id]
    # Ensure ID comparison works (cast both to int)
    question = next((q for q in interview["questions"] if int(q["id"]) == int(question_id)), None)
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    return {
        "current_question": question,  # This key must match what your HTML looks for
        "total_questions": len(interview["questions"]),
        "interview_id": interview_id
    }
# Add this import at the top

import base64

@app.post("/upload-answer")
async def upload_answer(
    interview_id: str = Form(...),
    question_id: int = Form(...),
    video: UploadFile = File(...)
):
    if interview_id not in interviews:
        raise HTTPException(status_code=404, detail="Interview not found")

    with tempfile.TemporaryDirectory() as tmp:
        video_path = os.path.join(tmp, "input.webm")
        audio_path = os.path.join(tmp, "audio.wav")

        with open(video_path, "wb") as f:
            f.write(await video.read())

        # Extract audio using ffmpeg
        subprocess.run([
            "ffmpeg", "-i", video_path,
            "-ar", "16000",
            "-ac", "1",
            audio_path
        ], check=True)

        # Whisper STT

@app.get("/interview/{interview_id}/summary")
async def get_interview_summary(interview_id: str):
    """Get a summary of the interview including all questions and answers."""
    if interview_id not in interviews:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    interview = interviews[interview_id]
    return {
        "interview_id": interview_id,
        "source": interview["source"],
        "created_at": interview["created_at"],
        "total_questions": len(interview["questions"]),
        "questions_answered": len(interview["answers"]),
        "questions": interview["questions"],
        "answers": interview["answers"]
    }
@app.get("/")
def root():
    return {"status": "Backend is running"}

class ChatRequest(BaseModel):
    message: str
@app.post("/chat")
def chat(req: ChatRequest):
    url = "https://openrouter.ai/api/v1/chat/completions"

    headers = {
        "Authorization": f"Bearer {os.getenv('OPENROUTER_API_KEY')}",
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost",
        "X-Title": "Voice Chatbot"
    }

    data = {
        "model": "openai/gpt-4o-mini",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful interview assistant. Keep responses short."
            },
            {
                "role": "user",
                "content": req.message
            }
        ]
    }

    response = requests.post(url, headers=headers, json=data)

    return {
        "reply": response.json()["choices"][0]["message"]["content"]
    }

class AnswerRequest(BaseModel):
    interview_id: str
    candidate_name: str
    question_id: int
    question_text: str
    answer_text: str
    


@app.post("/save-answer")
async def save_answer(
    interview_id: str = Form(...),
    question_id: int = Form(...),
    question_text: str = Form(...),
    answer_text: str = Form(...),
    candidate_name: str = Form("Candidate")
):
    print(f"💾 Saving answer for {question_id}...")
    
    # Get context
    context = ""
    # Try RAM first
    if interview_id in interviews:
         profile_text = interviews[interview_id].get("profile_text", "")
         source = interviews[interview_id].get("source", "Resume")
         context = f"Candidate's {source}: {profile_text}"
    else:
        # Try DB
        try:
            row = interviews_collection.find_one({"id": interview_id})
            if row:
                context = f"Candidate's {row.get('source')}: {row.get('profile_text')}"
        except Exception as e:
            print(f"⚠️ Context fetch error: {e}")

    # Use the robust analyze_answer function
    ai_result = analyze_answer(question_text, answer_text, context)

    # Prepare keywords (handle list or string)
    keywords = ai_result.get("keywords", [])
    if isinstance(keywords, list):
        keywords_str = ",".join(keywords)
    else:
        keywords_str = str(keywords)

    # Delete any existing answer for this question in this interview to avoid duplicates
    answers_collection.delete_many({"interview_id": interview_id, "question_id": question_id})
    
    answers_collection.insert_one({
        "interview_id": interview_id,
        "question_id": question_id,
        "question_text": question_text,
        "answer_text": answer_text,
        "ai_score": ai_result.get("overall_score", 0),
        "ai_feedback": ai_result.get("feedback", "No feedback"),
        "ai_keywords": keywords_str,
        "corrected_answer": ai_result.get("corrected_answer", "N/A"),
        "created_at": datetime.now().isoformat()
    })

    print("✅ Answer saved to DB.")

    return {
        "status": "saved",
        "ai_score": ai_result.get("overall_score", 0),
        "ai_feedback": ai_result.get("feedback", "")
    }


# ─── NEW: Save Behavioral / Proctoring Metrics per Question ───────────────────
class BehavioralData(BaseModel):
    interview_id: str
    question_id: int
    wpm: float = 0
    pause_count: int = 0
    filler_count: int = 0
    time_spent_seconds: int = 0
    keyword_match_pct: float = 0
    tab_switches: int = 0
    face_alerts: int = 0

@app.post("/save-behavioral-data")
def save_behavioral_data(data: BehavioralData):
    """Saves per-question behavioral and proctoring metrics"""
    try:
        answers_collection.update_many(
            {"interview_id": data.interview_id, "question_id": data.question_id},
            {"$set": {
                "wpm": data.wpm,
                "pause_count": data.pause_count,
                "filler_count": data.filler_count,
                "time_spent_seconds": data.time_spent_seconds,
                "keyword_match_pct": data.keyword_match_pct,
                "tab_switches": data.tab_switches,
                "face_alerts": data.face_alerts
            }}
        )
        return {"status": "ok"}
    except Exception as e:
        print(f"Behavioral save error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/interview/{interview_id}/ai-summary")
def interview_ai_summary(interview_id: str):
    answers = answers_collection.find({"interview_id": interview_id, "ai_score": {"$ne": None}})
    scores = [a.get("ai_score", 0) for a in answers]
    avg_score = round(sum(scores) / len(scores), 2) if scores else 0

    return {
        "interview_id": interview_id,
        "average_score": avg_score,
        "total_questions": len(scores)
    }

# ─── Helper: Generate AI Summary (Recommendation + S&W) ─────────────────────
def generate_interview_summary(candidate_name: str, answers_data: list) -> dict:
    """
    Given list of {question, answer, ai_score, ai_feedback},
    produce an overall recommendation and strengths/weaknesses summary.
    """
    if not answers_data:
        return {
            "recommendation": "No Data",
            "strengths": "No answers provided.",
            "weaknesses": "No answers provided."
        }

    avg = sum(a.get("ai_score", 0) or 0 for a in answers_data) / len(answers_data)

    qa_block = "\n".join(
        f"Q{i+1}: {a['question_text']}\nA: {a['answer_text']}\nScore: {a.get('ai_score',0)}/100"
        for i, a in enumerate(answers_data)
    )

    prompt = f"""
You are a senior hiring manager reviewing an interview for {candidate_name}.
Here is the full transcript:

{qa_block}

Average score: {avg:.1f}/100

Please respond in JSON with exactly three keys:
- "recommendation": one of "Strong Hire", "Hire", "Borderline", "No Hire"
- "strengths": 2-3 sentence paragraph on what the candidate did well
- "weaknesses": 2-3 sentence paragraph on where the candidate needs improvement
"""

    try:
        response = get_client().chat.completions.create(
            model="openai/gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        raw = response.choices[0].message.content
        start = raw.find("{")
        end = raw.rfind("}") + 1
        return json.loads(raw[start:end])
    except Exception as e:
        print(f"Summary generation error: {e}")
        # Fallback from score
        if avg >= 75:
            rec = "Strong Hire"
        elif avg >= 55:
            rec = "Hire"
        elif avg >= 35:
            rec = "Borderline"
        else:
            rec = "No Hire"
        return {
            "recommendation": rec,
            "strengths": "Summary generation failed — please review individual scores.",
            "weaknesses": "Summary generation failed — please review individual scores."
        }


@app.get("/admin/interview/{link_id}")
def get_interview_details(link_id: str):
    # 1. Fetch session metadata
    session_data = interview_sessions_collection.find_one({"link_id": link_id})
    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    candidate_name = session_data.get("candidate_name")
    created_at = session_data.get("created_at")
    jd = session_data.get("job_description")
    actual_interview_id = session_data.get("interview_id")
    saved_rec = session_data.get("overall_recommendation")
    saved_str = session_data.get("strengths_summary")
    saved_wk = session_data.get("weaknesses_summary")
    saved_avg = session_data.get("avg_score")
    current_status = session_data.get("status")
    candidate_email = session_data.get("candidate_email")

    # Fallback: If results exist but status is still 'started', mark as 'completed'
    if current_status == 'started' and actual_interview_id:
        if answers_collection.find_one({"interview_id": actual_interview_id}):
            print(f"🔄 Fallback: Marking session {link_id} as completed because results exist.")
            interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"status": "completed"}})

    # Fetch recording path from interviews table
    recording_url = None
    if actual_interview_id:
        rec_row = interviews_collection.find_one({"id": actual_interview_id})
        if rec_row and rec_row.get("recording_path"):
            # Convert absolute path to a relative URL path
            raw_path = rec_row["recording_path"].replace("\\", "/")
            # Extract the part starting with "uploads/"
            idx = raw_path.find("uploads/")
            if idx != -1:
                recording_url = raw_path[idx:]

    results = []
    total_tab_switches = 0
    total_face_alerts = 0
    total_time = 0

    if actual_interview_id:
        rows = answers_collection.find({"interview_id": actual_interview_id}).sort("question_id", 1)

        for row in rows:
            tab_sw = row.get("tab_switches") or 0
            face_al = row.get("face_alerts") or 0
            total_tab_switches += tab_sw
            total_face_alerts += face_al
            total_time += (row.get("time_spent_seconds") or 0)

            results.append({
                "question_id": row.get("question_id"),
                "question_text": row.get("question_text"),
                "answer_text": row.get("answer_text") or "(No answer yet)",
                "ai_score": row.get("ai_score"),
                "ai_feedback": row.get("ai_feedback") or "No feedback provided",
                "corrected_answer": row.get("corrected_answer") or "N/A",
                "wpm": round(row.get("wpm") or 0, 1),
                "pause_count": row.get("pause_count") or 0,
                "filler_count": row.get("filler_count") or 0,
                "time_spent_seconds": row.get("time_spent_seconds") or 0,
                "keyword_match_pct": round(row.get("keyword_match_pct") or 0, 1),
                "tab_switches": tab_sw,
                "face_alerts": face_al
            })

    # 2. Calculate or restore AI summary
    avg_score = 0
    if results:
        scores = [r["ai_score"] for r in results if r["ai_score"] is not None]
        avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    # Use cached values if available, else generate
    if saved_rec:
        recommendation = saved_rec
        strengths = saved_str
        weaknesses = saved_wk
    else:
        summary = generate_interview_summary(candidate_name or "Candidate", results)
        recommendation = summary.get("recommendation", "No Data")
        strengths = summary.get("strengths", "")
        weaknesses = summary.get("weaknesses", "")
        # Cache in DB
        try:
            interview_sessions_collection.update_one(
                {"link_id": link_id},
                {"$set": {
                    "overall_recommendation": recommendation,
                    "strengths_summary": strengths,
                    "weaknesses_summary": weaknesses,
                    "avg_score": avg_score
                }}
            )
        except Exception as e:
            print(f"Summary cache error: {e}")

    return {
        "interview_id": link_id,
        "actual_interview_id": actual_interview_id,
        "candidate_name": candidate_name or "Candidate",
        "date": created_at,
        "source": "Job Description / Resume",
        "avg_score": avg_score,
        "overall_recommendation": recommendation,
        "strengths_summary": strengths,
        "weaknesses_summary": weaknesses,
        "recording_url": recording_url,
        "integrity": {
            "total_tab_switches": total_tab_switches,
            "total_face_alerts": total_face_alerts,
            "total_time_minutes": round(total_time / 60, 1)
        },
        "answers": results
    }

class AnalyzeRequest(BaseModel):
    interview_id: Optional[str] = None
    question_id: Optional[int] = None
    question: str
    answer: str

class DecisionRequest(BaseModel):
    link_id: str
    decision: str # 'selected' or 'rejected'
    admin_id: Optional[str] = None

@app.post("/analyze-answer")
def analyze(req: AnalyzeRequest):
    context = ""
    # Retrieve Resume/JD context from the CURRENT in-memory session (not historical DB data)
    if req.interview_id and req.interview_id in interviews:
         profile_text = interviews[req.interview_id].get("profile_text", "")
         source = interviews[req.interview_id].get("source", "Resume")
         context = f"Candidate's {source}: {profile_text}"
    
    result = analyze_answer(req.question, req.answer, context)

    # Delete existing to avoid duplicates
    answers_collection.delete_many({"interview_id": req.interview_id, "question_id": req.question_id})

    # Store in DB
    try:
        answers_collection.insert_one({
            "interview_id": req.interview_id,
            "question_id": req.question_id,
            "question_text": req.question,
            "answer_text": req.answer,
            "ai_score": result.get("overall_score", 0),
            "ai_feedback": result.get("feedback", ""),
            "ai_keywords": json.dumps(result.get("keywords", [])),
            "corrected_answer": result.get("corrected_answer", ""),
            "created_at": datetime.now().isoformat()
        })
    except Exception as e:
        print(f"⚠️ Failed to save answer to DB: {e}")

    return result

@app.post("/upload-full-recording")
async def upload_full_recording(
    interview_id: str = Form(...),
    file: UploadFile = File(...)
):
    try:
        # Create directory for recordings if it doesn't exist
        recordings_dir = os.path.join(UPLOAD_FOLDER, "recordings")
        os.makedirs(recordings_dir, exist_ok=True)
        
        # Generate filename
        filename = f"{interview_id}_full_recording.webm"
        file_path = os.path.join(recordings_dir, filename)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Update database
        normalized_path = file_path.replace("\\", "/")
        interviews_collection.update_one(
            {"id": interview_id},
            {"$set": {"recording_path": normalized_path}}
        )
        
        return {"status": "success", "file_path": normalized_path}
    except Exception as e:
        print(f"Error saving full recording: {e}")
        raise HTTPException(status_code=500, detail=str(e))


from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from fastapi.responses import FileResponse

@app.get("/generate-report/{interview_id}")
def generate_report(interview_id: str):
    # Fetch interview data
    interview_data = interviews_collection.find_one({"id": interview_id})
    if not interview_data:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    source = interview_data.get("source")
    date = interview_data.get("created_at")
    profile_text = interview_data.get("profile_text")
    
    # Fetch Q&A data
    answers_cursor = answers_collection.find({"interview_id": interview_id}).sort("question_id", 1)
    answers = [(a.get("question_text"), a.get("answer_text"), a.get("ai_score"), a.get("ai_feedback"), a.get("corrected_answer")) for a in answers_cursor]
    
    # Generate PDF
    pdf_filename = f"Interview_Report_{interview_id}.pdf"
    file_path = os.path.join(UPLOAD_FOLDER, pdf_filename)
    
    doc = SimpleDocTemplate(file_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title_style = styles['Title']
    story.append(Paragraph(f"Interview Report", title_style))
    story.append(Spacer(1, 12))
    
    # Meta Info
    normal_style = styles['Normal']
    story.append(Paragraph(f"<b>Interview ID:</b> {interview_id}", normal_style))
    story.append(Paragraph(f"<b>Date:</b> {date}", normal_style))
    story.append(Paragraph(f"<b>Source:</b> {source}", normal_style))
    story.append(Spacer(1, 12))
    
    # Calculate Average Score
    if answers:
        scores = [row[2] for row in answers if row[2] is not None]
        avg_score = sum(scores) / len(scores) if scores else 0
        
        # Color code overall score
        color = "green" if avg_score >= 60 else "orange" if avg_score >= 40 else "red"
        story.append(Paragraph(f"<b>Overall Score:</b> <font color='{color}' size='14'>{avg_score:.1f}/100</font>", normal_style))
    else:
        story.append(Paragraph("<b>Overall Score:</b> N/A", normal_style))
    
    story.append(Spacer(1, 20))
    
    # Q&A Details
    for i, row in enumerate(answers):
        q_text, a_text, score, feedback, verified_answer = row
        
        # Question Header
        story.append(Paragraph(f"<b>Q{i+1}: {q_text}</b>", styles['Heading3']))
        story.append(Spacer(1, 5))
        
        # Your Answer
        a_text_disp = a_text if a_text else "(No answer recorded)"
        story.append(Paragraph(f"<b>Your Answer:</b> {a_text_disp}", normal_style))
        story.append(Spacer(1, 5))
        
        # AI Feedback & Score
        score_str = f"{score}/100" if score is not None else "N/A"
        feedback_str = feedback if feedback else "No feedback provided."
        
        # Color score (Green > 60, Red < 60)
        score_color = "green" if (score and score >= 60) else "red"
        
        story.append(Paragraph(f"<b>Score:</b> <font color='{score_color}'><b>{score_str}</b></font>", normal_style))
        story.append(Paragraph(f"<b>Feedback:</b> {feedback_str}", normal_style))
        
        # Suggested Answer (if verified answer exists and is different/better)
        if verified_answer:
             story.append(Spacer(1, 5))
             story.append(Paragraph(f"<b>Suggested/Corrected Answer:</b>", normal_style))
             story.append(Paragraph(f"<i>{verified_answer}</i>", normal_style))
             
        story.append(Spacer(1, 15))
        story.append(Paragraph("<hr width='100%'/>", normal_style)) # Separator using simplified HR if supported or just lines
        # Reportlab doesn't support <hr> well in Paragraph, use drawing or character separator
        # story.append(Paragraph("_" * 80, normal_style)) 
        
        story.append(Spacer(1, 15))

    doc.build(story)
    
    # Return the PDF file directly for download
    return FileResponse(
        path=file_path,
        filename=pdf_filename,
        media_type="application/pdf"
    )

# --------------------------------------------------------------------------------
# ADMIN & SESSION MANAGEMENT APIs
# --------------------------------------------------------------------------------

import hashlib

class AdminLogin(BaseModel):
    username: str
    password: str

class CreateSession(BaseModel):
    candidate_name: str
    candidate_email: str
    resume_text: str
    job_description: str
    admin_id: str
    interview_duration: int = 30  # minutes

class ForgotPasswordRequest(BaseModel):
    username: str
    email: str

class VerifyOTPRequest(BaseModel):
    username: str
    otp: str

class ResetPasswordRequest(BaseModel):
    username: str
    otp: str
    new_password: str

class UpdateProfileRequest(BaseModel):
    admin_id: str
    email: str

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()

def send_interview_email(candidate_email: str, candidate_name: str, link_url: str, duration: int, job_description: str):
    import os
    import requests
    from dotenv import load_dotenv
    # Use absolute path for .env, overriding system variables to prevent stale cache
    load_dotenv(r"c:\Users\sagar\Downloads\mock-interview\backend\.env", override=True)
    brevo_api_key = os.getenv("BREVO_API_KEY")
    sender_name = os.getenv("BREVO_SENDER_NAME", "Arah Info Tech Pvt ltd")
    sender_email = os.getenv("BREVO_SENDER_EMAIL", "oragantisagar041@gmail.com")

    if not brevo_api_key:
        print("⚠️ Warning: BREVO_API_KEY not found in environment")
        return False
    
    print(f"DEBUG: Using Brevo API key: {brevo_api_key[:10]}...{brevo_api_key[-5:] if len(brevo_api_key) > 5 else ''}")
    print(f"DEBUG: Sender Email: {sender_email}")
        
    # Prepare the job description by replacing newlines with HTML line breaks
    formatted_jd = job_description.replace("\n", "<br/>")

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": brevo_api_key,
        "content-type": "application/json"
    }

    # Construct the base URL for the interview link
    # On Render, FRONTEND_URL should be set to your Vercel URL
    base_url = os.getenv("FRONTEND_URL", "https://ai-adaptive-interview.vercel.app")
    full_link = f"{base_url}{link_url}"

    html_content = f"""
    <html>
    <body>
        <h2>Interview Invitation</h2>
        <p>Dear {candidate_name},</p>
        <p>You have been invited to an AI-powered mock interview by <b>Arah</b>.</p>
        <p><b>Role Details:</b><br/>{formatted_jd}</p>
        <p><b>Interview Duration:</b> {duration} minutes</p>
        <div style="margin: 20px 0;">
            <a href="{full_link}" style="background-color: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Start Interview Now
            </a>
        </div>
        <p><b>Important Note:</b> This interview link will expire in exactly <b>24 hours</b>.</p>
        <p>Best regards,<br/>Arah Team</p>
    </body>
    </html>
    """

    payload = {
        "sender": {
            "name": sender_name,
            "email": sender_email
        },
        "to": [{"email": candidate_email, "name": candidate_name}],
        "subject": "Interview Invitation by Arah",
        "htmlContent": html_content
    }

    try:
        response = requests.post(url, json=payload, headers=headers)
        response.raise_for_status()
        print(f"Email successfully sent to {candidate_email}")
        return True
    except Exception as e:
        print(f"Failed to send email to {candidate_email}: {e}")
        return False

@app.on_event("startup")
def startup_event():
    # Create default admin if not exists
    try:
        row = admins_collection.find_one({"username": "admin"})
        if not row:
            hashed_pw = hash_password("admin123")
            default_email = os.getenv("BREVO_SENDER_EMAIL", "oragantisagar041@gmail.com")
            admins_collection.insert_one({
                "username": "admin",
                "password": hashed_pw,
                "email": default_email,
                "created_at": datetime.now().isoformat()
            })
            print(f"Default admin created: admin / admin123 (Email: {default_email})")
        else:
            # Update email if missing
            if not row.get("email"):
                default_email = os.getenv("BREVO_SENDER_EMAIL", "oragantisagar041@gmail.com")
                admins_collection.update_one({"username": "admin"}, {"$set": {"email": default_email}})
    except Exception as e:
        print(f"Error checking/creating admin: {e}")

@app.post("/admin/forgot-password")
async def forgot_password(data: ForgotPasswordRequest):
    user = admins_collection.find_one({"username": data.username, "email": data.email})
    if not user:
        raise HTTPException(status_code=404, detail="Username and email do not match our records.")
    
    otp = "".join([str(random.randint(0, 9)) for _ in range(6)])
    expiry = (datetime.now() + timedelta(minutes=10)).isoformat()
    
    admins_collection.update_one({"_id": user["_id"]}, {"$set": {"otp": otp, "otp_expiry": expiry}})
    
    # Send OTP email
    email_sent = send_otp_email(data.email, data.username, otp)
    if email_sent:
        return {"status": "success", "message": "OTP sent to your registered email."}
    else:
        raise HTTPException(status_code=500, detail="Failed to send OTP. Please try again later.")

@app.post("/admin/verify-otp")
async def verify_otp(data: VerifyOTPRequest):
    row = admins_collection.find_one({"username": data.username})
    if not row or not row.get("otp"):
        raise HTTPException(status_code=400, detail="No OTP found for this user.")
    
    db_otp = row.get("otp")
    expiry_str = row.get("otp_expiry")
    if db_otp != data.otp:
        raise HTTPException(status_code=401, detail="Invalid OTP code.")
    
    expiry = datetime.fromisoformat(expiry_str)
    if datetime.now() > expiry:
        raise HTTPException(status_code=401, detail="OTP has expired.")
    
    return {"status": "success", "message": "OTP verified successfully."}

@app.post("/admin/reset-password")
async def reset_password(data: ResetPasswordRequest):
    # Verify OTP one last time for safety
    row = admins_collection.find_one({"username": data.username})
    if not row or row.get("otp") != data.otp:
        raise HTTPException(status_code=401, detail="Invalid session. Please restart the process.")
    
    expiry = datetime.fromisoformat(row.get("otp_expiry"))
    if datetime.now() > expiry:
        raise HTTPException(status_code=401, detail="Session expired.")
    
    hashed_pw = hash_password(data.new_password)
    admins_collection.update_one({"_id": row["_id"]}, {"$set": {"password": hashed_pw, "otp": None, "otp_expiry": None}})
    
    return {"status": "success", "message": "Password updated successfully. You can now login."}

def send_otp_email(email: str, name: str, otp: str):
    load_dotenv(r"c:\Users\sagar\Downloads\mock-interview\backend\.env", override=True)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = os.getenv("BREVO_SENDER_NAME", "Arah Info Tech Pvt ltd")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    
    if not api_key: return False

    html = f"""
    <html><body>
        <h3>Password Reset Request</h3>
        <p>Dear {name},</p>
        <p>You requested to reset your admin password. Please use the following One-Time Password (OTP) to proceed:</p>
        <h2 style='color: #6366f1; letter-spacing: 5px; font-size: 2rem;'>{otp}</h2>
        <p>This code is valid for 10 minutes. If you did not request this, please ignore this email.</p>
        <p>Best Regards,<br/>Arah Info Tech Pvt ltd</p>
    </body></html>
    """

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": name}],
        "subject": "Admin Password Reset OTP",
        "htmlContent": html
    }
    
    try:
        url = "https://api.brevo.com/v3/smtp/email"
        headers = {"accept": "application/json", "api-key": api_key, "content-type": "application/json"}
        response = requests.post(url, json=payload, headers=headers)
        return response.status_code < 300
    except:
        return False

@app.post("/admin/login")
async def admin_login(data: AdminLogin):
    hashed_pw = hash_password(data.password)
    user = admins_collection.find_one({"username": data.username, "password": hashed_pw})
    if user:
        email = user.get("email", "")
        return {"status": "success", "admin_id": str(user["_id"]), "username": user["username"], "email": email}
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/admin/profile")
async def update_profile(data: UpdateProfileRequest):
    try:
        from bson import ObjectId
        admins_collection.update_one({"_id": ObjectId(str(data.admin_id))}, {"$set": {"email": data.email}})
        return {"status": "success", "message": "Profile updated successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

def extract_info_from_resume(text: str) -> Dict:
    client = get_client()
    try:
        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            messages=[{
                "role": "system",
                "content": "You are a professional recruiting assistant. Extract the candidate's full name and email address from the provided resume text. Return ONLY a valid JSON object with keys 'name' and 'email'. If either cannot be found, use null."
            }, {
                "role": "user",
                "content": text[:5000] # Use first block of text
            }],
            response_format={"type": "json_object"}
        )
        content = response.choices[0].message.content
        return json.loads(content)
    except Exception as e:
        print(f"Error extracting candidate info: {e}")
        return {"name": None, "email": None}

@app.post("/admin/parse-resume")
async def parse_resume(file: UploadFile = File(...)):
    content = await file.read()
    text = extract_text_from_file(content, file.filename)
    info = extract_info_from_resume(text)
    return {
        "status": "success", 
        "text": text,
        "name": info.get("name"),
        "email": info.get("email")
    }

from datetime import timedelta

@app.post("/admin/create-session")
async def create_session(data: CreateSession):
    link_id = str(uuid.uuid4())
    now = datetime.now()
    expires_at = (now + timedelta(hours=24)).isoformat()
    
    interview_sessions_collection.insert_one({
        "link_id": link_id,
        "candidate_name": data.candidate_name,
        "candidate_email": data.candidate_email,
        "resume_text": data.resume_text,
        "job_description": data.job_description,
        "created_by": data.admin_id,
        "created_at": now.isoformat(),
        "expires_at": expires_at,
        "interview_duration": data.interview_duration,
        "status": "pending"
    })
    
    link_url = f"/index.html?session_id={link_id}"
    
    # Send email
    email_sent = send_interview_email(
        candidate_email=data.candidate_email,
        candidate_name=data.candidate_name,
        link_url=link_url,
        duration=data.interview_duration,
        job_description=data.job_description
    )
    
    return {
        "status": "success", 
        "link_id": link_id, 
        "link_url": link_url,
        "email_sent": email_sent
    }

@app.get("/session/{link_id}")
async def get_session(link_id: str):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    if row:
        expires_at = row.get("expires_at")
        
        # Check if the link has expired
        is_expired = False
        if expires_at:
            try:
                expiration_time = datetime.fromisoformat(expires_at)
                if datetime.now() > expiration_time:
                    is_expired = True
            except Exception as e:
                print(f"Error parsing expiration time: {e}")
                
        return {
            "status": "success",
            "candidate_name": row.get("candidate_name"),
            "resume_text": row.get("resume_text"),
            "job_description": row.get("job_description"),
            "session_status": row.get("status"),
            "interview_duration": row.get("interview_duration") or 30,
            "is_expired": is_expired
        }
    else:
        raise HTTPException(status_code=404, detail="Session not found")
from typing import Optional

@app.get("/admin/sessions")
async def get_all_sessions(admin_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None, sort_by: str = "score"):
    query_filter = {"created_by": admin_id}
    
    if start_date or end_date:
        date_filter = {}
        if start_date:
            date_filter["$gte"] = start_date
        if end_date:
            date_filter["$lte"] = end_date + "T23:59:59"
        query_filter["created_at"] = date_filter
    
    sort_field = [("created_at", -1)] if sort_by == "date" else [("avg_score", -1), ("created_at", -1)]
    
    rows = interview_sessions_collection.find(query_filter).sort(sort_field)
    
    sessions = []
    for row in rows:
        sessions.append({
            "link_id": row.get("link_id"),
            "candidate_name": row.get("candidate_name"),
            "status": row.get("status"),
            "created_at": row.get("created_at"),
            "interview_duration": row.get("interview_duration"),
            "interview_id": row.get("interview_id"),
            "avg_score": row.get("avg_score"),
            "recommendation": row.get("overall_recommendation"),
            "decision": row.get("decision")
        })
        
    return {"status": "success", "sessions": sessions}

@app.post("/start-session-interview")
async def start_session_interview(link_id: str = Form(...)):
    row = interview_sessions_collection.find_one({"link_id": link_id})
    
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
        
    candidate_name = row.get("candidate_name")
    candidate_email = row.get("candidate_email")
    resume_text = row.get("resume_text")
    job_description = row.get("job_description")
    status = row.get("status")
    num_questions = row.get("num_questions")
    interview_duration = row.get("interview_duration") or 30
    existing_interview_id = row.get("interview_id")
    expires_at = row.get("expires_at")
    
    # Check if the link has expired
    if expires_at:
        try:
            expiration_time = datetime.fromisoformat(expires_at)
            if datetime.now() > expiration_time:
                return {
                    "is_expired": True,
                    "message": "This interview link has expired. Please contact your administrator."
                }
        except Exception as e:
            print(f"Error parsing expiration time in start_session_interview: {e}")
    
    # If session was already started or completed, don't restart — return status
    if status in ('started', 'completed') and existing_interview_id:
        return {
            "already_started": True,
            "session_status": status,
            "candidate_name": candidate_name,
            "interview_id": existing_interview_id,
            "interview_duration": interview_duration
        }
    
    # Generate a larger pool of questions based on duration
    num_questions_to_generate = max(4, min(20, interview_duration // 2))
    
    # Generate Questions
    source = "job_description" if job_description and len(job_description) > 50 else "resume"
    content_str = job_description if source == "job_description" else resume_text
    
    profile_analysis = analyze_resume_or_jd(content_str)
    
    questions = generate_mock_questions(content_str, source, num_questions=num_questions_to_generate, resume_text=resume_text, jd_text=job_description)
    
    if not questions:
        raise HTTPException(status_code=400, detail="Failed to generate questions")

    interview_id = f"int_{int(datetime.now().timestamp())}_{uuid.uuid4().hex[:8]}"

    # Store interview data (RAM)
    interviews[interview_id] = {
        "id": interview_id,
        "source": source,
        "profile_text": content_str[:5000],
        "profile_analysis": profile_analysis,
        "questions": questions,
        "answers": {},
        "created_at": datetime.now().isoformat(),
        "candidate_name": candidate_name,
        "candidate_email": candidate_email,
        "status": status
    }
    
    # Store interview data (DB)
    try:
        interviews_collection.insert_one({
            "id": interview_id,
            "source": source,
            "profile_text": content_str[:5000],
            "questions": json.dumps(questions),
            "created_at": datetime.now().isoformat()
        })
        
        # Update session status
        interview_sessions_collection.update_one(
            {"link_id": link_id},
            {"$set": {"status": "started", "interview_id": interview_id}}
        )
    except Exception as db_e:
        print(f"⚠️ DB Save Error: {db_e}")
        
    return {
        "interview_id": interview_id,
        "total_questions": len(questions),
        "first_question": questions[0],
        "candidate_name": candidate_name,
        "interview_duration": interview_duration
    }

@app.post("/admin/update-decision")
@app.post("/admin/update_decision")
async def update_decision(data: DecisionRequest):
    print(f"🚀 Decision Update Request: link_id={data.link_id}, decision={data.decision}")
    try:
        # 1. Fetch candidate details for email
        row = interview_sessions_collection.find_one({"link_id": data.link_id})
        if not row:
            print(f"❌ Session NOT found for link_id: {data.link_id}")
            raise HTTPException(status_code=404, detail="Session not found")
        
        name = row.get("candidate_name")
        email = row.get("candidate_email")
        jd = row.get("job_description")
        print(f"👤 Candidate: {name}, Email: {email}")
        
        # 2. Update DB
        interview_sessions_collection.update_one({"link_id": data.link_id}, {"$set": {"decision": data.decision}})
        print(f"✅ DB Updated for {data.link_id}")
        
        # 3. Send Email
        email_sent = False
        email_reason = "No candidate email found"
        if email:
            email_sent = send_decision_email(email, name, data.decision, jd)
            print(f"📧 Email sent: {email_sent}")
            email_reason = "Success" if email_sent else "Email service error (Brevo API failed)"
        else:
            print("⚠️ No email found for candidate, skipping notification.")
        
        return {"status": "success", "decision": data.decision, "email_sent": email_sent, "email_reason": email_reason}
    except Exception as e:
        print(f"💥 Decision update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def send_decision_email(email: str, name: str, decision: str, jd: str):
    import requests
    load_dotenv(r"c:\Users\sagar\Downloads\mock-interview\backend\.env", override=True)
    api_key = os.getenv("BREVO_API_KEY")
    sender_name = os.getenv("BREVO_SENDER_NAME", "Arah Info Tech Pvt ltd")
    sender_email = os.getenv("BREVO_SENDER_EMAIL")
    
    if not api_key: return False

    subject = "Interview Result - Invitation for next steps" if decision == 'selected' else "Application Status Update"
    
    if decision == 'selected':
        html = f"""
        <html><body>
            <h3>Congratulations {name}!</h3>
            <p>We are pleased to inform you that you have successfully cleared the AI interview for the role.</p>
            <p><b>Next Steps:</b> Our recruitment team will reach out to you shortly for the final technical/HR round. Please stay reachable on this email.</p>
            <p>Best Regards,<br/>Arah Team</p>
        </body></html>
        """
    else:
        html = f"""
        <html><body>
            <h3>Application Update</h3>
            <p>Dear {name},</p>
            <p>Thank you for taking the time to interview with us. Unfortunately, we have decided not to move forward with your application at this time.</p>
            <p>We were impressed with your background, but we had many qualified candidates for this role. We wish you the very best in your job search.</p>
            <p>Best Regards,<br/>Arah Team</p>
        </body></html>
        """

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": email, "name": name}],
        "subject": subject,
        "htmlContent": html
    }
    
    try:
        res = requests.post("https://api.brevo.com/v3/smtp/email", json=payload, headers={
            "api-key": api_key, "content-type": "application/json"
        })
        if res.status_code >= 300:
            print(f"❌ Brevo Error: {res.status_code} - {res.text}")
        return res.status_code < 300
    except Exception as email_err:
        print(f"💥 Email sending error: {email_err}")
        return False

@app.post("/complete-session/{link_id}")
async def complete_session(link_id: str):
    """Mark a session as completed so it can't be restarted."""
    try:
        interview_sessions_collection.update_one({"link_id": link_id}, {"$set": {"status": "completed"}})
        return {"status": "success"}
    except Exception as e:
        print(f"Error completing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    import socket

    HOST = "0.0.0.0"
    DEFAULT_PORT = int(os.getenv("PORT", 8000))

    def find_available_port(start_port: int, max_tries: int = 100) -> int:
        """Try to bind to ports starting at start_port and return the first available one."""
        for port in range(start_port, start_port + max_tries):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                # Try binding to the candidate port to check availability
                s.bind((HOST, port))
                s.close()
                return port
            except OSError:
                s.close()
                continue
        raise RuntimeError(f"No available ports found in range {start_port}-{start_port + max_tries - 1}")

    port_to_use = find_available_port(DEFAULT_PORT)
    if port_to_use != DEFAULT_PORT:
        print(f"Port {DEFAULT_PORT} is in use; starting server on available port {port_to_use} instead.")

    # Check for SSL certificates in the forenten folder
    cert_path = r"c:\Users\sagar\Downloads\mock-interview\forenten\cert.pem"
    key_path = r"c:\Users\sagar\Downloads\mock-interview\forenten\key.pem"
    
    if os.path.exists(cert_path) and os.path.exists(key_path):
        print(f"🚀 Starting HTTPS server on port {port_to_use}")
        uvicorn.run(app, host=HOST, port=port_to_use, ssl_certfile=cert_path, ssl_keyfile=key_path)
    else:
        print(f"🚀 Starting HTTP server on port {port_to_use} (SSL certs not found)")
        uvicorn.run(app, host=HOST, port=port_to_use)