import asyncio
import os
import time
import pymongo
from dotenv import load_dotenv

load_dotenv()
client = pymongo.MongoClient(os.getenv('MONGO_URI'))
db = client['AI_Interview']

import motor.motor_asyncio
import app.routes as routes

async def main():
    admin = db['admins'].find_one({'email': 'arah123@gmail.com'})
    admin['admin_id'] = str(admin['_id'])
    res = await routes.get_dashboard_aggregated_data(None, False, admin)
    print("Candidates:", len(res.get('candidates', [])))

if __name__ == '__main__':
    asyncio.run(main())
