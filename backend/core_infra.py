import asyncio
import time
import json
import logging
from typing import Dict, List, Set, Any, Callable
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)

# ============================================================================
# 1. Pub/Sub Broker
# ============================================================================
class AsyncPubSub:
    """In-memory Publish-Subscribe broker for real-time events."""
    def __init__(self):
        self.subscribers: Dict[str, Set[asyncio.Queue]] = defaultdict(set)
        
    async def subscribe(self, channel: str) -> asyncio.Queue:
        """Subscribe to a channel and return a queue to listen on."""
        queue = asyncio.Queue()
        self.subscribers[channel].add(queue)
        return queue
        
    async def unsubscribe(self, channel: str, queue: asyncio.Queue):
        """Remove a subscription."""
        if channel in self.subscribers and queue in self.subscribers[channel]:
            self.subscribers[channel].remove(queue)
            if not self.subscribers[channel]:
                del self.subscribers[channel]
                
    async def publish(self, channel: str, message: Any):
        """Publish a message to all subscribers of a channel."""
        if channel in self.subscribers:
            for queue in list(self.subscribers[channel]):
                try:
                    await queue.put(message)
                except Exception as e:
                    logger.error(f"Error publishing to queue on channel {channel}: {e}")

pubsub = AsyncPubSub()


# ============================================================================
# 2. WebSocket Manager (Affinity / Connection tracking)
# ============================================================================
class WebSocketManager:
    """Manages active WebSockets and routing (Simulating Sticky Sessions)."""
    def __init__(self):
        # interview_id -> WebSocket
        self.active_connections: Dict[str, WebSocket] = {}
        
    async def connect(self, websocket: WebSocket, interview_id: str):
        await websocket.accept()
        self.active_connections[interview_id] = websocket
        
    def disconnect(self, interview_id: str):
        if interview_id in self.active_connections:
            del self.active_connections[interview_id]
            
    async def send_personal_message(self, message: str, interview_id: str):
        if interview_id in self.active_connections:
            ws = self.active_connections[interview_id]
            await ws.send_text(message)

    async def send_json(self, data: dict, interview_id: str):
        if interview_id in self.active_connections:
            ws = self.active_connections[interview_id]
            await ws.send_json(data)

ws_manager = WebSocketManager()


# ============================================================================
# 3. Producer-Consumer Queue (Background Tasks)
# ============================================================================
class ProducerConsumerQueue:
    """Background task queue for heavy LLM generations."""
    def __init__(self, max_workers=3):
        self.queue = asyncio.Queue()
        self.max_workers = max_workers
        self.workers = []
        
    async def start(self):
        """Start consumer workers."""
        for i in range(self.max_workers):
            task = asyncio.create_task(self._worker(i))
            self.workers.append(task)
            
    async def stop(self):
        """Stop all workers gracefully."""
        for _ in range(self.max_workers):
            await self.queue.put(None) # Sentinel to stop
        await asyncio.gather(*self.workers)
        
    async def produce(self, task_func: Callable, *args, **kwargs):
        """Add a task to the queue."""
        await self.queue.put((task_func, args, kwargs))
        
    async def _worker(self, worker_id: int):
        logger.info(f"Worker {worker_id} started.")
        while True:
            item = await self.queue.get()
            if item is None:
                self.queue.task_done()
                break
                
            func, args, kwargs = item
            try:
                if asyncio.iscoroutinefunction(func):
                    await func(*args, **kwargs)
                else:
                    func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Worker {worker_id} failed task: {e}")
            finally:
                self.queue.task_done()

task_queue = ProducerConsumerQueue()


# ============================================================================
# 4. Database Batch Writer
# ============================================================================
class MongoBatchWriter:
    """Buffers writes and flushes them to MongoDB in bulk to reduce connection overhead."""
    def __init__(self, collection, flush_interval=5.0, batch_size=50):
        self.collection = collection
        self.flush_interval = flush_interval
        self.batch_size = batch_size
        self.buffer = []
        self._task = None
        self._lock = asyncio.Lock()
        
    async def start(self):
        self._task = asyncio.create_task(self._flush_loop())
        
    async def stop(self):
        if self._task:
            self._task.cancel()
        await self._flush_now()
        
    async def insert(self, document: dict):
        async with self._lock:
            self.buffer.append(document)
            if len(self.buffer) >= self.batch_size:
                # Force flush if full
                asyncio.create_task(self._flush_now())
                
    async def _flush_loop(self):
        while True:
            await asyncio.sleep(self.flush_interval)
            await self._flush_now()
            
    async def _flush_now(self):
        async with self._lock:
            if not self.buffer:
                return
            to_insert = self.buffer[:]
            self.buffer.clear()
            
        try:
            # We assume self.collection is a standard pymongo collection.
            # In a fully async app, this would be motor. Since the app uses sync pymongo:
            # we wrap it in a thread to not block the event loop.
            await asyncio.to_thread(self.collection.insert_many, to_insert)
            logger.info(f"Batched {len(to_insert)} writes to {self.collection.name}")
        except Exception as e:
            logger.error(f"Failed bulk write: {e}")
            # Could re-queue here if critical
