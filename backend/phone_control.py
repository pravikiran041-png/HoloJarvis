import subprocess
import base64
import os
import time
from dotenv import load_dotenv

load_dotenv()

PHONE_IP = os.getenv("PHONE_TAILSCALE_IP")
PHONE_PIN = os.getenv("PHONE_PIN")
PHONE_USB_ID = os.getenv("PHONE_USB_ID")


def get_adb_target():
    """Return the ADB target specifier for wireless connection."""
    if PHONE_IP:
        return f"{PHONE_IP}:5555"
    return None


def run_adb(command: list) -> dict:
    """Run an ADB command targeting the Tailscale wireless device."""
    try:
        target = get_adb_target()
        if target:
            full_cmd = ["adb", "-s", target] + command
        else:
            full_cmd = ["adb"] + command
        result = subprocess.run(
            full_cmd, capture_output=True, text=True, timeout=10
        )
        return {"success": True, "output": result.stdout, "error": result.stderr}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "ADB command timed out"}
    except FileNotFoundError:
        return {"success": False, "error": "ADB not found. Install via: brew install android-platform-tools"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def connect_wireless() -> dict:
    """Connect to phone over Tailscale network via ADB TCP."""
    if not PHONE_IP:
        return {"success": False, "message": "PHONE_TAILSCALE_IP not set in .env, Sir"}
    try:
        result = subprocess.run(
            ["adb", "connect", f"{PHONE_IP}:5555"],
            capture_output=True, text=True, timeout=10
        )
        if "connected" in result.stdout.lower() or "already" in result.stdout.lower():
            return {"success": True, "message": f"Phone connected wirelessly via {PHONE_IP}, Sir"}

        return {
            "success": False,
            "message": (
                "Phone ADB reset after restart Sir. "
                "Please connect USB cable once and I will reconnect automatically"
            ),
            "debug": (result.stdout + result.stderr).strip(),
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "Connection attempt timed out, Sir"}
    except Exception as e:
        return {"success": False, "message": f"Connection error: {str(e)}"}


def setup_tcp_wireless() -> dict:
    """Enable wireless ADB over USB once, then connect via Tailscale IP."""
    if not PHONE_IP:
        return {"success": False, "message": "PHONE_TAILSCALE_IP not set in .env, Sir"}
    if not PHONE_USB_ID:
        return {"success": False, "message": "PHONE_USB_ID not set in .env, Sir"}

    try:
        tcpip = subprocess.run(
            ["adb", "-s", PHONE_USB_ID, "tcpip", "5555"],
            capture_output=True, text=True, timeout=12
        )
        tcpip_output = (tcpip.stdout + tcpip.stderr).strip()
        if tcpip.returncode != 0:
            return {
                "success": False,
                "message": "Please connect USB cable Sir, setting up wireless connection",
                "debug": tcpip_output,
            }

        connect = subprocess.run(
            ["adb", "connect", f"{PHONE_IP}:5555"],
            capture_output=True, text=True, timeout=10
        )
        connect_output = (connect.stdout + connect.stderr).strip()
        if "connected" in connect.stdout.lower() or "already" in connect.stdout.lower():
            return {"success": True, "message": "Wireless connection ready Sir"}

        return {
            "success": False,
            "message": "USB setup completed but wireless connect failed, Sir.",
            "debug": connect_output,
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "message": "Wireless setup timed out, Sir"}
    except Exception as e:
        return {"success": False, "message": f"Wireless setup error: {str(e)}"}


def disconnect_wireless() -> dict:
    """Disconnect from the wireless ADB device."""
    target = get_adb_target()
    if target:
        subprocess.run(["adb", "disconnect", target], capture_output=True, text=True, timeout=5)
    return {"success": True, "message": "Phone disconnected, Sir"}


def check_connection() -> dict:
    """Check if phone is connected via ADB."""
    target = get_adb_target()
    if not target:
        # Fallback: check any USB device
        result = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=5)
        lines = result.stdout.strip().split("\n")
        connected = len(lines) > 1 and "device" in lines[1]
        return {"connected": connected}
    try:
        result = subprocess.run(
            ["adb", "-s", target, "get-state"],
            capture_output=True, text=True, timeout=5
        )
        return {"connected": "device" in result.stdout}
    except Exception:
        return {"connected": False}


