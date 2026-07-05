import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

// Force Vite worker reload - v2

let faceLandmarker = null;
let objectDetector = null;
let modelsLoaded = false;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    try {
      console.log('[Worker] Starting model initialization...');
      const vision = await FilesetResolver.forVisionTasks(
        `${self.location.origin}/models/wasm`
      );
      
      console.log('[Worker] FilesetResolver ready, loading FaceLandmarker...');
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${self.location.origin}/models/face_landmarker.task`,
          delegate: 'CPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 3,
      });

      console.log('[Worker] FaceLandmarker loaded, loading ObjectDetector...');
      objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${self.location.origin}/models/efficientdet_lite0.tflite`,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        scoreThreshold: 0.4,
      });

      modelsLoaded = true;
      self.postMessage({ type: 'models_ready' });
      console.log('[Worker] ✅ ALL MODELS LOADED');
    } catch (err) {
      console.error('[Worker] ❌ FAILED to load models:', err);
      self.postMessage({ type: 'models_failed', error: err.message });
    }
  }

  if (type === 'detect' && modelsLoaded) {
    const { bitmap, timestamp } = data;
    
    try {
      const faceResults = faceLandmarker.detectForVideo(bitmap, timestamp);
      const objResults = objectDetector.detectForVideo(bitmap, timestamp);

      self.postMessage({
        type: 'detect_result',
        timestamp,
        data: {
          faceLandmarks: faceResults.faceLandmarks,
          faceBlendshapes: faceResults.faceBlendshapes,
          detections: objResults.detections
        }
      });
    } catch (err) {
      console.error('[Worker] Detection error:', err);
    } finally {
      bitmap.close();
    }
  }
};
