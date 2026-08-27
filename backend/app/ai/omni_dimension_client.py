import json
import hashlib
import os
import re
from typing import Optional, Tuple
from omnidimension import Client
import redis
from app.core.config import get_omni_dimension_api_key, get_omni_voice_id, get_omni_agent_id

_OMNI_CACHE_TTL = int(os.getenv("OMNI_CACHE_TTL_SECONDS", "15"))
_omni_cache = None


def _get_omni_cache():
    global _omni_cache
    if _omni_cache is not None:
        return _omni_cache
    try:
        _omni_cache = redis.Redis.from_url(
            os.getenv("REDIS_URL", "redis://localhost:6379/0"),
            decode_responses=True,
            socket_connect_timeout=0.25,
            socket_timeout=0.25,
            protocol=2,
        )
        _omni_cache.ping()
    except Exception:
        _omni_cache = False
    return _omni_cache


def _omni_cache_key(api_key: Optional[str], resource: str) -> str:
    account = api_key or get_omni_dimension_api_key() or "default"
    digest = hashlib.sha256(account.encode("utf-8")).hexdigest()[:20]
    return f"omni:{resource}:{digest}"


def get_cached_omni_json(api_key: Optional[str], resource: str):
    cache = _get_omni_cache()
    if not cache:
        return None
    try:
        raw = cache.get(_omni_cache_key(api_key, resource))
        return json.loads(raw) if raw else None
    except Exception:
        return None


def set_cached_omni_json(api_key: Optional[str], resource: str, value):
    cache = _get_omni_cache()
    if not cache:
        return
    try:
        cache.setex(_omni_cache_key(api_key, resource), _OMNI_CACHE_TTL, json.dumps(value))
    except Exception:
        pass


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
    Resolve the Omni Dimension SDK client, target agent object, and agent ID for the provided API key.
    Checks configured OMNI_DIMENSION_AGENT_ID or OMNI_DIMENSION_VOICE_ID before fallback.
    Returns: (client, agent_dict, agent_id_str)
    """
    client = get_omni_client(api_key)

    cached = get_cached_omni_json(api_key, "account")
    if cached and isinstance(cached, dict) and cached.get("agent"):
        return client, cached["agent"], str(cached.get("agent_id") or cached["agent"].get("id"))
    
    configured_agent_id = str(get_omni_agent_id() or "").strip()
    configured_voice_id = str(get_omni_voice_id() or "").strip()

    agent_id = configured_agent_id or "1"
    agent_data = {}
    agents_list = []

    # Fetch agent list for this API key
    try:
        if hasattr(client, 'agent') and hasattr(client.agent, 'list'):
            res = client.agent.list()
            data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
            if isinstance(data, dict):
                agents_list = (
                    data.get("bots")
                    or data.get("agents")
                    or data.get("data")
                    or data.get("results")
                    or []
                )
            elif isinstance(data, list):
                agents_list = data
    except Exception as e:
        print(f"[get_omni_account note] Unable to list agents via SDK: {e}")

    # Find agent matching configured_agent_id or configured_voice_id
    selected_agent = None
    if isinstance(agents_list, list) and len(agents_list) > 0:
        if configured_agent_id:
            selected_agent = next((a for a in agents_list if isinstance(a, dict) and str(a.get("id") or a.get("agent_id")) == configured_agent_id), None)
        if selected_agent is None and configured_voice_id:
            selected_agent = next((a for a in agents_list if isinstance(a, dict) and str(a.get("voice") or a.get("voice_external_id")) == configured_voice_id), None)
        if selected_agent is None:
            selected_agent = agents_list[0] if isinstance(agents_list[0], dict) else {}

    if isinstance(selected_agent, dict) and selected_agent:
        agent_data = selected_agent
        agent_id = str(selected_agent.get("id") or selected_agent.get("agent_id") or agent_id)

    # Fetch detailed agent parameters
    try:
        if hasattr(client, 'agent') and hasattr(client.agent, 'get'):
            res = client.agent.get(agent_id=agent_id)
            data = res.get('json', res) if isinstance(res, dict) else (res.json if hasattr(res, 'json') else res)
            if isinstance(data, dict):
                agent_obj = data.get("bot") or data.get("agent") or data.get("data") or data
                if isinstance(agent_obj, dict) and agent_obj:
                    agent_data = {**agent_data, **agent_obj}
    except Exception as e:
        print(f"[get_omni_account note] Unable to get detailed agent {agent_id} via SDK: {e}")

    set_cached_omni_json(api_key, "account", {"agent": agent_data, "agent_id": agent_id})
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
