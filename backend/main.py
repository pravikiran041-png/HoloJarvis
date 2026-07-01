import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import json
import requests
from datetime import datetime
from requests.exceptions import Timeout
import psutil
from fastapi import FastAPI, HTTPException, Request, Header, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# Load env variables at startup
load_dotenv()

# Import Week 1 actions
from backend.memory import get_memory_context, save_memory, remember_turn
import edge_tts
import asyncio
import tempfile
import base64

from backend.actions import (
    open_youtube,
    open_spotify,
    open_whatsapp,
    open_calculator,
    open_file_manager,
    open_browser,
    play_song,
    adjust_volume,
    get_system_info
)

# Import Week 2 messaging actions
from backend.messaging import (
    send_email_action,
    send_sms_action,
    read_latest_emails,
    format_phone_number
)

# Import Selenium-based WhatsApp automation
from backend.whatsapp_selenium import send_message as whatsapp_send_message

app = FastAPI(title="HoloJarvis Backend Server")

# ─── Remote Mode (caffeinate) ───────────────────────────────────────
import subprocess as _subprocess

REMOTE_STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "remote_state.json")
_caffeinate_process = None
remote_mode_enabled = False


def _load_remote_state() -> bool:
    try:
        with open(REMOTE_STATE_FILE) as f:
            return json.load(f).get("remote_mode", False)
    except Exception:
        return False


def _save_remote_state(enabled: bool):
    try:
        with open(REMOTE_STATE_FILE, "w") as f:
            json.dump({"remote_mode": enabled}, f)
    except Exception:
        pass


def start_remote_mode() -> bool:
    global _caffeinate_process
    try:
        # Disable lid-close sleep via pmset (requires passwordless sudo for pmset)
        _subprocess.run(
            ["sudo", "-n", "pmset", "-a", "disablesleep", "1"],
            capture_output=True, text=True, check=True,
        )
        print("[REMOTE] Lid sleep disabled, Sir")

        # Also run caffeinate as backup to prevent idle sleep
        if _caffeinate_process is None or _caffeinate_process.poll() is not None:
            _caffeinate_process = _subprocess.Popen(
                ["caffeinate", "-dims"],
                stdout=_subprocess.DEVNULL,
                stderr=_subprocess.DEVNULL,
            )
        print("[REMOTE] Remote mode fully active, Sir")
        return True
    except _subprocess.CalledProcessError as e:
        print(f"[REMOTE] pmset failed: {e.stderr}")
        return False
    except Exception as e:
        print(f"[REMOTE] Remote mode error: {e}")
        return False


def stop_remote_mode() -> bool:
    global _caffeinate_process
    try:
        # Re-enable normal lid sleep
        _subprocess.run(
            ["sudo", "-n", "pmset", "-a", "disablesleep", "0"],
            capture_output=True, text=True, check=True,
        )
        print("[REMOTE] Lid sleep re-enabled, Sir")

        # Stop caffeinate
        if _caffeinate_process and _caffeinate_process.poll() is None:
            _caffeinate_process.terminate()
            _caffeinate_process = None

        # Force sleep now if lid is already closed
        _subprocess.run(
            ["sudo", "-n", "pmset", "sleepnow"],
            capture_output=True, text=True,
        )
        print("[REMOTE] Remote mode stopped, laptop sleeping now, Sir")
        return True
    except _subprocess.CalledProcessError as e:
        print(f"[REMOTE] pmset re-enable failed: {e.stderr}")
        return False
    except Exception as e:
        print(f"[REMOTE] Stop error: {e}")
        return False


# Restore remote mode on module load
if _load_remote_state():
    start_remote_mode()
    remote_mode_enabled = True
    print("[STARTUP] Remote mode restored, Sir")


@app.post("/system/remote-mode")
async def set_remote_mode(request: Request):
    global remote_mode_enabled
    body = await request.json()
    enabled = body.get("enabled", False)
    if enabled:
        success = start_remote_mode()
        remote_mode_enabled = True
        _save_remote_state(True)
        return {"success": success, "enabled": True, "message": "Remote mode activated, Sir."}
    else:
        success = stop_remote_mode()
        remote_mode_enabled = False
        _save_remote_state(False)
        return {"success": success, "enabled": False, "message": "Remote mode off, Sir. Laptop will sleep normally."}


@app.get("/system/remote-mode")
async def get_remote_mode():
    is_running = _caffeinate_process is not None and _caffeinate_process.poll() is None
    bat = psutil.sensors_battery()
    return {
        "enabled": is_running,
        "battery": bat.percent if bat else 100,
        "on_charger": bat.power_plugged if bat else True,
    }
# ─── End Remote Mode ────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    """Auto-connect to phone via Tailscale on server start and configure sleep/wake settings."""
    # Ensure macOS wake-on-network-access settings are fully enabled for battery and AC
    try:
        # Enable Wake-on-LAN/network for all power sources
        _subprocess.run(
            ["sudo", "-n", "pmset", "-a", "womp", "1"],
            capture_output=True, text=True, check=True
        )
        # Enable powernap, proximitywake, and tcpkeepalive for battery power to allow remote waking
        _subprocess.run(
            ["sudo", "-n", "pmset", "-b", "powernap", "1", "proximitywake", "1", "tcpkeepalive", "1"],
            capture_output=True, text=True, check=True
        )
        print("[STARTUP] Configured macOS sleep/wake settings to allow remote waking, Sir")
    except Exception as e:
        print(f"[STARTUP] Skipped macOS sleep/wake config: {e}")

    try:
        from backend.phone_control import connect_wireless
        result = connect_wireless()
        print(f"[STARTUP] Phone wireless connect: {result.get('message', '')}")
    except Exception as e:
        print(f"[STARTUP] Phone connect skipped: {e}")

