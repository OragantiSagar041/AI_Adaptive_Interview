import pymongo
from datetime import datetime, timezone
import os

# Connect to MongoDB
MONGO_URI = os.getenv("MONGO_URI")
client = pymongo.MongoClient(MONGO_URI)
db = client["mock_interview_db"]
interview_sessions_collection = db["interview_sessions"]

sessions = list(interview_sessions_collection.find({"status": "started"}))
print(f"Found {len(sessions)} started sessions.")

now = datetime.now(timezone.utc)
for row in sessions:
    status = row.get("status")
    created_at_str = row.get("created_at")
    started_at_str = row.get("started_at")
    time_ref_str = started_at_str or created_at_str
    
    print(f"Session {row.get('link_id')}: status={status}, started_at={started_at_str}, created_at={created_at_str}")
    if time_ref_str:
        try:
            time_ref = datetime.fromisoformat(time_ref_str.replace('Z', '+00:00'))
            if time_ref.tzinfo is None:
                time_ref = time_ref.replace(tzinfo=timezone.utc)
            duration_mins = row.get("interview_duration")
            buffer_mins = max(120, (duration_mins or 30) * 2)
            elapsed = (now - time_ref).total_seconds()
            print(f"  -> Elapsed: {elapsed} seconds (Threshold: {buffer_mins * 60} seconds)")
            if elapsed > (buffer_mins * 60):
                print(f"  -> SHOULD BE EXPIRED")
        except Exception as e:
            print(f"  -> Error: {e}")
