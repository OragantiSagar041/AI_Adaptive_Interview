from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import asyncio
import json
import logging

from core_infra import pubsub, ws_manager, task_queue, MongoBatchWriter
from mongo_db import answers_collection, interview_sessions_collection

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize the batch writer for answers
answers_batch_writer = MongoBatchWriter(answers_collection, flush_interval=3.0, batch_size=20)

@router.on_event("startup")
async def startup_event():
    await answers_batch_writer.start()
    await task_queue.start()

@router.on_event("shutdown")
async def shutdown_event():
    await answers_batch_writer.stop()
    await task_queue.stop()

@router.websocket("/ws/interview/{link_id}")
async def interview_websocket(websocket: WebSocket, link_id: str):
    """
    Main WebSocket endpoint for the real-time AI interview.
    Handles affinity, batch DB writes, and Pub/Sub broadcasting.
    """
    await ws_manager.connect(websocket, link_id)
    
    # Subscribe to personal channel for this interview
    pubsub_queue = await pubsub.subscribe(f"interview_{link_id}")
    
    # Background task to push pubsub messages to the client
    async def pubsub_to_ws():
        while True:
            try:
                msg = await pubsub_queue.get()
                await ws_manager.send_json(msg, link_id)
                pubsub_queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Pubsub task error: {e}")
                
    pubsub_task = asyncio.create_task(pubsub_to_ws())

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            action = payload.get("action")
            
            if action == "save_answer":
                # Use batch writer instead of direct DB insert
                answer_doc = {
                    "interview_id": payload.get("interview_id"),
                    "question_id": payload.get("question_id"),
                    "question_text": payload.get("question_text"),
                    "answer_text": payload.get("answer_text"),
                    "candidate_name": payload.get("candidate_name"),
                    "timestamp": payload.get("timestamp"),
                    "link_id": link_id
                }
                await answers_batch_writer.insert(answer_doc)
                
                # Broadcast that an answer was saved (useful if admin dashboard is listening)
                await pubsub.publish(f"admin_dashboard", {"type": "answer_saved", "link_id": link_id})
                
            elif action == "ai_state_change":
                # Broadcast AI state changes (thinking, speaking, listening)
                state = payload.get("state")
                await pubsub.publish(f"interview_{link_id}", {"type": "ai_state", "state": state})

            elif action == "coding_observation":
                # Add heavy LLM generation to the background task queue
                # In a real app, this would trigger an LLM call. Here we just mock a queue job.
                async def process_coding_insight(code, lang):
                    await asyncio.sleep(2) # Simulate processing
                    await pubsub.publish(f"interview_{link_id}", {
                        "type": "ai_message",
                        "text": "I noticed you made some changes to the logic. Can you explain your reasoning?"
                    })
                
                await task_queue.produce(process_coding_insight, payload.get("code"), payload.get("language"))

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {link_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {link_id}: {e}")
    finally:
        ws_manager.disconnect(link_id)
        await pubsub.unsubscribe(f"interview_{link_id}", pubsub_queue)
        pubsub_task.cancel()
