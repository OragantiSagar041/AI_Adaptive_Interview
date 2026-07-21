import os
import json
import asyncio
import logging
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

    async def connect_redis(self):
        if not self.redis and not self._redis_failed:
            try:
                temp_redis = redis.from_url(REDIS_URL, decode_responses=True)
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
            await self.pubsub.close()
        if self.redis:
            await self.redis.close()

    async def _listen_to_redis(self):
        """Background task to listen to subscribed Redis channels and route to local websockets."""
        try:
            async for message in self.pubsub.listen():
                if message["type"] == "message":
                    channel = message["channel"]
                    data = json.loads(message["data"])
                    
                    # Channels format: session:{link_id}:{role}
                    parts = channel.split(":")
                    if len(parts) == 3 and parts[0] == "session":
                        link_id = parts[1]
                        role = parts[2]
                        
                        if link_id in self.local_connections:
                            local_group = self.local_connections[link_id]
                            
                            if role == "candidate" and local_group["candidate"]:
                                try:
                                    await local_group["candidate"].send_json(data)
                                except Exception as e:
                                    logger.error(f"Error sending to local candidate: {e}")
                                    
                            elif role == "admins":
                                for admin_ws in local_group["admins"]:
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

    async def connect_candidate(self, websocket: WebSocket, link_id: str):
        await websocket.accept()
        if link_id not in self.local_connections:
            self.local_connections[link_id] = {"candidate": None, "admins": []}
        self.local_connections[link_id]["candidate"] = websocket
        
        # Ensure we are subscribed to messages FOR the candidate
        await self.connect_redis()
        if self.pubsub:
            await self.pubsub.subscribe(f"session:{link_id}:candidate")

    async def connect_admin(self, websocket: WebSocket, link_id: str):
        await websocket.accept()
        if link_id not in self.local_connections:
            self.local_connections[link_id] = {"candidate": None, "admins": []}
        self.local_connections[link_id]["admins"].append(websocket)
        
        # Ensure we are subscribed to messages FOR the admins
        await self.connect_redis()
        if self.pubsub:
            await self.pubsub.subscribe(f"session:{link_id}:admins")

    def disconnect_candidate(self, link_id: str):
        if link_id in self.local_connections:
            self.local_connections[link_id]["candidate"] = None
            # If no admins either, we could unsubscribe and clean up
            if not self.local_connections[link_id]["admins"]:
                del self.local_connections[link_id]
                if self.pubsub:
                    asyncio.create_task(self.pubsub.unsubscribe(f"session:{link_id}:candidate", f"session:{link_id}:admins"))

    def disconnect_admin(self, websocket: WebSocket, link_id: str):
        if link_id in self.local_connections:
            if websocket in self.local_connections[link_id]["admins"]:
                self.local_connections[link_id]["admins"].remove(websocket)
            if not self.local_connections[link_id]["admins"] and not self.local_connections[link_id]["candidate"]:
                del self.local_connections[link_id]
                if self.pubsub:
                    asyncio.create_task(self.pubsub.unsubscribe(f"session:{link_id}:candidate", f"session:{link_id}:admins"))

    async def connect_dashboard(self, websocket: WebSocket, auth_context: Dict[str, str]):
        await websocket.accept()
        self.dashboard_connections.append({"websocket": websocket, **auth_context})
        await self.connect_redis()
        if self.pubsub:
            await self.pubsub.subscribe("dashboard:updates")

    def disconnect_dashboard(self, websocket: WebSocket):
        self.dashboard_connections = [
            connection
            for connection in self.dashboard_connections
            if connection.get("websocket") is not websocket
        ]

    async def broadcast_dashboard(self, data: Dict[str, Any]):
        """Send a dashboard event only to admins authorized for its tenant."""
        stale_connections = []
        for connection in list(self.dashboard_connections):
            if not admin_can_receive_dashboard_event(connection, data):
                continue
            websocket = connection.get("websocket")
            try:
                await websocket.send_json(data)
            except Exception as exc:
                logger.error("Error sending dashboard update: %s", exc)
                stale_connections.append(websocket)
        for websocket in stale_connections:
            self.disconnect_dashboard(websocket)

    async def send_to_candidate(self, link_id: str, message: dict):
        """Publish a message to the candidate's channel."""
        await self.connect_redis()
        if self.redis:
            await self.redis.publish(f"session:{link_id}:candidate", json.dumps(message))
        else:
            if link_id in self.local_connections:
                cand_ws = self.local_connections[link_id]["candidate"]
                if cand_ws:
                    try:
                        await cand_ws.send_json(message)
                    except Exception:
                        pass

    async def send_to_admins(self, link_id: str, message: dict):
        """Publish a message to the admins' channel."""
        await self.connect_redis()
        if self.redis:
            await self.redis.publish(f"session:{link_id}:admins", json.dumps(message))
        else:
            if link_id in self.local_connections:
                for admin_ws in self.local_connections[link_id]["admins"]:
                    try:
                        await admin_ws.send_json(message)
                    except Exception:
                        pass

manager = RedisConnectionManager()
