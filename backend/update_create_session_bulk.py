import sys
import re

content = open('app/routes.py', 'r', encoding='utf-8').read()

helper_code = '''
import threading
def process_temp_cloudinary_upload(temp_url: str, collection_name: str, field_name: str):
    if not temp_url or not temp_url.startswith("temp://"):
        return
    import os
    import cloudinary.uploader
    filename = temp_url.replace("temp://", "")
    temp_path = os.path.join(os.getcwd(), "temp_uploads", filename)
    
    if os.path.exists(temp_path):
        try:
            with open(temp_path, "rb") as f:
                content_bytes = f.read()
            upload_res = cloudinary.uploader.upload(
                content_bytes,
                resource_type="raw",
                folder="jds" if "jd" in field_name.lower() else "resumes",
                public_id=filename
            )
            secure_url = upload_res.get("secure_url")
            
            if collection_name == "interviews":
                interviews_collection.update_many({field_name: temp_url}, {"$set": {field_name: secure_url}})
            elif collection_name == "interview_sessions":
                interview_sessions_collection.update_many({field_name: temp_url}, {"$set": {field_name: secure_url}})
        except Exception as e:
            print(f"Background upload failed: {e}")
        finally:
            try:
                os.remove(temp_path)
            except:
                pass
'''

# 1. Update the helper code (I will just replace the old one)
content = re.sub(r'def process_temp_cloudinary_upload.*?except:\n                pass', helper_code.strip(), content, flags=re.DOTALL)


# 2. Update the create_session calls
new_create_session = '''    interview_sessions_collection.insert_one(session_doc)
    
    # Process temp JD/Resume URLs in the background
    if data.jd_file_url and data.jd_file_url.startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.jd_file_url, "interview_sessions", "jd_file_url")).start()
    if getattr(data, "resume_url", None) and getattr(data, "resume_url").startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.resume_url, "interview_sessions", "resume_url")).start()
'''

content = re.sub(r'    # Process temp JD/Resume URLs.*?resume_url"\)\)\.start\(\)\n', '', content, flags=re.DOTALL)
content = content.replace('    interview_sessions_collection.insert_one(session_doc)', new_create_session, 1)

# 3. Add to bulk_create_sessions
bulk_insertion = '''    # Process temp JD URLs in the background for bulk sessions
    if data.jd_file_url and data.jd_file_url.startswith("temp://"):
        threading.Thread(target=process_temp_cloudinary_upload, args=(data.jd_file_url, "interview_sessions", "jd_file_url")).start()
'''
content = content.replace('    process_bulk_emails_task.delay(email_jobs)', '    process_bulk_emails_task.delay(email_jobs)\n' + bulk_insertion, 1)


with open('app/routes.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('SUCCESS')
