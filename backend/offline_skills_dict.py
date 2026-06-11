# An exhaustive, massive list of skills across 30 industries to use for offline ATS keyword matching.

COMMON_SKILLS = {
    # IT, Software, Cloud & DevOps
    "python", "java", "c++", "c#", "javascript", "typescript", "react", "angular", "vue", "node", "node.js",
    "express", "django", "flask", "spring", "sql", "mysql", "postgresql", "mongodb", "redis", "oracle",
    "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "linux", "unix", "git", "github", "gitlab",
    "ci/cd", "jenkins", "devops", "algorithms", "data structures", "machine learning", "deep learning", "ai", 
    "nlp", "computer vision", "frontend", "backend", "fullstack", "microservices", "rest", "graphql", 
    "api", "tcp/ip", "networking", "cybersecurity", "penetration testing", "agile", "scrum", "jira", "html", "css",
    "sass", "less", "webpack", "babel", "ruby", "rails", "php", "laravel", "go", "golang", "rust", "swift",
    "kotlin", "android", "ios", "react native", "flutter", "data science", "data analytics", "data engineering", 
    "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "saas", "cloud computing", "serverless", "terraform",
    "bash", "shell scripting", "powershell", "ansible", "chef", "puppet", "vmware", "virtualization", "system administration",
    "nosql", "cassandra", "dynamodb", "firebase", "sqlite", "graphql", "websockets", "oauth", "jwt",
    "solidity", "web3", "information security", "cryptography", "malware analysis", "incident response",
    "istio", "envoy", "helm", "prometheus", "grafana", "splunk", "elk stack", "elasticsearch", "logstash", "kibana",
    "datadog", "new relic", "appdynamics", "sonarqube", "veracode", "owasp", "burp suite", "metasploit", "wireshark",
    "nmap", "kali linux", "reverse engineering", "threat hunting", "identity and access management", "iam", "active directory",
    "ldap", "saml", "sso", "vpn", "firewalls", "ips/ids", "endpoint protection", "edr", "mdm", "itil", "cobit",
    "togaf", "enterprise architecture", "solution architecture", "system design", "domain driven design", "ddd",
    "test driven development", "tdd", "behavior driven development", "bdd", "selenium", "cypress", "jest", "mocha",
    "chai", "jasmine", "junit", "nunit", "pytest", "cucumber", "appium", "postman", "swagger", "openapi",
    "rabbitmq", "apache kafka", "activemq", "zeromq", "grpc", "protobuf", "avro", "parquet", "spark", "hadoop",
    "hive", "pig", "flink", "storm", "snowflake", "bigquery", "redshift", "athena", "glue", "kinesis", "sqs", "sns",
    "ec2", "s3", "rds", "vpc", "route53", "cloudfront", "elastic beanstalk", "fargate", "eks", "aks", "gke",

    # Healthcare, Medical & Pharma
    "patient care", "clinical research", "hipaa", "medical coding", "medical billing", "pharmacology", "emr", "ehr",
    "nursing", "vital signs", "bls", "acls", "phlebotomy", "diagnostic imaging", "infection control", "quality assurance",
    "regulatory compliance", "fda", "good clinical practice", "gcp", "cpr", "first aid", "medical terminology",
    "anatomy", "physiology", "patient assessment", "medication administration", "triage", "wound care", "surgical assistance",
    "clinical trials", "pharmacovigilance", "data management", "bioinformatics", "drug development", "toxicology",
    "telehealth", "epidemiology", "public health", "biostatistics", "healthcare administration", "medical records",
    "immunology", "genetics", "pathology", "radiology", "pediatrics", "oncology", "psychiatry", "neurology",
    "cardiology", "dermatology", "endocrinology", "gastroenterology", "hematology", "infectious disease", "nephrology",
    "obstetrics", "gynecology", "ophthalmology", "orthopedics", "otolaryngology", "pulmonology", "rheumatology",
    "urology", "anesthesiology", "emergency medicine", "family medicine", "internal medicine", "preventive medicine",
    "geriatrics", "palliative care", "hospice", "physical therapy", "occupational therapy", "speech therapy",
    "respiratory therapy", "nutrition", "dietetics", "pharmacy", "dentistry", "optometry", "chiropractic", "acupuncture",
    "massage therapy", "veterinary medicine", "medical devices", "in vitro diagnostics", "ivd", "biotechnology",

    # Banking, Finance, Insurance & FinTech
    "financial modeling", "accounting", "gaap", "tax preparation", "auditing", "financial analysis", "quickbooks",
    "valuation", "bookkeeping", "payroll", "compliance", "risk assessment", "ifrs", "accounts payable", "accounts receivable",
    "general ledger", "financial reporting", "reconciliation", "asset management", "wealth management", "portfolio management",
    "investment banking", "private equity", "venture capital", "cryptocurrency", "blockchain", "smart contracts",
    "underwriting", "claims processing", "actuarial science", "aml", "kyc", "fraud detection", "credit analysis",
    "derivatives", "equities", "fixed income", "options pricing", "quantitative analysis", "treasury management",
    "commercial banking", "retail banking", "fintech", "payment processing", "insurtech", "robo-advisors",
    "algorithmic trading", "high frequency trading", "hft", "market making", "clearing", "settlement", "custody",
    "prime brokerage", "margin trading", "securitization", "syndication", "mergers and acquisitions", "m&a", "lbo",
    "ipo", "spac", "pe/vc", "hedge funds", "mutual funds", "etfs", "reits", "commodities", "forex", "fx",
    "macroeconomics", "microeconomics", "econometrics", "statistical modeling", "stochastic calculus", "monte carlo simulation",

    # Education, Academia & Training
    "curriculum development", "instructional design", "e-learning", "classroom management", "tutoring",
    "special education", "adult learning", "lesson planning", "assessment", "lms", "canvas", "blackboard",
    "student engagement", "pedagogy", "educational technology", "academic advising", "bilingual education",
    "early childhood education", "higher education", "standardized testing", "student affairs", "grant writing",
    "moodle", "edtech", "gamification", "blended learning", "flipped classroom", "peer mentoring", "distance learning",

    # Manufacturing, Engineering, Automotive
    "cad", "autocad", "solidworks", "plc", "thermodynamics", "materials science", "hvac", "troubleshooting",
    "quality control", "qa", "qc", "machining", "cnc", "welding", "electrical engineering", "mechanical engineering",
    "industrial engineering", "robotics", "automation", "scada", "hmi", "schematics", "blueprint reading", "safety", "osha", 
    "six sigma", "lean manufacturing", "5s", "kaizen", "supply chain management", "inventory management", "automotive design",
    "catia", "ansys", "matlab", "fluid dynamics", "mechatronics", "assembly line", "logistics planning", "erp",
    "sap", "oracle ebs", "preventive maintenance", "root cause analysis", "fmea", "dfmea", "pfmea", "apqp", "ppap",
    "spc", "msa", "8d", "capa", "iso 9001", "ts 16949", "iatf 16949", "as9100", "gmp", "cgmp", "lean six sigma",
    "value stream mapping", "kanban", "tqm", "tpm", "oee", "poka-yoke", "smag", "jit", "just in time",
    "milling", "turning", "injection molding", "3d printing", "additive manufacturing", "gd&t",

    # Telecommunications
    "telecommunications", "rf engineering", "network engineering", "voip", "fiber optics", "wireless networks",
    "5g", "lte", "broadband", "routing", "switching", "cisco", "juniper", "bgp", "ospf", "telephony",
    "lan/wan", "sdn", "nfv", "mpls", "sip", "pbx", "satellite communications", "network architecture",
    "wdm", "dwdm", "sonet", "sdh", "docsis", "gpon", "ftth", "fttx", "microwave", "vsat", "cdma", "gsm", "umts",

    # Retail, E-commerce, Sales & Marketing
    "merchandising", "inventory control", "point of sale", "pos", "visual merchandising", "loss prevention",
    "customer service", "retail management", "e-commerce", "shopify", "magento", "woocommerce", "conversion rate optimization",
    "cro", "supply chain", "order fulfillment", "dropshipping", "omnichannel", "b2c", "consumer behavior",
    "store operations", "retail buying", "category management", "pricing strategy", "customer retention",
    "salesforce", "hubspot", "crm", "lead generation", "b2b sales", "cold calling", "account management",
    "key account management", "kam", "sales forecasting", "pipeline management", "territory management", "channel sales",

    # Logistics, Supply Chain, Aviation
    "logistics", "supply chain optimization", "fleet management", "warehousing", "distribution", "freight forwarding",
    "customs clearance", "import/export", "routing", "dispatching", "aviation", "aerospace", "aircraft maintenance",
    "flight operations", "faa regulations", "air traffic control", "pilot", "avionics", "transportation management",
    "last mile delivery", "supply chain analytics", "procurement", "vendor management", "3pl", "cargo handling",
    "rfid", "barcode scanning", "wms", "tms", "cross-docking", "reverse logistics", "demand planning", "s&op",

    # Hospitality, Tourism & Real Estate
    "hospitality management", "guest services", "hotel management", "food and beverage", "f&b", "culinary arts",
    "event planning", "tourism", "travel management", "reservation systems", "revenue management", "catering",
    "front desk operations", "concierge", "travel itineraries", "tour guiding", "hospitality software", "banquet operations",
    "real estate", "property management", "leasing", "real estate development", "appraisal", "brokerage",
    "construction management", "estimating", "project management", "civil engineering", "structural engineering",
    "contract management", "bidding", "surveying", "building codes", "osha safety", "architecture",
    "revit", "bim", "tenant relations", "real estate economics", "zoning laws", "facilities management", "site planning",

    # Energy, Utilities, Oil & Gas
    "energy management", "renewable energy", "solar", "wind", "power generation", "utilities", "smart grid",
    "oil and gas", "petroleum engineering", "drilling", "refining", "pipeline operations", "geology",
    "environmental compliance", "hse", "health safety and environment", "reservoir engineering", "geophysics",
    "sustainability reporting", "carbon footprinting", "energy efficiency", "nuclear engineering",
    "hydroelectric", "geothermal", "biomass", "energy storage", "battery technology", "ev charging", "microgrids",

    # Media, Entertainment, Marketing, Advertising, Design
    "media production", "video editing", "audio engineering", "broadcasting", "journalism", "content creation",
    "marketing", "digital marketing", "seo", "sem", "social media marketing", "ppc", "google ads", "facebook ads",
    "copywriting", "brand management", "public relations", "pr", "market research", "campaign management",
    "graphic design", "adobe creative suite", "google analytics", "content strategy",
    "influencer marketing", "storytelling", "screenwriting", "animation", "motion graphics", "vfx", "cinematography",
    "ui/ux", "user interface design", "user experience design", "figma", "sketch", "invision", "balsamiq",
    "typography", "color theory", "branding", "illustration", "photography", "3d modeling", "blender", "maya",

    # Legal Services, Government & Non-Profit
    "litigation", "legal research", "contract drafting", "corporate law", "intellectual property", "family law",
    "employment law", "paralegal", "legal compliance", "case management", "mediation", "arbitration", "brief writing",
    "legal writing", "depositions", "trademark", "patent law", "mergers and acquisitions", "m&a", "document review",
    "public policy", "grant writing", "fundraising", "community outreach", "program management", "public administration",
    "volunteer management", "advocacy", "regulatory compliance", "budgeting", "social work", "ngo",
    "political campaigns", "international relations", "diplomacy", "public affairs", "urban planning", "civic engagement",

    # Agriculture & Food Processing
    "agriculture", "agronomy", "farming", "crop management", "food science", "food safety", "haccp",
    "quality assurance", "supply chain", "sustainability", "agribusiness", "precision agriculture", "horticulture",
    "livestock management", "food packaging", "gmp", "good manufacturing practices", "soil science", "irrigation",
    "pest management", "greenhouse management", "hydroponics", "aquaculture", "forestry", "permaculture",

    # Human Resources & Staffing
    "recruiting", "talent acquisition", "sourcing", "interviewing", "onboarding", "employee relations",
    "performance management", "compensation", "benefits administration", "hris", "workday", "ats",
    "payroll", "training and development", "labor laws", "organizational development", "employee engagement",
    "diversity and inclusion", "dei", "succession planning", "workforce planning", "hr metrics", "employer branding",
    "offboarding", "eeoc", "fmla", "adp", "bamboo hr", "zenefits", "gusto", "applicant tracking systems",

    # Cross-Industry Soft Skills & General Management
    "leadership", "communication", "project management", "product management", "strategic planning",
    "negotiation", "sales", "public speaking", "mentoring", "team building", "conflict resolution",
    "analytical skills", "problem solving", "time management", "critical thinking", "business development",
    "b2b", "b2c", "crm", "salesforce", "presentation", "stakeholder management", "vendor management",
    "process improvement", "change management", "pmp", "scrum master", "product owner", "emotional intelligence",
    "adaptability", "active listening", "decision making", "creativity", "collaboration", "customer satisfaction",
    "continuous improvement", "delegation", "stress management", "cross-functional leadership", "strategic partnerships",
    "budget management", "p&l management", "okrs", "kpis", "agile methodologies", "waterfall methodology",
    "business analysis", "swot analysis", "competitive analysis", "business intelligence", "data visualization",
    "root cause analysis", "troubleshooting", "innovation", "entrepreneurship", "startup experience",
    "foreign languages", "translation", "interpretation", "cultural competency"
}
