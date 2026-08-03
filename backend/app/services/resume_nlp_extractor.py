"""
app/services/resume_nlp_extractor.py
------------------------------------
Production-grade multi-tier NLP and AI Resume Extraction Engine.
Extracts candidate information:
- Full Name
- Email Address
- Mobile / Phone Number
- Total Experience (e.g., '3 Years', 'Fresher (2025 Grad)')
- Current / Recent Company (e.g., 'Google', 'Freelance', 'Student / Fresher')
- Current CTC (e.g., '6 LPA', 'Not specified in resume')
- Expected CTC (e.g., '10 LPA', 'Negotiable / Open')
- Notice Period (e.g., 'Immediate', '30 Days', 'Immediate / Open')
- Location (e.g., 'Hyderabad, India', 'Bengaluru, India')
- Key Skills and Summary

Operates with dual architecture:
1. Layer 1: Fast & Intelligent LLM / NLP semantic extraction (OpenRouter / HuggingFace).
2. Layer 2: Ultra-robust deterministic NLP heuristics, regex, section parsing, and date calculation (100% offline fallback).
"""

from __future__ import annotations
import re
import json
from datetime import datetime
from typing import Dict, Any, Optional, List

# Common Indian & Global Tech Cities for accurate location extraction
TECH_CITIES = [
    # India
    "Hyderabad", "Bengaluru", "Bangalore", "Pune", "Mumbai", "Delhi", "New Delhi",
    "Noida", "Gurgaon", "Gurugram", "Chennai", "Kolkata", "Ahmedabad", "Jaipur",
    "Kochi", "Cochin", "Thiruvananthapuram", "Trivandrum", "Chandigarh", "Coimbatore",
    "Indore", "Nagpur", "Bhopal", "Visakhapatnam", "Vizag", "Bhubaneswar", "Mysore",
    "Mangalore", "Surat", "Vadodara", "Lucknow", "Secunderabad", "Telangana", "Karnataka",
    "Maharashtra", "Tamil Nadu", "Andhra Pradesh", "Kerala", "Gujarat", "Uttar Pradesh",
    # Global
    "San Francisco", "New York", "Seattle", "Austin", "Boston", "Chicago", "Los Angeles",
    "San Jose", "Sunnyvale", "Mountain View", "London", "Toronto", "Vancouver", "Waterloo",
    "Dubai", "Abu Dhabi", "Singapore", "Berlin", "Munich", "Amsterdam", "Dublin",
    "Sydney", "Melbourne", "Tokyo", "Hong Kong", "Remote", "India", "USA", "UK", "UAE"
]

COMMON_ROLES = [
    "software engineer", "developer", "backend developer", "frontend developer",
    "full stack developer", "data scientist", "machine learning engineer", "ai engineer",
    "devops engineer", "cloud architect", "product manager", "qa engineer", "data analyst",
    "intern", "software intern", "research assistant", "graduate trainee"
]


