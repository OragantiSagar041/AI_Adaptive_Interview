from typing import List, Optional
from datetime import datetime, timezone
from mongo_db import agents_collection, conversation_flows_collection

def _now():
    return datetime.now(timezone.utc)

class Agent:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', kwargs.get('_id'))
        self.name = kwargs.get('name')
        self.omni_agent_id = kwargs.get('omni_agent_id')
        self.omni_api_key = kwargs.get('omni_api_key')
        self.last_synced_at = kwargs.get('last_synced_at')
        self.sync_status = kwargs.get('sync_status', 'PENDING')
        self.sync_error = kwargs.get('sync_error')
        self.created_at = kwargs.get('created_at', _now())
        self.updated_at = kwargs.get('updated_at', _now())

class ConversationSection:
    def __init__(self, **kwargs):
        self.id = kwargs.get('id', kwargs.get('_id'))
        if self.id:
            self.id = str(self.id)
        self.agent_id = kwargs.get('agent_id')
        self.title = kwargs.get('title')
        self.instruction = kwargs.get('instruction')
        self.enabled = kwargs.get('enabled', True)
        self.display_order = kwargs.get('display_order', 0)
        self.created_at = kwargs.get('created_at', _now())
        self.updated_at = kwargs.get('updated_at', _now())

class AgentRepository:
    def __init__(self):
        pass

    def get_agent(self, agent_id: int) -> Optional[Agent]:
        data = agents_collection.find_one({"_id": agent_id})
        if data:
            return Agent(**data)
        return None

    def create_agent(self, agent_id: int, name: str, omni_agent_id: str, omni_api_key: str) -> Agent:
        doc_set = {
            "name": name,
            "omni_agent_id": omni_agent_id,
            "omni_api_key": omni_api_key,
            "updated_at": _now(),
        }
        doc_set_on_insert = {
            "sync_status": "PENDING",
            "sync_error": None,
            "last_synced_at": None,
            "created_at": _now(),
        }
        agents_collection.update_one(
            {"_id": agent_id}, 
            {"$set": doc_set, "$setOnInsert": doc_set_on_insert}, 
            upsert=True
        )
        data = agents_collection.find_one({"_id": agent_id})
        return Agent(**data)

    def update_sync_status(self, agent_id: int, status: str, error: Optional[str] = None):
        res = agents_collection.update_one(
            {"_id": agent_id},
            {"$set": {
                "sync_status": status,
                "sync_error": error,
                "last_synced_at": _now(),
                "updated_at": _now()
            }}
        )
        if res.matched_count == 0:
            raise ValueError(f"Agent {agent_id} not found")

