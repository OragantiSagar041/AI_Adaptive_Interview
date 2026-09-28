import React, { useEffect, useRef, useState } from 'react';
import { useProctoring } from '../hooks/useProctoring';
import { useEnvironmentIsolation } from '../hooks/useEnvironmentIsolation';

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

  const env = useEnvironmentIsolation({
    enabled: true,
  });

  const proctoring = useProctoring({
    videoRef,
    enabled: isReady && !error
  });

  const hasFaceVerified = proctoring.faceVisible && proctoring.faceCount === 1 && !proctoring.multiFace;
  const hasEnvironmentVerified = env.isIsolated;

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
    // Strict zero-tolerance guard at the exact moment of proceeding
    if (proctoring.multiFace) {
      return;
    }
    if (!document.fullscreenElement) {
      env.revokeIsolation("Cannot proceed: Fullscreen is not active. The interview requires full-screen mode to prevent other applications from displaying.");
      return;
    }
    if (env.hasMultipleTabs) {
      env.revokeIsolation("Cannot proceed: Multiple Chrome tabs are open. Please close all other tabs.");
      return;
    }
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
      env.revokeIsolation("Cannot proceed: Window focus was lost. Close all background applications (VS Code, WhatsApp, AnyDesk, etc.) before proceeding.");
      return;
    }

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    onSuccess();
  };

  const handleCancel = () => {
    if (document.fullscreenElement) {
      try { document.exitFullscreen(); } catch (_) {}
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1e]/90 backdrop-blur-sm p-4 overflow-y-auto">
      <div 
        className="bg-[#161c2d] border rounded-2xl shadow-2xl max-w-2xl w-full p-6 sm:p-8 text-white relative overflow-y-auto max-h-[94vh] my-auto flex flex-col justify-between"
        style={{ backgroundColor: '#161c2d', borderColor: 'rgba(255,255,255,0.1)', color: '#ffffff' }}
      >
        <div className="mb-4 text-center">
          <h2 className="text-2xl font-bold mb-2">Hardware Check</h2>
          <p className="text-slate-400 text-sm mb-3">Let's make sure your camera and microphone are working properly before we begin.</p>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-xs font-medium text-blue-400">
            <i className="fab fa-chrome"></i>
            <span>Google Chrome is recommended for the best interview experience</span>
          </div>
        </div>

        <div className="relative w-full aspect-video max-h-[38vh] bg-black rounded-3xl overflow-hidden mb-5 flex items-center justify-center">
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

        <div className="bg-[#1e293b] rounded-2xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
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

        <div className="bg-[#1e293b] rounded-2xl p-4 sm:p-5 mb-4 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <i className="fas fa-user-check text-indigo-500"></i> Face Detection
          </span>
          {proctoring.multiFace ? (
            <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-md">Multiple Faces Detected!</span>
          ) : hasFaceVerified ? (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-md">Face Verified ✓</span>
          ) : isReady ? (
            <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-md">Looking for face...</span>
          ) : null}
        </div>
        {/* Environment & Tab Isolation Check */}
        <div className="bg-[#1e293b] rounded-2xl p-4 sm:p-5 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <i className="fas fa-shield-alt text-indigo-500"></i> Zero External Applications & Tab Lockdown
            </span>
            {hasEnvironmentVerified ? (
              <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-md">
                All Apps Isolated ✓
              </span>
            ) : env.hasMultipleTabs ? (
              <span className="text-xs font-bold text-red-400 bg-red-500/20 border border-red-500/40 px-3 py-1 rounded-md animate-pulse">
                ⚠️ Multiple Tabs Detected!
              </span>
            ) : env.isTesting ? (
              <span className="text-xs font-bold text-indigo-400 bg-indigo-400/10 px-3 py-1 rounded-md animate-pulse">
                Testing Focus ({env.countdown}s)...
              </span>
            ) : env.failureReason ? (
              <span className="text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-md">
                Isolation Failed
              </span>
            ) : (
              <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-3 py-1 rounded-md">
                Verification Required
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400 mb-3 leading-relaxed">
            All other running software on your PC (IDEs, other browsers, remote desktop tools, messengers, recording tools, and desktop utilities) must be closed.
          </p>

          {!hasEnvironmentVerified ? (
            <div className="bg-[#0f172a] rounded-xl p-3.5 border border-white/5">
              {env.hasMultipleTabs && (
                <div className="p-3.5 mb-3 bg-red-500/15 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-start gap-2.5 shadow-lg shadow-red-500/10">
                  <i className="fas fa-window-restore text-red-400 text-sm mt-0.5 flex-shrink-0 animate-bounce"></i>
                  <div className="flex-1">
                    <p className="font-bold text-red-100 text-sm">Background Chrome Tabs Detected!</p>
                    <p className="mt-1 text-slate-200">
                      {env.multiTabError || 'Multiple Chrome tabs are open on your browser.'}
                    </p>
                    <p className="mt-1.5 text-red-300 font-semibold">
                      👉 Action Required: Close all other Chrome tabs. This check will update automatically once closed.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-300 space-y-1">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-ban text-red-400"></i>
                    <span>Close <strong>ALL other applications</strong> running on your computer</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-window-restore text-slate-400"></i>
                    <span>Close all other Chrome tabs and windows</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <i className="fas fa-bell-slash text-slate-400"></i>
                    <span>Press <kbd className="px-1.5 py-0.5 bg-black/60 rounded border border-white/10 font-mono text-[10px] text-white">Win + N</kbd> to turn on <strong>Do Not Disturb</strong></span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={env.startIsolationTest}
                  disabled={env.isTesting || env.hasMultipleTabs}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shrink-0 ${
                    env.isTesting
                      ? 'bg-indigo-600/50 text-indigo-200 cursor-wait'
                      : env.hasMultipleTabs
                        ? 'bg-red-500/20 text-red-300 cursor-not-allowed border border-red-500/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 hover:-translate-y-0.5 cursor-pointer'
                  }`}
                >
                  {env.isTesting ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      <span>Testing Fullscreen ({env.countdown}s)...</span>
                    </>
                  ) : env.hasMultipleTabs ? (
                    <>
                      <i className="fas fa-exclamation-circle"></i>
                      <span>Close Other Tabs to Test</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-double"></i>
                      <span>Run 5s Isolation Test</span>
                    </>
                  )}
                </button>
              </div>

              {env.failureReason && !env.isTesting && !env.hasMultipleTabs && (
                <div className="mt-3 p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 flex items-center justify-between">
                  <span>⚠️ {env.failureReason}</span>
                  <button
                    type="button"
                    onClick={env.resetIsolationTest}
                    className="underline hover:text-white text-xs font-semibold ml-2 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <i className="fas fa-check-circle text-emerald-400"></i>
              <span>Fullscreen focus verified. All external tabs, apps, and notifications are isolated.</span>
            </div>
          )}
        </div>

        <div className="flex gap-4 pt-1">
          <button
            onClick={handleCancel}
            className="flex-1 py-3 rounded-2xl font-bold text-sm bg-[#1e293b] hover:bg-[#334155] text-white transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleProceed}
            disabled={!isReady || !!error || !hasAudioVerified || !hasFaceVerified || !hasEnvironmentVerified || env.hasMultipleTabs}
            className={`flex-1 py-3 rounded-2xl font-bold text-sm transition-all shadow-lg ${
              isReady && !error && hasAudioVerified && hasFaceVerified && hasEnvironmentVerified && !env.hasMultipleTabs
                ? 'bg-primary hover:bg-primary-hover text-white shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 cursor-pointer'
                : 'bg-[#1e293b] text-slate-500 cursor-not-allowed shadow-none'
            }`}
          >
            {isReady && !error && (!hasAudioVerified || !hasFaceVerified || !hasEnvironmentVerified || env.hasMultipleTabs)
              ? (
                  env.hasMultipleTabs
                    ? 'Close Other Tabs to Continue'
                  : proctoring.multiFace
                    ? 'Multiple Faces Detected (Only 1 Allowed)'
                  : !hasFaceVerified
                    ? 'Face Verification Required'
                  : !hasAudioVerified
                    ? 'Speak to Verify Microphone'
                  : !hasEnvironmentVerified
                    ? (env.isTesting ? `Testing Environment (${env.countdown}s)...` : 'Verify Environment to Continue')
                    : 'Awaiting Checks...'
              )
              : 'Proceed to Interview'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default DeviceCheckModal;