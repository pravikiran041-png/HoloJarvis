"""
phone_stream.py — Real-time phone screen streaming to dashboard.

Strategy:
Uses scrcpy to record the phone display into a temp MKV file, and ffmpeg to read 
it and convert to MJPEG frames broadcasted over WebSocket. This is 100x faster 
than running adb screencap in a loop and works on budget devices like Samsung A23.
"""

import asyncio
import os
import signal
import base64
from fastapi import WebSocket
from dotenv import load_dotenv

load_dotenv()

PHONE_IP = os.getenv("PHONE_TAILSCALE_IP")
RECORD_FILE = "/tmp/jarvis_display_stream.mkv"


def get_adb_target():
    if PHONE_IP:
        return f"{PHONE_IP}:5555"
    return None


class ScreenStreamManager:
    def __init__(self):
        self.scrcpy_proc = None
        self.ffmpeg_proc = None
        self.active_websockets = set()
        self.lock = asyncio.Lock()
        self.broadcast_task = None

    async def start_stream(self):
        async with self.lock:
            if self.scrcpy_proc:
                return True

            await self.stop_stream_internal()

            target = get_adb_target()
            if not target:
                return False

            try:
                if os.path.exists(RECORD_FILE):
                    os.remove(RECORD_FILE)
            except Exception:
                pass

            scrcpy_cmd = [
                "scrcpy",
                "-s", target,
                "--no-audio",
                f"--record={RECORD_FILE}",
                "--record-format=mkv",
                "--max-size=640",
                "--max-fps=12",
                "--window-borderless",
                "--window-title=JARVIS_DISP",
                "--window-width=1",
                "--window-height=1",
            ]

            try:
                self.scrcpy_proc = await asyncio.create_subprocess_exec(
                    *scrcpy_cmd,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                    preexec_fn=os.setsid
                )

                # Wait for scrcpy to create and start writing the file (up to 10 seconds for wireless ADB)
                for _ in range(100):
                    await asyncio.sleep(0.1)
                    if os.path.exists(RECORD_FILE) and os.path.getsize(RECORD_FILE) > 0:
                        break

                if not os.path.exists(RECORD_FILE) or os.path.getsize(RECORD_FILE) == 0:
                    print("[screen] scrcpy did not start writing in time")
                    await self.stop_stream_internal()
                    return False

                # Wait a bit more so the MKV header is fully written
                await asyncio.sleep(1.0)

                ffmpeg_cmd = [
                    "ffmpeg",
                    "-re",
                    "-i", RECORD_FILE,
                    "-an",
                    "-f", "image2pipe",
                    "-vcodec", "mjpeg",
                    "-q:v", "5",
                    "-"
                ]

                self.ffmpeg_proc = await asyncio.create_subprocess_exec(
                    *ffmpeg_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    preexec_fn=os.setsid
                )

                self.broadcast_task = asyncio.create_task(self._broadcast_frames())
                print(f"[screen] Stream started → {RECORD_FILE}")
                return True

            except Exception as e:
                print(f"[screen] Error starting stream: {e}")
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

                while True:
                    start = buffer.find(b"\xff\xd8")
                    end = buffer.find(b"\xff\xd9")

                    if start == -1 or end == -1 or end < start:
                        break

                    frame = buffer[start:end + 2]
                    buffer = buffer[end + 2:]

                    if len(frame) < 100:
                        continue

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
            print(f"[screen] Broadcast error: {e}")

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

        try:
            if os.path.exists(RECORD_FILE):
                os.remove(RECORD_FILE)
        except Exception:
            pass


screen_manager = ScreenStreamManager()


async def stream_phone_screen(websocket: WebSocket):
    await websocket.accept()
    screen_manager.active_websockets.add(websocket)

    if not screen_manager.scrcpy_proc:
        await websocket.send_json({"status": "connecting", "message": "Starting screen mirror..."})
        success = await screen_manager.start_stream()
        if not success:
            await websocket.send_json({
                "error": "Screen stream failed to start."
            })
            screen_manager.active_websockets.discard(websocket)
            await websocket.close()
            return

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
            except asyncio.TimeoutError:
                try:
                    await websocket.send_json({"ping": True})
                except Exception:
                    break
    except Exception:
        pass
    finally:
        screen_manager.active_websockets.discard(websocket)
        await asyncio.sleep(2)
        if not screen_manager.active_websockets:
            await screen_manager.stop_stream()
