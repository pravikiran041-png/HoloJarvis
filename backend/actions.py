import os
import platform
import subprocess
import webbrowser
from datetime import datetime

# Platform detection
IS_MAC = platform.system() == "Darwin"
IS_WINDOWS = platform.system() == "Windows"

# ────────────────────────────────────────────────────────
# FEATURE 1 & 2: OPEN APPS & PLAY MUSIC
# ────────────────────────────────────────────────────────

def open_youtube():
    webbrowser.open("https://www.youtube.com")
    return "Opening YouTube in your browser, Sir."

def open_spotify():
    if IS_MAC:
        try:
            # Try to open Spotify app on Mac
            subprocess.run(["open", "-a", "Spotify"], check=True)
            return "Opening Spotify app, Sir."
        except subprocess.CalledProcessError:
            webbrowser.open("https://open.spotify.com")
            return "Spotify app not found. Opening Spotify web player, Sir."
    elif IS_WINDOWS:
        try:
            # Use protocol handler on Windows
            os.startfile("spotify:")
            return "Opening Spotify, Sir."
        except Exception:
            webbrowser.open("https://open.spotify.com")
            return "Spotify app not found. Opening Spotify web player, Sir."
    else:
        webbrowser.open("https://open.spotify.com")
        return "Opening Spotify web player, Sir."

def open_whatsapp():
    if IS_MAC:
        try:
            # Try to open WhatsApp app on Mac
            subprocess.run(["open", "-a", "WhatsApp"], check=True)
            return "Opening WhatsApp app, Sir."
        except subprocess.CalledProcessError:
            webbrowser.open("https://web.whatsapp.com")
            return "WhatsApp app not found. Opening WhatsApp Web, Sir."
    elif IS_WINDOWS:
        try:
            # Try to open WhatsApp app on Windows
            os.startfile("whatsapp:")
            return "Opening WhatsApp app, Sir."
        except Exception:
            webbrowser.open("https://web.whatsapp.com")
            return "WhatsApp app not found. Opening WhatsApp Web, Sir."
    else:
        webbrowser.open("https://web.whatsapp.com")
        return "Opening WhatsApp Web, Sir."

def open_calculator():
    if IS_MAC:
        subprocess.Popen(["open", "-a", "Calculator"])
        return "Opening Calculator, Sir."
    elif IS_WINDOWS:
        subprocess.Popen("calc.exe", shell=True)
        return "Opening Calculator, Sir."
    else:
        return "Calculator is not supported on this operating system, Sir."

def open_file_manager():
    if IS_MAC:
        subprocess.Popen(["open", "."])
        return "Opening File Manager, Sir."
    elif IS_WINDOWS:
        subprocess.Popen("explorer.exe", shell=True)
        return "Opening File Manager, Sir."
    else:
        return "File Manager is not supported on this operating system, Sir."

def open_browser():
    webbrowser.open("https://www.google.com")
    return "Opening default web browser, Sir."

def play_song(song_name):
    import urllib.parse
    if not song_name:
        # Fall back to opening Spotify
        return open_spotify()
    
    encoded_song = urllib.parse.quote(song_name)
    youtube_url = f"https://www.youtube.com/results?search_query={encoded_song}"
    webbrowser.open(youtube_url)
    return f"Searching for {song_name} on YouTube, Sir."

# ────────────────────────────────────────────────────────
# FEATURE 3: VOLUME CONTROL
# ────────────────────────────────────────────────────────

def mac_volume_control(action):
    try:
        if action == "mute":
            subprocess.run(["osascript", "-e", "set volume output muted true"], check=True)
            return "System muted, Sir."
        elif action == "up":
            # Unmute first
            subprocess.run(["osascript", "-e", "set volume output muted false"], check=True)
            # Get current volume
            res = subprocess.run(["osascript", "-e", "output volume of (get volume settings)"], capture_output=True, text=True, check=True)
            curr = int(res.stdout.strip())
            new_vol = min(100, curr + 10)
            subprocess.run(["osascript", "-e", f"set volume output volume {new_vol}"], check=True)
            return f"Volume increased to {new_vol} percent, Sir."
        elif action == "down":
            # Unmute first
            subprocess.run(["osascript", "-e", "set volume output muted false"], check=True)
            # Get current volume
            res = subprocess.run(["osascript", "-e", "output volume of (get volume settings)"], capture_output=True, text=True, check=True)
            curr = int(res.stdout.strip())
            new_vol = max(0, curr - 10)
            subprocess.run(["osascript", "-e", f"set volume output volume {new_vol}"], check=True)
            return f"Volume decreased to {new_vol} percent, Sir."
    except Exception as e:
        return f"Failed to adjust macOS volume: {str(e)}"

def win_volume_control(action):
    try:
        from ctypes import cast, POINTER
        from comtypes import CLSCTX_ALL
        from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume
        
        devices = AudioUtilities.GetSpeakers()
        interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
        volume = cast(interface, POINTER(IAudioEndpointVolume))
        
        if action == "mute":
            volume.SetMute(1, None)
            return "System muted, Sir."
        elif action == "up":
            volume.SetMute(0, None) # Unmute if muted
            current_vol = volume.GetMasterVolumeLevelScalar()
            new_vol = min(1.0, current_vol + 0.1)
            volume.SetMasterVolumeLevelScalar(new_vol, None)
            return f"Volume increased to {int(new_vol * 100)} percent, Sir."
        elif action == "down":
            volume.SetMute(0, None) # Unmute if muted
            current_vol = volume.GetMasterVolumeLevelScalar()
            new_vol = max(0.0, current_vol - 0.1)
            volume.SetMasterVolumeLevelScalar(new_vol, None)
            return f"Volume decreased to {int(new_vol * 100)} percent, Sir."
    except Exception as e:
        return f"Failed to adjust Windows volume: {str(e)}"

def adjust_volume(action):
    if IS_MAC:
        return mac_volume_control(action)
    elif IS_WINDOWS:
        return win_volume_control(action)
    else:
        return "Volume control is not supported on this operating system, Sir."

# ────────────────────────────────────────────────────────
# FEATURE 4: BASIC SYSTEM INFO
# ────────────────────────────────────────────────────────

def get_system_info(info_type):
    now = datetime.now()
    if info_type == "time":
        return f"The current time is {now.strftime('%I:%M %p')}, Sir."
    elif info_type == "date":
        return f"Today's date is {now.strftime('%A, %B %d, %Y')}, Sir."
    elif info_type == "battery":
        try:
            import psutil
            battery = psutil.sensors_battery()
            if battery is not None:
                plugged_str = "charging" if battery.power_plugged else "discharging"
                return f"The battery is currently at {battery.percent} percent and is {plugged_str}, Sir."
            else:
                return "I am unable to retrieve the battery status, Sir."
        except Exception as e:
            return f"Error reading battery status: {str(e)}"
    return "I am not equipped to retrieve that system info, Sir."
