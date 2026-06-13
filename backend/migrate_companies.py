import os
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
if not MONGO_URI:
    print("MONGO_URI not found in .env")
    exit(1)

client = MongoClient(MONGO_URI)
db = client["AI_Interview"]

admins_col = db["admins"]
companies_col = db["companies"]
sessions_col = db["interview_sessions"]

def migrate():
    print("Starting migration...")
    
    # Create an index for company_id on sessions for faster queries
    sessions_col.create_index("company_id")
    admins_col.create_index("company_id")

    # Fetch all tenant admins
    admins = list(admins_col.find({"role": {"$ne": "master"}}))
    print(f"Found {len(admins)} admin users.")

    for admin in admins:
        admin_id = admin["_id"]
        
        # If already migrated, skip
        if "company_id" in admin and admin["company_id"]:
            company_id = admin["company_id"]
        else:
            # Create a company based on the admin's details
            company_name = admin.get("company_name") or f"Company of {admin.get('username', 'Unknown')}"
            
            # Check if a company with this exact name already exists (basic deduplication)
            existing_company = companies_col.find_one({"name": company_name})
            
            if existing_company:
                company_id = str(existing_company["_id"])
            else:
                new_company = {
                    "name": company_name,
                    "subscription_plan": admin.get("subscription_plan", "Basic"),
                    "subscription_expiry": admin.get("subscription_expiry"),
                    "stripe_customer_id": admin.get("stripe_customer_id"),
                    "created_at": admin.get("created_at", datetime.now(timezone.utc).isoformat())
                }
                result = companies_col.insert_one(new_company)
                company_id = str(result.inserted_id)
                print(f"Created new company '{company_name}' with ID {company_id}")

            # Update admin to link to company
            admins_col.update_one(
                {"_id": admin_id},
                {"$set": {"company_id": company_id}}
            )
            print(f"Updated admin {admin_id} with company_id {company_id}")

        # Update all interview sessions created by this admin to have this company_id
        result = sessions_col.update_many(
            {"created_by": str(admin_id), "company_id": {"$exists": False}},
            {"$set": {"company_id": company_id}}
        )
        if result.modified_count > 0:
            print(f"Updated {result.modified_count} sessions for admin {admin_id}")

    print("Migration complete!")

if __name__ == "__main__":
    migrate()
