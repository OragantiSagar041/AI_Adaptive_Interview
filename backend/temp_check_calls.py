import sys
sys.path.append('c:/Users/xx/Downloads/AI_Adaptive_Interview/backend')
from app.routes import get_omni_recent_calls
admin_vyshnavi = {
    'admin_id': '6a605009f16c4408137235d7',
    'company_id': '6a605008f16c4408137235d6',
    'role': 'super_admin',
    'name': 'vyshnavi',
    'username': 'vyshnavivissa@gmail.com'
}
res = get_omni_recent_calls(current_admin=admin_vyshnavi)
if isinstance(res, dict):
    calls = res.get('calls', [])
    print(f'Total returned: {res.get("total")}')
    for c in calls:
        print(f'ID: {c.get("id") or c.get("call_id")}')
else:
    print('Failed:', res.body)
