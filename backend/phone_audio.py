"""
phone_audio.py — Real-time phone audio streaming to laptop speakers via scrcpy.

Uses scrcpy's built-in audio forwarding (Android 11+, scrcpy 2.0+).
Audio plays directly through laptop speakers, no extra app needed on phone.
"""

import subprocess
import os
import signal
import asyncio
from dotenv import load_dotenv

load_dotenv()

PHONE_IP = os.getenv("PHONE_TAILSCALE_IP")

# Global process reference
_audio_process = None


def get_adb_target() -> str | None:
    if PHONE_IP:
        return f"{PHONE_IP}:5555"
    return None


def is_audio_running() -> bool:
    """Check if the audio stream process is currently running."""
    global _audio_process
    if _audio_process is None:
        return False
    return _audio_process.poll() is None  # None = still running


def start_phone_audio() -> dict:
    """
    Start streaming phone audio to laptop speakers using scrcpy.
    Uses --no-video so only audio is forwarded (no mirror window popup).
    """
    global _audio_process

    if is_audio_running():
        return {"success": True, "message": "Audio already streaming, Sir."}

    target = get_adb_target()
    if not target:
        return {"success": False, "message": "Phone IP not configured in .env, Sir."}

    try:
        cmd = [
            "scrcpy",
            "-s", target,
            "--no-video",                    # Audio only — no screen mirror window
            "--audio-codec=opus",            # Low-latency Opus codec
            "--audio-bit-rate=128000",       # 128kbps quality
            "--audio-buffer=50",             # 50ms buffer for low latency
            "--audio-dup",                   # Play audio on phone AND laptop simultaneously
        ]

        _audio_process = subprocess.Popen(
            cmd,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            # New process group so we can kill cleanly
            preexec_fn=os.setsid
        )

        # Give it a moment to connect
        import time
        time.sleep(1.5)

        if is_audio_running():
            return {"success": True, "message": "Phone audio streaming to your laptop, Sir."}
        else:
            return {"success": False, "message": "Audio stream failed to start. Make sure phone is on Android 11+ and audio permission is granted, Sir."}

    except FileNotFoundError:
        return {"success": False, "message": "scrcpy not found. Install via: brew install scrcpy"}
    except Exception as e:
        return {"success": False, "message": f"Audio stream error: {str(e)}"}


def stop_phone_audio() -> dict:
    """Stop the running audio stream."""
    global _audio_process

    if not is_audio_running():
        _audio_process = None
        return {"success": True, "message": "Audio stream was not running, Sir."}

    try:
        # Kill the entire process group (so child processes also die)
        os.killpg(os.getpgid(_audio_process.pid), signal.SIGTERM)
        _audio_process = None
        return {"success": True, "message": "Phone audio stopped, Sir."}
    except Exception as e:
        try:
            _audio_process.kill()
            _audio_process = None
        except Exception:
            pass
        return {"success": True, "message": "Phone audio stopped, Sir."}


def get_audio_status() -> dict:
    """Return current audio stream status."""
    running = is_audio_running()
    return {
        "running": running,
        "message": "Phone audio is streaming to your laptop speakers." if running else "Phone audio is not streaming."
    }