# Invalid company keywords / section titles / skills / verbs to reject false positives
INVALID_COMPANY_KEYWORDS = {
    # Section titles
    "technical", "technical skills", "skills", "key skills", "core competencies",
    "technologies", "tools", "frameworks", "libraries", "summary", "professional summary",
    "profile", "profile summary", "objective", "career objective", "education", "academic",
    "academics", "academic background", "academic projects", "projects", "personal projects",
    "work experience", "experience", "employment history", "work history", "certifications",
    "certificates", "achievements", "awards", "languages", "hobbies", "interests",
    "declaration", "curriculum vitae", "resume", "contact", "responsibilities",
    "strengths", "coursework", "activities", "extracurricular", "publications", "references",
    "school", "college", "university", "institute", "journal", "paper", "secondary", "higher secondary",
    
    # Technical buzzwords & skills
    "api", "apis", "database", "databases", "sql", "nosql", "python", "java", "c++", "c#",
    "javascript", "typescript", "react", "react.js", "angular", "vue", "node", "node.js",
    "express", "express.js", "django", "flask", "fastapi", "spring", "spring boot",
    "html", "css", "html/css", "tailwind", "bootstrap", "aws", "azure", "gcp",
    "docker", "kubernetes", "git", "github", "gitlab", "bitbucket",
    "machine learning", "deep learning", "ai/ml", "nlp", "computer vision",
    "tensorflow", "pytorch", "keras", "pandas", "numpy", "scipy", "scikit-learn", "scikit",
    "tableau", "power bi", "looker", "mongodb", "postgresql", "postgres", "mysql", "sqlite",
    "rest", "restful", "rest api", "rest apis", "graphql", "microservices", "data science",
    "data analyst", "data analytics", "data structures", "algorithms", "dsa", "oop",
    "oops", "object oriented programming", "frontend", "backend", "full stack", "fullstack",
    "cloud computing", "devops", "ci/cd", "agile", "scrum", "jira", "linux", "unix", "windows",
    "recommendation", "pipeline", "pipelines", "feature", "features", "dataset", "datasets",
    "model", "models", "accuracy", "testing", "performance", "scalable", "deployment",
    "techniques", "technique", "system architecture", "web application", "applications",
    
    # Generic filler / verbs
    "developing", "developed", "building", "built", "working", "worked", "created", "creating",
    "designing", "designed", "managing", "managed", "experienced", "experience in", "hands-on",
    "knowledge of", "proficient in", "understanding of", "eager to", "seeking", "motivated",
    "collaborating", "supporting", "contributing", "implemented", "implementing", "spearheaded",
    "gaining", "demonstrating", "built and", "opportunities", "participated", "published",
    "software solutions", "applications", "systems", "solutions", "technology", "technologies",
    "to improve", "improve", "improved", "improving"
}

KNOWN_TECH_COMPANIES = [
    "Google", "Microsoft", "Amazon", "Apple", "Meta", "Facebook", "Netflix", "Oracle",
    "Cisco", "IBM", "Intel", "Adobe", "Salesforce", "Uber", "Twitter", "X Corp",
    "TCS", "Tata Consultancy Services", "Infosys", "Wipro", "HCL", "HCLTech", "Tech Mahindra",
    "Cognizant", "Capgemini", "Accenture", "Deloitte", "PwC", "EY", "Ernst & Young", "KPMG",
    "Arah Infotech", "Samsung", "Qualcomm", "Nvidia", "AMD", "PayPal", "Stripe", "Square",
    "Airbnb", "Spotify", "Snapchat", "LinkedIn", "Zomato", "Swiggy", "Paytm", "Flipkart",
    "PhonePe", "CRED", "Razorpay", "Ola", "Jio", "Reliance Jio", "Airtel", "Zoho", "Freshworks",
    "Postman", "BrowserStack", "Zerodha", "Groww", "PolicyBazaar", "Urban Company", "MakeMyTrip"
]

COMPANY_SUFFIXES = [
    "pvt ltd", "pvt. ltd.", "pvt. ltd", "private limited", "ltd", "ltd.", "inc", "inc.",
    "llc", "corp", "corporation", "technologies", "technology", "tech", "infotech",
    "solutions", "software", "systems", "services", "labs", "consulting", "enterprises",
    "digital", "studio", "networks", "holdings", "group", "ventures", "global"
]


