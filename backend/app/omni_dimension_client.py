import json
from omnidimension import Client
from .config import get_omni_dimension_api_key, get_omni_voice_id, get_omni_agent_id


def get_omni_client():
    api_key = get_omni_dimension_api_key()
    if not api_key:
        raise ValueError("OMNI_DIMENSION_API_KEY is not set.")
    return Client(api_key)

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
    voice_id = get_omni_voice_id()
    context = {
        "candidate_name": candidate_name,
        "job_description": job_description,
        "resume_text": resume_text,
        "interview_duration": duration,
        "required_skills": skills,
        "voice_id": voice_id
    }
    
    # The API requires agent_id to be an integer.
    agent_id_value = get_omni_agent_id()
    try:
        agent_id = int(agent_id_value) if agent_id_value else 1
    except ValueError:
        raise ValueError(f"OMNI_DIMENSION_AGENT_ID must be an integer, but got: '{agent_id_value}'. Please update your .env file.")

    
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
