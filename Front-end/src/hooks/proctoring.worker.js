/**
 * proctoring.worker.js
 *
 * Web Worker that owns two MediaPipe models (FaceLandmarker, ObjectDetector)
 * and does all per-frame feature extraction off the main thread. Only small
 * derived scalars are sent back — not raw landmark arrays — to keep
 * postMessage payloads cheap on every tick.
 *
 * Covers 5 detection capabilities in one pass per frame:
 *   1. Face detection      -> faceCount, primaryFaceWidth
 *   2. Multi-face detection-> secondaryFaceWidths (anything beyond the first face)
 *   3. Eye contact / gaze  -> headYaw, headPitch, eyeLook blendshapes
 *   4. Mobile/phone detect -> phoneCandidates (object detector, phone-ish labels)
 *   5. Lip sync            -> jawOpenScore (blendshape + geometric fallback)
 *
 * Message protocol:
 *   in  { type: 'init' }
 *   out { type: 'models_ready' } | { type: 'models_failed', error }
 *   in  { type: 'detect', data: { bitmap, timestamp } }   (bitmap transferred)
 *   out { type: 'detect_result', timestamp, data: FrameFeatures }
 *   out { type: 'detect_error', timestamp, error }
 */

import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

// Set DEBUG = true locally to verify worker payload shapes in DevTools console.
// Always set back to false before committing to production.
const DEBUG = false;

const MODEL_URLS = {
  wasm:
    import.meta.env.VITE_MEDIAPIPE_WASM_URL ||
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  faceLandmarker:
    import.meta.env.VITE_FACE_LANDMARKER_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  objectDetector:
    import.meta.env.VITE_OBJECT_DETECTOR_MODEL_URL ||
    'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
};

/**
 * Kept permissive at the model layer — the consuming hook applies its own,
 * stricter confidence threshold on top of this (see PHONE_ALERT_CONFIDENCE
 * in useProctoring.js). This just avoids discarding borderline detections
 * before JS ever sees them.
 */
const OBJECT_DETECTOR_SCORE_THRESHOLD = 0.10;

// Standard MediaPipe FaceMesh landmark indices
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

async function loadModels() {
  const vision = await FilesetResolver.forVisionTasks(MODEL_URLS.wasm);

  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URLS.faceLandmarker, delegate: 'CPU' },
    outputFaceBlendshapes: true,
    runningMode: 'IMAGE',
    numFaces: 4,                       // detect up to 4 faces -> powers multi-face detection
    minFaceDetectionConfidence: 0.30,  // relaxed for occluded/angled faces
    minFacePresenceConfidence: 0.30,
    minTrackingConfidence: 0.30,
  });
  log('FaceLandmarker ready');

  objectDetector = await ObjectDetector.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URLS.objectDetector, delegate: 'CPU' },
    runningMode: 'IMAGE',
    scoreThreshold: OBJECT_DETECTOR_SCORE_THRESHOLD,
  });
  log('ObjectDetector ready');
}

/* ───────────────────────── 1. Face detection ───────────────────────── */

/** Normalised bounding-box width of one face's landmark set (0–1 coords). */
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

/**
 * Approximates head yaw/pitch from FaceMesh landmarks.
 *   yaw   ≈ 0 facing camera; grows when the head turns left/right.
 *   pitch ≈ 0 level; grows when the head tilts up/down.
 * Uses relative distances (not absolute coordinates) so it self-normalises
 * across different camera distances/zoom levels.
 */
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

/** Look up a blendshape score by category name (also used for eyeLook + jawOpen). */
function blendshapeScorer(blendshapeCategories) {
  return (name) => blendshapeCategories?.find((b) => b.categoryName === name)?.score ?? 0;
}

/* ───────────────────────── 4. Mobile / phone detection ───────────────────────── */

/**
 * Extract phone-related detections from ObjectDetector output.
 * EfficientDet-Lite0 labels we look for: "cell phone", "mobile phone",
 * "telephone", "remote"/"tablet" (commonly confused with phones by this model).
 */
function extractPhoneCandidates(detections) {
  const candidates = [];
  for (const detection of detections) {
    for (const category of detection.categories ?? []) {
      const label = `${category.categoryName ?? ''} ${category.displayName ?? ''}`.toLowerCase();
      if (
        label.includes('phone') ||
        label.includes('telephone')
      ) {
        candidates.push({ score: category.score ?? 0 });
      }
    }
  }
  return candidates;
}

/* ───────────────────────── 5. Lip sync (mouth openness) ───────────────────────── */

/**
 * Mouth-openness score computed directly from lip landmarks, as a fallback
 * / supplement to the blendshape scorer. More reliable on non-frontal faces.
 * Returns normalised [0–1] ratio of lip gap to face height.
 */
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

/** Runs both models on one bitmap and reduces output to hook-friendly scalars. */
function extractFrameFeatures(bitmap) {
  const faceResult = faceLandmarker.detect(bitmap);
  const objectResult = objectDetector.detect(bitmap);

  const faceLandmarks = faceResult.faceLandmarks ?? [];
  const faceBlendshapes = faceResult.faceBlendshapes ?? [];

  // Primary face: first result (typically highest-confidence / largest)
  const score = blendshapeScorer(faceBlendshapes[0]?.categories);
  const pose = computeHeadPose(faceLandmarks[0]);

  const primaryFaceWidth = faceBoxWidth(faceLandmarks[0]);
  const secondaryFaceWidths = faceLandmarks.slice(1).map(faceBoxWidth); // -> multi-face signal

  // jawOpen: blend blendshape score with geometric measurement for robustness
  const blendshapeJawOpen = score('jawOpen');
  const geometricJawOpen = computeMouthOpennessFromLandmarks(faceLandmarks[0]);
  const jawOpenScore = Math.max(blendshapeJawOpen, geometricJawOpen * 0.7); // -> lip-sync signal

  return {
    // 1. Face detection
    faceCount: Math.max(faceLandmarks.length, faceBlendshapes.length),
    primaryFaceWidth,
    // 2. Multi-face detection
    secondaryFaceWidths,
    // 3. Eye contact / gaze
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
    // 4. Mobile / phone detection
    phoneCandidates: extractPhoneCandidates(objectResult.detections ?? []),
    // 5. Lip sync
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
