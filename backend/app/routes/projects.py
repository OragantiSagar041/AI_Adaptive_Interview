from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from app.db.mongo_db import projects_collection
from app.ai.ai_client import chat_completion, extract_json
import uuid
import re

router = APIRouter()

class CustomQuestion(BaseModel):
    question: str
    sample_answer: str = ""

class ProjectCreate(BaseModel):
    project_name: str
    description: str = ""
    instructions: str = ""
    custom_questions: List[CustomQuestion] = []

class GenerateProjectQuestionsRequest(BaseModel):
    domain: Optional[str] = ""
    project_text: Optional[str] = ""
    resume_text: Optional[str] = ""
    file_name: Optional[str] = ""
    difficulty: Optional[str] = "medium"
    num_questions_per_project: int = 7
    num_questions: Optional[int] = 12

def extract_projects_section_from_resume(text: str) -> str:
    """
    Intelligently locates and extracts the Projects section from a candidate resume across any format.
    Recognizes various standard resume formats (Key Projects, Academic Projects, Capstone Projects, Notable Projects, etc.).
    """
    if not text:
        return ""
    
    # 1. Search for explicit project section header with rich prefix & suffix variations
    pattern = r'(?i)(?:^|\n)\s*(?:[#*=-]*\s*)(?:(?:KEY|ACADEMIC|PERSONAL|TECHNICAL|MAJOR|SELECTED|NOTABLE|CAPSTONE|SIGNIFICANT|CLIENT|COLLEGE|LIVE|RECENT|FEATURED|PRACTICAL)\s+)?PROJECTS?(?:\s*(?:EXPERIENCE|DETAILS|WORK|SUMMARY|PORTFOLIO|CASE STUDIES|& CASE STUDIES|& INTERNSHIPS|/ INTERNSHIPS|& ACHIEVEMENTS|& RESEARCH))?[:\s\-\*#=]*\n([\s\S]+?)(?=(?:\n\s*(?:[#*=-]*\s*)(?:EDUCATION|ACADEMICS?|TECHNICAL\s+SKILLS|SKILLS|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|EXPERIENCE|EMPLOYMENT|EMPLOYMENT\s+HISTORY|INTERNSHIPS?|INDUSTRIAL\s+TRAINING|TRAINING|CERTIFICATIONS?|CERTIFICATES?|LICENSES?|ACHIEVEMENTS?|HONORS?|AWARDS?|PUBLICATIONS?|DECLARATION|LANGUAGES?|EXTRA-?CURRICULAR|ACTIVITIES|CO-?CURRICULAR|VOLUNTEERING|INTERESTS|HOBBIES|REFERENCES)\b[:\s\-\*#=]*\n)|\Z)'
    match = re.search(pattern, text)
    if match:
        extracted = match.group(1).strip()
        if len(extracted) > 30:
            return extracted
            
    # 2. Looser regex match if strict newline pattern didn't match
    looser_pattern = r'(?i)\b(?:(?:KEY|ACADEMIC|PERSONAL|TECHNICAL|MAJOR|SELECTED|NOTABLE|CAPSTONE|LIVE)\s+)?PROJECTS?\b[:\s]*([\s\S]{80,6000}?)(?=\b(?:EDUCATION|ACADEMICS?|SKILLS|TECHNICAL\s+SKILLS|CERTIFICATIONS?|DECLARATION|EMPLOYMENT|INTERNSHIP)\b|\Z)'
    m2 = re.search(looser_pattern, text)
    if m2:
        extracted = m2.group(1).strip()
        if len(extracted) > 30:
            return extracted

    # 3. Fallback: return full text so the AI or parser can inspect all project mentions
    return text

_TECH_WORDS = [
    r'Python', r'Java', r'SQL', r'React', r'Power\s*BI', r'Gen\s*AI', r'LangChain', 
    r'FAISS', r'F\s*AISS', r'Machine\s*Learning', r'EDA', r'Gradio', r'Streamlit', 
    r'OpenCV', r'Keras', r'TensorFlow', r'ChromaDB', r'C\+\+', r'AWS', r'Docker', 
    r'HTML', r'CSS', r'Scikit-learn', r'Pandas', r'NumPy', r'NLP', r'RandomForest'
]
_TECH_PATTERN = '|'.join(_TECH_WORDS)
_FULL_TECH_REGEX = rf'(?:[\s\t–\-]+|(?:[a-z]|Database|Prediction|Intelligence|System|Chatbot|Analysis|Platform))((?:(?:{_TECH_PATTERN})[\s,&/]*)+)$'

_BULLET_PREFIXES = ('•', '●', '○', '▪', '■', '◆', '◇', '►', '✔', '★', '*', '–', '—', '\uf0b7')
_ACTION_VERBS = (
    'built', 'developed', 'integrated', 'architected', 'engineered', 'designed', 
    'trained', 'achieved', 'implemented', 'performed', 'used', 'created', 
    'deployed', 'applied', 'utilized', 'evaluated', 'spearheaded', 'formulated', 
    'collaborated', 'optimized', 'executed', 'fine-tuned', 'finetuned', 'tested', 'analyzed'
)
_ACTION_PREFIXES = [
    r'^(?:Developed|Built|Engineered|Created|Designed|Implemented|Integrated|Architected)\s+(?:a|an|the)\s+',
    r'^(?:Developed|Built|Engineered|Created|Designed|Implemented|Integrated|Architected)\s+',
]

def format_project_title(raw_title: str) -> str:
    """Cleans a raw project heading or first bullet into a concise, professional project title."""
    t = raw_title.strip(" \t\n\r.*–—#:")
    t = re.sub(r'^(?:Project\s*)?(?:\d+|[a-zA-Z])[\.\)\:\-]\s*', '', t, flags=re.IGNORECASE).strip()
    for p in _ACTION_PREFIXES:
        if re.search(p, t, re.IGNORECASE):
            t = re.sub(p, '', t, flags=re.IGNORECASE).strip()
            break
    t = t.rstrip('.').strip()
    # If the title is still very long (> 60 chars or > 8 words), trim to core subject
    if len(t.split()) > 8 or len(t) > 60:
        parts = re.split(r'\s+(?:using|with|via|for|based|on)\s+', t, maxsplit=1, flags=re.IGNORECASE)
        if len(parts) > 1 and len(parts[0].split()) >= 2:
            t = parts[0].strip()
    if len(t.split()) <= 7:
        t = ' '.join(word.capitalize() if not word.isupper() and word.lower() not in ['a', 'an', 'the', 'in', 'on', 'of', 'for', 'with', 'and'] else word for word in t.split())
        if t and t[0].islower():
            t = t[0].upper() + t[1:]
    return t if len(t) >= 3 else raw_title.strip(" |*_\t-:#")

