import pymongo
from dotenv import load_dotenv
import os

load_dotenv()
client = pymongo.MongoClient(os.getenv("MONGO_URI"))
db = client['AI_Interview']

# Plan to credits map
plan_credits = {
    'Free Trial': 10,
    'Basic': 250,
    'Advance': 400,
    'Unlimited': 1000000
}

# Migrate companies
for company in db.companies.find():
    if 'credits' not in company:
        plan_name = company.get('subscription_plan', 'Free Trial')
        credits = plan_credits.get(plan_name, 10)
        db.companies.update_one(
            {'_id': company['_id']},
            {'$set': {'credits': credits}}
        )

# Migrate admins (some admins might have direct subscriptions)
for admin in db.admins.find():
    if 'credits' not in admin:
        plan_name = admin.get('subscription_plan', 'Free Trial')
        credits = plan_credits.get(plan_name, 10)
        db.admins.update_one(
            {'_id': admin['_id']},
            {'$set': {'credits': credits}}
        )

print('Migration of companies and admins complete!')
