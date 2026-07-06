import { FaceLandmarker, FilesetResolver, ObjectDetector } from '@mediapipe/tasks-vision';

let faceLandmarker = null;
let objectDetector = null;
let modelsLoaded = false;

// ── Landmark indices (FaceMesh 478-point topology) ───────────────────────────
const LM = {
  NOSE_TIP:        1,
  FOREHEAD:        10,
  CHIN:            152,
  EYE_OUTER_LEFT:  33,
  EYE_OUTER_RIGHT: 263,
  LIP_UPPER:       13,
  LIP_LOWER:       14,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/**
 * Head yaw/pitch from nose-eye-forehead-chin landmarks.
 * yaw ≈ 0 facing camera, grows as head turns left/right.
 * pitch ≈ 0 level, grows as head tilts up/down.
 */
function computeHeadPose(landmarks) {
  if (!landmarks || landmarks.length < 468) return { yaw: 0, pitch: 0 };
  const nose     = landmarks[LM.NOSE_TIP];
  const forehead = landmarks[LM.FOREHEAD];
  const chin     = landmarks[LM.CHIN];
  const eyeL     = landmarks[LM.EYE_OUTER_LEFT];
  const eyeR     = landmarks[LM.EYE_OUTER_RIGHT];
  if (!nose || !forehead || !chin || !eyeL || !eyeR) return { yaw: 0, pitch: 0 };

  const dL  = Math.abs(nose.x - eyeL.x);
  const dR  = Math.abs(nose.x - eyeR.x);
  const yaw = (dL - dR) / (dL + dR || 1);

  const dUp    = Math.abs(nose.y - forehead.y);
  const dDown  = Math.abs(chin.y - nose.y);
  const pitch  = (dDown - dUp) / (dDown + dUp || 1);

  return { yaw, pitch };
}

/** Returns the score for a named blendshape, or 0. */
function blendshapeScore(categories, name) {
  return categories?.find((b) => b.categoryName === name)?.score ?? 0;
}

/**
 * jawOpen from blendshape, supplemented by geometric lip-gap ratio.
 * Taking the max of both makes it robust when one measure is unreliable.
 */
function computeJawOpen(landmarks, blendshapeCategories) {
  const bs = blendshapeScore(blendshapeCategories, 'jawOpen');

  if (!landmarks || landmarks.length < 468) return bs;
  const upper     = landmarks[LM.LIP_UPPER];
  const lower     = landmarks[LM.LIP_LOWER];
  const forehead  = landmarks[LM.FOREHEAD];
  const chin      = landmarks[LM.CHIN];
  if (!upper || !lower || !forehead || !chin) return bs;

  const lipGap    = Math.abs(lower.y - upper.y);
  const faceH     = Math.abs(chin.y - forehead.y) || 0.01;
  const geometric = Math.min(1, lipGap / faceH) * 0.7; // scale to blendshape range

  return Math.max(bs, geometric);
}

/**
 * Extract phone candidates from ObjectDetector detections.
 * EfficientDet-Lite0 labels: "cell phone", "remote", "tablet", etc.
 */
function extractPhoneCandidates(detections) {
  const candidates = [];
  for (const det of detections ?? []) {
    for (const cat of det.categories ?? []) {
      const label = `${cat.categoryName ?? ''} ${cat.displayName ?? ''}`.toLowerCase();
      if (
        label.includes('phone') ||
        label.includes('mobile') ||
        label.includes('cell') ||
        label.includes('remote') ||
        label.includes('tablet')
      ) {
        candidates.push({ score: cat.score ?? 0 });
      }
    }
  }
  return candidates;
}

/**
 * Reduce raw MediaPipe output to the scalar struct that useProctoring expects:
 *   { faceCount, primaryFaceWidth, secondaryFaceWidths,
 *     headYaw, headPitch, jawOpenScore, phoneCandidates }
 */
function buildFrameFeatures(faceResults, objResults) {
  const faceLandmarks   = faceResults.faceLandmarks   ?? [];
  const faceBlendshapes = faceResults.faceBlendshapes ?? [];

  const faceCount            = faceLandmarks.length;
  const primaryFaceWidth     = faceBoxWidth(faceLandmarks[0]);
  const secondaryFaceWidths  = faceLandmarks.slice(1).map(faceBoxWidth);

  const pose = computeHeadPose(faceLandmarks[0]);

  const primaryCategories = faceBlendshapes[0]?.categories ?? [];
  const jawOpenScore = computeJawOpen(faceLandmarks[0], primaryCategories);

  const phoneCandidates = extractPhoneCandidates(objResults.detections);

  return {
    faceCount,
    primaryFaceWidth,
    secondaryFaceWidths,
    headYaw:      pose.yaw,
    headPitch:    pose.pitch,
    jawOpenScore,
    phoneCandidates,
  };
}

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = async (e) => {
  const { type, data } = e.data;

  if (type === 'init') {
    try {
      console.log('[Worker] Starting model initialization…');

      const vision = await FilesetResolver.forVisionTasks(
        `${self.location.origin}/models/wasm`
      );

      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${self.location.origin}/models/face_landmarker.task`,
          delegate: 'CPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 4,
        minFaceDetectionConfidence: 0.30,
        minFacePresenceConfidence:  0.30,
        minTrackingConfidence:      0.30,
      });

      objectDetector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `${self.location.origin}/models/efficientdet_lite0.tflite`,
          delegate: 'CPU',
        },
        runningMode: 'VIDEO',
        // Keep this LOW — the hook applies its own PHONE_ALERT_CONFIDENCE (0.15)
        // on top. Setting 0.4 here discards nearly every real phone detection.
        scoreThreshold: 0.10,
      });

      modelsLoaded = true;
      self.postMessage({ type: 'models_ready' });
      console.log('[Worker] ✅ All models loaded');
    } catch (err) {
      console.error('[Worker] ❌ Model load failed:', err);
      self.postMessage({ type: 'models_failed', error: err.message });
    }
  }

  if (type === 'detect' && modelsLoaded) {
    const { bitmap, timestamp } = data;
    try {
      const faceResults = faceLandmarker.detectForVideo(bitmap, timestamp);
      const objResults  = objectDetector.detectForVideo(bitmap, timestamp);

      // ← Previously the worker posted raw faceLandmarks/faceBlendshapes/detections.
      //   useProctoring.handleFrameResult destructures faceCount, headYaw, headPitch,
      //   phoneCandidates, jawOpenScore — none of which existed in that payload.
      //   Now we reduce to exactly the scalar struct the hook expects.
      const features = buildFrameFeatures(faceResults, objResults);

      self.postMessage({ type: 'detect_result', timestamp, data: features });
    } catch (err) {
      console.error('[Worker] Detection error:', err);
      self.postMessage({ type: 'detect_error', timestamp, error: err.message });
    } finally {
      bitmap.close();
    }
  }
};
