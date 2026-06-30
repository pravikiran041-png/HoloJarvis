import { useState, useEffect, useRef, useCallback } from 'react';
import { FaceAuth, enrollFingerprint, isWebAuthnAvailable, getStoredCredential } from './components/FaceAuth';
import { PhoneMirror } from './components/PhoneMirror';
import { TicTacToe } from './components/TicTacToe';
import { RemoteControl } from './components/RemoteControl';
import { COMMAND_URL, apiUrl, wsUrl } from './apiConfig';

const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)', flag: '🇬🇧' },
  { code: 'hi-IN', label: 'Hindi (हिंदी)', flag: '🇮🇳' },
  { code: 'te-IN', label: 'Telugu (తెలుగు)', flag: '🇮🇳' },
  { code: 'ta-IN', label: 'Tamil (தமிழ்)', flag: '🇮🇳' },
  { code: 'es-ES', label: 'Spanish (Español)', flag: '🇪🇸' },
  { code: 'fr-FR', label: 'French (Français)', flag: '🇫🇷' },
  { code: 'de-DE', label: 'German (Deutsch)', flag: '🇩🇪' },
  { code: 'ar-SA', label: 'Arabic (العربية)', flag: '🇸🇦' },
  { code: 'zh-CN', label: 'Chinese (中文)', flag: '🇨🇳' }
];


// ─────────────────────────────────────────────
// JARVIS SYSTEM PROMPT
// ─────────────────────────────────────────────
const JARVIS_SYSTEM_PROMPT = `You are Jarvis, an intelligent AI assistant. 
You are calm, smart, slightly formal like Iron Man's Jarvis. 
Keep responses under 3 sentences. Never break character. Never mention being a language model.`;

// ─────────────────────────────────────────────
// FLOATING PARTICLES BACKGROUND
// ─────────────────────────────────────────────
function FloatingParticles() {
  const particles = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    x: `${Math.random() * 100}%`,
    duration: `${15 + Math.random() * 25}s`,
    delay: `${Math.random() * 20}s`,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            '--particle-x': p.x,
            '--particle-duration': p.duration,
            '--particle-delay': p.delay,
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TYPEWRITER TEXT
// ─────────────────────────────────────────────
function TypewriterText({ text, speed = 25 }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      {!done && (
        <span
          className="inline-block w-[2px] h-[14px] bg-holo-cyan ml-[2px] align-middle"
          style={{ animation: 'typewriter-cursor 0.8s step-end infinite' }}
        />
      )}
    </span>
  );
}

