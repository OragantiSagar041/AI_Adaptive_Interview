import json
import re
from typing import Optional, Tuple
from omnidimension import Client
from .config import get_omni_dimension_api_key, get_omni_voice_id, get_omni_agent_id


def get_omni_client(api_key: Optional[str] = None) -> Client:
    """
    Get an Omni Dimension SDK Client using the provided API key or fallback to env.
    """
    effective_key = (api_key or get_omni_dimension_api_key() or "").strip()
    if not effective_key:
        raise ValueError("Omni Dimension API key is not configured. Please supply a valid API key.")
    return Client(effective_key)


def get_omni_account(api_key: Optional[str] = None) -> Tuple[Client, dict, str]:
    """
    Resolve the Omni Dimension SDK client, default agent object, and agent ID for the provided API key.
    Returns: (client, agent_dict, agent_id_str)
    """
    client = get_omni_client(api_key)
    
    agent_id = str(get_omni_agent_id() or "1")
    agent_data = {}
    
    # Try fetching agent list for this API key
    try:
        if hasattr(client, 'agent') and hasattr(client.agent, 'list'):
            res = client.agent.list()
            data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
            agents = (
                data.get("agents")
                or data.get("data")
                or data.get("results")
                or (data if isinstance(data, list) else [])
            )
            if isinstance(agents, list) and len(agents) > 0:
                first_agent = agents[0]
                if isinstance(first_agent, dict):
                    agent_data = first_agent
                    agent_id = str(first_agent.get("id") or first_agent.get("agent_id") or agent_id)
    except Exception as e:
        print(f"[get_omni_account note] Unable to list agents via SDK: {e}")

    # Fallback to fetching specific agent details if agent_id is known
    try:
        if hasattr(client, 'agent') and hasattr(client.agent, 'get'):
            res = client.agent.get(agent_id=agent_id)
            data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
            if isinstance(data, dict):
                agent_obj = data.get("agent") or data
                if isinstance(agent_obj, dict) and agent_obj:
                    agent_data = {**agent_data, **agent_obj}
    except Exception as e:
        print(f"[get_omni_account note] Unable to get agent {agent_id} via SDK: {e}")

    return client, agent_data, agent_id


def start_omni_call(
    phone_number: str,
    candidate_name: str,
    job_description: str,
    resume_text: str,
    duration: int,
    skills: str,
    api_key: Optional[str] = None
):
    """
    Start an AI call using Omni Dimension.
    """
    client = get_omni_client(api_key)
    
    # Format phone number to E.164
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
    
    _, _, resolved_agent_id = get_omni_account(api_key)
    try:
        agent_id = int(resolved_agent_id) if resolved_agent_id else 1
    except ValueError:
        agent_id = 1

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


def get_omni_call_status(call_id: str, api_key: Optional[str] = None):
    """
    Fetch the status of a dispatched call.
    """
    client = get_omni_client(api_key)
    try:
        response = client.call.get_call_log(call_id)
        return response
    except Exception as e:
        print(f"[OmniDimension Error] Failed to get call status: {e}")
        raise
