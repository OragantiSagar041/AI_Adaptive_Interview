import logging
from datetime import datetime
from typing import List, Optional

from app.repositories.conversation_repository import AgentRepository, ConversationSectionRepository
from app.service_layer.omni_client import OmniDimensionClient

logger = logging.getLogger(__name__)

class ConversationFlowSyncService:
    def __init__(self, agent_id: int):
        self.agent_repo = AgentRepository()
        self.section_repo = ConversationSectionRepository()
        self.agent = self.agent_repo.get_agent(agent_id)
        if not self.agent:
            raise ValueError(f"Agent not found: {agent_id}")
        self.omni_client = OmniDimensionClient(self.agent.omni_api_key)

    def save_section(self, title: str, instruction: str, enabled: bool, display_order: int):
        logger.info("Database Save: create section for agent %s", self.agent.id)
        section = self.section_repo.create_section(self.agent.id, title, instruction, enabled, display_order)
        self._sync_whole_flow()
        return section

    def update_section(self, section_id: int, title: Optional[str], instruction: Optional[str], enabled: Optional[bool], display_order: Optional[int], updated_at: datetime):
        section = self.section_repo.get_section(section_id)
        if not section:
            raise ValueError("Section not found")
        if section.updated_at and section.updated_at > updated_at:
            raise ValueError("Conflict: section has been updated by another user")
        logger.info("Database Save: update section %s for agent %s", section_id, self.agent.id)
        updated = self.section_repo.update_section(section, title=title, instruction=instruction, enabled=enabled, display_order=display_order)
        self._sync_whole_flow()
        return updated

    def delete_section(self, section_id: int):
        section = self.section_repo.get_section(section_id)
        if not section:
            raise ValueError("Section not found")
        logger.info("Database Save: delete section %s for agent %s", section_id, self.agent.id)
        self.section_repo.delete_section(section)
        self._sync_whole_flow()

    def toggle_section(self, section_id: int, enabled: bool):
        section = self.section_repo.get_section(section_id)
        if not section:
            raise ValueError("Section not found")
        logger.info("Database Save: toggle section %s for agent %s to %s", section_id, self.agent.id, enabled)
        updated = self.section_repo.update_section(section, enabled=enabled)
        self._sync_whole_flow()
        return updated

    def reorder_sections(self, section_ids: List[int]):
        logger.info("Database Save: reorder sections for agent %s", self.agent.id)
        self.section_repo.reorder_sections(self.agent.id, section_ids)
        self._sync_whole_flow()

    def bulk_save_sections(self, sections: List[dict]):
        logger.info("Database Save: bulk save %s sections for agent %s", len(sections), self.agent.id)
        saved = self.section_repo.bulk_upsert_sections(self.agent.id, sections)
        self._sync_whole_flow()
        return saved

    def build_conversation_flow(self) -> List[dict]:
        sections = self.section_repo.list_sections(self.agent.id)
        sorted_sections = sorted(sections, key=lambda section: section.display_order)
        flow = []
        for section in sorted_sections:
            flow.append({
                "title": section.title,
                "instruction": section.instruction,
                "is_enabled": bool(section.enabled),
            })
        return flow

    def sync_to_omni(self) -> None:
        logger.info("Sync Started: agent %s", self.agent.id)
        flow = self.build_conversation_flow()
        try:
            self.omni_client.update_conversation_flow(self.agent.omni_agent_id, flow)
            self.agent_repo.update_sync_status(self.agent.id, status='SUCCESS', error=None)
            logger.info("Sync Success: agent %s", self.agent.id)
        except Exception as exc:
            error_msg = str(exc)
            self.agent_repo.update_sync_status(self.agent.id, status='FAILED', error=error_msg)
            logger.error("Sync Failure: agent %s %s", self.agent.id, error_msg)
            raise

    def retry_failed_sync(self):
        logger.info("Retry Sync: agent %s", self.agent.id)
        if self.agent.sync_status != 'FAILED':
            return
        try:
            self.sync_to_omni()
            logger.info("Retry Success: agent %s", self.agent.id)
        except Exception as exc:
            logger.error("Retry Failure: agent %s %s", self.agent.id, exc)
            raise

    def _sync_whole_flow(self) -> None:
        try:
            self.sync_to_omni()
        except Exception:
            logger.warning("Background sync failed for agent %s", self.agent.id)
