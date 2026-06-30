import { useEffect, useRef } from 'react';
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import Swal from 'sweetalert2';

export const useProctoring = (videoRef, isInterviewActive = true, logAlert = null, onStateChange = null) => {
  const faceLandmarkerRef = useRef(null);
  const objectDetectorRef = useRef(null);
  const logAlertRef = useRef(logAlert);
  const onStateChangeRef = useRef(onStateChange);
  const modelsLoadedRef = useRef(false);
  const lastTimestampRef = useRef(0);

  // Keep callback refs always current, never stale
  useEffect(() => { logAlertRef.current = logAlert; }, [logAlert]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  // Load MediaPipe models once on mount
  useEffect(() => {
    let active = true;
    modelsLoadedRef.current = false;

    const initModels = async () => {
      console.log('[Proctoring] Starting model initialization...');
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        if (!active) return;
        console.log('[Proctoring] FilesetResolver ready, loading FaceLandmarker...');

        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'CPU', // Use CPU — GPU is often unavailable in headless/iframe contexts
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 3,
        });
        if (!active) return;
        console.log('[Proctoring] FaceLandmarker loaded, loading ObjectDetector...');

        const objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          scoreThreshold: 0.4,
        });

        if (!active) return;
        faceLandmarkerRef.current = faceLandmarker;
        objectDetectorRef.current = objectDetector;
        modelsLoadedRef.current = true;
        console.log('[Proctoring] ✅ ALL MODELS LOADED — detection is active');
      } catch (err) {
        console.error('[Proctoring] ❌ FAILED to load models:', err);
      }
    };

    initModels();
    return () => {
      active = false;
      modelsLoadedRef.current = false;
      try { faceLandmarkerRef.current?.close(); } catch (_) {}
      try { objectDetectorRef.current?.close(); } catch (_) {}
    };
  }, []);

  // Detection loop
  useEffect(() => {
    console.log(`[Proctoring] Detection loop effect — isInterviewActive: ${isInterviewActive}`);
    if (!isInterviewActive) {
      console.log('[Proctoring] Interview not active, skipping detection loop');
      return;
    }

    let consecutiveNoFace = 0;
    let consecutiveMultiFace = 0;
    let consecutivePhone = 0;
    let consecutiveLookingAway = 0;
    // Sliding window: track last 6 ticks for multi-face (robust against 1-frame misses)
    const multiFaceWindow = [];
    const WINDOW_SIZE = 6;
    const WINDOW_THRESHOLD = 3; // alert if 3 out of 6 ticks had 2+ faces
    let tickCount = 0;

    const runDetection = () => {
      tickCount++;
      const video = videoRef?.current;

      // DIAGNOSTIC: Log state every 10 ticks (5 seconds)
      if (tickCount % 10 === 0) {
        console.log(`[Proctoring] Tick #${tickCount} — modelsLoaded: ${modelsLoadedRef.current}, video: ${!!video}, readyState: ${video?.readyState}, paused: ${video?.paused}, srcObject: ${!!video?.srcObject}`);
      }

      if (!modelsLoadedRef.current) {
        if (tickCount % 10 === 0) console.log('[Proctoring] Waiting for models to load...');
        return;
      }

      if (!video) {
        if (tickCount % 10 === 0) console.log('[Proctoring] No video element found!');
        return;
      }

      // Resume video if paused
      if (video.paused && video.srcObject) {
        console.log('[Proctoring] Video was paused — attempting to resume...');
        video.play().catch(e => console.warn('[Proctoring] play() failed:', e));
        return;
      }

      if (video.readyState < 2) {
        if (tickCount % 10 === 0) console.log(`[Proctoring] Video not ready — readyState: ${video.readyState}`);
        return;
      }

      if (!video.videoWidth || !video.videoHeight) {
        if (tickCount % 10 === 0) console.log('[Proctoring] Video has no dimensions yet');
        return;
      }

      // Use strictly increasing timestamp
      const nowInMs = Math.max(Date.now(), lastTimestampRef.current + 1);
      lastTimestampRef.current = nowInMs;

      try {
        // Run directly on the video element — no canvas indirection
        const faceResults = faceLandmarkerRef.current.detectForVideo(video, nowInMs);
        const objResults = objectDetectorRef.current.detectForVideo(video, nowInMs);

        // 1. Face Count using sliding window for robustness
        const numFaces = faceResults.faceLandmarks?.length ?? 0;
        const blendshapeCount = faceResults.faceBlendshapes?.length ?? 0;
        const detectedFaces = Math.max(numFaces, blendshapeCount);

        // Update sliding window
        multiFaceWindow.push(detectedFaces > 1 ? 1 : 0);
        if (multiFaceWindow.length > WINDOW_SIZE) multiFaceWindow.shift();
        const multiFaceInWindow = multiFaceWindow.reduce((a, b) => a + b, 0);

        if (tickCount % 6 === 0) {
          console.log(`[Proctoring] Detected ${detectedFaces} face(s) — window: [${multiFaceWindow.join(',')}] (${multiFaceInWindow}/${WINDOW_SIZE}), noFace ticks: ${consecutiveNoFace}`);
        }

        if (detectedFaces === 0) {
          consecutiveNoFace++;
          consecutiveMultiFace = 0;
        } else if (detectedFaces > 1) {
          consecutiveMultiFace++;
          consecutiveNoFace = 0;
          console.log(`[Proctoring] ⚠️ MULTI-FACE: ${detectedFaces} faces! window score: ${multiFaceInWindow}/${WINDOW_SIZE}`);
        } else {
          // Only decay (not zero-reset) for a single face — handles MediaPipe frame-miss
          consecutiveMultiFace = Math.max(0, consecutiveMultiFace - 1);
          consecutiveNoFace = 0;
        }

        // 2. Eye contact (blendshapes on face 0)
        if (blendshapeCount >= 1) {
          const blendshapes = faceResults.faceBlendshapes[0].categories;
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
          if (lookingAway) consecutiveLookingAway++;
          else consecutiveLookingAway = 0;
        } else {
          consecutiveLookingAway = 0;
        }

        // 3. Phone detection
        let hasPhone = false;
        for (const d of (objResults.detections ?? [])) {
          const cat = d.categories?.[0]?.categoryName?.toLowerCase() ?? '';
          if (cat.includes('phone') || cat.includes('mobile') || cat === 'cell phone') {
            hasPhone = true;
            break;
          }
        }
        if (hasPhone) consecutivePhone++;
        else consecutivePhone = 0;

        // Emit state
        onStateChangeRef.current?.({
          modelsReady: true,
          faceVisible: detectedFaces > 0,
          faceCount: detectedFaces,
          multiFace: detectedFaces > 1,
          phoneDetected: hasPhone,
          eyeContactLost: consecutiveLookingAway > 3,
          lastCheckedAt: new Date().toISOString(),
        });

        // Fire alerts after sustained violations
        let alertType = null;
        let alertMsg = null;

        const windowFull = multiFaceWindow.length >= WINDOW_SIZE;

        if (consecutivePhone > 4) {
          alertType = 'phone';
          alertMsg = 'Mobile phone detected in frame!';
        } else if (consecutiveMultiFace >= 3 || (windowFull && multiFaceInWindow >= WINDOW_THRESHOLD)) {
          // Fire if: 3 consecutive ticks OR 3+ out of last 6 ticks (only when window is full)
          alertType = 'multi_person';
          alertMsg = 'Multiple persons detected in frame!';
          console.log(`[Proctoring] 🚨 FIRING multi_person! (consecutive: ${consecutiveMultiFace}, window: ${multiFaceInWindow}/${WINDOW_SIZE})`);
        } else if (consecutiveNoFace > 6) {
          alertType = 'no_face';
          alertMsg = 'No face detected — please face the camera!';
        } else if (consecutiveLookingAway > 10) {
          alertType = 'eye_contact';
          alertMsg = 'Please maintain eye contact with the screen.';
        }

        if (alertType) {
          console.log(`[Proctoring] 🚨 ALERT FIRING: ${alertType}`);
          Swal.fire({
            toast: true,
            position: 'top',
            icon: 'warning',
            title: '⚠️ Proctoring Alert',
            text: alertMsg,
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true,
            background: alertType === 'multi_person' ? '#7c3aed' : '#b91c1c',
            color: '#fff',
            iconColor: '#fbbf24',
          });
          logAlertRef.current?.(alertType, alertMsg);

          // Reset ALL counters and clear window — 8 second cooldown before next alert
          consecutivePhone = 0;
          consecutiveMultiFace = 0;
          consecutiveNoFace = 0;
          consecutiveLookingAway = 0;
          multiFaceWindow.length = 0;
          // Cooldown: skip 16 ticks (~8 seconds) before allowing next alert
          tickCount = 0;
        }

      } catch (e) {
        // Log ALL errors so we can diagnose
        console.error('[Proctoring] Detection threw error:', e.message, e);
      }
    };

    const interval = setInterval(runDetection, 500);
    return () => {
      console.log('[Proctoring] Cleaning up detection interval');
      clearInterval(interval);
    };

  }, [isInterviewActive, videoRef]);
};
