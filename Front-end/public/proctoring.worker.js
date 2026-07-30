/**
 * proctoring.worker.js (classic IIFE worker — built with vite worker.format: 'iife')
 *
 * WHY importScripts IS USED HERE:
 * ─────────────────────────────────────────────────────────────────────────────
 * MediaPipe's WASM loader (vision_wasm_internal.js) assigns `ModuleFactory`
 * and `custom_dbg` onto the global scope of whichever script loaded it.
 * When Vite pre-bundles @mediapipe/tasks-vision as an ESM and then wraps it
 * in an IIFE worker, Rollup moves all the module-level globals into the
 * factory-function closure — they never reach `globalThis`, so every call
 * throws "ModuleFactory not set".
 *
 * The only correct fix is to load the MediaPipe *CDN bundle* via
 * importScripts(), which executes in the worker's true global scope and lets
 * `ModuleFactory` land exactly where the runtime expects it.
 *
 * MESSAGE PROTOCOL
 * ─────────────────────────────────────────────────────────────────────────────
 *   in   { type: 'init' }
 *   out  { type: 'models_ready' }
 *   out  { type: 'models_failed', error: string }
 *   in   { type: 'detect', data: { bitmap: ImageBitmap, timestamp: number } }
 *   out  { type: 'detect_result', timestamp, data: FrameFeatures }
 *   out  { type: 'detect_error',  timestamp, error: string }
 */

/* ── CDN URLs ──────────────────────────────────────────────────────────────── */
const MP_BUNDLE_SCRIPT_URL = '/vision_bundle.js';
const WASM_BASE = '/wasm';

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

/* ── State ─────────────────────────────────────────────────────────────────── */
let faceLandmarker = null;
let objectDetector = null;
let modelsLoaded = false;

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function faceBoxWidth(landmarks) {
  if (!landmarks?.length) return 0;
  let minX = Infinity, maxX = -Infinity;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
  }
  return maxX - minX;
}

function computeHeadPose(landmarks) {
  if (!landmarks || landmarks.length < 468) return { yaw: 0, pitch: 0 };
  const nose     = landmarks[LANDMARK.NOSE_TIP];
  const forehead = landmarks[LANDMARK.FOREHEAD];
  const chin     = landmarks[LANDMARK.CHIN];
  const eyeL     = landmarks[LANDMARK.EYE_OUTER_LEFT];
  const eyeR     = landmarks[LANDMARK.EYE_OUTER_RIGHT];
  if (!nose || !forehead || !chin || !eyeL || !eyeR) return { yaw: 0, pitch: 0 };

  const dL  = Math.abs(nose.x - eyeL.x);
  const dR  = Math.abs(nose.x - eyeR.x);
  const yaw = (dL - dR) / (dL + dR || 1);

  const dUp    = Math.abs(nose.y - forehead.y);
  const dDown  = Math.abs(chin.y  - nose.y);
  const pitch  = (dDown - dUp) / (dDown + dUp || 1);

  return { yaw, pitch };
}

function blendshapeScorer(categories) {
  return (name) => categories?.find((b) => b.categoryName === name)?.score ?? 0;
}

function extractProhibitedObjects(detections) {
  const phones = [];
  const laptops = [];
  for (const d of detections) {
    for (const cat of d.categories ?? []) {
      const label = `${cat.categoryName ?? ''} ${cat.displayName ?? ''}`.toLowerCase();
      if (label.includes('phone') || label.includes('mobile') || label.includes('cell') || label.includes('tablet')) {
        phones.push({ score: cat.score ?? 0, label: cat.categoryName });
      }
      if (label.includes('laptop') || label.includes('computer') || label.includes('desktop') || label.includes('monitor') || label.includes('screen')) {
        laptops.push({ score: cat.score ?? 0, label: cat.categoryName });
      }
    }
  }
  return {
    phoneCandidates: phones.sort((a, b) => b.score - a.score),
    laptopCandidates: laptops.sort((a, b) => b.score - a.score),
  };
}

