from mongo_db import interview_sessions_collection

print("Status Counts:")
pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
for doc in interview_sessions_collection.aggregate(pipeline):
    print(doc)

print("\nRecent 5 sessions:")
for s in interview_sessions_collection.find().sort("created_at", -1).limit(5):
    print(f"- Link: {s.get('link_id')}, Status: {s.get('status')}, Exp: {s.get('expires_at')}")
