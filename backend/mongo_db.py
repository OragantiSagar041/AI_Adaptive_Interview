import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

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


async def init_db_indexes():
    candidates_collection.create_index("name", unique=True)
    admins_collection.create_index("username", unique=True)
    interview_sessions_collection.create_index("link_id", unique=True)
    answers_collection.create_index([("interview_id", 1), ("question_id", 1)], unique=True)
    interviews_collection.create_index("id", unique=True)
    plans_collection.create_index("plan_name", unique=True)
    print("MongoDB connected and initialized.")
