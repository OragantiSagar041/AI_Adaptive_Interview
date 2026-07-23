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
    candidate_indexes = candidates_collection.index_information()
    name_index = candidate_indexes.get("name_1")
    if name_index and name_index.get("unique"):
        # Candidate names are not identities. The legacy unique index merged or
        # rejected different people who happened to share the same name.
        candidates_collection.drop_index("name_1")
    candidates_collection.create_index("name")
    admins_collection.create_index("username", unique=True)
    interview_sessions_collection.create_index("link_id", unique=True)
    answers_collection.create_index([("interview_id", 1), ("question_id", 1)], unique=True)
    interviews_collection.create_index("id", unique=True)
    plans_collection.create_index("plan_name", unique=True)
    payment_orders_collection.create_index("order_id", unique=True)
    payment_orders_collection.create_index("payment_id", unique=True, sparse=True)
    pending_signups_collection.create_index("expires_at", expireAfterSeconds=0)
    admins_collection.create_index("stripe_session_id", unique=True, sparse=True)
    print("MongoDB connected and initialized.")
