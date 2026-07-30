import { useCallback, useEffect, useRef, useState } from 'react'
// ── Tunable thresholds ──────────────────────────────────────────────────
const DETECT_INTERVAL_MS = 700          // how often a frame is sent to the worker

const PHONE_ALERT_CONFIDENCE = 0.45     // raised to eliminate false positives for spectacles
const LAPTOP_ALERT_CONFIDENCE = 0.40    // threshold for laptops / external screens
const PHONE_CONSECUTIVE_FRAMES = 3      // 3 consecutive frames (~2.1s) — reduces false positives
const LAPTOP_CONSECUTIVE_FRAMES = 3

const MULTI_FACE_CONSECUTIVE_FRAMES = 2 // 2 frames (~1.4s) before raising the alert
const NO_FACE_CONSECUTIVE_FRAMES = 4    // ~2.8s of no face at 700ms interval

// Normalised minimum primary face width/height (0..1) required to count as a visible full face.
const MIN_FACE_WIDTH = 0.20
const MIN_FACE_HEIGHT = 0.22
// Maximum absolute yaw/pitch allowed for a "frontal" face used in verification.
const MAX_FACE_YAW = 0.35
const MAX_FACE_PITCH = 0.35

const EYE_CONTACT_YAW_THRESHOLD = 0.25    // head turned left/right
const EYE_CONTACT_PITCH_THRESHOLD = 0.20  // head tilted up/down
const EYE_CONTACT_CONSECUTIVE_FRAMES = 4  // ~2.8s of sustained gaze-away

const DEFAULT_MAX_ALERTS = 3

/**
 * @param {Object} opts
 * @param {React.RefObject<HTMLVideoElement>} opts.videoRef - live camera feed element
 * @param {boolean} [opts.enabled] - set false to pause capture/model loading
 * @param {number} [opts.maxAlerts] - violations allowed before onTerminate fires
 * @param {(violation: {type:string, message:string, count:number}) => void} [opts.onViolation]
 * @param {(violation: {type:string, message:string}) => void} [opts.onTerminate]
 * @param {string} [opts.workerUrl] - override worker module path if not co-located
 */