def check_phone_connected() -> bool:
    """Legacy compatibility wrapper."""
    return check_connection()["connected"]


def ensure_connected() -> dict:
    """Auto-reconnect if not connected."""
    conn = check_connection()
    if conn["connected"]:
        return {"success": True, "message": "Already connected"}
    return connect_wireless()


# ── Wake & Unlock ──

def wake_phone() -> dict:
    """Wake the phone screen if it is off."""
    ensure_connected()
    check = run_adb(["shell", "dumpsys", "power"])
    is_awake = "mWakefulness=Awake" in check.get("output", "")
    if not is_awake:
        run_adb(["shell", "input", "keyevent", "26"])  # Power button
        time.sleep(1)
    return {"success": True, "message": "Phone is awake, Sir"}


def is_phone_locked() -> dict:
    """Check if the phone lock screen is showing."""
    result = run_adb(["shell", "dumpsys", "window"])
    output = result.get("output", "")
    locked = "mDreamingLockscreen=true" in output or \
             "isStatusBarKeyguard=true" in output or \
             "mShowingLockscreen=true" in output
    return {"locked": locked}


def unlock_phone() -> dict:
    """Wake and unlock the phone using the PIN from .env."""
    wake_phone()

    lock_status = is_phone_locked()
    if not lock_status["locked"]:
        return {"success": True, "message": "Phone already unlocked, Sir"}

    if not PHONE_PIN:
        return {"success": False, "message": "PHONE_PIN not set in .env, Sir"}

    # Swipe up to dismiss lock screen
    run_adb(["shell", "input", "swipe", "540", "1600", "540", "800"])
    time.sleep(0.8)

    # Enter PIN
    run_adb(["shell", "input", "text", PHONE_PIN])
    time.sleep(0.3)

    # Press Enter to confirm
    run_adb(["shell", "input", "keyevent", "66"])
    time.sleep(0.5)

    lock_check = is_phone_locked()
    if not lock_check["locked"]:
        return {"success": True, "message": "Phone unlocked, Sir"}
    return {"success": False, "message": "Could not unlock phone, Sir. PIN may be incorrect."}


def lock_phone() -> dict:
    """Lock the phone screen."""
    run_adb(["shell", "input", "keyevent", "26"])  # Power button
    return {"success": True, "message": "Phone locked, Sir"}


def show_phone_sequence() -> dict:
    """Full sequence: connect -> wake -> unlock. Called when user says 'show my phone'."""
    # Step 1: Ensure connected
    conn = check_connection()
    if not conn["connected"]:
        connect_result = connect_wireless()
        if not connect_result["success"]:
            return {"success": False, "message": connect_result.get("message", "Phone not reachable, Sir. Make sure Tailscale is running on both devices.")}

    # Step 2: Wake phone
    wake_phone()

    # Step 3: Unlock
    unlock_result = unlock_phone()

    return {"success": True, "message": "Phone ready, Sir"}


# ── Existing Phone Control Functions ──

def tap_screen(x: int, y: int) -> dict:
    """Tap at specific coordinates on the phone screen."""
    ensure_connected()
    return run_adb(["shell", "input", "tap", str(x), str(y)])


def swipe_screen(x1: int, y1: int, x2: int, y2: int, duration: int = 300) -> dict:
    """Swipe from (x1,y1) to (x2,y2) over given duration in ms."""
    ensure_connected()
    return run_adb(["shell", "input", "swipe",
                    str(x1), str(y1), str(x2), str(y2), str(duration)])


def type_text(text: str) -> dict:
    """Type text on the phone's current focused input."""
    ensure_connected()
    safe = text.replace(" ", "%s").replace("'", "").replace('"', "").replace("&", "").replace(";", "")
    return run_adb(["shell", "input", "text", safe])