def is_bullet_or_detail(line: str) -> bool:
    clean = line.strip()
    if not clean:
        return False
    # Strip any leading bullets, markdown stars, or list numbering like "1.", "1)", "(1)", "•", etc.
    stripped = re.sub(r'^(?:(?:\d+|[a-zA-Z])[\.\)\-]\s*|\([0-9]+\)\s*|[-–—*•●○▪■◆◇►✔★]+\s*)', '', clean).strip()
    if not stripped:
        return True
    if any(clean.startswith(b) for b in _BULLET_PREFIXES):
        return True
    if clean.startswith('- ') or clean.startswith('-- ') or clean.startswith('* '):
        return True
    first_word = re.split(r'\s+', stripped)[0].lower().strip('•-*–—.:')
    if first_word in _ACTION_VERBS:
        return True
    # Metrics, accuracy numbers, and achievement outcomes are always details, never project titles
    if re.search(r'\b(?:\d+%\s*(?:accuracy|reduction|increase|improvement|efficiency|precision|recall|f1)|achieved|reduced|improved|increased|optimized\s+by|trained\s+with)\b', stripped, re.IGNORECASE):
        return True
    if stripped.endswith('.') and len(stripped.split()) >= 6:
        return True
    return False

def sanitize_project_question(q: str) -> str:
    """
    Ensures technical interview questions are grammatically sound, natural, and never awkwardly
    prefixed with quoted bullet points or metrics (e.g. In the 'Achieved 92% validation accuracy.' project).
    """
    if not q:
        return ""
    q = re.sub(r'^\[[^\]]+\]\s*', '', str(q)).strip()
    q = re.sub(r'\\x[0-9a-fA-F]{2}', '', q)
    q = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\uf000-\uf8ff]', '', q)
    
    # 1. Eliminate awkward leading pattern: In the 'Achieved 92%...' project, <rest>
    m = re.match(r"^(?:In\s+the\s+)?['\"`]([^'\"`]+)['\"`]\s*(?:project|system)?(?:,|:)?\s*(.*)$", q, re.IGNORECASE)
    if m:
        quoted, rest = m.group(1).strip(), m.group(2).strip()
        is_bad_title = (
            '%' in quoted 
            or quoted.endswith('.')
            or len(quoted.split()) > 7
            or any(quoted.lower().startswith(v) for v in ['achieved', 'built', 'developed', 'trained', 'implemented', 'designed', 'created', 'used', 'evaluated', 'integrated', 'engineered'])
        )
        if is_bad_title and rest:
            rest = rest[0].upper() + rest[1:] if len(rest) > 1 else rest.upper()
            q = rest

    # 2. General cleanup for any remaining "In the '<metric/verb sentence>' project, "
    q = re.sub(r"^In\s+the\s+['\"`][^'\"`]*(?:%|\.)['\"`]\s+project(?:,|:)?\s*", '', q, flags=re.IGNORECASE)
    
    # 3. Clean trailing punctuation inside quotes e.g. 'Project Name.' -> 'Project Name'
    q = re.sub(r"(['\"`])([^'\"`]+)\.\1", r"\1\2\1", q)
    q = re.sub(r'\s{2,}', ' ', q).strip()
    if q and q[0].islower():
        q = q[0].upper() + q[1:]
    return q

def is_link_or_meta(line: str) -> bool:
    lower = line.strip().lower()
    if any(k in lower for k in ['github', 'git hub', 'gitlab', 'bitbucket', 'live demo', 'link : link', 'link: link', 'link:', 'view project', 'demo:']):
        if '|' in line:
            left_part = line.split('|')[0].strip()
            if len(left_part.split()) >= 2 and not any(k in left_part.lower() for k in ['github', 'link', 'demo', 'http']):
                return False
        return True
    if lower in ['developer', 'intern', 'lead', 'engineer', 'team lead', 'data scientist', 'full stack developer']:
        return True
    if re.match(r'^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})\b', line.strip(), re.IGNORECASE):
        return True
    if line.strip().isdigit():
        return True
    # Detect pipe-separated resume metadata like "Ratnaraju_01 | Developer | Mar" or "Name | Role | Date"
    parts = [p.strip() for p in line.strip().split('|')]
    if len(parts) >= 2:
        role_words = {'developer', 'intern', 'lead', 'engineer', 'analyst', 'designer', 'manager', 'architect', 'consultant', 'scientist', 'student'}
        month_words = {'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'}
        
        # If the FIRST part is a project title (e.g. "Deep Learning Chest X-Ray Classification | ..."), this is a project header, NOT pure metadata!
        first_part_lower = parts[0].lower().strip()
        if len(parts[0].split()) >= 2 and not any(r == first_part_lower for r in role_words) and not re.match(r'^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|\d{4})\b', first_part_lower):
            return False

        has_role = any(any(r in p.lower() for r in role_words) for p in parts)
        has_month = any(any(m in p.lower() for m in month_words) for p in parts)
        has_year = any(re.search(r'\b20\d{2}\b', p) for p in parts)
        if has_role or has_month or has_year:
            return True
    return False

