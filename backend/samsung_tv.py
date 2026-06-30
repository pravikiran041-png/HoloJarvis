from samsungtvws import SamsungTVWS
import wakeonlan
import os
from dotenv import load_dotenv

load_dotenv()

TV_IP = os.getenv("TV_IP")
TV_MAC = os.getenv("TV_MAC")

def get_tv():
    return SamsungTVWS(TV_IP)

def control_tv(action: str, value: str = None):
    try:
        tv = get_tv()
        if action == "turn_off":
            tv.shortcuts().power()
            return "TV turned off, Sir"
        elif action == "turn_on":
            wakeonlan.send_magic_packet(TV_MAC)
            return "Turning TV on, Sir"
        elif action == "volume_up":
            tv.shortcuts().volume_up()
            return "Volume up, Sir"
        elif action == "volume_down":
            tv.shortcuts().volume_down()
            return "Volume down, Sir"
        elif action == "mute":
            tv.shortcuts().mute()
            return "TV muted, Sir"
        elif action == "open_youtube":
            tv.run_app("111299001912")
            return "Opening YouTube on TV, Sir"
        elif action == "open_netflix":
            tv.run_app("11101200001")
            return "Opening Netflix on TV, Sir"
        elif action == "channel_up":
            tv.shortcuts().channel_up()
            return "Channel up, Sir"
        elif action == "channel_down":
            tv.shortcuts().channel_down()
            return "Channel down, Sir"
        else:
            return "I don't know that TV command, Sir"
    except Exception as e:
        return f"TV not responding, Sir. Make sure TV is on and connected to WiFi"
