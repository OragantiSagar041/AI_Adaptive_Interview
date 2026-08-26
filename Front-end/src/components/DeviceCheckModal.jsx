import React, { useEffect, useRef, useState } from 'react';
import { useProctoring } from '../hooks/useProctoring';

const DeviceCheckModal = ({ onSuccess, onCancel }) => {
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const sourceRef = useRef(null); // NEW: keep the source node alive

  const [error, setError] = useState('');
  const [volLevel, setVolLevel] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [hasAudioVerified, setHasAudioVerified] = useState(false);

  const proctoring = useProctoring({
    videoRef,
    enabled: isReady && !error
  });

  const hasFaceVerified = proctoring.faceVisible && proctoring.faceCount === 1;

  useEffect(() => {
    let active = true;

    const setupDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: 15 },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Sanity check: did we actually get a live audio track?
        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length || audioTracks[0].readyState !== 'live') {
          console.warn('No live audio track in stream — mic may be muted at OS level.');
        }

        // Setup Audio Analyser
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;

        // CRITICAL FIX: actually wait for resume() to finish before proceeding,
        // instead of firing-and-forgetting it.
        if (audioCtx.state === 'suspended') {
          try {
            await audioCtx.resume();
          } catch (e) {
            console.warn('AudioContext resume() blocked, will retry on interaction:', e);
          }

          const unlockAudio = () => {
            if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
              audioContextRef.current.resume().catch(() => {});
            }
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
          };
          window.addEventListener('click', unlockAudio);
          window.addEventListener('keydown', unlockAudio);
          window.addEventListener('touchstart', unlockAudio);
        }

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.4;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source; // NEW: hold a strong ref so it isn't GC'd
        source.connect(analyser);
        // Do NOT connect analyser -> destination, or you'll get feedback/echo

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        dataArrayRef.current = dataArray;

        const updateVolume = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;

          // NEW: self-heal — if the context ever drops back to suspended
          // (tab backgrounded, OS interruption, etc.) keep trying to resume it.
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume().catch(() => {});
          }

          analyserRef.current.getByteTimeDomainData(dataArrayRef.current);

          let sumSquares = 0;
          for (let i = 0; i < bufferLength; i++) {
            const amplitude = dataArrayRef.current[i] - 128;
            sumSquares += amplitude * amplitude;
          }

          const rms = Math.sqrt(sumSquares / bufferLength);
          const currentVol = Math.min(100, (rms / 128) * 100 * 4);

          setVolLevel(currentVol);

          if (currentVol > 2) {
            setHasAudioVerified(true);
          }

          animationFrameRef.current = requestAnimationFrame(updateVolume);
        };

        updateVolume();
        setIsReady(true);
      } catch (err) {
        if (!active) return;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        console.error("Device check error:", err);
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setError("No camera or microphone found. Please connect your devices.");
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError("Permission denied. Please allow camera and microphone access in your browser settings.");
        } else {
          setError(`Could not access devices: ${err.message || err.name}`);
        }
      }
    };

    setupDevices();

    return () => {
      active = false;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (sourceRef.current) {
        try { sourceRef.current.disconnect(); } catch (_) {}
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => { });
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleProceed = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1e]/90 backdrop-blur-sm p-4">
      <div 
        className="bg-[#161c2d] border rounded-2xl shadow-2xl max-w-2xl w-full p-8 text-white relative overflow-hidden"
        style={{ backgroundColor: '#161c2d', borderColor: 'rgba(255,255,255,0.1)', color: '#ffffff' }}
      >
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Hardware Check</h2>
          <p className="text-slate-400 text-sm mb-3">Let's make sure your camera and microphone are working properly before we begin.</p>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs font-medium text-blue-400">
            <i className="fab fa-chrome"></i>
            <span>Google Chrome is recommended for the best interview experience</span>
          </div>
        </div>

        <div className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden mb-8 flex items-center justify-center">
          {error ? (
            <div className="text-center p-6">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-exclamation-triangle text-2xl text-red-400"></i>
              </div>
              <p className="text-red-400 font-medium">{error}</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform -scale-x-100"
            />
          )}

          {!isReady && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
              <i className="fas fa-spinner fa-spin text-3xl text-indigo-400 mb-3"></i>
              <p className="text-slate-300 font-medium animate-pulse">Requesting permissions...</p>
            </div>
          )}
        </div>

        <div className="bg-[#1e293b] rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <i className="fas fa-microphone text-indigo-500"></i> Microphone Level
            </span>
            {hasAudioVerified ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-md">Audio Verified ✓</span>
            ) : isReady ? (
              <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-md">Speak to verify...</span>
            ) : null}
          </div>
          <div className="h-3 w-full bg-[#0f172a] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-75"
              style={{ width: `${volLevel}%` }}
            />
          </div>
        </div>

        <div className="bg-[#1e293b] rounded-2xl p-5 mb-8 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <i className="fas fa-user-check text-indigo-500"></i> Face Detection
          </span>
          {hasFaceVerified ? (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-md">Face Verified ✓</span>
          ) : proctoring.multiFace ? (
            <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-md">Multiple Faces Detected!</span>
          ) : isReady ? (
            <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-md">Looking for face...</span>
          ) : null}
        </div>

        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-[#1e293b] hover:bg-[#334155] text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            disabled={!isReady || !!error || !hasAudioVerified || !hasFaceVerified}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${isReady && !error && hasAudioVerified && hasFaceVerified
                ? 'bg-primary hover:bg-primary-hover text-white shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5'
                : 'bg-[#1e293b] text-slate-500 cursor-not-allowed shadow-none'
              }`}
          >
            {isReady && !error && (!hasAudioVerified || !hasFaceVerified) ? 'Awaiting Checks...' : 'Proceed to Interview'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default DeviceCheckModal;