def clean_project_title_and_tech(raw_title: str) -> tuple:
    # Strip literal hex escapes (e.g. \x7f), raw control characters, and bullet glyphs
    cleaned_raw = re.sub(r'\\x[0-9a-fA-F]{2}', '', raw_title)
    cleaned_raw = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\uf000-\uf8ff]', '', cleaned_raw)
    # If title has pipe-separated handle, link, or date e.g. 'Project Name | Ratnaraju_01 Jan 2026'
    if '|' in cleaned_raw:
        cleaned_raw = cleaned_raw.split('|')[0]
    title = cleaned_raw.strip(" |*_\t-:#")
    # Strip leading numbered list prefixes like "1.", "2.", "3)", "Project 1:", etc.
    title = re.sub(r'^(?:Project\s*)?(\d+[\.\):\-]\s*)', '', title, flags=re.IGNORECASE).strip()
    title = re.sub(r'^(?:Project\s+)?(?:Title\s*[:\-]?\s*)', '', title, flags=re.IGNORECASE).strip()
    tech = ""
    m = re.search(_FULL_TECH_REGEX, title, re.IGNORECASE)
    if m:
        tech = m.group(1).strip(" ,-–")
        title = title[:m.start(1)].strip(" |*_\t-:#–—")

    title = re.sub(r'[\s|_-]*(?:Ratnaraju|Candidate|User|Project|Proj)?[_0-9]+$', '', title, flags=re.IGNORECASE).strip(" |*_\t-:#–—")
    clean_t = format_project_title(title if len(title) >= 3 else raw_title)
    return clean_t, tech

def parse_projects_from_text(raw: str) -> List[Dict[str, Any]]:
    """
    Intelligently segments any project document or resume section into distinct projects,
    capturing titles, technologies used, and architectural details across all resume formats.
    """
    # If the text is a full resume, first isolate the projects section
    project_section = extract_projects_section_from_resume(raw)
    target_text = project_section if len(project_section) > 50 else raw

    lines = [l.strip() for l in target_text.split("\n") if l.strip()]
    if lines and lines[0].lower() in ['projects', 'key projects', 'academic projects']:
        lines = lines[1:]

    projects = []
    curr = None

    # Common section header keywords to ignore as project titles
    ignore_keywords = {
        "project details", "projects", "summary", "overview", "experience", 
        "education", "skills", "certifications", "profile", "details",
        "personal details", "contact details", "objective", "declaration",
        "academic projects", "key projects", "personal projects", "technical projects",
        "developer", "role", "technologies", "tools used", "tech stack"
    }

    for i, line in enumerate(lines):
        clean = line.strip(" |*_\t-#")
        lower = clean.lower()

        if is_bullet_or_detail(line):
            if curr:
                curr["details"].append(line)
            continue

        if is_link_or_meta(line):
            continue

        if any(k in lower for k in ["technologies", "tools used", "tech stack", "technologies used"]):
            if curr:
                extracted_tech = line.split(":", 1)[-1].strip() if ":" in line else line
                curr["tech"] = (curr["tech"] + ", " + extracted_tech).strip(" ,") if curr["tech"] else extracted_tech
            continue

        # If line starts with lowercase or is a single word continuation, treat as details
        if clean and clean[0].islower():
            if curr:
                curr["details"].append(line)
            continue
        if len(clean.split()) == 1 and not line.startswith("|") and lower not in ["smartcart", "rag"]:
            if curr:
                curr["details"].append(line)
            continue

        next_line = lines[i + 1] if i + 1 < len(lines) else ""
        next_is_bullet = is_bullet_or_detail(next_line)
        next_is_meta = is_link_or_meta(next_line)

        is_header = False
        if line.startswith("|") and len(clean) > 4:
            is_header = True
        elif re.match(r'^(?:(?:\*{1,2}|#+|\d+[\.\)]|Project\s*(?:\d+)?[:\-]?|(?:Project\s*)?Title[:\-]?))\s*(.+)$', line, re.IGNORECASE):
            is_header = True
        elif (next_is_bullet or next_is_meta) and len(clean) > 3 and lower not in ignore_keywords:
            is_header = True
        elif curr is None and len(clean) > 3 and lower not in ignore_keywords:
            is_header = True

        # Extra guard: Never allow metric or percentage lines to become a project header
        if is_header and ('%' in clean or any(clean.lower().startswith(v) for v in ['achieved', 'reduced by', 'improved by'])):
            is_header = False

        if is_header:
            title, inline_tech = clean_project_title_and_tech(line)
            # If cleaned title is too long or ends in period, refine it
            if len(title.split()) > 7 or title.endswith('.'):
                title = format_project_title(title)
            curr = {
                "title": title,
                "tech": inline_tech,
                "details": []
            }
            projects.append(curr)
        elif curr:
            curr["details"].append(line)

    # If no structured headings detected, try fallback
    if not projects and len(lines) > 0:
        first_line = lines[0]
        title, inline_tech = clean_project_title_and_tech(first_line)
        title = format_project_title(title)
        projects.append({
            "title": title if len(title) < 70 and len(title) >= 3 else "Project Architecture & Implementation",
            "tech": inline_tech,
            "details": lines
        })

    return projects