def press_key(keycode: str) -> dict:
    """Send a keyevent to the phone."""
    ensure_connected()
    keycodes = {
        "back": "4",
        "home": "3",
        "recents": "187",
        "volume_up": "24",
        "volume_down": "25",
        "mute": "164",
        "power": "26",
        "enter": "66",
        "play_pause": "85",
        "next": "87",
        "previous": "88",
    }
    code = keycodes.get(keycode.lower(), keycode)
    return run_adb(["shell", "input", "keyevent", code])


def take_screenshot() -> dict:
    """Capture phone screenshot and return as base64 PNG."""
    ensure_connected()
    cap_result = run_adb(["shell", "screencap", "-p", "/sdcard/jarvis_screen.png"])
    if not cap_result["success"]:
        return {"success": False, "error": f"Screenshot capture failed: {cap_result.get('error', '')}"}

    screenshot_path = os.path.join(os.path.dirname(__file__), "..", "phone_screenshot.png")
    screenshot_path = os.path.abspath(screenshot_path)
    pull_result = run_adb(["pull", "/sdcard/jarvis_screen.png", screenshot_path])
    if not pull_result["success"]:
        return {"success": False, "error": f"Screenshot pull failed: {pull_result.get('error', '')}"}

    if os.path.exists(screenshot_path):
        with open(screenshot_path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        try:
            os.remove(screenshot_path)
        except Exception:
            pass
        return {"success": True, "image": data}
    return {"success": False, "error": "Screenshot file not found after pull"}


def open_app(package: str) -> dict:
    """Open an app on the phone by common name or package name."""
    ensure_connected()
    
    packages = {
        "whatsapp": "com.whatsapp",
        "youtube": "com.google.android.youtube",
        "camera": "com.sec.android.app.camera", # Samsung fallback (most common failing)
        "settings": "com.android.settings",
        "chrome": "com.android.chrome",
        "instagram": "com.instagram.android",
        "spotify": "com.spotify.music",
        "maps": "com.google.android.apps.maps",
        "phone": "com.samsung.android.dialer",
        "messages": "com.samsung.android.messaging",
        "gallery": "com.sec.android.gallery3d",
        "twitter": "com.twitter.android",
        "x": "com.twitter.android",
        "telegram": "org.telegram.messenger",
        "snapchat": "com.snapchat.android",
        "facebook": "com.facebook.katana",
        "netflix": "com.netflix.mediaclient",
        "tiktok": "com.zhiliaoapp.musically",
        "amazon": "com.amazon.mShop.android.shopping",
        "gmail": "com.google.android.gm",
        "calendar": "com.google.android.calendar",
        "clock": "com.sec.android.app.clockpackage",
        "reddit": "com.reddit.frontpage",
        "linkedin": "com.linkedin.android",
        "play store": "com.android.vending",
        "calculator": "com.sec.android.app.popupcalculator",
        "discord": "com.discord",
        "uber": "com.ubercab",
    }
    
    pkg = packages.get(package.lower())
    
    # Dynamic fallback: Search device for the app name in package list
    if not pkg:
        result = run_adb(["shell", "pm", "list", "packages"])
        lines = result.get("output", "").splitlines()
        search_term = package.lower().replace(" ", "")
        matches = [line.replace("package:", "").strip() for line in lines if search_term in line.lower()]
        
        if matches:
            matches.sort(key=len) # Shortest package name is usually the main one
            pkg = matches[0]
        else:
            pkg = package.lower()

    res = run_adb(["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"])
    
    if "No activities found to run" in res.get("output", "") or "aborted" in res.get("output", "").lower():
        return {"success": False, "error": f"App {package} could not be launched"}
        
    return {"success": True, "message": f"Opened {package}"}


def get_screen_size() -> dict:
    """Get the phone's screen resolution."""
    ensure_connected()
    result = run_adb(["shell", "wm", "size"])
    output = result.get("output", "")
    if "Physical size:" in output:
        size = output.split("Physical size:")[1].strip()
        w, h = size.split("x")
        return {"width": int(w), "height": int(h)}
    return {"width": 1080, "height": 1920}


def read_notifications() -> dict:
    """Read current notifications from the phone."""
    ensure_connected()
    result = run_adb(["shell", "dumpsys", "notification", "--noredact"])
    raw = result.get("output", "")
    return {"success": True, "notifications": raw[:3000]}


GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
# Legacy model often returns 400/404 on Groq now
GROQ_VISION_MODEL_LEGACY = "llama-3.2-11b-vision-preview"
MAX_VISION_IMAGE_BYTES = 4 * 1024 * 1024  # stay under Groq ~20MB limit with base64 overhead


def _shrink_png_for_vision(png_bytes: bytes) -> bytes:
    """Downscale large screenshots so vision API accepts them (macOS sips)."""
    if len(png_bytes) <= MAX_VISION_IMAGE_BYTES:
        return png_bytes
    import sys
    import tempfile
    if sys.platform != "darwin":
        return png_bytes
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as src:
            src.write(png_bytes)
            src_path = src.name
        out_path = src_path + ".small.jpg"
        subprocess.run(
            ["sips", "-Z", "1280", "-s", "format", "jpeg", "-s", "formatOptions", "70",
             src_path, "--out", out_path],
            capture_output=True,
            timeout=15,
            check=True,
        )
        with open(out_path, "rb") as f:
            data = f.read()
        for p in (src_path, out_path):
            try:
                os.remove(p)
            except OSError:
                pass
        return data
    except Exception as e:
        print(f"[describe_screen] shrink failed: {e}")
        return png_bytes


def _groq_vision_request(groq_key: str, image_bytes: bytes, mime: str = "image/png") -> dict:
    """Call Groq vision chat completions; returns {ok, description?, error?}."""
    import requests as req_lib

    image_b64 = base64.b64encode(image_bytes).decode()
    prompt = (
        "You are Jarvis, a smart AI assistant. Look at this phone screenshot and give a brief, "
        "intelligent summary of what is on the screen. Focus on the app being used, key content "
        "visible, and any important context. Do NOT read out every word. Be concise like a butler "
        "reporting to his master. Under 3 sentences."
    )
    body = {
        "model": GROQ_VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{image_b64}"},
                    },
                ],
            }
        ],
        "max_completion_tokens": 256,
        "temperature": 0.3,
    }

    for model in (GROQ_VISION_MODEL, GROQ_VISION_MODEL_LEGACY):
        body["model"] = model
        try:
            resp = req_lib.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {groq_key}",
                },
                json=body,
                timeout=30.0,
            )
        except Exception as e:
            return {"ok": False, "error": str(e)}

        if resp.status_code == 200:
            description = resp.json()["choices"][0]["message"]["content"]
            return {"ok": True, "description": description}

        err_body = resp.text[:500]
        print(f"[describe_screen] Groq vision failed model={model} status={resp.status_code} body={err_body}")

    return {
        "ok": False,
        "error": f"Vision API error ({resp.status_code}). Check Groq key and model access.",
    }


