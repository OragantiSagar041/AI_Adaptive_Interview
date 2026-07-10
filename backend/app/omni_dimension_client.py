import json
from omnidimension import Client
from .config import OMNI_DIMENSION_API_KEY, OMNI_VOICE_ID, OMNI_AGENT_ID

def get_omni_client():
    if not OMNI_DIMENSION_API_KEY:
        raise ValueError("OMNI_DIMENSION_API_KEY is not set.")
    return Client(OMNI_DIMENSION_API_KEY)

def start_omni_call(phone_number: str, candidate_name: str, job_description: str, resume_text: str, duration: int, skills: str):
    """
    Start an AI call using Omni Dimension.
    """
    client = get_omni_client()
    
    # Format phone number to E.164
    import re
    phone_number = re.sub(r'[^\d+]', '', phone_number)
    if not phone_number.startswith('+'):
        if len(phone_number) == 10:
            phone_number = f"+91{phone_number}"
        elif len(phone_number) == 12 and phone_number.startswith('91'):
            phone_number = f"+{phone_number}"
        elif len(phone_number) == 11 and phone_number.startswith('1'):
            phone_number = f"+{phone_number}"
        else:
            phone_number = f"+{phone_number}"
    
    # Construct call context
    context = {
        "candidate_name": candidate_name,
        "job_description": job_description,
        "resume_text": resume_text,
        "interview_duration": duration,
        "required_skills": skills,
        "voice_id": OMNI_VOICE_ID
    }
    
    # The API requires agent_id to be an integer.
    try:
        agent_id = int(OMNI_AGENT_ID) if OMNI_AGENT_ID else 1
    except ValueError:
        raise ValueError(f"OMNI_DIMENSION_AGENT_ID must be an integer, but got: '{OMNI_AGENT_ID}'. Please update your .env file.")

    
    try:
        response = client.call.dispatch_call(
            agent_id=agent_id,
            to_number=phone_number,
            call_context=context
        )
        return response
    except Exception as e:
        print(f"[OmniDimension Error] Failed to start call: {e}")
        raise

def get_omni_call_status(call_id: str):
    """
    Fetch the status of a dispatched call.
    """
    client = get_omni_client()
    try:
        response = client.call.get_call_log(call_id)
        return response
    except Exception as e:
        print(f"[OmniDimension Error] Failed to get call status: {e}")
        raise