class ConversationSectionRepository:
    def __init__(self):
        pass

    def list_sections(self, agent_id: int) -> List[ConversationSection]:
        cursor = conversation_flows_collection.find({"agent_id": agent_id}).sort("display_order", 1)
        return [ConversationSection(**doc) for doc in cursor]

    def get_section(self, agent_id: int, section_id: str) -> Optional[ConversationSection]:
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            doc = conversation_flows_collection.find_one({"_id": ObjectId(str(section_id)), "agent_id": agent_id})
            return ConversationSection(**doc) if doc else None
        except InvalidId:
            doc = conversation_flows_collection.find_one({"_id": section_id, "agent_id": agent_id})
            return ConversationSection(**doc) if doc else None

    def create_section(self, agent_id: int, title: str, instruction: str, enabled: bool, display_order: int) -> ConversationSection:
        doc = {
            "agent_id": agent_id,
            "title": title,
            "instruction": instruction,
            "enabled": enabled,
            "display_order": display_order,
            "created_at": _now(),
            "updated_at": _now(),
        }
        result = conversation_flows_collection.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return ConversationSection(**doc)

    def bulk_upsert_sections(self, agent_id: int, sections: List[dict]) -> List[ConversationSection]:
        from bson import ObjectId
        from bson.errors import InvalidId
        from pymongo import UpdateOne, InsertOne, DeleteOne
        
        existing = {str(section.id): section for section in self.list_sections(agent_id)}
        incoming_ids = {str(item['id']) for item in sections if item.get('id')}
        
        operations = []

        for section_id in existing.keys():
            if section_id not in incoming_ids:
                try:
                    operations.append(DeleteOne({"_id": ObjectId(section_id), "agent_id": agent_id}))
                except InvalidId:
                    operations.append(DeleteOne({"_id": section_id, "agent_id": agent_id}))

        for section_data in sections:
            section_id_str = str(section_data.get('id')) if section_data.get('id') else None
            if section_id_str and section_id_str in existing:
                update_doc = {
                    "title": section_data['title'],
                    "instruction": section_data['instruction'],
                    "enabled": section_data['enabled'],
                    "display_order": section_data['display_order'],
                    "updated_at": _now()
                }
                try:
                    operations.append(UpdateOne({"_id": ObjectId(section_id_str), "agent_id": agent_id}, {"$set": update_doc}))
                except InvalidId:
                    operations.append(UpdateOne({"_id": section_id_str, "agent_id": agent_id}, {"$set": update_doc}))
            else:
                operations.append(InsertOne({
                    "agent_id": agent_id,
                    "title": section_data['title'],
                    "instruction": section_data['instruction'],
                    "enabled": section_data['enabled'],
                    "display_order": section_data['display_order'],
                    "created_at": _now(),
                    "updated_at": _now()
                }))

        if operations:
            conversation_flows_collection.bulk_write(operations)

        return self.list_sections(agent_id)

    def update_section(self, section: ConversationSection, **fields) -> ConversationSection:
        from bson import ObjectId
        from bson.errors import InvalidId
        update_fields = {}
        for key, value in fields.items():
            if value is not None:
                update_fields[key] = value
                setattr(section, key, value)
        update_fields["updated_at"] = _now()
        section.updated_at = update_fields["updated_at"]

        try:
            res = conversation_flows_collection.update_one({"_id": ObjectId(str(section.id)), "agent_id": section.agent_id}, {"$set": update_fields})
        except InvalidId:
            res = conversation_flows_collection.update_one({"_id": section.id, "agent_id": section.agent_id}, {"$set": update_fields})

        if res.matched_count == 0:
            raise ValueError(f"Section {section.id} not found for agent {section.agent_id}")

        return section

    def delete_section(self, section: ConversationSection):
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            res = conversation_flows_collection.delete_one({"_id": ObjectId(str(section.id)), "agent_id": section.agent_id})
        except InvalidId:
            res = conversation_flows_collection.delete_one({"_id": section.id, "agent_id": section.agent_id})
            
        if res.deleted_count == 0:
            raise ValueError(f"Section {section.id} not found for agent {section.agent_id}")

    def reorder_sections(self, agent_id: int, section_ids: List[str]):
        from bson import ObjectId
        from bson.errors import InvalidId
        from pymongo import UpdateOne
        
        operations = []
        for index, section_id in enumerate(section_ids):
            try:
                operations.append(UpdateOne(
                    {"_id": ObjectId(str(section_id)), "agent_id": agent_id},
                    {"$set": {"display_order": index, "updated_at": _now()}}
                ))
            except InvalidId:
                operations.append(UpdateOne(
                    {"_id": section_id, "agent_id": agent_id},
                    {"$set": {"display_order": index, "updated_at": _now()}}
                ))
                
        if operations:
            res = conversation_flows_collection.bulk_write(operations)
            if res.matched_count != len(section_ids):
                raise ValueError("Some sections were not found for reordering")

    def get_enabled_sorted_sections(self, agent_id: int) -> List[ConversationSection]:
        cursor = conversation_flows_collection.find({"agent_id": agent_id, "enabled": True}).sort("display_order", 1)
        return [ConversationSection(**doc) for doc in cursor]
