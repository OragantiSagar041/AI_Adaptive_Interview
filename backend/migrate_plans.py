import pymongo
from dotenv import load_dotenv
import os

load_dotenv()
client = pymongo.MongoClient(os.getenv("MONGO_URI", "mongodb+srv://oragantisagar041_db_user:ArahInfoTech123@cluster0.9x2n3ve.mongodb.net/?appName=Cluster0"))
db = client['AI_Interview']
for p in db.plans.find():
    if 'duration_days' in p:
        credits = 10 if p['plan_name'] == 'Free Trial' else 250 if p['plan_name'] == 'Basic' else 400 if p['plan_name'] == 'Advance' else 1000000
        db.plans.update_one({'_id': p['_id']}, {'$set': {'credits_granted': credits}, '$unset': {'duration_days': ''}})
print('Migration complete!')