// ─────────────────────────────────────────────
// SETTINGS MODAL
// ─────────────────────────────────────────────
function SettingsModal({ show, onClose, apiKeys, setApiKeys }) {
  const [local, setLocal] = useState(apiKeys);

  useEffect(() => {
    setLocal(apiKeys);
  }, [apiKeys]);

  if (!show) return null;

  const handleSave = () => {
    setApiKeys(local);
    localStorage.setItem('holojarvis_keys', JSON.stringify(local));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center settings-overlay bg-black/70" onClick={onClose}>
      <div
        className="glass rounded-2xl p-8 w-full max-w-lg mx-4 animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-[family-name:var(--font-display)] text-xl text-holo-cyan text-glow-cyan tracking-wider">
            SYSTEM CONFIGURATION
          </h2>
          <button onClick={onClose} className="text-text-dim hover:text-text-primary transition-colors text-2xl leading-none">
            ×
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm text-text-secondary mb-2 font-[family-name:var(--font-display)] tracking-wide text-xs">
              GROQ API KEY
            </label>
            <input
              type="password"
              className="settings-input w-full px-4 py-3 rounded-lg text-sm"
              placeholder="gsk_..."
              value={local.groq || ''}
              onChange={(e) => setLocal({ ...local, groq: e.target.value })}
            />
            <p className="text-text-dim text-xs mt-1">Required for Llama 3.3 70B intelligence engine</p>
          </div>
          
          <div className="pt-4 border-t border-glass-border">
            <h3 className="font-[family-name:var(--font-display)] tracking-wide text-xs text-holo-cyan mb-4">PHONE & SECURITY</h3>
            <div className="flex gap-3">
              <button
                onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('start-face-enroll')); }}
                className="flex-1 py-3 rounded-lg font-[family-name:var(--font-display)] text-xs tracking-wider border border-holo-cyan/30 text-holo-cyan hover:bg-holo-cyan/10 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" /></svg>
                ENROLL FACE
              </button>
              <button
                onClick={async () => {
                  const avail = await isWebAuthnAvailable();
                  if (!avail) { alert('Touch ID / fingerprint sensor not available on this device.'); return; }
                  onClose();
                  window.dispatchEvent(new CustomEvent('start-fingerprint-enroll'));
                }}
                className="flex-1 py-3 rounded-lg font-[family-name:var(--font-display)] text-xs tracking-wider border border-holo-purple/30 text-holo-purple hover:bg-holo-purple/10 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.288 7.212M12 10.5a3 3 0 00-5.974.538" /></svg>
                ENROLL TOUCH ID
              </button>
            </div>
            <p className="text-text-dim text-xs mt-2">Enroll face or fingerprint for secure phone access</p>
            <div className="flex gap-3 mt-2">
              <span className={`text-[10px] font-[family-name:var(--font-mono)] tracking-wider ${localStorage.getItem('jarvis_owner_face') ? 'text-neon-green' : 'text-text-dim'}`}>
                ● FACE {localStorage.getItem('jarvis_owner_face') ? 'ENROLLED' : 'NOT SET'}
              </span>
              <span className={`text-[10px] font-[family-name:var(--font-mono)] tracking-wider ${getStoredCredential() ? 'text-neon-green' : 'text-text-dim'}`}>
                ● TOUCH ID {getStoredCredential() ? 'ENROLLED' : 'NOT SET'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-lg font-[family-name:var(--font-display)] text-sm tracking-wider
                       bg-gradient-to-r from-holo-cyan/20 to-holo-purple/20
                       border border-holo-cyan/30 text-holo-cyan
                       hover:from-holo-cyan/30 hover:to-holo-purple/30 hover:border-holo-cyan/50
                       transition-all duration-300 cursor-pointer"
          >
            SAVE & INITIALIZE
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-lg text-text-dim hover:text-text-secondary transition-colors text-sm cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// JARVIS AVATAR (Enhanced with state-based colors)
// ─────────────────────────────────────────────
function JarvisAvatar({ isSpeaking, isProcessing, isListening }) {
  const stateClass = isSpeaking ? 'speaking' : isListening ? 'listening' : isProcessing ? 'speaking' : '';
  const active = isSpeaking || isProcessing || isListening;

  // Generate avatar-local floating particles
  const localParticles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    radius: `${100 + Math.random() * 50}px`,
    duration: `${4 + Math.random() * 6}s`,
    delay: `${Math.random() * 5}s`,
    startAngle: `${Math.random() * 360}deg`,
    size: `${2 + Math.random() * 2}px`,
    opacity: 0.3 + Math.random() * 0.4,
    color: isListening
      ? `rgba(0, 255, 136, ${0.3 + Math.random() * 0.4})`
      : `rgba(0, 212, 255, ${0.3 + Math.random() * 0.4})`,
  }));

  return (
    <div className="avatar-container mx-auto">
      {/* Outward-pulsing rings */}
      <div className={`avatar-pulse-ring ${stateClass}`} />
      <div className={`avatar-pulse-ring ${stateClass}`} style={{ animationDelay: '1s' }} />
      <div className={`avatar-pulse-ring ${stateClass}`} style={{ animationDelay: '2s' }} />

      {/* Outer dashed ring */}
      <div className={`avatar-outer-ring ${stateClass}`} />

      {/* Middle ring */}
      <div className={`avatar-middle-ring ${stateClass}`} />

      {/* Glow ring */}
      <div className={`avatar-glow-ring ${stateClass}`} />

      {/* Scanline overlay on avatar */}
      <div className={`avatar-scanline-overlay ${stateClass}`} />

      {/* Core */}
      <div className={`avatar-core ${stateClass}`}>
        {/* Waveform bars */}
        <div className="flex items-center gap-[3px]">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className={`waveform-bar ${active ? 'active' : ''} ${isListening ? 'listening-bar' : ''}`}
              style={{
                '--bar-speed': active ? `${0.3 + Math.random() * 0.4}s` : '2s',
                '--bar-delay': `${i * 0.1}s`,
                height: active ? '40px' : '20px',
              }}
            />
          ))}
        </div>
      </div>

      {/* Avatar-local glowing particles */}
      {localParticles.map((p) => (
        <div
          key={p.id}
          className="avatar-local-particle"
          style={{
            '--ap-radius': p.radius,
            '--ap-duration': p.duration,
            '--ap-delay': p.delay,
            '--ap-start': p.startAngle,
            '--ap-size': p.size,
            '--ap-opacity': p.opacity,
            '--ap-color': p.color,
          }}
        />
      ))}

      {/* Orbital dots */}
      {[
        { radius: '125px', duration: '6s', color: isListening ? '#00ff88' : '#00d4ff' },
        { radius: '110px', duration: '8s', color: '#7c3aed' },
        { radius: '95px', duration: '10s', color: isListening ? '#00cc6a' : '#3b82f6' },
      ].map((orb, i) => (
        <div
          key={i}
          className={`avatar-orbital ${stateClass}`}
          style={{
            '--orbit-radius': orb.radius,
            '--orbit-duration': active ? `${parseFloat(orb.duration) / 2.5}s` : orb.duration,
            background: orb.color,
            boxShadow: `0 0 ${active ? '25px' : '10px'} ${orb.color}`,
            width: active ? '10px' : '8px',
            height: active ? '10px' : '8px',
            margin: active ? '-5px 0 0 -5px' : '-4px 0 0 -4px',
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// CONVERSATION PANEL (with typewriter effect)
// ─────────────────────────────────────────────
function ConversationPanel({ messages, isProcessing }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  if (messages.length === 0 && !isProcessing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-text-dim text-sm font-[family-name:var(--font-display)] tracking-widest opacity-40 text-center px-4">
          AWAITING VOCAL INPUT
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto conversation-scroll px-4 py-4 space-y-3">
      {messages.map((msg, i) => {
        const isLastJarvis = msg.role === 'assistant' && i === messages.length - 1;
        return (
          <div
            key={i}
            className={`animate-fade-in-up ${
              msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'
            }`}
            style={{ animationDelay: `${Math.min(i * 0.05, 0.3)}s` }}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'message-user rounded-br-sm'
                  : 'message-jarvis rounded-bl-sm'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`font-[family-name:var(--font-display)] text-[10px] tracking-widest ${
                    msg.role === 'user' ? 'text-holo-blue' : 'text-holo-cyan'
                  }`}
                >
                  {msg.role === 'user' ? 'YOU' : 'JARVIS'}
                </span>
                <span className="text-text-dim text-[10px]">{msg.time}</span>
              </div>
              <p className="text-text-primary">
                {isLastJarvis ? (
                  <TypewriterText text={msg.content} speed={20} />
                ) : (
                  msg.content
                )}
              </p>
            </div>
          </div>
        );
      })}

      {isProcessing && (
        <div className="flex justify-start animate-fade-in-up">
          <div className="message-jarvis px-4 py-3 rounded-xl rounded-bl-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-[family-name:var(--font-display)] text-[10px] tracking-widest text-holo-cyan">
                JARVIS
              </span>
            </div>
            <div className="flex items-center gap-1.5 py-1">
              <div className="typing-dot" style={{ animationDelay: '0s' }} />
              <div className="typing-dot" style={{ animationDelay: '0.2s' }} />
              <div className="typing-dot" style={{ animationDelay: '0.4s' }} />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

// ─────────────────────────────────────────────
// MIC BUTTON
// ─────────────────────────────────────────────
function MicButton({ isListening, isProcessing, isSpeaking, onClick }) {
  const disabled = isProcessing || isSpeaking;

  const getIcon = () => {
    if (isProcessing) {
      return <div className="spinner" />;
    }
    if (isListening) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        </svg>
      );
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" x2="12" y1="19" y2="22" />
      </svg>
    );
  };

  return (
    <button
      id="mic-button"
      onClick={onClick}
      disabled={disabled}
      className={`mic-btn w-16 h-16 rounded-full flex items-center justify-center
                   transition-all duration-300 cursor-pointer
                   ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
                   ${isListening
                     ? 'recording bg-gradient-to-br from-neon-green to-emerald-500 text-black border border-neon-green/50'
                     : 'bg-gradient-to-br from-holo-cyan/20 to-holo-purple/20 border border-holo-cyan/30 text-holo-cyan hover:border-holo-cyan/60'
                   }`}
    >
      {getIcon()}
    </button>
  );
}

// ─────────────────────────────────────────────
// STATUS BAR
// ─────────────────────────────────────────────
function StatusBar({ status, keysConfigured }) {
  return (
    <div className="flex items-center justify-between px-6 py-2 text-[10px] font-[family-name:var(--font-mono)] text-text-dim border-t border-glass-border">
      <div className="flex items-center gap-2">
        <div className={`status-dot ${keysConfigured ? 'bg-neon-green' : 'bg-neon-orange'}`} />
        <span>{keysConfigured ? 'SYSTEMS ONLINE' : 'CONFIG REQUIRED'}</span>
      </div>
      <span className="text-text-dim/50">{status}</span>
      <span className="text-holo-cyan/30">HOLOJARVIS v2.0</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// HUD OVERLAY DECORATIONS
// ─────────────────────────────────────────────
function HudOverlay() {
  return (
    <>
      {/* Corner brackets */}
      <div className="hud-corner hud-corner-tl" />
      <div className="hud-corner hud-corner-tr" />
      <div className="hud-corner hud-corner-bl" />
      <div className="hud-corner hud-corner-br" />

      {/* JARVIS OS watermark */}
      <div className="jarvis-os-watermark hidden sm:block">JARVIS OS v1.0</div>

      {/* System version in top-right */}
      <div className="jarvis-os-corner hidden sm:block">
        SYS.ACTIVE // NEURAL.LINK
      </div>

      {/* Left Side: Founder & ROK Systems Watermark */}
      <div className="fixed left-4 lg:left-8 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-0 select-none opacity-20 mix-blend-screen hidden md:flex">
        <div className="text-holo-cyan font-[family-name:var(--font-display)] tracking-[0.4em] text-2xl lg:text-3xl uppercase whitespace-nowrap drop-shadow-[0_0_15px_rgba(0,212,255,0.4)]" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          FOUNDER RAVIKIRAN
        </div>
        <div className="mt-6 text-[8px] font-[family-name:var(--font-mono)] tracking-[0.25em] text-holo-cyan/80 uppercase whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          ROK ENGINE v3.8.4 // COGNITIVE
        </div>
        <div className="mt-8 text-[7px] font-[family-name:var(--font-mono)] tracking-[0.2em] text-text-dim uppercase whitespace-nowrap" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
          "THE FUTURE IS SHAPED BY THOSE WHO BUILD IT"
        </div>
      </div>

      {/* Right Side: Jarvis & Neural Integration Watermark */}
      <div className="fixed right-4 lg:right-8 top-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-none z-0 select-none opacity-20 mix-blend-screen hidden md:flex">
        <div className="text-holo-purple font-[family-name:var(--font-display)] tracking-[0.4em] text-2xl lg:text-3xl uppercase whitespace-nowrap drop-shadow-[0_0_15px_rgba(124,58,237,0.4)]" style={{ writingMode: 'vertical-rl' }}>
          JARVIS INTELLIGENCE
        </div>
        <div className="mt-6 text-[8px] font-[family-name:var(--font-mono)] tracking-[0.25em] text-holo-purple/80 uppercase whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
          NEURAL PROTOCOLS ACTIVE // v2.0
        </div>
        <div className="mt-8 text-[7px] font-[family-name:var(--font-mono)] tracking-[0.2em] text-text-dim uppercase whitespace-nowrap" style={{ writingMode: 'vertical-rl' }}>
          "ALWAYS AT YOUR SERVICE, SIR"
        </div>
      </div>

      {/* Top Center: Systems Status Bar */}
      <div className="fixed top-20 left-1/2 -translate-x-1/2 pointer-events-none z-0 select-none opacity-15 flex items-center gap-8 font-[family-name:var(--font-mono)] text-[8px] tracking-[0.3em] text-holo-cyan uppercase whitespace-nowrap hidden lg:flex">
        <span>SYS.STATUS: ONLINE</span>
        <span className="text-holo-cyan/40">•</span>
        <span>"PROTOCOL INITIATED. STANDBY FOR VOCAL INSTRUCTIONS."</span>
        <span className="text-holo-cyan/40">•</span>
        <span>HOST: LOCALHOST</span>
      </div>

      {/* Bottom Center: System Philosophy Bar */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 pointer-events-none z-0 select-none opacity-15 flex items-center gap-8 font-[family-name:var(--font-mono)] text-[8px] tracking-[0.3em] text-holo-purple uppercase whitespace-nowrap hidden lg:flex">
        <span>USER: ROK</span>
        <span className="text-holo-purple/40">•</span>
        <span>"THE ONLY LIMIT IS THE ONE YOU ACCEPT"</span>
        <span className="text-holo-purple/40">•</span>
        <span>LINK TYPE: ENCRYPTED // TAILSCALE</span>
      </div>

      <TicTacToe />
    </>
  );
}

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  // ── State ──
  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('holojarvis_keys');
      return saved ? JSON.parse(saved) : { groq: '' };
    } catch {
      return { groq: '' };
    }
  });

  const [messages, setMessages] = useState([]);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState('STANDBY');
  const [holoMode, setHoloMode] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  
  // Phone/Face Auth state
  const [showPhoneMirror, setShowPhoneMirror] = useState(false);
  const [faceAuthMode, setFaceAuthMode] = useState(null); // 'enroll', 'verify', or null
  const [showWirelessSetupButton, setShowWirelessSetupButton] = useState(false);

  const [selectedLanguage, setSelectedLanguage] = useState('en-US');

  const [isRemoteMode] = useState(() => {
    const mobile = window.innerWidth < 768;
    const remote = !['localhost', '127.0.0.1'].includes(window.location.hostname);
    return mobile && remote;
  });

  useEffect(() => {
    const handleEnroll = () => setFaceAuthMode('enroll');
    window.addEventListener('start-face-enroll', handleEnroll);
    return () => window.removeEventListener('start-face-enroll', handleEnroll);
  }, []);

  // Fingerprint enrollment: use the FaceAuth component's built-in fingerprint flow
  useEffect(() => {
    const handleFingerprintEnroll = async () => {
      try {
        await enrollFingerprint();
        addMessage('assistant', 'Fingerprint enrolled successfully, Sir. You can now use Touch ID for authentication.');
      } catch (err) {
        console.error('Fingerprint enrollment error:', err);
        addMessage('assistant', 'Fingerprint enrollment was cancelled or failed, Sir.');
      }
    };
    window.addEventListener('start-fingerprint-enroll', handleFingerprintEnroll);
    return () => window.removeEventListener('start-fingerprint-enroll', handleFingerprintEnroll);
  }, []);

  const recognitionRef = useRef(null);
  const keysConfigured = !!apiKeys.groq;

  // ── Helpers ──
  const getTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const addMessage = useCallback((role, content) => {
    setMessages((prev) => [...prev, { role, content, time: getTimestamp() }]);
  }, []);

  // ── Audio ref for Edge-TTS playback ──
  const audioRef = useRef(null);

  // ── Speech Synthesis (Speak) — Edge-TTS first, browser fallback ──
  const speakResponse = useCallback((text, audioBase64) => {
    return new Promise((resolve) => {
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        setIsSpeaking(false);
        setStatus('STANDBY');
        resolve();
      };

      // Try Edge-TTS audio first
      if (audioBase64) {
        try {
          if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
          }
          const audio = new Audio('data:audio/mp3;base64,' + audioBase64);
          audioRef.current = audio;
          setIsSpeaking(true);
          setStatus('VOCALIZING...');
          audio.onended = done;
          audio.onerror = (e) => { console.error('Audio error:', e); done(); };
          audio.play().catch(() => done());
          return;
        } catch (e) {
          console.warn('Edge-TTS playback failed, falling back:', e);
        }
      }

      // Fallback: browser speechSynthesis
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const premiumVoice = voices.find(
        (v) => v.lang.startsWith('en') &&
          (v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Natural'))
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (premiumVoice) utterance.voice = premiumVoice;
      utterance.rate = 1.0;
      utterance.pitch = 0.95;
      utterance.onstart = () => { setIsSpeaking(true); setStatus('VOCALIZING...'); };
      utterance.onend = done;
      utterance.onerror = () => done();
      const timeoutMs = Math.max(8000, text.length * 80);
      setTimeout(() => { if (!resolved) { window.speechSynthesis.cancel(); done(); } }, timeoutMs);
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  // Ensure voices are loaded (fallback)
  useEffect(() => {
    const handleVoicesChanged = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
    handleVoicesChanged();
    return () => window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
  }, []);

  const handleWirelessSetup = useCallback(async () => {
    setShowWirelessSetupButton(false);
    const setupMessage = 'Please connect USB cable Sir, setting up wireless connection';
    addMessage('assistant', setupMessage);
    await speakResponse(setupMessage);
    try {
      await fetch(apiUrl('/phone/setup-tcp'), { method: 'POST' });
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const connectRes = await fetch(apiUrl('/phone/connect'), { method: 'POST' });
      const connectData = await connectRes.json();
      if (connectData.success) {
        const okMsg = 'Wireless connection ready Sir';
        addMessage('assistant', okMsg);
        await speakResponse(okMsg);
      } else {
        const failMsg = connectData.message || 'Wireless setup failed, Sir.';
        addMessage('assistant', failMsg);
      }
    } catch (err) {
      addMessage('assistant', 'Wireless setup failed, Sir. Please check USB cable and try again.');
    }
  }, [addMessage, speakResponse]);

  // ── Call Jarvis Backend Command API ──
  const askJarvis = useCallback(async (userText) => {
    setStatus('NEURAL PROCESSING...');

    const res = await fetch(COMMAND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.groq}`,
      },
      body: JSON.stringify({
        command: userText,
        pending_action: pendingAction,
        language: selectedLanguage,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Server error: ${err}`);
    }

    const data = await res.json();
    
    if (data.status === 'needs_confirmation') {
      setPendingAction(data.pending_action);
    } else {
      setPendingAction(null);
    }
    
    // Intercept phone commands from backend
    if (data.action === 'show_phone') {
      setFaceAuthMode('verify');
    } else if (data.action === 'hide_phone') {
      setShowPhoneMirror(false);
    } else if (data.action === 'tic_tac_toe') {
      window.dispatchEvent(new CustomEvent('jarvis_ttt_move', { detail: data.position }));
    }

    return { reply: data.reply, audio: data.audio || null };
  }, [apiKeys.groq, pendingAction, selectedLanguage]);

  // ── Web Speech API Recognition Setup ──
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API is not supported in this browser.');
      setStatus('WEB SPEECH NOT SUPPORTED');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = selectedLanguage;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('AUDIO CAPTURE ACTIVE');
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        setStatus('MIC ACCESS DENIED');
        addMessage('assistant', 'I apologize, Sir. Microphone access was denied. Please check your browser permissions.');
      } else {
        setStatus('RECOGNITION ERROR');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.onresult = async (event) => {
      const transcript = event.results[0][0].transcript;
      if (!transcript || !transcript.trim()) {
        setStatus('STANDBY');
        return;
      }

      addMessage('user', transcript);
      setIsProcessing(true);

      try {
        const result = await askJarvis(transcript);
        addMessage('assistant', result.reply);
        setIsProcessing(false);

        await speakResponse(result.reply, result.audio);
      } catch (err) {
        console.error('Pipeline error:', err);
        setIsProcessing(false);
        setStatus('SYSTEM FAULT');
        addMessage('assistant', `Forgive me, Sir. I was unable to complete the query. ${err.message}`);
      }
    };

    recognitionRef.current = recognition;
  }, [selectedLanguage, askJarvis, speakResponse, addMessage]);

  // ── Main Controller ──
  const handleMicClick = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) {
      addMessage('assistant', 'Speech Recognition is unavailable in this environment, Sir.');
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      window.speechSynthesis.cancel();
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setIsSpeaking(false);

      try {
        recognition.start();
      } catch (err) {
        console.error('Error starting recognition:', err);
      }
    }
  }, [isListening, addMessage]);

  // ── Chat Bar State ──
  const [chatInput, setChatInput] = useState('');

  const handleChatSubmit = useCallback(async (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || isProcessing || isSpeaking) return;

    setChatInput('');
    addMessage('user', text);
    setIsProcessing(true);

    try {
      const result = await askJarvis(text);
      addMessage('assistant', result.reply);
      setIsProcessing(false);
      await speakResponse(result.reply, result.audio);
    } catch (err) {
      console.error('Chat error:', err);
      setIsProcessing(false);
      setStatus('SYSTEM FAULT');
      addMessage('assistant', `Forgive me, Sir. ${err.message}`);
    }
  }, [chatInput, isProcessing, isSpeaking, askJarvis, speakResponse, addMessage]);

  if (isRemoteMode) {
    return <RemoteControl apiKeys={apiKeys} />;
  }

  return (
    <div className="h-full w-full flex flex-col bg-space-900 bg-grid bg-radial-glow scanlines relative overflow-hidden">
      <FloatingParticles />
      <HudOverlay />

      {/* ── Header ── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-glass-border">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
            isListening
              ? 'bg-neon-green shadow-[0_0_12px_rgba(0,255,136,0.7)]'
              : isSpeaking
              ? 'bg-holo-cyan shadow-[0_0_12px_rgba(0,212,255,0.7)]'
              : 'bg-holo-cyan shadow-[0_0_10px_rgba(0,212,255,0.5)]'
          }`} />
          <h1 className="font-[family-name:var(--font-display)] text-lg tracking-[0.3em] text-holo-cyan text-glow-cyan">
            HOLOJARVIS
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-text-dim text-[10px] font-[family-name:var(--font-mono)] hidden sm:block opacity-60">
            JARVIS OS v1.0
          </span>
          <button
            id="holo-mode-button"
            onClick={() => setHoloMode(!holoMode)}
            className={`text-[10px] font-[family-name:var(--font-display)] tracking-wider px-3 py-1.5 rounded-md border transition-all duration-300 cursor-pointer ${
              holoMode
                ? 'bg-holo-cyan/20 border-holo-cyan/50 text-holo-cyan text-glow-cyan'
                : 'bg-transparent border-glass-border text-text-dim hover:border-holo-cyan/30 hover:text-holo-cyan'
            }`}
            title="Toggle Hologram Mode"
          >
            {holoMode ? '◈ HOLO ON' : '◇ HOLO'}
          </button>
          <select
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="text-[10px] font-[family-name:var(--font-mono)] bg-space-950/80 border border-glass-border rounded-md px-2 py-1.5 text-holo-cyan outline-none hover:border-holo-cyan/50 focus:border-holo-cyan transition-all cursor-pointer mr-1"
            title="Select Jarvis Language"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code} className="bg-space-950 text-text-primary">
                {lang.flag} {lang.label}
              </option>
            ))}
          </select>
          <button
            id="settings-button"
            onClick={() => setShowSettings(true)}
            className="text-text-dim hover:text-holo-cyan transition-colors cursor-pointer p-2"
            title="Settings"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      {holoMode ? (
        /* ═══ HOLOGRAM MODE ═══ */
        <main className="relative z-10 flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-0 relative">
            {/* Quadrant divider lines */}
            <div className="absolute inset-0 pointer-events-none z-20">
              <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-holo-cyan/20 to-transparent" />
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-holo-cyan/20 to-transparent" />
            </div>

            {/* Top-Left: Normal (0°) */}
            <div className="flex items-center justify-center relative">
              <div style={{ transform: 'scale(0.65)' }}>
                <JarvisAvatar isSpeaking={isSpeaking} isProcessing={isProcessing} isListening={isListening} />
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[8px] tracking-widest text-holo-cyan/30">FRONT · 0°</span>
            </div>

            {/* Top-Right: Rotated 270° */}
            <div className="flex items-center justify-center relative">
              <div style={{ transform: 'scale(0.65) rotate(270deg)' }}>
                <JarvisAvatar isSpeaking={isSpeaking} isProcessing={isProcessing} isListening={isListening} />
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[8px] tracking-widest text-holo-purple/30">RIGHT · 270°</span>
            </div>

            {/* Bottom-Left: Rotated 90° */}
            <div className="flex items-center justify-center relative">
              <div style={{ transform: 'scale(0.65) rotate(90deg)' }}>
                <JarvisAvatar isSpeaking={isSpeaking} isProcessing={isProcessing} isListening={isListening} />
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[8px] tracking-widest text-holo-purple/30">LEFT · 90°</span>
            </div>

            {/* Bottom-Right: Flipped 180° */}
            <div className="flex items-center justify-center relative">
              <div style={{ transform: 'scale(0.65) rotate(180deg)' }}>
                <JarvisAvatar isSpeaking={isSpeaking} isProcessing={isProcessing} isListening={isListening} />
              </div>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 font-[family-name:var(--font-mono)] text-[8px] tracking-widest text-holo-cyan/30">REAR · 180°</span>
            </div>
          </div>

          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
            <div className="bg-black/70 backdrop-blur-sm px-4 py-2 rounded-lg border border-holo-cyan/15">
              <p className={`font-[family-name:var(--font-display)] text-[10px] tracking-[0.4em] ${
                isListening ? 'text-neon-green text-glow-green'
                : pendingAction ? 'text-neon-orange text-glow-orange animate-pulse'
                : isSpeaking ? 'text-holo-cyan text-glow-cyan'
                : 'text-text-dim'
              }`}>
                {isProcessing ? '◈ ANALYZING ◈'
                  : isSpeaking ? '◈ SPEAKING ◈'
                  : isListening ? '◈ LISTENING ◈'
                  : pendingAction ? '◈ AWAITING CONFIRMATION ◈'
                  : 'HOLOGRAM PROJECTION'}
              </p>
            </div>
          </div>

          {/* Bottom controls overlay */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-4 z-30">
            <MicButton
              isListening={isListening}
              isProcessing={isProcessing}
              isSpeaking={isSpeaking}
              onClick={handleMicClick}
            />
            <button
              onClick={() => setHoloMode(false)}
              className="px-4 py-2 rounded-lg font-[family-name:var(--font-display)] text-[10px] tracking-wider
                         bg-black/60 backdrop-blur-sm border border-neon-red/30 text-neon-red
                         hover:border-neon-red/60 hover:bg-neon-red/10
                         transition-all duration-300 cursor-pointer"
            >
              EXIT HOLO
            </button>
          </div>
        </main>
      ) : (
        /* ═══ NORMAL MODE ═══ */
        <main className="relative z-10 flex-1 flex flex-col items-center overflow-hidden">
          {/* Avatar Section */}
          <div className="flex-shrink-0 py-8 sm:py-10">
            <JarvisAvatar isSpeaking={isSpeaking} isProcessing={isProcessing} isListening={isListening} />

            {/* State badge */}
            <div className="text-center mt-6">
              <p className={`font-[family-name:var(--font-display)] text-[10px] tracking-[0.5em] transition-colors duration-500 ${
                isListening
                  ? 'text-neon-green text-glow-green'
                  : pendingAction
                  ? 'text-neon-orange text-glow-orange animate-pulse'
                  : isSpeaking
                  ? 'text-holo-cyan text-glow-cyan'
                  : 'text-text-dim'
              }`}>
                {isProcessing
                  ? '◈ ANALYZING ◈'
                  : isSpeaking
                  ? '◈ SPEAKING ◈'
                  : isListening
                  ? '◈ LISTENING ◈'
                  : pendingAction
                  ? '◈ AWAITING CONFIRMATION ◈'
                  : '◇ READY ◇'}
              </p>
            </div>
          </div>

          {/* Conversation */}
          <div className="flex-1 w-full max-w-2xl overflow-hidden flex flex-col px-2">
            <ConversationPanel messages={messages} isProcessing={isProcessing} />
          </div>

          {/* Mic Button + Chat Bar */}
          <div className="flex-shrink-0 py-4 flex flex-col items-center gap-3 w-full max-w-2xl mx-auto px-4">
            <div className="flex items-center gap-3 w-full">
              {/* Chat Input */}
              <form onSubmit={handleChatSubmit} className="flex-1 flex">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a command..."
                  disabled={isProcessing || isSpeaking}
                  className="flex-1 bg-space-800/60 border border-holo-cyan/20 rounded-l-xl px-4 py-3 text-sm text-text-primary placeholder-text-dim/40 font-[family-name:var(--font-mono)] outline-none focus:border-holo-cyan/60 focus:shadow-[0_0_15px_rgba(0,212,255,0.1)] transition-all backdrop-blur-sm disabled:opacity-40"
                />
                <button
                  type="submit"
                  disabled={isProcessing || isSpeaking || !chatInput.trim()}
                  className="bg-holo-cyan/15 border border-holo-cyan/30 border-l-0 rounded-r-xl px-4 text-holo-cyan hover:bg-holo-cyan/25 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  </svg>
                </button>
              </form>
              {/* Mic Button */}
              <MicButton
                isListening={isListening}
                isProcessing={isProcessing}
                isSpeaking={isSpeaking}
                onClick={handleMicClick}
              />
            </div>
            <p className="text-text-dim text-[10px] font-[family-name:var(--font-mono)] tracking-wider">
              {isListening
                ? 'LISTENING... TAP TO ABORT'
                : isProcessing
                ? 'NEURAL PROCESSING...'
                : isSpeaking
                ? 'JARVIS VOCALIZING'
                : 'TYPE OR TAP MIC TO CONVERSE'}
            </p>
          </div>
        </main>
      )}

      {/* ── Status Bar ── */}
      <StatusBar status={status} keysConfigured={keysConfigured} />

      {/* ── Settings Modal ── */}
      <SettingsModal
        show={showSettings}
        onClose={() => setShowSettings(false)}
        apiKeys={apiKeys}
        setApiKeys={setApiKeys}
      />
      
      {/* ── Security & Phone Integrations ── */}
      {faceAuthMode && (
        <FaceAuth 
          mode={faceAuthMode}
          onClose={() => setFaceAuthMode(null)}
          onSuccess={async () => {
            if (faceAuthMode === 'verify') {
              setFaceAuthMode(null);
              // Wireless connect → wake → unlock → then open mirror
              addMessage('assistant', 'Connecting to your phone, Sir...');
              try {
                const res = await fetch(apiUrl('/phone/show'), { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                  addMessage('assistant', data.message || 'Phone ready, Sir.');
                  setShowWirelessSetupButton(false);
                  setShowPhoneMirror(true);
                } else {
                  addMessage('assistant', data.message || 'Phone not reachable, Sir. Make sure Tailscale is running.');
                  setShowWirelessSetupButton(true);
                }
              } catch (err) {
                addMessage('assistant', 'Failed to connect to phone, Sir. Check your network.');
                setShowWirelessSetupButton(true);
              }
            } else {
              setFaceAuthMode(null);
            }
          }}
          onFail={() => setFaceAuthMode(null)}
        />
      )}
      
      {showPhoneMirror && (
        <PhoneMirror onClose={() => setShowPhoneMirror(false)} />
      )}

      {showWirelessSetupButton && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={handleWirelessSetup}
            className="px-4 py-2 bg-neon-orange/20 border border-neon-orange text-neon-orange hover:bg-neon-orange/30 rounded-lg text-xs font-[family-name:var(--font-display)] tracking-wider transition-all"
          >
            Re-setup wireless
          </button>
        </div>
      )}

    </div>
  );
}
