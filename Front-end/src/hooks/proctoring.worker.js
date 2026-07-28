/**
 * proctoring.worker.js  (classic / IIFE worker — built with Vite worker.format: 'iife')
 *
 * Web Worker that owns two MediaPipe models (FaceLandmarker, ObjectDetector)
 * and does all per-frame feature extraction off the main thread.
 *
 * WHY THIS IS A CLASSIC WORKER (not ES module):
 * MediaPipe's WASM loader (vision_wasm_internal.js) is a UMD script that
 * assigns internal globals like `custom_dbg` and `ModuleFactory` in classic
 * global scope.  ES module workers have an isolated module scope — these
 * globals never reach `globalThis`, so every MediaPipe model call throws
 * "ModuleFactory not set" or "custom_dbg is not defined".
 *
 * importScripts() is the ONLY correct, CSP-safe API to execute a UMD script
 * in a worker's global scope.  It is available only in classic workers.
 * Setting vite.config.js `worker.format: 'iife'` makes Vite build a classic
 * (non-module) worker bundle, which is exactly what we need.
 *
 * MESSAGE PROTOCOL:
 *   in  { type: 'init' }
 *   out { type: 'models_ready' } | { type: 'models_failed', error }
 *   in  { type: 'detect', data: { bitmap, timestamp } }
 *   out { type: 'detect_result', timestamp, data: FrameFeatures }
 *   out { type: 'detect_error', timestamp, error }
 */

import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

const DEBUG = false;

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';

const MODEL_URLS = {
  faceLandmarker:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  objectDetector:
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
};

const OBJECT_DETECTOR_SCORE_THRESHOLD = 0.10;

const LANDMARK = {
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  EYE_OUTER_LEFT: 33,
  EYE_OUTER_RIGHT: 263,
  LIP_UPPER: 13,
  LIP_LOWER: 14,
};

let faceLandmarker = null;
let objectDetector = null;
let modelsLoaded = false;

function log(...args) {
  if (DEBUG) console.debug('[ProctoringWorker]', ...args);
}

/**
 * Loads the MediaPipe WASM loader into the worker global scope.
 *
 * importScripts() executes a classic script in the worker's global scope —
 * exactly the environment MediaPipe's UMD loader expects.  This registers
 * the `ModuleFactory` global and all its internal dependencies (custom_dbg,
 * etc.) without any eval / new Function() — fully CSP-safe.
 *
 * The URL must be in script-src (cdn.jsdelivr.net is already whitelisted).
 */
function loadWasmLoaderViaImportScripts() {
  if (typeof self.importScripts !== 'function') {
    // Should never happen in a classic worker, but guard gracefully.
    throw new Error('importScripts is not available — worker must be classic (IIFE) format');
  }
  const loaderUrl = `${WASM_BASE}/vision_wasm_internal.js`;
  self.importScripts(loaderUrl);
}

async function loadModels() {
  // Step 1: Load WASM module factory via importScripts (classic-worker global scope)
  loadWasmLoaderViaImportScripts();

  // Step 2: FilesetResolver uses the now-registered ModuleFactory to init tasks
  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

  // Step 3: Create FaceLandmarker
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URLS.faceLandmarker, delegate: 'CPU' },
    outputFaceBlendshapes: true,
    runningMode: 'IMAGE',
    numFaces: 4,
    minFaceDetectionConfidence: 0.30,
    minFacePresenceConfidence: 0.30,
    minTrackingConfidence: 0.30,
  });
  log('FaceLandmarker ready');

  // Step 4: Create ObjectDetector
  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URLS.objectDetector, delegate: 'CPU' },
    runningMode: 'IMAGE',
    scoreThreshold: OBJECT_DETECTOR_SCORE_THRESHOLD,
  });
  log('ObjectDetector ready');
}

/* ───────────────────────── 1. Face detection ───────────────────────── */

function faceBoxWidth(landmarks) {
  if (!landmarks?.length) return 0;
  let minX = Infinity, maxX = -Infinity;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  return maxX - minX;
}

/* ───────────────────────── 3. Eye contact / gaze ───────────────────────── */

