import sys
import re

content = open('app/routes.py', 'r', encoding='utf-8').read()

helper_code = '''
import threading
def process_temp_cloudinary_upload(temp_url: str, collection_name: str, document_id: str, field_name: str):
    if not temp_url or not temp_url.startswith("temp://"):
        return
    import os
    import cloudinary.uploader
    filename = temp_url.replace("temp://", "")
    temp_path = os.path.join(os.getcwd(), "temp_uploads", filename)
    
    if os.path.exists(temp_path):
        try:
            with open(temp_path, "rb") as f:
                content = f.read()
            upload_res = cloudinary.uploader.upload(
                content,
                resource_type="raw",
                folder="jds" if "jd" in field_name.lower() else "resumes",
                public_id=filename
            )
            secure_url = upload_res.get("secure_url")
            
            if collection_name == "interviews":
                interviews_collection.update_one({"id": document_id}, {"$set": {field_name: secure_url}})
            elif collection_name == "interview_sessions":
                interview_sessions_collection.update_one({"link_id": document_id}, {"$set": {field_name: secure_url}})
        except Exception as e:
            print(f"Background upload failed: {e}")
        finally:
            try:
                os.remove(temp_path)
            except:
                pass
'''

# 1. Add helper at the top (after imports)
if 'def process_temp_cloudinary_upload' not in content:
    content = content.replace('from pydantic import BaseModel, EmailStr', helper_code + '\nfrom pydantic import BaseModel, EmailStr')


# 2. Wire it in create_session
insertion = '''    interview_sessions_collection.insert_one(session_doc)
    
    # Process temp JD/Resume URLs in the background
    if data.jd_file_url and data.jd_file_url.startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.jd_file_url, "interview_sessions", link_id, "jd_file_url")).start()
    if getattr(data, "resume_url", None) and getattr(data, "resume_url").startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.resume_url, "interview_sessions", link_id, "resume_url")).start()
'''
content = content.replace('    interview_sessions_collection.insert_one(session_doc)', insertion, 1)

# 3. Wire it in bulk_create_sessions
# In bulk_create_sessions:
#     if bulk_data.jd_file_url and bulk_data.jd_file_url.startswith("temp://"):
#         threading.Thread(target=process_temp_cloudinary_upload, args=(bulk_data.jd_file_url, "interview_sessions", link_id, "jd_file_url")).start()
# Wait, bulk creation iterates through candidates. The JD file URL is shared. We only need to upload it ONCE, and update ALL link_ids?
# Or update the first link_id, but the JD URL is shared across all candidates in a bulk session!
# Actually, bulk_create_sessions creates multiple interview_sessions. If we update the URL in Cloudinary, we just want to save that secure URL for all of them.
# The simplest approach: we upload the JD file in background ONCE, and then update ALL sessions that share this bulk batch.
# Let's see how bulk_create_sessions handles jd_file_url.

with open('app/routes.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('SUCCESS')
