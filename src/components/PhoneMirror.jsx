import { useState, useEffect, useRef, useCallback } from 'react';
import { apiUrl, wsUrl } from '../apiConfig';

export function PhoneMirror({ onClose }) {
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);
  const [typeText, setTypeText] = useState('');
  const [audioStreaming, setAudioStreaming] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const imgRef = useRef(null);

  // Gesture refs
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragStartTime = useRef(0);

  // 1. Establish WebSocket for live frames
  useEffect(() => {
    let ws;
    let isMounted = true;

    const connectWs = () => {
      // Connect to the backend WebSocket
      ws = new WebSocket(wsUrl('/ws/phone-stream'));
      
      ws.onopen = () => {
        if(isMounted) setConnected(true);
      };

      ws.onmessage = (e) => {
        if (!isMounted) return;
        const data = JSON.parse(e.data);
        if (data.frame) {
          setFrame("data:image/png;base64," + data.frame);
        } else if (data.error) {
          console.warn("Phone stream error:", data.error);
        }
      };

      ws.onclose = () => {
        if(isMounted) setConnected(false);
        // Attempt reconnect after 2s
        setTimeout(() => {
          if (isMounted) connectWs();
        }, 2000);
      };
    };

    connectWs();
    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, []);

  // Check audio status on mount
  useEffect(() => {
    fetch(apiUrl('/phone/audio/status'))
      .then(r => r.json())
      .then(d => setAudioStreaming(!!d.running))
      .catch(() => {});

    // Stop audio when panel is closed
    return () => {
      fetch(apiUrl('/phone/audio/stop'), { method: 'POST' }).catch(() => {});
    };
  }, []);

  const toggleAudio = useCallback(async () => {
    setAudioLoading(true);
    try {
      if (audioStreaming) {
        await fetch(apiUrl('/phone/audio/stop'), { method: 'POST' });
        setAudioStreaming(false);
      } else {
        const res = await fetch(apiUrl('/phone/audio/start'), { method: 'POST' });
        const data = await res.json();
        if (data.success) setAudioStreaming(true);
        else alert(data.message);
      }
    } catch (err) {
      console.error('Audio toggle error:', err);
    } finally {
      setAudioLoading(false);
    }
  }, [audioStreaming]);

  // 2. Gesture Control Handlers (Tap & Swipe)
  const handleGestureStart = (clientX, clientY) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    dragStart.current = { x, y };
    isDragging.current = true;
    dragStartTime.current = Date.now();
  };

  const handleGestureEnd = async (clientX, clientY) => {
    if (!isDragging.current || !imgRef.current) return;
    isDragging.current = false;

    const rect = imgRef.current.getBoundingClientRect();
    const endX = clientX - rect.left;
    const endY = clientY - rect.top;

    const dx = endX - dragStart.current.x;
    const dy = endY - dragStart.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Date.now() - dragStartTime.current;

    // Scale to standard ADB phone resolution of 1080x1920
    const scaleX = (val) => Math.round((val / rect.width) * 1080);
    const scaleY = (val) => Math.round((val / rect.height) * 1920);

    const startAdbX = scaleX(dragStart.current.x);
    const startAdbY = scaleY(dragStart.current.y);
    const endAdbX = scaleX(endX);
    const endAdbY = scaleY(endY);

    if (dist < 10) {
      // Tap gesture
      try {
        await fetch(apiUrl('/phone/tap'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: startAdbX, y: startAdbY })
        });
      } catch (err) {
        console.error("Tap failed:", err);
      }
    } else {
      // Swipe gesture
      try {
        await fetch(apiUrl('/phone/swipe'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x1: startAdbX,
            y1: startAdbY,
            x2: endAdbX,
            y2: endAdbY,
            duration: Math.max(100, Math.min(2000, duration))
          })
        });
      } catch (err) {
        console.error("Swipe failed:", err);
      }
    }
  };

  const handleMouseDown = (e) => {
    e.preventDefault(); // Prevents image drag ghosting
    handleGestureStart(e.clientX, e.clientY);
  };

  const handleMouseUp = (e) => {
    handleGestureEnd(e.clientX, e.clientY);
  };

  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    handleGestureStart(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e) => {
    const touch = e.changedTouches[0];
    handleGestureEnd(touch.clientX, touch.clientY);
  };

  const sendKey = async (key) => {
    await fetch(apiUrl('/phone/key'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keycode: key })
    });
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-space-900/95 border-l border-holo-cyan/20 backdrop-blur-xl shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center pt-8 pb-4 px-4 z-40 animate-slide-in-right">
      
      <div className="w-full flex justify-between items-center mb-4 px-2 shrink-0">
        <h2 className="font-[family-name:var(--font-display)] tracking-widest text-holo-cyan text-sm">
          DEVICE LINK
        </h2>
        <div className="flex items-center gap-2">
          {/* Audio Stream Toggle */}
          <button
            onClick={toggleAudio}
            disabled={audioLoading}
            title={audioStreaming ? 'Stop phone audio' : 'Stream phone audio to laptop'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-[family-name:var(--font-mono)] tracking-wider border transition-all duration-300 ${
              audioStreaming
                ? 'bg-neon-green/15 border-neon-green/60 text-neon-green shadow-[0_0_12px_rgba(0,255,136,0.2)]'
                : 'bg-space-800 border-glass-border text-text-dim hover:border-holo-cyan/40 hover:text-holo-cyan'
            } disabled:opacity-50`}
          >
            {audioLoading ? (
              <span className="inline-block w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
            ) : audioStreaming ? (
              <>
                {/* Animated sound bars */}
                <span className="flex items-end gap-[2px] h-3">
                  <span className="w-[2px] bg-neon-green rounded-full" style={{height:'40%', animation:'audio-bar 0.6s ease-in-out infinite'}} />
                  <span className="w-[2px] bg-neon-green rounded-full" style={{height:'100%', animation:'audio-bar 0.6s ease-in-out infinite 0.1s'}} />
                  <span className="w-[2px] bg-neon-green rounded-full" style={{height:'60%', animation:'audio-bar 0.6s ease-in-out infinite 0.2s'}} />
                  <span className="w-[2px] bg-neon-green rounded-full" style={{height:'80%', animation:'audio-bar 0.6s ease-in-out infinite 0.3s'}} />
                </span>
                AUDIO ON
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M9 9a3 3 0 000 6" />
                </svg>
                AUDIO
              </>
            )}
          </button>
          <button 
            onClick={onClose}
            className="text-text-dim hover:text-holo-red transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>
      </div>

      <div className="w-full max-w-[360px] flex-1 flex flex-col items-center min-h-0">
        {/* Phone Frame */}
        <div className="relative w-full h-full max-h-full bg-black rounded-[2rem] border-[8px] border-glass-border shadow-[0_0_30px_rgba(0,212,255,0.1)] overflow-hidden flex items-center justify-center group shrink">
          
          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
              <div className="spinner mb-4 border-t-holo-cyan"></div>
              <p className="text-holo-cyan/70 font-[family-name:var(--font-mono)] text-xs tracking-widest animate-pulse">CONNECTING...</p>
            </div>
          )}

          {frame ? (
            <img 
              ref={imgRef}
              src={frame} 
              alt="Phone Mirror" 
              className="w-full h-full object-contain cursor-pointer select-none"
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              draggable={false}
            />
          ) : (
            <div className="text-text-dim opacity-30 font-[family-name:var(--font-mono)] text-xs tracking-widest">NO SIGNAL</div>
          )}

        </div>

        {/* Quick Developer Controls Grid */}
        <div className="w-full grid grid-cols-5 gap-1 mt-4 px-2 shrink-0">
          <button
            onClick={() => sendKey("volume_up")}
            title="Volume Up"
            className="py-2 bg-holo-cyan/5 hover:bg-holo-cyan/15 border border-holo-cyan/15 rounded-lg text-holo-cyan text-[10px] transition-colors font-[family-name:var(--font-mono)] active:bg-holo-cyan/20"
          >
            Vol+
          </button>
          <button
            onClick={() => sendKey("volume_down")}
            title="Volume Down"
            className="py-2 bg-holo-cyan/5 hover:bg-holo-cyan/15 border border-holo-cyan/15 rounded-lg text-holo-cyan text-[10px] transition-colors font-[family-name:var(--font-mono)] active:bg-holo-cyan/20"
          >
            Vol-
          </button>
          <button
            onClick={() => sendKey("power")}
            title="Power"
            className="py-2 bg-neon-red/5 hover:bg-neon-red/15 border border-neon-red/15 rounded-lg text-neon-red text-[10px] transition-colors font-[family-name:var(--font-mono)] active:bg-neon-red/20"
          >
            Power ⏻
          </button>
          <button
            onClick={async () => {
              await fetch(apiUrl('/phone/lock'), { method: 'POST' });
            }}
            title="Lock screen"
            className="py-2 bg-space-800 hover:bg-space-700 border border-glass-border rounded-lg text-text-secondary text-[10px] transition-colors font-[family-name:var(--font-mono)] active:bg-space-900"
          >
            Lock 🔒
          </button>
          <button
            onClick={async () => {
              await fetch(apiUrl('/phone/unlock'), { method: 'POST' });
            }}
            title="Unlock device"
            className="py-2 bg-holo-cyan/10 hover:bg-holo-cyan/20 border border-holo-cyan/30 rounded-lg text-holo-cyan text-[10px] transition-colors font-[family-name:var(--font-mono)] active:bg-holo-cyan/30"
          >
            Unlock 🔓
          </button>
        </div>

        {/* Navigation Buttons (Back, Home, Recents) */}
        <div className="w-full grid grid-cols-3 gap-2 mt-2 px-2 shrink-0">
          <button 
            onClick={() => sendKey("back")}
            className="py-2 bg-holo-cyan/10 hover:bg-holo-cyan/20 border border-holo-cyan/20 rounded-xl text-holo-cyan transition-colors active:bg-holo-cyan/30"
          >
            <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button 
            onClick={() => sendKey("home")}
            className="py-2 bg-holo-cyan/10 hover:bg-holo-cyan/20 border border-holo-cyan/20 rounded-xl text-holo-cyan transition-colors active:bg-holo-cyan/30"
          >
            <div className="w-5 h-5 rounded-full border-2 border-current mx-auto"></div>
          </button>
          <button 
            onClick={() => sendKey("recents")}
            className="py-2 bg-holo-cyan/10 hover:bg-holo-cyan/20 border border-holo-cyan/20 rounded-xl text-holo-cyan transition-colors active:bg-holo-cyan/30"
          >
            <div className="w-4 h-4 border-2 border-current rounded-sm mx-auto mt-0.5"></div>
          </button>
        </div>

        {/* Text Typist HUD Input */}
        <div className="w-full flex gap-2 mt-3 px-2 shrink-0">
          <input
            type="text"
            value={typeText}
            onChange={(e) => setTypeText(e.target.value)}
            placeholder="Type text on phone..."
            className="flex-1 bg-space-950 border border-glass-border rounded-xl px-3 py-2 text-xs text-text-primary focus:border-holo-cyan outline-none"
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && typeText) {
                await fetch(apiUrl('/phone/type'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: typeText })
                });
                setTypeText('');
              }
            }}
          />
          <button
            onClick={async () => {
              if (typeText) {
                await fetch(apiUrl('/phone/type'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ text: typeText })
                });
                setTypeText('');
              }
            }}
            className="px-4 py-2 rounded-xl bg-holo-cyan/15 border border-holo-cyan/30 text-holo-cyan text-xs font-[family-name:var(--font-display)] active:bg-holo-cyan/25"
          >
            Type
          </button>
        </div>

      </div>
    </div>
  );
}