def describe_screen(api_key: str = None) -> dict:
    """Capture screenshot and use Groq Vision AI to intelligently describe what's on screen."""
    if not check_connection().get("connected"):
        return {
            "success": False,
            "error": "Phone not connected via ADB, Sir. Say connect phone or check PHONE_TAILSCALE_IP.",
        }

    ensure_connected()
    
    # Capture screenshot directly via exec-out (fast, no disk I/O)
    target = get_adb_target()
    cmd = ["adb", "-s", target, "exec-out", "screencap", "-p"] if target else ["adb", "exec-out", "screencap", "-p"]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=5)
        if proc.returncode != 0 or not proc.stdout:
            return {"success": False, "error": "Could not capture screen"}
        png_bytes = proc.stdout
    except Exception as e:
        return {"success": False, "error": f"Screenshot failed: {str(e)}"}

    groq_key = api_key or os.getenv("GROQ_API_KEY")
    if not groq_key:
        return {
            "success": True,
            "description": "Screenshot captured but no API key for analysis, Sir. Add Groq key in Settings.",
        }

    image_bytes = _shrink_png_for_vision(png_bytes)
    mime = "image/jpeg" if len(image_bytes) >= 2 and image_bytes[:2] == b"\xff\xd8" else "image/png"

    result = _groq_vision_request(groq_key, image_bytes, mime)
    if result.get("ok"):
        return {"success": True, "description": result["description"]}
    return {
        "success": False,
        "description": (
            f"I captured your screen, Sir, but vision analysis failed: {result.get('error', 'unknown error')}"
        ),
    }


