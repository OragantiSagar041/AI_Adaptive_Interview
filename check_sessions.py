import sys, os
sys.path.append(os.path.join(os.getcwd(), 'backend'))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.getcwd(), 'backend', '.env'))
from backend.mongo_db import interview_sessions_collection, companies_collection, admins_collection

sa = admins_collection.find_one({'role': 'super_admin'})
company_id = sa['company_id'] if sa else None

if company_id:
    sessions = list(interview_sessions_collection.find(
        {'company_id': str(company_id), 'status': 'completed'}
    ).sort('created_at', -1).limit(30))
    print('Top 30 recent completed sessions:')
    for i, s in enumerate(sessions):
        print(f"{i+1}: {s.get('candidate_name')} | Decision: {s.get('decision')}")