export function useProctoring({
  videoRef,
  enabled = true,
  maxAlerts = DEFAULT_MAX_ALERTS,
  onViolation,
  onTerminate,
  workerUrl,
} = {}) {
  const workerRef = useRef(null)
  const intervalRef = useRef(null)
  const inFlightRef = useRef(false) // avoid overlapping detect calls if a frame is slow
  const streakRef = useRef({ multiFace: 0, noFace: 0, phone: 0, laptop: 0, eyeAway: 0 })

  const onViolationRef = useRef(onViolation)
  const onTerminateRef = useRef(onTerminate)
  useEffect(() => {
    onViolationRef.current = onViolation
    onTerminateRef.current = onTerminate
  }, [onViolation, onTerminate])

  const [state, setState] = useState({
    modelsReady: false,
    modelsFailed: false,
    faceCount: 0,
    primaryFaceWidth: 0,
    primaryFaceHeight: 0,
    isFullyContained: false,
    isCropped: false,
    cropReason: null,
    faceVisible: false,
    multiFace: false,
    phoneDetected: false,
    laptopDetected: false,
    prohibitedObjectDetected: false,
    eyeContactLost: false,
    jawOpenScore: 0,
    lastAlertType: null,
  })
  const [alertCount, setAlertCount] = useState(0)
  const alertCountRef = useRef(0)

  const raiseViolation = useCallback((alertType, message) => {
    if (alertCountRef.current >= maxAlerts) return // already terminated

    const next = alertCountRef.current + 1
    alertCountRef.current = next
    setAlertCount(next)

    console.warn(`[useProctoring] 🚨 Violation: ${alertType} — ${message}`)
    setState((s) => ({ ...s, lastAlertType: alertType }))

    onViolationRef.current?.({ type: alertType, message, count: next })
    if (next >= maxAlerts) onTerminateRef.current?.({ type: alertType, message })
  }, [maxAlerts])

  const handleFrameResult = useCallback((features) => {
    if (typeof features?.faceCount === 'undefined') {
      console.error(
        '[useProctoring] ❌ Worker payload shape mismatch! Expected {faceCount, ...} but got:',
        features
      )
      return
    }

    const {
      faceCount,
      primaryFaceWidth,
      primaryFaceHeight,
      isFullyContained,
      isCropped,
      cropReason,
      secondaryFaceWidths,
      headYaw,
      headPitch,
      phoneCandidates,
      laptopCandidates,
      jawOpenScore,
      hasNoseAndChin
    } = features
    const streak = streakRef.current

    try {
      console.debug('[useProctoring] frame features:', { faceCount, primaryFaceWidth, primaryFaceHeight, isFullyContained, isCropped, cropReason, headYaw, headPitch })
    } catch (e) { /* ignore logging */ }

    // 1 + 2. Face detection / multi-face detection / Full face containment
    const widthOk = (primaryFaceWidth ?? 0) >= MIN_FACE_WIDTH
    const heightOk = (primaryFaceHeight ?? 0) >= MIN_FACE_HEIGHT
    const poseOk = Math.abs(headYaw || 0) <= MAX_FACE_YAW && Math.abs(headPitch || 0) <= MAX_FACE_PITCH
    const noseChinOk = !!hasNoseAndChin

    // Strict faceVisible requires face count === 1, full containment, no edge cropping, and valid pose
    const faceVisible = faceCount === 1 && !!isFullyContained && widthOk && heightOk && poseOk && noseChinOk && !isCropped
    const isMultiFace = faceCount > 1 || (secondaryFaceWidths?.length ?? 0) > 0

    streak.noFace = !faceVisible ? streak.noFace + 1 : 0
    if (streak.noFace >= NO_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('no_face', cropReason || 'Full face not visible in camera frame')
      streak.noFace = 0
    }

    streak.multiFace = isMultiFace ? streak.multiFace + 1 : 0
    if (streak.multiFace >= MULTI_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('multi_person', 'Multiple faces detected in frame')
      streak.multiFace = 0
    }

    // 3. Eye contact / gaze tracking
    const lookingAway =
      Math.abs(headYaw) > EYE_CONTACT_YAW_THRESHOLD ||
      Math.abs(headPitch) > EYE_CONTACT_PITCH_THRESHOLD
    streak.eyeAway = faceVisible && lookingAway ? streak.eyeAway + 1 : 0
    const eyeContactLost = streak.eyeAway >= EYE_CONTACT_CONSECUTIVE_FRAMES
    if (streak.eyeAway >= EYE_CONTACT_CONSECUTIVE_FRAMES) {
      raiseViolation('eye_contact', 'Please maintain eye contact with the screen')
      streak.eyeAway = 0
    }

    // 4. Mobile phone detection
    const isPhone = phoneCandidates?.length > 0 && phoneCandidates[0].score > PHONE_ALERT_CONFIDENCE
    streak.phone = isPhone ? streak.phone + 1 : 0
    if (streak.phone >= PHONE_CONSECUTIVE_FRAMES) {
      raiseViolation('phone', 'Mobile phone detected in frame')
      streak.phone = 0
    }

    // 5. Laptop / Computer screen detection
    const isLaptop = laptopCandidates?.length > 0 && laptopCandidates[0].score > LAPTOP_ALERT_CONFIDENCE
    streak.laptop = isLaptop ? streak.laptop + 1 : 0
    if (streak.laptop >= LAPTOP_CONSECUTIVE_FRAMES) {
      raiseViolation('laptop', 'Prohibited laptop / screen detected in frame')
      streak.laptop = 0
    }

    const prohibitedObjectDetected = isPhone || isLaptop

    setState((s) => ({
      ...s,
      faceCount,
      primaryFaceWidth: primaryFaceWidth ?? 0,
      primaryFaceHeight: primaryFaceHeight ?? 0,
      isFullyContained: !!isFullyContained,
      isCropped: !!isCropped,
      cropReason: cropReason || null,
      faceVisible,
      multiFace: isMultiFace,
      phoneDetected: isPhone,
      laptopDetected: isLaptop,
      prohibitedObjectDetected,
      eyeContactLost,
      jawOpenScore,
    }))
  }, [raiseViolation])

  // ── Init worker + model loading ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const worker = workerUrl
      ? new Worker(workerUrl)
      : new Worker('/proctoring.worker.js')

    workerRef.current = worker
    worker.postMessage({ type: 'init' })

    worker.onmessage = (e) => {
      const { type, data, error } = e.data ?? {}
      switch (type) {
        case 'models_ready':
          setState((s) => ({ ...s, modelsReady: true, modelsFailed: false }))
          break
        case 'models_failed':
          console.error('[useProctoring] model load failed:', error)
          setState((s) => ({ ...s, modelsReady: false, modelsFailed: true }))
          break
        case 'detect_result':
          inFlightRef.current = false
          handleFrameResult(data)
          break
        case 'detect_error':
          inFlightRef.current = false
          console.warn('[useProctoring] detect error:', error)
          break
        default:
          break
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [enabled, workerUrl, handleFrameResult])

  // ── Frame capture loop ───────────────────────────────────────────────
  useEffect(() => {
    if (!enabled || !state.modelsReady) return

    intervalRef.current = setInterval(async () => {
      if (document.visibilityState !== 'visible') return

      const video = videoRef?.current
      const worker = workerRef.current
      if (!video || !worker || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return
      if (inFlightRef.current) return

      try {
        const bitmap = await createImageBitmap(video)
        inFlightRef.current = true
        worker.postMessage({ type: 'detect', data: { bitmap, timestamp: Date.now() } }, [bitmap])
      } catch (e) {
        console.warn('[useProctoring] frame capture error:', e)
      }
    }, DETECT_INTERVAL_MS)

    return () => clearInterval(intervalRef.current)
  }, [enabled, state.modelsReady, videoRef])

  // Anti-Screenshot & Copy Protection
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        raiseViolation('screenshot_attempt', 'Screenshot attempt detected');
      }
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
        e.preventDefault();
        raiseViolation('screenshot_attempt', 'Screenshot attempt detected');
      }
      if (e.metaKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        raiseViolation('screenshot_attempt', 'Screenshot attempt detected');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, raiseViolation]);

  return {
    ...state,
    alertCount,
    resetAlerts: useCallback(() => {
      alertCountRef.current = 0
      setAlertCount(0)
    }, []),
  }
}

export default useProctoring
