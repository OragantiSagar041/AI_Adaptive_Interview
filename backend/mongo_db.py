import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

try:
    import dns.resolver
    dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
    dns.resolver.default_resolver.nameservers = ['8.8.8.8', '8.8.4.4', '1.1.1.1']
except Exception as e:
    print(f"Warning: Could not configure custom DNS resolver: {e}")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(MONGO_URI, connect=False)
db = client["AI_Interview"]

# Collections
candidates_collection = db["candidates"]
interviews_collection = db["interviews"]
answers_collection = db["answers"]
admins_collection = db["admins"]
interview_sessions_collection = db["interview_sessions"]
plans_collection = db["plans"]
companies_collection = db["companies"]
credit_requests_collection = db["credit_requests"]
notifications_collection = db["notifications"]
omni_call_logs_collection = db["omni_call_logs"]
jobs_collection = db["jobs"]
job_applications_collection = db["job_applications"]
conversation_flows_collection = db["conversation_flows"]
agents_collection = db["agents"]
counters_collection = db["counters"]
demo_requests_collection = db["demo_requests"]
payment_orders_collection = db["payment_orders"]
pending_signups_collection = db["pending_signups"]

def get_next_sequence_value(sequence_name: str, prefix: str) -> str:
    """
    Generates a sequential ID like CAN1, RC1, JOB1 using MongoDB atomic find_one_and_update.
    """
    sequence_document = counters_collection.find_one_and_update(
        {"_id": sequence_name},
        {"$inc": {"sequence_value": 1}},
        upsert=True,
        return_document=True
    )
    return f"{prefix}{sequence_document['sequence_value']}"

async def init_db_indexes():
    indexes = [
        (candidates_collection, "name", False),
        (admins_collection, "username", True),
        (interview_sessions_collection, "link_id", True),
        (interviews_collection, "id", True),
        (plans_collection, "plan_name", True)
    ]
    
    for coll, key, is_unique in indexes:
        try:
            coll.create_index(key, unique=is_unique)
        except Exception as e:
            if "IndexKeySpecsConflict" in str(e) or "already exists with different options" in str(e):
                try:
                    coll.drop_index(f"{key}_1")
                    coll.create_index(key, unique=is_unique)
                except Exception as inner_e:
                    print(f"Warning: Failed to recreate index {key} on {coll.name}: {inner_e}")
            else:
                print(f"Warning: Failed to create index {key} on {coll.name}: {e}")
                
    try:
        answers_collection.create_index([("interview_id", 1), ("question_id", 1)], unique=True)
    except Exception:
        pass
    print("MongoDB connected and initialized.")
