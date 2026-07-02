from fastapi import WebSocket
import asyncio
import base64
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

from backend.phone_state import get_active_phone_ip

def get_adb_target():
    ip = get_active_phone_ip()
    if ip:
        return f"{ip}:5555"
    return None

async def stream_phone_screen(websocket: WebSocket):
    """WebSocket endpoint that streams phone screenshots as base64 frames."""
    await websocket.accept()

    target = get_adb_target()
    if not target:
        await websocket.send_json({"error": "Phone not configured."})
        await websocket.close()
        return

    # Wake up screen so it doesn't capture black
    try:
        subprocess.run(["adb", "-s", target, "shell", "input", "keyevent", "WAKEUP"], timeout=2)
    except Exception:
        pass

    try:
        while True:
            try:
                # Capture screenshot directly to stdout
                cmd = ["adb", "-s", target, "exec-out", "screencap", "-p"]
                
                # Run with 15 second timeout to handle Tailscale latency spikes
                proc = await asyncio.create_subprocess_exec(
                    *cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL
                )
                
                try:
                    stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=15.0)
                    if proc.returncode == 0 and stdout:
                        data = base64.b64encode(stdout).decode()
                        await websocket.send_json({"frame": data})
                except asyncio.TimeoutError:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    await websocket.send_json({"error": "Screenshot timeout (latency spike)"})

            except Exception as e:
                await websocket.send_json({"error": str(e)})

            # 1 FPS limit to save bandwidth over Tailscale
            await asyncio.sleep(1.0) 

    except Exception:
        # Client disconnected
        pass
