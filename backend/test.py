import urllib.request, urllib.error, json; req = urllib.request.Request('http://localhost:8000/api/register', data=json.dumps({'name': 'Sagar', 'email': 'admin@gmail.com', 'company_name': 'No', 'phone': '1234567890', 'password': 'pass', 'plan': 'Free Trial'}).encode('utf-8'), headers={'Content-Type': 'application/json', 'Origin': 'http://localhost:3000'}); 
try:
    urllib.request.urlopen(req)
except urllib.error.HTTPError as e:
    print(e.read().decode('utf-8'))
