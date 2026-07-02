import { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';

export const useProctoring = (videoRef, isInterviewActive = true, logAlert = null, audioRmsRef = null, onStateChange = null) => {
  const workerRef = useRef(null);
  const logAlertRef = useRef(logAlert);
  const onStateChangeRef = useRef(onStateChange);
  const modelsLoadedRef = useRef(false);
  const lastTimestampRef = useRef(0);
  const detectionTimeoutRef = useRef(null);

  useEffect(() => { logAlertRef.current = logAlert; }, [logAlert]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  const counters = useRef({
    consecutiveNoFace: 0,
    consecutiveMultiFace: 0,
    consecutivePhone: 0,
    consecutiveLookingAway: 0,
    consecutiveLipSync: 0,
    tickCount: 0,
    multiFaceWindow: []
  });

  const WINDOW_SIZE = 6;
  const WINDOW_THRESHOLD = 3;

  useEffect(() => {
    let active = true;
    modelsLoadedRef.current = false;

    console.log('[Proctoring] Initializing Web Worker...');
    const worker = new Worker(new URL('../workers/proctoring.worker.js', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (!active) return;
      const { type, data, error, timestamp } = e.data;

      if (type === 'models_ready') {
        modelsLoadedRef.current = true;
        console.log('[Proctoring] Web Worker Models Ready');
      } else if (type === 'models_failed') {
        console.error('[Proctoring] Web Worker failed to load models:', error);
      } else if (type === 'detect_result') {
        processDetectionResult(data, timestamp);
      }
    };

    worker.postMessage({ type: 'init' });

    return () => {
      active = false;
      modelsLoadedRef.current = false;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, []);

  const processDetectionResult = (data, timestamp) => {
    const c = counters.current;
    c.tickCount++;

    const numFaces = data.faceLandmarks?.length ?? 0;
    const blendshapeCount = data.faceBlendshapes?.length ?? 0;
    const detectedFaces = Math.max(numFaces, blendshapeCount);

    c.multiFaceWindow.push(detectedFaces > 1 ? 1 : 0);
    if (c.multiFaceWindow.length > WINDOW_SIZE) c.multiFaceWindow.shift();
    const multiFaceInWindow = c.multiFaceWindow.reduce((a, b) => a + b, 0);

    if (detectedFaces === 0) {
      c.consecutiveNoFace++;
      c.consecutiveMultiFace = 0;
    } else if (detectedFaces > 1) {
      c.consecutiveMultiFace++;
      c.consecutiveNoFace = 0;
    } else {
      c.consecutiveMultiFace = Math.max(0, c.consecutiveMultiFace - 1);
      c.consecutiveNoFace = 0;
    }

    if (blendshapeCount >= 1) {
      const blendshapes = data.faceBlendshapes[0].categories;
      const score = (name) => blendshapes.find(b => b.categoryName === name)?.score ?? 0;
      const lookingAway = (
        score('eyeLookOutRight') > 0.45 ||
        score('eyeLookOutLeft') > 0.45 ||
        score('eyeLookInRight') > 0.45 ||
        score('eyeLookInLeft') > 0.45 ||
        score('eyeLookUpRight') > 0.5 ||
        score('eyeLookUpLeft') > 0.5 ||
        score('eyeLookDownRight') > 0.5 ||
        score('eyeLookDownLeft') > 0.5
      );
      if (lookingAway) c.consecutiveLookingAway++;
      else c.consecutiveLookingAway = 0;
      
      const jawOpen = score('jawOpen');
      const audioRms = audioRmsRef?.current || 0;
      
      if (audioRms > 0.18 && jawOpen < 0.05) {
        c.consecutiveLipSync++;
      } else {
        c.consecutiveLipSync = 0;
      }
    } else {
      c.consecutiveLookingAway = 0;
      c.consecutiveLipSync = 0;
    }

    let hasPhone = false;
    for (const d of (data.detections ?? [])) {
      const cat = d.categories?.[0]?.categoryName?.toLowerCase() ?? '';
      if (cat.includes('phone') || cat.includes('mobile') || cat === 'cell phone') {
        hasPhone = true;
        break;
      }
    }
    if (hasPhone) c.consecutivePhone++;
    else c.consecutivePhone = 0;

    onStateChangeRef.current?.({
      modelsReady: true,
      faceVisible: detectedFaces > 0,
      faceCount: detectedFaces,
      multiFace: detectedFaces > 1,
      phoneDetected: hasPhone,
      eyeContactLost: c.consecutiveLookingAway > 3,
      lastCheckedAt: new Date().toISOString(),
    });

    let alertType = null;
    let alertMsg = null;
    const windowFull = c.multiFaceWindow.length >= WINDOW_SIZE;

    if (c.consecutivePhone > 4) {
      alertType = 'phone';
      alertMsg = 'Mobile phone detected in frame!';
    } else if (c.consecutiveMultiFace >= 3 || (windowFull && multiFaceInWindow >= WINDOW_THRESHOLD)) {
      alertType = 'multi_person';
      alertMsg = 'Multiple persons detected in frame!';
    } else if (c.consecutiveNoFace > 6) {
      alertType = 'no_face';
      alertMsg = 'No face detected - please face the camera!';
    } else if (c.consecutiveLookingAway > 10) {
      alertType = 'eye_contact';
      alertMsg = 'Please maintain eye contact with the screen.';
    } else if (c.consecutiveLipSync > 15) {
      alertType = 'lip_sync';
      alertMsg = 'Lip sync anomaly detected. Please answer naturally.';
    }

    if (alertType) {
      console.log(`[Proctoring] 🚨 ALERT FIRING: ${alertType}`);
      Swal.fire({
        icon: 'warning',
        title: '⚠️ Proctoring Alert',
        text: alertMsg,
        confirmButtonText: 'I Understand',
        allowOutsideClick: false,
        allowEscapeKey: false,
        background: '#161c2d',
        color: '#fff',
        customClass: {
          popup: 'border border-white/8 rounded-2xl shadow-2xl',
          title: 'text-xl font-bold text-white',
          htmlContainer: 'text-slate-300 text-sm',
          confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
        },
        buttonsStyling: false
      });
      logAlertRef.current?.(alertType, alertMsg);

      c.consecutivePhone = 0;
      c.consecutiveMultiFace = 0;
      c.consecutiveNoFace = 0;
      c.consecutiveLookingAway = 0;
      c.consecutiveLipSync = 0;
      c.multiFaceWindow = [];
      c.tickCount = 0;
    }
  };

  useEffect(() => {
    if (!isInterviewActive) return;

    const captureAndDetect = async () => {
      if (!modelsLoadedRef.current || !workerRef.current) {
        scheduleNext();
        return;
      }

      const video = videoRef?.current;
      if (!video || video.readyState < 2 || !video.videoWidth) {
        scheduleNext();
        return;
      }

      try {
        const bitmap = await createImageBitmap(video);
        const nowInMs = Math.max(Date.now(), lastTimestampRef.current + 1);
        lastTimestampRef.current = nowInMs;

        workerRef.current.postMessage({
          type: 'detect',
          data: { bitmap, timestamp: nowInMs }
        }, [bitmap]);

      } catch (err) {
        console.warn('[Proctoring] Failed to capture frame:', err);
      }

      scheduleNext();
    };

    const scheduleNext = () => {
      detectionTimeoutRef.current = setTimeout(captureAndDetect, 500);
    };

    scheduleNext();

    return () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
    };
  }, [isInterviewActive, videoRef]);
};
