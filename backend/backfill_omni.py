import os, datetime
from dotenv import load_dotenv
load_dotenv('backend/.env')
# pyrefly: ignore [missing-import]
from omnidimension import Client
client = Client(os.getenv('OMNI_DIMENSION_API_KEY'))

response = client.call.get_call_logs()

logs = []
try:
    # Try dictionary access first
    if 'json' in response:
        logs = response['json'].get('call_log_data', [])
    else:
        logs = response.get('call_log_data', [])
except Exception as e:
    # If not a dict, maybe it's an object
    try:
        if hasattr(response, 'json') and isinstance(response.json, dict):
            logs = response.json.get('call_log_data', [])
        else:
            logs = getattr(response, 'call_log_data', [])
    except Exception as e2:
        print(f"Error accessing logs: {e}, {e2}")

import json
print(f"Total logs in response: {len(logs)}")
if len(logs) == 0:
    print("Response structure:")
    print(json.dumps(response, indent=2))

from pymongo import MongoClient
m = MongoClient(os.getenv('MONGO_URI'))
db = m['AI_Interview']
col = db['omni_call_logs']

for log in logs:
    duration = int(log.get('call_duration_in_seconds', 0))
    mins, secs = divmod(duration, 60)
    
    # Check if recording_url is a relative path. If so, make it absolute.
    rec_url = log.get('recording_url')
    if rec_url and str(rec_url).startswith('/'):
        rec_url = 'https://backend.omnidim.io' + rec_url

    col.update_one(
        {'call_id': str(log['id'])}, 
        {'$set': {
            'call_id': str(log['id']), 
            'candidate_name': log.get('user_name') or 'Candidate', 
            'phone_number': log.get('to_number'), 
            'status': log.get('call_status'), 
            'duration': f"{mins}m {secs}s", 
            'recording_url': rec_url, 
            'created_at': log.get('time_of_call') or datetime.datetime.now(datetime.timezone.utc).isoformat()
        }}, 
        upsert=True
    )

print(f'Backfilled {len(logs)} calls.')
