from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()
mongo_uri = os.getenv("MONGO_URI")
client = MongoClient(mongo_uri)
db = client.get_database("hireiq")
sessions = db.interview_sessions

print("Status Counts:")
pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
for doc in sessions.aggregate(pipeline):
    print(doc)

print("\nRecent 5 sessions:")
for s in sessions.find().sort("created_at", -1).limit(5):
    print(f"- Link ID: {s.get('link_id')}, Status: {s.get('status')}, Exp: {s.get('expires_at')}")
