"""
camera_stream.py — Real-time phone camera streaming to dashboard.

Strategy:
1. scrcpy records camera to a temp MKV file with --record=/tmp/cam_fifo.mkv
2. ffmpeg reads that file as it grows and converts H264 → MJPEG frames
3. MJPEG frames are broadcast over WebSocket to the dashboard

This avoids the pipe buffering issue that caused NO SIGNAL.
"""

import asyncio
import os
import signal
import base64
import tempfile
import time
from fastapi import WebSocket
from dotenv import load_dotenv

load_dotenv()

PHONE_IP = os.getenv("PHONE_TAILSCALE_IP")
RECORD_FILE = "/tmp/jarvis_cam_stream.mkv"


def get_adb_target():
    if PHONE_IP:
        return f"{PHONE_IP}:5555"
    return None


class CameraStreamManager:
    def __init__(self):
        self.scrcpy_proc = None
        self.ffmpeg_proc = None
        self.current_facing = "back"
        self.active_websockets = set()
        self.lock = asyncio.Lock()
        self.broadcast_task = None

    async def start_stream(self, facing="back"):
        async with self.lock:
            if self.scrcpy_proc and self.current_facing == facing:
                return True

            await self.stop_stream_internal()
            self.current_facing = facing

            target = get_adb_target()
            if not target:
                return False

            # Remove old recording file if it exists
            try:
                if os.path.exists(RECORD_FILE):
                    os.remove(RECORD_FILE)
            except Exception:
                pass

            scrcpy_cmd = [
                "scrcpy",
                "-s", target,
                "--video-source=camera",
                f"--camera-facing={facing}",
                "--no-audio",
                "--no-playback",
                "--no-window",
                f"--record={RECORD_FILE}",
                "--record-format=mkv",
                "--max-size=640",
                "--max-fps=12"
            ]

            try:
                self.scrcpy_proc = await asyncio.create_subprocess_exec(
                    *scrcpy_cmd,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                    preexec_fn=os.setsid
                )

                # Wait for scrcpy to create and start writing the file
                for _ in range(30):  # Up to 3 seconds
                    await asyncio.sleep(0.1)
                    if os.path.exists(RECORD_FILE) and os.path.getsize(RECORD_FILE) > 0:
                        break

                if not os.path.exists(RECORD_FILE) or os.path.getsize(RECORD_FILE) == 0:
                    print("[camera] scrcpy did not start writing in time")
                    await self.stop_stream_internal()
                    return False

                # Wait a bit more so the MKV header is fully written
                await asyncio.sleep(1.5)

                # Start ffmpeg that reads the growing MKV file and outputs MJPEG frames
                ffmpeg_cmd = [
                    "ffmpeg",
                    "-re",                      # Read at native framerate
                    "-i", RECORD_FILE,
                    "-an",
                    "-f", "image2pipe",
                    "-vcodec", "mjpeg",
                    "-q:v", "5",               # Quality level (2=best, 31=worst)
                    "-"
                ]

                self.ffmpeg_proc = await asyncio.create_subprocess_exec(
                    *ffmpeg_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    preexec_fn=os.setsid
                )

                self.broadcast_task = asyncio.create_task(self._broadcast_frames())
                print(f"[camera] Stream started — {facing} camera → {RECORD_FILE}")
                return True

            except Exception as e:
                print(f"[camera] Error starting stream: {e}")
                await self.stop_stream_internal()
                return False

    async def _broadcast_frames(self):
        buffer = b""
        try:
            while self.ffmpeg_proc:
                chunk = await self.ffmpeg_proc.stdout.read(16384)
                if not chunk:
                    break
                buffer += chunk

                # Parse out individual JPEG frames from the MJPEG stream
                while True:
                    start = buffer.find(b"\xff\xd8")
                    end = buffer.find(b"\xff\xd9")

                    if start == -1 or end == -1 or end < start:
                        break

                    frame = buffer[start:end + 2]
                    buffer = buffer[end + 2:]

                    if len(frame) < 100:
                        continue  # Skip garbage frames

                    if self.active_websockets:
                        data = base64.b64encode(frame).decode("utf-8")
                        dead = []
                        for ws in list(self.active_websockets):
                            try:
                                await ws.send_json({"frame": data})
                            except Exception:
                                dead.append(ws)
                        for ws in dead:
                            self.active_websockets.discard(ws)

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[camera] Broadcast error: {e}")

    async def stop_stream(self):
        async with self.lock:
            await self.stop_stream_internal()

    async def stop_stream_internal(self):
        if self.broadcast_task:
            self.broadcast_task.cancel()
            self.broadcast_task = None

        if self.ffmpeg_proc:
            try:
                os.killpg(os.getpgid(self.ffmpeg_proc.pid), signal.SIGTERM)
            except Exception:
                pass
            self.ffmpeg_proc = None

        if self.scrcpy_proc:
            try:
                os.killpg(os.getpgid(self.scrcpy_proc.pid), signal.SIGTERM)
            except Exception:
                pass
            self.scrcpy_proc = None

        # Clean up the recording file
        try:
            if os.path.exists(RECORD_FILE):
                os.remove(RECORD_FILE)
        except Exception:
            pass


camera_manager = CameraStreamManager()


async def stream_phone_camera(websocket: WebSocket):
    await websocket.accept()
    camera_manager.active_websockets.add(websocket)

    # Auto-start stream if not already running
    if not camera_manager.scrcpy_proc:
        await websocket.send_json({"status": "connecting", "message": "Starting camera..."})
        success = await camera_manager.start_stream(facing="back")
        if not success:
            await websocket.send_json({
                "error": "Camera stream failed. Check: phone connected to Tailscale, Android 12+, camera not in use by another app."
            })
            camera_manager.active_websockets.discard(websocket)
            await websocket.close()
            return

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
                if "facing" in data:
                    await websocket.send_json({"status": "switching", "message": f"Switching to {data['facing']} camera..."})
                    await camera_manager.start_stream(facing=data["facing"])
            except asyncio.TimeoutError:
                # Send a keepalive ping
                try:
                    await websocket.send_json({"ping": True})
                except Exception:
                    break
    except Exception:
        pass
    finally:
        camera_manager.active_websockets.discard(websocket)
        await asyncio.sleep(2)
        if not camera_manager.active_websockets:
            await camera_manager.stop_stream()
