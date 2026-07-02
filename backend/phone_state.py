"""
phone_state.py — Global active phone state manager for multi-device support.

Manages which phone (A55 or A23) is currently the "active" device for all
ADB commands, screen mirroring, camera streaming, and audio forwarding.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Device Registry ──
PHONES = {
    "a55": {
        "name": "Samsung A55",
        "ip": os.getenv("A55_TAILSCALE_IP"),
        "pin": os.getenv("A55_PIN", "2580"),
        "usb_id": os.getenv("A55_USB_ID", ""),
    },
    "a23": {
        "name": "Samsung A23",
        "ip": os.getenv("A23_TAILSCALE_IP"),
        "pin": os.getenv("A23_PIN", ""),
        "usb_id": os.getenv("A23_USB_ID", "R58T410V7YN"),
    },
}

# ── Active Phone State ──
_active_phone = "a55"  # Default to A55


def get_active_phone() -> str:
    """Return the key of the currently active phone (e.g. 'a55' or 'a23')."""
    return _active_phone


def get_active_phone_info() -> dict:
    """Return the full info dict for the currently active phone."""
    return PHONES.get(_active_phone, PHONES["a55"])


def get_active_phone_ip() -> str | None:
    """Return the Tailscale IP of the currently active phone."""
    info = get_active_phone_info()
    return info.get("ip")


def get_active_phone_pin() -> str | None:
    """Return the PIN/pattern of the currently active phone."""
    info = get_active_phone_info()
    return info.get("pin")


def get_active_phone_name() -> str:
    """Return the human-readable name of the currently active phone."""
    info = get_active_phone_info()
    return info.get("name", "Unknown Phone")


def get_active_phone_usb_id() -> str | None:
    """Return the USB serial ID of the currently active phone."""
    info = get_active_phone_info()
    return info.get("usb_id")


def set_active_phone(target: str) -> dict:
    """
    Switch the active phone to the specified target.
    target: 'a55' or 'a23' (case-insensitive)
    """
    global _active_phone
    key = target.lower().strip()

    if key not in PHONES:
        return {
            "success": False,
            "message": f"Unknown phone '{target}', Sir. Available: {', '.join(PHONES.keys())}",
        }

    phone = PHONES[key]
    if not phone.get("ip"):
        return {
            "success": False,
            "message": f"{phone['name']} IP is not configured in .env, Sir.",
        }

    _active_phone = key
    return {
        "success": True,
        "message": f"Switched to {phone['name']}, Sir.",
        "phone": key,
        "name": phone["name"],
        "ip": phone["ip"],
    }


def list_phones() -> list:
    """Return a list of all registered phones and their connection status."""
    result = []
    for key, info in PHONES.items():
        result.append({
            "key": key,
            "name": info["name"],
            "ip": info.get("ip"),
            "active": key == _active_phone,
            "configured": bool(info.get("ip")),
        })
    return result
