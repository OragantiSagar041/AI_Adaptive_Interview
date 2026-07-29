/**
 * proctoring.worker.js  (classic IIFE worker — built with vite worker.format: 'iife')
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
// Use the REAL published UMD bundle (not jsDelivr's synthetic "+esm" transform).
// This must be loaded with importScripts() so MediaPipe's internal WASM loader
// runs in the worker's true global scope and sets `ModuleFactory` correctly.
const MP_BUNDLE_SCRIPT_URL = '/vision_bundle.js';

// Local WASM directory (served from public/wasm/)
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

function extractPhoneCandidates(detections) {
  const candidates = [];
  for (const d of detections) {
    for (const cat of d.categories ?? []) {
      const label = `${cat.categoryName ?? ''} ${cat.displayName ?? ''}`.toLowerCase();
      if (label.includes('phone') || label.includes('mobile') || label.includes('cell') || label.includes('tablet')) {
        candidates.push({ score: cat.score ?? 0 });
      }
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
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

  const primaryFaceWidth     = faceBoxWidth(faceLandmarks[0]);
  const secondaryFaceWidths  = faceLandmarks.slice(1).map(faceBoxWidth);

  const blendshapeJawOpen  = score('jawOpen');
  const geometricJawOpen   = computeMouthOpenness(faceLandmarks[0]);
  const jawOpenScore       = Math.max(blendshapeJawOpen, geometricJawOpen * 0.7);

  return {
    faceCount: Math.max(faceLandmarks.length, faceBlendshapes.length),
    primaryFaceWidth,
    secondaryFaceWidths,
    headYaw: pose.yaw,
    headPitch: pose.pitch,
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
    phoneCandidates: extractPhoneCandidates(objectResult.detections ?? []),
    jawOpenScore,
  };
}

/* ── Model loading ─────────────────────────────────────────────────────────── */
async function loadModels() {
  // Synchronous, executes in the worker's real global scope — this is what lets
  // MediaPipe's internal importScripts() call (triggered later, inside
  // createFromOptions) correctly set `self.ModuleFactory`.
  importScripts(MP_BUNDLE_SCRIPT_URL);

  // The UMD bundle attaches its exports to a global namespace. Detect whichever
  // one is actually present rather than hard-coding a name that might not match
  // this exact build.
  const ns =
    self.vision ||
    self.MediapipeTasksVision ||
    (self.FilesetResolver && self.FaceLandmarker && self.ObjectDetector ? self : null);

  if (!ns || !ns.FilesetResolver || !ns.FaceLandmarker || !ns.ObjectDetector) {
    // If you land here: open devtools in the worker context and run
    // console.log(Object.keys(self)) right after this importScripts call,
    // find the object holding FaceLandmarker/ObjectDetector/FilesetResolver,
    // and add its name to the `ns` lookup above.
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
      self.postMessage({ type: 'detect_result', timestamp, data: features });
    } catch (err) {
      self.postMessage({ type: 'detect_error', timestamp, error: err?.message ?? String(err) });
    } finally {
      bitmap.close();
    }
  }
};
