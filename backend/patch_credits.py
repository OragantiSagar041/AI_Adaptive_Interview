import os
import sys
from dotenv import load_dotenv

# Load env variables from .env
load_dotenv()

# Set up path so we can import from mongo_db directly
sys.path.append(os.getcwd())

from mongo_db import admins_collection, interview_sessions_collection

def main():
    admins = admins_collection.find({})
    count = 0
    for admin in admins:
        if 'total_allocated_credits' not in admin:
            sessions_created = interview_sessions_collection.count_documents({'admin_id': str(admin['_id'])})
            current_credits = admin.get('credits', 0)
            total_allocated = current_credits + sessions_created
            
            admins_collection.update_one(
                {'_id': admin['_id']},
                {'$set': {'total_allocated_credits': total_allocated}}
            )
            count += 1
            print(f"Patched admin {admin.get('username')}: total_allocated_credits={total_allocated}")

    print(f'\nSuccessfully patched {count} admins with total_allocated_credits.')

if __name__ == '__main__':
    main()
