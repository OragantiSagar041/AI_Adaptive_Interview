import json

industries = [
    "Information Technology", "Software & SaaS", "Healthcare", "Pharmaceuticals", 
    "Banking", "Financial Services", "Insurance", "FinTech", "Education", 
    "Manufacturing", "Automotive", "Telecommunications", "Retail", "E-commerce", 
    "Logistics & Supply Chain", "Transportation", "Aviation", "Hospitality", 
    "Tourism", "Real Estate", "Construction", "Energy & Utilities", "Oil & Gas", 
    "Media & Entertainment", "Marketing & Advertising", "Legal Services", 
    "Government & Public Sector", "Non-Profit Organizations", 
    "Agriculture & Food Processing", "Human Resources & Staffing", "General"
]

tech_questions = {}
case_studies = {}

for industry in industries:
    tech_questions[industry] = [
        f"In the context of {industry}, how do you ensure the scalability and reliability of your solutions under heavy load?",
        f"What are the biggest compliance, security, or regulatory challenges you've faced when building products for the {industry} sector?",
        f"Describe a time you had to integrate legacy systems with modern technologies within a {industry} environment. How did you handle data integrity?",
        f"How do you stay updated with the rapidly evolving technological trends specifically affecting {industry}?",
        f"Can you walk me through a specific project where your technical contribution directly improved operational efficiency for a {industry} business?"
    ]
    
    case_studies[industry] = {
        "crisis_management": {
            "scenario": f"A critical system outage has disrupted operations across multiple {industry} facilities. The technical team estimates 4 hours for a fix, but the business is losing revenue every minute.",
            "question": "Walk through your immediate crisis management plan. Who do you communicate with, and how do you mitigate the business impact?",
            "skill_tested": "Crisis Management & Problem Solving",
            "evaluation_criteria": ["Incident response protocol", "Stakeholder communication", "Risk mitigation", "Root cause analysis planning"]
        },
        "digital_transformation": {
            "scenario": f"You are leading a major digital transformation initiative for a legacy {industry} firm. Half of the management team is highly resistant to adopting the new cloud-based tools.",
            "question": "How do you drive adoption and manage this resistance while keeping the project on schedule and within budget?",
            "skill_tested": "Change Management & Leadership",
            "evaluation_criteria": ["Empathy and listening", "Iterative rollout strategy", "Value demonstration", "Training and support planning"]
        },
        "vendor_negotiation": {
            "scenario": f"A key technology vendor providing critical infrastructure for your {industry} operations is raising their prices by 35% next quarter. Switching vendors would take at least 8 months.",
            "question": "What is your strategy for handling this situation? Describe your negotiation approach and your contingency planning.",
            "skill_tested": "Vendor Management & Strategic Negotiation",
            "evaluation_criteria": ["Cost-benefit analysis", "Leverage identification", "Relationship preservation", "Alternative exploration"]
        }
    }

content = f'''# Auto-generated Industry Fallback Data
# This file contains offline fallback questions tailored to each industry.

INDUSTRY_TECHNICAL_QUESTIONS = {json.dumps(tech_questions, indent=4)}

INDUSTRY_CASE_STUDIES = {json.dumps(case_studies, indent=4)}
'''

with open("industry_fallback_data.py", "w", encoding="utf-8") as f:
    f.write(content)

print("industry_fallback_data.py generated successfully.")