function computeFaceBounds(landmarks) {
  if (!landmarks?.length) {
    return {
      minX: 0, maxX: 0, minY: 0, maxY: 0,
      width: 0, height: 0,
      isCropped: true,
      hasAllKeyLandmarks: false,
      isFullyContained: false,
      cropReason: 'No landmarks detected'
    };
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const width = maxX - minX;
  const height = maxY - minY;

  const nose = landmarks[LANDMARK.NOSE_TIP];
  const forehead = landmarks[LANDMARK.FOREHEAD];
  const chin = landmarks[LANDMARK.CHIN];
  const eyeL = landmarks[LANDMARK.EYE_OUTER_LEFT];
  const eyeR = landmarks[LANDMARK.EYE_OUTER_RIGHT];
  const lipU = landmarks[LANDMARK.LIP_UPPER];
  const lipL = landmarks[LANDMARK.LIP_LOWER];

  const hasAllKeyLandmarks = Boolean(nose && forehead && chin && eyeL && eyeR && lipU && lipL);

  let cropReason = null;
  if (!hasAllKeyLandmarks) {
    cropReason = 'Missing key facial features (eyes/nose/mouth/chin)';
  } else if (minY < 0.04) {
    cropReason = 'Top of forehead cut off at top edge of camera frame';
  } else if (maxY > 0.94 || (chin && chin.y > 0.93)) {
    cropReason = 'Chin or lower face cut off at bottom edge of camera frame';
  } else if (minX < 0.04) {
    cropReason = 'Face cut off at left edge of camera frame';
  } else if (maxX > 0.96) {
    cropReason = 'Face cut off at right edge of camera frame';
  } else if (height < 0.22 || width < 0.20) {
    cropReason = 'Face too small or too far from camera';
  }

  const isCropped = Boolean(cropReason);
  const isFullyContained = hasAllKeyLandmarks && !isCropped;

  return {
    minX, maxX, minY, maxY,
    width, height,
    isCropped,
    cropReason,
    hasAllKeyLandmarks,
    isFullyContained
  };
}

function computeMouthOpenness(landmarks) {
  if (!landmarks || landmarks.length < 468) return 0;
  const upper    = landmarks[LANDMARK.LIP_UPPER];
  const lower    = landmarks[LANDMARK.LIP_LOWER];
  const forehead = landmarks[LANDMARK.FOREHEAD];
  const chin     = landmarks[LANDMARK.CHIN];
  if (!upper || !lower || !forehead || !chin) return 0;
  const lipGap    = Math.abs(lower.y - upper.y);
  const faceHeight = Math.abs(chin.y - forehead.y) || 0.01;
  return Math.min(1, lipGap / faceHeight);
}

function extractFrameFeatures(bitmap) {
  const faceResult   = faceLandmarker.detect(bitmap);
  const objectResult = objectDetector.detect(bitmap);

  const faceLandmarks  = faceResult.faceLandmarks  ?? [];
  const faceBlendshapes = faceResult.faceBlendshapes ?? [];

  const score = blendshapeScorer(faceBlendshapes[0]?.categories);
  const pose  = computeHeadPose(faceLandmarks[0]);
  const bounds = computeFaceBounds(faceLandmarks[0]);

  const secondaryFaceWidths = faceLandmarks.slice(1).map(faceBoxWidth);

  const blendshapeJawOpen  = score('jawOpen');
  const geometricJawOpen   = computeMouthOpenness(faceLandmarks[0]);
  const jawOpenScore       = Math.max(blendshapeJawOpen, geometricJawOpen * 0.7);

  const objects = extractProhibitedObjects(objectResult.detections ?? []);

  return {
    faceCount: Math.max(faceLandmarks.length, faceBlendshapes.length),
    primaryFaceWidth: bounds.width,
    primaryFaceHeight: bounds.height,
    isFullyContained: bounds.isFullyContained,
    isCropped: bounds.isCropped,
    cropReason: bounds.cropReason,
    secondaryFaceWidths,
    headYaw: pose.yaw,
    headPitch: pose.pitch,
    hasNoseAndChin: bounds.hasAllKeyLandmarks,
    noseChinNorm: bounds.height,
    eyeLook: {
      outRight:  score('eyeLookOutRight'),
      outLeft:   score('eyeLookOutLeft'),
      inRight:   score('eyeLookInRight'),
      inLeft:    score('eyeLookInLeft'),
      upRight:   score('eyeLookUpRight'),
      upLeft:    score('eyeLookUpLeft'),
      downRight: score('eyeLookDownRight'),
      downLeft:  score('eyeLookDownLeft'),
    },
    phoneCandidates: objects.phoneCandidates,
    laptopCandidates: objects.laptopCandidates,
    jawOpenScore,
  };
}

/* ── Model loading ─────────────────────────────────────────────────────────── */
async function loadModels() {
  importScripts(MP_BUNDLE_SCRIPT_URL);

  const ns =
    self.vision ||
    self.MediapipeTasksVision ||
    (self.FilesetResolver && self.FaceLandmarker && self.ObjectDetector ? self : null);

  if (!ns || !ns.FilesetResolver || !ns.FaceLandmarker || !ns.ObjectDetector) {
    throw new Error(
      '[proctoring.worker] vision_bundle.js loaded but expected classes were not found on self.'
    );
  }

  const { FaceLandmarker, ObjectDetector, FilesetResolver } = ns;

  const vision = await FilesetResolver.forVisionTasks(WASM_BASE);

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URLS.faceLandmarker,
      delegate: 'CPU',
    },
    outputFaceBlendshapes: true,
    runningMode: 'IMAGE',
    numFaces: 4,
    minFaceDetectionConfidence: 0.30,
    minFacePresenceConfidence:  0.30,
    minTrackingConfidence:      0.30,
  });

  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URLS.objectDetector,
      delegate: 'CPU',
    },
    runningMode: 'IMAGE',
    scoreThreshold: OBJECT_DETECTOR_SCORE_THRESHOLD,
  });
}

/* ── Message handler ───────────────────────────────────────────────────────── */
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
      bitmap.close();
      self.postMessage({ type: 'detect_result', timestamp, data: features });
    } catch (err) {
      bitmap.close();
      self.postMessage({ type: 'detect_error', timestamp, error: err?.message ?? String(err) });
    }
  }
};
