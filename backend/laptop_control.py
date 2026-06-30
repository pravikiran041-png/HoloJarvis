import base64
import os
import subprocess
from typing import Optional

import pyautogui

pyautogui.FAILSAFE = False

LAPTOP_SCREENSHOT_PATH = "/tmp/laptop_frame.jpg"

APP_ALIASES = {
    "chrome": "Google Chrome",
    "google chrome": "Google Chrome",
    "safari": "Safari",
    "finder": "Finder",
    "spotify": "Spotify",
    "whatsapp": "WhatsApp",
    "messages": "Messages",
    "terminal": "Terminal",
    "vscode": "Visual Studio Code",
    "code": "Visual Studio Code",
    "notes": "Notes",
    "mail": "Mail",
}


def capture_screenshot() -> dict:
    try:
        subprocess.run(
            ["screencapture", "-x", "-t", "jpg", LAPTOP_SCREENSHOT_PATH],
            capture_output=True,
            timeout=3,
            check=True,
        )
        if not os.path.exists(LAPTOP_SCREENSHOT_PATH):
            return {"success": False, "error": "Screenshot file missing"}
        with open(LAPTOP_SCREENSHOT_PATH, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        w, h = pyautogui.size()
        return {"success": True, "image": data, "width": w, "height": h}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_screen_size() -> dict:
    w, h = pyautogui.size()
    return {"width": int(w), "height": int(h)}


def open_app(app_name: str) -> dict:
    resolved = APP_ALIASES.get(app_name.lower().strip(), app_name)
    try:
        subprocess.run(["open", "-a", resolved], check=True, timeout=10)
        return {"success": True, "message": f"Opened {resolved}, Sir."}
    except Exception as e:
        return {"success": False, "message": f"Could not open {app_name}: {e}"}


def lock_display() -> dict:
    try:
        subprocess.run(["pmset", "displaysleepnow"], check=False, timeout=5)
        return {"success": True, "message": "Display locked, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def sleep_now() -> dict:
    try:
        subprocess.run(["pmset", "sleepnow"], check=False, timeout=5)
        return {"success": True, "message": "Laptop sleeping, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def set_volume(level: int) -> dict:
    level = max(0, min(100, int(level)))
    try:
        subprocess.run(
            ["osascript", "-e", f"set volume output volume {level}"],
            check=True,
            timeout=5,
        )
        return {"success": True, "message": f"Volume set to {level}%, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def type_text(text: str) -> dict:
    try:
        pyautogui.write(text, interval=0.02)
        return {"success": True, "message": "Typed on laptop, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def click_at(x: int, y: int) -> dict:
    try:
        pyautogui.click(int(x), int(y))
        return {"success": True, "message": f"Clicked ({x}, {y}), Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def scroll_screen(direction: str, amount: int = 3) -> dict:
    try:
        delta = int(amount) if direction.lower() == "up" else -int(amount)
        pyautogui.scroll(delta)
        return {"success": True, "message": f"Scrolled {direction}, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def press_key(key: str) -> dict:
    try:
        pyautogui.press(key.lower())
        return {"success": True, "message": f"Pressed {key}, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def drag_to(x1: int, y1: int, x2: int, y2: int) -> dict:
    try:
        pyautogui.moveTo(int(x1), int(y1))
        pyautogui.dragTo(int(x2), int(y2), duration=0.5, button="left")
        return {"success": True, "message": "Drag completed, Sir."}
    except Exception as e:
        return {"success": False, "message": str(e)}


def describe_laptop_screen(groq_key: Optional[str]) -> dict:
    """Capture laptop screen and summarize with Groq vision."""
    cap = capture_screenshot()
    if not cap.get("success"):
        return cap

    if not groq_key:
        return {
            "success": True,
            "description": "Screenshot captured but no Groq API key for analysis, Sir.",
        }

    from backend.phone_control import _groq_vision_request, _shrink_png_for_vision

    raw = base64.b64decode(cap["image"])
    image_bytes = _shrink_png_for_vision(raw)
    mime = "image/jpeg" if image_bytes[:2] == b"\xff\xd8" else "image/png"
    result = _groq_vision_request(
        groq_key,
        image_bytes,
        mime,
    )
    if result.get("ok"):
        return {"success": True, "description": result["description"], "image": cap["image"]}
    return {
        "success": False,
        "description": result.get("error", "Vision analysis failed"),
        "image": cap["image"],
    }
