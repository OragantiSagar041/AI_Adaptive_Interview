import { useState, useEffect, useRef } from 'react'
import Swal from 'sweetalert2'
import api from '../../utils/api'
import { useProctoring } from '../../hooks/useProctoring'
import { useScreenshotProtection } from '../../hooks/useScreenshotProtection'
import { useExamSecurity } from '../../hooks/useExamSecurity'
import useCandidateWebRTC from '../../hooks/useCandidateWebRTC'

export const useInterviewSecurity = ({
  sessionId,
  interviewIdRef,
  sessionDetailRef,
  videoPreviewRef,
  mediaStreamRef,
  screenStreamRef,
  isDisclaimerAccepted,
  showAllSet,
  loading,
  currentQuestion,
  currentQuestionIndex,
  questions,
  isRoundTwo,
  interviewType,
  monitoringToken,
  behavioralStatsRef,
  globalFaceAlertsRef,
  noiseAlertCountRef,
  handleSubmitInterview,
  isSubmittingRef,
  audioRmsRef,
  lipSyncStreakRef,
  lipSyncCooldownRef
}) => {
  // Proctoring/Recording states
  const [proctoringAlert, setProctoringAlert] = useState('')
  const [securityMessage, setSecurityMessage] = useState('')
  const proctoringAlertTimeoutRef = useRef(null)
  const securityMessageTimeoutRef = useRef(null)

  const [faceAlertCount, setFaceAlertCount] = useState(0)
  const [noiseAlertCount, setNoiseAlertCount] = useState(0)
  const [showNoiseBanner, setShowNoiseBanner] = useState(false)
  const [fullscreenWarning, setFullscreenWarning] = useState(false)
  const [screenShareWarning, setScreenShareWarning] = useState(false)
  const [screenShareViolations, setScreenShareViolations] = useState(0)

  useEffect(() => {
    return () => {
      if (proctoringAlertTimeoutRef.current) clearTimeout(proctoringAlertTimeoutRef.current)
      if (securityMessageTimeoutRef.current) clearTimeout(securityMessageTimeoutRef.current)
    }
  }, [])

  // Fullscreen enforcement
  useEffect(() => {
    if (!isDisclaimerAccepted) return

    const checkFullscreen = () => {
      if (!document.fullscreenElement) {
        setFullscreenWarning(true)
      } else {
        setFullscreenWarning(false)
      }
    }
    document.addEventListener('fullscreenchange', checkFullscreen)

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen)
    }
  }, [isDisclaimerAccepted])

  const enableFullscreen = () => {
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log(err))
    }
    setFullscreenWarning(false)
  }

  const handleScreenShareStop = () => {
    setScreenShareViolations(prev => {
      const next = prev + 1
      if (next >= 4) {
        setScreenShareWarning(false)
        Swal.fire({
          title: 'Interview Terminated',
          text: 'Screen sharing was stopped 4 times. Your responses have been saved.',
          icon: 'error',
          background: '#161c2d',
          color: '#fff',
          customClass: {
            popup: 'border border-white/8 rounded-2xl shadow-2xl',
            title: 'text-xl font-bold text-white',
            htmlContainer: 'text-slate-300 text-sm',
            confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
          },
          buttonsStyling: false
        })
        if (handleSubmitInterview) handleSubmitInterview(true)
      } else {
        setScreenShareWarning(true)
      }
      return next
    })
  }

  const lastAlertTimeRef = useRef({})

  const recordAlertMetric = async (type, details = '') => {
    const now = Date.now()
    if (lastAlertTimeRef.current[type] && (now - lastAlertTimeRef.current[type] < 5000)) {
      return false // Throttle same alert type to once every 5 seconds
    }
    lastAlertTimeRef.current[type] = now

    const ts = new Date().toISOString()

    try {
      await api.post('/proctoring/violation', {
        interview_id: interviewIdRef.current || '',
        candidate_id: sessionDetailRef.current?.candidate_id || '',
        violation_type: type,
        details: details || type,
        timestamp: ts,
      })
    } catch (e) {
      if (interviewIdRef.current) {
        try {
          await api.post(`/session/${interviewIdRef.current}/violation`, {
            type,
            count: 1,
            timestamp: ts,
            details: details || type,
          })
        } catch (e2) {
          console.warn('Failed to log violation to backend', e2)
        }
      }
    }

    if (type === 'noise_alert') {
      if (noiseAlertCountRef?.current >= 10) {
        Swal.fire({
          title: 'Interview Terminated',
          text: `Your interview has been automatically submitted because you exceeded the maximum allowed background noise alerts (10).`,
          icon: 'error',
          background: '#161c2d',
          color: '#fff',
          confirmButtonText: 'Close Interview',
          allowOutsideClick: false,
          allowEscapeKey: false,
          customClass: {
            popup: 'border border-white/8 rounded-2xl shadow-2xl z-[99999]',
            title: 'text-xl font-bold text-white',
            htmlContainer: 'text-slate-300 text-sm',
            confirmButton: 'bg-red-500 hover:bg-red-600 text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
          },
          buttonsStyling: false
        }).then(() => {
          if (handleSubmitInterview) handleSubmitInterview(true, "Terminated: Exceeded Background Noise Alerts (10)")
        })
      }
    } else if (type === 'tab_switch') {
      // Handled elsewhere
    } else if (
      type === 'window_blur' ||
      type === 'devtools_open' ||
      type === 'multi_monitor' ||
      type === 'clipboard_attempt' ||
      type === 'print_attempt' ||
      type === 'save_attempt'
    ) {
      // Advisory-only types
    } else {
      if (behavioralStatsRef?.current) behavioralStatsRef.current.faceAlerts += 1
      if (globalFaceAlertsRef) globalFaceAlertsRef.current += 1
      const count = globalFaceAlertsRef ? globalFaceAlertsRef.current : 1
      setFaceAlertCount(count)

      if (count >= 20) {
        Swal.fire({
          title: 'Interview Terminated',
          text: `Your interview has been automatically submitted because you exceeded the maximum allowed face alerts (20). Last alert reason: ${type}`,
          icon: 'error',
          background: '#161c2d',
          color: '#fff',
          confirmButtonText: 'Close Interview',
          allowOutsideClick: false,
          allowEscapeKey: false,
          customClass: {
            popup: 'border border-white/8 rounded-2xl shadow-2xl z-[99999]',
            title: 'text-xl font-bold text-white',
            htmlContainer: 'text-slate-300 text-sm',
            confirmButton: 'bg-red-500 hover:bg-red-600 text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
          },
          buttonsStyling: false
        }).then(() => {
          if (handleSubmitInterview) handleSubmitInterview(true, `Terminated: Exceeded Face Alerts (20) - Last: ${type}`)
        })
      }
    }
    return true
  }

  const proctoring = useProctoring({
    videoRef: videoPreviewRef,
    enabled: isDisclaimerAccepted && !showAllSet && !loading,
    maxAlerts: 999,
    onViolation: async (v) => {
      const recorded = await recordAlertMetric(v.type)
      if (!recorded) return

      setProctoringAlert(v.message)
      if (proctoringAlertTimeoutRef.current) clearTimeout(proctoringAlertTimeoutRef.current)
      proctoringAlertTimeoutRef.current = setTimeout(() => setProctoringAlert(''), 3000)
    }
  })

  const telemetryRoundType = currentQuestion?.type === 'case_study'
    ? 'case_study'
    : (currentQuestion?.type === 'coding'
      ? 'coding'
      : (isRoundTwo
        ? (interviewType === 'Non-Technical' ? 'case_study' : 'coding')
        : 'verbal'))

  const telemetryData = {
    round_type: telemetryRoundType,
    current_question: currentQuestionIndex + 1,
    total_questions: questions?.length || 0,
    question_text: currentQuestion?.text || '',
    proctoring_alerts: screenShareViolations + noiseAlertCount + faceAlertCount + (behavioralStatsRef?.current?.tabSwitches || 0),
    proctoring_status: {
      modelsReady: proctoring.modelsReady,
      modelsFailed: proctoring.modelsFailed,
      faceVisible: proctoring.faceVisible,
      faceCount: proctoring.faceCount,
      multiFace: proctoring.multiFace,
      phoneDetected: proctoring.phoneDetected,
      eyeContactLost: proctoring.eyeContactLost,
      lastAlertType: proctoring.lastAlertType,
    },
  }

  useCandidateWebRTC(sessionId, mediaStreamRef, telemetryData, monitoringToken, screenStreamRef)

  const liveHeartbeatDataRef = useRef(null)
  useEffect(() => {
    liveHeartbeatDataRef.current = telemetryData
  }, [telemetryData])

  useEffect(() => {
    if (!sessionId || !monitoringToken) return

    const captureSnapshot = () => {
      const video = videoPreviewRef?.current
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width))
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', 0.55)
      } catch {
        return null
      }
    }

    const sendHeartbeat = () => {
      const liveData = liveHeartbeatDataRef.current || {}
      const proctoringStatus = liveData.proctoring_status || {}
      const alertTypes = [proctoringStatus.lastAlertType].filter(Boolean)
      api.post('/live-heartbeat', {
        link_id: sessionId,
        snapshot_dataurl: captureSnapshot(),
        current_question: liveData.current_question,
        total_questions: liveData.total_questions,
        face_visible: proctoringStatus.faceVisible,
        proctoring_alerts: liveData.proctoring_alerts || 0,
        alert_types: alertTypes,
        last_alert_type: proctoringStatus.lastAlertType || null,
        face_count: proctoringStatus.faceCount || 0,
        multi_face: !!proctoringStatus.multiFace,
        phone_detected: !!proctoringStatus.phoneDetected,
        eye_contact_lost: !!proctoringStatus.eyeContactLost,
        round_type: liveData.round_type,
      }, {
        headers: { Authorization: `Bearer ${monitoringToken}` },
      }).catch(() => { })
    }

    sendHeartbeat()
    const intervalId = setInterval(sendHeartbeat, 5000)
    return () => clearInterval(intervalId)
  }, [sessionId, monitoringToken, videoPreviewRef])

  const SCREENSHOT_ALERT_MESSAGES = {
    screenshot_shortcut: 'Screenshots are not allowed during this interview.',
  }

  useScreenshotProtection({
    enabled: isDisclaimerAccepted && !showAllSet && !isSubmittingRef?.current,
    onAttempt: async (v) => {
      const recorded = await recordAlertMetric(v.type)
      if (!recorded) return

      const message = SCREENSHOT_ALERT_MESSAGES[v.type] || 'Screenshots are not allowed during this interview.'
      setSecurityMessage(message)
      if (securityMessageTimeoutRef.current) clearTimeout(securityMessageTimeoutRef.current)
      securityMessageTimeoutRef.current = setTimeout(() => setSecurityMessage(''), 4000)
    }
  })

  // Track lip sync anomaly
  useEffect(() => {
    if (!audioRmsRef) return
    const isAudioActive = audioRmsRef.current > 0.18
    const mismatch = proctoring.checkLipSync(proctoring.jawOpenScore, isAudioActive)
    const now = Date.now()

    if (mismatch && now > (lipSyncCooldownRef?.current || 0)) {
      if (lipSyncStreakRef) lipSyncStreakRef.current += 1
    } else if (!mismatch) {
      if (lipSyncStreakRef) lipSyncStreakRef.current = Math.max(0, lipSyncStreakRef.current - 1)
    }

    if (lipSyncStreakRef?.current >= 5) {
      if (lipSyncCooldownRef) lipSyncCooldownRef.current = now + 8000
      if (lipSyncStreakRef) lipSyncStreakRef.current = 0
      recordAlertMetric('lip_sync')
      setSecurityMessage('Audio detected without matching lip movement')
      if (securityMessageTimeoutRef.current) clearTimeout(securityMessageTimeoutRef.current)
      securityMessageTimeoutRef.current = setTimeout(() => setSecurityMessage(''), 3000)
    }
  }, [proctoring.jawOpenScore, audioRmsRef, lipSyncStreakRef, lipSyncCooldownRef, proctoring])

  useExamSecurity({
    enabled: isDisclaimerAccepted && !showAllSet && !isSubmittingRef?.current,
    onViolation: async ({ type, message }) => {
      const recorded = await recordAlertMetric(type)
      if (!recorded) return

      setSecurityMessage(message)
      if (securityMessageTimeoutRef.current) clearTimeout(securityMessageTimeoutRef.current)
      securityMessageTimeoutRef.current = setTimeout(() => setSecurityMessage(''), 4000)
    },
  })

  return {
    proctoringAlert,
    setProctoringAlert,
    securityMessage,
    setSecurityMessage,
    faceAlertCount,
    setFaceAlertCount,
    noiseAlertCount,
    setNoiseAlertCount,
    showNoiseBanner,
    setShowNoiseBanner,
    fullscreenWarning,
    setFullscreenWarning,
    screenShareWarning,
    setScreenShareWarning,
    screenShareViolations,
    setScreenShareViolations,
    enableFullscreen,
    handleScreenShareStop,
    recordAlertMetric,
    proctoring,
    modelsFailed: proctoring.modelsFailed
  }
}