# Allow CORS for local dev environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CommandRequest(BaseModel):
    command: str
    pending_action: Optional[Dict[str, Any]] = None
    language: Optional[str] = "en-US"

LANG_VOICE_MAP = {
    "en-US": "en-US-GuyNeural",
    "en-GB": "en-GB-RyanNeural",
    "hi-IN": "hi-IN-MadhurNeural",
    "te-IN": "te-IN-MohanNeural",
    "ta-IN": "ta-IN-ValluvarNeural",
    "es-ES": "es-ES-AlvaroNeural",
    "fr-FR": "fr-FR-HenriNeural",
    "de-DE": "de-DE-ConradNeural",
    "ar-SA": "ar-SA-HamedNeural",
    "zh-CN": "zh-CN-YunxiNeural"
}

GROQ_TIMEOUT_SECONDS = 20.0
GROQ_RETRY_ATTEMPTS = 2


def is_phone_describe_command(text: str) -> bool:
    """Match phrases that should capture and analyze the phone screen."""
    t = text.lower().strip()
    triggers = (
        "describe my phone",
        "describe phone",
        "describe the phone",
        "describe screen",
        "describe my screen",
        "what's on my phone",
        "whats on my phone",
        "what is on my phone",
        "what's on the screen",
        "whats on the screen",
        "read my phone screen",
        "analyze my phone screen",
        "look at my phone screen",
        "see my phone screen",
    )
    if any(p in t for p in triggers):
        return True
    return ("describe" in t or "analyze" in t or "read" in t) and (
        "phone" in t or "screen" in t
    )


def execute_phone_describe(groq_key: str) -> dict:
    """Connect if needed, capture phone screen, return vision summary."""
    from backend.phone_control import check_connection, connect_wireless, describe_screen

    if not check_connection().get("connected"):
        connect_result = connect_wireless()
        if not connect_result.get("success"):
            return {
                "reply": (
                    "Your phone is not connected, Sir. Enable wireless ADB debugging, "
                    "set PHONE_TAILSCALE_IP in .env, and say connect phone."
                )
            }
        if not check_connection().get("connected"):
            return {
                "reply": (
                    "I still cannot reach your phone, Sir. Check Tailscale and that "
                    "ADB is connected on port 5555."
                )
            }

    res = describe_screen(groq_key)
    if res.get("success") and res.get("description"):
        return {"reply": res["description"]}
    return {"reply": res.get("description") or res.get("error", "Could not analyze screen, Sir.")}


def groq_chat_completion_with_retry(groq_key: str, payload: dict):
    """Call Groq chat completions with one retry on timeout."""
    last_error = None
    for attempt in range(GROQ_RETRY_ATTEMPTS):
        try:
            return requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {groq_key}"
                },
                json=payload,
                timeout=GROQ_TIMEOUT_SECONDS
            )
        except Timeout as e:
            last_error = e
            if attempt < GROQ_RETRY_ATTEMPTS - 1:
                continue
            raise
        except Exception as e:
            last_error = e
            raise
    raise last_error

# (Previous system prompts and contact functions remain unchanged)