def detect_incoming_call() -> dict:
    """Detect if there is an incoming call (cellular or WhatsApp)."""
    res = run_adb(["shell", "dumpsys", "telephony.registry"])
    output = res.get("output", "")
    
    is_ringing = False
    call_type = None
    caller = "Unknown Caller"
    
    for line in output.split("\n"):
        if "mCallState" in line:
            if "mCallState=1" in line:
                is_ringing = True
                call_type = "cellular"
                break
                
    if not is_ringing:
        notif_res = run_adb(["shell", "dumpsys", "notification", "--noredact"])
        notif_output = notif_res.get("output", "")
        if "com.whatsapp" in notif_output:
            if "incoming voice call" in notif_output.lower() or "incoming video call" in notif_output.lower() or "incoming call" in notif_output.lower():
                is_ringing = True
                call_type = "whatsapp"
                for line in notif_output.split("\n"):
                    if "tickerText=" in line and "Incoming" in line:
                        parts = line.split("Incoming")
                        if len(parts) > 0:
                            if "from" in parts[-1]:
                                caller = parts[-1].split("from")[-1].strip()
                                break
                    elif "android.title=" in line and "Incoming" not in line and "WhatsApp" not in line:
                        caller = line.split("android.title=")[-1].strip()
                        
    return {
        "incoming": is_ringing,
        "type": call_type,
        "caller": caller
    }


def answer_call() -> dict:
    """
    Answer incoming call. Try keyevent 79, fallback to keyevent 5, then service call phone 5.
    If all fail, indicate manual_required.
    """
    import time
    
    def get_call_state():
        state_res = run_adb(["shell", "dumpsys", "telephony.registry"])
        state_output = state_res.get("output", "")
        for line in state_output.split("\n"):
            if "mCallState=" in line:
                if "mCallState=1" in line:
                    return "ringing"
                elif "mCallState=2" in line:
                    return "active"
        # Check WhatsApp calls via notifications
        notif_res = run_adb(["shell", "dumpsys", "notification", "--noredact"])
        notif_output = notif_res.get("output", "")
        if "com.whatsapp" in notif_output:
            if "incoming voice call" in notif_output.lower() or "incoming video call" in notif_output.lower() or "incoming call" in notif_output.lower():
                return "ringing"
        return "idle"

    # Step 1: Try Keyevent 79 (KEYCODE_HEADSETHOOK)
    run_adb(["shell", "input", "keyevent", "79"])
    time.sleep(1.0)
    if get_call_state() == "active":
        return {"success": True, "method": "keyevent 79"}

    # Step 2: Try Fallback 1: Keyevent 5 (KEYCODE_CALL)
    run_adb(["shell", "input", "keyevent", "5"])
    time.sleep(1.0)
    if get_call_state() == "active":
        return {"success": True, "method": "keyevent 5"}

    # Step 3: Try Fallback 2: Service call phone 5
    run_adb(["shell", "service", "call", "phone", "5"])
    time.sleep(1.0)
    if get_call_state() == "active":
        return {"success": True, "method": "service call phone 5"}

    # Step 4: All failed, tell the user to answer manually
    return {"success": False, "reason": "manual_required", "message": "Please answer manually, Sir"}


def reject_call() -> dict:
    """End or reject the call."""
    run_adb(["shell", "input", "keyevent", "6"])
    return {"success": True, "message": "Call ended, Sir."}


