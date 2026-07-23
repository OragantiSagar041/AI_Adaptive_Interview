from pymongo import MongoClient  
import os  
from dotenv import load_dotenv  
load_dotenv()  
client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017/'))  
db = client['AI_Interview']  
m = db.omni_call_logs.find_one({'call_id': None})  
print(m)  
