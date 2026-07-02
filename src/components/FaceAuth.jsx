import { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';

// ── Fingerprint / WebAuthn helpers ──
const WEBAUTHN_RP = { name: 'JARVIS OS', id: window.location.hostname || 'localhost' };
const CREDENTIAL_KEY = 'jarvis_fingerprint_credential';

async function isWebAuthnAvailable() {
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch { return false; }
}

function getStoredCredential() {
  try {
    const raw = localStorage.getItem(CREDENTIAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function enrollFingerprint() {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: WEBAUTHN_RP,
      user: { id: userId, name: 'jarvis-owner', displayName: 'JARVIS Owner' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred'
      },
      timeout: 60000,
      attestation: 'none'
    }
  });

  const stored = {
    credentialId: base64urlEncode(credential.rawId),
    type: credential.type,
    enrolled: Date.now()
  };
  localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(stored));
  return stored;
}

async function verifyFingerprint() {
  const stored = getStoredCredential();
  if (!stored) throw new Error('No fingerprint enrolled');

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{
        id: base64urlDecode(stored.credentialId),
        type: 'public-key',
        transports: ['internal']
      }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return true;
}

// ── Main Component ──
export function FaceAuth({ 
  mode, // 'enroll' or 'verify'
  onSuccess, 
  onFail,
  onClose
}) {
  const videoRef = useRef();
  const captureIntervalRef = useRef(null);
  const verifyIntervalRef = useRef(null);
  const [status, setStatus] = useState('Initializing...');
  const [progress, setProgress] = useState(0);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [result, setResult] = useState(null); // 'success' or 'fail'
  const [authMethod, setAuthMethod] = useState(null); // 'face', 'fingerprint', or null
  const [fingerprintAvailable, setFingerprintAvailable] = useState(false);
  const [faceEnrolled, setFaceEnrolled] = useState(false);
  const [fingerprintEnrolled, setFingerprintEnrolled] = useState(false);
  const [dualAuthStep, setDualAuthStep] = useState(null); // null, 'face', 'fingerprint', 'done'
  const [requiresBoth, setRequiresBoth] = useState(false);
  
  // Check what's available on mount
  useEffect(() => {
    setFaceEnrolled(!!localStorage.getItem('jarvis_owner_face'));
    setFingerprintEnrolled(!!getStoredCredential());
    isWebAuthnAvailable().then(setFingerprintAvailable);
  }, []);

  // If enrolling, go straight to face method
  // If verifying, determine if dual auth is needed
  useEffect(() => {
    if (mode === 'enroll') {
      setAuthMethod('face');
    }
  }, [mode]);



  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (verifyIntervalRef.current) clearInterval(verifyIntervalRef.current);
      stopVideo();
    };
  }, []);

  // Load face models when face auth is selected
  useEffect(() => {
    if (authMethod !== 'face') return;
    let isMounted = true;
    setStatus('Loading AI Models...');
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        if (isMounted) {
          setModelsLoaded(true);
          setStatus(mode === 'enroll' ? 'Starting Camera...' : 'Initializing Scanner...');
          startVideo();
        }
      } catch (err) {
        console.error('Model load error:', err);
        if (isMounted) setStatus('Error loading Face AI models');
      }
    };
    loadModels();
    return () => { isMounted = false; };
  }, [mode, authMethod]);

  const startVideo = () => {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error('Webcam error:', err);
        setStatus('Webcam access denied');
      });
  };

  const stopVideo = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
    }
  };

  const handleVideoPlay = () => {
    if (mode === 'enroll') {
      runEnrollment();
    } else {
      runVerification();
    }
  };

  const runEnrollment = async () => {
    setStatus('Look at the camera, stay still');
    const descriptors = [];
    let attempts = 0;
    
    captureIntervalRef.current = setInterval(async () => {
      if (descriptors.length >= 7 || attempts >= 25) {
        clearInterval(captureIntervalRef.current);
        
        if (descriptors.length >= 7) {
          // Average the descriptors for a more robust template
          const masterDescriptor = new Float32Array(128);
          for (let i = 0; i < 128; i++) {
            let sum = 0;
            for (let j = 0; j < descriptors.length; j++) {
              sum += descriptors[j][i];
            }
            masterDescriptor[i] = sum / descriptors.length;
          }

          // Consistency check: make sure all captures are similar to each other
          let consistent = true;
          for (const d of descriptors) {
            const dist = faceapi.euclideanDistance(d, masterDescriptor);
            if (dist > 0.35) {
              consistent = false;
              break;
            }
          }

          if (!consistent) {
            setStatus('Captures inconsistent. Please try again with steady lighting.');
            setResult('fail');
            setTimeout(() => {
              stopVideo();
              if (onFail) onFail();
            }, 2500);
            return;
          }
          
          localStorage.setItem('jarvis_owner_face', JSON.stringify(Array.from(masterDescriptor)));
          setStatus('Face enrolled successfully, Sir.');
          setResult('success');
          setFaceEnrolled(true);
          setTimeout(() => {
            stopVideo();
            if (onSuccess) onSuccess();
          }, 2000);
        } else {
          setStatus('Enrollment failed. Could not detect face clearly.');
          setResult('fail');
          setTimeout(() => {
            stopVideo();
            if (onFail) onFail();
          }, 2000);
        }
        return;
      }

      attempts++;
      const detection = await faceapi.detectSingleFace(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        // Liveness hint: require minimum face size (prevents photo attacks with small images)
        const box = detection.detection.box;
        const videoWidth = videoRef.current.videoWidth || 640;
        const faceRatio = box.width / videoWidth;
        
        if (faceRatio < 0.15) {
          setStatus('Move closer to the camera');
          return;
        }

        descriptors.push(detection.descriptor);
        setProgress(descriptors.length);
        setStatus(`Capturing ${descriptors.length}/7...`);
      }
    }, 500);
  };

  const runVerification = async () => {
    setStatus('Scanning...');
    const storedFaceData = localStorage.getItem('jarvis_owner_face');
    if (!storedFaceData) {
      setStatus('No enrolled face found. Please enroll first.');
      setTimeout(() => {
        stopVideo();
        if (onFail) onFail();
      }, 2000);
      return;
    }

    const storedDescriptor = new Float32Array(JSON.parse(storedFaceData));
    
    // Collect multiple successful matches for extra security
    let matchCount = 0;
    const REQUIRED_MATCHES = 2;
    let checks = 0;
    
    verifyIntervalRef.current = setInterval(async () => {
      checks++;
      const detection = await faceapi.detectSingleFace(videoRef.current)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        // Liveness: require reasonable face size
        const box = detection.detection.box;
        const videoWidth = videoRef.current.videoWidth || 640;
        const faceRatio = box.width / videoWidth;
        
        if (faceRatio < 0.15) {
          setStatus('Move closer to the camera...');
          return;
        }

        const distance = faceapi.euclideanDistance(detection.descriptor, storedDescriptor);
        
        // Stricter threshold: 0.4 (was 0.5)
        if (distance < 0.4) {
          matchCount++;
          if (matchCount >= REQUIRED_MATCHES) {
            clearInterval(verifyIntervalRef.current);
            clearInterval(verifyIntervalRef.current);
            setResult('success');
            
            if (requiresBoth) {
              // Face passed → now need fingerprint
              setStatus('Face confirmed. Touch ID next...');
              setTimeout(() => {
                stopVideo();
                setResult(null);
                setDualAuthStep('fingerprint');
                setAuthMethod('fingerprint');
                // Trigger fingerprint verify
                triggerFingerprintAfterFace();
              }, 1500);
            } else {
              setStatus('Identity confirmed, Sir.');
              setTimeout(() => {
                stopVideo();
                if (onSuccess) onSuccess();
              }, 1500);
            }
            return;
          }
          setStatus(`Verifying... (${matchCount}/${REQUIRED_MATCHES})`);
        } else {
          // Reset match count if we get a non-match (prevents random single-frame matches)
          matchCount = Math.max(0, matchCount - 1);
        }
      }

      if (checks >= 25) {
        clearInterval(verifyIntervalRef.current);
        setResult('fail');
        setStatus('Face not recognized, Sir. Access denied.');
        setTimeout(() => {
          stopVideo();
          if (onFail) onFail();
        }, 2000);
      }
    }, 500);
  };

  // ── Fingerprint handlers ──
  const triggerFingerprintAfterFace = useCallback(async () => {
    setStatus('Place your finger on the sensor...');
    try {
      await verifyFingerprint();
      setResult('success');
      setDualAuthStep('done');
      setStatus('All biometrics verified. Access granted, Sir.');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      console.error('Fingerprint verify error:', err);
      setResult('fail');
      setStatus('Fingerprint not recognized. Access denied.');
      setTimeout(() => {
        if (onFail) onFail();
      }, 2000);
    }
  }, [onSuccess, onFail]);

  const handleFingerprintVerify = useCallback(async () => {
    setAuthMethod('fingerprint');
    setStatus('Place your finger on the sensor...');
    try {
      await verifyFingerprint();
      setResult('success');
      setStatus('Fingerprint verified, Sir.');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      console.error('Fingerprint verify error:', err);
      setResult('fail');
      setStatus('Fingerprint not recognized. Access denied.');
      setTimeout(() => {
        if (onFail) onFail();
      }, 2000);
    }
  }, [onSuccess, onFail]);

  const handleFingerprintEnroll = useCallback(async () => {
    setAuthMethod('fingerprint');
    setStatus('Enrolling fingerprint... Follow system prompt.');
    try {
      await enrollFingerprint();
      setResult('success');
      setStatus('Fingerprint enrolled successfully, Sir.');
      setFingerprintEnrolled(true);
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 2000);
    } catch (err) {
      console.error('Fingerprint enroll error:', err);
      setResult('fail');
      setStatus('Fingerprint enrollment cancelled.');
      setTimeout(() => {
        if (onFail) onFail();
      }, 2000);
    }
  }, [onSuccess, onFail]);

  // Auto-start fingerprint verification in verify mode
  useEffect(() => {
    if (mode !== 'verify') return;
    const hasFinger = !!getStoredCredential();
    
    isWebAuthnAvailable().then(fpAvail => {
      const fingerReady = hasFinger && fpAvail;
      if (fingerReady) {
        setRequiresBoth(false);
        setAuthMethod('fingerprint');
        handleFingerprintVerify();
      } else {
        alert("Touch ID/Fingerprint is not enrolled, Sir. Please enroll it in Settings first.");
        setTimeout(() => { if (onFail) onFail(); }, 100);
      }
    });
  }, [mode, onFail, handleFingerprintVerify]);

  // ── Dual-auth step indicator component ──
  const StepIndicator = () => {
    if (!requiresBoth) return null;
    return (
      <div className="flex items-center gap-3 mb-6">
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] tracking-wider border transition-all duration-500 ${
          dualAuthStep === 'face' 
            ? 'border-holo-cyan/60 text-holo-cyan bg-holo-cyan/10 shadow-[0_0_10px_rgba(0,212,255,0.2)]' 
            : dualAuthStep === 'fingerprint' || dualAuthStep === 'done'
              ? 'border-neon-green/40 text-neon-green bg-neon-green/10'
              : 'border-glass-border text-text-dim'
        }`}>
          {(dualAuthStep === 'fingerprint' || dualAuthStep === 'done') ? '✓' : '1'} FACE ID
        </div>
        <div className={`w-6 h-px transition-colors duration-500 ${
          dualAuthStep === 'fingerprint' || dualAuthStep === 'done' ? 'bg-neon-green' : 'bg-glass-border'
        }`} />
        <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-[family-name:var(--font-mono)] tracking-wider border transition-all duration-500 ${
          dualAuthStep === 'fingerprint'
            ? 'border-holo-purple/60 text-holo-purple bg-holo-purple/10 shadow-[0_0_10px_rgba(124,58,237,0.2)]'
            : dualAuthStep === 'done'
              ? 'border-neon-green/40 text-neon-green bg-neon-green/10'
              : 'border-glass-border text-text-dim'
        }`}>
          {dualAuthStep === 'done' ? '✓' : '2'} TOUCH ID
        </div>
      </div>
    );
  };

  // ── Verify mode: wait for auto-start from useEffect (no picker needed) ──
  if (mode === 'verify' && !authMethod) {
    // Still initializing — show loading
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in-up">
        <div className="glass rounded-3xl p-8 flex flex-col items-center max-w-md w-full mx-4 border border-holo-cyan/30 shadow-[0_0_30px_rgba(0,212,255,0.1)] relative">
          <button onClick={() => { if (onClose) onClose(); }} className="absolute top-4 right-4 text-text-dim hover:text-holo-cyan transition-colors">✕</button>
          <h2 className="font-[family-name:var(--font-display)] tracking-[0.2em] text-holo-cyan text-sm mb-4">SECURITY VERIFICATION</h2>
          <div className="spinner w-8 h-8 rounded-full mb-4" />
          <p className="text-text-dim text-xs font-[family-name:var(--font-mono)] tracking-wider">Initializing biometric systems...</p>
        </div>
      </div>
    );
  }

  // ── Fingerprint-only UI (no video needed) ──
  if (authMethod === 'fingerprint') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in-up">
        <div className="glass rounded-3xl p-6 flex flex-col items-center max-w-md w-full mx-4 border border-holo-purple/30 shadow-[0_0_30px_rgba(124,58,237,0.15)] relative">
          <button 
            onClick={() => { if (onClose) onClose(); }} 
            className="absolute top-4 right-4 text-text-dim hover:text-holo-purple transition-colors"
          >
            ✕
          </button>

          <h2 className="font-[family-name:var(--font-display)] tracking-[0.2em] text-holo-purple text-sm mb-6">
            {mode === 'enroll' ? 'FINGERPRINT ENROLLMENT' : 'TOUCH ID SCAN'}
          </h2>

          <StepIndicator />

          {/* Fingerprint Icon */}
          <div className={`relative w-40 h-40 mb-6 rounded-full flex items-center justify-center border-2 ${
            result === 'success' ? 'border-neon-green bg-neon-green/10' :
            result === 'fail' ? 'border-neon-red bg-neon-red/10' :
            'border-holo-purple/40'
          } transition-colors duration-500`}>
            {!result && (
              <div className="absolute inset-0 border-4 border-holo-purple rounded-full animate-ping opacity-20 pointer-events-none" />
            )}
            {result === 'success' ? (
              <svg className="w-20 h-20 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : result === 'fail' ? (
              <svg className="w-20 h-20 text-neon-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-16 h-16 text-holo-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.864 4.243A7.5 7.5 0 0119.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 004.5 10.5a48.667 48.667 0 00-1.288 7.212M12 10.5a3 3 0 00-5.974.538M15 10.5a48.52 48.52 0 01-1.234 8.076M12 10.5a48.29 48.29 0 01-1.015 7.666" />
              </svg>
            )}
          </div>

          <p className={`text-center font-[family-name:var(--font-mono)] text-sm tracking-wider ${
            result === 'success' ? 'text-neon-green text-glow-green' : 
            result === 'fail' ? 'text-neon-red text-glow-red' : 'text-holo-purple text-glow-purple'
          }`}>
            {status}
          </p>
        </div>
      </div>
    );
  }

  // ── Face Auth UI (with video) ──
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in-up">
      <div className="glass rounded-3xl p-6 flex flex-col items-center max-w-md w-full mx-4 border border-holo-cyan/30 shadow-[0_0_30px_rgba(0,212,255,0.1)] relative">
        
        {/* Close Button */}
        <button 
          onClick={() => {
            stopVideo();
            if (onClose) onClose();
          }} 
          className="absolute top-4 right-4 text-text-dim hover:text-holo-cyan transition-colors"
        >
          ✕
        </button>

        <h2 className="font-[family-name:var(--font-display)] tracking-[0.2em] text-holo-cyan text-sm mb-6">
          {mode === 'enroll' ? 'BIOMETRIC ENROLLMENT' : 'SECURITY SCAN'}
        </h2>

        <StepIndicator />

        {/* Scanner UI */}
        <div className="relative w-64 h-64 mb-6 rounded-full overflow-hidden border-2 border-glass-border">
          <video 
            ref={videoRef} 
            onPlay={handleVideoPlay}
            autoPlay 
            muted 
            playsInline
            className="w-full h-full object-cover transform -scale-x-100"
          />
          
          {/* Overlay Animations */}
          {mode === 'verify' && !result && modelsLoaded && (
            <div className="absolute inset-0 border-4 border-holo-cyan rounded-full animate-ping opacity-20 pointer-events-none" />
          )}
          
          {/* Scanning line animation */}
          {!result && modelsLoaded && (
            <div className="absolute inset-x-0 h-0.5 bg-holo-cyan/60 shadow-[0_0_8px_rgba(0,212,255,0.5)] pointer-events-none" 
              style={{ animation: 'scan-line 2s ease-in-out infinite' }} />
          )}
          
          {/* Result Overlays */}
          {result === 'success' && (
            <div className="absolute inset-0 bg-neon-green/20 flex items-center justify-center backdrop-blur-sm transition-all">
              <svg className="w-24 h-24 text-neon-green" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {result === 'fail' && (
            <div className="absolute inset-0 bg-neon-red/20 flex items-center justify-center backdrop-blur-sm transition-all">
              <svg className="w-24 h-24 text-neon-red" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        <p className={`text-center font-[family-name:var(--font-mono)] text-sm tracking-wider ${
          result === 'success' ? 'text-neon-green text-glow-green' : 
          result === 'fail' ? 'text-neon-red text-glow-red' : 'text-holo-cyan text-glow-cyan'
        }`}>
          {status}
        </p>

        {mode === 'enroll' && progress > 0 && !result && (
          <div className="w-full bg-space-900 h-2 rounded-full mt-4 overflow-hidden border border-glass-border">
            <div 
              className="bg-holo-cyan h-full transition-all duration-300"
              style={{ width: `${(progress / 7) * 100}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Export helpers for use in settings
export { enrollFingerprint, isWebAuthnAvailable, getStoredCredential };
