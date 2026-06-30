#!/bin/bash
# Auto-start everything when laptop boots
cd "$(dirname "$0")/.." || exit 1
PROJECT_ROOT="$(pwd)"

set -a
[ -f .env ] && source .env
set +a

# Start backend (all interfaces for Tailscale remote access)
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 &

# Start frontend
npm run dev -- --host 0.0.0.0 --port 5173 &

# Keep phone ADB connected over Tailscale
if [ -n "$PHONE_TAILSCALE_IP" ]; then
  sleep 3
  adb connect "${PHONE_TAILSCALE_IP}:5555" &
fi

echo "Jarvis is online, Sir"
echo "Frontend: http://${LAPTOP_TAILSCALE_IP:-localhost}:5173"
echo "Backend:  http://${LAPTOP_TAILSCALE_IP:-localhost}:8000"
