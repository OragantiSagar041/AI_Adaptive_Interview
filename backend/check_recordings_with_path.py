from mongo_db import interviews_collection
import json

print("\n--- Interviews with Recordings ---")
for i in interviews_collection.find({"recording_path": {"$exists": True, "$ne": None}}).sort("_id", -1).limit(10):
    print(f"ID: {i.get('id', 'N/A')}, Path: {i.get('recording_path', 'N/A')}")
