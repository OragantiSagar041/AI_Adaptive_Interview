from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import asyncio
from starlette.concurrency import run_in_threadpool
import json
import logging
import hmac
import jwt

from core_infra import pubsub, ws_manager, task_queue, MongoBatchWriter
from mongo_db import answers_collection, interview_sessions_collection
from app.config import JWT_SECRET_KEY, ALGORITHM
from app.live_monitoring_security import decode_monitoring_token

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize the batch writer for answers
answers_batch_writer = MongoBatchWriter(answers_collection, flush_interval=3.0, batch_size=20)

async def start_realtime_services():
    await answers_batch_writer.start()
    await task_queue.start()

async def stop_realtime_services():
    await answers_batch_writer.stop()
    await task_queue.stop()

@router.websocket("/ws/interview/{link_id}")
async def interview_websocket(websocket: WebSocket, link_id: str):
    """
    Main WebSocket endpoint for the real-time AI interview.
    Handles affinity, batch DB writes, and Pub/Sub broadcasting.
    """
    token = websocket.query_params.get("token", "")
    try:
        payload = decode_monitoring_token(JWT_SECRET_KEY, ALGORITHM, token, link_id)
        session = interview_sessions_collection.find_one(
            {"link_id": link_id}, {"interview_id": 1, "status": 1, "is_deactivated": 1}
        )
        if not session or session.get("status") != "started" or session.get("is_deactivated"):
            raise ValueError("Session is not active")
        if not hmac.compare_digest(
            str(payload.get("interview_id") or ""), str(session.get("interview_id") or "")
        ):
            raise ValueError("Token interview does not match")
    except (jwt.PyJWTError, ValueError):
        await websocket.close(code=1008)
        return

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

            elif action == "save_proctoring_alert":
                # ── Persist proctoring alert to MongoDB ─────────────────────
                # This appears in the interview report for the admin/recruiter.
                interview_id   = payload.get("interview_id", "")
                alert_type     = payload.get("alert_type", "unknown")
                details        = payload.get("details", "")
                warnings_count = payload.get("warnings_count", 1)
                timestamp      = payload.get("timestamp", "")

                alert_entry = {
                    "type": alert_type,
                    "details": details,
                    "timestamp": timestamp,
                    "link_id": link_id,
                }

                try:
                    def _update_session_db():
                        interview_sessions_collection.update_one(
                            {"link_id": link_id},
                            {
                                "$push": {"proctoring_alerts": alert_entry},
                                "$set": {
                                    "warnings_count": warnings_count,
                                    "last_alert_at": timestamp,
                                }
                            },
                            upsert=False
                        )
                    await run_in_threadpool(_update_session_db)
                    logger.info(
                        f"[Proctoring] {alert_type} saved for link_id={link_id} "
                        f"(total warnings: {warnings_count})"
                    )
                except Exception as e:
                    logger.error(f"[Proctoring] Failed to save alert for {link_id}: {e}")

                # Notify admin dashboard in real-time so they see alerts live
                await pubsub.publish("admin_dashboard", {
                    "type": "proctoring_alert",
                    "link_id": link_id,
                    "alert_type": alert_type,
                    "details": details,
                    "warnings_count": warnings_count,
                    "timestamp": timestamp,
                })

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for {link_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {link_id}: {e}")
    finally:
        ws_manager.disconnect(link_id)
        await pubsub.unsubscribe(f"interview_{link_id}", pubsub_queue)
        pubsub_task.cancel()
