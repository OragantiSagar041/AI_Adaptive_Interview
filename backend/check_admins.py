from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017/'))
db = client['AI_Interview']
for admin in db.admins.find({'role': 'admin'}):
    print(f"Admin: {admin.get('username')}, company_id: {admin.get('company_id')} ({type(admin.get('company_id'))})")