def is_valid_company_name(cand: Any) -> bool:
    """Check if a string represents a legitimate company name rather than a false positive."""
    if not cand or not isinstance(cand, str):
        return False
    s = cand.strip().strip(' ,.-|•:;\n\r\t')
    if not s or len(s) < 2 or len(s) > 50:
        return False

    s_lower = s.lower()
    if s_lower in INVALID_COMPANY_KEYWORDS:
        return False

    if any(frag in s_lower for frag in [
        ", and ", " and database", " and tools", " with ", " using ", " through ",
        " eager to ", " experienced in ", " hands-on ", " gaining ", " demonstrating ",
        " built and ", " which provides ", " opportunities for ", " to improve "
    ]):
        return False

    words = [w.strip(" ,.-|•:;()[]{}") for w in s_lower.split() if w.strip(" ,.-|•:;()[]{}")]
    if not words or len(words) > 5:
        return False

    # Block if contains explicit technical / skill keywords
    bad_tokens = ["apis", "api", "database", "databases", "sql", "python", "html", "css", "techniques", "recommendation", "school", "journal"]
    if any(w in words for w in bad_tokens):
        return False

    if all(w in INVALID_COMPANY_KEYWORDS for w in words):
        return False

    bad_starters = [
        "developing", "developed", "building", "built", "working", "worked", "created",
        "designing", "designed", "experienced", "motivated", "eager", "seeking",
        "proficient", "strong", "knowledge", "technical", "academic", "personal",
        "gaining", "demonstrating", "which", "built", "built and", "techniques"
    ]
    if words[0] in bad_starters:
        return False

    for kc in KNOWN_TECH_COMPANIES:
        if kc.lower() == s_lower or kc.lower() in s_lower:
            return True

    for suf in COMPANY_SUFFIXES:
        if s_lower.endswith(suf) or f" {suf}" in s_lower:
            return True

    if len(words) == 1:
        if words[0] in INVALID_COMPANY_KEYWORDS or len(words[0]) < 3:
            return False
        if re.match(r'^[A-Z][A-Za-z0-9]{2,}$', s):
            return True
        return False

    return True


def _clean_company_string(s: str) -> str:
    """Strip dates, noise, and trailing symbols from candidate company string."""
    if not s:
        return ""
    s = s.split('\n')[0].strip()
    s = re.sub(r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|20\d\d|Present|Current|\(\d{4}\)).*$', '', s, flags=re.IGNORECASE).strip(' ,.-|:;')
    s = re.sub(r'\b(?:Intern|Internship|Trainee|Graduate Trainee)\b', '', s, flags=re.IGNORECASE).strip(' ,.-|:;')
    return s.strip()


def extract_company_robust(text: str, experience: str = "", grad_year: int = None, institute_name: str = "") -> str:
    """Robust multi-pattern company extractor with strict validation."""
    normalized_text = re.sub(r'[\uFFFD\u2013\u2014\u2015\u2022]', ' - ', text)
    current_year = datetime.now().year

    # 1. Explicit Key-Value matches
    comp_explicit = re.search(r'(?:Current\s*Company|Present\s*Company|Company\s*Name|Employer|Organization|Client|Employed\s*At)[:\s]+([A-Z0-9][^\n\r,•|]{2,40})', normalized_text, re.IGNORECASE)
    if comp_explicit:
        cand = _clean_company_string(comp_explicit.group(1))
        if is_valid_company_name(cand):
            return cand

    # 2. Known company exact match with employment context
    for comp in KNOWN_TECH_COMPANIES:
        patt = rf'\b(?:at|@|with|in|for|joined)\s+({re.escape(comp)}(?:\s+(?:Pvt\s*Ltd|Private\s*Limited|Technologies|Solutions|Limited|Inc))?)\b'
        m = re.search(patt, normalized_text, re.IGNORECASE)
        if m:
            cand = _clean_company_string(m.group(1))
            if is_valid_company_name(cand):
                return cand

    # 3. Work Experience / Employment History block (strictly delimited)
    work_sec_match = re.search(
        r'(?:Work Experience|Employment History|Professional Experience|Work History)'
        r'([\s\S]{1,1200}?)'
        r'(?:Education|Academic Background|Qualifications|Projects|Academic Projects|Personal Projects|Skills|Technical Skills|Certifications|Declaration|$)',
        normalized_text,
        re.IGNORECASE
    )
    if work_sec_match:
        sec_text = work_sec_match.group(1).strip()
        lines = [l.strip() for l in sec_text.split('\n') if l.strip()]
        for line in lines[:8]:
            if re.search(r'^\d{4}|^(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)', line):
                continue
            
            role_comp_match = re.search(r'(?:Software Engineer|Developer|Backend Developer|Frontend Developer|Full Stack Developer|Data Scientist|ML Engineer|Data Analyst|QA Engineer|Associate|Consultant|Intern|Software Engineering Intern)\s+(?:at|@|with|,|-|–)\s*([A-Za-z0-9\s&.,\'-]{2,35})', line, re.IGNORECASE)
            if role_comp_match:
                cand = _clean_company_string(role_comp_match.group(1))
                if is_valid_company_name(cand):
                    return cand

            for suf in COMPANY_SUFFIXES:
                if suf in line.lower():
                    cand = _clean_company_string(line)
                    if len(cand) <= 45 and is_valid_company_name(cand):
                        return cand

    # 4. Check for Internship mentions strictly with word boundaries
    intern_match = re.search(r'\b(?:Internship|Intern)\s*(?:at|@|-|–|,|:)\s*([A-Za-z0-9\s&.,\'-]{2,35})', normalized_text, re.IGNORECASE)
    if intern_match:
        cand = _clean_company_string(intern_match.group(1))
        if is_valid_company_name(cand):
            return f"{cand} (Internship)"

    # 5. Fallback based on experience & graduation year
    is_fresher = (
        "fresher" in experience.lower() or
        "0 years" in experience.lower() or
        "0-1 years" in experience.lower() or
        (grad_year and grad_year >= current_year) or
        bool(re.search(r'\b(fresher|student|undergraduate|recent graduate|b\.tech|m\.tech|bca|mca)\b', normalized_text, re.IGNORECASE))
    )

    if is_fresher:
        return "Fresher"
    
    return "Not specified"


