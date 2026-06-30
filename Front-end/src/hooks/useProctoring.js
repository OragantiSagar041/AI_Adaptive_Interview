import { useEffect, useRef } from 'react';
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import Swal from 'sweetalert2';

export const useProctoring = (videoRef, isInterviewActive = true, logAlert = null, onStateChange = null) => {
  const faceLandmarkerRef = useRef(null);
  const objectDetectorRef = useRef(null);
  const logAlertRef = useRef(logAlert);
  const onStateChangeRef = useRef(onStateChange);

  // Keep callback refs always current, never stale
  useEffect(() => { logAlertRef.current = logAlert; }, [logAlert]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);

  // Load MediaPipe models once on mount
  useEffect(() => {
    let active = true;

    const initModels = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        if (!active) return;

        const baseOptions = (modelAssetPath) => ({ modelAssetPath, delegate: 'GPU' });

        let faceLandmarker, objectDetector;

        try {
          faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: baseOptions('https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'),
            outputFaceBlendshapes: true,
            runningMode: 'VIDEO',
            numFaces: 3, // detect up to 3 faces
          });
          objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: baseOptions('https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'),
            runningMode: 'VIDEO',
            scoreThreshold: 0.4,
          });
        } catch (gpuErr) {
          console.warn('[Proctoring] GPU failed, falling back to CPU', gpuErr);
          faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', delegate: 'CPU' },
            outputFaceBlendshapes: true,
            runningMode: 'VIDEO',
            numFaces: 3,
          });
          objectDetector = await ObjectDetector.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite', delegate: 'CPU' },
            runningMode: 'VIDEO',
            scoreThreshold: 0.4,
          });
        }

        if (!active) return;
        faceLandmarkerRef.current = faceLandmarker;
        objectDetectorRef.current = objectDetector;
        console.log('[Proctoring] ✅ Models loaded successfully');
      } catch (err) {
        console.error('[Proctoring] ❌ Failed to load models:', err);
      }
    };

    initModels();
    return () => {
      active = false;
      try { faceLandmarkerRef.current?.close(); } catch (_) {}
      try { objectDetectorRef.current?.close(); } catch (_) {}
    };
  }, []);

  // Detection loop
  useEffect(() => {
    if (!isInterviewActive) return;

    let consecutiveNoFace = 0;
    let consecutiveMultiFace = 0;
    let consecutivePhone = 0;
    let consecutiveLookingAway = 0;

    // Use a canvas to snapshot the video frame - this forces the browser to decode video
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');

    const runDetection = () => {
      const video = videoRef?.current;

      if (!video || !faceLandmarkerRef.current || !objectDetectorRef.current) return;

      // Check if video is ready and playing
      if (video.readyState < 2 || video.paused || video.ended) {
        // Try to play if paused
        if (video.paused && video.srcObject) {
          video.play().catch(() => {});
        }
        return;
      }

      // Force-draw the current video frame to a canvas to ensure it's decoded
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      } catch (drawErr) {
        return; // video not ready
      }

      // Use Date.now() as the timestamp — DO NOT rely on video.currentTime
      // as it can be frozen for off-screen/hidden videos
      const nowInMs = Date.now();

      try {
        const faceResults = faceLandmarkerRef.current.detectForVideo(canvas, nowInMs);
        const objResults = objectDetectorRef.current.detectForVideo(canvas, nowInMs);

        // 1. Face Count
        const numFaces = faceResults.faceBlendshapes?.length ?? 0;
        if (numFaces === 0) {
          consecutiveNoFace++;
          consecutiveMultiFace = 0;
        } else if (numFaces > 1) {
          consecutiveMultiFace++;
          consecutiveNoFace = 0;
        } else {
          consecutiveNoFace = 0;
          consecutiveMultiFace = 0;
        }

        // 2. Eye contact (blendshapes on face 0)
        if (numFaces >= 1) {
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

        // Emit state for dashboard
        onStateChangeRef.current?.({
          modelsReady: true,
          faceVisible: numFaces > 0,
          faceCount: numFaces,
          multiFace: numFaces > 1,
          phoneDetected: hasPhone,
          eyeContactLost: consecutiveLookingAway > 3,
          lastCheckedAt: new Date().toISOString(),
        });

        // Trigger alerts after sustained violations
        // 500ms interval → 4 ticks = 2s, 6 ticks = 3s, 10 ticks = 5s
        let alertType = null;
        let alertMsg = null;

        if (consecutivePhone > 4) {
          alertType = 'phone';
          alertMsg = 'Mobile phone detected in frame!';
        } else if (consecutiveMultiFace > 4) {
          alertType = 'multi_person';
          alertMsg = 'Multiple persons detected in frame!';
        } else if (consecutiveNoFace > 6) {
          alertType = 'no_face';
          alertMsg = 'No face detected — please face the camera!';
        } else if (consecutiveLookingAway > 10) {
          alertType = 'eye_contact';
          alertMsg = 'Please maintain eye contact with the screen.';
        }

        if (alertType) {
          Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Proctoring Alert',
            text: alertMsg,
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true,
          });
          logAlertRef.current?.(alertType, alertMsg);

          // Reset counters after firing
          consecutivePhone = 0;
          consecutiveMultiFace = 0;
          consecutiveNoFace = 0;
          consecutiveLookingAway = 0;
        }

      } catch (e) {
        // MediaPipe errors on first frame are expected - just skip
        if (!e.message?.includes('timestamp')) {
          console.warn('[Proctoring] Detection error:', e.message);
        }
      }
    };

    const interval = setInterval(runDetection, 500);
    return () => clearInterval(interval);

  }, [isInterviewActive, videoRef]);
};
