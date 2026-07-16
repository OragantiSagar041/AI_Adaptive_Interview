import pymongo
from dotenv import load_dotenv
import os

load_dotenv()
client = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb+srv://oragantisagar041_db_user:ArahInfoTech123@cluster0.9x2n3ve.mongodb.net/?appName=Cluster0"))
db = client['AI_Interview']

PLAN_DEFINITIONS = {
    "Free Trial": {
        "price": 0,
        "credits_granted": 15,
        "summary": "Core single-interview setup for evaluating the platform before rollout.",
        "features": [
            "Overview Dashboard",
            "Create Interview",
            "Qualified Candidates",
            "Rejected Candidates",
            "Deactivated Candidates",
            "Profile Settings",
            "Live Monitor",
            "Analytics & Reports",
            "Bulk Email Invites",
            "Resume Parsing",
            "Custom Branding",
            "Industry Type"
        ]
    },
    "Basic": {
        "price": 2500,
        "credits_granted": 250,
        "summary": "Adds richer review and control workflows for growing hiring teams.",
        "features": [
            "Admin Dashboard",
            "Single Interview Creation",
            "AI Video Recording",
            "Detailed Analytics",
            "Resume Parsing",
            "Email Notifications"
        ]
    },
    "Advance": {
        "price": 3999,
        "credits_granted": 400,
        "summary": "Unlocks the full hiring workflow including bulk send and live monitoring.",
        "features": [
            "Everything in Basic",
            "Bulk Candidate Upload",
            "Unlimited Interviews",
            "Custom HR Screening",
            "Live Monitoring",
            "Priority Support"
        ]
    }
}

print("Running DB update...")
for plan_name, data in PLAN_DEFINITIONS.items():
    result = db.plans.update_one(
        {"plan_name": plan_name},
        {"$set": {
            "price": data["price"],
            "credits_granted": data["credits_granted"],
            "summary": data["summary"],
            "features": data["features"]
        }},
        upsert=True
    )
    print(f"Updated {plan_name}: Modified={result.modified_count}, Upserted={result.upserted_id}")
    
print("Migration complete!")
