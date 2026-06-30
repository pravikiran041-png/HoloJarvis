import json
import os
from datetime import datetime

MEMORY_FILE = os.path.join(os.path.dirname(__file__), "..", "memory.json")
CONVERSATION_FILE = os.path.join(os.path.dirname(__file__), "..", "conversation_memory.json")


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _safe_read_json(path: str, fallback):
    if not os.path.exists(path):
        return fallback
    try:
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return fallback


def _safe_write_json(path: str, payload) -> bool:
    try:
        with open(path, "w") as f:
            json.dump(payload, f, indent=2)
        return True
    except Exception:
        return False

def load_memory() -> list:
    return _safe_read_json(MEMORY_FILE, [])

def save_memory(fact: str) -> dict:
    memories = load_memory()
    memories.append(fact)
    if _safe_write_json(MEMORY_FILE, memories):
        return {"success": True, "message": "I have committed that to memory, Sir."}
    return {"success": False, "message": "Failed to save memory to disk, Sir."}


def load_conversation_memory() -> list:
    return _safe_read_json(CONVERSATION_FILE, [])


def remember_turn(user_text: str, assistant_reply: str, intent: str = None):
    if not user_text and not assistant_reply:
        return
    turns = load_conversation_memory()
    turns.append(
        {
            "timestamp": _utc_now_iso(),
            "user": user_text or "",
            "assistant": assistant_reply or "",
            "intent": intent or "unknown",
        }
    )
    # Keep most recent 1200 turns to control disk growth.
    if len(turns) > 1200:
        turns = turns[-1200:]
    _safe_write_json(CONVERSATION_FILE, turns)


def get_conversation_context(max_turns: int = 20) -> str:
    turns = load_conversation_memory()
    if not turns:
        return "No prior conversation history is available."
    recent = turns[-max_turns:]
    context = (
        "Recent conversation history (most recent last). Use this to maintain continuity, "
        "preferences, and prior commitments:\n"
    )
    for t in recent:
        user_text = (t.get("user") or "").strip()
        assistant_text = (t.get("assistant") or "").strip()
        if user_text:
            context += f"User: {user_text}\n"
        if assistant_text:
            context += f"Jarvis: {assistant_text}\n"
    return context

def get_memory_context() -> str:
    memories = load_memory()
    context = ""
    if not memories:
        context += "You currently have no persistent facts saved by the user.\n"
    else:
        context += "Here are important facts you must remember about the user:\n"
        for m in memories[-200:]:
            context += f"- {m}\n"

    context += "\n" + get_conversation_context()
    return context
