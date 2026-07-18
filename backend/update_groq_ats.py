import sys
import re

content = open('app/routes.py', 'r', encoding='utf-8').read()

groq_code = '''            import os
            groq_key = os.getenv("GROQ_API_KEY")
            if groq_key:
                from groq import Groq
                client = Groq(api_key=groq_key.strip())
                response = client.chat.completions.create(
                    model="llama3-8b-8192",
                    messages=[
                        {"role": "system", "content": "You are a precise ATS scoring engine. Return ONLY valid JSON. No markdown. Be extremely fast and concise."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.0,
                    max_tokens=300
                )
                raw = response.choices[0].message.content
            else:
                raw = chat_completion(
                    messages=[
                        {"role": "system", "content": "You are a precise ATS scoring engine. Return ONLY valid JSON. No markdown. Be extremely fast and concise."},
                        {"role": "user", "content": prompt},
                    ],
                    model="openai/gpt-4o-mini",
                    temperature=0.0,
                    timeout=15,
                    max_tokens=300,
                )
'''

# Find the chat_completion call for ats_score
pattern = r'            raw = chat_completion\([\s\S]*?max_tokens=300,\n            \)'

if 'openai/gpt-4o-mini' in content and 'raw = chat_completion' in content:
    new_content = re.sub(pattern, groq_code.strip('\n'), content, count=1)
    
    with open('app/routes.py', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("SUCCESS")
else:
    print("FAILED")
