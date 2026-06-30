import os
import secrets
import time
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

REMOTE_PIN = os.getenv("REMOTE_PIN", "")
OWNER_WHATSAPP = os.getenv("OWNER_WHATSAPP_CONTACT", "Me")
SESSION_MINUTES = 30
MAX_ATTEMPTS = 3
LOCKOUT_MINUTES = 5

_sessions: dict[str, float] = {}
_failed_attempts: dict[str, list[float]] = {}
_lockouts: dict[str, float] = {}


def _client_key(ip: Optional[str]) -> str:
    return ip or "unknown"


def is_pin_required() -> bool:
    return bool(REMOTE_PIN)


def is_locked(client_ip: Optional[str]) -> tuple[bool, int]:
    key = _client_key(client_ip)
    until = _lockouts.get(key, 0)
    if until > time.time():
        return True, int(until - time.time())
    return False, 0


def verify_pin(pin: str, client_ip: Optional[str] = None) -> dict:
    if not is_pin_required():
        token = secrets.token_urlsafe(24)
        _sessions[token] = time.time() + SESSION_MINUTES * 60
        return {"success": True, "token": token, "expires_in": SESSION_MINUTES * 60}

    key = _client_key(client_ip)
    locked, remaining = is_locked(client_ip)
    if locked:
        return {
            "success": False,
            "locked": True,
            "message": f"Locked for {remaining} seconds, Sir.",
        }

    if pin == REMOTE_PIN:
        _failed_attempts.pop(key, None)
        token = secrets.token_urlsafe(24)
        _sessions[token] = time.time() + SESSION_MINUTES * 60
        return {
            "success": True,
            "token": token,
            "expires_in": SESSION_MINUTES * 60,
            "message": "Access granted, Sir.",
        }

    attempts = _failed_attempts.setdefault(key, [])
    attempts.append(time.time())
    attempts[:] = [t for t in attempts if time.time() - t < 600]

    if len(attempts) >= MAX_ATTEMPTS:
        _lockouts[key] = time.time() + LOCKOUT_MINUTES * 60
        _failed_attempts.pop(key, None)
        alert_result = _send_intruder_alert()
        return {
            "success": False,
            "locked": True,
            "message": "Sir, someone tried to access Jarvis remotely.",
            "alert": alert_result,
        }

    left = MAX_ATTEMPTS - len(attempts)
    return {
        "success": False,
        "message": f"Incorrect PIN. {left} attempt(s) remaining, Sir.",
    }


def validate_session(token: Optional[str]) -> bool:
    if not is_pin_required():
        return True
    if not token:
        return False
    expiry = _sessions.get(token)
    if not expiry:
        return False
    if expiry < time.time():
        _sessions.pop(token, None)
        return False
    return True


def _capture_intruder_photo() -> Optional[str]:
    import subprocess

    path = "/tmp/jarvis_intruder.jpg"
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-f", "avfoundation", "-framerate", "30",
                "-i", "0", "-frames:v", "1", path,
            ],
            capture_output=True,
            timeout=8,
        )
        if os.path.exists(path):
            return path
    except Exception:
        pass
    try:
        subprocess.run(["screencapture", "-x", path], capture_output=True, timeout=5)
        if os.path.exists(path):
            return path
    except Exception:
        pass
    return None


def _send_intruder_alert() -> dict:
    msg = (
        "Sir, someone tried to access Jarvis remotely. "
        f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
    )
    try:
        from backend.whatsapp_selenium import send_message
        send_message(OWNER_WHATSAPP, msg)
        return {"whatsapp": "sent", "message": msg}
    except Exception as e:
        return {"whatsapp": "failed", "error": str(e)}
