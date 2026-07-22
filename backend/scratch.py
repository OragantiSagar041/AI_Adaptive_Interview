from app.services import chat_completion

def test():
    resume_text = 'John Doe\njohn.doe@example.com\nPhone: +91-9876543210\nExperience: 5 Years\nCurrent Company: OpenAI\nCurrent CTC: 15 LPA\nExpected CTC: 20 LPA\nNotice Period: 30 Days\nLocation: Bangalore'
    prompt = "Extract the following fields from this candidate resume:\n1. name (string)\n2. email (string)\n3. phone (string)\n4. experience (string, e.g., '2 Years' or '0 Years')\n5. location (string)\n6. current_company (string, e.g. 'Google' or 'N/A')\n7. current_ctc (string, e.g. '5 LPA' or 'N/A')\n8. expected_ctc (string, e.g. '8 LPA' or 'N/A')\n9. notice_period (string, e.g. '30 Days' or 'N/A')\n\nReturn a pure JSON object with these keys. If not found, return empty string for that key. Do not use markdown. Resume: " + resume_text
    try:
        resp = chat_completion(
            messages=[{"role": "user", "content": prompt}],
            model="openai/gpt-4o-mini",
            temperature=0.0,
            timeout=15
        )
        print("Response:", resp)
    except Exception as e:
        print("Error:", e)

test()
