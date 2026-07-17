from sqlalchemy import select, update, delete
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import Session
from app.database_pg import Base
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, func, ForeignKey
from typing import List, Optional
from datetime import datetime

class Agent(Base):
    __tablename__ = 'agents'

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    omni_agent_id = Column(String(255), nullable=False)
    omni_api_key = Column(String(255), nullable=False)
    last_synced_at = Column(DateTime(timezone=True), nullable=True)
    sync_status = Column(String(32), nullable=False, default='PENDING')
    sync_error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class ConversationSection(Base):
    __tablename__ = 'conversation_sections'

    id = Column(Integer, primary_key=True, index=True)
    agent_id = Column(Integer, ForeignKey('agents.id', ondelete='CASCADE'), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    instruction = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True)
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

class AgentRepository:
    def __init__(self, session: Session):
        self.session = session

    def get_agent(self, agent_id: int) -> Optional[Agent]:
        stmt = select(Agent).where(Agent.id == agent_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def update_sync_status(self, agent_id: int, status: str, error: Optional[str] = None):
        stmt = update(Agent).where(Agent.id == agent_id).values(sync_status=status, sync_error=error, last_synced_at=func.now())
        self.session.execute(stmt)
        self.session.commit()

class ConversationSectionRepository:
    def __init__(self, session: Session):
        self.session = session

    def list_sections(self, agent_id: int) -> List[ConversationSection]:
        stmt = select(ConversationSection).where(ConversationSection.agent_id == agent_id).order_by(ConversationSection.display_order)
        return self.session.execute(stmt).scalars().all()

    def get_section(self, section_id: int) -> Optional[ConversationSection]:
        stmt = select(ConversationSection).where(ConversationSection.id == section_id)
        return self.session.execute(stmt).scalar_one_or_none()

    def create_section(self, agent_id: int, title: str, instruction: str, enabled: bool, display_order: int) -> ConversationSection:
        section = ConversationSection(
            agent_id=agent_id,
            title=title,
            instruction=instruction,
            enabled=enabled,
            display_order=display_order,
        )
        self.session.add(section)
        self.session.commit()
        self.session.refresh(section)
        return section

    def bulk_upsert_sections(self, agent_id: int, sections: List[dict]) -> List[ConversationSection]:
        existing = {section.id: section for section in self.list_sections(agent_id)}
        incoming_ids = {item['id'] for item in sections if item.get('id')}

        for section_id, section in existing.items():
            if section_id not in incoming_ids:
                self.session.delete(section)

        result_sections: List[ConversationSection] = []
        for section_data in sections:
            section_id = section_data.get('id')
            if section_id and section_id in existing:
                section = existing[section_id]
                section.title = section_data['title']
                section.instruction = section_data['instruction']
                section.enabled = section_data['enabled']
                section.display_order = section_data['display_order']
                self.session.add(section)
            else:
                section = ConversationSection(
                    agent_id=agent_id,
                    title=section_data['title'],
                    instruction=section_data['instruction'],
                    enabled=section_data['enabled'],
                    display_order=section_data['display_order'],
                )
                self.session.add(section)
            result_sections.append(section)

        self.session.commit()
        for section in result_sections:
            self.session.refresh(section)
        return result_sections

    def update_section(self, section: ConversationSection, **fields):
        for key, value in fields.items():
            if value is not None:
                setattr(section, key, value)
        self.session.add(section)
        self.session.commit()
        self.session.refresh(section)
        return section

    def update_section(self, section: ConversationSection, **fields):
        for key, value in fields.items():
            if value is not None:
                setattr(section, key, value)
        self.session.add(section)
        self.session.commit()
        self.session.refresh(section)
        return section

    def delete_section(self, section: ConversationSection):
        self.session.delete(section)
        self.session.commit()

    def reorder_sections(self, agent_id: int, section_ids: List[int]):
        for index, section_id in enumerate(section_ids):
            stmt = update(ConversationSection).where(ConversationSection.id == section_id, ConversationSection.agent_id == agent_id).values(display_order=index)
            self.session.execute(stmt)
        self.session.commit()

    def get_enabled_sorted_sections(self, agent_id: int) -> List[ConversationSection]:
        stmt = select(ConversationSection).where(ConversationSection.agent_id == agent_id, ConversationSection.enabled == True).order_by(ConversationSection.display_order)
        return self.session.execute(stmt).scalars().all()
