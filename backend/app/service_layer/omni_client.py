import logging
from typing import Any, Dict, List
import requests

logger = logging.getLogger(__name__)

class OmniDimensionClient:
    BASE_URL = "https://backend.omnidim.io/api/v1"

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def health_check(self, agent_id: str) -> bool:
        try:
            response = requests.get(f"{self.BASE_URL}/agents/{agent_id}", headers=self.headers, timeout=10)
            return response.status_code == 200
        except Exception as exc:
            logger.error("OmniDimension health check failed: %s", exc)
            return False

    def get_agent(self, agent_id: str) -> Dict[str, Any]:
        response = requests.get(f"{self.BASE_URL}/agents/{agent_id}", headers=self.headers, timeout=10)
        response.raise_for_status()
        return response.json()

    def update_conversation_flow(self, agent_id: str, conversation_flow: List[Dict[str, Any]]) -> Dict[str, Any]:
        payload = {
            "context_breakdown": [
                {
                    "title": section.get("title") or section.get("context_title"),
                    "body": section.get("instruction") or section.get("context_body"),
                    "is_enabled": bool(section.get("is_enabled", True)),
                }
                for section in conversation_flow
            ]
        }
        logger.info("OmniDimension sync payload for agent %s: %s", agent_id, payload)
        response = requests.put(
            f"{self.BASE_URL}/agents/{agent_id}",
            headers=self.headers,
            json=payload,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()