function computeHeadPose(landmarks) {
  if (!landmarks || landmarks.length < 468) return { yaw: 0, pitch: 0 };
  const nose = landmarks[LANDMARK.NOSE_TIP];
  const forehead = landmarks[LANDMARK.FOREHEAD];
  const chin = landmarks[LANDMARK.CHIN];
  const eyeL = landmarks[LANDMARK.EYE_OUTER_LEFT];
  const eyeR = landmarks[LANDMARK.EYE_OUTER_RIGHT];
  if (!nose || !forehead || !chin || !eyeL || !eyeR) return { yaw: 0, pitch: 0 };

  const dL = Math.abs(nose.x - eyeL.x);
  const dR = Math.abs(nose.x - eyeR.x);
  const yaw = (dL - dR) / (dL + dR || 1);

  const dUp = Math.abs(nose.y - forehead.y);
  const dDown = Math.abs(chin.y - nose.y);
  const pitch = (dDown - dUp) / (dDown + dUp || 1);

  return { yaw, pitch };
}

function blendshapeScorer(blendshapeCategories) {
  return (name) => blendshapeCategories?.find((b) => b.categoryName === name)?.score ?? 0;
}

/* ───────────────────────── 4. Mobile / phone detection ───────────────────────── */

function extractPhoneCandidates(detections) {
  const candidates = [];
  for (const detection of detections) {
    for (const category of detection.categories ?? []) {
      const label = `${category.categoryName ?? ''} ${category.displayName ?? ''}`.toLowerCase();
      if (
        label.includes('phone') ||
        label.includes('mobile') ||
        label.includes('cell') ||
        label.includes('tablet')
      ) {
        candidates.push({ score: category.score ?? 0 });
      }
    }
  }
  return candidates;
}

/* ───────────────────────── 5. Lip sync ───────────────────────── */

function computeMouthOpennessFromLandmarks(landmarks) {
  if (!landmarks || landmarks.length < 468) return 0;
  const upper = landmarks[LANDMARK.LIP_UPPER];
  const lower = landmarks[LANDMARK.LIP_LOWER];
  const forehead = landmarks[LANDMARK.FOREHEAD];
  const chin = landmarks[LANDMARK.CHIN];
  if (!upper || !lower || !forehead || !chin) return 0;
  const lipGap = Math.abs(lower.y - upper.y);
  const faceHeight = Math.abs(chin.y - forehead.y) || 0.01;
  return Math.min(1, lipGap / faceHeight);
}

/* ───────────────────────── Per-frame pipeline ───────────────────────── */

function extractFrameFeatures(bitmap) {
  const faceResult = faceLandmarker.detect(bitmap);
  const objectResult = objectDetector.detect(bitmap);

  const faceLandmarks = faceResult.faceLandmarks ?? [];
  const faceBlendshapes = faceResult.faceBlendshapes ?? [];

  const score = blendshapeScorer(faceBlendshapes[0]?.categories);
  const pose = computeHeadPose(faceLandmarks[0]);

  const primaryFaceWidth = faceBoxWidth(faceLandmarks[0]);
  const secondaryFaceWidths = faceLandmarks.slice(1).map(faceBoxWidth);

  const blendshapeJawOpen = score('jawOpen');
  const geometricJawOpen = computeMouthOpennessFromLandmarks(faceLandmarks[0]);
  const jawOpenScore = Math.max(blendshapeJawOpen, geometricJawOpen * 0.7);

  return {
    faceCount: Math.max(faceLandmarks.length, faceBlendshapes.length),
    primaryFaceWidth,
    secondaryFaceWidths,
    headYaw: pose.yaw,
    headPitch: pose.pitch,
    eyeLook: {
      outRight: score('eyeLookOutRight'),
      outLeft: score('eyeLookOutLeft'),
      inRight: score('eyeLookInRight'),
      inLeft: score('eyeLookInLeft'),
      upRight: score('eyeLookUpRight'),
      upLeft: score('eyeLookUpLeft'),
      downRight: score('eyeLookDownRight'),
      downLeft: score('eyeLookDownLeft'),
    },
    phoneCandidates: extractPhoneCandidates(objectResult.detections ?? []),
    jawOpenScore,
  };
}

self.onmessage = async (event) => {
  const { type, data } = event.data ?? {};

  if (type === 'init') {
    try {
      await loadModels();
      modelsLoaded = true;
      self.postMessage({ type: 'models_ready' });
    } catch (err) {
      modelsLoaded = false;
      self.postMessage({ type: 'models_failed', error: err?.message ?? String(err) });
    }
    return;
  }

  if (type === 'detect') {
    const { bitmap, timestamp } = data;

    if (!modelsLoaded) {
      bitmap.close();
      return;
    }

    try {
      const features = extractFrameFeatures(bitmap);
      log('detect_result payload:', features);
      self.postMessage({ type: 'detect_result', timestamp, data: features });
    } catch (err) {
      self.postMessage({ type: 'detect_error', timestamp, error: err?.message ?? String(err) });
    } finally {
      bitmap.close();
    }
  }
};
