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
counters_collection = db["counters"]
demo_requests_collection = db["demo_requests"]

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
    candidates_collection.create_index("name", unique=True)
    admins_collection.create_index("username", unique=True)
    interview_sessions_collection.create_index("link_id", unique=True)
    answers_collection.create_index([("interview_id", 1), ("question_id", 1)], unique=True)
    interviews_collection.create_index("id", unique=True)
    plans_collection.create_index("plan_name", unique=True)
    print("MongoDB connected and initialized.")