INTENT_SYSTEM_PROMPT = """You are Jarvis, an intelligent, calm, and slightly formal AI assistant.
Your task is to parse the user's spoken command and determine if they want to perform a laptop control or messaging action, or if they are just having a normal conversation with you.

Classify the command into one of the following intents:
1. "open_app":
   Arguments: {"app_name": "youtube" | "spotify" | "whatsapp" | "calculator" | "file_manager" | "browser"}
2. "play_music":
   Arguments: {"song_name": "<song name>" or null if just play music}
3. "volume_control":
   Arguments: {"action": "up" | "down" | "mute"}
4. "system_info":
   Arguments: {"type": "time" | "date" | "battery"}
5. "whatsapp":
   Arguments: {"contact": "<contact name>", "message": "<message content>"}
   (Examples: "ping rahul saying I will be late" -> contact: "rahul", message: "I will be late")
6. "email":
   Arguments: {"contact": "<contact name>", "message": "<message content>"}
   (Examples: "shoot an email to boss saying I finished the report" -> contact: "boss", message: "I finished the report")
7. "sms":
   Arguments: {"contact": "<contact name>", "message": "<message content>"}
   (Examples: "text Rahul I'm on my way" -> contact: "rahul", message: "I'm on my way")
8. "read_emails":
   Arguments: {}
   (Examples: "read my latest emails", "check my inbox", "any new messages")
9. "save_contact":
   Arguments: {"contact": "<contact name>", "phone": "<phone number or null>", "email": "<email address or null>"}
   (Examples: "save contact Amit, phone 9876543210, email amit@gmail.com" -> contact: "amit", phone: "9876543210", email: "amit@gmail.com")
10. "chat":
   Arguments: {}
   Use this if the command is general conversation, a question, greeting, or if it does NOT map to any of the laptop control or messaging intents above.
11. "whatsapp_call":
   Arguments: {"contact": "<contact name>", "call_type": "voice" | "video"}
   (Examples: "call Rahul on whatsapp", "make a video call to Amit on whatsapp")
12. "tv_control":
   Arguments: {"device": "tv", "action": "turn_off" | "turn_on" | "volume_up" | "volume_down" | "mute" | "open_youtube" | "open_netflix" | "channel_up" | "channel_down", "value": null}
   (Examples: "turn off the TV" -> action: "turn_off", "TV volume up" -> action: "volume_up", "open YouTube on TV" -> action: "open_youtube")
13. "phone_control":
   Arguments: {"action": "show_phone" | "hide_phone" | "lock_phone" | "unlock_phone" | "wake_phone" | "disconnect_phone" | "connect_phone" | "go_home" | "go_back" | "open_app" | "scroll_up" | "scroll_down" | "type_text" | "volume_up" | "volume_down" | "mute_phone" | "screenshot" | "read_notifications" | "tap_screen" | "swipe_screen", "app": "<app name or null>", "text": "<text or null>", "x": <int or null>, "y": <int or null>, "x1": <int or null>, "y1": <int or null>, "x2": <int or null>, "y2": <int or null>, "duration": <int or null>}
   (Examples: "lock my phone" -> action: "lock_phone", "mute phone" -> action: "mute_phone", "tap at 500 800 on phone" -> action: "tap_screen", x: 500, y: 800, "swipe from 200 800 to 800 800 on phone" -> action: "swipe_screen", x1: 200, y1: 800, x2: 800, y2: 800, "describe my phone screen" -> action: "screenshot", "what's on my phone" -> action: "screenshot")
   IMPORTANT: Any request to describe/read/analyze the phone screen MUST use intent phone_control with action screenshot, NOT chat.

14. "save_memory":
   Arguments: {"fact": "<what to remember>"}
   (Examples: "remember my wifi is 1234", "save this to memory: my birthday is oct 12")

15. "play_tic_tac_toe":
   Arguments: {"position": 0}
   (Examples: "place my x in the center" -> position: 4, "top left" -> position: 0, "bottom right" -> position: 8. The grid positions are 0=top-left, 1=top-middle, 2=top-right, 3=middle-left, 4=center, 5=middle-right, 6=bottom-left, 7=bottom-middle, 8=bottom-right)

You MUST respond with a JSON object in the following format:
{
  "intent": "intent_name",
  "arguments": { ... },
  "chat_reply": "If the intent is 'chat', write a conversational reply here as Jarvis (calm, smart, formal, under 3 sentences). Otherwise, set this to null."
}
"""

CONFIRMATION_SYSTEM_PROMPT = """You are Jarvis's neural command interface.
The user has a pending messaging action and is responding to the confirmation request: "Shall I proceed?"
Analyze their spoken reply and classify it into one of three decisions:
1. "confirm": User agrees to proceed (e.g. "yes", "yeah", "proceed", "send it", "do it", "sure", "ok", "please").
2. "cancel": User wants to abort (e.g. "no", "cancel", "stop", "don't do that", "abort", "nevermind").
3. "unclear": The user said something else or changed the subject.

Respond ONLY with a JSON object in this format:
{
  "decision": "confirm" | "cancel" | "unclear"
}
"""

