import { useCallback, useEffect, useRef, useState } from 'react'

// ── Tunable thresholds (Production Calibrated to eliminate false alarms) ──
const DETECT_INTERVAL_MS = Number(import.meta.env?.VITE_PROCTORING_INTERVAL_MS) || 400          // frame cadence (~2.5 FPS)
const PHONE_ALERT_CONFIDENCE = Number(import.meta.env?.VITE_PROCTORING_PHONE_CONFIDENCE) || 0.68 // strict high-confidence threshold to stop mug/mouse/remote hallucinations
const PHONE_CONSECUTIVE_FRAMES = 6      // 6 consecutive frames (~2.4s) of sustained phone visibility
const PHONE_COOLDOWN_MS = 10000         // 10 seconds cooldown between phone alerts

const MULTI_FACE_CONSECUTIVE_FRAMES = 6 // 6 consecutive frames (~2.4s) to ignore background posters/glitches
const NO_FACE_CONSECUTIVE_FRAMES = 12   // 12 consecutive frames (~4.8s) allows sneezing / natural posture shifts
const EYE_CONTACT_YAW_THRESHOLD = 0.48  // head turned left/right — allows natural thinking / glancing around screen
const EYE_CONTACT_PITCH_THRESHOLD = 0.45 // head tilted up/down — allows reading questions on screen without alert
const EYE_CONTACT_CONSECUTIVE_FRAMES = 16 // 16 frames (~6.4s) of sustained looking away before alerting


// ── Screen Sharing & Multi-Platform Casting Configuration ───────────────
const SCREEN_CHECK_INTERVAL_MS = Number(import.meta.env?.VITE_SCREEN_CHECK_INTERVAL_MS) || 1000
const MAX_SCREEN_CAST_VIOLATIONS = 3
const SCREEN_CAST_GRACE_SEC = 4          // 4 seconds time per violation to read and stop screen sharing
const DEFAULT_DETECTOR_API_URL = import.meta.env?.VITE_SCREEN_DETECTOR_URL || 'http://127.0.0.1:28253'

const DEFAULT_MAX_ALERTS = 20

// ── Audio Alert Helper (Web Audio API - no external assets needed) ───────
function playAudioAlert() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch (_) { }
}

