from pymongo import MongoClient  
import os  
from dotenv import load_dotenv  
load_dotenv()  
client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017/'))  
db = client['AI_Interview']  
print('Null ai_call_id count:', db.interview_sessions.count_documents({'ai_call_id': None}))  
print('Null omni_call_id count:', db.interview_sessions.count_documents({'omni_call_id': None}))  
