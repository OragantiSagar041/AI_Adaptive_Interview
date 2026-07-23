import os
import json
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import WebSocket
from app.live_monitoring_security import admin_can_receive_dashboard_event

import redis.asyncio as redis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")


class RedisConnectionManager:
    def __init__(self):
        self.redis: Optional[redis.Redis] = None
        self.pubsub = None
        # Local state for websockets connected to THIS instance
        self.local_connections: Dict[str, Dict[str, any]] = {}
        self.dashboard_connections: List[Dict[str, Any]] = []
        self.listener_task: Optional[asyncio.Task] = None
        self._redis_failed = False
        self._redis_last_attempt: float = 0.0
        # Only retry Redis once per 60 seconds after a failure
        self._redis_retry_cooldown = 60.0

    async def connect_redis(self):
        """Try to connect to Redis. After a failure, retry at most once per cooldown period.
        This prevents the permanent _redis_failed=True lockout that silently disabled
        in-memory fallback across the full process lifetime.
        """
        if self.redis:
            return  # already connected
        now = time.monotonic()
        if self._redis_failed and (now - self._redis_last_attempt) < self._redis_retry_cooldown:
            return  # still in cooldown — keep using in-memory
        # Reset flag so we actually attempt again
        self._redis_failed = False
        self._redis_last_attempt = now
        try:
            temp_redis = redis.from_url(
                REDIS_URL,
                decode_responses=True,
                socket_connect_timeout=3,  # fail fast instead of hanging
            )
            await temp_redis.ping()
            self.redis = temp_redis
            self.pubsub = self.redis.pubsub()
            self.listener_task = asyncio.create_task(self._listen_to_redis())
            logger.info(f"Connected to Redis at {REDIS_URL}")
        except Exception as e:
            logger.warning(f"Could not connect to Redis: {e}. Falling back to in-memory routing.")
            self._redis_failed = True
            self.redis = None
            self.pubsub = None

    async def disconnect_redis(self):
        if self.listener_task:
            self.listener_task.cancel()
        if self.pubsub:
            try:
                await self.pubsub.close()
            except Exception:
                pass
        if self.redis:
            try:
                await self.redis.close()
            except Exception:
                pass

    async def _listen_to_redis(self):
        """Background task: listen on subscribed Redis channels and route messages to local websockets."""
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    try:
                        data = json.loads(message["data"])
                    except Exception:
                        continue

                    # Channel format: session:{link_id}:{role}
                    parts = channel.split(":")
                    if len(parts) == 3 and parts[0] == "session":
                        link_id = parts[1]
                        role = parts[2]
                        local_group = self.local_connections.get(link_id)
                        if local_group:
                            if role == "candidate" and local_group["candidate"]:
                                try:
                                    await local_group["candidate"].send_json(data)
                                except Exception as e:
                                    logger.error(f"Error sending to local candidate: {e}")
                            elif role == "admins":
                                for admin_ws in list(local_group["admins"]):
                                    try:
                                        await admin_ws.send_json(data)
                                    except Exception as e:
                                        logger.error(f"Error sending to local admin: {e}")
                    elif channel == "dashboard:updates":
                        await self.broadcast_dashboard(data)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Redis listener failed: {e}")
            # Mark as failed so next connect_redis call can retry after cooldown
            self.redis = None
            self.pubsub = None
            self._redis_failed = True

    # ─── Candidate connection ────────────────────────────────────────────────────

    async def connect_candidate(self, websocket: WebSocket, link_id: str):
        await websocket.accept()
        if link_id not in self.local_connections:
            self.local_connections[link_id] = {"candidate": None, "admins": []}
        self.local_connections[link_id]["candidate"] = websocket

        # Attempt Redis subscription — failure is non-fatal, we fall back to in-memory
        await self.connect_redis()
        if self.pubsub:
            try:
                await self.pubsub.subscribe(f"session:{link_id}:candidate")
            except Exception as e:
                logger.warning(
                    f"Redis subscribe failed for candidate {link_id}: {e}. Using in-memory fallback."
                )
                self.redis = None
                self.pubsub = None
                self._redis_failed = True

    def disconnect_candidate(self, link_id: str):
        if link_id in self.local_connections:
            self.local_connections[link_id]["candidate"] = None
            if not self.local_connections[link_id]["admins"]:
                del self.local_connections[link_id]
                if self.pubsub:
                    asyncio.create_task(
                        self._safe_unsubscribe(
                            f"session:{link_id}:candidate",
                            f"session:{link_id}:admins",
                        )
                    )

    # ─── Admin connection ────────────────────────────────────────────────────────

    async def connect_admin(self, websocket: WebSocket, link_id: str):
        await websocket.accept()
        if link_id not in self.local_connections:
            self.local_connections[link_id] = {"candidate": None, "admins": []}
        self.local_connections[link_id]["admins"].append(websocket)

        # Attempt Redis subscription — failure is non-fatal, we fall back to in-memory
        await self.connect_redis()
        if self.pubsub:
            try:
                await self.pubsub.subscribe(f"session:{link_id}:admins")
            except Exception as e:
                logger.warning(
                    f"Redis subscribe failed for admin {link_id}: {e}. Using in-memory fallback."
                )
                self.redis = None
                self.pubsub = None
                self._redis_failed = True

    def disconnect_admin(self, websocket: WebSocket, link_id: str):
        if link_id in self.local_connections:
            if websocket in self.local_connections[link_id]["admins"]:
                self.local_connections[link_id]["admins"].remove(websocket)
            if (
                not self.local_connections[link_id]["admins"]
                and not self.local_connections[link_id]["candidate"]
            ):
                del self.local_connections[link_id]
                if self.pubsub:
                    asyncio.create_task(
                        self._safe_unsubscribe(
                            f"session:{link_id}:candidate",
                            f"session:{link_id}:admins",
                        )
                    )

    async def _safe_unsubscribe(self, *channels):
        try:
            if self.pubsub:
                await self.pubsub.unsubscribe(*channels)
        except Exception as e:
            logger.warning(f"Error unsubscribing from Redis channels: {e}")

    # ─── Dashboard connection ────────────────────────────────────────────────────

    async def connect_dashboard(self, websocket: WebSocket, auth_context: Dict[str, str]):
        await websocket.accept()
        self.dashboard_connections.append({"websocket": websocket, **auth_context})
        await self.connect_redis()
        if self.pubsub:
            try:
                await self.pubsub.subscribe("dashboard:updates")
            except Exception as e:
                logger.warning(f"Redis subscribe failed for dashboard: {e}. Using in-memory fallback.")

    def disconnect_dashboard(self, websocket: WebSocket):
        self.dashboard_connections = [
            c for c in self.dashboard_connections if c.get("websocket") is not websocket
        ]

    async def broadcast_dashboard(self, data: Dict[str, Any]):
        """Send a dashboard event only to admins authorized for its tenant."""
        stale = []
        for connection in list(self.dashboard_connections):
            if not admin_can_receive_dashboard_event(connection, data):
                continue
            ws = connection.get("websocket")
            try:
                await ws.send_json(data)
            except Exception as exc:
                logger.error("Error sending dashboard update: %s", exc)
                stale.append(ws)
        for ws in stale:
            self.disconnect_dashboard(ws)

    # ─── Message routing ─────────────────────────────────────────────────────────

    async def send_to_candidate(self, link_id: str, message: dict):
        """Publish a message to the candidate's channel (Redis if available, in-memory otherwise)."""
        await self.connect_redis()
        if self.redis:
            try:
                await self.redis.publish(f"session:{link_id}:candidate", json.dumps(message))
                return
            except Exception as e:
                logger.warning(f"Redis publish failed: {e}. Falling back to in-memory.")
                self.redis = None
                self.pubsub = None
                self._redis_failed = True
        # In-memory fallback
        local_group = self.local_connections.get(link_id)
        if local_group:
            cand_ws = local_group["candidate"]
            if cand_ws:
                try:
                    await cand_ws.send_json(message)
                except Exception:
                    pass

    async def send_to_admins(self, link_id: str, message: dict):
        """Publish a message to the admins' channel (Redis if available, in-memory otherwise)."""
        await self.connect_redis()
        if self.redis:
            try:
                await self.redis.publish(f"session:{link_id}:admins", json.dumps(message))
                return
            except Exception as e:
                logger.warning(f"Redis publish failed: {e}. Falling back to in-memory.")
                self.redis = None
                self.pubsub = None
                self._redis_failed = True
        # In-memory fallback
        local_group = self.local_connections.get(link_id)
        if local_group:
            for admin_ws in list(local_group["admins"]):
                try:
                    await admin_ws.send_json(message)
                except Exception:
                    pass


manager = RedisConnectionManager()
