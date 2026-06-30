#!/bin/bash

# Ensure adb is in PATH (common paths for Homebrew/macOS)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "============================================="
echo "   HOLOJARVIS AUTOMATED STARTUP SCRIPT       "
echo "============================================="

echo ""
echo "[1/3] Resetting ADB wireless TCP port..."
adb -s R5CX43EFMFR tcpip 5555
if [ $? -eq 0 ]; then
    echo "✓ TCP Port 5555 enabled successfully."
else
    echo "✗ Failed to communicate with USB device. Make sure USB Debugging is ON."
fi

sleep 2

echo ""
echo "[2/3] Connecting wirelessly via Tailscale..."
adb connect 100.71.118.104:5555
adb devices

echo ""
echo "[3/3] Launching HoloJarvis Servers in background..."

# Kill any existing processes on 8000 or 5173 to prevent address conflicts
echo "Cleaning up port 8000 and 5173..."
kill $(lsof -ti :8000) 2>/dev/null
kill $(lsof -ti :5173) 2>/dev/null
sleep 1

echo "Starting Backend (Uvicorn) on port 8000..."
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &
BACKEND_PID=$!

echo "Starting Frontend (Vite) on port 5173..."
npm run dev -- --host 0.0.0.0 > frontend.log 2>&1 &
FRONTEND_PID=$!

echo ""
echo "============================================="
echo "✓ System initialized!"
echo "- Backend logs: tail -f backend.log"
echo "- Frontend logs: tail -f frontend.log"
echo "============================================="
