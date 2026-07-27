import os, sys
sys.path.append(os.getcwd())
from dotenv import load_dotenv
load_dotenv()
from mongo_db import admins_collection, interview_sessions_collection

admins = admins_collection.find({"role": "admin"})

for admin in admins:
    admin_id = str(admin["_id"])
    current_credits = admin.get("credits", 0)
    
    # Calculate how many sessions they have created (both admin_id and created_by formats)
    sessions_created = interview_sessions_collection.count_documents({
        "$or": [
            {"admin_id": admin_id},
            {"created_by": admin_id}
        ]
    })
    
    # Calculate what their total allocated credits should have been
    total_allocated = current_credits + sessions_created
    
    # Update the DB
    admins_collection.update_one(
        {"_id": admin["_id"]},
        {"$set": {"total_allocated_credits": total_allocated}}
    )
    
    print(f"Patched {admin.get('username')}: Allocated={total_allocated}, Remaining={current_credits}, Used={sessions_created}")

print("Successfully re-patched all credits!")
