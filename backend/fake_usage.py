import sys, os
sys.path.append(os.getcwd())
from dotenv import load_dotenv
load_dotenv()
from mongo_db import admins_collection

# Test_123 has 11372 total allocated. Let's make their current balance 6372 (so they used 5000)
admins_collection.update_one({'username': 'Test_123'}, {'$set': {'credits': 6372}})

# Test_1 has 10380 total allocated. Let's make their current balance 2000 (so they used 8380)
admins_collection.update_one({'username': 'Test_1'}, {'$set': {'credits': 2000}})

print('Successfully faked some credit usage so the bars will show up!')
