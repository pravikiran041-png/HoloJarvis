import { useState, useEffect, useRef } from 'react';
import { wsUrl } from '../apiConfig';

export function CameraMirror({ onClose }) {
  const [frame, setFrame] = useState(null);
  const [connected, setConnected] = useState(false);
  const [facing, setFacing] = useState('back'); // 'back' or 'front'
  const wsRef = useRef(null);

  useEffect(() => {
    let ws;
    let isMounted = true;

    const connectWs = () => {
      ws = new WebSocket(wsUrl('/ws/camera-stream'));
      wsRef.current = ws;

      ws.onopen = () => {
        if (isMounted) setConnected(true);
        // Request the current facing direction on start
        ws.send(JSON.stringify({ facing }));
      };

      ws.onmessage = (e) => {
        if (!isMounted) return;
        const data = JSON.parse(e.data);
        if (data.frame) {
          setFrame("data:image/jpeg;base64," + data.frame);
        } else if (data.error) {
          console.warn("Camera stream error:", data.error);
        }
      };

      ws.onclose = () => {
        if (isMounted) {
          setConnected(false);
          // Try to reconnect
          setTimeout(() => {
            if (isMounted) connectWs();
          }, 2000);
        }
      };
    };

    connectWs();

    return () => {
      isMounted = false;
      if (ws) ws.close();
    };
  }, []);

  const handleToggleFacing = () => {
    const newFacing = facing === 'back' ? 'front' : 'back';
    setFacing(newFacing);
    setFrame(null); // Clear frame while switching
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ facing: newFacing }));
    }
  };

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] max-w-full bg-space-900/95 border-l border-holo-cyan/20 backdrop-blur-xl shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col items-center pt-8 pb-4 px-4 z-40 animate-slide-in-right">
      
      {/* Header */}
      <div className="w-full flex justify-between items-center mb-4 px-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-neon-red animate-pulse shadow-[0_0_8px_#ff3366]"></span>
          <h2 className="font-[family-name:var(--font-display)] tracking-widest text-holo-cyan text-sm">
            SURVEILLANCE MODE
          </h2>
        </div>
        <button 
          onClick={onClose}
          className="text-text-dim hover:text-holo-red transition-colors text-xl leading-none"
        >
          ×
        </button>
      </div>

      {/* Main Stream Window */}
      <div className="w-full flex-1 flex flex-col items-center min-h-0 relative">
        <div className="relative w-full h-[75%] bg-black rounded-2xl border border-glass-border overflow-hidden flex items-center justify-center group shadow-[0_0_30px_rgba(0,212,255,0.05)]">
          
          {/* Cyberpunk HUD Frame overlays */}
          <div className="absolute top-2 left-2 border-t-2 border-l-2 border-holo-cyan/40 w-4 h-4 pointer-events-none"></div>
          <div className="absolute top-2 right-2 border-t-2 border-r-2 border-holo-cyan/40 w-4 h-4 pointer-events-none"></div>
          <div className="absolute bottom-2 left-2 border-b-2 border-l-2 border-holo-cyan/40 w-4 h-4 pointer-events-none"></div>
          <div className="absolute bottom-2 right-2 border-b-2 border-r-2 border-holo-cyan/40 w-4 h-4 pointer-events-none"></div>

          {/* Connection Overlay */}
          {!connected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-10">
              <div className="spinner mb-4 border-t-holo-cyan"></div>
              <p className="text-holo-cyan/70 font-[family-name:var(--font-mono)] text-xs tracking-widest animate-pulse">
                ACQUIRING FEED...
              </p>
            </div>
          )}

          {frame ? (
            <div className="relative w-full h-full">
              <img 
                src={frame} 
                alt="Camera Stream" 
                className="w-full h-full object-cover select-none"
                draggable={false}
              />
              {/* Scanline overlay for raw security camera aesthetic */}
              <div className="absolute inset-0 pointer-events-none bg-radial-glow opacity-30"></div>
            </div>
          ) : (
            <div className="text-text-dim opacity-40 font-[family-name:var(--font-mono)] text-xs tracking-widest animate-pulse">
              NO SIGNAL
            </div>
          )}

          {/* Active Facing Lens HUD display */}
          <div className="absolute bottom-4 left-4 bg-black/75 border border-glass-border px-3 py-1 rounded font-[family-name:var(--font-mono)] text-[10px] text-holo-cyan tracking-wider pointer-events-none">
            LENS: {facing.toUpperCase()}_CAM
          </div>
        </div>

        {/* Camera Controls Panel */}
        <div className="w-full flex-1 flex flex-col justify-center gap-3 px-2 mt-4 shrink-0">
          <button
            onClick={handleToggleFacing}
            disabled={!connected}
            className={`w-full py-3 border font-[family-name:var(--font-display)] text-xs tracking-wider rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
              facing === 'back' 
                ? 'bg-holo-cyan/10 border-holo-cyan/30 text-holo-cyan hover:bg-holo-cyan/20 active:bg-holo-cyan/35'
                : 'bg-holo-purple/10 border-holo-purple/30 text-holo-purple hover:bg-holo-purple/20 active:bg-holo-purple/35'
            } disabled:opacity-50`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 00-4-4H8m0 0l3 3m-3-3l3-3m9 14V5a2 2 0 00-2-2H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2z" />
            </svg>
            SWITCH TO {facing === 'back' ? 'FRONT CAMERA' : 'BACK CAMERA'}
          </button>

          <div className="bg-space-950/80 border border-glass-border rounded-xl p-3 text-center pointer-events-none">
            <p className="text-[10px] text-text-secondary font-[family-name:var(--font-mono)] leading-relaxed">
              * The device screen remains locked while streaming the remote camera feed. Safe and stealthy surveillance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
