import urllib.request
import json
url = 'https://api.github.com/repos/OragantiSagar041/AI_Adaptive_Interview/actions/runs/33041744161/jobs'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        for j in data.get('jobs', []):
            print(f"Job {j['name']} - Status: {j['status']} - Conclusion: {j['conclusion']}")
            for step in j.get('steps', []):
                if step['conclusion'] == 'failure':
                    print(f"  Step failed: {step['name']}")
except Exception as e:
    print('Failed:', e)
