from fastapi import WebSocket
import asyncio
import base64
import subprocess
import os
from dotenv import load_dotenv

load_dotenv()

PHONE_IP = os.getenv("PHONE_TAILSCALE_IP")


def get_adb_target():
    """Return the ADB target specifier for wireless connection."""
    if PHONE_IP:
        return f"{PHONE_IP}:5555"
    return None


def run_adb_stream(command: list, timeout=5):
    """Run an ADB command targeting the Tailscale wireless device."""
    target = get_adb_target()
    if target:
        full_cmd = ["adb", "-s", target] + command
    else:
        full_cmd = ["adb"] + command
    return subprocess.run(full_cmd, capture_output=True, timeout=timeout)


async def stream_phone_screen(websocket: WebSocket):
    """WebSocket endpoint that streams phone screenshots as base64 frames."""
    await websocket.accept()
    screenshot_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "phone_frame.png")
    )

    try:
        while True:
            try:
                # Capture screenshot directly to stdout (much faster, no disk I/O on phone)
                target = get_adb_target()
                cmd = ["adb", "-s", target, "exec-out", "screencap", "-p"] if target else ["adb", "exec-out", "screencap", "-p"]
                proc = subprocess.run(cmd, capture_output=True, timeout=5)

                if proc.returncode == 0 and proc.stdout:
                    data = base64.b64encode(proc.stdout).decode()
                    await websocket.send_json({"frame": data})

            except subprocess.TimeoutExpired:
                await websocket.send_json({"error": "Screenshot timeout"})
            except Exception as e:
                await websocket.send_json({"error": str(e)})

            await asyncio.sleep(0.1) # Much faster poll rate

    except Exception:
        # Client disconnected
        pass
    finally:
        # Cleanup temp file
        try:
            if os.path.exists(screenshot_path):
                os.remove(screenshot_path)
        except Exception:
            pass