// ── Dedicated Screen Cast Violation Warning Banner with 4s Live Countdown ─
function showScreenCastWarningBanner(alertType, message, strike, maxStrikes = 3, remainingSec = 4, platforms = []) {
  if (typeof document === 'undefined') return
  let banner = document.getElementById('proctoring-cast-warning-banner')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'proctoring-cast-warning-banner'
    banner.style.position = 'fixed'
    banner.style.top = '16px'
    banner.style.left = '50%'
    banner.style.transform = 'translateX(-50%)'
    banner.style.zIndex = '9999999'
    banner.style.backgroundColor = '#991b1b'
    banner.style.color = '#ffffff'
    banner.style.padding = '14px 18px'
    banner.style.borderRadius = '16px'
    banner.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(248, 113, 113, 0.4)'
    banner.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    banner.style.fontSize = '14px'
    banner.style.display = 'flex'
    banner.style.alignItems = 'center'
    banner.style.gap = '14px'
    banner.style.border = '1px solid #ef4444'
    banner.style.maxWidth = '460px'
    banner.style.width = '92%'
    banner.style.boxSizing = 'border-box'
    banner.style.transition = 'all 0.2s ease'
    document.body.appendChild(banner)
  }

  const isFinalStrike = strike >= maxStrikes
  const isSecondStrike = strike === 2

  const headerTitle = isFinalStrike
    ? '🚫 INTERVIEW TERMINATED — SCREEN CASTING DETECTED'
    : isSecondStrike
      ? '🚨 FINAL WARNING: SCREEN CASTING ACTIVE'
      : '⚠️ PROCTORING VIOLATION: SCREEN CASTING DETECTED'

  const subHeader = isFinalStrike
    ? 'Maximum violations reached (3/3). Your interview is being submitted.'
    : `Please stop/disconnect screen mirroring immediately. You have ${remainingSec}s to disconnect.`

  const platformBadges = (platforms && platforms.length > 0)
    ? `<div style="margin-top: 6px; display: flex; gap: 6px; flex-wrap: wrap;">
        ${platforms.map(p => `<span style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.3); padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; color: #fef08a;">${p}</span>`).join('')}
       </div>`
    : ''

  const timerBadge = isFinalStrike
    ? `<span style="background: #7f1d1d; color: #fca5a5; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 12px; border: 1px solid #dc2626;">Terminated</span>`
    : `<span style="background: #1e1b4b; color: #fef08a; padding: 4px 12px; border-radius: 6px; font-weight: 800; font-size: 13px; border: 1px solid #fbbf24; display: inline-flex; align-items: center; gap: 6px;">
        ⏱️ Time to disconnect: <span id="proctoring-cast-countdown-sec" style="font-size: 15px; color: #ffffff; font-weight: 900;">${remainingSec}s</span>
       </span>`

  banner.innerHTML = `
    <span style="font-size: 32px; flex-shrink: 0; line-height: 1;">${isFinalStrike ? '🛑' : '🚨'}</span>
    <div style="flex: 1; min-width: 0;">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <div style="font-size: 14px; font-weight: 800; letter-spacing: 0.5px; color: #ffffff;">
          ${headerTitle}
        </div>
        <div style="background: ${isFinalStrike ? '#7f1d1d' : '#b91c1c'}; border: 1px solid rgba(255,255,255,0.4); padding: 2px 10px; border-radius: 9999px; font-size: 12px; font-weight: 800; color: #ffffff;">
          Violation ${strike} of ${maxStrikes}
        </div>
      </div>
      <div style="font-size: 13px; font-weight: 500; opacity: 0.95; margin-top: 4px; color: #fecaca; line-height: 1.35;">
        ${message || 'Screen casting or remote desktop software active.'}
      </div>
      ${platformBadges}
      <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
        <span style="font-size: 12px; color: #fecaca; font-weight: 500;">${subHeader}</span>
        ${timerBadge}
      </div>
    </div>
  `
  banner.style.display = 'flex'
}

function updateScreenCastCountdown(remainingSec) {
  if (typeof document === 'undefined') return
  const countdownEl = document.getElementById('proctoring-cast-countdown-sec')
  if (countdownEl) {
    countdownEl.innerText = `${remainingSec}s`
    if (remainingSec <= 2) {
      countdownEl.style.color = '#ef4444'
    }
  }
}

function hideOnScreenWarning() {
  if (typeof document === 'undefined') return
  const banner = document.getElementById('proctoring-cast-warning-banner')
  if (banner) banner.remove()
}

// ── General Non-Screen Proctoring Warning Helper ──────────────────────────
function showGeneralOnScreenWarning(alertType, message, count, maxAlerts) {
  if (typeof document === 'undefined') return
  if (document.getElementById('proctoring-cast-warning-banner')) return // prioritize screen cast banner

  let banner = document.getElementById('proctoring-general-warning-banner')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'proctoring-general-warning-banner'
    banner.style.position = 'fixed'
    banner.style.top = '16px'
    banner.style.left = '50%'
    banner.style.transform = 'translateX(-50%)'
    banner.style.zIndex = '999999'
    banner.style.backgroundColor = '#dc2626'
    banner.style.color = '#ffffff'
    banner.style.padding = '12px 20px'
    banner.style.borderRadius = '8px'
    banner.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.5)'
    banner.style.fontFamily = 'system-ui, -apple-system, sans-serif'
    banner.style.fontSize = '14px'
    banner.style.display = 'flex'
    banner.style.alignItems = 'center'
    banner.style.gap = '12px'
    banner.style.border = '2px solid #fca5a5'
    document.body.appendChild(banner)
  }

  const title = alertType === 'phone'
    ? 'PROCTORING VIOLATION: MOBILE PHONE DETECTED'
    : alertType === 'multi_person'
      ? 'PROCTORING VIOLATION: MULTIPLE PEOPLE DETECTED'
      : 'PROCTORING ALERT'

  banner.innerHTML = `
    <span style="font-size: 24px;">🚨</span>
    <div>
      <div style="font-size: 14px; font-weight: 800;">${title} (${count}/${maxAlerts})</div>
      <div style="font-size: 12px; margin-top: 2px; color: #fee2e2;">${message}</div>
    </div>
  `
  banner.style.display = 'flex'

  setTimeout(() => {
    if (banner && banner.parentNode) banner.remove()
  }, 4000)
}

/**
 * @param {Object} opts
 * @param {React.RefObject<HTMLVideoElement>} opts.videoRef - live camera feed element
 * @param {boolean} [opts.enabled] - set false to pause capture/model loading
 * @param {number} [opts.maxAlerts] - violations allowed before onTerminate fires
 * @param {(violation: {type:string, message:string, count:number, platforms?:string[]}) => void} [opts.onViolation]
 * @param {(violation: {type:string, message:string}) => void} [opts.onTerminate]
 * @param {string} [opts.workerUrl] - override worker module path if not co-located
 * @param {string} [opts.sessionId] - unique interview/session ID for biometric identity lock persistence
 * @param {boolean} [opts.enableFaceIdentityLock=true] - lock candidate face at start and alert if person changes
 * @param {boolean} [opts.enableScreenShareDetection=true] - detect all screen casting, remote desktop, & recording apps
 * @param {boolean} [opts.enableMultiDisplayDetection=true] - flag secondary / extended monitors
 * @param {boolean} [opts.isPreCheck=false] - when true, checks and reports screen status without triggering strikes, banners, or terminations
 * @param {boolean} [opts.showVisualOverlay=true] - automatically render in-DOM warning banner on violations
 * @param {boolean} [opts.playAudioAlerts=true] - trigger alert chime on violations
 * @param {string} [opts.detectorApiUrl] - endpoint for local native screen detector agent
 * @param {number} [opts.screenCheckIntervalMs] - interval in ms for screen casting checks
 */
export function useProctoring({
  videoRef,
  enabled = true,
  isPreCheck = false,
  maxAlerts = DEFAULT_MAX_ALERTS,
  onViolation,
  onTerminate,
  workerUrl,
  sessionId,
  enableScreenShareDetection = true,
  enableMultiDisplayDetection = true,
  showVisualOverlay = true,
  playAudioAlerts = true,
  detectorApiUrl = DEFAULT_DETECTOR_API_URL,
  screenCheckIntervalMs = SCREEN_CHECK_INTERVAL_MS,
} = {}) {
  const workerRef = useRef(null)
  const intervalRef = useRef(null)
  const screenCheckIntervalRef = useRef(null)
  const inFlightRef = useRef(false)
  const streakRef = useRef({ multiFace: 0, noFace: 0, phone: 0, eyeAway: 0 })
  const lastPhoneAlertTimeRef = useRef(0)
  const lastScreenAlertTimeRef = useRef(0)

  // ── Dedicated 3-Strike Screen Casting Management (4s grace per strike) ───
  const screenCastStrikesRef = useRef(0)
  const isCastingActiveRef = useRef(false)
  const castingCountdownSecRef = useRef(SCREEN_CAST_GRACE_SEC)
  const castingCountdownTimerRef = useRef(null)
  const castingStateRef = useRef({ type: '', message: '', platforms: [] })
  const triggerScreenCastStrikeRef = useRef(null)

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
    // ── Universal Screen Casting & Sharing State ──
    screenCastingDetected: false,
    screenShareActive: false,
    screenRecordingActive: false,
    multipleDisplaysDetected: false,
    displayCount: 1,
    detectedPlatforms: [],
    castingDetails: null,
    agentConnected: false,
    screenCastStrikes: 0,
  })
  const [alertCount, setAlertCount] = useState(0)
  const alertCountRef = useRef(0)

  // Trigger screen cast violation strike (Exactly 3 strikes, 4 seconds per strike)
  const triggerScreenCastStrike = useCallback(() => {
    if (isPreCheck) return // In pre-check mode, no strikes, warnings, or terminations are triggered!
    if (screenCastStrikesRef.current >= MAX_SCREEN_CAST_VIOLATIONS) return

    screenCastStrikesRef.current += 1
    const strike = screenCastStrikesRef.current
    const { type, message, platforms } = castingStateRef.current
    const alertType = type || 'screen_casting'
    const alertMessage = message || 'Screen casting or remote display software detected'

    console.warn(`[useProctoring] 🚨 Screen Cast Violation (${strike}/${MAX_SCREEN_CAST_VIOLATIONS}): ${alertMessage}`, platforms)

    // Visual overlay with live 4-second countdown timer
    if (showVisualOverlay) {
      showScreenCastWarningBanner(alertType, alertMessage, strike, MAX_SCREEN_CAST_VIOLATIONS, SCREEN_CAST_GRACE_SEC, platforms)
    }

    // Audio chime
    if (playAudioAlerts) {
      playAudioAlert()
    }

    // Notify caller with explicit strike count and grace seconds
    onViolationRef.current?.({
      type: alertType,
      message: alertMessage,
      count: strike,
      maxAlerts: MAX_SCREEN_CAST_VIOLATIONS,
      platforms,
      remainingSeconds: strike >= MAX_SCREEN_CAST_VIOLATIONS ? 0 : SCREEN_CAST_GRACE_SEC,
      isScreenCasting: true
    })

    // If strike 3 reached, terminate session immediately
    if (strike >= MAX_SCREEN_CAST_VIOLATIONS) {
      if (castingCountdownTimerRef.current) {
        clearInterval(castingCountdownTimerRef.current)
        castingCountdownTimerRef.current = null
      }
      hideOnScreenWarning()
      onTerminateRef.current?.({
        type: alertType,
        message: `Screen casting / mirroring violation limit reached (${strike}/${MAX_SCREEN_CAST_VIOLATIONS} strikes). Interview terminated.`
      })
      return
    }

    // Start 4-second countdown window for this strike
    castingCountdownSecRef.current = SCREEN_CAST_GRACE_SEC
    if (castingCountdownTimerRef.current) {
      clearInterval(castingCountdownTimerRef.current)
      castingCountdownTimerRef.current = null
    }

    castingCountdownTimerRef.current = setInterval(() => {
      // If candidate disconnected screen sharing, stop countdown immediately
      if (!isCastingActiveRef.current) {
        if (castingCountdownTimerRef.current) {
          clearInterval(castingCountdownTimerRef.current)
          castingCountdownTimerRef.current = null
        }
        hideOnScreenWarning()
        return
      }

      castingCountdownSecRef.current -= 1
      const sec = castingCountdownSecRef.current

      if (sec > 0) {
        updateScreenCastCountdown(sec)
      } else {
        // 4 seconds expired for this strike!
        if (castingCountdownTimerRef.current) {
          clearInterval(castingCountdownTimerRef.current)
          castingCountdownTimerRef.current = null
        }
        // If STILL casting when 4 seconds expire, advance to next strike!
        if (isCastingActiveRef.current) {
          triggerScreenCastStrikeRef.current?.()
        }
      }
    }, 1000)
  }, [isPreCheck, showVisualOverlay, playAudioAlerts])

  useEffect(() => {
    triggerScreenCastStrikeRef.current = triggerScreenCastStrike
  }, [triggerScreenCastStrike])

  const raiseViolation = useCallback((alertType, message, platforms = []) => {
    if (isPreCheck) return // In pre-check mode, no general violations are raised!
    if (alertCountRef.current >= maxAlerts) return // already terminated

    const next = alertCountRef.current + 1
    alertCountRef.current = next
    setAlertCount(next)

    console.warn(`[useProctoring] 🚨 Violation (${next}/${maxAlerts}): ${alertType} — ${message}`, platforms)
    setState((s) => ({ ...s, lastAlertType: alertType, detectedPlatforms: platforms }))

    if (showVisualOverlay) {
      showGeneralOnScreenWarning(alertType, message, next, maxAlerts)
    }
    if (playAudioAlerts) {
      playAudioAlert()
    }

    onViolationRef.current?.({ type: alertType, message, count: next, platforms })
    if (next >= maxAlerts) {
      onTerminateRef.current?.({ type: alertType, message })
    }
  }, [maxAlerts, isPreCheck, showVisualOverlay, playAudioAlerts])

  const handleFrameResult = useCallback((features) => {
    if (typeof features?.faceCount === 'undefined') {
      console.error(
        '[useProctoring] ❌ Worker payload shape mismatch! ' +
        'Expected {faceCount, secondaryFaceWidths, phoneCandidates, ...} but got:',
        features,
        '\n→ Ensure ONLY src/hooks/proctoring.worker.js is used, not src/workers/proctoring.worker.js'
      )
      return
    }

    const {
      faceCount,
      secondaryFaceWidths,
      primaryFaceWidth,
      headYaw,
      headPitch,
      phoneCandidates,
      jawOpenScore,
    } = features
    const streak = streakRef.current

    // 1 + 2. Face detection / multi-face detection
    const faceVisible = faceCount > 0

    const validSecondaryFaces = (secondaryFaceWidths || []).filter((w) => {
      const isSignificantWidth = w >= 0.10
      const isSignificantRatio = primaryFaceWidth ? (w / primaryFaceWidth) >= 0.35 : true
      return isSignificantWidth && isSignificantRatio
    })

    const isMultiFace = validSecondaryFaces.length > 0 || (faceCount > 1 && validSecondaryFaces.length > 0)

    streak.noFace = !faceVisible ? streak.noFace + 1 : 0
    if (streak.noFace >= NO_FACE_CONSECUTIVE_FRAMES) {
      raiseViolation('no_face', 'No face detected — candidate not visible')
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

    // 4. Mobile / phone detection
    const isPhone = phoneCandidates?.length > 0 && phoneCandidates[0].score >= PHONE_ALERT_CONFIDENCE
    streak.phone = isPhone ? streak.phone + 1 : 0
    if (streak.phone >= PHONE_CONSECUTIVE_FRAMES) {
      const now = Date.now()
      if (now - lastPhoneAlertTimeRef.current >= PHONE_COOLDOWN_MS) {
        raiseViolation('phone', 'Mobile phone detected in frame')
        lastPhoneAlertTimeRef.current = now
      }
      streak.phone = 0
    }

    setState((s) => ({
      ...s,
      faceCount,
      faceVisible,
      multiFace: isMultiFace,
      phoneDetected: isPhone,
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
        const bitmap = await createImageBitmap(video, { resizeWidth: 480, resizeHeight: 360, resizeQuality: 'low' })
          .catch(() => createImageBitmap(video))

        inFlightRef.current = true
        worker.postMessage({ type: 'detect', data: { bitmap, timestamp: Date.now() } }, [bitmap])
      } catch (e) {
        console.warn('[useProctoring] frame capture error:', e)
      }
    }, DETECT_INTERVAL_MS)

    return () => clearInterval(intervalRef.current)
  }, [enabled, state.modelsReady, videoRef])

  // ── 5. Accurate Screen Sharing, Casting & Recording Detection Engine ─
  const inspectScreens = useCallback(async () => {
    if (!enabled || (!enableScreenShareDetection && !enableMultiDisplayDetection)) return

    let isExtended = false
    let screenCount = 1
    let nativeAgentData = null
    let agentOnline = false
    let isCasting = false
    let isShareActive = false
    let isRecording = false
    let detectedPlatforms = []
    let violationMessage = ''
    let violationType = ''

    // ── Tier 1: Local Native Inspector Agent (Accurate Non-Localhost Streams & Critical Hosts)
    if (detectorApiUrl) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 1000)
        const resp = await fetch(`${detectorApiUrl}/status`, {
          signal: controller.signal,
          headers: { 'Accept': 'application/json' }
        })
        clearTimeout(timeoutId)

        if (resp.ok) {
          nativeAgentData = await resp.json()
          agentOnline = true

          // ONLY trigger if the agent identified a genuine CRITICAL condition:
          if (nativeAgentData.overall_severity === 'CRITICAL') {
            const platforms = nativeAgentData.detected_platforms || []
            detectedPlatforms.push(...platforms)

            const activeStreams = nativeAgentData.network?.active_streams || []
            const activeVirtualAdapters = nativeAgentData.display?.virtual_displays_active
            const isSdStreaming = Boolean(nativeAgentData.spacedesk?.actively_streaming)
            const isSdScreenAttached = Boolean(nativeAgentData.spacedesk?.virtual_display_attached)
            const isRdp = Boolean(nativeAgentData.session?.is_remote_session)

            const flaggedProcs = nativeAgentData.processes?.flagged_processes || []
            const criticalProcs = flaggedProcs.filter(p => p.severity === 'CRITICAL')
            const warningProcs = flaggedProcs.filter(p => p.severity === 'WARNING')

            if (isSdStreaming || isSdScreenAttached || activeStreams.length > 0 || activeVirtualAdapters) {
              isCasting = true
              violationType = 'screen_casting'
              const streamNames = activeStreams.map(s => s.platform).join(', ') || 'SpaceDesk'
              violationMessage = `Screen casting active via ${streamNames}`
            } else if (isRdp || criticalProcs.length > 0) {
              isShareActive = true
              violationType = 'screen_share_detected'
              const names = criticalProcs.map(p => p.name).join(', ') || (isRdp ? 'RDP Remote Desktop' : 'Screen Share')
              violationMessage = `Active screen sharing/remote access detected: ${names}`
            } else if (warningProcs.length > 0 && warningProcs.some(p => p.category.includes('Recording'))) {
              isRecording = true
              violationType = 'screen_recording'
              const recNames = warningProcs.map(p => p.name).join(', ')
              violationMessage = `Active screen recording software detected: ${recNames}`
            }
          }

          if (nativeAgentData.display?.active_monitors) {
            screenCount = nativeAgentData.display.active_monitors
            isExtended = screenCount > 1
          }
        }
      } catch (err) {
        agentOnline = false
      }
    }

    // ── Tier 2: Browser-Native Window & Screen APIs ────────────────────
    // Only flags if an actual physical or virtual second monitor is actively connected
    if (typeof window !== 'undefined') {
      if (typeof window.screen?.isExtended === 'boolean' && window.screen.isExtended) {
        isExtended = true
        screenCount = Math.max(screenCount, 2)
      }

      if ('getScreenDetails' in window && typeof window.getScreenDetails === 'function') {
        try {
          const screenDetails = await window.getScreenDetails().catch(() => null)
          if (screenDetails?.screens?.length > 1) {
            isExtended = true
            screenCount = screenDetails.screens.length
          }
        } catch (_) { }
      }
    }

    detectedPlatforms = [...new Set(detectedPlatforms)]

    // ── Dedicated Screen Cast Violation Evaluation ─────────────────────
    const isDetected = isCasting || isShareActive || isRecording || (enableMultiDisplayDetection && isExtended)

    if (isDetected) {
      const type = violationType || (isExtended ? 'multiple_displays' : 'screen_casting')
      const msg = violationMessage || (isExtended ? `Multiple displays detected (${screenCount} connected screens)` : 'Screen casting, sharing, or remote control detected')
      const plats = detectedPlatforms.length > 0 ? detectedPlatforms : (isExtended ? ['Multi-Monitor'] : ['Screen Cast'])

      castingStateRef.current = {
        type,
        message: msg,
        platforms: plats,
      }

      if (!isPreCheck) {
        if (!isCastingActiveRef.current) {
          // Candidate started screen casting / mirroring!
          isCastingActiveRef.current = true
          triggerScreenCastStrike()
        }
      } else {
        // In pre-check mode: ensure no violation banner or strike countdown is active
        hideOnScreenWarning()
      }
    } else {
      // Screen is CLEAN (no casting, no remote access, no secondary monitor)
      if (isCastingActiveRef.current) {
        console.log('[useProctoring] ✅ Screen casting stopped by candidate. Dismissing warning banner.')
        isCastingActiveRef.current = false
        if (castingCountdownTimerRef.current) {
          clearInterval(castingCountdownTimerRef.current)
          castingCountdownTimerRef.current = null
        }
        hideOnScreenWarning()
      } else {
        hideOnScreenWarning()
      }
    }

    setState((s) => ({
      ...s,
      screenCastingDetected: isCasting,
      screenShareActive: isShareActive,
      screenRecordingActive: isRecording,
      multipleDisplaysDetected: isExtended,
      displayCount: screenCount,
      detectedPlatforms,
      castingDetails: nativeAgentData || { isExtended, screenCount, detectedPlatforms },
      agentConnected: agentOnline,
      screenCastStrikes: isPreCheck ? 0 : screenCastStrikesRef.current,
    }))
  }, [enabled, isPreCheck, enableScreenShareDetection, enableMultiDisplayDetection, detectorApiUrl, triggerScreenCastStrike])

  // Periodic polling for screen casting
  useEffect(() => {
    if (!enabled || (!enableScreenShareDetection && !enableMultiDisplayDetection)) return

    inspectScreens()
    screenCheckIntervalRef.current = setInterval(inspectScreens, screenCheckIntervalMs)

    let removeScreenListener = null
    if (typeof window !== 'undefined' && 'getScreenDetails' in window) {
      window.getScreenDetails()
        .then((details) => {
          const onChange = () => inspectScreens()
          details.addEventListener('screenschange', onChange)
          details.addEventListener('currentscreenchange', onChange)
          removeScreenListener = () => {
            details.removeEventListener('screenschange', onChange)
            details.removeEventListener('currentscreenchange', onChange)
          }
        })
        .catch(() => { })
    }

    return () => {
      if (screenCheckIntervalRef.current) clearInterval(screenCheckIntervalRef.current)
      if (castingCountdownTimerRef.current) clearInterval(castingCountdownTimerRef.current)
      removeScreenListener?.()
      hideOnScreenWarning()
    }
  }, [enabled, enableScreenShareDetection, enableMultiDisplayDetection, screenCheckIntervalMs, inspectScreens])

  // ── 6. Anti-Screenshot & Copy Protection ─────────────────────────────
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

      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
      }

      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleCopy = (e) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyDown);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('copy', handleCopy);

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

  // 7. Lip sync: compare mouth-openness against expected speaking activity.
  const checkLipSync = useCallback((jawOpenScore, isAudioActive, threshold = 0.12) => {
    return Boolean(isAudioActive) && Number(jawOpenScore ?? 0) < threshold
  }, [])

  return {
    ...state,
    alertCount,
    maxAlerts,
    checkLipSync,
    refreshScreenStatus: inspectScreens,
  }
}

export default useProctoring
