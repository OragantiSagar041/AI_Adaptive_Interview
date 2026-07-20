import sys
import re

content = open('app/routes.py', 'r', encoding='utf-8').read()

new_parse_resume = '''@router.post("/admin/parse-resume")
def parse_resume(
    file: UploadFile = File(...), 
    source: Optional[str] = Form(None),
    upload_to_cloud: Optional[str] = Form(None),
    current_admin: dict = Depends(get_current_admin_details)
):
    ALLOWED_MIMES = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword", "text/plain"]
    if file.content_type and file.content_type not in ALLOWED_MIMES:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, DOCX, and TXT are allowed for security reasons.")
        
    if getattr(file, "size", 0) and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 10MB.")
        
    content = file.file.read()
    text = extract_text_from_file(content, file.filename)
    
    file_url = None
    if upload_to_cloud and upload_to_cloud.lower() in ('true', '1', 'yes'):
        import os
        import uuid
        temp_dir = os.path.join(os.getcwd(), "temp_uploads")
        os.makedirs(temp_dir, exist_ok=True)
        temp_filename = f"{uuid.uuid4().hex[:8]}_{file.filename}"
        temp_path = os.path.join(temp_dir, temp_filename)
        with open(temp_path, "wb") as f:
            f.write(content)
        file_url = f"temp://{temp_filename}"

    info = {}
    if source != 'jd':
        info = extract_info_from_resume(text)
        
    return {
        "status": "success",   
        "text": text,
        "name": info.get("name"), 
        "email": info.get("email"),
        "file_url": file_url
    }
'''

new_content = re.sub(r'@router\.post\("/admin/parse-resume"\).*?return \{\n[^\}]+?\n    \}', new_parse_resume, content, flags=re.DOTALL)
if new_content == content:
    print('Failed to replace parse_resume')
    sys.exit(1)

with open('app/routes.py', 'w', encoding='utf-8') as f:
    f.write(new_content)
print('SUCCESS')
