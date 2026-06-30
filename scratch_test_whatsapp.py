import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.whatsapp_selenium import send_message

print("Testing whatsapp_selenium...")
# We use a dummy contact name that is unlikely to send anything but tests the browser opening
res = send_message("Test Contact Name Details", "Hello this is a test from Jarvis")
print("Result:")
print(res)
