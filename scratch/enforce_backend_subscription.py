import re

filepath = r'c:\Users\sagar\Downloads\mock-interview\backend\uploded.py'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

bulk_regex = r'(@app\.post\("/admin/bulk-create-sessions"\)\s*async def bulk_create_sessions\(.*?\):)'
match = re.search(bulk_regex, content, re.DOTALL)
if match:
    replacement = match.group(1) + '''
    from bson import ObjectId
    # ENFORCE SUBSCRIPTION PLAN
    admin_user = admins_collection.find_one({"_id": ObjectId(admin_id)})
    if admin_user and admin_user.get("role") != "master":
        if admin_user.get("subscription_plan") not in ["advance"]:
            raise HTTPException(status_code=403, detail="Bulk interviews require the Advance subscription plan. Please contact your administrator to upgrade.")
'''
    content = content.replace(match.group(1), replacement)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Enforced backend subscription restriction successfully.")
else:
    print("Could not find /admin/bulk-create-sessions endpoint.")