def build_offline_project_questions(projects: List[Dict[str, Any]], q_per_proj: int = 7, difficulty: str = "medium") -> List[str]:
    """
    Generates dynamic, non-repetitive technical questions FOR EACH project tailored to difficulty:
    - Easy: beginner-level (fundamentals, definitions, simple examples, basic concepts)
    - Medium: intermediate-level (practical application, reasoning, troubleshooting, trade-offs)
    - Hard: advanced-level (deep architecture, extreme scale, edge cases, optimization)
    """
    import random
    all_questions = []
    target_count = max(5, min(10, q_per_proj))
    diff = (difficulty or "medium").strip().lower()

    if diff == "easy":
        pool_definitions = [
            "What is the primary purpose of '{title}', and what basic problem does it solve?",
            "Can you define the core terminology and main concepts involved in '{title}'?",
            "What was the overall goal of '{title}', and who was the intended user or audience?"
        ]
        pool_role = [
            "What was your personal role in developing '{title}', and what were your day-to-day tasks?",
            "Walk through a simple practical feature you personally implemented in '{title}'.",
            "What initial steps did you take when starting work on '{title}'?"
        ]
        pool_tools = [
            "What primary tools and technologies ({tech}) did you use in '{title}', and what did each one do?",
            "What basic programming concepts or beginner-friendly libraries in {tech} did you rely on for '{title}'?",
            "How did you install, set up, or configure your local environment for '{title}'?"
        ]
        pool_workflow = [
            "Can you walk through a simple, step-by-step example of how data or users flow through '{title}'?",
            "How did you verify or test that your code in '{title}' worked as expected on your machine?",
            "What simple input/output format does '{title}' take and produce?"
        ]
        pool_troubleshooting = [
            "When you encountered a simple syntax or runtime bug in '{title}', how did you locate and fix it?",
            "What basic safety, validation, or error checks did you add to '{title}' for simple user errors?",
            "What is one basic thing you learned while building '{title}' that improved your foundational skills?"
        ]
        pools = [pool_definitions, pool_role, pool_tools, pool_workflow, pool_troubleshooting]

    elif diff == "hard":
        pool_arch = [
            "Walk through the end-to-end distributed system architecture and concurrency model of '{title}', highlighting state synchronization and failure domains.",
            "What deep architectural trade-offs did you evaluate between consistency, availability, and partition tolerance in '{title}'?",
            "If you had to re-architect '{title}' from scratch for zero-downtime multi-region active-active deployment, what design patterns would you implement?"
        ]
        pool_scale = [
            "If concurrent query throughput or active traffic to '{title}' spiked 100x overnight{metric_hint}, where does the system bottleneck first, and how would you scale it horizontally?",
            "How did you profile memory leaks, CPU thread starvation, or event-loop blocking in '{title}' under heavy load?",
            "Describe your cache invalidation strategy, connection pooling limits, and circuit breaker patterns in '{title}'."
        ]
        pool_edge_cases = [
            "Walk through the most complex race condition, deadlock, or insidious edge case you diagnosed in '{title}', and explain your root-cause fix.",
            "How does '{title}' guarantee transactional integrity and graceful degradation during partial network partitions or upstream outages?",
            "What defensive programming mechanisms prevent data corruption, model drift, or memory exhaustion in '{title}'?"
        ]
        pool_optimization = [
            "What algorithmic optimizations or low-level performance tunings did you execute in '{title}' to minimize p99 latency{metric_hint}?",
            "How did you design database indexing, query execution plans, and partitioning schemes in '{title}' for sub-millisecond retrieval?",
            "What mathematical formulation, loss function optimization, or compute-bandwidth trade-offs did you benchmark in '{title}'?"
        ]
        pool_security_prod = [
            "What zero-trust security postures, payload sanitization, and cryptographic guards are enforced across '{title}'?",
            "Walk through your automated CI/CD pipeline, automated integration tests, and canary rollout strategy for '{title}'.",
            "What comprehensive telemetry, distributed tracing, and anomaly detection dashboards would you deploy for '{title}' in high-stakes production?"
        ]
        pools = [pool_arch, pool_scale, pool_edge_cases, pool_optimization, pool_security_prod]

    else:  # medium (default)
        architecture_pool = [
            "Can you walk through the end-to-end system architecture and data flow of '{title}', explaining how key components interact?",
            "What architectural pattern (e.g., microservices, layered, event-driven) did you adopt for '{title}', and what were the key trade-offs?",
            "How is data modeled, validated, and persisted across the different layers in '{title}' from client input to database storage?",
            "If you were designing '{title}' from scratch today, what core architectural decisions would you change and why?"
        ]
        tech_stack_pool = [
            "Why did you choose {tech} for '{title}' over alternative technologies in that domain?",
            "How did you handle API design, serialization, and communication between services using {tech} in '{title}'?",
            "What specific libraries or modules in {tech} did you rely on most heavily in '{title}', and what limitations did you encounter?",
            "How did you manage dependencies, configuration environments, and secret keys while implementing {tech} in '{title}'?"
        ]
        algorithms_pool = [
            "Walk through the core algorithmic or model logic you implemented in '{title}'{metric_hint}.",
            "How did you handle feature preprocessing, data cleaning, or chunking in '{title}' to prepare clean inputs?",
            "What evaluation metrics did you track to validate '{title}', and how did you baseline them?",
            "How did you prevent overfitting or logical drift during the development of '{title}'?"
        ]
        challenges_pool = [
            "What was the single most complex technical bug or bottleneck you encountered in '{title}', and how did you debug and resolve it?",
            "Can you describe a critical design constraint or failure scenario in '{title}' that forced you to re-engineer part of the system?",
            "Walk through an unexpected edge case you discovered during testing '{title}' and how you fixed it."
        ]
        performance_pool = [
            "What specific optimizations did you implement in '{title}' to minimize latency or optimize memory{metric_hint}?",
            "How did you monitor and measure execution performance in '{title}'?",
            "Did you implement caching or asynchronous background processing in '{title}', and how did it improve throughput?"
        ]
        production_pool = [
            "How did you handle validation, error logging, and graceful degradation in '{title}' when dependencies fail?",
            "How would you design automated testing and deployment for '{title}' in production?",
            "What was the biggest technical trade-off you made in '{title}' between development speed and runtime performance?"
        ]
        pools = [architecture_pool, tech_stack_pool, algorithms_pool, challenges_pool, performance_pool, production_pool]

    for proj in projects:
        title = proj["title"]
        tech = proj.get("tech", "").strip() or "the selected frameworks and tech stack"
        details_str = " ".join(proj.get("details", []))
        
        metrics = re.findall(r'(\d+[\.\d]*\s*%|\d+[\,\d]*\+?\s*(?:images|users|records|queries|chunks|latency|seconds|accuracy|R\s*=\s*\d+[\.\d]*))', details_str, re.IGNORECASE)
        metric_hint = f" (specifically targeting {metrics[0]})" if metrics else ""

        all_templates = [q for pool in pools for q in pool]
        random.shuffle(all_templates)
        
        proj_qs = []
        for q_tmpl in all_templates:
            formatted = q_tmpl.format(title=title, tech=tech, metric_hint=metric_hint)
            formatted = re.sub(r'^\[[^\]]+\]\s*', '', formatted).strip()
            if formatted not in proj_qs:
                proj_qs.append(formatted)
            if len(proj_qs) >= target_count:
                break

        all_questions.extend(proj_qs)

    return all_questions

