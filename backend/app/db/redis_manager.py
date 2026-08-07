import os
import json
import asyncio
import logging
import time
from typing import Any, Dict, List, Optional
from fastapi import WebSocket
from app.services.live_monitoring_security import admin_can_receive_dashboard_event

import redis.asyncio as redis
from dotenv import load_dotenv

load_dotenv()

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
        self.spectator_count_renewal_tasks: Dict[str, asyncio.Task] = {}
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
        for task in list(self.spectator_count_renewal_tasks.values()):
            task.cancel()
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
        """Background task: listen on subscribed Redis channels and route messages to local websockets.
        NOTE: Since send_to_candidate / send_to_admins now always deliver in-memory first,
        this listener only needs to handle cross-instance messages (multi-server deployments).
        Single-instance deployments get zero-latency delivery via in-memory path.
        """
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    try:
                        data = json.loads(message["data"])
                    except Exception:
                        continue
                    if channel == "dashboard:updates":
                        await self.broadcast_dashboard(data)
                    # For session channels in multi-server deployments, route to local sockets.
                    # In single-server deployments, in-memory already delivered these — this is a no-op.
                    parts = channel.split(":")
                    if len(parts) == 3 and parts[0] == "session":
                        link_id = parts[1]
                        role = parts[2]
                        local_group = self.local_connections.get(link_id)
                        if local_group:
                            if role == "candidate" and local_group.get("candidate"):
                                pass  # already delivered in-memory by send_to_candidate
                            elif role == "admins":
                                pass  # already delivered in-memory by send_to_admins
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Redis listener failed: {e}")
            self.redis = None
            self.pubsub = None
            self._redis_failed = True

    # ─── Candidate connection ────────────────────────────────────────────────────

    async def connect_candidate(self, websocket: WebSocket, link_id: str):
        await websocket.accept()
        if link_id not in self.local_connections:
            self.local_connections[link_id] = {"candidate": None, "admins": [], "spectators": []}
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
            if not self.local_connections[link_id].get("admins") and not self.local_connections[link_id].get("spectators"):
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
            self.local_connections[link_id] = {"candidate": None, "admins": [], "spectators": []}
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
                not self.local_connections[link_id].get("admins")
                and not self.local_connections[link_id].get("candidate")
                and not self.local_connections[link_id].get("spectators")
            ):
                del self.local_connections[link_id]
                if self.pubsub:
                    asyncio.create_task(
                        self._safe_unsubscribe(
                            f"session:{link_id}:candidate",
                            f"session:{link_id}:admins",
                        )
                    )

    # ─── Spectator connection ────────────────────────────────────────────────────

    SPECTATOR_COUNT_KEY_TEMPLATE = "session:{link_id}:spectator_count"
    SPECTATOR_COUNT_TTL = 3600

    async def connect_spectator(self, websocket: WebSocket, link_id: str):
        """Register a read-only spectator WebSocket for this interview session."""
        await websocket.accept()

        await self.connect_redis()
        if self.pubsub:
            try:
                await self.pubsub.subscribe(f"session:{link_id}:admins")
            except Exception as e:
                logger.warning(
                    f"Redis subscribe failed for spectator {link_id}: {e}. Using in-memory fallback."
                )
                self.redis = None
                self.pubsub = None
                self._redis_failed = True

        if link_id not in self.local_connections:
            self.local_connections[link_id] = {"candidate": None, "admins": [], "spectators": []}
        elif "spectators" not in self.local_connections[link_id]:
            self.local_connections[link_id]["spectators"] = []
        self.local_connections[link_id]["spectators"].append(websocket)
        logger.info(f"[Spectator] Connected to session {link_id}. Total spectators: {len(self.local_connections[link_id]['spectators'])}")

        if self.redis:
            try:
                key = self.SPECTATOR_COUNT_KEY_TEMPLATE.format(link_id=link_id)
                await self.redis.incr(key)
                await self.redis.expire(key, self.SPECTATOR_COUNT_TTL)
                self._start_spectator_count_ttl_renewal(link_id)
            except Exception as e:
                logger.warning(f"Redis spectator count update failed for {link_id}: {e}")

    async def disconnect_spectator(self, websocket: WebSocket, link_id: str):
        """Remove a spectator from the session. Cleans up the group if fully empty."""
        group = self.local_connections.get(link_id)
        if not group:
            return
        spectators = group.get("spectators", [])
        if websocket in spectators:
            spectators.remove(websocket)
        logger.info(f"[Spectator] Disconnected from session {link_id}. Remaining: {len(spectators)}")
        if self.redis:
            try:
                key = self.SPECTATOR_COUNT_KEY_TEMPLATE.format(link_id=link_id)
                value = await self.redis.decr(key)
                if value <= 0:
                    await self.redis.delete(key)
                else:
                    await self.redis.expire(key, self.SPECTATOR_COUNT_TTL)
            except Exception as e:
                logger.warning(f"Redis spectator count decrement failed for {link_id}: {e}")
        # Clean up the group only if all roles are empty
        if not group.get("admins") and not group.get("candidate") and not spectators:
            self.local_connections.pop(link_id, None)
            if self.pubsub:
                asyncio.create_task(
                    self._safe_unsubscribe(
                        f"session:{link_id}:candidate",
                        f"session:{link_id}:admins",
                    )
                )

    async def get_spectator_count(self, link_id: str) -> int:
        """Return the number of active spectators for a session."""
        if self.redis:
            try:
                key = self.SPECTATOR_COUNT_KEY_TEMPLATE.format(link_id=link_id)
                value = await self.redis.get(key)
                if value is not None:
                    try:
                        return int(value)
                    except ValueError:
                        pass
            except Exception as e:
                logger.warning(f"Redis spectator count read failed for {link_id}: {e}")
        group = self.local_connections.get(link_id, {})
        return len(group.get("spectators", []))


    async def _safe_unsubscribe(self, *channels):
        try:
            if self.pubsub:
                await self.pubsub.unsubscribe(*channels)
        except Exception as e:
            logger.warning(f"Error unsubscribing from Redis channels: {e}")

    def _start_spectator_count_ttl_renewal(self, link_id: str) -> None:
        if link_id in self.spectator_count_renewal_tasks or not self.redis:
            return

        async def _refresh_ttl() -> None:
            key = self.SPECTATOR_COUNT_KEY_TEMPLATE.format(link_id=link_id)
            try:
                while True:
                    await asyncio.sleep(max(60, self.SPECTATOR_COUNT_TTL // 2))
                    if not self.redis:
                        return
                    await self.redis.expire(key, self.SPECTATOR_COUNT_TTL)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.warning(f"Redis spectator count TTL renewal failed for {link_id}: {e}")
            finally:
                self.spectator_count_renewal_tasks.pop(link_id, None)

        self.spectator_count_renewal_tasks[link_id] = asyncio.create_task(_refresh_ttl())

    def _cancel_spectator_count_ttl_renewal(self, link_id: str) -> None:
        task = self.spectator_count_renewal_tasks.pop(link_id, None)
        if task:
            task.cancel()

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
        """Deliver a message to the candidate — always try in-memory AND Redis."""
        # Always try in-memory delivery first (fastest, zero-latency)
        local_group = self.local_connections.get(link_id)
        delivered_local = False
        if local_group:
            cand_ws = local_group.get("candidate")
            if cand_ws:
                try:
                    await cand_ws.send_json(message)
                    delivered_local = True
                except Exception as e:
                    logger.warning(f"In-memory send_to_candidate failed for {link_id}: {e}")

        # Also publish via Redis so other server instances get it
        await self.connect_redis()
        if self.redis:
            try:
                await self.redis.publish(f"session:{link_id}:candidate", json.dumps(message))
            except Exception as e:
                logger.warning(f"Redis publish to candidate failed: {e}.")
                self.redis = None
                self.pubsub = None
                self._redis_failed = True

    async def send_to_admins(self, link_id: str, message: dict):
        """Deliver a message to all admins and spectators — always try in-memory AND Redis."""
        # Always try in-memory delivery first (fastest, zero-latency)
        local_group = self.local_connections.get(link_id)
        if local_group:
            recipients = list(local_group.get("admins", [])) + list(local_group.get("spectators", []))
            for ws in recipients:
                try:
                    await ws.send_json(message)
                except Exception as e:
                    logger.warning(f"In-memory send_to_admins failed for {link_id}: {e}")

        # Also publish via Redis so other server instances get it
        await self.connect_redis()
        if self.redis:
            try:
                await self.redis.publish(f"session:{link_id}:admins", json.dumps(message))
            except Exception as e:
                logger.warning(f"Redis publish to admins failed: {e}.")
                self.redis = None
                self.pubsub = None
                self._redis_failed = True


manager = RedisConnectionManager()
