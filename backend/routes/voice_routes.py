from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Any
import asyncio
from starlette.concurrency import run_in_threadpool
import json
import logging
import hmac
import jwt
import time
from collections import deque

from core_infra import pubsub, ws_manager, task_queue
from mongo_db import interview_sessions_collection
from app.config import JWT_SECRET_KEY, ALGORITHM
from app.live_monitoring_security import decode_monitoring_token
from app.answer_service import persist_answer_and_enqueue_scoring

logger = logging.getLogger(__name__)
router = APIRouter()

async def start_realtime_services():
    await task_queue.start()

async def stop_realtime_services():
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
            {"link_id": link_id},
            {"interview_id": 1, "status": 1, "is_deactivated": 1, "candidate_name": 1},
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
    message_times = deque()

    try:
        while True:
            raw_message = await websocket.receive_text()
            if len(raw_message) > 250_000:
                await websocket.close(code=1009)
                break
            now = time.monotonic()
            while message_times and now - message_times[0] > 60:
                message_times.popleft()
            if len(message_times) >= 120:
                await websocket.send_json({"type": "rate_limited"})
                continue
            message_times.append(now)
            try:
                payload = json.loads(raw_message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "invalid_message"})
                continue
            action = payload.get("action")
            
            if action == "save_answer":
                request_id = str(payload.get("request_id") or "")
                try:
                    result = await run_in_threadpool(
                        persist_answer_and_enqueue_scoring,
                        interview_id=str(session.get("interview_id") or ""),
                        question_id=payload.get("question_id"),
                        question_text=payload.get("question_text"),
                        answer_text=payload.get("answer_text"),
                        candidate_name=session.get("candidate_name") or "Candidate",
                        time_spent_seconds=payload.get("time_spent_seconds", 0),
                        time_limit_seconds=payload.get("time_limit_seconds", 120),
                    )
                except ValueError as exc:
                    await websocket.send_json({
                        "type": "answer_rejected",
                        "request_id": request_id,
                        "detail": str(exc),
                    })
                    continue

                await websocket.send_json({
                    "type": "answer_saved",
                    "request_id": request_id,
                    "question_id": str(payload.get("question_id") or ""),
                    "answer_version": result["answer_version"],
                    "scoring_status": result["scoring_status"],
                })
                await pubsub.publish(
                    "admin_dashboard",
                    {
                        "type": "answer_saved",
                        "link_id": link_id,
                        "interview_id": str(session.get("interview_id") or ""),
                    },
                )
                
            elif action == "ai_state_change":
                # Broadcast AI state changes (thinking, speaking, listening)
                state = payload.get("state")
                if state not in {"idle", "thinking", "speaking", "listening"}:
                    await websocket.send_json({"type": "invalid_state"})
                    continue
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
                
                code = str(payload.get("code") or "")[:100_000]
                language = str(payload.get("language") or "")[:50]
                await task_queue.produce(process_coding_insight, code, language)

            elif action == "save_proctoring_alert":
                # ── Persist proctoring alert to MongoDB ─────────────────────
                # This appears in the interview report for the admin/recruiter.
                interview_id   = payload.get("interview_id", "")
                alert_type     = str(payload.get("alert_type", "unknown"))[:100]
                details        = str(payload.get("details", ""))[:2000]
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
