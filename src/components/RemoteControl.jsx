import { useState, useEffect, useRef, useCallback } from 'react';
import { COMMAND_URL, apiUrl, wsUrl } from '../apiConfig';

function RemotePinGate({ onUnlocked }) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);

  const submit = async (pin) => {
    try {
      const res = await fetch(apiUrl('/remote/verify-pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        sessionStorage.setItem('jarvis_remote_token', data.token);
        sessionStorage.setItem('jarvis_remote_expires', String(Date.now() + (data.expires_in || 1800) * 1000));
        onUnlocked(data.token);
      } else {
        setError(data.message || 'Incorrect PIN');
        setLocked(!!data.locked);
        setDigits('');
      }
    } catch {
      setError('Could not reach laptop, Sir.');
    }
  };

  const handleDigit = (d) => {
    if (locked) return;
    const next = (digits + d).slice(0, 4);
    setDigits(next);
    setError('');
    if (next.length === 4) submit(next);
  };

  return (
    <div className="min-h-screen bg-space-900 flex flex-col items-center justify-center p-6">
      <h1 className="font-[family-name:var(--font-display)] text-holo-cyan text-lg tracking-widest mb-2">
        JARVIS REMOTE ACCESS
      </h1>
      <p className="text-text-dim text-xs mb-8 font-[family-name:var(--font-mono)]">Enter 4-digit PIN</p>
      <div className="flex gap-3 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full border border-holo-cyan/50 bg-holo-cyan/20"
            style={{ opacity: digits.length > i ? 1 : 0.3 }}
          />
        ))}
      </div>
      {error && <p className="text-neon-red text-xs mb-4 text-center max-w-xs">{error}</p>}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, idx) => (
          <button
            key={idx}
            type="button"
            disabled={!k || locked}
            onClick={() => (k === '⌫' ? setDigits((d) => d.slice(0, -1)) : handleDigit(k))}
            className="py-4 rounded-xl bg-space-800 border border-glass-border text-holo-cyan text-lg disabled:opacity-0"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RemoteControl({ apiKeys }) {
  const [sessionToken, setSessionToken] = useState(() => {
    const tok = sessionStorage.getItem('jarvis_remote_token');
    const exp = Number(sessionStorage.getItem('jarvis_remote_expires') || 0);
    if (tok && exp > Date.now()) return tok;
    return null;
  });
  const [pinRequired, setPinRequired] = useState(true);
  const [pinChecked, setPinChecked] = useState(false);
  const [frame, setFrame] = useState(null);
  const [online, setOnline] = useState(false);
  const [pingMs, setPingMs] = useState(null);
  const [phoneConnected, setPhoneConnected] = useState(false);
  const [lastCommand, setLastCommand] = useState('—');
  const [reconnecting, setReconnecting] = useState(false);
  const [screenshotPreview, setScreenshotPreview] = useState(null);
  const [openAppName, setOpenAppName] = useState('');
  const [typeTextVal, setTypeTextVal] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [statusLine, setStatusLine] = useState('STANDBY');
  const [remoteMode, setRemoteMode] = useState(false);
  const [remoteBattery, setRemoteBattery] = useState(100);
  const [remoteCharger, setRemoteCharger] = useState(true);
  const [showBatteryWarn, setShowBatteryWarn] = useState(false);

  const imgRef = useRef(null);
  const screenSizeRef = useRef({ width: 1920, height: 1080 });
  const recognitionRef = useRef(null);
  const wsRef = useRef(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [isStealthMode, setIsStealthMode] = useState(false);

  const lastTouchRef = useRef(null);
  const lastScrollTouchRef = useRef(null);
  const touchStartTimeRef = useRef(0);
  const touchStartPosRef = useRef(null);
  const keyboardInputRef = useRef(null);

  // Stealth Mode - periodically locks display to keep it black while user is controlling
  useEffect(() => {
    if (!isStealthMode || !sessionToken) return;
    const interval = setInterval(() => {
      fetch(apiUrl('laptop/lock'), {
        method: 'POST',
        headers: { 'X-Remote-Session': sessionToken }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [isStealthMode, sessionToken]);

  // Autofocus the hidden keyboard input when keyboard is activated
  useEffect(() => {
    if (showKeyboard && keyboardInputRef.current) {
      keyboardInputRef.current.focus();
    }
  }, [showKeyboard]);

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchMove = (e) => {
    if (!lastTouchRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const touch = e.touches[0];
    const dx = touch.clientX - lastTouchRef.current.x;
    const dy = touch.clientY - lastTouchRef.current.y;
    
    const sensitivity = 1.8;
    const sendDx = Math.round(dx * sensitivity);
    const sendDy = Math.round(dy * sensitivity);

    if (sendDx !== 0 || sendDy !== 0) {
      wsRef.current.send(JSON.stringify({
        action: 'move',
        dx: sendDx,
        dy: sendDy
      }));
    }
    
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleScrollTouchStart = (e) => {
    const touch = e.touches[0];
    lastScrollTouchRef.current = touch.clientY;
  };

  const handleScrollTouchMove = (e) => {
    if (lastScrollTouchRef.current == null || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const touch = e.touches[0];
    const dy = touch.clientY - lastScrollTouchRef.current;
    
    const threshold = 5;
    if (Math.abs(dy) >= threshold) {
      const scrollDirection = dy > 0 ? -1 : 1;
      wsRef.current.send(JSON.stringify({
        action: 'scroll',
        dy: scrollDirection * 2
      }));
      lastScrollTouchRef.current = touch.clientY;
    }
  };

  const handleScrollTouchEnd = () => {
    lastScrollTouchRef.current = null;
  };

  const handleTrackpadTouchStart = (e) => {
    const touch = e.touches[0];
    lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchStartTimeRef.current = Date.now();
  };

  const handleTrackpadTouchEnd = (e) => {
    lastTouchRef.current = null;
    const duration = Date.now() - touchStartTimeRef.current;
    if (duration < 250 && touchStartPosRef.current) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartPosRef.current.x;
      const dy = touch.clientY - touchStartPosRef.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 10) {
        sendClick('left');
      }
    }
    touchStartPosRef.current = null;
  };

  const sendClick = (button) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'click', button }));
    }
  };

  const handleKeyboardInput = (e) => {
    const val = e.target.value;
    if (!val) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'type', text: val }));
    }
    e.target.value = '';
  };

  const handleKeyboardKeyDown = (e) => {
    if (e.key === 'Backspace') {
      sendKey('backspace');
    } else if (e.key === 'Enter') {
      sendKey('enter');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      sendKey('tab');
    }
  };

  const sendKey = (key) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action: 'key', key }));
    }
  };

  // Auto-unlock when PIN not configured on laptop
  useEffect(() => {
    fetch(apiUrl('health'))
      .then((r) => r.json())
      .then(async (d) => {
        setPinRequired(!!d.remote_pin_required);
        if (!d.remote_pin_required && !sessionToken) {
          const res = await fetch(apiUrl('/remote/verify-pin'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: '' }),
          });
          const data = await res.json();
          if (data.token) {
            sessionStorage.setItem('jarvis_remote_token', data.token);
            setSessionToken(data.token);
          }
        }
        setPinChecked(true);
      })
      .catch(() => setPinChecked(true));
  }, [sessionToken]);

  const remoteHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      'X-Remote-Session': sessionToken || '',
      ...(apiKeys && apiKeys.groq ? { Authorization: `Bearer ${apiKeys.groq}` } : {}),
    }),
    [sessionToken, apiKeys]
  );

  const apiPost = useCallback(
    async (path, body) => {
      try {
        const res = await fetch(apiUrl(path), {
          method: 'POST',
          headers: remoteHeaders(),
          body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401) {
          sessionStorage.removeItem('jarvis_remote_token');
          sessionStorage.removeItem('jarvis_remote_expires');
          setSessionToken(null);
          return { success: false, error: 'Session expired' };
        }
        return res.json();
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
    [remoteHeaders, setSessionToken]
  );

  const speak = (text) => {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    window.speechSynthesis.speak(u);
  };

  // Health + reconnect + remote mode check every 30s
  useEffect(() => {
    if (!sessionToken) return;
    const check = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(apiUrl('health'));
        const data = await res.json();
        setPingMs(Math.round(performance.now() - t0));
        setOnline(data.status === 'online');
        setPhoneConnected(!!data.phone_connected);
        setReconnecting(false);
      } catch {
        setOnline(false);
        setReconnecting(true);
      }

      try {
        const res = await fetch(apiUrl('system/remote-mode'), {
          headers: { 'X-Remote-Session': sessionToken }
        });
        const data = await res.json();
        setRemoteMode(!!data.enabled);
        setRemoteBattery(data.battery ?? 100);
        setRemoteCharger(!!data.on_charger);
      } catch {}
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [sessionToken]);

  // Laptop screen size
  useEffect(() => {
    if (!sessionToken) return;
    fetch(apiUrl('laptop/screen-size'), { headers: { 'X-Remote-Session': sessionToken } })
      .then((r) => r.json())
      .then((d) => {
        if (d.width) screenSizeRef.current = d;
      })
      .catch(() => {});
  }, [sessionToken]);

  // WebSocket laptop stream
  useEffect(() => {
    if (!sessionToken) return;
    let ws;
    let mounted = true;
    const connect = () => {
      ws = new WebSocket(wsUrl('/ws/laptop-stream'));
      wsRef.current = ws;
      ws.onopen = () => mounted && setOnline(true);
      ws.onmessage = (e) => {
        if (!mounted) return;
        const data = JSON.parse(e.data);
        if (data.frame) setFrame(`data:image/jpeg;base64,${data.frame}`);
      };
      ws.onclose = () => {
        if (mounted) {
          wsRef.current = null;
          setTimeout(connect, 2000);
        }
      };
    };
    connect();
    return () => {
      mounted = false;
      ws?.close();
      wsRef.current = null;
    };
  }, [sessionToken]);

  const handleScreenTap = async (e) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    const { width, height } = screenSizeRef.current;
    const x = Math.round(xPct * width);
    const y = Math.round(yPct * height);
    setLastCommand(`Click (${x}, ${y})`);
    await apiPost('/laptop/click', { x, y });
  };

  const runCommand = async (label, path, body) => {
    setLastCommand(label);
    setStatusLine('EXECUTING...');
    const data = await apiPost(path, body);
    setStatusLine('STANDBY');
    if (data.message) speak(data.message);
    if (data.description) speak(data.description);
    return data;
  };

  const toggleRemoteMode = async (force = false) => {
    const newState = !remoteMode;

    if (newState && !force && remoteBattery < 30 && !remoteCharger) {
      setShowBatteryWarn(true);
      return;
    }

    setLastCommand(newState ? 'Enable Remote Mode' : 'Disable Remote Mode');
    setStatusLine(newState ? 'WAKING UP LAPTOP...' : 'UPDATING REMOTE MODE...');

    if (newState) {
      const maxAttempts = 10;
      let attempt = 0;
      let success = false;
      let data = null;

      while (attempt < maxAttempts && !success) {
        attempt++;
        setStatusLine(`WAKING LAPTOP (ATTEMPT ${attempt}/${maxAttempts})...`);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);

          const res = await fetch(apiUrl('system/remote-mode'), {
            method: 'POST',
            headers: remoteHeaders(),
            body: JSON.stringify({ enabled: newState }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (res.status === 200) {
            data = await res.json();
            success = true;
          } else {
            throw new Error(`HTTP ${res.status}`);
          }
        } catch (err) {
          console.warn(`Wake attempt ${attempt} failed:`, err);
          if (attempt < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      setStatusLine('STANDBY');
      if (success && data && data.success) {
        setRemoteMode(newState);
        setOnline(true);
        if (data.message) speak(data.message);
      } else {
        setStatusLine('ERROR');
        speak('Could not wake or connect to laptop, Sir.');
      }
    } else {
      try {
        const res = await fetch(apiUrl('system/remote-mode'), {
          method: 'POST',
          headers: remoteHeaders(),
          body: JSON.stringify({ enabled: newState }),
        });
        const data = await res.json();
        setStatusLine('STANDBY');
        if (data.success) {
          setRemoteMode(newState);
          if (data.message) speak(data.message);
        } else {
          speak('Failed to update remote mode, Sir.');
        }
      } catch {
        setStatusLine('ERROR');
        speak('Could not connect to update remote mode, Sir.');
      }
    }
  };

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      speak('Speech recognition unavailable on this browser, Sir.');
      return;
    }
    const rec = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onstart = () => setIsListening(true);
    rec.onend = () => setIsListening(false);
    rec.onresult = async (ev) => {
      const transcript = ev.results[0][0].transcript;
      setLastCommand(transcript);
      setStatusLine('NEURAL PROCESSING...');
      try {
        const res = await fetch(apiUrl('command'), {
          method: 'POST',
          headers: remoteHeaders(),
          body: JSON.stringify({ command: transcript, language: 'en-US' }),
        });
        if (res.status === 401) {
          sessionStorage.removeItem('jarvis_remote_token');
          sessionStorage.removeItem('jarvis_remote_expires');
          setSessionToken(null);
          speak('Session expired, Sir.');
          setStatusLine('STANDBY');
          return;
        }
        const data = await res.json();
        setStatusLine('STANDBY');
        if (data.reply) speak(data.reply);
        if (data.action === 'show_phone') await apiPost('/phone/show');
      } catch {
        speak('Command failed, Sir.');
        setStatusLine('ERROR');
      }
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const stopListening = () => recognitionRef.current?.stop();

  if (!sessionToken) {
    if (!pinChecked) {
      return (
        <div className="min-h-screen bg-space-900 flex items-center justify-center text-holo-cyan text-xs font-[family-name:var(--font-mono)]">
          Connecting to laptop...
        </div>
      );
    }
    if (pinRequired) {
      return <RemotePinGate onUnlocked={setSessionToken} />;
    }
  }

  return (
    <div className="min-h-screen bg-space-900 text-text-primary flex flex-col">
      {/* Status bar */}
      <div className="px-4 py-2 border-b border-glass-border flex flex-wrap items-center justify-between gap-2 text-[10px] font-[family-name:var(--font-mono)]">
        <span className="text-holo-cyan tracking-widest">REMOTE MODE</span>
        <span className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-neon-green' : 'bg-neon-red animate-pulse'}`} />
          {reconnecting ? 'Reconnecting...' : online ? 'Laptop connected' : 'Offline'}
        </span>
        {pingMs != null && <span>Ping {pingMs}ms</span>}
        <span>Phone ADB: {phoneConnected ? 'ON' : 'OFF'}</span>
        <span className="truncate max-w-[120px]">Last: {lastCommand}</span>
      </div>

      <header className="px-4 py-3 text-center border-b border-glass-border">
        <h1 className="font-[family-name:var(--font-display)] text-holo-cyan tracking-[0.3em] text-sm">
          JARVIS REMOTE
        </h1>
      </header>

      {/* Navigation Tabs */}
      <div className="px-4 py-2 border-b border-glass-border flex gap-4 justify-around bg-space-850">
        <button
          type="button"
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 py-2 text-center text-xs font-[family-name:var(--font-display)] tracking-wider transition-all duration-300 border-b-2 ${
            activeTab === 'dashboard'
              ? 'border-holo-cyan text-holo-cyan'
              : 'border-transparent text-text-dim hover:text-text-primary'
          }`}
        >
          DASHBOARD
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('touchpad')}
          className={`flex-1 py-2 text-center text-xs font-[family-name:var(--font-display)] tracking-wider transition-all duration-300 border-b-2 ${
            activeTab === 'touchpad'
              ? 'border-holo-cyan text-holo-cyan'
              : 'border-transparent text-text-dim hover:text-text-primary'
          }`}
        >
          TOUCHPAD ZONE
        </button>
      </div>

      {activeTab === 'dashboard' ? (
        <div className="flex-1 flex flex-col">
          {/* Remote Mode Toggle Panel */}
          <div className="mx-3 mt-3 p-4 rounded-2xl glass border border-glass-border bg-space-850 flex flex-col items-center">
            <div className="w-full flex justify-between items-center mb-3">
              <span className="text-text-secondary text-xs uppercase tracking-wider font-[family-name:var(--font-display)]">
                Remote Mode
              </span>
              <span className="text-xs text-text-dim font-[family-name:var(--font-mono)]">
                Battery: <span className={remoteBattery < 30 && !remoteCharger ? 'text-neon-red font-bold' : 'text-holo-cyan'}>{remoteBattery}%</span> {remoteCharger ? '⚡' : ''}
              </span>
            </div>
            
            {/* Sliding Switch Toggle Box */}
            <div className="flex items-center justify-between w-full bg-space-900/60 p-3 rounded-xl border border-glass-border">
              <div className="flex flex-col items-start text-left">
                <span className="text-[11px] font-[family-name:var(--font-mono)] text-text-secondary">
                  Status: <span className={remoteMode ? 'text-neon-green font-bold' : 'text-neon-red font-bold'}>{remoteMode ? 'ACTIVE' : 'INACTIVE'}</span>
                </span>
                <span className="text-[9px] text-text-dim mt-0.5 font-[family-name:var(--font-mono)]">
                  {remoteMode ? 'Laptop staying awake' : 'Laptop sleeps normally'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => toggleRemoteMode(false)}
                className={`w-14 h-8 rounded-full p-0.5 transition-all duration-300 outline-none flex items-center relative border ${
                  remoteMode 
                    ? 'bg-neon-green/10 border-neon-green shadow-[0_0_10px_rgba(0,255,136,0.15)]' 
                    : 'bg-space-800 border-glass-border'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full transition-all duration-300 transform shadow-md ${
                    remoteMode 
                      ? 'translate-x-6 bg-neon-green shadow-[0_0_8px_#00ff88]' 
                      : 'translate-x-0 bg-text-dim'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Live laptop screen */}
          <div className="relative mx-3 mt-3 rounded-xl overflow-hidden border border-holo-cyan/30 bg-black aspect-video">
            <span className="absolute top-2 left-2 z-10 flex items-center gap-1 text-[9px] text-neon-red font-[family-name:var(--font-mono)] animate-pulse">
              <span className="w-2 h-2 rounded-full bg-neon-red" /> LIVE
            </span>
            {frame ? (
              <img
                ref={imgRef}
                src={frame}
                alt="Laptop"
                className="w-full h-full object-contain cursor-crosshair"
                onClick={handleScreenTap}
                draggable={false}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-text-dim text-xs font-[family-name:var(--font-mono)]">
                Connecting stream...
              </div>
            )}
          </div>

          {/* Hold to speak */}
          <div className="px-4 py-4">
            <button
              type="button"
              onTouchStart={startListening}
              onTouchEnd={stopListening}
              onMouseDown={startListening}
              onMouseUp={stopListening}
              onMouseLeave={stopListening}
              className={`w-full py-4 rounded-xl border font-[family-name:var(--font-display)] tracking-wider text-sm transition-all ${
                isListening
                  ? 'bg-neon-green/20 border-neon-green text-neon-green'
                  : 'bg-holo-cyan/10 border-holo-cyan/40 text-holo-cyan'
              }`}
            >
              {isListening ? 'LISTENING...' : 'HOLD TO SPEAK'}
            </button>
            <p className="text-center text-[10px] text-text-dim mt-2 font-[family-name:var(--font-mono)]">{statusLine}</p>
          </div>

          {/* Quick commands */}
          <div className="px-4 pb-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="py-3 rounded-lg bg-space-800 border border-glass-border text-xs text-holo-cyan"
              onClick={() => runCommand('Phone mirror', '/phone/show')}
            >
              Phone Mirror
            </button>
            <button
              type="button"
              className="py-3 rounded-lg bg-space-800 border border-glass-border text-xs text-holo-cyan"
              onClick={async () => {
                const data = await runCommand('Screenshot', '/laptop/screenshot');
                if (data.image) setScreenshotPreview(`data:image/jpeg;base64,${data.image}`);
              }}
            >
              Screenshot
            </button>
            <button
              type="button"
              className="py-3 rounded-lg bg-space-800 border border-glass-border text-xs text-holo-cyan"
              onClick={() => runCommand('Lock laptop', '/laptop/lock')}
            >
              Lock Laptop
            </button>
            <button
              type="button"
              className="py-3 rounded-lg bg-space-800 border border-glass-border text-xs text-holo-cyan"
              onClick={() => runCommand('Describe screen', '/laptop/describe')}
            >
              Describe Screen
            </button>
            <div className="col-span-2 flex gap-2">
              <input
                type="text"
                value={openAppName}
                onChange={(e) => setOpenAppName(e.target.value)}
                placeholder="App name (chrome, finder...)"
                className="flex-1 bg-space-950 border border-glass-border rounded-lg px-3 py-2 text-xs text-text-primary animate-pulse-subtle focus:border-holo-cyan outline-none"
              />
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-holo-cyan/15 border border-holo-cyan/30 text-holo-cyan text-xs font-[family-name:var(--font-display)]"
                onClick={() => openAppName && runCommand(`Open ${openAppName}`, '/laptop/open-app', { app: openAppName })}
              >
                Open
              </button>
            </div>
            <div className="col-span-2 flex gap-2 mt-1">
              <input
                type="text"
                value={typeTextVal}
                onChange={(e) => setTypeTextVal(e.target.value)}
                placeholder="Type text on laptop..."
                className="flex-1 bg-space-950 border border-glass-border rounded-lg px-3 py-2 text-xs text-text-primary focus:border-holo-cyan outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && typeTextVal) {
                    runCommand('Type text', '/laptop/type', { text: typeTextVal });
                    setTypeTextVal('');
                  }
                }}
              />
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-holo-cyan/15 border border-holo-cyan/30 text-holo-cyan text-xs font-[family-name:var(--font-display)]"
                onClick={() => {
                  if (typeTextVal) {
                    runCommand('Type text', '/laptop/type', { text: typeTextVal });
                    setTypeTextVal('');
                  }
                }}
              >
                Type
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Live Preview Stream Mini Monitor */}
          <div className="relative mx-3 mt-3 rounded-xl overflow-hidden border border-holo-cyan/30 bg-black aspect-video max-h-[140px] md:max-h-[200px]">
            <span className="absolute top-2 left-2 z-10 flex items-center gap-1 text-[8px] text-neon-red font-[family-name:var(--font-mono)] animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-neon-red" /> LIVE PREVIEW
            </span>
            {frame ? (
              <img
                ref={imgRef}
                src={frame}
                alt="Laptop Preview"
                className="w-full h-full object-contain cursor-crosshair"
                onClick={handleScreenTap}
                draggable={false}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-text-dim text-xs font-[family-name:var(--font-mono)]">
                Connecting stream...
              </div>
            )}
          </div>

          {/* Stealth Mode and Power Cards */}
          <div className="mx-3 mt-3 grid grid-cols-2 gap-3">
            {/* Stealth Shield */}
            <div className="p-3 rounded-xl glass border border-glass-border bg-space-850 flex flex-col justify-between">
              <div className="flex justify-between items-start mb-1">
                <span className="text-[9px] text-text-secondary uppercase tracking-wider font-[family-name:var(--font-display)]">
                  Stealth Shield
                </span>
                <span className="text-[8px] text-text-dim font-[family-name:var(--font-mono)]">
                  Black Display
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-[10px] font-[family-name:var(--font-mono)] font-bold ${isStealthMode ? 'text-neon-green' : 'text-text-dim'}`}>
                  {isStealthMode ? 'SHIELDED' : 'UNSHIELDED'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsStealthMode(!isStealthMode)}
                  className={`w-10 h-6 rounded-full p-0.5 transition-all duration-300 outline-none flex items-center relative border ${
                    isStealthMode 
                      ? 'bg-neon-green/10 border-neon-green' 
                      : 'bg-space-800 border-glass-border'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full transition-all duration-300 transform shadow-md ${
                      isStealthMode 
                        ? 'translate-x-4 bg-neon-green shadow-[0_0_8px_#00ff88]' 
                        : 'translate-x-0 bg-text-dim'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Quick System controls */}
            <div className="p-3 rounded-xl glass border border-glass-border bg-space-850 flex flex-col justify-between">
              <span className="text-[9px] text-text-secondary uppercase tracking-wider font-[family-name:var(--font-display)] mb-1">
                System Commands
              </span>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => runCommand('Lock Display', '/laptop/lock')}
                  className="flex-1 py-1.5 rounded-lg bg-space-900 border border-glass-border text-[9px] text-holo-cyan font-[family-name:var(--font-mono)] active:border-holo-cyan hover:bg-space-950 transition-colors"
                >
                  Lock
                </button>
                <button
                  type="button"
                  onClick={() => runCommand('Sleep Laptop', '/laptop/sleep')}
                  className="flex-1 py-1.5 rounded-lg bg-space-900 border border-glass-border text-[9px] text-neon-red/80 hover:text-neon-red font-[family-name:var(--font-mono)] active:border-neon-red hover:bg-space-950 transition-colors"
                >
                  Sleep
                </button>
              </div>
            </div>
          </div>

          {/* Futuristic Dotted Dials Trackpad */}
          <div className="mx-3 mt-3 flex-1 flex flex-col bg-space-850 rounded-2xl border border-glass-border p-4 relative overflow-hidden min-h-[220px]">
            {/* High-tech matrix grid background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#00f0ff06_1px,transparent_1px),linear-gradient(to_bottom,#00f0ff06_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

            <div className="absolute top-2 left-3 text-[9px] text-text-dim font-[family-name:var(--font-mono)] uppercase tracking-wider flex items-center gap-1.5 pointer-events-none">
              <span className="w-1.5 h-1.5 rounded-full bg-holo-cyan/50 animate-pulse" />
              Interactive Touchpad Zone
            </div>

            <div className="absolute top-2 right-3 text-[8px] text-text-dim font-[family-name:var(--font-mono)] pointer-events-none">
              Drag to move • Tap to left click
            </div>

            <div className="flex-1 flex gap-3 mt-4 relative z-10">
              {/* Touch Area */}
              <div
                onTouchStart={handleTrackpadTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTrackpadTouchEnd}
                className="flex-1 rounded-xl border border-holo-cyan/15 bg-space-900/60 active:border-holo-cyan/40 transition-colors relative flex items-center justify-center cursor-none select-none"
              >
                {/* Visual circular radar HUD element */}
                <div className="w-16 h-16 rounded-full border border-holo-cyan/10 flex items-center justify-center animate-pulse pointer-events-none">
                  <div className="w-8 h-8 rounded-full border border-holo-cyan/15 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-holo-cyan/35" />
                  </div>
                </div>
              </div>

              {/* Scroll Area strip */}
              <div
                onTouchStart={handleScrollTouchStart}
                onTouchMove={handleScrollTouchMove}
                onTouchEnd={handleScrollTouchEnd}
                className="w-12 rounded-xl border border-holo-cyan/15 bg-space-900/60 active:border-holo-cyan/40 relative flex flex-col justify-between items-center py-4 select-none cursor-ns-resize"
              >
                <div className="text-[8px] text-holo-cyan/40 font-bold select-none pointer-events-none">▲</div>
                <div className="text-[8px] text-holo-cyan/30 uppercase tracking-widest font-[family-name:var(--font-mono)] [writing-mode:vertical-lr] pointer-events-none select-none">
                  SCROLL
                </div>
                <div className="text-[8px] text-holo-cyan/40 font-bold select-none pointer-events-none">▼</div>
              </div>
            </div>
          </div>

          {/* Mouse buttons & Keyboard trigger */}
          <div className="mx-3 mt-3 mb-4 flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => sendClick('left')}
                className="flex-1 py-3 rounded-xl bg-space-800 border border-glass-border hover:border-holo-cyan/30 text-xs text-holo-cyan font-[family-name:var(--font-display)] tracking-wider active:bg-space-900 transition-colors"
              >
                LEFT CLICK
              </button>
              <button
                type="button"
                onClick={() => sendClick('right')}
                className="flex-1 py-3 rounded-xl bg-space-800 border border-glass-border hover:border-holo-cyan/30 text-xs text-text-secondary font-[family-name:var(--font-display)] tracking-wider active:bg-space-900 transition-colors"
              >
                RIGHT CLICK
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowKeyboard(!showKeyboard)}
              className={`w-full py-3 rounded-xl font-[family-name:var(--font-display)] tracking-wider text-xs border transition-all ${
                showKeyboard
                  ? 'bg-neon-green/10 border-neon-green text-neon-green shadow-[0_0_10px_rgba(0,255,136,0.1)]'
                  : 'bg-holo-cyan/15 border-holo-cyan/30 text-holo-cyan hover:bg-holo-cyan/20'
              }`}
            >
              {showKeyboard ? 'HIDE VIRTUAL KEYBOARD' : 'SHOW VIRTUAL KEYBOARD'}
            </button>
          </div>

          {/* Keyboard interface drawer */}
          {showKeyboard && (
            <div className="mx-3 mb-4 p-4 rounded-2xl glass border border-neon-green/30 bg-space-850 shadow-[0_0_20px_rgba(0,255,136,0.05)] flex flex-col relative z-20">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] text-neon-green font-[family-name:var(--font-display)] tracking-wider uppercase">
                  Keyboard HUD Interface
                </span>
                <span className="text-[8px] text-text-dim font-[family-name:var(--font-mono)]">
                  Streaming keys in real-time
                </span>
              </div>

              {/* Real input box */}
              <div className="flex gap-2 mb-3">
                <input
                  ref={keyboardInputRef}
                  type="text"
                  onChange={handleKeyboardInput}
                  onKeyDown={handleKeyboardKeyDown}
                  placeholder="Type here to stream to laptop..."
                  className="flex-1 bg-space-950 border border-neon-green/35 rounded-xl px-3 py-2.5 text-xs text-text-primary focus:border-neon-green focus:ring-1 focus:ring-neon-green/30 outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (keyboardInputRef.current) {
                      keyboardInputRef.current.value = '';
                      keyboardInputRef.current.focus();
                    }
                  }}
                  className="px-3 rounded-xl border border-glass-border bg-space-800 text-[10px] text-text-dim font-[family-name:var(--font-mono)] hover:text-text-primary"
                >
                  Clear
                </button>
              </div>

              {/* developer utility keys grid */}
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-6 gap-1">
                  {['Esc', 'Tab', 'Enter', 'Space', 'Backspace', 'Shift'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (k === 'Esc') sendKey('escape');
                        else if (k === 'Space') sendKey('space');
                        else if (k === 'Backspace') sendKey('backspace');
                        else sendKey(k.toLowerCase());
                      }}
                      className="py-2 rounded-lg bg-space-900 border border-glass-border text-[9px] text-holo-cyan/85 font-[family-name:var(--font-mono)] active:border-holo-cyan active:text-holo-cyan transition-colors"
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-6 gap-1">
                  {['Cmd', 'Ctrl', 'Alt', 'Up', 'Down', 'Left'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (k === 'Cmd') sendKey('command');
                        else if (k === 'Ctrl') sendKey('ctrl');
                        else if (k === 'Alt') sendKey('option');
                        else sendKey(k.toLowerCase());
                      }}
                      className="py-2 rounded-lg bg-space-900 border border-glass-border text-[9px] text-holo-cyan/85 font-[family-name:var(--font-mono)] active:border-holo-cyan active:text-holo-cyan transition-colors"
                    >
                      {k === 'Up' ? '▲' : k === 'Down' ? '▼' : k === 'Left' ? '◀' : k}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-6 gap-1">
                  <button
                    key="Right"
                    type="button"
                    onClick={() => sendKey('right')}
                    className="py-2 rounded-lg bg-space-900 border border-glass-border text-[9px] text-holo-cyan/85 font-[family-name:var(--font-mono)] active:border-holo-cyan active:text-holo-cyan transition-colors"
                  >
                    ▶
                  </button>
                  {['A', 'F11', 'F12', 'Mute', 'VolUp', 'VolDn'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        if (k === 'Mute') runCommand('Mute Volume', '/laptop/volume', { level: 0 });
                        else if (k === 'VolUp') runCommand('Volume Up', '/laptop/volume', { level: 80 });
                        else if (k === 'VolDn') runCommand('Volume Down', '/laptop/volume', { level: 30 });
                        else sendKey(k.toLowerCase());
                      }}
                      className="py-2 rounded-lg bg-space-900 border border-glass-border text-[9px] text-holo-cyan/85 font-[family-name:var(--font-mono)] active:border-holo-cyan active:text-holo-cyan transition-colors"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showBatteryWarn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="glass rounded-3xl p-6 flex flex-col max-w-sm w-full mx-4 border border-neon-red/30 shadow-[0_0_30px_rgba(255,51,102,0.1)] relative">
            <div className="flex items-center gap-2 text-neon-red mb-4">
              <span className="text-xl">⚠️</span>
              <h2 className="font-[family-name:var(--font-display)] tracking-[0.2em] text-sm">
                BATTERY WARNING
              </h2>
            </div>
            
            <p className="text-xs text-text-primary mb-6 font-[family-name:var(--font-mono)] leading-relaxed">
              Battery is at <span className="text-neon-red font-bold">{remoteBattery}%</span> and not charging.
              Remote mode will drain battery faster. Plug in charger for best experience.
              Continue anyway?
            </p>
            
            <div className="flex gap-3 font-[family-name:var(--font-display)] tracking-wider text-xs">
              <button
                type="button"
                className="flex-1 py-3 rounded-xl bg-neon-red/10 border border-neon-red/40 text-neon-red hover:bg-neon-red/20 transition-all duration-300 font-[family-name:var(--font-display)]"
                onClick={() => {
                  setShowBatteryWarn(false);
                  toggleRemoteMode(true);
                }}
              >
                CONTINUE
              </button>
              <button
                type="button"
                className="flex-1 py-3 rounded-xl bg-space-800 border border-glass-border text-text-dim hover:text-text-primary transition-all duration-300 font-[family-name:var(--font-display)]"
                onClick={() => setShowBatteryWarn(false)}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {screenshotPreview && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setScreenshotPreview(null)}>
          <img src={screenshotPreview} alt="Screenshot" className="max-w-full max-h-[80vh] rounded-lg border border-holo-cyan/30" />
          <p className="text-text-dim text-xs mt-3">Tap to close</p>
        </div>
      )}
    </div>
  );
}
