import asyncio
import base64
import os
import subprocess
from fastapi import WebSocket
import pyautogui

pyautogui.FAILSAFE = False

FRAME_PATH = "/tmp/laptop_frame.jpg"
STREAM_INTERVAL_SEC = 0.8


async def stream_laptop_screen(websocket: WebSocket):
    """Stream laptop screen and handle incoming low-latency mouse/trackpad controls."""
    await websocket.accept()

    async def receive_controls():
        try:
            while True:
                data = await websocket.receive_json()
                action = data.get("action")
                if action == "move":
                    dx = int(data.get("dx", 0))
                    dy = int(data.get("dy", 0))
                    pyautogui.moveRel(dx, dy)
                elif action == "click":
                    button = data.get("button", "left")
                    pyautogui.click(button=button)
                elif action == "scroll":
                    dy = int(data.get("dy", 0))
                    pyautogui.scroll(dy)
                elif action == "key":
                    key = data.get("key")
                    if key:
                        pyautogui.press(key.lower())
                elif action == "type":
                    text = data.get("text")
                    if text:
                        pyautogui.write(text, interval=0.01)
        except Exception:
            pass

    receiver_task = asyncio.create_task(receive_controls())

    try:
        while True:
            try:
                subprocess.run(
                    ["screencapture", "-x", "-t", "jpg", FRAME_PATH],
                    capture_output=True,
                    timeout=2,
                )
                if os.path.exists(FRAME_PATH):
                    with open(FRAME_PATH, "rb") as f:
                        data = base64.b64encode(f.read()).decode()
                    await websocket.send_json({"frame": data, "type": "laptop"})
            except subprocess.TimeoutExpired:
                await websocket.send_json({"error": "Screenshot timeout"})
            except Exception as e:
                await websocket.send_json({"error": str(e)})
            await asyncio.sleep(STREAM_INTERVAL_SEC)
    except Exception:
        pass
    finally:
        receiver_task.cancel()
