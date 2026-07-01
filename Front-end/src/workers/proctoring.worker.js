import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let objectDetector = null;
let modelsLoaded = false;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    try {
      console.log('[Worker] Starting model initialization...');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
      );
      
      console.log('[Worker] FilesetResolver ready, loading FaceLandmarker...');
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
          delegate: 'CPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'IMAGE',
        numFaces: 3,
      });

      console.log('[Worker] FaceLandmarker loaded, loading ObjectDetector...');
      objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
          delegate: 'CPU',
        },
        runningMode: 'IMAGE',
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
      const faceResults = faceLandmarker.detect(bitmap);
      const objResults = objectDetector.detect(bitmap);

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
