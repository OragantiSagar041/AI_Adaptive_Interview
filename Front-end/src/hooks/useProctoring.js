import { useCallback, useEffect, useRef, useState } from 'react'
import ProctoringWorker from './proctoring.worker.js?worker'

// ── Tunable thresholds ──────────────────────────────────────────────────
const DETECT_INTERVAL_MS = 700          // how often a frame is sent to the worker

const PHONE_ALERT_CONFIDENCE = 0.45     // raised to eliminate false positives for spectacles
// from mugs, glasses, dark objects at low confidence
const PHONE_CONSECUTIVE_FRAMES = 3      // 3 consecutive frames (~2.1s) — reduces false positives
// a real phone in view persists; a misclassification does not

const MULTI_FACE_CONSECUTIVE_FRAMES = 2 // 2 frames (~1.4s) before raising the alert
const NO_FACE_CONSECUTIVE_FRAMES = 4    // ~2.8s of no face at 700ms interval

const EYE_CONTACT_YAW_THRESHOLD = 0.25    // head turned left/right (lowered to be more sensitive)
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
  const streakRef = useRef({ multiFace: 0, noFace: 0, phone: 0, eyeAway: 0 })

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
    faceVisible: true,
    multiFace: false,
    phoneDetected: false,
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
    // Guard: validate the worker payload shape. The old workers/proctoring.worker.js stub
    // sends raw landmark arrays (wrong shape) — catch it immediately so it is visible.
    if (typeof features?.faceCount === 'undefined') {
      console.error(
        '[useProctoring] ❌ Worker payload shape mismatch! ' +
        'Expected {faceCount, secondaryFaceWidths, phoneCandidates, ...} but got:',
        features,
        '\n→ Ensure ONLY src/hooks/proctoring.worker.js is used, not src/workers/proctoring.worker.js'
      )
      return
    }

    const { faceCount, secondaryFaceWidths, headYaw, headPitch, phoneCandidates, jawOpenScore } = features
    const streak = streakRef.current

    // 1 + 2. Face detection / multi-face detection
    const faceVisible = faceCount > 0
    const isMultiFace = faceCount > 1 || (secondaryFaceWidths?.length ?? 0) > 0

    streak.noFace = !faceVisible ? streak.noFace + 1 : 0
    if (streak.noFace >= NO_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('no_face', 'No face detected — candidate not visible')
      streak.noFace = 0 // reset so it can fire again
    }

    streak.multiFace = isMultiFace ? streak.multiFace + 1 : 0
    if (streak.multiFace >= MULTI_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('multi_person', 'Multiple faces detected in frame')
      streak.multiFace = 0 // reset so it can fire again
    }

    // 3. Eye contact / gaze tracking
    const lookingAway =
      Math.abs(headYaw) > EYE_CONTACT_YAW_THRESHOLD ||
      Math.abs(headPitch) > EYE_CONTACT_PITCH_THRESHOLD
    streak.eyeAway = faceVisible && lookingAway ? streak.eyeAway + 1 : 0
    const eyeContactLost = streak.eyeAway >= EYE_CONTACT_CONSECUTIVE_FRAMES
    if (streak.eyeAway >= EYE_CONTACT_CONSECUTIVE_FRAMES) {
      raiseViolation('eye_contact', 'Please maintain eye contact with the screen')
      streak.eyeAway = 0 // reset so it can fire again
    }

    // 4. Mobile / phone detection
    const isPhone = phoneCandidates?.length > 0 && phoneCandidates[0].score > PHONE_ALERT_CONFIDENCE
    streak.phone = isPhone ? streak.phone + 1 : 0
    if (streak.phone >= PHONE_CONSECUTIVE_FRAMES) {
      raiseViolation('phone', 'Mobile phone detected in frame')
      streak.phone = 0 // reset so it can fire again
    }

    setState((s) => ({
      ...s,
      faceCount,
      faceVisible,
      multiFace: isMultiFace,
      phoneDetected: isPhone,  // isPhone is the variable declared above
      eyeContactLost,
      jawOpenScore,
    }))
  }, [raiseViolation])

  // ── Init worker + model loading ──────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const worker = workerUrl
      ? new Worker(workerUrl, { type: 'module' })
      : new ProctoringWorker()

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
      // Pause frame capture when the tab is backgrounded.
      // The tab-switch detector (in useInterviewSession) already logs this as
      // a violation — no need to waste CPU on ML inference while invisible.
      if (document.visibilityState !== 'visible') return

      const video = videoRef?.current
      const worker = workerRef.current
      if (!video || !worker || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return
      if (inFlightRef.current) return // skip tick if previous frame hasn't returned yet

      try {
        const bitmap = await createImageBitmap(video)
        inFlightRef.current = true
        worker.postMessage({ type: 'detect', data: { bitmap, timestamp: Date.now() } }, [bitmap])
      } catch (e) {
        // transient capture failures (e.g. video not painted yet) are non-fatal
        console.warn('[useProctoring] frame capture error:', e)
      }
    }, DETECT_INTERVAL_MS)

    return () => clearInterval(intervalRef.current)
  }, [enabled, state.modelsReady, videoRef])

  // 6. Anti-Screenshot & Copy Protection
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      // Prevent PrintScreen key
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        navigator.clipboard.writeText('');
        raiseViolation('screenshot_attempt', 'Screenshot attempt detected');
      }

      // Prevent common Mac screenshot shortcuts (Cmd + Shift + 3/4/5)
      if (e.metaKey && e.shiftKey && (e.key === '3' || e.key === '4' || e.key === '5')) {
        e.preventDefault();
        navigator.clipboard.writeText('');
        raiseViolation('screenshot_attempt', 'Screenshot attempt detected');
      }

      // Prevent Windows snipping tool shortcut (Win + Shift + S)
      if (e.metaKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        navigator.clipboard.writeText('');
        raiseViolation('screenshot_attempt', 'Screenshot attempt detected');
      }

      // Prevent Save As (Cmd/Ctrl + S)
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
      }

      // Prevent Print (Cmd/Ctrl + P)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault(); // Disable right-click
    };

    const handleCopy = (e) => {
      e.preventDefault();
      navigator.clipboard.writeText('');
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyDown); // Catch printscreen on keyup sometimes
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);

    // Apply CSS to prevent text selection
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyDown);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('copy', handleCopy);

      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
    };
  }, [enabled, raiseViolation]);

  // 5. Lip sync: compare mouth-openness against expected speaking activity.
  const checkLipSync = useCallback((jawOpenScore, isAudioActive, threshold = 0.12) => {
    return !!isAudioActive && jawOpenScore < threshold
  }, [])

  return {
    ...state,
    alertCount,
    maxAlerts,
    checkLipSync,
  }
}

export default useProctoring
