import asyncio
import os
import signal
import base64
from fastapi import WebSocket
from dotenv import load_dotenv

load_dotenv()

PHONE_IP = os.getenv("PHONE_TAILSCALE_IP")

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
        self.pipe_task = None
        self.broadcast_task = None

    async def start_stream(self, facing="back"):
        async with self.lock:
            # If already running with the correct facing, do nothing
            if self.scrcpy_proc and self.current_facing == facing:
                return True
                
            # Stop existing stream if we need to switch facing
            await self.stop_stream_internal()
            
            self.current_facing = facing
            target = get_adb_target()
            if not target:
                return False
                
            scrcpy_cmd = [
                "scrcpy",
                "-s", target,
                "--video-source=camera",
                f"--camera-facing={facing}",
                "--no-audio",
                "--no-playback",
                "--record=-",
                "--record-format=mkv",
                "--max-size=800",
                "--max-fps=15"
            ]
            
            ffmpeg_cmd = [
                "ffmpeg",
                "-i", "-",
                "-an",
                "-f", "image2pipe",
                "-vcodec", "mjpeg",
                "-"
            ]
            
            try:
                # Start scrcpy (writes mkv to stdout)
                self.scrcpy_proc = await asyncio.create_subprocess_exec(
                    *scrcpy_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    preexec_fn=os.setsid
                )
                
                # Start ffmpeg (reads mkv from stdin, writes mjpeg to stdout)
                self.ffmpeg_proc = await asyncio.create_subprocess_exec(
                    *ffmpeg_cmd,
                    stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.DEVNULL,
                    preexec_fn=os.setsid
                )
                
                # Pipe scrcpy stdout to ffmpeg stdin
                self.pipe_task = asyncio.create_task(self._pipe_scrcpy_to_ffmpeg())
                
                # Broadcast frames from ffmpeg stdout to active websockets
                self.broadcast_task = asyncio.create_task(self._broadcast_frames())
                
                return True
            except Exception as e:
                print(f"Error starting camera: {e}")
                await self.stop_stream_internal()
                return False

    async def _pipe_scrcpy_to_ffmpeg(self):
        try:
            while self.scrcpy_proc and self.ffmpeg_proc:
                chunk = await self.scrcpy_proc.stdout.read(8192)
                if not chunk:
                    break
                self.ffmpeg_proc.stdin.write(chunk)
                await self.ffmpeg_proc.stdin.drain()
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Camera stream piping error: {e}")
        finally:
            if self.ffmpeg_proc and self.ffmpeg_proc.stdin:
                try:
                    self.ffmpeg_proc.stdin.close()
                except Exception:
                    pass

    async def _broadcast_frames(self):
        buffer = b""
        try:
            while self.ffmpeg_proc:
                chunk = await self.ffmpeg_proc.stdout.read(8192)
                if not chunk:
                    break
                buffer += chunk
                
                # Find JPEG frames
                while b"\xff\xd8" in buffer and b"\xff\xd9" in buffer:
                    start_idx = buffer.find(b"\xff\xd8")
                    end_idx = buffer.find(b"\xff\xd9")
                    
                    if start_idx < end_idx:
                        frame = buffer[start_idx:end_idx + 2]
                        buffer = buffer[end_idx + 2:]
                        
                        if self.active_websockets:
                            data = base64.b64encode(frame).decode('utf-8')
                            closed_ws = []
                            for ws in list(self.active_websockets):
                                try:
                                    await ws.send_json({"frame": data})
                                except Exception:
                                    closed_ws.append(ws)
                            for ws in closed_ws:
                                self.active_websockets.discard(ws)
                    else:
                        buffer = buffer[start_idx:]
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Camera stream broadcast error: {e}")

    async def stop_stream(self):
        async with self.lock:
            await self.stop_stream_internal()

    async def stop_stream_internal(self):
        if self.pipe_task:
            self.pipe_task.cancel()
            self.pipe_task = None
            
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

camera_manager = CameraStreamManager()

async def stream_phone_camera(websocket: WebSocket):
    await websocket.accept()
    camera_manager.active_websockets.add(websocket)
    
    # Auto-start with back camera if not running
    if not camera_manager.scrcpy_proc:
        success = await camera_manager.start_stream(facing="back")
        if not success:
            await websocket.send_json({"error": "Failed to start camera stream, Sir. Please check if your phone is online and has Android 12+."})
            camera_manager.active_websockets.discard(websocket)
            await websocket.close()
            return
            
    try:
        while True:
            # Wait for any control signals from the client (e.g. switch camera)
            data = await websocket.receive_json()
            if "facing" in data:
                # Switch facing direction on the fly
                await camera_manager.start_stream(facing=data["facing"])
    except Exception:
        pass
    finally:
        camera_manager.active_websockets.discard(websocket)
        # Give a 2-second grace period for potential reconnections before shutting down hardware stream
        await asyncio.sleep(2)
        if not camera_manager.active_websockets:
            await camera_manager.stop_stream()