def _clean_str(val: Any, default: str = "") -> str:
    """Helper to ensure clean, non-null string value."""
    if val is None:
        return default
    s = str(val).strip()
    if s.lower() in ["", "none", "null", "undefined"]:
        return default
    return s


def extract_info_offline(text: str) -> Dict[str, Any]:
    """
    High-accuracy deterministic NLP & Regex extractor.
    Extracts all fields with zero external API dependencies.
    """
    if not text:
        return {
            "name": "", "email": "", "phone": "", "experience": "Fresher",
            "current_company": "Fresher", "current_ctc": "Not specified in resume",
            "expected_ctc": "Negotiable / Open", "notice_period": "Immediate / Open",
            "location": "Not specified", "linkedin_url": "", "github_url": "", "skills": []
        }

    raw_text = text
    # Normalize unicode replacement characters and odd spaces
    normalized_text = re.sub(r'[\uFFFD\u2013\u2014\u2015\u2022]', ' - ', raw_text)
    lines = [line.strip() for line in normalized_text.split('\n') if line.strip()]
    first_15_lines = lines[:15]
    first_1000_chars = normalized_text[:1000]

    # 1. EMAIL EXTRACTION
    email = ""
    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', raw_text)
    if email_match:
        email = email_match.group(0).strip()

    # 2. PHONE / MOBILE EXTRACTION
    phone = ""
    phone_patterns = [
        r'(?:Phone|Mobile|Contact|Tel|WhatsApp)?[:\s]*(\+?\d{1,4}[-.\s]?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{3,5})',
        r'(\+91[-.\s]?\d{5}[-.\s]?\d{5})',
        r'(\+91[-.\s]?\d{10})',
        r'(\b[6-9]\d{9}\b)',
        r'(\+?\d{1,3}[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})'
    ]
    for pattern in phone_patterns:
        pm = re.search(pattern, first_1000_chars, re.IGNORECASE)
        if pm:
            cand = pm.group(1).strip()
            digits = re.sub(r'\D', '', cand)
            if 10 <= len(digits) <= 15:
                phone = cand
                break

    # 3. SOCIAL / PORTFOLIO LINKS
    linkedin_url = ""
    lm = re.search(r'(https?://(?:www\.)?linkedin\.com/in/[a-zA-Z0-9_-]+|linkedin\.com/in/[a-zA-Z0-9_-]+)', raw_text, re.IGNORECASE)
    if lm:
        linkedin_url = lm.group(0).strip()
        if not linkedin_url.startswith("http"):
            linkedin_url = f"https://{linkedin_url}"

    github_url = ""
    gm = re.search(r'(https?://(?:www\.)?github\.com/[a-zA-Z0-9_-]+|github\.com/[a-zA-Z0-9_-]+)', raw_text, re.IGNORECASE)
    if gm:
        github_url = gm.group(0).strip()
        if not github_url.startswith("http"):
            github_url = f"https://{github_url}"

    # 4. LOCATION EXTRACTION
    location = ""
    loc_explicit = re.search(r'(?:Location|Address|City|Place|Current Location)[:\s]+([^\n\r,]+(?:,\s*[^\n\r,]+){0,2})', first_1000_chars, re.IGNORECASE)
    if loc_explicit:
        loc_cand = loc_explicit.group(1).strip()
        loc_cand = re.sub(r'[|\u2022\t]', '', loc_cand).strip()
        if loc_cand and len(loc_cand) < 60:
            location = loc_cand

    if not location:
        for city in TECH_CITIES:
            match = re.search(rf'\b{re.escape(city)}\b(?:,\s*([A-Za-z\s]+))?', first_1000_chars, re.IGNORECASE)
            if match:
                matched_city = city
                suffix = match.group(1)
                if suffix:
                    suffix_clean = suffix.strip().split()[0] if suffix.strip() else ""
                    if suffix_clean.lower() in ["india", "telangana", "karnataka", "maharashtra", "usa", "uk", "uae"]:
                        location = f"{matched_city}, {suffix_clean.capitalize()}"
                    else:
                        location = matched_city
                else:
                    location = matched_city
                break

    # 5. NAME EXTRACTION
    name = ""
    skip_keywords = {
        "resume", "curriculum", "vitae", "cv", "profile", "contact", "email",
        "phone", "summary", "experience", "education", "skills", "projects", "objective"
    }
    for line in first_15_lines:
        line_clean = re.sub(r'[^a-zA-Z\s]', '', line).strip()
        words = line_clean.lower().split()
        if line_clean and 2 <= len(words) <= 4 and len(line_clean) < 40:
            if not any(kw in words for kw in skip_keywords):
                if not re.search(r'@|\.com|\+?\d', line):
                    name = line.strip()
                    break

    # 6. EDUCATION & GRADUATION YEAR
    current_year = datetime.now().year
    grad_year = None
    institute_name = ""

    # Search for education block
    edu_match = re.search(r'(?:Education|Academic Background|Qualifications)([\s\S]{1,1000}?)(?:Experience|Projects|Skills|Certifications|$)', normalized_text, re.IGNORECASE)
    if edu_match:
        edu_text = edu_match.group(1)
        # Find college / university
        inst = re.search(r'([A-Za-z\s.,]{3,60}(?:Institute|University|College|Academy|School|Campus|Faculty)[A-Za-z\s]{0,25})', edu_text, re.IGNORECASE)
        if inst:
            raw_inst = inst.group(1).strip().replace('\n', ' ')
            raw_inst = re.sub(r'\s+', ' ', raw_inst)
            # Remove trailing cities or locations if attached
            for tc in TECH_CITIES:
                raw_inst = re.sub(rf'\b{re.escape(tc)}\b.*$', '', raw_inst, flags=re.IGNORECASE).strip(' ,.-')
            institute_name = raw_inst
        
        if not institute_name:
            inst_all = re.search(r'([A-Za-z\s]{3,40}(?:Institute of Technology|Institute|University|College|Academy))', normalized_text, re.IGNORECASE)
            if inst_all:
                institute_name = inst_all.group(1).strip()
        
        # Find graduation end year
        gy_match = re.search(r'(?:201\d|202\d)\s*(?:-|to|\/)\s*(202\d|203\d|Present)', edu_text, re.IGNORECASE)
        if gy_match:
            end_s = gy_match.group(1).strip()
            if end_s.isdigit():
                grad_year = int(end_s)
        elif not grad_year:
            # Look for single graduation year
            single_gy = re.findall(r'\b(202[0-9]|203[0-9])\b', edu_text)
            if single_gy:
                grad_year = max(int(y) for y in single_gy)

    # 7. EXPERIENCE DURATION & LEVEL EXTRACTION
    experience = ""
    exp_explicit = re.search(r'(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s*(?:of\s*)?experience)?', normalized_text, re.IGNORECASE)
    if exp_explicit:
        val = exp_explicit.group(1)
        experience = f"{val} Years" if float(val) != 1 else "1 Year"

    if not experience:
        if grad_year and grad_year >= current_year:
            experience = f"Fresher ({grad_year} Grad)"
        elif grad_year and grad_year == current_year - 1:
            experience = f"0-1 Years ({grad_year} Grad)"
        elif grad_year and (current_year - grad_year) > 1:
            est_years = current_year - grad_year
            experience = f"{est_years}+ Years"
        else:
            if re.search(r'\b(fresher|entry[\s-]level|recent graduate|undergraduate|student)\b', normalized_text, re.IGNORECASE):
                experience = "Fresher / Entry Level"
            else:
                experience = "1-2 Years"

    # 8. CURRENT / RECENT COMPANY EXTRACTION
    current_company = extract_company_robust(normalized_text, experience, grad_year, institute_name)

    # 9. CURRENT CTC / EXPECTED CTC / NOTICE PERIOD
    current_ctc = "Not specified in resume"
    expected_ctc = "Negotiable / Open"
    notice_period = "Immediate / Open"

    ctc_match = re.search(r'(?:Current\s*CTC|Present\s*CTC|Current\s*Salary)[:\s]*([0-9.]+\s*(?:LPA|Lacs|Lakhs|INR|USD|\$|k))', normalized_text, re.IGNORECASE)
    if ctc_match:
        current_ctc = ctc_match.group(1).strip()

    ectc_match = re.search(r'(?:Expected\s*CTC|Expected\s*Salary|ECTC)[:\s]*([0-9.]+\s*(?:LPA|Lacs|Lakhs|INR|USD|\$|k))', normalized_text, re.IGNORECASE)
    if ectc_match:
        expected_ctc = ectc_match.group(1).strip()

    notice_match = re.search(r'(?:Notice\s*Period|Notice)[:\s]*([0-9]+\s*(?:Days?|Months?|Weeks?)|Immediate|Serving\s*Notice)', normalized_text, re.IGNORECASE)
    if notice_match:
        notice_period = notice_match.group(1).strip()
    elif "fresher" in experience.lower() or "fresher" in current_company.lower():
        notice_period = "Immediate (Fresher)"

    # 10. SKILLS EXTRACTION
    skills: List[str] = []
    skills_sec = re.search(r'(?:Skills|Technical Skills|Core Competencies|Technologies)[:\s]+([\s\S]{1,600}?)(?:Experience|Education|Projects|Certifications|$)', normalized_text, re.IGNORECASE)
    if skills_sec:
        raw_skills = skills_sec.group(1).strip()
        tokens = re.split(r'[,•|\n\t/]+', raw_skills)
        for t in tokens:
            cleaned_t = t.strip()
            if 2 <= len(cleaned_t) <= 30 and not re.search(r'[:()]', cleaned_t):
                if cleaned_t not in skills:
                    skills.append(cleaned_t)
            if len(skills) >= 12:
                break

    return {
        "name": _clean_str(name),
        "email": _clean_str(email),
        "phone": _clean_str(phone),
        "experience": _clean_str(experience, "Fresher"),
        "current_company": _clean_str(current_company, "Fresher"),
        "current_ctc": _clean_str(current_ctc, "Not specified in resume"),
        "expected_ctc": _clean_str(expected_ctc, "Negotiable / Open"),
        "notice_period": _clean_str(notice_period, "Immediate / Open"),
        "location": _clean_str(location, "Not specified"),
        "linkedin_url": _clean_str(linkedin_url),
        "github_url": _clean_str(github_url),
        "skills": skills[:12]
    }


