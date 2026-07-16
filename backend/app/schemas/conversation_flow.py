from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

class ConversationSectionCreate(BaseModel):
    title: str
    instruction: str
    enabled: bool = True
    display_order: int

class ConversationSectionUpdate(BaseModel):
    title: Optional[str]
    instruction: Optional[str]
    enabled: Optional[bool]
    display_order: Optional[int]
    updated_at: datetime

class ConversationSectionResponse(BaseModel):
    id: int
    agent_id: int
    title: str
    instruction: str
    enabled: bool
    display_order: int
    created_at: datetime
    updated_at: datetime

class ConversationSectionBulkItem(BaseModel):
    id: Optional[int]
    title: str
    instruction: str
    enabled: bool = True
    display_order: int
    updated_at: Optional[datetime]

class BulkSectionsRequest(BaseModel):
    sections: List[ConversationSectionBulkItem]

class AgentResponse(BaseModel):
    id: int
    name: str
    omni_agent_id: str
    omni_api_key: str
    last_synced_at: Optional[datetime]
    sync_status: str
    sync_error: Optional[str]

class AgentCreate(BaseModel):
    name: str
    omni_agent_id: str
    omni_api_key: str

class AgentUpdate(BaseModel):
    name: Optional[str]
    omni_agent_id: Optional[str]
    omni_api_key: Optional[str]
