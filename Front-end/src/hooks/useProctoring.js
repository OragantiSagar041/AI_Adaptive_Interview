import { useCallback, useEffect, useRef, useState } from 'react'
import ProctoringWorker from './proctoring.worker.js?worker'

// ── Tunable thresholds ──────────────────────────────────────────────────
const DETECT_INTERVAL_MS = 700          // how often a frame is sent to the worker

const PHONE_ALERT_CONFIDENCE = 0.15     // min score for a phone candidate to count
const PHONE_CONSECUTIVE_FRAMES = 2      // frames in a row before raising the alert

const MULTI_FACE_CONSECUTIVE_FRAMES = 3
const NO_FACE_CONSECUTIVE_FRAMES = 5    // ~3.5s of no face at 700ms interval

const EYE_CONTACT_YAW_THRESHOLD = 0.35    // head turned left/right
const EYE_CONTACT_PITCH_THRESHOLD = 0.30  // head tilted up/down
const EYE_CONTACT_CONSECUTIVE_FRAMES = 10 // ~7s of sustained gaze-away

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

  const raiseViolation = useCallback((alertType, message) => {
    setState((s) => ({ ...s, lastAlertType: alertType }))
    setAlertCount((prev) => {
      if (prev >= maxAlerts) return prev // already terminated, don't keep counting
      const next = prev + 1
      onViolation?.({ type: alertType, message, count: next })
      if (next >= maxAlerts) onTerminate?.({ type: alertType, message })
      return next
    })
  }, [maxAlerts, onViolation, onTerminate])

  const handleFrameResult = useCallback((features) => {
    const { faceCount, secondaryFaceWidths, headYaw, headPitch, phoneCandidates, jawOpenScore } = features
    const streak = streakRef.current

    // 1 + 2. Face detection / multi-face detection
    const faceVisible = faceCount > 0
    const isMultiFace = faceCount > 1 || (secondaryFaceWidths?.length ?? 0) > 0

    streak.noFace = !faceVisible ? streak.noFace + 1 : 0
    if (streak.noFace === NO_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('no_face', 'No face detected — candidate not visible')
    }

    streak.multiFace = isMultiFace ? streak.multiFace + 1 : 0
    if (streak.multiFace === MULTI_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('multi_person', 'Multiple faces detected in frame')
    }

    // 3. Eye contact / gaze tracking
    const lookingAway =
      Math.abs(headYaw) > EYE_CONTACT_YAW_THRESHOLD ||
      Math.abs(headPitch) > EYE_CONTACT_PITCH_THRESHOLD
    streak.eyeAway = faceVisible && lookingAway ? streak.eyeAway + 1 : 0
    const eyeContactLost = streak.eyeAway >= EYE_CONTACT_CONSECUTIVE_FRAMES
    if (streak.eyeAway === EYE_CONTACT_CONSECUTIVE_FRAMES) {
      raiseViolation('eye_contact', 'Candidate looking away from screen')
    }

    // 4. Mobile / phone detection
    const phoneDetected = (phoneCandidates ?? []).some((c) => c.score >= PHONE_ALERT_CONFIDENCE)
    streak.phone = phoneDetected ? streak.phone + 1 : 0
    if (streak.phone === PHONE_CONSECUTIVE_FRAMES) {
      raiseViolation('phone', 'Mobile phone detected')
    }

    setState((s) => ({
      ...s,
      faceCount,
      faceVisible,
      multiFace: isMultiFace,
      phoneDetected,
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
