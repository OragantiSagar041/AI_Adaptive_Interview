from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import asyncio
import json

router = APIRouter()

class VoiceConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, link_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[link_id] = websocket

    def disconnect(self, link_id: str):
        if link_id in self.active_connections:
            del self.active_connections[link_id]

    async def send_json(self, link_id: str, data: dict):
        if link_id in self.active_connections:
            await self.active_connections[link_id].send_json(data)

    async def send_bytes(self, link_id: str, data: bytes):
        if link_id in self.active_connections:
            await self.active_connections[link_id].send_bytes(data)

voice_manager = VoiceConnectionManager()

@router.websocket("/ws/voice/{link_id}")
async def voice_interview_endpoint(websocket: WebSocket, link_id: str):
    await voice_manager.connect(link_id, websocket)
    
    try:
        # Mock initialization
        await voice_manager.send_json(link_id, {"event": "state", "status": "listening"})
        
        while True:
            # In a real app, this receives binary audio chunks
            data = await websocket.receive()
            
            if "bytes" in data:
                # Mock: we received audio. Transition to thinking, then speaking.
                audio_bytes = data["bytes"]
                
                # Mock VAD / STT logic here
                # ...
                
                await voice_manager.send_json(link_id, {"event": "transcript_update", "text": "I am processing your audio..."})
                await voice_manager.send_json(link_id, {"event": "state", "status": "thinking"})
                
                await asyncio.sleep(1) # simulate LLM time
                
                await voice_manager.send_json(link_id, {"event": "state", "status": "speaking"})
                await voice_manager.send_json(link_id, {"event": "transcript_update", "text": "That's an interesting point. Let's dig deeper."})
                
                # Mock TTS audio bytes (just sending dummy bytes back)
                await voice_manager.send_bytes(link_id, b'MOCK_AUDIO_RESPONSE')
                
                # Wait for audio to finish "playing" then go back to listening
                await asyncio.sleep(2)
                await voice_manager.send_json(link_id, {"event": "state", "status": "listening"})

            elif "text" in data:
                text_data = json.loads(data["text"])
                print(f"Voice WS text message: {text_data}")

    except WebSocketDisconnect:
        voice_manager.disconnect(link_id)
        print(f"Voice Client #{link_id} disconnected")
    except Exception as e:
        voice_manager.disconnect(link_id)
        print(f"Voice WS Error #{link_id}: {e}")
