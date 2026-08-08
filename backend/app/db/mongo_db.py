import os
# pyrefly: ignore [missing-import]
from pymongo import MongoClient
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

try:
    # pyrefly: ignore [missing-import]
    import dns.resolver
    dns.resolver.default_resolver = dns.resolver.Resolver(configure=False)
    dns.resolver.default_resolver.nameservers = ['8.8.8.8', '8.8.4.4', '1.1.1.1']
except Exception as e:
    print(f"Warning: Could not configure custom DNS resolver: {e}")

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(
    MONGO_URI,
    connect=False,
    maxPoolSize=50,           # allow more concurrent connections
    minPoolSize=5,            # keep warm connections ready
    serverSelectionTimeoutMS=5000,
    connectTimeoutMS=5000,
    socketTimeoutMS=30000,
    heartbeatFrequencyMS=10000,   # reduce heartbeat overhead
    retryWrites=True,
    compressors=["zstd", "zlib"],  # compress wire traffic
)
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
crash_logs_collection = db["crash_logs"]
agents_collection = db["agents"]
counters_collection = db["counters"]
demo_requests_collection = db["demo_requests"]
contact_requests_collection = db["contact_requests"]
payment_orders_collection = db["payment_orders"]
pending_signups_collection = db["pending_signups"]
security_logs_collection = db["security_logs"]
security_policies_collection = db["security_policies"]
copilot_sessions_collection = db["copilot_sessions"]
credit_ledger_collection = db["credit_ledger"]
messages_collection = db["messages"]

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
    from pymongo.errors import OperationFailure
    
    def safe_create_index(collection, index_keys, **kwargs):
        try:
            collection.create_index(index_keys, **kwargs)
        except OperationFailure:
            try:
                if isinstance(index_keys, str):
                    name = f"{index_keys}_1"
                else:
                    name = "_".join([f"{k}_{v}" for k, v in index_keys])
                collection.drop_index(name)
                collection.create_index(index_keys, **kwargs)
            except Exception as e:
                print(f"Warning: Failed to fix index {index_keys} on {collection.name}: {e}")

    safe_create_index(candidates_collection, "name", unique=True)
    safe_create_index(admins_collection, "username", unique=True)
    safe_create_index(interview_sessions_collection, "link_id", unique=True)
    safe_create_index(answers_collection, [("interview_id", 1), ("question_id", 1)], unique=True)
    safe_create_index(interviews_collection, "id", unique=True)
    safe_create_index(plans_collection, "plan_name", unique=True)
    candidate_indexes = candidates_collection.index_information()
    name_index = candidate_indexes.get("name_1")
    if name_index and name_index.get("unique"):
        # Candidate names are not identities. The legacy unique index merged or
        # rejected different people who happened to share the same name.
        try:
            candidates_collection.drop_index("name_1")
        except OperationFailure as exc:
            # Another startup process may have removed the legacy index first.
            if getattr(exc, "code", None) != 27:
                raise
    
    safe_create_index(candidates_collection, "name")
    safe_create_index(admins_collection, "username", unique=True)
    safe_create_index(interview_sessions_collection, "link_id", unique=True)
    safe_create_index(interview_sessions_collection, [("company_id", 1), ("created_at", -1)])
    safe_create_index(interview_sessions_collection, [("created_at", -1)])
    safe_create_index(answers_collection, [("interview_id", 1), ("question_id", 1)], unique=True)
    safe_create_index(interviews_collection, "id", unique=True)
    safe_create_index(plans_collection, "plan_name", unique=True)
    safe_create_index(payment_orders_collection, "order_id", unique=True)
    safe_create_index(payment_orders_collection, "payment_id", unique=True, sparse=True)
    safe_create_index(pending_signups_collection, "expires_at", expireAfterSeconds=0)
    safe_create_index(admins_collection, "stripe_session_id", unique=True, sparse=True)
    print("MongoDB connected and initialized.")
