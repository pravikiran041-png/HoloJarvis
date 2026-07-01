# HoloJarvis 🤖

An AI-powered personal assistant and remote device control ecosystem. HoloJarvis combines voice intelligence, real-time phone mirroring, call interception, and remote laptop control into a single unified dashboard.

---

## ✨ Features

- **🎤 Voice AI Assistant** — Talk to Jarvis powered by Llama 3.3 70B (Groq API) with multilingual support (10+ languages)
- **📱 Phone Mirroring & Control** — Real-time Android screen stream with interactive tap/swipe gestures over Tailscale wireless ADB
- **🔊 Live Audio Streaming** — Forward phone audio to laptop speakers in real-time with dual-output mode (`--audio-dup`)
- **📞 AI Call Interceptor** — Automatically intercepts cellular/WhatsApp calls, speaks natively in any language, and generates post-call summaries
- **💻 Remote Laptop Control** — Control your Mac from your phone: trackpad emulation, real-time keyboard streaming, screenshots, lock/sleep
- **🔒 Biometric Authentication** — Face ID + Touch ID (WebAuthn) dual-factor security for phone access
- **🌐 Tailscale Mesh Networking** — Fully wireless over a secure VPN mesh, no port forwarding required

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Vite, TailwindCSS, WebSockets |
| Backend | Python, FastAPI, Uvicorn |
| AI Engine | Llama 3.3 70B via Groq API |
| Voice | Web Speech API (STT) + Microsoft Edge-TTS (TTS) |
| Phone Control | Android Debug Bridge (ADB) |
| Networking | Tailscale VPN mesh |
| Face Auth | face-api.js (TensorFlow.js) |
| Fingerprint | WebAuthn Platform Authenticator |

---

## 🚀 Setup & Running

### 1. Prerequisites
- macOS with Python 3.10+, Node.js 18+
- [ADB (Android Platform Tools)](https://developer.android.com/tools/releases/platform-tools) installed
- [Tailscale](https://tailscale.com/) installed on laptop and phone
- Android phone with **USB Debugging** enabled
- [Groq API Key](https://console.groq.com) (free)

### 2. Install Dependencies

```bash
# Backend
pip install -r requirements.txt

# Frontend
npm install
```

### 3. Configure Environment
```bash
cp .env.example .env
# Edit .env and fill in your values
```

### 4. Run the Project
```bash
# Connect phone via USB first, then:
bash setup.sh
```

This script will:
1. Enable wireless ADB over USB
2. Connect to your phone wirelessly via Tailscale
3. Start the backend (port 8000) and frontend (port 5173)

### 5. Access the Dashboard
- **Laptop:** http://localhost:5173
- **Mobile:** http://\<your-tailscale-ip\>:5173

---

## ⚙️ Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```env
GROQ_API_KEY=your_groq_key
PHONE_TAILSCALE_IP=100.x.x.x
PHONE_PIN=your_phone_pin
PHONE_USB_ID=your_adb_device_id
TV_IP=your_tv_ip (optional)
```

---

## 📁 Project Structure

```
├── backend/
│   ├── main.py           # FastAPI app, intent routing
│   ├── phone_control.py  # ADB phone control functions
│   ├── laptop_control.py # macOS system control
│   ├── laptop_stream.py  # WebSocket screen streaming
│   ├── actions.py        # Smart home / system actions
│   └── ...
├── src/
│   ├── App.jsx           # Main React dashboard
│   └── components/
│       ├── FaceAuth.jsx  # Biometric auth (Face + Touch ID)
│       ├── PhoneMirror.jsx   # Interactive phone mirror
│       └── RemoteControl.jsx # Mobile remote control panel
├── setup.sh              # One-command startup script
└── .env.example          # Environment template
```

---

## 🔐 Security Notes

- `.env` is **gitignored** — never commit secrets
- Face descriptors are stored **locally** in browser `localStorage` only
- Fingerprint uses **WebAuthn** — biometric data never leaves the device
- All remote connections go through **Tailscale's encrypted mesh**

---

## 👤 Author

Built by **Ravikiran** — A personal AI system inspired by JARVIS from Iron Man.
