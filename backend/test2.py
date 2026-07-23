from pymongo import MongoClient  
import os  
from dotenv import load_dotenv  
load_dotenv()  
client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017/'))  
db = client['AI_Interview']  
print('Null call_id count:', db.omni_call_logs.count_documents({'call_id': None}))  
for m in db.omni_call_logs.find().sort('_id', -1).limit(3): print('Call ID:', m.get('call_id'), 'Admin:', m.get('admin_id'))  
