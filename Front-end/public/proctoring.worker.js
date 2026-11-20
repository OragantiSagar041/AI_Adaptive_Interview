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

const OBJECT_DETECTOR_SCORE_THRESHOLD = 0.30;

const LANDMARK = {
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  EYE_OUTER_LEFT: 33,
  EYE_OUTER_RIGHT: 263,
  LIP_UPPER: 13,
  LIP_LOWER: 14,
  EAR_LEFT: 234,
  EAR_RIGHT: 454,
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

// Bounding box IoU helper for competitor object suppression
function computeIoU(boxA, boxB) {
  if (!boxA || !boxB) return 0;
  const xA = Math.max(boxA.originX, boxB.originX);
  const yA = Math.max(boxA.originY, boxB.originY);
  const xB = Math.min(boxA.originX + boxA.width, boxB.originX + boxB.width);
  const yB = Math.min(boxA.originY + boxA.height, boxB.originY + boxB.height);

  const interWidth = Math.max(0, xB - xA);
  const interHeight = Math.max(0, yB - yA);
  const interArea = interWidth * interHeight;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  const unionArea = areaA + areaB - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

const BENIGN_OBJECTS = [
  'bottle', 'cup', 'wine glass', 'bowl', 'mug', 'book', 'mouse',
  'apple', 'orange', 'banana', 'laptop', 'keyboard', 'tv', 'monitor',
  'chair', 'couch', 'clock', 'tie', 'remote'
];

function extractPhoneCandidates(detections, faceLandmarks, bitmap, pose) {
  const candidates = [];

  // Identify all high-confidence benign desk/handheld objects (bottles, cups, mugs, books)
  const benignDetections = [];
  for (const d of detections) {
    const topCat = d.categories?.[0];
    if (topCat) {
      const catName = (topCat.categoryName || '').toLowerCase();
      if (BENIGN_OBJECTS.some((b) => catName.includes(b))) {
        benignDetections.push({
          label: catName,
          score: topCat.score || 0,
          boundingBox: d.boundingBox,
        });
      }
    }
  }

  // Pre-compute face geometry if face landmarks are available
  const forehead = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.FOREHEAD] : null;
  const chin = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.CHIN] : null;
  const faceHeight = (forehead && chin) ? Math.max(0.12, Math.abs(chin.y - forehead.y)) : 0.20;
  const earLeft = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.EAR_LEFT] : null;
  const earRight = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.EAR_RIGHT] : null;
  const noseTip = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.NOSE_TIP] : null;
  const eyeL = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.EYE_OUTER_LEFT] : null;
  const eyeR = (faceLandmarks && faceLandmarks.length >= 468) ? faceLandmarks[LANDMARK.EYE_OUTER_RIGHT] : null;

  for (const d of detections) {
    for (const cat of d.categories ?? []) {
      const label = `${cat.categoryName ?? ''} ${cat.displayName ?? ''}`.toLowerCase();

      // Explicitly reject non-phone classes (remotes, cameras, microphones, earphones, laptops)
      const isExcluded =
        label.includes('remote') ||
        label.includes('camera') ||
        label.includes('headphone') ||
        label.includes('earphone') ||
        label.includes('microphone') ||
        label.includes('mic') ||
        label.includes('laptop') ||
        label.includes('keyboard') ||
        label.includes('mouse') ||
        label.includes('pen') ||
        label.includes('book');

      if (isExcluded) continue;

      // Only target actual mobile / cell phones
      const isTarget =
        label === 'cell phone' ||
        label === 'mobile phone' ||
        label.includes('cell phone') ||
        label.includes('mobile phone');

      if (isTarget) {
        const score = cat.score ?? 0;

        // Discard low-confidence noise detections below 0.50
        if (score < 0.50) {
          continue;
        }

        // 1. Direct Competitor Suppression:
        // If the top prediction for this bounding box is actually a benign object with higher score, ignore phone
        const topCatName = (d.categories?.[0]?.categoryName || '').toLowerCase();
        const topCatScore = d.categories?.[0]?.score || 0;
        if (BENIGN_OBJECTS.some((b) => topCatName.includes(b)) && topCatScore >= score) {
          continue;
        }

        // 2. Spatial Overlap Suppression:
        // If this detection overlaps significantly with a detected desk object (e.g. laptop, cup, mouse)
        let suppressedByOverlap = false;
        for (const b of benignDetections) {
          if (computeIoU(d.boundingBox, b.boundingBox) > 0.25 && b.score >= score * 0.9) {
            suppressedByOverlap = true;
            break;
          }
        }
        if (suppressedByOverlap) {
          continue;
        }

        // 3. Physical & Geometric Validation
        if (bitmap && d.boundingBox) {
          const boxW = d.boundingBox.width;
          const boxH = d.boundingBox.height;
          const boxAreaNorm = (boxW * boxH) / (bitmap.width * bitmap.height);
          const boxWidthNorm = boxW / bitmap.width;
          const boxHeightNorm = boxH / bitmap.height;
          const boxMaxDim = Math.max(boxWidthNorm, boxHeightNorm);

          // Discard tiny noise specks (< 1.2% frame area or < 4% width/height)
          if (boxAreaNorm < 0.012 || boxWidthNorm < 0.04 || boxHeightNorm < 0.04) {
            continue;
          }

          // Discard oversized boxes (> 38% frame area or > 60% in both dimensions)
          if (boxAreaNorm > 0.38 || (boxWidthNorm > 0.60 && boxHeightNorm > 0.60)) {
            continue;
          }

          // Aspect ratio validation: smartphones are elongated rectangles (typically 1.3:1 to 2.5:1)
          const aspectRatio = Math.max(boxW, boxH) / Math.max(1, Math.min(boxW, boxH));
          if (aspectRatio < 1.15 || aspectRatio > 3.6) {
            continue;
          }

          // Relative to candidate face size:
          if (faceLandmarks && faceLandmarks.length >= 468) {
            // A real phone held in view is at least 25% of face height
            if (boxMaxDim < faceHeight * 0.25) {
              continue;
            }

            const centerX = (d.boundingBox.originX + boxW / 2) / bitmap.width;
            const centerY = (d.boundingBox.originY + boxH / 2) / bitmap.height;

            // Eyeglasses / Spectacles suppression (bridge of nose / eyes)
            if (noseTip && eyeL && eyeR) {
              const eyeCenterY = (eyeL.y + eyeR.y) / 2;
              const eyeCenterX = (eyeL.x + eyeR.x) / 2;
              const distToGlasses = Math.hypot(centerX - eyeCenterX, centerY - eyeCenterY);
              if (distToGlasses < faceHeight * 0.25 && boxHeightNorm < faceHeight * 0.40) {
                continue; // Spectacles frames false positive
              }
            }

            // Headset, Earbuds, and Ear Profile Suppression (Both ears, any angle)
            const distToEarL = earLeft ? Math.hypot(centerX - earLeft.x, centerY - earLeft.y) : Infinity;
            const distToEarR = earRight ? Math.hypot(centerX - earRight.x, centerY - earRight.y) : Infinity;
            const minDistToEar = Math.min(distToEarL, distToEarR);

            if (minDistToEar < faceHeight * 0.45) {
              // Real phone held to ear covers the cheek and jaw (box height >= 58% face height)
              // In-ear earbuds or headphone cups are compact and don't extend down to jaw
              if (boxHeightNorm < faceHeight * 0.58 && score < 0.80) {
                continue; // Suppressed: earbud / headphone artifact
              }
            }
          }
        }

        candidates.push({
          score,
          label: cat.categoryName || 'phone',
          boundingBox: d.boundingBox,
        });
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
    phoneCandidates: extractPhoneCandidates(objectResult.detections ?? [], faceLandmarks[0], bitmap, pose),
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
