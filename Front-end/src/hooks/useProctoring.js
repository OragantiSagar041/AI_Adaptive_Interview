import { useState, useEffect, useRef } from 'react';
import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';
import Swal from 'sweetalert2';

export const useProctoring = (videoRef, isInterviewActive = true, logAlert = null) => {
  const faceLandmarkerRef = useRef(null);
  const objectDetectorRef = useRef(null);
  const lastVideoTimeRef = useRef(-1);
  
  useEffect(() => {
    let active = true;
    const initializeModels = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );
        if (!active) return;
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 2
        });
        const objectDetector = await ObjectDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          scoreThreshold: 0.5
        });
        if (!active) return;
        faceLandmarkerRef.current = faceLandmarker;
        objectDetectorRef.current = objectDetector;
        console.log("[Proctoring] AI Models loaded successfully.");
      } catch (err) {
        console.error("Failed to load proctoring models:", err);
      }
    };
    initializeModels();
    return () => {
      active = false;
      if (faceLandmarkerRef.current) faceLandmarkerRef.current.close();
      if (objectDetectorRef.current) objectDetectorRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (!isInterviewActive) return;
    
    let consecutiveNoFace = 0;
    let consecutiveMultiFace = 0;
    let consecutivePhone = 0;
    let consecutiveLookingAway = 0;
    
    const interval = setInterval(() => {
      const video = videoRef?.current;
      if (!video || video.readyState !== 4 || !faceLandmarkerRef.current || !objectDetectorRef.current) return;
      
      const nowInMs = Date.now();
      if (video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const faceResults = faceLandmarkerRef.current.detectForVideo(video, nowInMs);
          const objResults = objectDetectorRef.current.detectForVideo(video, nowInMs);

          // 1. Face Count
          const numFaces = faceResults.faceBlendshapes ? faceResults.faceBlendshapes.length : 0;
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

          // 2. Eye Contact (using blendshapes)
          if (numFaces === 1) {
            const blendshapes = faceResults.faceBlendshapes[0].categories;
            const lookup = (name) => blendshapes.find(b => b.categoryName === name)?.score || 0;
            if (lookup('eyeLookOutRight') > 0.5 || lookup('eyeLookInLeft') > 0.5 || lookup('eyeLookUpLeft') > 0.5 || lookup('eyeLookDownLeft') > 0.5) {
              consecutiveLookingAway++;
            } else {
              consecutiveLookingAway = 0;
            }
          } else {
            consecutiveLookingAway = 0;
          }

          // 3. Object Detection
          let hasPhone = false;
          if (objResults.detections) {
            for (const d of objResults.detections) {
              if (d.categories[0].categoryName === 'cell phone') hasPhone = true;
            }
          }
          if (hasPhone) consecutivePhone++;
          else consecutivePhone = 0;

          // Since interval is 500ms, threshold of 4 means 2 seconds
          let alertMsg = null;
          let alertType = null;
          if (consecutivePhone > 4) { alertMsg = "Mobile phone detected in frame!"; alertType = 'phone'; }
          else if (consecutiveMultiFace > 4) { alertMsg = "Multiple persons detected in frame!"; alertType = 'multi_person'; }
          else if (consecutiveNoFace > 8) { alertMsg = "No face detected in frame!"; alertType = 'no_face'; }
          else if (consecutiveLookingAway > 10) { alertMsg = "Please maintain eye contact with the screen."; alertType = 'eye_contact'; }

          if (alertMsg) {
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
            if (logAlert) logAlert(alertType, alertMsg);
            
            // Reset to avoid spam
            consecutivePhone = 0;
            consecutiveMultiFace = 0;
            consecutiveNoFace = 0;
            consecutiveLookingAway = 0;
          }
        } catch (e) {
          console.error("Detection error:", e);
        }
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [isInterviewActive, videoRef, logAlert]);
};
