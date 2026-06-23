import asyncio
import websockets
import json

async def test_ws():
    # Replace with a token printed from the console or bypass if disabled
    uri = "ws://localhost:8000/ws/webrtc/admin/test-id?token=invalid_token"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to admin WS!")
            await websocket.send(json.dumps({"type": "test"}))
            print("Sent message")
            msg = await websocket.recv()
            print("Received:", msg)
    except Exception as e:
        print("Failed to connect:", e)

asyncio.run(test_ws())