def load_contacts():
    filepath = os.path.join(os.path.dirname(__file__), "contacts.json")
    if os.path.exists(filepath):
        try:
            with open(filepath, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_contact_to_json(name, phone, email_addr):
    contacts = load_contacts()
    name_key = name.lower().strip()
    formatted_phone = format_phone_number(phone) if phone else ""
    contacts[name_key] = {
        "phone": formatted_phone,
        "email": email_addr.strip() if email_addr else ""
    }
    filepath = os.path.join(os.path.dirname(__file__), "contacts.json")
    try:
        with open(filepath, "w") as f:
            json.dump(contacts, f, indent=2)
        return f"I have saved contact {name} with phone {formatted_phone or 'not specified'} and email {email_addr or 'not specified'} to your address book, Sir."
    except Exception as e:
        return f"Failed to save contact: {str(e)}"

async def generate_tts(text: str, voice: str = "en-GB-RyanNeural") -> str:
    communicate = edge_tts.Communicate(text, voice)
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
        temp_path = f.name
    await communicate.save(temp_path)
    with open(temp_path, "rb") as f:
        audio_data = base64.b64encode(f.read()).decode("utf-8")
    os.remove(temp_path)
    return audio_data

@app.post("/command")
async def handle_command(req: CommandRequest, authorization: Optional[str] = Header(None)):
    try:
        response_data = await _handle_command_logic(req, authorization)
    except Exception as e:
        print(f"[BACKEND] Unhandled exception in command logic: {e}")
        import traceback; traceback.print_exc()
        response_data = {"reply": f"A system error occurred, Sir. {str(e)}"}
    
    if response_data and "reply" in response_data and "audio" not in response_data:
        try:
            voice = LANG_VOICE_MAP.get(req.language or "en-US", "en-GB-RyanNeural")
            audio_b64 = await generate_tts(response_data["reply"], voice)
            response_data["audio"] = audio_b64
        except Exception as e:
            print(f"[TTS Error] {e}")

    # Persist every interaction for continuity in future responses.
    try:
        remember_turn(req.command, (response_data or {}).get("reply", ""))
    except Exception as e:
        print(f"[Memory Error] Could not persist conversation turn: {e}")

    return response_data

async def _handle_command_logic(req: CommandRequest, authorization: Optional[str] = Header(None)):
    print(f"\n[BACKEND] === INCOMING COMMAND: '{req.command}' ===")
    print(f"[BACKEND] Pending Action: {req.pending_action}")

    user_text = req.command.strip()
    if not user_text:
        print("[BACKEND] Error: Empty command text")
        return {"reply": "I did not catch that, Sir."}

    t_lower = user_text.lower()

    # ── Fast path: laptop remote voice commands (no Groq key needed) ──
    from backend import laptop_control as laptop

    if "laptop" in t_lower and ("lock" in t_lower or "sleep" in t_lower):
        if "sleep" in t_lower:
            return {"reply": laptop.sleep_now().get("message", "Done, Sir.")}
        return {"reply": laptop.lock_display().get("message", "Done, Sir.")}

    if "open" in t_lower and "laptop" in t_lower:
        for app in ("chrome", "finder", "spotify", "whatsapp", "safari", "terminal"):
            if app in t_lower:
                return {"reply": laptop.open_app(app).get("message", "Done, Sir.")}

    if "type" in t_lower and "laptop" in t_lower:
        text = user_text.split("type", 1)[-1].replace("on laptop", "").strip()
        if text:
            return {"reply": laptop.type_text(text).get("message", "Done, Sir.")}

    # ── Fast path: phone control shortcuts (no Groq key needed) ──
    if "phone on laptop" in t_lower or ("open" in t_lower and "phone" in t_lower and "mirror" in t_lower):
        return {"reply": "Opening phone mirror on laptop, Sir.", "action": "show_phone"}

    # Fast path: "open my phone", "show my phone", "show phone", "open phone"
    if ("phone" in t_lower) and any(w in t_lower for w in ("open", "show")) and not any(w in t_lower for w in ("app", "whatsapp", "instagram", "youtube", "spotify", "camera", "settings", "chrome")):
        return {"reply": "Initiating face authentication for phone access, Sir.", "action": "show_phone"}

    if "show" in t_lower and "laptop screen" in t_lower:
        return {"reply": "Laptop screen stream is available in Remote Control, Sir.", "action": "laptop_stream"}

    if "mute" in t_lower and "phone" in t_lower:
        from backend.phone_control import press_key, ensure_connected, check_connection, connect_wireless
        if not check_connection().get("connected"):
            connect_wireless()
        ensure_connected()
        res = press_key("mute")
        return {
            "reply": "Muting phone audio, Sir." if res.get("success") else "Failed to mute phone, Sir."
        }

    # ── Groq API Key Verification ──
    groq_key = None
    if authorization and authorization.startswith("Bearer "):
        groq_key = authorization.split(" ")[1]
    if not groq_key:
        groq_key = os.getenv("GROQ_API_KEY")
    
    if not groq_key:
        print("[BACKEND] Error: Groq API key missing")
        return {"reply": "I am sorry, Sir. The Groq API key is missing. Please configure it in the system settings."}

    # ── Vision / LLM Fast Paths (require Groq key) ──
    # Fast path: phone screen vision (avoid misclassification as chat)
    if is_phone_describe_command(user_text):
        print("[BACKEND] Fast path: phone describe screen")
        return execute_phone_describe(groq_key)

    if ("laptop screen" in t_lower or "on my laptop" in t_lower) and (
        "describe" in t_lower or "what is" in t_lower or "what's" in t_lower
    ):
        res = laptop.describe_laptop_screen(groq_key)
        return {"reply": res.get("description") or res.get("error", "Could not analyze laptop screen, Sir.")}

    if "screenshot" in t_lower and "whatsapp" in t_lower and "laptop" in t_lower:
        res = laptop.describe_laptop_screen(groq_key)
        desc = res.get("description", "Laptop screenshot taken.")
        owner = os.getenv("OWNER_WHATSAPP_CONTACT", "Me")
        from backend.whatsapp_selenium import send_message as wa_send
        wa_send(owner, f"Sir, laptop screenshot update: {desc}")
        return {"reply": f"Screenshot summary sent to WhatsApp, Sir. {desc}"}

    # ── CASE A: CONFIRMATION OF PENDING ACTION ──
    if req.pending_action:
        try:
            response = groq_chat_completion_with_retry(
                groq_key,
                {
                    "model": "llama-3.3-70b-versatile",
                    "messages": [
                        {"role": "system", "content": CONFIRMATION_SYSTEM_PROMPT},
                        {"role": "user", "content": user_text}
                    ],
                    "temperature": 0.0,
                    "response_format": {"type": "json_object"}
                }
            )
            
            if response.status_code == 200:
                parsed = json.loads(response.json()["choices"][0]["message"]["content"])
                decision = parsed.get("decision")
                
                if decision == "confirm":
                    action = req.pending_action.get("action")
                    phone = req.pending_action.get("phone")
                    email_addr = req.pending_action.get("email")
                    msg_content = req.pending_action.get("message")
                    
                    if action == "whatsapp":
                        contact = req.pending_action.get("contact", "")
                        reply = whatsapp_send_message(contact, msg_content)
                    elif action == "email":
                        reply = send_email_action(email_addr, msg_content)
                    elif action == "sms":
                        reply = send_sms_action(phone, msg_content)
                    else:
                        reply = "I cannot determine how to send the message, Sir."
                    return {"reply": reply}
                    
                elif decision == "cancel":
                    return {"reply": "Action aborted, Sir."}
        except Exception as e:
            print(f"Confirmation processing error, Sir: {str(e)}")

    # ── CASE B: NEW COMMAND CLASSIFICATION ──
    try:
        response = groq_chat_completion_with_retry(
            groq_key,
            {
                "model": "llama-3.3-70b-versatile",
                "messages": [
                    {"role": "system", "content": INTENT_SYSTEM_PROMPT + "\n\n" + get_memory_context()},
                    {"role": "user", "content": user_text}
                ],
                "temperature": 0.0,
                "response_format": {"type": "json_object"}
            }
        )
        
        if response.status_code != 200:
            return {"reply": f"Groq link error, status {response.status_code}."}
            
        parsed = json.loads(response.json()["choices"][0]["message"]["content"])
        print(f"[BACKEND] Groq Parsed JSON: {parsed}")
    except Timeout:
        print("[BACKEND] Groq parsing timed out")
        return {"reply": "The neural link timed out while interpreting that, Sir. Please repeat briefly or try again."}
    except Exception as e:
        print(f"[BACKEND] Groq parsing failed: {e}")
        return {"reply": f"Neural parsing exception, Sir: {str(e)}"}

    intent = parsed.get("intent")
    args = parsed.get("arguments", {})
    print(f"[BACKEND] Classifed Intent: {intent}, Arguments: {args}")
    
    # 1. Week 2 Messaging Actions (needs confirmation)
    # 1. WhatsApp GUI Automation (no contact saving or lookup needed)
    if intent == "whatsapp":
        contact_name = (args.get("contact") or "").strip()
        message_text = (args.get("message") or "").strip()
        
        if not contact_name:
            print("[BACKEND] WhatsApp Send Error: Missing contact name")
            return {"reply": "I could not determine the recipient's name, Sir."}
        if not message_text:
            print("[BACKEND] WhatsApp Send Error: Missing message content")
            return {"reply": "I could not determine the message you wish to send, Sir."}
            
        print(f"[BACKEND] Launching Selenium for WhatsApp: Send '{message_text}' to '{contact_name}'")
        reply = whatsapp_send_message(contact_name, message_text)
        print(f"[BACKEND] WhatsApp Selenium Result: {reply}")
        return {"reply": reply}
        
    elif intent == "whatsapp_call":
        contact_name = (args.get("contact") or "").strip()
        call_type = (args.get("call_type") or "voice").strip()
        
        if not contact_name:
            print("[BACKEND] WhatsApp Call Error: Missing contact name")
            return {"reply": "I could not determine who you want to call, Sir."}
            
        print(f"[BACKEND] Launching Selenium for WhatsApp Call: {call_type} call to '{contact_name}'")
        from backend.whatsapp_selenium import make_call
        reply = make_call(contact_name, call_type)
        print(f"[BACKEND] WhatsApp Call Result: {reply}")
        return {"reply": reply}
        
    # 2. Email & SMS Messaging Actions (retains lookup for email address or SMS phone number)
    elif intent in ["email", "sms"]:
        contact_name = (args.get("contact") or "").lower().strip()
        message_text = (args.get("message") or "").strip()
        
        if not contact_name:
            return {"reply": "I could not determine the recipient's name, Sir."}
            
        contacts = load_contacts()
        
        import difflib
        matched_name = None
        contact_data = None
        
        if contact_name in contacts:
            matched_name = contact_name
            contact_data = contacts[contact_name]
        else:
            close_matches = difflib.get_close_matches(contact_name, list(contacts.keys()), n=1, cutoff=0.7)
            if close_matches:
                matched_name = close_matches[0]
                contact_data = contacts[matched_name]
                
        resolved_name = matched_name if matched_name else contact_name
        
        # If contact doesn't exist or is missing required details
        if not contact_data:
            return {"reply": f"I don't have {resolved_name.capitalize()}'s details in my contacts, Sir."}
            
        phone = contact_data.get("phone")
        email_addr = contact_data.get("email")
        
        if intent == "sms" and not phone:
            return {"reply": f"I don't have {resolved_name.capitalize()}'s phone number, Sir."}
            
        if intent == "email" and not email_addr:
            return {"reply": f"I don't have {resolved_name.capitalize()}'s email address, Sir."}
            
        action_label = {
            "email": "email",
            "sms": "SMS text"
        }[intent]
        
        pending = {
            "action": intent,
            "contact": resolved_name,
            "message": message_text,
            "phone": phone,
            "email": email_addr
        }
        
        display_name = resolved_name.capitalize()
        return {
            "status": "needs_confirmation",
            "reply": f"Sending {action_label} to {display_name}: {message_text}. Shall I proceed?",
            "pending_action": pending
        }

    # 2. Week 2 Reading Emails
    elif intent == "read_emails":
        return {"reply": read_latest_emails()}

    # 3. Week 2 Saving Contacts
    elif intent == "save_contact":
        contact_name = args.get("contact")
        phone = args.get("phone")
        email_addr = args.get("email")
        if not contact_name:
            return {"reply": "I could not determine the contact's name, Sir."}
        return {"reply": save_contact_to_json(contact_name, phone, email_addr)}

    # 4. Week 1 App Control Actions
    elif intent == "open_app":
        app_name = args.get("app_name")
        if app_name == "youtube":
            reply = open_youtube()
        elif app_name == "spotify":
            reply = open_spotify()
        elif app_name == "whatsapp":
            reply = open_whatsapp()
        elif app_name == "calculator":
            reply = open_calculator()
        elif app_name == "file_manager":
            reply = open_file_manager()
        elif app_name == "browser":
            reply = open_browser()
        else:
            reply = f"I am unsure how to open {app_name or 'the requested application'}, Sir."
        return {"reply": reply}
            
    elif intent == "play_music":
        song_name = args.get("song_name")
        return {"reply": play_song(song_name)}
        
    elif intent == "volume_control":
        action = args.get("action")
        if action in ["up", "down", "mute"]:
            return {"reply": adjust_volume(action)}
        return {"reply": "I cannot perform that volume adjustment, Sir."}
            
    elif intent == "system_info":
        info_type = args.get("type")
        if info_type in ["time", "date", "battery"]:
            return {"reply": get_system_info(info_type)}
        return {"reply": "I am unable to retrieve that specific system information, Sir."}

    elif intent == "save_memory":
        fact = args.get("fact")
        if fact:
            res = save_memory(fact)
            return {"reply": res["message"]}
        return {"reply": "I did not catch what you wanted me to remember, Sir."}
        
    elif intent == "play_tic_tac_toe":
        position = args.get("position")
        if position is not None and isinstance(position, int):
            return {"reply": "Placing your mark, Sir.", "action": "tic_tac_toe", "position": position}
        return {"reply": "Where would you like to place your mark, Sir?", "action": "tic_tac_toe"}
            
    elif intent == "chat":
        reply = parsed.get("chat_reply")
        if not reply:
            reply = "I am at your service, Sir."
        return {"reply": reply}
        
    elif intent == "tv_control":
        action = args.get("action")
        value = args.get("value")
        print(f"[BACKEND] Executing TV Command: action='{action}', value='{value}'")
        from backend.samsung_tv import control_tv
        reply = control_tv(action, value)
        print(f"[BACKEND] TV Control Result: {reply}")
        return {"reply": reply}

    elif intent == "phone_control":
        action = args.get("action")
        
        from backend.phone_control import (
            connect_wireless, disconnect_wireless, check_connection,
            wake_phone, unlock_phone, lock_phone, show_phone_sequence,
            is_phone_locked
        )
        
        # UI-only actions
        if action == "show_phone":
            return {"reply": "Initiating face authentication for phone access, Sir.", "action": "show_phone"}
        elif action == "hide_phone":
            return {"reply": "Closing phone mirror, Sir.", "action": "hide_phone"}
        elif action == "lock_phone":
            res = lock_phone()
            return {"reply": res["message"]}
        elif action == "unlock_phone":
            res = unlock_phone()
            return {"reply": res["message"]}
        elif action == "wake_phone":
            res = wake_phone()
            return {"reply": res["message"]}
        elif action == "disconnect_phone":
            res = disconnect_wireless()
            return {"reply": res["message"]}
        elif action == "connect_phone":
            res = connect_wireless()
            return {"reply": res["message"]}
            
        from backend.phone_control import (
            press_key, open_app, swipe_screen, type_text, 
            take_screenshot, read_notifications, describe_screen
        )
        
        reply = "I'm sorry Sir, I couldn't perform that phone action."
        
        if action == "go_home":
            res = press_key("home")
            reply = "Going to home screen, Sir." if res["success"] else "Failed to press home, Sir."
        elif action == "go_back":
            res = press_key("back")
            reply = "Going back, Sir." if res["success"] else "Failed to press back, Sir."
        elif action == "volume_up":
            res = press_key("volume_up")
            reply = "Increasing phone volume, Sir." if res["success"] else "Failed to change volume, Sir."
        elif action == "volume_down":
            res = press_key("volume_down")
            reply = "Decreasing phone volume, Sir." if res["success"] else "Failed to change volume, Sir."
        elif action == "mute_phone":
            res = press_key("mute")
            reply = "Muting phone audio, Sir." if res["success"] else "Failed to mute phone audio, Sir."
        elif action == "scroll_up":
            res = swipe_screen(500, 400, 500, 1500)
            reply = "Scrolling up, Sir." if res["success"] else "Failed to scroll, Sir."
        elif action == "scroll_down":
            res = swipe_screen(500, 1500, 500, 400)
            reply = "Scrolling down, Sir." if res["success"] else "Failed to scroll, Sir."
        elif action == "open_app":
            app_name = args.get("app")
            if app_name:
                res = open_app(app_name)
                reply = f"Opening {app_name} on your phone, Sir." if res["success"] else f"Failed to open {app_name}, Sir."
            else:
                reply = "Which app would you like me to open, Sir?"
        elif action == "type_text":
            text = args.get("text")
            if text:
                res = type_text(text)
                reply = "Typing text, Sir." if res["success"] else "Failed to type, Sir."
            else:
                reply = "What would you like me to type, Sir?"
        elif action == "read_notifications":
            res = read_notifications()
            reply = "Reading notifications, Sir." if res["success"] else "Failed to read notifications, Sir."
        elif action in ["tap_screen", "tap"]:
            x = args.get("x")
            y = args.get("y")
            if x is not None and y is not None:
                from backend.phone_control import tap_screen
                res = tap_screen(x, y)
                reply = f"Tapping screen at {x}, {y}, Sir." if res["success"] else "Failed to tap, Sir."
            else:
                reply = "I could not determine the tap coordinates, Sir."
        elif action in ["swipe_screen", "swipe"]:
            x1 = args.get("x1")
            y1 = args.get("y1")
            x2 = args.get("x2")
            y2 = args.get("y2")
            duration = args.get("duration", 300)
            if None not in (x1, y1, x2, y2):
                from backend.phone_control import swipe_screen
                res = swipe_screen(x1, y1, x2, y2, duration)
                reply = "Swiping screen, Sir." if res["success"] else "Failed to swipe, Sir."
            else:
                reply = "I could not determine the swipe path, Sir."
        elif action == "screenshot":
            res = describe_screen(groq_key)
            if res.get("success") and res.get("description"):
                reply = res["description"]
            else:
                reply = res.get("error", "Could not analyze screen, Sir.")
            
        return {"reply": reply}
        
    else:
        return {"reply": "I did not understand the instruction, Sir."}


class WhatsAppRequest(BaseModel):
    contact: str
    message: str

@app.post("/send-whatsapp")
async def send_whatsapp_endpoint(req: WhatsAppRequest):
    """Standalone endpoint to send a WhatsApp message via Selenium."""
    if not req.contact or not req.message:
        raise HTTPException(status_code=400, detail="Both 'contact' and 'message' are required.")
    result = whatsapp_send_message(req.contact, req.message)
    return {"reply": result}

class TVRequest(BaseModel):
    action: str
    value: Optional[str] = None

@app.post("/tv-control")
async def tv_control_endpoint(req: TVRequest):
    """Standalone endpoint to control Samsung Smart TV."""
    from backend.samsung_tv import control_tv
    if not req.action:
        raise HTTPException(status_code=400, detail="Action is required.")
    result = control_tv(req.action, req.value)
    return {"reply": result}

# --- PHONE CONTROL ENDPOINTS ---

class PhoneTapRequest(BaseModel):
    x: int
    y: int

class PhoneSwipeRequest(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int
    duration: Optional[int] = 300

class PhoneKeyRequest(BaseModel):
    keycode: str

class PhoneTypeRequest(BaseModel):
    text: str

class PhoneAppRequest(BaseModel):
    package: str

@app.post("/phone/tap")
async def phone_tap(req: PhoneTapRequest):
    from backend.phone_control import tap_screen
    return tap_screen(req.x, req.y)

@app.post("/phone/swipe")
async def phone_swipe(req: PhoneSwipeRequest):
    from backend.phone_control import swipe_screen
    return swipe_screen(req.x1, req.y1, req.x2, req.y2, req.duration)

@app.post("/phone/key")
async def phone_key(req: PhoneKeyRequest):
    from backend.phone_control import press_key
    return press_key(req.keycode)

@app.post("/phone/type")
async def phone_type(req: PhoneTypeRequest):
    from backend.phone_control import type_text
    return type_text(req.text)

@app.post("/phone/app")
async def phone_app(req: PhoneAppRequest):
    from backend.phone_control import open_app
    return open_app(req.package)

@app.post("/phone/screenshot")
async def phone_screenshot():
    from backend.phone_control import take_screenshot
    return take_screenshot()

@app.post("/phone/describe")
async def phone_describe(authorization: Optional[str] = Header(None)):
    from backend.phone_control import describe_screen
    groq_key = None
    if authorization and authorization.startswith("Bearer "):
        groq_key = authorization.split(" ")[1]
    return describe_screen(groq_key)

@app.post("/phone/notifications")
async def phone_notifications():
    from backend.phone_control import read_notifications
    return read_notifications()

@app.post("/phone/mirror/start")
async def phone_mirror_start():
    from backend.phone_mirror import start_mirror
    return start_mirror()

@app.post("/phone/mirror/stop")
async def phone_mirror_stop():
    from backend.phone_mirror import stop_mirror
    return stop_mirror()

@app.get("/phone/connected")
async def phone_connected():
    from backend.phone_control import check_phone_connected
    return {"connected": check_phone_connected()}

@app.post("/phone/connect")
async def phone_connect():
    from backend.phone_control import connect_wireless
    return connect_wireless()

@app.post("/phone/setup-tcp")
async def phone_setup_tcp():
    from backend.phone_control import setup_tcp_wireless
    return setup_tcp_wireless()

@app.post("/phone/disconnect")
async def phone_disconnect():
    from backend.phone_control import disconnect_wireless
    return disconnect_wireless()

@app.post("/phone/unlock")
async def phone_unlock():
    from backend.phone_control import unlock_phone
    return unlock_phone()

@app.post("/phone/lock")
async def phone_lock():
    from backend.phone_control import lock_phone
    return lock_phone()

@app.post("/phone/wake")
async def phone_wake():
    from backend.phone_control import wake_phone
    return wake_phone()

@app.post("/phone/show")
async def phone_show():
    from backend.phone_control import show_phone_sequence
    return show_phone_sequence()

@app.get("/phone/status")
async def phone_status():
    from backend.phone_control import check_connection, is_phone_locked
    conn = check_connection()
    lock = is_phone_locked() if conn["connected"] else {"locked": None}
    return {"connected": conn["connected"], "locked": lock["locked"]}

# --- WEBSOCKET ENDPOINT ---

from backend.phone_stream import stream_phone_screen
from backend.laptop_stream import stream_laptop_screen
from backend.remote_auth import verify_pin, validate_session, is_pin_required

def _remote_session_ok(x_remote_session: Optional[str]) -> bool:
    return validate_session(x_remote_session)


@app.get("/health")
async def health():
    from backend.phone_control import check_connection
    battery = None
    try:
        bat = psutil.sensors_battery()
        if bat:
            battery = bat.percent
    except Exception:
        pass
    return {
        "status": "online",
        "battery": battery,
        "time": datetime.now().strftime("%H:%M"),
        "phone_connected": check_connection().get("connected", False),
        "remote_pin_required": is_pin_required(),
    }


class RemotePinRequest(BaseModel):
    pin: str


@app.post("/remote/verify-pin")
async def remote_verify_pin(req: RemotePinRequest, request: Request):
    client_ip = request.client.host if request.client else None
    return verify_pin(req.pin, client_ip)


class LaptopOpenAppRequest(BaseModel):
    app: str


class LaptopVolumeRequest(BaseModel):
    level: int


class LaptopTypeRequest(BaseModel):
    text: str


class LaptopClickRequest(BaseModel):
    x: int
    y: int


class LaptopScrollRequest(BaseModel):
    direction: str
    amount: Optional[int] = 3


class LaptopKeyRequest(BaseModel):
    key: str


class LaptopDragRequest(BaseModel):
    x1: int
    y1: int
    x2: int
    y2: int


def _check_remote(x_remote_session: Optional[str] = Header(None)):
    if not _remote_session_ok(x_remote_session):
        raise HTTPException(status_code=401, detail="Remote session invalid or expired")


@app.post("/laptop/screenshot")
async def laptop_screenshot(x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import capture_screenshot
    return capture_screenshot()


@app.post("/laptop/open-app")
async def laptop_open_app(req: LaptopOpenAppRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import open_app
    return open_app(req.app)


@app.post("/laptop/lock")
async def laptop_lock(x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import lock_display
    return lock_display()


@app.post("/laptop/sleep")
async def laptop_sleep(x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import sleep_now
    return sleep_now()


@app.post("/laptop/volume")
async def laptop_volume(req: LaptopVolumeRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import set_volume
    return set_volume(req.level)


@app.post("/laptop/type")
async def laptop_type(req: LaptopTypeRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import type_text
    return type_text(req.text)


@app.post("/laptop/click")
async def laptop_click(req: LaptopClickRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import click_at
    return click_at(req.x, req.y)


@app.post("/laptop/scroll")
async def laptop_scroll(req: LaptopScrollRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import scroll_screen
    return scroll_screen(req.direction, req.amount or 3)


@app.post("/laptop/key")
async def laptop_key(req: LaptopKeyRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import press_key
    return press_key(req.key)


@app.post("/laptop/drag")
async def laptop_drag(req: LaptopDragRequest, x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import drag_to
    return drag_to(req.x1, req.y1, req.x2, req.y2)


@app.get("/laptop/screen-size")
async def laptop_screen_size(x_remote_session: Optional[str] = Header(None)):
    _check_remote(x_remote_session)
    from backend.laptop_control import get_screen_size
    return get_screen_size()


@app.post("/laptop/describe")
async def laptop_describe(
    authorization: Optional[str] = Header(None),
    x_remote_session: Optional[str] = Header(None),
):
    _check_remote(x_remote_session)
    groq_key = None
    if authorization and authorization.startswith("Bearer "):
        groq_key = authorization.split(" ")[1]
    if not groq_key:
        groq_key = os.getenv("GROQ_API_KEY")
    from backend.laptop_control import describe_laptop_screen
    return describe_laptop_screen(groq_key)


@app.post("/laptop/screenshot-send")
async def laptop_screenshot_send(
    authorization: Optional[str] = Header(None),
    x_remote_session: Optional[str] = Header(None),
):
    _check_remote(x_remote_session)
    groq_key = None
    if authorization and authorization.startswith("Bearer "):
        groq_key = authorization.split(" ")[1]
    if not groq_key:
        groq_key = os.getenv("GROQ_API_KEY")
    from backend.laptop_control import describe_laptop_screen
    res = describe_laptop_screen(groq_key)
    desc = res.get("description", "Laptop screenshot captured.")
    owner = os.getenv("OWNER_WHATSAPP_CONTACT", "Me")
    from backend.whatsapp_selenium import send_message as wa_send
    wa_reply = wa_send(owner, f"Sir, laptop update: {desc}")
    return {"success": True, "description": desc, "whatsapp": wa_reply}


@app.websocket("/ws/phone-stream")
async def websocket_phone_stream(websocket: WebSocket):
    await stream_phone_screen(websocket)


@app.websocket("/ws/laptop-stream")
async def laptop_stream_ws(websocket: WebSocket):
    await stream_laptop_screen(websocket)


# ── Phone Audio Streaming ──────────────────────────────────────────────────────

class AudioStartRequest(BaseModel):
    source: str = "media"

@app.post("/phone/audio/start")
async def phone_audio_start(req: AudioStartRequest):
    from backend.phone_audio import start_phone_audio
    return start_phone_audio(source=req.source)


@app.post("/phone/audio/stop")
async def phone_audio_stop():
    from backend.phone_audio import stop_phone_audio
    return stop_phone_audio()


@app.get("/phone/audio/status")
async def phone_audio_status():
    from backend.phone_audio import get_audio_status
    return get_audio_status()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=False)

