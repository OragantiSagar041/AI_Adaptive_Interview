import React, { useEffect, useRef, useState } from 'react';

const DeviceCheckModal = ({ onSuccess, onCancel }) => {
  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);

  const [error, setError] = useState('');
  const [volLevel, setVolLevel] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [hasAudioVerified, setHasAudioVerified] = useState(false);

  useEffect(() => {
    let active = true;

    const setupDevices = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: 15 },
          audio: true
        });
        
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Setup Audio Analyser
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioCtx;
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        dataArrayRef.current = dataArray;

        const updateVolume = () => {
          if (!analyserRef.current || !dataArrayRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArrayRef.current);
          
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArrayRef.current[i];
          }
          const avg = sum / bufferLength;
          // Map 0-255 to 0-100 percentage
          const currentVol = Math.min(100, (avg / 128) * 100);
          setVolLevel(currentVol);
          
          if (currentVol > 5) {
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
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  const handleProceed = () => {
    // Stop tracks before proceeding so the next screen can acquire them cleanly
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1e]/90 backdrop-blur-sm p-4">
      <div className="bg-[#161c2d] border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full p-8 text-white relative overflow-hidden">
        
        {/* Header */}
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-bold mb-2">Hardware Check</h2>
          <p className="text-slate-400 text-sm">Let's make sure your camera and microphone are working properly before we begin.</p>
        </div>

        {/* Video Preview */}
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden mb-6 border border-white/5 flex items-center justify-center">
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
              className="w-full h-full object-cover transform -scale-x-100" // mirror video
            />
          )}
          
          {!isReady && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
              <i className="fas fa-spinner fa-spin text-3xl text-indigo-400 mb-3"></i>
              <p className="text-slate-300 font-medium animate-pulse">Requesting permissions...</p>
            </div>
          )}
        </div>

        {/* Audio Meter */}
        <div className="bg-white/5 rounded-xl p-4 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <i className="fas fa-microphone text-indigo-400"></i> Microphone Level
            </span>
            {hasAudioVerified ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded">Audio Verified ✓</span>
            ) : isReady ? (
              <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-1 rounded">Speak to verify...</span>
            ) : null}
          </div>
          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-75"
              style={{ width: `${volLevel}%` }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-800 hover:bg-slate-700 text-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            disabled={!isReady || !!error || !hasAudioVerified}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all shadow-lg ${
              isReady && !error && hasAudioVerified
                ? 'bg-primary hover:bg-primary-hover text-white shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5' 
                : 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
            }`}
          >
            {isReady && !error && !hasAudioVerified ? 'Awaiting Audio...' : 'Proceed to Interview'}
          </button>
        </div>
        
      </div>
    </div>
  );
};

export default DeviceCheckModal;
