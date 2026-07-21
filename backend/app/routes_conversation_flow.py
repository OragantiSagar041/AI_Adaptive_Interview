from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.service_layer.conversation_flow_sync_service import ConversationFlowSyncService
from app.schemas.conversation_flow import (
    AgentCreate,
    AgentResponse,
    BulkSectionsRequest,
    ConversationSectionCreate,
    ConversationSectionResponse,
    ConversationSectionUpdate,
)
from app.services import get_current_admin_details

router = APIRouter(prefix='/api/conversation-flow', tags=['conversation-flow'])

def _get_agent_id_for_admin(admin_details: dict) -> int:
    return int(admin_details['company_id'])

def get_sync_service(current_admin: dict = Depends(get_current_admin_details)) -> ConversationFlowSyncService:
    agent_id = _get_agent_id_for_admin(current_admin)
    try:
        return ConversationFlowSyncService(agent_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.get('/agent', response_model=AgentResponse)
def get_agent(service: ConversationFlowSyncService = Depends(get_sync_service)):
    agent = service.agent
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        omni_agent_id=agent.omni_agent_id,
        omni_api_key=agent.omni_api_key,
        last_synced_at=agent.last_synced_at,
        sync_status=agent.sync_status,
        sync_error=agent.sync_error,
    )

@router.get('/sections', response_model=list[ConversationSectionResponse])
def list_sections(service: ConversationFlowSyncService = Depends(get_sync_service)):
    sections = service.section_repo.list_sections(service.agent.id)
    return [ConversationSectionResponse(
        id=str(section.id),
        agent_id=section.agent_id,
        title=section.title,
        instruction=section.instruction,
        enabled=section.enabled,
        display_order=section.display_order,
        created_at=section.created_at,
        updated_at=section.updated_at,
    ) for section in sections]

@router.post('/agent', response_model=AgentResponse)
def create_agent(data: AgentCreate, current_admin: dict = Depends(get_current_admin_details)):
    from app.repositories.conversation_repository import AgentRepository
    agent_id = _get_agent_id_for_admin(current_admin)
    repo = AgentRepository()
    agent = repo.create_agent(
        agent_id=agent_id,
        name=data.name,
        omni_agent_id=data.omni_agent_id,
        omni_api_key=data.omni_api_key
    )
    return AgentResponse(
        id=agent.id,
        name=agent.name,
        omni_agent_id=agent.omni_agent_id,
        omni_api_key=agent.omni_api_key,
        last_synced_at=agent.last_synced_at,
        sync_status=agent.sync_status,
        sync_error=agent.sync_error,
    )

@router.post('/sections', response_model=ConversationSectionResponse)
def create_section(data: ConversationSectionCreate, service: ConversationFlowSyncService = Depends(get_sync_service)):
    section = service.save_section(data.title, data.instruction, data.enabled, data.display_order)
    return ConversationSectionResponse(
        id=str(section.id),
        agent_id=section.agent_id,
        title=section.title,
        instruction=section.instruction,
        enabled=section.enabled,
        display_order=section.display_order,
        created_at=section.created_at,
        updated_at=section.updated_at,
    )

@router.put('/sections/bulk')
def update_sections_bulk(data: BulkSectionsRequest, service: ConversationFlowSyncService = Depends(get_sync_service)):
    try:
        sections = service.bulk_save_sections([section.dict() for section in data.sections])
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return {
        'status': 'success',
        'sync_status': service.agent.sync_status,
        'last_synced_at': service.agent.last_synced_at,
        'sync_error': service.agent.sync_error,
    }

@router.put('/sections/{section_id}', response_model=ConversationSectionResponse)
def update_section(section_id: str, data: ConversationSectionUpdate, service: ConversationFlowSyncService = Depends(get_sync_service)):
    try:
        section = service.update_section(section_id, data.title, data.instruction, data.enabled, data.display_order, data.updated_at)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return ConversationSectionResponse(
        id=str(section.id),
        agent_id=section.agent_id,
        title=section.title,
        instruction=section.instruction,
        enabled=section.enabled,
        display_order=section.display_order,
        created_at=section.created_at,
        updated_at=section.updated_at,
    )

@router.delete('/sections/{section_id}')
def delete_section(section_id: str, service: ConversationFlowSyncService = Depends(get_sync_service)):
    service.delete_section(section_id)
    return {'status': 'success'}

@router.post('/sections/reorder')
def reorder_sections(section_ids: list[str], service: ConversationFlowSyncService = Depends(get_sync_service)):
    service.reorder_sections(section_ids)
    return {'status': 'success'}

@router.post('/sync')
def manual_sync(service: ConversationFlowSyncService = Depends(get_sync_service)):
    service.sync_to_omni()
    return {
        'status': 'success',
        'sync_status': service.agent.sync_status,
        'last_synced_at': service.agent.last_synced_at,
        'sync_error': service.agent.sync_error,
    }

@router.post('/sync/retry')
def retry_sync(service: ConversationFlowSyncService = Depends(get_sync_service)):
    service.retry_failed_sync()
    return {'status': 'success'}