def build_offline_domain_questions(domain: str, count: int = 12, difficulty: str = "medium") -> List[str]:
    """
    Generates dynamic interview questions for ANY manually entered domain across:
    - Easy (10-15 beginner questions: fundamental concepts, definitions, simple examples, introductory problem-solving)
    - Medium (10-15 intermediate questions: practical application, reasoning, troubleshooting, trade-offs)
    - Hard (10-15 advanced questions: deep domain knowledge, complex scenarios, optimization, edge cases, architecture)
    """
    import random
    clean_domain = domain.strip()
    d_lower = clean_domain.lower()
    diff = (difficulty or "medium").strip().lower()

    if diff == "easy":
        domain_pools = {
            'fundamentals': [
                f"[{clean_domain}] What is {clean_domain}, and what are its core foundational concepts?",
                f"[{clean_domain}] Can you explain the primary purpose and basic definitions commonly used in {clean_domain}?",
                f"[{clean_domain}] What are the fundamental principles that every beginner in {clean_domain} should understand?",
                f"[{clean_domain}] Can you define the key differences between two elementary terms or tools in {clean_domain}?"
            ],
            'basic_knowledge': [
                f"[{clean_domain}] What are the typical daily roles and basic responsibilities of someone working in {clean_domain}?",
                f"[{clean_domain}] What standard tools, software, or foundational libraries are most popular in {clean_domain}?",
                f"[{clean_domain}] What are the essential basic skills required to get started effectively in {clean_domain}?",
                f"[{clean_domain}] How is a basic workflow or assignment structured from beginning to end in {clean_domain}?"
            ],
            'simple_examples': [
                f"[{clean_domain}] Can you share a simple, practical example of a beginner project or task in {clean_domain}?",
                f"[{clean_domain}] Walk through a straightforward real-life use case where {clean_domain} provides immediate value.",
                f"[{clean_domain}] Describe a basic task you completed in {clean_domain} and how you walked through it step by step.",
                f"[{clean_domain}] Can you give a simple analogy explaining how a key concept in {clean_domain} works to a newcomer?"
            ],
            'intro_problem_solving': [
                f"[{clean_domain}] When facing a simple, common error or basic hurdle in {clean_domain}, what is your approach to solve it?",
                f"[{clean_domain}] How do you verify that your basic work or output in {clean_domain} is correct and ready for review?",
                f"[{clean_domain}] What basic checklist do you follow to avoid simple mistakes when starting in {clean_domain}?",
                f"[{clean_domain}] Where do you look for documentation, guidance, or help when troubleshooting basic problems in {clean_domain}?"
            ],
            'role_basics': [
                f"[{clean_domain}] What introductory best practices do you follow to keep your work organized in {clean_domain}?",
                f"[{clean_domain}] How do you communicate basic project updates or simple status reports to your team in {clean_domain}?",
                f"[{clean_domain}] What basic quality standards or checks do you apply to straightforward deliverables in {clean_domain}?",
                f"[{clean_domain}] How do you continue learning and strengthening your foundational skills in {clean_domain}?"
            ]
        }
        if any(k in d_lower for k in ['sale', 'real estate', 'realstate', 'broker', 'property', 'b2b']):
            domain_pools['sales_easy'] = [
                f"[{clean_domain}] What is a sales pipeline in {clean_domain}, and what are its basic stages?",
                f"[{clean_domain}] Can you give a simple practical example of introducing a product/property to a new client in {clean_domain}?",
                f"[{clean_domain}] How do you respond to a simple customer question or initial price inquiry in {clean_domain}?",
                f"[{clean_domain}] What basic information do you collect from a prospect during a first introductory call in {clean_domain}?"
            ]
        if any(k in d_lower for k in ['it', 'python', 'tech', 'software', 'cloud', 'data', 'engineer']):
            domain_pools['tech_easy'] = [
                f"[{clean_domain}] What are the fundamental data types, syntax rules, or basic concepts you use daily in {clean_domain}?",
                f"[{clean_domain}] Can you explain how you write a basic function, script, or query in {clean_domain}?",
                f"[{clean_domain}] How do you test a simple code snippet or run a basic program locally in {clean_domain}?",
                f"[{clean_domain}] What is the difference between basic debugging and unit testing in {clean_domain}?"
            ]

    elif diff == "hard":
        domain_pools = {
            'deep_domain': [
                f"[{clean_domain}] Can you dissect the most advanced theoretical or operational mechanisms governing {clean_domain}?",
                f"[{clean_domain}] What subtle, non-obvious nuances in {clean_domain} separate seasoned principals from intermediate practitioners?",
                f"[{clean_domain}] How do you evaluate and implement cutting-edge paradigms or disruptive architectural patterns in {clean_domain}?",
                f"[{clean_domain}] What rigorous analytical models do you use to forecast multi-year trajectory and high-order effects in {clean_domain}?"
            ],
            'complex_scenarios': [
                f"[{clean_domain}] Walk through the most complex, high-stakes scenario you managed in {clean_domain} under severe constraints.",
                f"[{clean_domain}] How would you handle a critical multi-million dollar breakdown or catastrophic technical regression in {clean_domain}?",
                f"[{clean_domain}] Describe a scenario in {clean_domain} where competing executive stakeholders had opposing demands. How did you resolve it?",
                f"[{clean_domain}] What crisis escalation and disaster recovery protocols do you deploy when third-party core dependencies collapse in {clean_domain}?"
            ],
            'optimization_tradeoffs': [
                f"[{clean_domain}] What extreme optimizations did you engineer in {clean_domain} to squeeze maximum throughput or margin efficiency?",
                f"[{clean_domain}] Walk through the hardest trade-off you navigated in {clean_domain} between latency, reliability, consistency, and cost.",
                f"[{clean_domain}] If operations in {clean_domain} suddenly had to scale 100x with zero budget expansion, what would you re-architect?",
                f"[{clean_domain}] How do you diagnose and eliminate sub-millisecond bottlenecks or micro-inefficiencies across pipelines in {clean_domain}?"
            ],
            'edge_cases': [
                f"[{clean_domain}] Describe an insidious edge case, race condition, or subtle compliance vulnerability you discovered in {clean_domain}.",
                f"[{clean_domain}] How do you bulletproof systems and playbooks in {clean_domain} against extreme black swan anomalies?",
                f"[{clean_domain}] Walk through your methodology for stress-testing and chaos-engineering high-concurrency flows in {clean_domain}.",
                f"[{clean_domain}] What defensive architecture prevents catastrophic cascading failures across interconnected layers in {clean_domain}?"
            ],
            'architecture_leadership': [
                f"[{clean_domain}] How do you design an enterprise-scale, resilient system architecture or operational blueprint from scratch for {clean_domain}?",
                f"[{clean_domain}] What zero-trust security postures, cryptographic protections, or strict governance guardrails do you mandate in {clean_domain}?",
                f"[{clean_domain}] How do you lead cross-disciplinary elite teams through complex technical transformations in {clean_domain}?",
                f"[{clean_domain}] What quantitative post-mortem frameworks do you conduct following high-stakes outages or deal losses in {clean_domain}?"
            ]
        }
        if any(k in d_lower for k in ['sale', 'real estate', 'realstate', 'broker', 'property', 'b2b']):
            domain_pools['sales_hard'] = [
                f"[{clean_domain}] Walk through your negotiation and closing strategy for an eight-figure enterprise or high-value portfolio transaction in {clean_domain}.",
                f"[{clean_domain}] How do you structure multi-party commercial contracts, clawback clauses, and risk-hedging covenants in {clean_domain}?",
                f"[{clean_domain}] When macroeconomic headwinds freeze market liquidity, what contrarian repositioning do you execute in {clean_domain}?",
                f"[{clean_domain}] How do you conduct high-stakes due diligence to uncover buried liabilities or off-balance-sheet encumbrances in {clean_domain}?"
            ]
        if any(k in d_lower for k in ['it', 'python', 'tech', 'software', 'cloud', 'data', 'engineer']):
            domain_pools['tech_hard'] = [
                f"[{clean_domain}] How do you diagnose and resolve distributed deadlocks, GIL contention, or async event loop starvation in {clean_domain}?",
                f"[{clean_domain}] Walk through the system architecture for an ultra-low latency, distributed real-time processing engine built for {clean_domain}.",
                f"[{clean_domain}] How do you guarantee sub-second p99 response times and zero-downtime database sharding under extreme write concurrency in {clean_domain}?",
                f"[{clean_domain}] What kernel-level or bytecode profiling tools do you use to optimize memory overhead and cache locality in {clean_domain}?"
            ]

    else:  # medium (default)
        domain_pools = {
            'strategy': [
                f"[{clean_domain}] Can you walk through your strategic methodology for analyzing requirements and opportunities in {clean_domain}?",
                f"[{clean_domain}] When stepping into a new client, system, or project scope in {clean_domain}, what discovery framework do you execute?",
                f"[{clean_domain}] How do you align short-term tactical milestones with long-term strategic value when operating within {clean_domain}?",
                f"[{clean_domain}] What core competitive advantages or value propositions do you emphasize in {clean_domain}?"
            ],
            'execution': [
                f"[{clean_domain}] Describe a practical deal, technical milestone, or critical project you executed in {clean_domain} from discovery to completion.",
                f"[{clean_domain}] What daily tools, operational platforms, or analytical workflows do you rely on most heavily to drive execution in {clean_domain}?",
                f"[{clean_domain}] How do you adjust your execution strategy in {clean_domain} when handling enterprise vs mid-market requirements?",
                f"[{clean_domain}] What is your standard operating procedure for validating deliverables or qualifying prospects in {clean_domain}?"
            ],
            'challenges': [
                f"[{clean_domain}] What was a difficult bottleneck, objection, or technical hurdle you encountered in {clean_domain}, and how did you resolve it?",
                f"[{clean_domain}] Share an example in {clean_domain} where an initiative was at risk of failing or missing targets. What corrective actions did you take?",
                f"[{clean_domain}] How do you handle sudden market shifts, technical regressions, or pushback from clients in {clean_domain}?",
                f"[{clean_domain}] Walk through an unexpected edge-case or challenge you diagnosed and stabilized while working in {clean_domain}."
            ],
            'metrics': [
                f"[{clean_domain}] What key performance indicators (KPIs), conversion benchmarks, or efficiency metrics do you track in {clean_domain}?",
                f"[{clean_domain}] How do you quantitatively report progress, ROI, and resource utilization in {clean_domain} to leadership?",
                f"[{clean_domain}] What data sources or reporting dashboards do you leverage for predictive forecasting and decision-making in {clean_domain}?",
                f"[{clean_domain}] When performance metrics dip below expected thresholds in {clean_domain}, what diagnostic steps do you execute first?"
            ],
            'stakeholders': [
                f"[{clean_domain}] How do you build trust, negotiate favorable terms, and maintain alignment with demanding partners or clients in {clean_domain}?",
                f"[{clean_domain}] Describe a situation in {clean_domain} where you navigated conflicting priorities between cross-functional teams.",
                f"[{clean_domain}] How do you tailor complex presentations in {clean_domain} so they resonate with both executive decision-makers and operational teams?",
                f"[{clean_domain}] What is your strategy for reviving stalled negotiations or disengaged project partners in {clean_domain}?"
            ],
            'optimization': [
                f"[{clean_domain}] What process optimization, automation, or re-architecture did you introduce in {clean_domain} that cut cycle time or cost?",
                f"[{clean_domain}] How do you balance rapid turnaround times against rigorous quality assurance when under tight deadlines in {clean_domain}?",
                f"[{clean_domain}] How do you conduct retrospective reviews after completing initiatives in {clean_domain}?",
                f"[{clean_domain}] What emerging industry trends or AI advancements are you leveraging within {clean_domain}?"
            ]
        }
        if any(k in d_lower for k in ['sale', 'real estate', 'realstate', 'broker', 'property', 'b2b']):
            domain_pools['sales_med'] = [
                f"[{clean_domain}] How do you build and maintain a qualified sales pipeline in {clean_domain}, and what is your average lead-to-close cycle?",
                f"[{clean_domain}] Walk through how you handle price resistance or budget pushback from prospective buyers in {clean_domain}.",
                f"[{clean_domain}] What multi-touch outbound prospecting sequence has proven most effective for you in {clean_domain}?",
                f"[{clean_domain}] How do you accurately forecast quarterly revenue and deal closing dates in {clean_domain}?"
            ]
        if any(k in d_lower for k in ['it', 'python', 'tech', 'software', 'cloud', 'data', 'engineer']):
            domain_pools['tech_med'] = [
                f"[{clean_domain}] What architectural design principles and clean code practices do you enforce when building systems in {clean_domain}?",
                f"[{clean_domain}] How do you diagnose and resolve complex memory leaks, latency bottlenecks, or asynchronous concurrency issues in {clean_domain}?",
                f"[{clean_domain}] How do you design automated testing (unit/integration) and CI/CD deployment pipelines tailored for {clean_domain}?",
                f"[{clean_domain}] What libraries, frameworks, or database abstractions do you find most reliable when scaling solutions in {clean_domain}?"
            ]

    target_count = max(10, min(15, count))
    all_templates = [tmpl for pool in domain_pools.values() for tmpl in pool]
    random.shuffle(all_templates)

    questions = []
    for tmpl in all_templates:
        clean_q = re.sub(r'^\[[^\]]+\]\s*', '', tmpl).strip()
        if clean_q not in questions:
            questions.append(clean_q)
        if len(questions) >= target_count:
            break

    return questions

