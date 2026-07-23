import os, re  
from dotenv import load_dotenv  
from pymongo import MongoClient  
from omnidimension import Client  
load_dotenv()  
client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017/'))  
db = client['AI_Interview']  
omni_client = Client(os.getenv('OMNI_DIMENSION_API_KEY'))  
omni_calls = []  
page = 1  
while page == 1 or (len(omni_calls) < total_records and len(page_calls) == 100):  
    try: res = omni_client.call.get_call_logs(page=page, page_size=100)  
    except Exception as e: print(e); break  
    data = res.get('json', res) if isinstance(res, dict) else {}  
    page_calls = data.get('call_log_data', [])  
    if not page_calls: break  
    omni_calls.extend(page_calls)  
    total_records = data.get('total_records', 0)  
    page += 1  
print(f'Fetched {len(omni_calls)} calls from Omni')  
fixed_sessions = 0  
for s in db.interview_sessions.find({'omni_call_id': None}):  
    ph = re.sub(r'[\d]', '', str(s.get('candidate_phone') or ''))  
    if not ph: continue  
    for oc in omni_calls:  
        oph = re.sub(r'[\d]', '', str(oc.get('to_number') or ''))  
        if ph in oph or oph in ph:  
            req_id = oc.get('call_request_id', {}).get('id')  
            if req_id:  
                db.interview_sessions.update_one({'_id': s['_id']}, {'': {'omni_call_id': str(req_id), 'ai_call_id': str(req_id)}})  
                fixed_sessions += 1  
                break  
print(f'Fixed {fixed_sessions} sessions')  
fixed_manuals = 0  
for m in db.omni_call_logs.find({'call_id': None}):  
    ph = re.sub(r'[\d]', '', str(m.get('phone_number') or ''))  
    if not ph: continue  
    for oc in omni_calls:  
        oph = re.sub(r'[\d]', '', str(oc.get('to_number') or ''))  
        if ph in oph or oph in ph:  
            req_id = oc.get('call_request_id', {}).get('id')  
            if req_id:  
                db.omni_call_logs.update_one({'_id': m['_id']}, {'': {'call_id': str(req_id)}})  
                fixed_manuals += 1  
                break  
print(f'Fixed {fixed_manuals} manual logs')  
