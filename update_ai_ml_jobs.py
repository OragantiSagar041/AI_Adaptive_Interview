import re

file_path = "backend/app/routes/jobs.py"

with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

new_fallback_code = '''def extract_job_details_fallback(prompt: str) -> dict:
    """Robust rule-based and NLP fallback to extract and structure job details from prompt."""
    prompt_lower = prompt.lower()

    # 1. Title Extraction: Check direct contextual indicator first
    title = None
    role_ctx_match = re.search(
        r'(?:requirement of|role of|position of|hiring (?:for )?|looking for|need (?:an? )?|seeking (?:an? )?|opening for)\s+([A-Za-z0-9\-\./\s]+?)(?=\s+(?:having|with|for\b|\d+\s*yrs|\d+\s*years|fresher|salary|and\s+salary|skills|roles|experience|,|\.|$))',
        prompt,
        re.IGNORECASE
    )

    if role_ctx_match:
        cand = role_ctx_match.group(1).strip().lower()
        if re.search(r'ai[\s\-_/]?ml|machine learning|ml engineer|ai engineer', cand):
            title = "AI/ML Engineer"
        elif "data scientist" in cand:
            title = "Data Scientist"
        elif "data engineer" in cand:
            title = "Data Engineer"
        elif "full stack" in cand or "fullstack" in cand:
            title = "Full Stack Developer"
        elif "frontend" in cand or "front-end" in cand or "react" in cand:
            title = "Frontend Developer (React)"
        elif "backend" in cand or "back-end" in cand:
            title = "Backend Developer"
        elif "python" in cand:
            title = "Python Developer"
        elif "java" in cand or "microservice" in cand:
            title = "Software Developer (Java / Microservices)"
        elif "aws" in cand or "cloud" in cand:
            title = "AWS Cloud Engineer"
        elif "devops" in cand:
            title = "DevOps Engineer"
        elif "qa" in cand or "test" in cand or "quality" in cand:
            title = "QA Automation Engineer"
        elif "ui" in cand or "ux" in cand or "designer" in cand:
            title = "UI/UX Designer"
        else:
            title = role_ctx_match.group(1).strip().title()

    # Fallback to keyword matching if contextual indicator didn't match
    if not title:
        if re.search(r'\bai[\s\-_/]?ml\b|\bai\s*and\s*ml\b|\bmachine learning engineer\b|\bml engineer\b|\bai engineer\b', prompt_lower):
            title = "AI/ML Engineer"
        elif re.search(r'\bdata scientist\b', prompt_lower):
            title = "Data Scientist"
        elif re.search(r'\bdata engineer\b', prompt_lower):
            title = "Data Engineer"
        elif re.search(r'\bfull\s*stack\b|\bfullstack\b', prompt_lower):
            title = "Full Stack Developer"
        elif re.search(r'\bdevops\b', prompt_lower):
            title = "DevOps Engineer"
        elif re.search(r'\baws\b|\bcloud engineer\b', prompt_lower):
            title = "AWS Cloud Engineer"
        elif re.search(r'\bqa\b|\btest automation\b|\bquality assurance\b|\bsdet\b', prompt_lower):
            title = "QA Automation Engineer"
        elif re.search(r'\bui[\s\-_/]?ux\b|\bui designer\b|\bux designer\b|\bui/ux\b', prompt_lower):
            title = "UI/UX Designer"
        elif re.search(r'\bfront[\s\-]?end\b|\breact developer\b', prompt_lower):
            title = "Frontend Developer (React)"
        elif re.search(r'\bback[\s\-]?end\b', prompt_lower):
            title = "Backend Developer"
        elif re.search(r'\bpython developer\b|\bpython engineer\b', prompt_lower):
            title = "Python Developer"
        elif re.search(r'\bjava developer\b|\bjava engineer\b|\bmicroservice\b', prompt_lower):
            title = "Software Developer (Java / Microservices)"
        elif re.search(r'\bsoftware engineer\b', prompt_lower):
            title = "Software Engineer"
        elif re.search(r'\bsoftware developer\b|\bdeveloper\b', prompt_lower):
            title = "Software Developer"
        else:
            title = "Software Developer"

    # 2. Experience Extraction (e.g. fresher, 2 yrs, 4-5 yrs)
    exp = "2 – 4 Years"
    if "fresher" in prompt_lower or "entry level" in prompt_lower or "0 yr" in prompt_lower or "0 year" in prompt_lower:
        exp = "Fresher (0 – 1 Years)"
    else:
        exp_match = re.search(r'(\d+(?:\s*-\s*\d+)?)\s*(?:yrs?|years?|yoe)', prompt_lower)
        if exp_match:
            clean_exp = exp_match.group(1).replace(' ', '')
            if '-' in clean_exp:
                parts = clean_exp.split('-')
                exp = f"{parts[0]} – {parts[1]} Years"
            else:
                exp = f"{clean_exp} Years"

    # 3. Salary Extraction (e.g. 6 lpa, 8 lpa, 12 LPA)
    salary = "8 LPA"
    sal_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:lpa|lac|lakh|inr|per annum)', prompt_lower)
    if sal_match:
        salary = f"{sal_match.group(1).upper()} LPA"
    elif "6 lpa" in prompt_lower or "6lpa" in prompt_lower:
        salary = "6 LPA"
    elif "8 lpa" in prompt_lower or "8lpa" in prompt_lower:
        salary = "8 LPA"

    # 4. Bond Extraction (e.g. bond 1yr, bond 2yr, 2 year bond)
    bond = "No Bond"
    bond_match = re.search(r'(?:bond\s*[:\-]?\s*)(\d+\s*(?:yrs?|years?)?)', prompt_lower)
    if not bond_match:
        bond_match = re.search(r'(\d+)\s*(?:yrs?|years?)\s*bond', prompt_lower)
    if bond_match:
        raw_bond = bond_match.group(1).strip()
        num_match = re.search(r'(\d+)', raw_bond)
        if num_match:
            bond = f"{num_match.group(1)}-Year Bond"
        else:
            bond = raw_bond
    elif "no bond" in prompt_lower or "none" in prompt_lower:
        bond = "No Bond"

    # 5. Work mode
    work_mode = "Remote"
    if "on-site" in prompt_lower or "onsite" in prompt_lower or "office" in prompt_lower:
        work_mode = "On-site"
    elif "hybrid" in prompt_lower:
        work_mode = "Hybrid"

    # 6. Location
    loc = "Hyderabad / Remote"
    loc_match = re.search(r'\b(?:location|located in|based in|city|in)\s+([A-Za-z]{3,20}(?:\s+[A-Za-z]{3,20})?)\b', prompt_lower)
    if loc_match:
        cand_loc = loc_match.group(1).strip().title()
        if cand_loc.lower() not in ["this", "our", "the", "software", "developer", "engineer", "remote", "hybrid", "office", "years", "having", "offer", "skills", "jobs"]:
            loc = f"{cand_loc} / {work_mode}"

    # 7. Check if user provided explicit skills list in prompt
    explicit_skills = []
    skills_match = re.search(r'skills(?:\s+roles)?(?:\s+and\s+responsibilities)?\s*(?:are|include|:|is)?\s*([A-Za-z0-9\-\.\,\/\+\(\)\s]+?)(?=\s+(?:but|and\s+salary|salary|bond|having|experience|\.\s|$))', prompt, re.IGNORECASE)
    if skills_match:
        raw_seg = skills_match.group(1).strip()
        parts = [s.strip() for s in re.split(r'[,|;]', raw_seg) if s.strip()]
        for p in parts:
            clean = re.sub(r'^(?:and|or)\s+', '', p, flags=re.IGNORECASE).strip()
            if clean and clean.lower() not in ['and', 'or', 'skills', 'roles', 'responsibilities', 'post', 'job']:
                explicit_skills.append(clean)

    # 8. Role Profiles: Tailored technical stack, responsibilities, and competencies
    title_l = title.lower()
    if "ai" in title_l or "ml" in title_l or "machine learning" in title_l:
        default_skills = ["Python", "Machine Learning", "Deep Learning", "SQL", "NLP", "Generative AI", "LLMs", "TensorFlow", "PyTorch", "FastAPI", "Docker", "AWS/Azure"]
        summary = (
            f"We are seeking an ambitious {title} ({exp}) to build innovative machine learning, deep learning, and Generative AI solutions. "
            f"You will design predictive models, fine-tune LLMs, engineer automated data pipelines, and deploy scalable AI microservices into production."
        )
        roles = [
            "Model Development & Architecture: Design, train, and optimize deep learning, machine learning, and NLP models using PyTorch, TensorFlow, and Scikit-Learn.",
            "Generative AI & LLMs: Implement state-of-the-art Generative AI applications, prompt engineering, RAG pipelines, and LLM fine-tuning workflows.",
            "Data Preprocessing & Pipelines: Build robust data ingestion, feature engineering, and high-performance querying pipelines with SQL, Pandas, and NumPy.",
            "Model Deployment & APIs: Package and deploy machine learning models as high-throughput REST APIs using FastAPI, Flask, and Docker containers.",
            "Cloud & MLOps: Scale AI workloads, manage model registries, and track production performance across cloud platforms (AWS / Azure).",
            "Collaborative Engineering: Collaborate actively with data engineers, software developers, and product teams to translate complex business challenges into intelligent AI systems."
        ]
        technical_skills = {
            "Languages": "Python, SQL",
            "AI & Deep Learning": "TensorFlow, PyTorch, Deep Learning, Neural Networks",
            "Generative AI & NLP": "LLMs, Generative AI, Prompt Engineering, NLP, Transformers",
            "Machine Learning": "Scikit-Learn, Pandas, NumPy, Feature Engineering",
            "API & Deployment": "FastAPI, Flask, REST APIs, Docker, Model Deployment",
            "Cloud & DevOps": "AWS / Azure, Git, CI/CD"
        }
    elif "full stack" in title_l:
        default_skills = ["React", "Node.js", "TypeScript", "JavaScript", "MongoDB", "PostgreSQL", "Express.js", "REST APIs", "Docker", "Git"]
        summary = (
            f"We are seeking a versatile {title} ({exp}) to build end-to-end web applications. "
            f"You will design intuitive frontend interfaces with React, develop scalable backend APIs with Node.js/Python, and manage database persistence."
        )
        roles = [
            "Frontend Engineering: Build responsive, performant user interfaces using React, TypeScript, and modern CSS frameworks.",
            "Backend Development: Design, develop, and maintain secure, high-throughput RESTful APIs and microservices with Node.js / Express or Python.",
            "Database Architecture: Model relational and NoSQL schemas, write optimized queries, and manage data persistence with PostgreSQL and MongoDB.",
            "DevOps & Containerization: Containerize applications with Docker, manage CI/CD pipelines, and deploy on modern cloud platforms.",
            "Testing & Reliability: Write comprehensive unit, integration, and end-to-end test suites to ensure robust software quality.",
            "Collaborative Engineering: Participate in architecture reviews, sprint planning, and code reviews across cross-functional engineering teams."
        ]
        technical_skills = {
            "Frontend": "React.js, TypeScript, JavaScript (ES6+), HTML5, CSS3, Tailwind CSS",
            "Backend": "Node.js, Express.js, RESTful APIs, Microservices",
            "Databases": "PostgreSQL, MongoDB, Redis",
            "Tools & DevOps": "Git, Docker, CI/CD Pipelines, Postman",
            "Testing": "Jest, React Testing Library, Cypress"
        }
    elif "ui/ux" in title_l or "designer" in title_l:
        default_skills = ["Figma", "Adobe XD", "Wireframing", "Prototyping", "User Research", "UI Design", "Design Systems", "Usability Testing"]
        summary = (
            f"We are seeking a creative {title} ({exp}) to craft intuitive, user-centered digital experiences for web and mobile platforms. "
            f"You will transform complex workflows into elegant user interfaces, wireframes, interactive prototypes, and design systems."
        )
        roles = [
            "User Research & Personas: Conduct user interviews, competitive analysis, and map comprehensive customer journey flows.",
            "Wireframing & Prototyping: Create low and high-fidelity wireframes, interactive prototypes, and mockups using Figma and Adobe XD.",
            "Design Systems & Style Guides: Build, maintain, and scale comprehensive design systems, component libraries, and visual guidelines.",
            "Developer Handoff: Collaborate closely with frontend engineers to ensure design fidelity and responsive, pixel-perfect implementation.",
            "Usability & Accessibility: Advocate for user empathy, intuitive interactions, and WCAG accessibility standards across all platforms."
        ]
        technical_skills = {
            "Design Tools": "Figma, Adobe XD, Sketch, Photoshop, Illustrator",
            "Prototyping": "Figma Interactive Components, ProtoPie, InVision",
            "UX Methodologies": "User Journey Mapping, Information Architecture, Wireframing, Usability Testing",
            "Accessibility & Standards": "WCAG 2.1 Accessibility, Responsive Web & Mobile Design Patterns"
        }
    elif "python" in title_l:
        default_skills = ["Python", "FastAPI", "Django", "PostgreSQL", "Docker", "Redis", "REST APIs", "Linux"]
        summary = (
            f"We are seeking an experienced {title} ({exp}) to join our engineering team. "
            f"You will build, optimize, and maintain high-performance, asynchronous backend services and scalable data pipelines. "
            f"The ideal candidate possesses strong proficiency in Python, FastAPI, relational databases, and modern cloud deployment practices."
        )
        roles = [
            "Backend Development: Design, develop, and maintain robust, high-throughput backend services and APIs using Python, FastAPI, and Django.",
            "Database Architecture & ORM: Model relational schemas, optimize complex queries, and manage data persistence with PostgreSQL and SQLAlchemy / Tortoise ORM.",
            "API Design & Integrations: Build secure, performant RESTful endpoints, API gateways, and asynchronous task queues with Redis and Celery.",
            "Linux & Containerization: Containerize applications with Docker, manage microservices configurations, and operate comfortably in Linux server environments.",
            "Testing & Code Quality: Write unit, integration, and end-to-end test suites using PyTest, ensuring high test coverage, reliability, and security.",
            "Collaborative Engineering: Actively contribute to code reviews, system design discussions, agile sprint cycles, and technical documentation."
        ]
        technical_skills = {
            "Primary Language": "Python 3.10+ (AsyncIO, Generators, Type Hinting, OOPs)",
            "Frameworks": "FastAPI, Django, Flask, SQLAlchemy",
            "Databases": "PostgreSQL, MySQL, Redis, MongoDB",
            "Architecture": "RESTful APIs, Microservices, Asynchronous Event-Driven",
            "Operating System": "Linux / Unix (Command line usage, shell scripting, process management)",
            "Tools & DevOps": "Docker, Git, CI/CD Pipelines, Postman",
            "Testing": "PyTest, Unittest, Mock"
        }
    elif "java" in title_l or "microservice" in prompt_lower:
        default_skills = ["Java", "Spring Boot", "Microservices", "Hibernate", "SQL", "Linux", "REST APIs", "Docker"]
        summary = (
            f"We are seeking an experienced {title} ({exp}) to join our core engineering team. "
            f"You will be responsible for building, optimizing, and maintaining scalable enterprise software applications. "
            f"The ideal candidate possesses strong expertise in Core & Advanced Java, Spring Framework, Hibernate ORM, Microservices, and Linux environments."
        )
        roles = [
            "Backend Development: Design, build, and maintain high-performance, reusable, and reliable Java code using Spring Boot and Microservices architecture.",
            "Database Design & Management: Write, optimize, and manage complex SQL queries, stored procedures, and schema designs. Implement Object-Relational Mapping (ORM) using Hibernate / JPA.",
            "API Development: Create and consume secure, RESTful web services and integrate third-party APIs across modern Microservices workflows.",
            "Linux Environment: Work comfortably within Linux/Unix operating systems to manage services, inspect logs, automate routine tasks with basic shell scripts, and handle deployments.",
            "Testing & Quality Assurance: Write clean unit and integration tests (JUnit/Mockito) to ensure software robustness, reliability, and security compliance.",
            "Collaborative Engineering: Participate actively in code reviews, technical documentation, sprint planning, and debugging in an Agile framework."
        ]
        technical_skills = {
            "Primary Language": "Java (Java 8/11/17 — Multithreading, Streams, OOPs, Collections)",
            "Frameworks": "Spring, Spring Boot, Spring MVC, Spring Data JPA, Hibernate ORM",
            "Architecture": "Microservices, REST APIs, API Gateways, Distributed Systems",
            "Databases": "Relational SQL (MySQL, PostgreSQL, Oracle, or MS SQL Server)",
            "Operating System": "Linux / Unix (Command line usage, shell scripting, system logs)",
            "Tools & DevOps": "Docker, Git, Maven / Gradle, Postman",
            "Testing": "JUnit, Mockito"
        }
    elif "aws" in title_l or "devops" in title_l or "cloud" in title_l:
        default_skills = ["AWS", "Docker", "Kubernetes", "Terraform", "CI/CD", "Linux", "Python", "CloudFormation"]
        summary = (
            f"We are seeking an experienced {title} ({exp}) to design, automate, and maintain resilient cloud infrastructure. "
            f"You will spearhead continuous integration, container orchestration, and cloud reliability across multi-region environments."
        )
        roles = [
            "Cloud Infrastructure: Architect, configure, and maintain highly available and resilient infrastructure on AWS using Terraform or CloudFormation.",
            "Container Orchestration: Deploy, scale, and manage containerized workloads using Docker and Kubernetes (EKS/ECS).",
            "CI/CD Automation: Build and maintain automated build, test, and deployment pipelines using modern CI/CD tooling.",
            "Monitoring & Observability: Implement centralized logging, tracing, and metrics with Prometheus, Grafana, and CloudWatch.",
            "Security & Governance: Enforce cloud security best practices, IAM least privilege access, and infrastructure compliance standards.",
            "Incident Response & Reliability: Troubleshoot production incidents, optimize infrastructure costs, and ensure high system uptime."
        ]
        technical_skills = {
            "Cloud Platform": "AWS (EC2, S3, RDS, ECS, EKS, Lambda, CloudFront, VPC)",
            "Infrastructure as Code": "Terraform, CloudFormation",
            "Containers": "Docker, Kubernetes, Helm",
            "CI/CD": "GitHub Actions, GitLab CI, Jenkins",
            "Monitoring": "Prometheus, Grafana, CloudWatch",
            "Scripting & OS": "Bash, Python, Linux (Ubuntu/Debian, Amazon Linux)",
            "Testing & Security": "SonarQube, Trivy, IAM policies"
        }
    elif "frontend" in title_l or "react" in title_l:
        default_skills = ["React", "JavaScript", "TypeScript", "Tailwind CSS", "Redux Toolkit", "REST APIs", "HTML5/CSS3"]
        summary = (
            f"We are seeking a talented {title} ({exp}) to craft exceptional, responsive user interfaces and scalable frontend architectures. "
            f"You will turn complex user workflows into fluid, intuitive web experiences."
        )
        roles = [
            "UI Development: Build modern, responsive, and accessible user interfaces using React, TypeScript, and Tailwind CSS.",
            "State Management & Architecture: Architect predictable client-side state using Redux Toolkit, Context API, or TanStack Query.",
            "API Integration: Consume and integrate RESTful APIs and WebSocket feeds with robust error handling and loading indicators.",
            "Performance Optimization: Optimize core web vitals, bundle sizes, lazy loading, and rendering performance across browsers.",
            "Testing & Code Quality: Write unit and component tests using Vitest, Jest, and React Testing Library.",
            "Collaborative Engineering: Work closely with UI/UX designers and backend engineers in agile iterations."
        ]
        technical_skills = {
            "Primary Languages": "JavaScript (ES6+), TypeScript, HTML5, CSS3",
            "Frameworks & UI": "React.js, Next.js, Tailwind CSS, Redux Toolkit",
            "Architecture": "Single Page Applications (SPA), Server-Side Rendering (SSR), RESTful APIs",
            "Testing": "Jest, React Testing Library, Vitest",
            "Tools & Build": "Vite, Webpack, Git, npm/yarn"
        }
    elif "data scientist" in title_l:
        default_skills = ["Python", "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch", "Pandas", "Scikit-Learn", "SQL"]
        summary = (
            f"We are seeking a data-driven {title} ({exp}) to develop predictive machine learning models and extract actionable intelligence from complex datasets."
        )
        roles = [
            "Model Development: Design, train, and evaluate machine learning and deep learning models using Python, Scikit-Learn, and PyTorch / TensorFlow.",
            "Data Pipeline Engineering: Clean, preprocess, and engineer features from massive structured and unstructured datasets.",
            "Model Deployment: Deploy predictive models as scalable REST APIs using FastAPI or Docker containers.",
            "Experimentation & Insights: Design A/B tests, perform rigorous statistical analysis, and present findings to key stakeholders."
        ]
        technical_skills = {
            "Languages": "Python, SQL, R",
            "ML Frameworks": "TensorFlow, PyTorch, Scikit-Learn, XGBoost",
            "Data Processing": "Pandas, NumPy, Apache Spark",
            "Deployment & Tools": "Docker, MLflow, FastAPI, Git"
        }
    elif "qa" in title_l or "test" in title_l:
        default_skills = ["Selenium", "Cypress", "PyTest", "Test Automation", "Postman", "JIRA", "CI/CD", "SQL"]
        summary = (
            f"We are seeking a detail-oriented {title} ({exp}) to build robust test automation frameworks and ensure high software reliability."
        )
        roles = [
            "Test Framework Engineering: Design and maintain automated UI and API test suites using Selenium, Cypress, and PyTest.",
            "API Testing: Validate backend services and RESTful endpoints using Postman and automated scripts.",
            "CI/CD Integration: Integrate automated test suites into continuous integration pipelines to catch regressions early.",
            "Defect Management: Log, track, and verify software defects using JIRA, collaborating closely with developers."
        ]
        technical_skills = {
            "Automation Tools": "Selenium, Cypress, Playwright",
            "Testing Frameworks": "PyTest, JUnit, TestNG",
            "API Testing": "Postman, RestAssured",
            "CI/CD & Tools": "Jenkins, GitHub Actions, JIRA, Git"
        }
    else:
        default_skills = ["Python", "JavaScript", "SQL", "Docker", "REST APIs", "Linux", "Git"]
        summary = (
            f"We are seeking an experienced {title} ({exp}) to join our core engineering team. "
            f"You will build, optimize, and maintain scalable software applications and services. "
            f"The ideal candidate possesses strong expertise in modern programming practices, APIs, and cloud deployments."
        )
        roles = [
            "Software Development: Design, build, and maintain high-performance, reusable, and reliable code.",
            "Database Management: Write, optimize, and manage complex SQL queries and relational schema designs.",
            "API Engineering: Create and consume secure RESTful web services and integrate third-party APIs.",
            "Environment & DevOps: Work within Linux/Unix environments, manage containerized services with Docker, and handle deployments.",
            "Testing & Quality: Write clean unit and integration tests to ensure software robustness and security compliance.",
            "Collaborative Engineering: Participate actively in code reviews, technical documentation, and Agile sprint planning."
        ]
        technical_skills = {
            "Languages": "Python, SQL, JavaScript",
            "Frameworks": "RESTful APIs, Web Services",
            "Databases": "PostgreSQL, MySQL, Redis",
            "Operating System": "Linux / Unix",
            "Tools & CI/CD": "Git, Docker, Postman",
            "Testing": "PyTest, Unittest"
        }

    # If the user explicitly provided skills, use them directly; otherwise use role's default skills
    skills_list = explicit_skills if len(explicit_skills) >= 2 else default_skills

    qualifications = [
        "Education: B.E. / B.Tech / M.C.A. / M.Tech in Computer Science, Information Technology, or a related field.",
        f"Experience: Minimum {exp} of professional engineering experience.",
        "Problem Solving: Strong analytical, algorithmic, and debugging skills.",
        "Communication: Clear oral and written technical communication skills."
    ]

    # Clean, non-redundant formatted description (NO "How to Apply", NO duplicate metadata)
    full_description = (
        f"Job Summary\\n{summary}\\n\\n"
        f"Key Responsibilities\\n"
        + "\\n".join([f"• {r}" for r in roles]) + "\\n\\n"
        f"Qualifications & Requirements\\n"
        + "\\n".join([f"• {q}" for q in qualifications])
    )

    return {
        "title": title,
        "experience": exp,
        "salary": salary,
        "bond": bond,
        "workMode": work_mode,
        "location": loc,
        "skills": ", ".join(skills_list),
        "summary": summary,
        "description": full_description,
        "roles_and_responsibilities": roles,
        "technical_skills": technical_skills,
        "qualifications": qualifications
    }'''

p_start = text.find("def extract_job_details_fallback(prompt: str) -> dict:")
p_end = text.find("@router.post(\"/api/jobs/generate-ai\")")
if p_end == -1:
    p_end = text.find("@router.post('/api/jobs/generate-ai')")

if p_start == -1 or p_end == -1:
    print(f"Error finding fallback markers: p_start={p_start}, p_end={p_end}")
else:
    updated = text[:p_start] + new_fallback_code + "\n\n" + text[p_end:]
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(updated)
    print("Successfully updated jobs.py!")