def extract_candidate_info_nlp(text: str, model_name: str = "openai/gpt-4o-mini", timeout: float = 12.0) -> Dict[str, Any]:
    """
    Unified extraction pipeline:
    1. Computes offline regex / NLP extraction first.
    2. Calls LLM semantic extraction if available to enrich details.
    3. Merges and validates results cleanly.
    """
    if not text or not text.strip():
        return extract_info_offline("")

    # Step 1: Base offline extraction
    fallback = extract_info_offline(text)

    # Step 2: Attempt LLM extraction for higher fidelity
    try:
        from app.services.services import chat_completion
        prompt = f"""You are an expert resume parsing AI. Extract the candidate's exact profile details from this resume text.
Return STRICTLY a valid JSON object with EXACTLY these keys:
- "name": Full name of the candidate
- "email": Email address
- "phone": Phone / Mobile number (include country code if present, e.g. +91-XXXXXXXXXX)
- "experience": Total years of experience (e.g. '3 Years', 'Fresher (2025 Grad)', '5+ Years', '0-1 Years')
- "current_company": Current or most recent employer/company/organization name (e.g. 'Google', 'Infosys', 'Arah Infotech'). If candidate is a fresher or student with no corporate employment, return 'Fresher'. DO NOT return technical skills, tools, or section titles like 'TECHNICAL' or 'APIs, and database'.
- "current_ctc": Current CTC/salary if mentioned, else 'Not specified in resume'
- "expected_ctc": Expected CTC/salary if mentioned, else 'Negotiable / Open'
- "notice_period": Notice period (e.g. 'Immediate', '15 Days', '30 Days', '60 Days', 'Immediate (Fresher)')
- "location": Candidate's city and country (e.g. 'Hyderabad, India', 'Bengaluru, India', 'Remote')
- "linkedin_url": LinkedIn profile URL if present, else ''
- "github_url": GitHub profile URL if present, else ''
- "skills": Array of top 8-12 technical skills (e.g. ["Python", "FastAPI", "React", "MongoDB"])

Resume Text:
{text[:8000]}

Return valid JSON only. Do not include markdown code blocks or explanations."""

        resp = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=0.0,
            timeout=timeout
        )

        if resp:
            clean_resp = re.sub(r"```(?:json)?", "", resp).strip()
            s_idx = clean_resp.find("{")
            e_idx = clean_resp.rfind("}") + 1
            if s_idx != -1 and e_idx > s_idx:
                data = json.loads(clean_resp[s_idx:e_idx])
                
                llm_comp = _clean_str(data.get("current_company"))
                if not is_valid_company_name(llm_comp):
                    final_comp = fallback["current_company"]
                else:
                    final_comp = llm_comp

                merged = {
                    "name": _clean_str(data.get("name")) or fallback["name"],
                    "email": _clean_str(data.get("email")) or fallback["email"],
                    "phone": _clean_str(data.get("phone")) or fallback["phone"],
                    "experience": _clean_str(data.get("experience")) or fallback["experience"],
                    "current_company": final_comp,
                    "current_ctc": _clean_str(data.get("current_ctc")) or fallback["current_ctc"],
                    "expected_ctc": _clean_str(data.get("expected_ctc")) or fallback["expected_ctc"],
                    "notice_period": _clean_str(data.get("notice_period")) or fallback["notice_period"],
                    "location": _clean_str(data.get("location")) or fallback["location"],
                    "linkedin_url": _clean_str(data.get("linkedin_url")) or fallback["linkedin_url"],
                    "github_url": _clean_str(data.get("github_url")) or fallback["github_url"],
                    "skills": data.get("skills") if isinstance(data.get("skills"), list) and data.get("skills") else fallback["skills"]
                }
                return merged
    except Exception as err:
        print(f"⚠️ LLM Resume NLP parsing error ({err}), falling back to deterministic offline NLP.")

    return fallback
