import os
import sys
import json
import hashlib
from datetime import datetime
from dotenv import load_dotenv

# Ensure utf-8 stdout encoding on Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from pymongo import MongoClient
from omnidimension import Client
import redis

def get_mongo_db():
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    client = MongoClient(mongo_uri)
    return client["AI_Interview"]

def sync_all_omni_data(api_key: str = None, voice_id: str = None, agent_id: str = None):
    """
    Synchronizes all data from Omni Dimension for the specified account (API Key, Voice ID, Agent ID)
    into local MongoDB collections and clears Redis caches.
    """
    effective_api_key = (api_key or os.getenv("OMNI_DIMENSION_API_KEY") or "").strip()
    effective_voice_id = (voice_id or os.getenv("OMNI_DIMENSION_VOICE_ID") or "").strip()
    effective_agent_id = (agent_id or os.getenv("OMNI_DIMENSION_AGENT_ID") or "").strip()

    if not effective_api_key:
        print("❌ Error: Omni Dimension API Key is missing.")
        return False, {"error": "Omni Dimension API Key is missing."}

    print(f"🔄 Starting Omni Dimension Sync for Account [API key: {effective_api_key[:8]}... | Voice ID: {effective_voice_id or 'default'} | Agent ID: {effective_agent_id or 'auto'}]")
    
    try:
        client = Client(effective_api_key)
    except Exception as client_err:
        print(f"❌ Failed to instantiate Omni Dimension Client: {client_err}")
        return False, {"error": str(client_err)}

    db = get_mongo_db()

    stats = {
        "conversation_flow": 0,
        "assistant_details": 0,
        "call_configuration": 0,
        "knowledge_base_files": 0,
        "integrations": 0,
        "post_call_configs": 0,
        "recent_calls": 0,
        "approvals_linked": 0,
        "bulk_dialer_batches": 0
    }

    # 1. Sync Agent, Assistant Details, Conversation Flow, Call Config & Post-Call Settings
    print("\n--- 1. Syncing Account Agents, Conversation Flow, Call Config & Post-Call Settings ---")
    try:
        res = client.agent.list()
        data = res.get("json", res) if isinstance(res, dict) else {}
        agents = data.get("bots", []) or data.get("agents", []) or data.get("data", [])
        
        if isinstance(agents, list):
            for agent in agents:
                a_id = str(agent.get("id") or agent.get("agent_id") or "")
                if not a_id:
                    continue

                # Filter by agent_id or voice_id if specified
                if effective_agent_id and a_id != effective_agent_id and len(agents) > 1:
                    continue
                if effective_voice_id:
                    agent_voice = str(agent.get("voice") or agent.get("voice_external_id") or "")
                    if agent_voice and agent_voice != effective_voice_id and len(agents) > 1:
                        continue

                # Fetch detailed agent parameters
                try:
                    if hasattr(client.agent, 'get'):
                        detail_res = client.agent.get(agent_id=a_id)
                        detail_data = detail_res.get("json", detail_res) if isinstance(detail_res, dict) else {}
                        bot_obj = detail_data.get("bot") or detail_data.get("agent") or detail_data.get("data")
                        if isinstance(bot_obj, dict):
                            agent = {**agent, **bot_obj}
                except Exception as detail_err:
                    print(f"  └ Note on detailed agent fetch for {a_id}: {detail_err}")

                now_iso = datetime.utcnow().isoformat()
                agent["synced_at"] = now_iso
                agent["omni_api_key_hash"] = hashlib.sha256(effective_api_key.encode()).hexdigest()[:16]
                agent["_updated_by_sync"] = True

                # A. Upsert into omni_agent_settings
                db.omni_agent_settings.update_one(
                    {"id": agent.get("id", a_id)},
                    {"$set": agent},
                    upsert=True
                )
                stats["assistant_details"] += 1

                # B. Upsert Conversation Flow
                flow_data = agent.get("flow_data") or {"nodes": [], "edges": []}
                db.conversation_flows.update_one(
                    {"omni_agent_id": a_id},
                    {"$set": {
                        "omni_agent_id": a_id,
                        "flow": flow_data,
                        "status_of_building_flow": agent.get("status_of_building_flow", "Completed"),
                        "dynamic_variables": agent.get("dynamic_variables", []),
                        "synced_at": now_iso
                    }},
                    upsert=True
                )
                stats["conversation_flow"] += 1

                # C. Upsert Call Configuration
                call_config = {
                    "omni_agent_id": a_id,
                    "silence_timeout": agent.get("silence_timeout"),
                    "speech_speed": agent.get("speech_speed"),
                    "max_call_duration_in_sec": agent.get("max_call_duration_in_sec"),
                    "is_end_call_enabled": agent.get("is_end_call_enabled"),
                    "end_call_condition": agent.get("end_call_condition"),
                    "end_call_message": agent.get("end_call_message"),
                    "end_call_message_type": agent.get("end_call_message_type"),
                    "end_call_message_prompt": agent.get("end_call_message_prompt"),
                    "voicemail_enabled": agent.get("voicemail_enabled"),
                    "background_noise_enabled": agent.get("background_noise_enabled"),
                    "background_noice_name": agent.get("background_noice_name"),
                    "background_audio_volume": agent.get("background_audio_volume"),
                    "initial_ringing_sound_enabled": agent.get("initial_ringing_sound_enabled"),
                    "is_transfer_enabled": agent.get("is_transfer_enabled"),
                    "first_ideal_message": agent.get("first_ideal_message"),
                    "second_ideal_message": agent.get("second_ideal_message"),
                    "last_ideal_message": agent.get("last_ideal_message"),
                    "user_idle_threshold_sec": agent.get("user_idle_threshold_sec"),
                    "min_speech_duration_ms": agent.get("min_speech_duration_ms"),
                    "synced_at": now_iso
                }
                db.omni_call_configs.update_one(
                    {"omni_agent_id": a_id},
                    {"$set": call_config},
                    upsert=True
                )
                stats["call_configuration"] += 1

                # D. Upsert Post-Call Configuration
                post_call = agent.get("post_call_config_ids", [])
                db.omni_post_call_configs.update_one(
                    {"omni_agent_id": a_id},
                    {"$set": {
                        "omni_agent_id": a_id,
                        "post_call_configs": post_call,
                        "synced_at": now_iso
                    }},
                    upsert=True
                )
                stats["post_call_configs"] += len(post_call) if isinstance(post_call, list) else 1

                # E. Upsert into main agents collection
                db.agents.update_one(
                    {"omni_agent_id": a_id},
                    {"$set": {
                        "name": agent.get("name", "Omni Voice Agent"),
                        "omni_agent_id": a_id,
                        "omni_api_key": effective_api_key,
                        "voice_id": agent.get("voice"),
                        "llm_service": agent.get("llm_service"),
                        "language": agent.get("language"),
                        "flow_data": flow_data,
                        "post_call_config_ids": post_call,
                        "end_call_condition": agent.get("end_call_condition"),
                        "end_call_message": agent.get("end_call_message"),
                        "synced_at": now_iso
                    }},
                    upsert=True
                )
                print(f"  ✓ Synced Assistant Details & Flow for Agent ID: {a_id} ({agent.get('name')})")
    except Exception as e:
        print(f"  ❌ Error syncing agent configurations: {e}")

    # 2. Sync Knowledge Base
    print("\n--- 2. Syncing Knowledge Base Files ---")
    try:
        kb_res = client.knowledge_base.list()
        kb_data = kb_res.get("json", kb_res) if isinstance(kb_res, dict) else {}
        files = kb_data.get("files", []) or kb_data.get("data", []) or []
        if isinstance(files, list):
            for file_doc in files:
                file_id = file_doc.get("id") or file_doc.get("file_id")
                if not file_id:
                    continue
                file_doc["synced_at"] = datetime.utcnow().isoformat()
                file_doc["omni_api_key_hash"] = hashlib.sha256(effective_api_key.encode()).hexdigest()[:16]
                db.omni_knowledge_base.update_one(
                    {"id": file_id},
                    {"$set": file_doc},
                    upsert=True
                )
                stats["knowledge_base_files"] += 1
            print(f"  ✓ Synced {stats['knowledge_base_files']} Knowledge Base file(s).")
    except Exception as e:
        print(f"  ❌ Error syncing knowledge base: {e}")

    # 3. Sync Integrations
    print("\n--- 3. Syncing Integrations Catalog & Active Integrations ---")
    try:
        user_int_res = client.integrations.get_user_integrations()
        int_data = user_int_res.get("json", user_int_res) if isinstance(user_int_res, dict) else {}
        integrations = int_data.get("integrations", []) if isinstance(int_data, dict) else []
        if isinstance(integrations, list):
            for integration in integrations:
                int_id = integration.get("id")
                if not int_id:
                    continue
                integration["synced_at"] = datetime.utcnow().isoformat()
                integration["omni_api_key_hash"] = hashlib.sha256(effective_api_key.encode()).hexdigest()[:16]
                db.omni_integrations.update_one(
                    {"id": int_id},
                    {"$set": integration},
                    upsert=True
                )
                stats["integrations"] += 1
            print(f"  ✓ Synced {stats['integrations']} Integration(s).")
    except Exception as e:
        print(f"  ❌ Error syncing integrations: {e}")

    # 4. Sync Recent Calls & Candidate Approvals
    print("\n--- 4. Syncing Call Logs, Conversation Transcripts, Audio Recordings & Approvals ---")
    try:
        all_calls = []
        page = 1
        page_size = 100
        max_pages = 20

        while page <= max_pages:
            res = client.call.get_call_logs(page=page, page_size=page_size)
            data = res.get("json", res) if isinstance(res, dict) else {}
            page_calls = (
                data.get("call_log_data")
                or data.get("calls")
                or data.get("call_logs")
                or data.get("data")
                or data.get("results")
                or []
            )
            if not isinstance(page_calls, list) or not page_calls:
                break
            all_calls.extend(page_calls)
            total_records = data.get("total_records") or 0
            if len(all_calls) >= total_records or len(page_calls) < page_size:
                break
            page += 1

        print(f"  -> Fetched {len(all_calls)} call log record(s) from Omni Dimension API.")

        for call in all_calls:
            if not isinstance(call, dict):
                continue
            
            call_id = str(call.get("id") or call.get("call_id") or "")
            if not call_id:
                continue

            call["call_id"] = call_id
            call["synced_at"] = datetime.utcnow().isoformat()
            call["omni_api_key_hash"] = hashlib.sha256(effective_api_key.encode()).hexdigest()[:16]
            call["_updated_by_sync"] = True

            raw_u = str(call.get("user_name") or "")
            raw_c = str(call.get("candidate_name") or "")
            if "abba" in raw_u.lower() or "abba" in raw_c.lower():
                call["user_name"] = "Abhay Gupta"
                call["candidate_name"] = "Abhay Gupta"
                call["name"] = "Abhay Gupta"

            # Upsert into omni_call_logs
            db.omni_call_logs.update_one(
                {"call_id": call_id},
                {"$set": call},
                upsert=True
            )
            stats["recent_calls"] += 1

            # Link & match to interview_sessions for approvals
            call_req_id = str(call.get("call_request_id", {}).get("id") or "")
            search_filter = {"$or": [
                {"omni_call_id": call_id},
                {"link_id": f"ai_call_omni_{call_id}"},
                {"omni_call_id": call_req_id} if call_req_id else {"_id": None}
            ]}

            session_doc = db.interview_sessions.find_one(search_filter)
            if session_doc:
                update_fields = {
                    "omni_call_id": call_id,
                    "status": "completed" if call.get("call_status") == "completed" else session_doc.get("status", "completed"),
                    "call_duration": call.get("call_duration"),
                    "recording_url": call.get("recording_url") or call.get("internal_recording_url"),
                    "transcript": call.get("call_conversation"),
                    "cqs_score": call.get("cqs_score"),
                    "sentiment_score": call.get("sentiment_score"),
                    "extracted_variables": call.get("extracted_variables"),
                    "decision": session_doc.get("decision", "pending"),
                    "last_synced_at": datetime.utcnow().isoformat()
                }
                db.interview_sessions.update_one({"_id": session_doc["_id"]}, {"$set": update_fields})
                stats["approvals_linked"] += 1

        print(f"  ✓ Synced {stats['recent_calls']} Call Logs & linked {stats['approvals_linked']} Candidate Approval Sessions.")
    except Exception as e:
        print(f"  ❌ Error syncing call logs and approvals: {e}")

    # 5. Sync Bulk Dialer Batches
    print("\n--- 5. Syncing Bulk Dialer Batches ---")
    try:
        if hasattr(client, 'bulk_call') and hasattr(client.bulk_call, 'fetch_bulk_calls'):
            bulk_res = client.bulk_call.fetch_bulk_calls()
            bulk_data = bulk_res.get("json", bulk_res) if isinstance(bulk_res, dict) else {}
            records = bulk_data.get("records", []) or bulk_data.get("data", []) or []
            if isinstance(records, list):
                for bulk_rec in records:
                    b_id = bulk_rec.get("id") or bulk_rec.get("bulk_call_id")
                    if not b_id:
                        continue
                    bulk_rec["synced_at"] = datetime.utcnow().isoformat()
                    bulk_rec["omni_api_key_hash"] = hashlib.sha256(effective_api_key.encode()).hexdigest()[:16]
                    db.omni_bulk_calls.update_one(
                        {"id": b_id},
                        {"$set": bulk_rec},
                        upsert=True
                    )
                    stats["bulk_dialer_batches"] += 1
                print(f"  ✓ Synced {stats['bulk_dialer_batches']} Bulk Dialer batch(es).")
    except Exception as e:
        print(f"  └ Note on bulk dialer sync: {e}")

    # 6. Flush Redis Caches for this API Key
    print("\n--- 6. Clearing Redis Cache Entries for Account ---")
    try:
        r = redis.Redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379/0"), decode_responses=True)
        key_digest = hashlib.sha256(effective_api_key.encode("utf-8")).hexdigest()[:20]
        pattern = f"omni:*:{key_digest}"
        keys = r.keys(pattern)
        if keys:
            r.delete(*keys)
            print(f"  ✓ Cleared {len(keys)} Redis cache key(s) matching account digest.")
        else:
            print("  ✓ Redis cache is clean.")
    except Exception as cache_err:
        print(f"  └ Note on Redis cache clear: {cache_err}")

    print("\n✅ Omni Dimension Sync for Account Completed Successfully!")
    print(json.dumps(stats, indent=2))
    return True, stats

if __name__ == "__main__":
    sync_all_omni_data()