@router.post("/generate-questions")
def generate_project_questions_endpoint(req: GenerateProjectQuestionsRequest):
    """
    Extracts projects from uploaded resume or project documentation,
    or generates 10-15 questions directly from a manually typed domain.
    Supports difficulty: Easy, Medium, Hard.
    Uses def (synchronous) so FastAPI offloads to its native threadpool per GEMINI.md rules.
    """
    import random
    import time

    domain = (req.domain or "").strip()
    difficulty = (req.difficulty or "medium").strip().lower()
    if difficulty not in ["easy", "medium", "hard"]:
        difficulty = "medium"

    # Difficulty prompts based on user specifications
    difficulty_prompts = {
        "easy": """### STRICT DIFFICULTY LEVEL: EASY (Beginner-Level)
Generate 10-15 beginner-level questions focusing on:
- Fundamental concepts and definitions.
- Basic domain knowledge.
- Simple practical examples.
- Introductory problem-solving.
- Basic technical concepts or straightforward role-related questions.
Keep the questions clear, accessible, and focused on core foundations.""",
        "medium": """### STRICT DIFFICULTY LEVEL: MEDIUM (Intermediate-Level)
Generate 10-15 intermediate-level questions focusing on:
- Practical application of concepts.
- Technical understanding and reasoning.
- Troubleshooting and real-world scenarios.
- Moderate analytical or coding problems where relevant.
- Explaining approaches and decisions.
Test practical execution, problem diagnosis, and rationale behind decisions.""",
        "hard": """### STRICT DIFFICULTY LEVEL: HARD (Advanced-Level)
Generate 10-15 advanced-level questions focusing on:
- In-depth domain knowledge.
- Complex technical or professional scenarios.
- Advanced problem-solving and analytical reasoning.
- Optimization, edge cases, and trade-offs.
- Advanced coding, architecture, or system design when relevant to the selected role.
Probe deep architecture, extreme scale, performance optimization, critical failure modes, and architectural trade-offs."""
    }
    diff_directive = difficulty_prompts[difficulty]

    # ── CASE 1: DOMAIN-BASED QUESTION GENERATION (10-15 questions) ──
    if domain:
        target_count = max(10, min(15, req.num_questions or 12))
        variation_seed = random.randint(10000, 99999)
        timestamp_seed = int(time.time() * 1000) % 10000

        prompt = f"""
You are an Elite Principal Interviewer and Senior Subject Matter Expert in the domain: '{domain}'.
Formulate {target_count} questions specifically assessing a candidate in '{domain}' at the following difficulty level.

{diff_directive}

CRITICAL REQUIREMENTS (Seed: {variation_seed}-{timestamp_seed}):
1. TOTAL QUESTIONS: Generate EXACTLY {target_count} distinct questions (between 10 and 15 questions).
2. DYNAMIC VARIATION:
   EVERY TIME you generate questions, formulate DIFFERENT, FRESH, VARIED QUESTIONS!
3. NO PREFIXES OR BRACKETS:
   Start each question naturally with the question sentence (e.g. "How do you...", "Can you explain...", "What strategy...").
   Do NOT prefix the question with brackets, domain tags, or domain labels like [{domain}].

Return STRICT JSON format:
{{
    "domain": "{domain}",
    "difficulty": "{difficulty}",
    "questions": [
        "Question 1...",
        "Question 2...",
        "Question 3..."
    ]
}}
"""
        try:
            raw = chat_completion(
                messages=[
                    {"role": "system", "content": f"You are a Senior Subject Matter Expert generating dynamic {difficulty.upper()}-level interview questions for '{domain}'. Return strict JSON only without any bracketed tags or prefixes."},
                    {"role": "user", "content": prompt}
                ],
                model="openai/gpt-4o-mini",
                temperature=random.uniform(0.7, 0.85)
            )
            data = extract_json(raw) or {}
            generated = data.get("questions", [])
            if isinstance(generated, list) and len(generated) >= 8:
                def _sanitize_project_q(text: str) -> str:
                    t = re.sub(r'^\[[^\]]+\]\s*', '', str(text))
                    t = re.sub(r'\\x[0-9a-fA-F]{2}', '', t)
                    t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\uf000-\uf8ff]', '', t)
                    t = re.sub(r"'\s+([^']+?)\s*'", r"'\1'", t)
                    t = re.sub(r'"\s+([^"]+?)\s*"', r'"\1"', t)
                    t = re.sub(r'\s{2,}', ' ', t)
                    return t.strip()
                clean_qs = [_sanitize_project_q(q) for q in generated if str(q).strip()]
                if clean_qs:
                    return {
                        "questions": clean_qs,
                        "domain": domain,
                        "difficulty": difficulty,
                        "total_questions": len(clean_qs),
                        "source": "ai_dynamic"
                    }
        except Exception as e:
            print(f"Error calling AI for domain questions: {e}")

        fallback_qs = build_offline_domain_questions(domain, count=target_count, difficulty=difficulty)
        return {
            "questions": fallback_qs,
            "domain": domain,
            "difficulty": difficulty,
            "total_questions": len(fallback_qs),
            "source": "dynamic_fallback"
        }

    # ── CASE 2: RESUME / PROJECT DOCUMENT QUESTION GENERATION ──
    resume_text = (req.resume_text or "").strip()
    project_text = (req.project_text or "").strip()
    
    raw_text = resume_text if resume_text else project_text
    if not raw_text:
        raise HTTPException(status_code=400, detail="domain, resume_text, or project_text is required")

    projects = parse_projects_from_text(raw_text)
    num_projects = len(projects)

    # Number of questions per project (between 5 and 10, default 7)
    q_per_proj = max(5, min(10, req.num_questions_per_project or 7))

    variation_seed = random.randint(10000, 99999)
    timestamp_seed = int(time.time() * 1000) % 10000

    detected_titles = [p['title'] for p in projects]
    detected_titles_str = ', '.join(detected_titles)
    min_total = max(5, num_projects * 5)
    max_total = max(10, num_projects * 10)
    total_target_questions = num_projects * q_per_proj

    project_allocations = "\n".join([
        f"   - Project {idx+1}: '{p['title']}' ({p.get('tech', 'Tech Stack')}) -> Generate exactly {q_per_proj} questions (between 5 and 10 questions) specifically covering its architecture, trade-offs, debugging, and implementation."
        for idx, p in enumerate(projects)
    ])

    prompt = f"""
You are an Elite Principal Technical Architect and Senior Interviewer.
The candidate has provided a resume/document containing technical work and projects:

--- CANDIDATE RESUME / PROJECT CONTENT ---
{raw_text[:7000]}
------------------------------------------

KEY PROJECT(S) IDENTIFIED ({num_projects} project(s)):
{detected_titles_str}

{diff_directive}

CRITICAL QUESTION FORMATION & VARIATION DIRECTIVE (Seed: {variation_seed}-{timestamp_seed}):
1. NATURAL, PROFESSIONAL QUESTION FORMATION:
   - Formulate questions naturally and professionally, as an expert technical interviewer would ask in an interview.
   - DO NOT robotically repeat "In the '<Project>' project..." at the start of every question.
   - NEVER treat bullet points, metrics, or sentences like "Achieved 92% validation accuracy" as project names.
   - Start questions with natural conversational openings (e.g., "Can you walk through...", "How did you design...", "When building {detected_titles[0] if detected_titles else 'your project'}, how did you...", "What trade-offs did you evaluate between...").
   - Deeply examine implementation details, tools used, validation strategies, edge cases, and architectural decisions.
2. DIFFICULTY-ALIGNED COVERAGE ({difficulty.upper()}):
   - Easy: beginner-friendly, core foundations, simple examples, introductory troubleshooting, architecture overview.
   - Medium: real-world application, trade-offs, practical debugging, component interactions.
   - Hard: deep scalability, edge cases, failure recovery, performance bottlenecks, production optimization.
3. MANDATORY PER-PROJECT ALLOCATION & QUESTION COUNT:
   - You MUST generate questions across ALL {num_projects} detected projects ({min_total} to {max_total} total questions, TARGET: EXACTLY {total_target_questions} questions: {q_per_proj} questions per project).
   - Expected project distribution:
{project_allocations}
   - STRICT CONSTRAINT: Do NOT generate questions for only one project! You MUST distribute questions across all {num_projects} projects so each project gets approximately {q_per_proj} questions:
     * If 1 project is detected: generate 5 to 10 questions (target: ~7 questions).
     * If 2 projects are detected: generate 10 to 20 questions (target: ~14 questions: ~7 for Project 1, ~7 for Project 2).
     * If 3 projects are detected: generate 15 to 30 questions (target: ~21 questions: ~7 for Project 1, ~7 for Project 2, ~7 for Project 3).
     * If 4 projects are detected: generate 20 to 40 questions (target: ~28 questions: ~7 for each project).
   - EVERY TIME you generate questions, formulate DIFFERENT, FRESH, VARIED QUESTIONS!
4. NO BRACKET PREFIXES:
   - Do NOT prefix any question with bracketed labels like [{detected_titles[0] if detected_titles else 'Project'}].

Return STRICT JSON format:
{{
    "detected_projects": {detected_titles},
    "difficulty": "{difficulty}",
    "questions": [
        "Question 1...",
        "Question 2..."
    ]
}}
"""
    try:
        raw = chat_completion(
            messages=[
                {"role": "system", "content": f"You are a Principal Architect generating dynamic {difficulty.upper()}-level interview questions tailored to candidate resume projects. Return strict JSON only without any bracketed tags or prefixes."},
                {"role": "user", "content": prompt}
            ],
            model="openai/gpt-4o-mini",
            temperature=random.uniform(0.7, 0.85)
        )
        data = extract_json(raw) or {}
        generated = data.get("questions", [])
        if isinstance(generated, list) and len(generated) >= max(3, num_projects * 4):
            clean_qs = [sanitize_project_question(q) for q in generated if str(q).strip()]
            clean_qs = [q for q in clean_qs if q and len(q) > 10]
            if clean_qs:
                return {
                    "questions": clean_qs, 
                    "projects_count": num_projects,
                    "difficulty": difficulty,
                    "detected_projects": [format_project_title(t) for t in data.get("detected_projects", detected_titles) if '%' not in t],
                    "source": "ai_dynamic"
                }
    except Exception as e:
        print(f"Error calling AI for project questions: {e}")

    fallback_qs = build_offline_project_questions(projects, q_per_proj=q_per_proj, difficulty=difficulty)
    fallback_qs = [sanitize_project_question(q) for q in fallback_qs]
    fallback_qs = [q for q in fallback_qs if q and len(q) > 10]
    return {
        "questions": fallback_qs, 
        "projects_count": num_projects,
        "difficulty": difficulty,
        "detected_projects": detected_titles,
        "source": "dynamic_fallback"
    }

@router.post("/")
async def create_project(project: ProjectCreate):
    project_id = str(uuid.uuid4())
    doc = project.dict()
    doc["project_id"] = project_id
    await projects_collection.insert_one(doc)
    doc["_id"] = str(doc["_id"])
    return doc

@router.get("/")
async def get_projects():
    projects = await projects_collection.find().to_list(None)
    for p in projects:
        p["_id"] = str(p["_id"])
    return projects
