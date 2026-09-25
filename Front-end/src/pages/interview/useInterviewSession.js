import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import api from '../../utils/api'
import { setCandidateSessionAuth, getCandidateSessionToken, withCandidateAuth } from '../../utils/candidateAuth'
import { countFillers } from './interviewUtils'
import { useInterviewMedia, SEGMENT_SILENCE_MS } from './useInterviewMedia'
import { useInterviewSecurity } from './useInterviewSecurity'

const langMap = {
  'Hindi': 'hi-IN',
  'Telugu': 'te-IN',
  'Tamil': 'ta-IN',
  'Malayalam': 'ml-IN',
  'Kannada': 'kn-IN',
  'English': 'en-IN'
}

export const formatCandidateName = (text, candidateName) => {
  if (!text || !candidateName || candidateName.toLowerCase() === 'candidate') return text
  const cleanName = candidateName.trim()
  if (!cleanName) return text

  let formatted = text
  // 1. Full name case-insensitive match
  const escapedFull = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  formatted = formatted.replace(new RegExp(`\\b${escapedFull}\\b`, 'gi'), cleanName)

  // 2. Individual parts (e.g. first/last name)
  const parts = cleanName.split(/\s+/).filter(p => p.length >= 2)
  parts.forEach(p => {
    const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    formatted = formatted.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), p)
  })

  // 3. Normalize introductory phrases
  formatted = formatted.replace(/\bmyself\s+/gi, 'Myself ')
  formatted = formatted.replace(/\bmy name is\s+/gi, 'My name is ')
  formatted = formatted.replace(/\bi am\s+/gi, 'I am ')

  return formatted
}

export const useInterviewSession = (sessionId, interviewType, startRoundTwo) => {
  const navigate = useNavigate()

  // Screen States
  const [loading, setLoading] = useState(true)
  const [showAllSet, setShowAllSet] = useState(false)
  const [error, setError] = useState(null)
  const [scheduledStart, setScheduledStart] = useState(null)
  const [isCompleted, setIsCompleted] = useState(false)
  const _sessionKey = sessionId ? `interview_session_${sessionId}` : null
  const _savedSession = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null


  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false)
  const [agreeChecked, setAgreeChecked] = useState(false)
  const [autoReconnecting, setAutoReconnecting] = useState(!!_savedSession?.accepted)

  // ── Phase 3: Browser online/offline detection ────────────────────────────
  // navigator.onLine gives the initial state; events keep it up to date.
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Voice Cloning intermediate state
  const [showVoiceCloneSetup, setShowVoiceCloneSetup] = useState(false)
  const [clonedVoiceId, setClonedVoiceId] = useState(null)
  const clonedVoiceIdRef = useRef(null)

  // Session details from backend
  const [sessionDetail, setSessionDetail] = useState(null)
  const sessionDetailRef = useRef(null)   // ref so async callbacks always read the latest value
  const [interviewId, setInterviewId] = useState('')
  const [monitoringToken, setMonitoringToken] = useState('')
  const monitoringTokenRef = useRef('')
  const interviewIdRef = useRef('') // Add ref for interviewId to access in async functions

  useEffect(() => {
    monitoringTokenRef.current = monitoringToken
  }, [monitoringToken])

  useEffect(() => {
    interviewIdRef.current = interviewId
  }, [interviewId])

  useEffect(() => {
    sessionDetailRef.current = sessionDetail
  }, [sessionDetail])

  // Session questions and round states
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(_savedSession?.currentQuestionIndex || 0)
  const currentQuestion = questions[currentQuestionIndex]
  const codingTask = currentQuestion?.codingTask || currentQuestion || {}
  const [isRoundTwo, setIsRoundTwo] = useState(false)
  const isRoundTwoRef = useRef(false)
  const [isMediaReady, setIsMediaReady] = useState(false)

  // Tracking and control refs
  const noiseAlertCountRef = useRef(0)
  const isSubmittingRef = useRef(false)
  const isNextingRef = useRef(false)
  const behavioralStatsRef = useRef({ wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 })
  const globalFaceAlertsRef = useRef(0)
  const audioRmsRef = useRef(0)
  const lipSyncStreakRef = useRef(0)
  const lipSyncCooldownRef = useRef(0)

  // References for forward-delegation to hooks
  const handleSubmitInterviewRef = useRef(null)
  const securityRef = useRef(null)
  const startOrRestartSpeechRecognitionRef = useRef(null)
  const startBackgroundNoiseMonitorRef = useRef(null)
  const speakAIQuestionRef = useRef(null)

  // Speech & Transcription states and refs needed by hooks
  const [transcriptionText, setTranscriptionText] = useState('')
  const [interimTranscriptText, setInterimTranscriptText] = useState('')
  const isSpeechRecordingRef = useRef(false)
  const isTTSPlayingRef = useRef(false)
  const candidateNameRef = useRef('Candidate')
  const interviewLanguageRef = useRef('English')

  // ── Media & Recording Hook ──
  const media = useInterviewMedia({
    sessionDetailRef,
    interviewIdRef,
    isSpeechRecordingRef,
    isTTSPlayingRef,
    candidateNameRef,
    interviewLanguageRef,
    handleScreenShareStop: () => securityRef.current?.handleScreenShareStop(),
    formatCandidateName,
    setTranscriptionText,
    startOrRestartSpeechRecognition: () => startOrRestartSpeechRecognitionRef.current?.(),
    startBackgroundNoiseMonitor: (s) => startBackgroundNoiseMonitorRef.current?.(s),
    speakAIQuestion: (q) => speakAIQuestionRef.current?.(q),
    setIsDisclaimerAccepted,
    setIsMediaReady,
    _sessionKey,
    questions,
    enableFullscreen: () => securityRef.current?.enableFullscreen(),
    langMap
  })

  const {
    audioMixerCtxRef,
    audioMixerDestRef,
    videoPreviewRef,
    mediaStreamRef,
    screenStreamRef,
    cameraRecorderRef,
    screenRecorderRef,
    cameraChunksRef,
    screenChunksRef,
    recordedMimeTypeRef,
    visualizerCanvasRef,
    visualizerActiveRef,
    visualizerAudioCtxRef,
    whisperMediaRecorderRef,
    whisperAudioChunksRef,
    whisperPauseTimeoutRef,
    whisperFinalizedTranscriptRef,
    segmentRecorderRef,
    segmentChunksRef,
    segmentHasSpeechRef,
    segmentPeakRmsRef,
    segmentStartTimeRef,
    segmentCuttingRef,
    segmentTranscribeChainRef,
    liveInterimGhostRef,
    transcribeInFlightRef,
    visualizeAudio,
    startSegmentedWhisperCapture,
    beginNewSegment,
    markSegmentHasSpeech,
    cutCurrentSegment,
    transcribeSegment,
    mergeSegmentChunks,
    flushWhisperTranscription,
    promptScreenShare,
    setupMedia,
    restartScreenShare,
    stopRecorderAsync
  } = media

  // ── Proctoring & Security Hook ──
  const security = useInterviewSecurity({
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
    handleSubmitInterview: (term, reason) => handleSubmitInterviewRef.current?.(term, reason),
    isSubmittingRef,
    audioRmsRef,
    lipSyncStreakRef,
    lipSyncCooldownRef
  })

  useEffect(() => {
    securityRef.current = security
  }, [security])

  const {
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
    recordAlertMetric,
    proctoring,
    modelsFailed,
    handleScreenShareStop
  } = security

  // Upload states
  const [uploadPercentage, setUploadPercentage] = useState(0)
  const [uploadingText, setUploadingText] = useState('')
  const [skipCountdown, setSkipCountdown] = useState(30)
  const [showSkipButton, setShowSkipButton] = useState(false)
  const [isMobileDevice, setIsMobileDevice] = useState(false)

  // Mobile Screen Detection
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      // Only block actual mobile devices — do NOT check window width.
      // Narrow browser windows (e.g. DevTools open) must not trigger this.
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobile = mobileRegex.test(userAgent.toLowerCase());

      if (isMobile) {
        setIsMobileDevice(true);
        Swal.fire({
          icon: 'error',
          title: 'Device Not Supported',
          text: 'This proctored interview requires a desktop or laptop computer. Mobile devices are not supported.',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          background: '#161c2d',
          color: '#fff',
          customClass: {
            popup: 'border border-white/8 rounded-2xl shadow-2xl',
            title: 'text-xl font-bold text-white',
            htmlContainer: 'text-slate-300 text-sm'
          }
        });
      } else {
        setIsMobileDevice(false);
      }
    };

    checkMobile();
    // No resize listener needed since we no longer check window width
  }, []);

  // Answer state
  const [codeAnswer, setCodeAnswer] = useState(_savedSession?.codeAnswer || '')
  const [selectedLanguage, setSelectedLanguage] = useState(_savedSession?.selectedLanguage || 'python')
  const [codeOutput, setCodeOutput] = useState('')
  const [runResultData, setRunResultData] = useState(null)
  const [evaluatedCount, setEvaluatedCount] = useState(0)
  const [selectedTestCase, setSelectedTestCase] = useState(0)
  const [consoleOutput, setConsoleOutput] = useState('Console output will display here after execution.')
  const [activeConsoleTab, setActiveConsoleTab] = useState('results')
  const [activeRightTab, setActiveRightTab] = useState('code')
  const [compiling, setCompiling] = useState(false)
  const [globalCountdown, setGlobalCountdown] = useState(0)
  const [totalDuration, setTotalDuration] = useState(0)
  // (isRoundTwo and isRoundTwoRef defined above with session states)
  const [showRound2Confirm, setShowRound2Confirm] = useState(false)
  const codingRoundStartedRef = useRef(false)
  const [codingRoundLoading, setCodingRoundLoading] = useState(false)
  const [codingRoundData, setCodingRoundData] = useState(null)
  const [aiInsights, setAiInsights] = useState({ clarity: 50, technicalDepth: 50, confidence: 50 })
  const [showDeviceCheck, setShowDeviceCheck] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const prefetchedQuestionsRef = useRef([])  // background-fetched next batch
  const isPrefetchingRef = useRef(false)     // prevent duplicate fetches

  // Fetch AI Insights dynamically — only after candidate session is authenticated
  useEffect(() => {
    const iid = interviewId || sessionDetail?.interview_id || sessionId
    // Don't attempt until we have both an interview ID and a candidate session token
    if (!iid || !monitoringToken) return

    let stopped = false

    const fetchInsights = async () => {
      try {
        const response = await api.get(`/api/interview/${iid}/insights`)
        setAiInsights(response.data)
      } catch (err) {
        // Stop polling immediately on auth errors — retrying is pointless
        // until the candidate session token is available.
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          stopped = true
          return
        }
        console.error("Failed to fetch AI insights", err)
      }
    }

    fetchInsights()
    const interval = setInterval(() => {
      if (!stopped) fetchInsights()
    }, 15000)
    return () => clearInterval(interval)
  }, [interviewId, sessionDetail?.interview_id, sessionId, monitoringToken])


  // Test case animation
  useEffect(() => {
    if (runResultData) {
      setEvaluatedCount(0);
      const totalToEvaluate = (runResultData.visible_results?.length || 0) + (runResultData.hidden_summary?.total || 0);
      let count = 0;
      const interval = setInterval(() => {
        count++;
        setEvaluatedCount(count);
        if (count >= totalToEvaluate) {
          clearInterval(interval);
        }
      }, 400);
      return () => clearInterval(interval);
    }
  }, [runResultData]);

  useEffect(() => {
    const task = currentQuestion?.codingTask || currentQuestion || codingRoundData || {}
    const fn = task.function_name || 'solution'
    const sig = task.starter_function_signature
    const pythonSig = sig || task.starter_code || `def ${fn}(*args, **kwargs):`
    const finalPythonTemplate = pythonSig.includes('#') ? pythonSig : `${pythonSig}\n    # Write your solution here\n    pass`

    const templates = {
      python: finalPythonTemplate,
      javascript: `function ${fn}(...args) {\n    // Write your solution here\n    \n}`,
      java: `public class Solution {\n    public static void ${fn}(String[] args) {\n        // Write your solution here\n    }\n}`,
      cpp: `#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nvoid ${fn}() {\n    // Write your solution here\n}\n\nint main() {\n    ${fn}();\n    return 0;\n}`
    }

    const currentTmpl = templates[selectedLanguage] || templates.python
    const isDefault = !codeAnswer || !codeAnswer.trim() || Object.values(templates).some(tmpl => codeAnswer.trim() === tmpl.trim())
    if (isDefault) {
      setCodeAnswer(currentTmpl)
    }
  }, [currentQuestion, selectedLanguage, codingRoundData])

  // Recording Ref elements


  // Speech Recognition Reference
  const recognitionRef = useRef(null)
  const isRecognitionActiveRef = useRef(false)
  const lastSpeechActivityRef = useRef(Date.now())
  const speechWatchdogRef = useRef(null)
  const interimTextRef = useRef('')
  const accumulatedTranscriptRef = useRef('')
  const currentSessionFinalRef = useRef('')
  const currentAudioRef = useRef(null)
  const speakRequestIdRef = useRef(0)

  // Proctoring Loops
  const faceDetectionIntervalRef = useRef(null)
  const noiseAudioContextRef = useRef(null)
  const noiseMonitorFrameRef = useRef(null)
  const noiseFrameCountRef = useRef(0)
  const noiseCooldownRef = useRef(0)
  // (audioRmsRef, lipSyncStreakRef, lipSyncCooldownRef defined above with session states)


  const silenceIntervalRef = useRef(null)
  const silenceTimeoutRef = useRef(null)
  const lastSpeechTimeRef = useRef(0)
  // eslint-disable-next-line react-hooks/purity
  const questionStartTimeRef = useRef(Date.now())
  const globalTabSwitchesRef = useRef(0)
  const handleNextQuestionRef = useRef(null)
  // TTS cache: Map<cacheKey, blobUrl> — avoids re-fetching identical questions.
  // Capped at 20 entries (FIFO) to prevent unbounded memory growth.
  const ttsCacheRef = useRef(new Map())
  const TTS_CACHE_MAX = 20

  const normalizeQuestions = (rawQuestions = []) => {
    return rawQuestions.map((question, index) => ({
      ...question,
      id: question.id ?? index + 1,
      text: question.text || question.question || question.prompt || '',
      type: question.type || question.category || 'Interview'
    }))
  }

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isDisclaimerAccepted && !showAllSet && !isSubmittingRef.current) {
        behavioralStatsRef.current.tabSwitches += 1
        globalTabSwitchesRef.current += 1

        recordAlertMetric('tab_switch')

        if (globalTabSwitchesRef.current >= 3) {
          Swal.fire({
            title: 'Interview Terminated',
            text: 'Your interview has been automatically submitted because you exceeded the maximum allowed tab switches (3).',
            icon: 'error',
            background: '#161c2d',
            color: '#fff',
            confirmButtonColor: '#ef4444',
            allowOutsideClick: false,
            allowEscapeKey: false,
            customClass: { popup: 'z-[99999]' }
          }).then(() => {
            handleSubmitInterview(true, "Terminated: Exceeded Tab Switches (3)")
          })
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Tab Switch Detected',
            text: `Switching tabs or minimizing the browser is not allowed during this proctored interview. Warning ${globalTabSwitchesRef.current} of 3.`,
            confirmButtonText: 'I Understand',
            allowOutsideClick: false,
            allowEscapeKey: false,
            background: '#161c2d',
            color: '#fff',
            customClass: {
              popup: 'border border-white/8 rounded-2xl shadow-2xl z-[99999]',
              title: 'text-xl font-bold text-white',
              htmlContainer: 'text-slate-300 text-sm',
              confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
            },
            buttonsStyling: false
          })
        }
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [isDisclaimerAccepted, showAllSet])

  // ── Screenshot / Screen-capture Prevention ───────────────────────────────
  // Silently blocks PrintScreen, Win+Shift+S, Ctrl+Shift+S, Ctrl+P and other
  // common screenshot shortcuts. No alerts are shown — keystrokes are simply
  // swallowed. Also applies CSS-level content-protection while the interview
  // is active so that screen-recording tools capture a visually protected page.
  useEffect(() => {
    if (!isDisclaimerAccepted || showAllSet) return

    const BLOCKED_KEYS = new Set(['PrintScreen', 'Snapshot'])

    const handleKeyDown = (e) => {
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const alt = e.altKey

      // Block PrintScreen / Alt+PrintScreen / any variant
      if (BLOCKED_KEYS.has(key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Win+Shift+S  (Windows Snipping Tool) — key reported as 'S'
      if ((e.metaKey || e.key === 'Meta') && shift && key === 'S') {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Ctrl+Shift+S (many apps / browser extensions for screenshots)
      if (ctrl && shift && key === 'S') {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Ctrl+P / Ctrl+Shift+P  (print / print-preview — can capture content)
      if (ctrl && (key === 'p' || key === 'P')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Ctrl+Shift+P
      if (ctrl && shift && (key === 'p' || key === 'P')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }

      // Alt+PrintScreen fallback
      if (alt && BLOCKED_KEYS.has(key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
    }

    // Block the keyup as well so clipboard never gets the PrintScreen bitmap
    const handleKeyUp = (e) => {
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }

    // Silently clear clipboard if PrintScreen somehow still fires
    const handleKeyPress = (e) => {
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        try { navigator.clipboard.writeText('') } catch (_) { /* no-op */ }
      }
    }

    // CSS-level protection: apply a global style that makes the page appear
    // blank / dark in screen-recording contexts that respect CSS media queries.
    const styleEl = document.createElement('style')
    styleEl.id = 'interview-screenshot-guard'
    styleEl.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        body::after {
          content: '' !important;
          visibility: visible !important;
          display: block !important;
          background: #000 !important;
          position: fixed !important;
          inset: 0 !important;
        }
      }
    `
    document.head.appendChild(styleEl)

    // Capture-phase listeners so they fire before any child handler
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    document.addEventListener('keypress', handleKeyPress, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      document.removeEventListener('keypress', handleKeyPress, true)
      document.getElementById('interview-screenshot-guard')?.remove()
    }
  }, [isDisclaimerAccepted, showAllSet])
  // ─────────────────────────────────────────────────────────────────────────

  // Track unload events (Refresh or Close tab)
  useEffect(() => {
    const handleUnload = (e) => {
      const isUploading = uploadingText && uploadPercentage < 100;
      const isActiveSession = sessionId && isDisclaimerAccepted && !isCompleted;

      // Prevent exiting during active interview or during video upload
      if (isActiveSession || isUploading) {
        e.preventDefault();
        e.returnValue = '';
      }

      if (sessionId && isDisclaimerAccepted) {
        navigator.sendBeacon(`${api.defaults.baseURL || ''}/interview/${sessionId}/alert`, JSON.stringify({
          type: "warning",
          message: "Candidate refreshed or closed the window."
        }))
      }
    }
    window.addEventListener("beforeunload", handleUnload)
    return () => window.removeEventListener("beforeunload", handleUnload)
  }, [sessionId, isDisclaimerAccepted, isCompleted, uploadingText, uploadPercentage])

  // Persist current question index
  useEffect(() => {
    if (!_sessionKey || !isDisclaimerAccepted) return
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
    sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, currentQuestionIndex }))
  }, [currentQuestionIndex, isDisclaimerAccepted, _sessionKey])



  useEffect(() => {
    let timeout;
    if (isMediaReady && mediaStreamRef.current && isDisclaimerAccepted) {
      const tryStart = () => {
        if (visualizerCanvasRef.current) {
          visualizeAudio(mediaStreamRef.current)
        } else {
          timeout = setTimeout(tryStart, 100)
        }
      }
      tryStart()
    }
    return () => {
      visualizerActiveRef.current = false
      if (visualizerAudioCtxRef.current) {
        visualizerAudioCtxRef.current.close().catch(() => { })
        visualizerAudioCtxRef.current = null
      }
      if (timeout) clearTimeout(timeout)
    }
  }, [isMediaReady, isDisclaimerAccepted])

  useEffect(() => {
    let timer;
    if (showSkipButton && skipCountdown > 0) {
      timer = setInterval(() => {
        setSkipCountdown(prev => prev - 1)
      }, 1000)
    }
    return () => clearInterval(timer)
  }, [showSkipButton, skipCountdown])

  // Persist session accepted state
  useEffect(() => {
    if (!_sessionKey) return
    if (isDisclaimerAccepted) {
      const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
      if (!existing.startedAt) {
        sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, accepted: true, startedAt: Date.now(), totalDuration, isRoundTwo }))
      }
    }
  }, [isDisclaimerAccepted, _sessionKey])

  // Persist isRoundTwo and countdown tick
  useEffect(() => {
    if (!_sessionKey || !isDisclaimerAccepted) return
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
    sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, isRoundTwo, totalDuration }))
  }, [isRoundTwo, totalDuration])

  // Persist codeAnswer and selectedLanguage
  useEffect(() => {
    if (!_sessionKey || !isDisclaimerAccepted) return
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
    sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, codeAnswer, selectedLanguage }))
  }, [codeAnswer, selectedLanguage])

  // Interview Countdown Timer
  useEffect(() => {
    let interval;
    if (isDisclaimerAccepted && !showAllSet && globalCountdown > 0) {
      interval = setInterval(() => {
        setGlobalCountdown(prev => prev - 1)
      }, 1000)
    } else if (globalCountdown === 0 && isDisclaimerAccepted && !showAllSet && questions.length > 0) {
      if (!isRoundTwo && totalDuration > 0 && sessionDetail?.interview_type !== 'Normal') {
        startNextRound()
      } else {
        handleSubmitInterview()
      }
    }
    return () => clearInterval(interval)
  }, [isDisclaimerAccepted, showAllSet, globalCountdown, questions.length])

  // Tab close protection while saving/uploading
  useEffect(() => {
    if (!isSaving) return
    const handleBeforeUnload = (e) => {
      const msg = 'Your interview is still being saved. Please wait before closing this tab.'
      e.preventDefault()
      e.returnValue = msg
      return msg
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isSaving])

  const handleSkipUpload = () => {
    setShowSkipButton(false)
    setShowAllSet(true)
  }

  useEffect(() => {
    if (!sessionId) {
      setError("Missing Session ID in URL parameters. Please check your secure interview invitation link.")
      setLoading(false)
      return
    }

    async function verifySession() {
      // Moved to drainPendingRequests() after session is authenticated

      // Fast-path: if this browser already completed this session, show the
      // completed screen immediately without waiting for the API round-trip.
      try {
        if (sessionStorage.getItem(`interview_done_${sessionId}`) === '1') {
          setIsCompleted(true)
          setLoading(false)
          return
        }
      } catch (e) { }

      try {
        const payload = await api.get(`/session/${sessionId}`).then(r => r.data)
        if (payload.status !== 'success') {
          throw new Error(payload.detail || payload.message || "Failed to load session details.")
        }

        setSessionDetail(payload)

        // Ensure Voice Cloning works for Standard interviews
        if (payload.custom_voice_id || payload.cloned_voice_id) {
          const vId = payload.custom_voice_id || payload.cloned_voice_id
          clonedVoiceIdRef.current = vId
          setClonedVoiceId(vId)
        }

        if (payload.is_deactivated) {
          throw new Error("This interview link has been temporarily deactivated by the recruiter.")
        }
        if (payload.is_expired) {
          throw new Error("This interview link has expired. Please contact the recruiter for a new link.")
        }
        if (payload.is_before_schedule && payload.scheduled_start) {
          setScheduledStart(payload.scheduled_start)
          const startTime = new Date(payload.scheduled_start.endsWith('Z') || payload.scheduled_start.includes('+') ? payload.scheduled_start : payload.scheduled_start + 'Z')
          throw new Error(`This interview is scheduled to start on ${startTime.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}. Please try again at the scheduled time.`)
        }
        if (payload.session_status === 'completed') {
          setIsCompleted(true)
          setLoading(false)
          return
        }

        if (payload.interview_format === 'Voice') {
          navigate(`/voice-interview/${sessionId}`, { replace: true })
          return
        }

        const formData = new FormData()
        formData.append('link_id', sessionId)

        const startPayload = await api.post(`/start-session-interview`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        }).then(r => r.data)
        if (startPayload.is_expired) {
          throw new Error(startPayload.message || "This interview link has expired.")
        }
        if (startPayload.is_before_schedule) {
          throw new Error("This interview session is scheduled for a future time window.")
        }
        if (startPayload.session_status === 'completed') {
          setIsCompleted(true)
          setLoading(false)
          return
        }

        const rawQuestions = startPayload.questions?.length
          ? startPayload.questions
          : startPayload.first_question
            ? [startPayload.first_question]
            : []
        const qList = normalizeQuestions(rawQuestions)
        if (qList.length === 0) {
          throw new Error("No interview questions are available for this session. Please contact the recruiter.")
        }
        setQuestions(qList.slice(0, 22))
        setInterviewId(startPayload.interview_id || '')
        setMonitoringToken(startPayload.monitoring_token || '')
        monitoringTokenRef.current = startPayload.monitoring_token || ''
        if (startPayload.monitoring_token) {
          setCandidateSessionAuth(startPayload.monitoring_token, sessionId, startPayload.interview_id)
        }

        // ── Drain pending requests now that we are authenticated ──────
        try {
          const pendingKey = `complete_session_pending_${sessionId}`
          if (sessionStorage.getItem(pendingKey) === '1') {
            api.post(`/complete-session/${sessionId}`)
              .then(() => sessionStorage.removeItem(pendingKey))
              .catch(() => { })
          }
        } catch (e) { }

        try {
          const keys = Object.keys(sessionStorage)
          for (const key of keys) {
            if (key.startsWith(`failed_answer_${sessionId}_`)) {
              const answerData = JSON.parse(sessionStorage.getItem(key))
              const answerForm = new FormData()
              answerForm.append('interview_id', answerData.interview_id || sessionId)
              answerForm.append('question_id', answerData.question_id)
              answerForm.append('question_text', answerData.question_text || '')
              answerForm.append('answer_text', answerData.answer_text || 'No answer provided')
              answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
              answerForm.append('time_spent_seconds', answerData.time_spent_seconds || '0')
              answerForm.append('time_limit_seconds', '120')
              const tok = startPayload.monitoring_token || monitoringTokenRef.current || getCandidateSessionToken()
              if (tok) answerForm.append('monitoring_token', tok)

              api.post(`/save-answer`, answerForm, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                  ...(tok ? { Authorization: `Bearer ${tok}` } : {})
                }
              }).then(() => sessionStorage.removeItem(key)).catch(() => { })
            }
          }
        } catch (e) { }

        // Snapshot candidate details into refs NOW (synchronously) so that the
        // async Whisper MediaRecorder onstop callback always has correct values.
        // Using refs avoids the race condition where sessionDetail state hasn't
        // updated yet when the first audio blob is ready to send.
        candidateNameRef.current = startPayload.candidate_name || payload.candidate_name || 'Candidate'
        interviewLanguageRef.current = startPayload.language || payload.language || 'English'
        setSessionDetail(prev => ({
          ...prev,
          interview_id: startPayload.interview_id || prev?.interview_id,
          candidate_name: startPayload.candidate_name || prev?.candidate_name,
          interview_duration: startPayload.interview_duration || prev?.interview_duration,
          interview_type: startPayload.interview_type || prev?.interview_type,
          record_video: startPayload.record_video ?? prev?.record_video
        }))

        const resumeQId = Number(startPayload.resume_question_id) || (startPayload.first_question ? Number(startPayload.first_question.id) : 1)
        const qIndex = qList.findIndex(q => Number(q.id) === Number(resumeQId))
        setCurrentQuestionIndex(qIndex >= 0 ? qIndex : 0)

        if (startPayload.interview_duration) {
          setSessionDetail(prev => ({
            ...prev,
            interview_duration: startPayload.interview_duration
          }))
          const dur = parseInt(startPayload.interview_duration, 10)
          const fullDuration = dur * 60
          setTotalDuration(fullDuration)

          // Normal interviews are single-round: use full duration.
          // Technical/Non-Technical interviews split into 2 rounds: use half.
          const interviewType = startPayload.interview_type || ''
          const isSingleRound = interviewType === 'Normal'

          if (_savedSession?.startedAt && _savedSession?.accepted) {
            const elapsedSeconds = Math.floor((Date.now() - _savedSession.startedAt) / 1000)
            const roundDur = isSingleRound ? fullDuration : fullDuration / 2
            const remaining = Math.max(0, roundDur - elapsedSeconds)
            setGlobalCountdown(remaining)
            if (_savedSession.isRoundTwo) {
              setIsRoundTwo(true)
              isRoundTwoRef.current = true
            }
          } else {
            setGlobalCountdown(isSingleRound ? fullDuration : (dur / 2) * 60)
          }
        } else {
          setTotalDuration(30 * 60)
          if (_savedSession?.startedAt && _savedSession?.accepted) {
            const elapsedSeconds = Math.floor((Date.now() - _savedSession.startedAt) / 1000)
            const remaining = Math.max(0, 15 * 60 - elapsedSeconds)
            setGlobalCountdown(remaining)
          } else {
            setGlobalCountdown(15 * 60)
          }
        }

        if (_savedSession?.isRoundTwo && startRoundTwo) {
          startRoundTwo({
            verbalQuestionsLength: qList.length,
            savedIndex: _savedSession?.currentQuestionIndex,
            interviewId: startPayload.interview_id || '',
            setQuestions,
            setCurrentQuestionIndex,
            setCodingRoundLoading,
            setCodingRoundData,
            setSelectedLanguage,
            setCodeAnswer
          })
        }

        setLoading(false)
      } catch (err) {
        setError(err.message || "Unable to access this interview session.")
        setLoading(false)
      }
    }
    verifySession()
  }, [sessionId])

  useEffect(() => {
    if (autoReconnecting && !loading && !error && questions.length > 0) {
      const savedSess = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null
      if (!savedSess?.accepted) { setAutoReconnecting(false); return }

      Swal.fire({
        title: 'Reconnecting...',
        html: `<div class="text-slate-300 text-sm text-left space-y-2">
          <p>Your interview session was detected. Please re-grant your camera, microphone, and screen sharing permissions to continue from where you left off.</p>
        </div>`,
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Reconnect & Continue',
        cancelButtonText: 'Start Over',
        background: '#161c2d',
        color: '#fff',
        customClass: {
          popup: 'border border-white/8 rounded-2xl shadow-2xl',
          title: 'text-xl font-bold text-white',
          htmlContainer: 'text-slate-300 text-sm',
          confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none mr-2',
          cancelButton: 'bg-white/6 hover:bg-white/12 text-white border border-white/8 rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer outline-none'
        },
        buttonsStyling: false,
        preConfirm: () => {
          enableFullscreen()
        }
      }).then(result => {
        if (result.isConfirmed) {
          setupMedia().then(() => {
            setAutoReconnecting(false)
          }).catch(() => {
            setAutoReconnecting(false)
          })
        } else {
          if (_sessionKey) sessionStorage.removeItem(_sessionKey)
          setAutoReconnecting(false)
        }
      })
    }
  }, [autoReconnecting, loading, error, questions.length])

  // ── Robust Non-Duplicating Transcript Merger ──
  const mergeTranscripts = (accumulated, sessionFinal, sessionInterim) => {
    const acc = (accumulated || '').trim()
    const sFinal = (sessionFinal || '').trim()
    const sInterim = (sessionInterim || '').trim()

    let committed = acc

    if (sFinal) {
      if (!committed) {
        committed = sFinal
      } else if (sFinal.toLowerCase().startsWith(committed.toLowerCase())) {
        committed = sFinal
      } else if (committed.toLowerCase().endsWith(sFinal.toLowerCase())) {
        // already includes sFinal
      } else {
        // Find longest matching suffix of committed with prefix of sFinal
        const accWords = committed.split(/\s+/)
        const finalWords = sFinal.split(/\s+/)
        let overlap = 0
        for (let len = Math.min(accWords.length, finalWords.length); len > 0; len--) {
          const suffix = accWords.slice(-len).join(' ').toLowerCase()
          const prefix = finalWords.slice(0, len).join(' ').toLowerCase()
          if (suffix === prefix) {
            overlap = len
            break
          }
        }
        if (overlap > 0) {
          committed = [...accWords, ...finalWords.slice(overlap)].join(' ')
        } else {
          committed = `${committed} ${sFinal}`
        }
      }
    }

    let full = committed
    if (sInterim) {
      if (!full.toLowerCase().endsWith(sInterim.toLowerCase())) {
        full = full ? `${full} ${sInterim}` : sInterim
      }
    }

    return { committed: committed.trim(), full: full.trim() }
  }

  const commitSpeechSessionToAccumulator = () => {
    const { committed } = mergeTranscripts(
      accumulatedTranscriptRef.current,
      currentSessionFinalRef.current,
      interimTextRef.current
    )
    accumulatedTranscriptRef.current = committed
    currentSessionFinalRef.current = ''
    interimTextRef.current = ''
  }

  const startOrRestartSpeechRecognition = () => {
    startOrRestartSpeechRecognitionRef.current = startOrRestartSpeechRecognition
    if (isTTSPlayingRef.current || !isSpeechRecordingRef.current) return null

    // If recognition is already active and healthy, return existing instance
    if (isRecognitionActiveRef.current && recognitionRef.current) {
      return recognitionRef.current
    }

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.warn("Speech recognition not supported in this browser.")
      return null
    }

    // Clean up previous instance cleanly
    if (recognitionRef.current) {
      const oldRec = recognitionRef.current
      recognitionRef.current = null
      try {
        oldRec.onstart = null
        oldRec.onend = null
        oldRec.onerror = null
        oldRec.onresult = null
        oldRec.abort()
      } catch (_) { }
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const rec = new SpeechRecognition()
      rec.continuous = true  // Keep listening continuously
      rec.interimResults = true
      rec.maxAlternatives = 1
      const currentLangName = sessionDetail?.language || interviewLanguageRef.current || 'English'
      const targetLang = langMap[currentLangName] || 'en-IN'
      rec.lang = targetLang

      rec.onstart = () => {
        isRecognitionActiveRef.current = true
        lastSpeechActivityRef.current = Date.now()
        lastSpeechTimeRef.current = Date.now()
      }

      rec.onend = () => {
        isRecognitionActiveRef.current = false
        // Don't restore text if TTS is playing — the display was intentionally cleared
        if (!isTTSPlayingRef.current) {
          commitSpeechSessionToAccumulator()
          setInterimTranscriptText('')
          liveInterimGhostRef.current = ''
          // Whisper is the persistent source of truth. Only fall back to the
          // Web Speech accumulator when Whisper hasn't produced anything yet.
          const whisperVal = whisperFinalizedTranscriptRef.current.trim()
          const fallback = accumulatedTranscriptRef.current.trim()
          if (whisperVal) {
            setTranscriptionText(formatCandidateName(whisperVal, sessionDetail?.candidate_name || sessionDetail?.name || ''))
          } else if (fallback) {
            setTranscriptionText(formatCandidateName(fallback, sessionDetail?.candidate_name || sessionDetail?.name || ''))
          }
        } else {
          setInterimTranscriptText('')
          liveInterimGhostRef.current = ''
        }

        // Seamless auto-revive after silence or Chrome continuous audio timeout
        if (isSpeechRecordingRef.current && !isTTSPlayingRef.current) {
          setTimeout(() => {
            if (isSpeechRecordingRef.current && !isTTSPlayingRef.current && !isRecognitionActiveRef.current) {
              startOrRestartSpeechRecognition()
            }
          }, 60)
        }
      }

      rec.onresult = (event) => {
        // ── CRITICAL: If AI is reading the question, ignore computer audio echo! ──
        if (isTTSPlayingRef.current) return

        isRecognitionActiveRef.current = true
        const now = Date.now()
        lastSpeechActivityRef.current = now
        lastSpeechTimeRef.current = now

        let sessionFinal = ''
        let sessionInterim = ''
        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i]
          if (res.isFinal) {
            sessionFinal += (res[0].transcript || '').trim() + ' '
          } else {
            sessionInterim += (res[0].transcript || '')
          }
        }

        currentSessionFinalRef.current = sessionFinal.trim()
        interimTextRef.current = sessionInterim.trim()
        setInterimTranscriptText('')

        // Web Speech is display-only "ghost" text for the *current* in-progress segment.
        // Gate: ignore Web Speech hallucination if no real acoustic energy occurred
        if (segmentPeakRmsRef.current < 0.04 && audioRmsRef.current < 0.04) {
          return
        }

        const ghost = (sessionFinal + ' ' + sessionInterim).trim()
        liveInterimGhostRef.current = ghost
        const cName = sessionDetail?.candidate_name || sessionDetail?.name || ''
        // Show Web Speech ghost as a LIVE PREVIEW only — it should NOT
        // modify Whisper's committed transcript (that's done in
        // `mergeSegmentChunks` when the next Whisper chunk arrives).
        // We just append it for the user to see, and tolerate that it may
        // overlap with the Whisper text (Whisper is the persistent source).
        const whisperVal = whisperFinalizedTranscriptRef.current.trim()
        let display
        if (!whisperVal) {
          display = ghost
        } else if (!ghost) {
          display = whisperVal
        } else {
          // Show Whisper committed text plus a preview hint for any words
          // that Web Speech is hearing RIGHT NOW that Whisper hasn't yet
          // transcribed. Only append ghost words not already in Whisper.
          const ghostWords = ghost.split(/\s+/).filter(Boolean)
          const existing = whisperVal.toLowerCase()
          const newWords = []
          for (const w of ghostWords) {
            if (!existing.includes(w.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
              newWords.push(w)
            }
          }
          display = newWords.length ? `${whisperVal} ${newWords.join(' ')}` : whisperVal
        }
        if (display) {
          setTranscriptionText(formatCandidateName(display, cName))
        }
      }

      rec.onerror = (e) => {
        isRecognitionActiveRef.current = false
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          console.error("Microphone permission denied:", e.error)
          return
        }
        // 'no-speech' and 'aborted' are normal on long pauses — let the
        // watchdog/onend cycle handle restart, don't double-restart here.
        if (e.error === 'no-speech' || e.error === 'aborted') return
        // Transient errors — restart after a brief delay
        if (isSpeechRecordingRef.current && !isTTSPlayingRef.current) {
          setTimeout(() => {
            if (isSpeechRecordingRef.current && !isTTSPlayingRef.current && !isRecognitionActiveRef.current) {
              startOrRestartSpeechRecognition()
            }
          }, 250)
        }
      }

      recognitionRef.current = rec
      rec.start()
      return rec
    } catch (err) {
      isRecognitionActiveRef.current = false
      // If recognition.start() threw because browser audio channel was busy, retry in 200ms
      setTimeout(() => {
        if (isSpeechRecordingRef.current && !isTTSPlayingRef.current && !isRecognitionActiveRef.current) {
          startOrRestartSpeechRecognition()
        }
      }, 200)
      return null
    }
  }
  startOrRestartSpeechRecognitionRef.current = startOrRestartSpeechRecognition

  // Speech Recognition Watchdog — safely ensures recognition is running without killing active sessions
  useEffect(() => {
    speechWatchdogRef.current = setInterval(() => {
      if (isSpeechRecordingRef.current && !isTTSPlayingRef.current) {
        if (!isRecognitionActiveRef.current || !recognitionRef.current) {
          startOrRestartSpeechRecognition()
        }
      }
    }, 10000)  // 10s is enough — Chrome continuous audio limit is ~60s and we
               // don't want to restart STT during a perfectly healthy session

    return () => {
      clearInterval(speechWatchdogRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isDisclaimerAccepted || !mediaStreamRef.current || !videoPreviewRef.current) return
    if (videoPreviewRef.current.srcObject !== mediaStreamRef.current) {
      videoPreviewRef.current.srcObject = mediaStreamRef.current
      videoPreviewRef.current.muted = true
      videoPreviewRef.current.play().catch(e => console.log(e))
    }
  }, [isDisclaimerAccepted, currentQuestionIndex])

  const startBackgroundNoiseMonitor = (stream) => {
    startBackgroundNoiseMonitorRef.current = startBackgroundNoiseMonitor
    if (!stream || stream.getAudioTracks().length === 0) return

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const actx = new AudioCtx()
      noiseAudioContextRef.current = actx
      const source = actx.createMediaStreamSource(stream)
      const analyser = actx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        if (!noiseAudioContextRef.current) return
        noiseMonitorFrameRef.current = requestAnimationFrame(tick)
        analyser.getByteTimeDomainData(dataArray)

        let sumSquares = 0
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / dataArray.length)

        audioRmsRef.current = rms

        const now = Date.now()

        // Treat RMS > 0.03 as speech and bump the silence timer
        if (rms > 0.03) {
          lastSpeechTimeRef.current = now
          if (isSpeechRecordingRef.current && !isTTSPlayingRef.current) {
            markSegmentHasSpeech()
            if (rms > segmentPeakRmsRef.current) segmentPeakRmsRef.current = rms
          }
        } else if (
          isSpeechRecordingRef.current &&
          !isTTSPlayingRef.current &&
          segmentHasSpeechRef.current &&
          now - lastSpeechTimeRef.current >= SEGMENT_SILENCE_MS
        ) {
          cutCurrentSegment(stream)
        }

        // Background noise detection (only when AI is not speaking AND candidate is not actively talking)
        const isCandidateSpeaking = (now - lastSpeechActivityRef.current < 3500)

        if (!isTTSPlayingRef.current && !isCandidateSpeaking && rms > 0.14 && now > noiseCooldownRef.current) {
          noiseFrameCountRef.current++
        } else {
          noiseFrameCountRef.current = Math.max(0, noiseFrameCountRef.current - 2)
        }

        if (noiseFrameCountRef.current >= 35) {
          noiseCooldownRef.current = now + 8000
          noiseFrameCountRef.current = 0
          recordAlertMetric("noise_alert")
          setNoiseAlertCount(prev => {
            const next = prev + 1
            noiseAlertCountRef.current = next
            behavioralStatsRef.current.noiseAlerts += 1
            return next
          })
          setShowNoiseBanner(true)
          setTimeout(() => setShowNoiseBanner(false), 4000)
        }
      }
      tick()
    } catch (e) {
      console.warn("Noise proctoring monitor setup fail", e)
    }
  }
  startBackgroundNoiseMonitorRef.current = startBackgroundNoiseMonitor



  const acceptDisclaimer = () => {
    setShowDeviceCheck(true)
  }



  const startSilenceTimer = (delayMs = 60000) => {
    if (!isRoundTwoRef.current) {
      if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)
      lastSpeechTimeRef.current = Date.now()
      silenceIntervalRef.current = setInterval(() => {
        // Only trigger if no speech was detected for the full delayMs duration (default 60s)
        if (Date.now() - lastSpeechTimeRef.current >= delayMs) {
          clearInterval(silenceIntervalRef.current)
          if (handleNextQuestionRef.current) handleNextQuestionRef.current()
        }
      }, 1000)
    }
  }

  const stopSilenceTimer = () => {
    if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
  }

  const speakAIQuestion = async (text) => {
    // The silence timer is started in audio.onended (after TTS finishes playing)
    // so the candidate gets exactly 10 seconds of silence before auto-advancing.
    // We do NOT set a timer here before TTS plays — that would give extra-long wait.
    if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)

    // Generate a unique ID for this TTS request to handle rapid clicks
    const reqId = Date.now()
    speakRequestIdRef.current = reqId

    // Stop any currently playing high-quality audio
    if (currentAudioRef.current) {
      try {
        currentAudioRef.current.pause()
        currentAudioRef.current.currentTime = 0
      } catch (e) { }
      currentAudioRef.current = null
    }

    // ── PAUSE speech recognition so the AI's own voice is NOT transcribed ──
    isTTSPlayingRef.current = true
    isSpeechRecordingRef.current = false
    accumulatedTranscriptRef.current = ''
    currentSessionFinalRef.current = ''
    interimTextRef.current = ''
    whisperAudioChunksRef.current = []
    whisperFinalizedTranscriptRef.current = ''
    liveInterimGhostRef.current = ''
    segmentHasSpeechRef.current = false
    segmentPeakRmsRef.current = 0
    setTranscriptionText('')
    setInterimTranscriptText('')
    // Stop Web Speech recognizer
    if (recognitionRef.current) {
      const oldRec = recognitionRef.current
      recognitionRef.current = null
      isRecognitionActiveRef.current = false
      try {
        oldRec.onstart = null
        oldRec.onend = null
        oldRec.onerror = null
        oldRec.onresult = null
        oldRec.abort()
      } catch (_) { }
    }
    // Stop the Whisper segment recorder — critical to prevent TTS audio being sent to Whisper
    if (segmentRecorderRef.current && segmentRecorderRef.current.state !== 'inactive') {
      const oldSegRec = segmentRecorderRef.current
      segmentRecorderRef.current = null
      try {
        oldSegRec.ondataavailable = null
        oldSegRec.onstop = null
        oldSegRec.stop()
      } catch (_) { }
    }
    // Reset the transcription chain — discard any in-flight segments from the previous question
    segmentCuttingRef.current = false
    segmentChunksRef.current = []
    segmentTranscribeChainRef.current = Promise.resolve()
    // ── NUCLEAR MIC MUTE: disable the audio track itself so TTS speaker output
    // CANNOT physically reach the Web Speech engine or any recorder, regardless
    // of whether software AEC is working (critical for speaker users) ──
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = false
      })
    }

    // --- High-Quality TTS (Backend: Cartesia or Edge TTS) ---
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      const bodyPayload = {
        text,
        voice: 'shimmer',
        language: sessionDetail?.language || 'English',
        use_custom_voice: !!(sessionDetail?.voice_clone || sessionDetail?.voice_cloning_enabled || sessionDetail?.custom_voice_id || clonedVoiceIdRef.current)
      }
      const activeVoiceId = clonedVoiceIdRef.current || sessionDetail?.custom_voice_id || sessionDetail?.cloned_voice_id
      if (activeVoiceId) bodyPayload.voice_id = activeVoiceId

      // Check TTS cache first — same question text + voice doesn't need a new network call.
      const ttsCacheKey = `${text}::${clonedVoiceIdRef.current || 'default'}`
      let url = ttsCacheRef.current.get(ttsCacheKey)

      if (!url) {
        const res = await fetch(`${api.defaults.baseURL || ''}/tts`, withCandidateAuth({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        }))
        if (!res.ok) throw new Error('TTS failed')
        const blob = await res.blob()
        url = URL.createObjectURL(blob)
        // Store in cache with FIFO eviction
        if (ttsCacheRef.current.size >= TTS_CACHE_MAX) {
          const firstKey = ttsCacheRef.current.keys().next().value
          URL.revokeObjectURL(ttsCacheRef.current.get(firstKey)) // free evicted blob
          ttsCacheRef.current.delete(firstKey)
        }
        ttsCacheRef.current.set(ttsCacheKey, url)
      }

      // If user clicked 'Next' again while we were fetching, discard this stale audio!
      if (speakRequestIdRef.current !== reqId) return

      const audio = new Audio(url)
      currentAudioRef.current = audio

      // --- Web Audio Mixer Routing ---
      if (audioMixerCtxRef.current && audioMixerDestRef.current) {
        audio.crossOrigin = "anonymous"
        const source = audioMixerCtxRef.current.createMediaElementSource(audio)
        source.connect(audioMixerCtxRef.current.destination) // Play to speakers
        source.connect(audioMixerDestRef.current) // Send to screen recorder mixer
      }

      let audioEnded = false
      const handleAudioFinished = () => {
        if (audioEnded) return
        audioEnded = true
        // Revoke object URL after playback to free browser memory.
        if (!ttsCacheRef.current.has(ttsCacheKey)) {
          URL.revokeObjectURL(url)
        }
        // ── Clean transcript & restart speech recognition freshly for candidate response ──
        accumulatedTranscriptRef.current = ''
        currentSessionFinalRef.current = ''
        interimTextRef.current = ''
        whisperAudioChunksRef.current = []
        whisperFinalizedTranscriptRef.current = ''
        liveInterimGhostRef.current = ''
        segmentHasSpeechRef.current = false
        setTranscriptionText('')
        isTTSPlayingRef.current = false
        // 500ms grace period — lets speaker echo/reverb tail die out before we
        // start listening again, so the AI's own voice doesn't get transcribed
        // as the candidate's answer.
        setTimeout(() => {
          if (isTTSPlayingRef.current || speakRequestIdRef.current !== reqId) return
          // Re-enable the microphone track now that the echo tail has died
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = true
            })
          }
          isSpeechRecordingRef.current = true
          lastSpeechActivityRef.current = Date.now()
          startOrRestartSpeechRecognition()
          startSilenceTimer(60000)
          if (mediaStreamRef.current) {
            startSegmentedWhisperCapture(mediaStreamRef.current)
          }
        }, 500)
      }

      audio.onended = handleAudioFinished
      audio.onerror = handleAudioFinished

      // Safety timeout: unlock recognition if audio playback stalls
      const maxAudioMs = Math.max(6000, (text.split(' ').length * 500) + 3000)
      setTimeout(() => {
        if (speakRequestIdRef.current === reqId && isTTSPlayingRef.current) {
          handleAudioFinished()
        }
      }, maxAudioMs)

      // Double check reqId before playing just in case
      if (speakRequestIdRef.current === reqId) {
        audio.play().catch((playErr) => {
          console.warn("Audio autoplay blocked or failed, resuming recognition immediately:", playErr)
          handleAudioFinished()
        })
      }
      return // Successfully used backend high-quality TTS
    } catch (err) {
      console.error("Backend TTS failed, falling back to browser TTS", err)
    }

    // --- Browser TTS (Fallback/Default) ---
    // If browser speechSynthesis is also missing, set a 15s fallback silence timer
    // so the interview never gets permanently stuck.
    if (!window.speechSynthesis) {
      isTTSPlayingRef.current = false
      isSpeechRecordingRef.current = true
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(track => { track.enabled = true })
      }
      startOrRestartSpeechRecognition()
      if (mediaStreamRef.current) {
        startSegmentedWhisperCapture(mediaStreamRef.current)
      }
      startSilenceTimer(15000)
      return
    }

    // If a new request came in, abort browser fallback setup
    if (speakRequestIdRef.current !== reqId) return

    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)

    const targetLang = langMap[sessionDetail?.language] || 'en-IN'
    const targetLangPrefix = targetLang.split('-')[0]
    utterance.lang = targetLang

    const setVoiceAndSpeak = () => {
      let voices = window.speechSynthesis.getVoices()
      let preferredVoice = voices.find(v =>
        v.lang.startsWith(targetLangPrefix) &&
        (v.name.includes("Female") || v.name.includes("Google"))
      )
      if (preferredVoice) {
        utterance.voice = preferredVoice
      }

      let utteranceEnded = false
      const handleUtteranceFinished = () => {
        if (utteranceEnded) return
        utteranceEnded = true
        isTTSPlayingRef.current = false
        // 500ms grace period — lets speaker echo/reverb tail die out before we
        // start listening again, so the AI's own voice doesn't get transcribed
        // as the candidate's answer.
        setTimeout(() => {
          if (isTTSPlayingRef.current || speakRequestIdRef.current !== reqId) return
          // Re-enable the microphone track now that the echo tail has died
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getAudioTracks().forEach(track => {
              track.enabled = true
            })
          }
          isSpeechRecordingRef.current = true
          lastSpeechActivityRef.current = Date.now()
          whisperFinalizedTranscriptRef.current = ''
          liveInterimGhostRef.current = ''
          segmentHasSpeechRef.current = false
          startOrRestartSpeechRecognition()
          startSilenceTimer(60000)
          if (mediaStreamRef.current) {
            startSegmentedWhisperCapture(mediaStreamRef.current)
          }
        }, 500)
      }

      utterance.onend = handleUtteranceFinished
      utterance.onerror = handleUtteranceFinished

      // Safety timeout for browser speech synthesis GC bug
      const maxUtteranceMs = Math.max(6000, (text.split(' ').length * 500) + 3000)
      setTimeout(() => {
        if (speakRequestIdRef.current === reqId && isTTSPlayingRef.current) {
          handleUtteranceFinished()
        }
      }, maxUtteranceMs)

      window.speechSynthesis.speak(utterance)
    }

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = setVoiceAndSpeak
      // Fallback in case onvoiceschanged never fires
      setTimeout(setVoiceAndSpeak, 250)
    } else {
      setVoiceAndSpeak()
    }
  }
  speakAIQuestionRef.current = speakAIQuestion


  const startNextRound = async () => {
    if (isRoundTwoRef.current) return
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
    if (!startRoundTwo) {
      handleSubmitInterview()
      return
    }
    try {
      await startRoundTwo({
        verbalQuestionsLength: questions.length,
        interviewId: interviewId || sessionDetail?.interview_id || sessionId,
        setQuestions,
        setCurrentQuestionIndex,
        setCodingRoundLoading,
        setCodingRoundData,
        setSelectedLanguage,
        setCodeAnswer
      })

      setIsRoundTwo(true)
      isRoundTwoRef.current = true

      if (totalDuration > 0) {
        setGlobalCountdown(totalDuration / 2)
      }
    } catch (err) {
      console.error("Failed to start round 2:", err)
      isRoundTwoRef.current = false  // allow retry if user tries again
      Swal.fire({
        icon: 'error',
        title: 'Failed to start Round 2',
        text: 'An error occurred while generating the next round. Please try again.',
        background: '#161c2d',
        color: '#fff',
        confirmButtonColor: '#6366f1'
      })
    }
  }

  const handleStartRound2Click = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setShowRound2Confirm(true)
    } else {
      proceedToRoundTwo()
    }
  }

  const proceedToRoundTwo = async () => {
    stopSilenceTimer()
    setShowRound2Confirm(false)

    const activeQuestion = questions[currentQuestionIndex]
    const iid = interviewId || sessionDetail?.interview_id || sessionId
    const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)

    // Flush any in-flight speech from recognizer
    commitSpeechSessionToAccumulator()

    let safeTranscript = (accumulatedTranscriptRef.current || transcriptionText || '').trim()

    if (activeQuestion?.type !== 'coding') {
      const flushed = await flushWhisperTranscription()
      if (flushed) safeTranscript = flushed
    }

    // ── Save the final verbal answer before transitioning ────────────────────
    const answerForm = new FormData()
    answerForm.append('interview_id', iid)
    answerForm.append('question_id', activeQuestion?.id || (currentQuestionIndex + 1))
    answerForm.append('question_text', activeQuestion?.text || activeQuestion?.question || '')
    answerForm.append('answer_text', activeQuestion?.type === 'coding' ? (codeAnswer || 'No code submitted') : (safeTranscript || 'No answer provided'))
    answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
    answerForm.append('time_spent_seconds', timeSpent.toString())
    answerForm.append('time_limit_seconds', '120')

    const token = monitoringTokenRef.current || monitoringToken || getCandidateSessionToken()
    if (token) answerForm.append('monitoring_token', token)
    try {
      await api.post(`/save-answer`, answerForm, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      })
    } catch (e) {
      console.error("Failed to save answer during round transition:", e)
      await Swal.fire({
        icon: 'error',
        title: 'Connection Error',
        text: 'Your answer could not be saved — please check your connection and try again.',
        confirmButtonText: 'Retry',
        allowOutsideClick: false
      })
      // Restore the confirm modal so the candidate can retry
      setShowRound2Confirm(true)
      return
    }

    // Behavioral data save is best-effort; failure must not block transition
    try {
      const words = safeTranscript.split(/\s+/).filter(w => w.length > 0).length
      const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
      await api.post(`/save-behavioral-data`, {
        interview_id: iid,
        question_id: (activeQuestion?.id || (currentQuestionIndex + 1)).toString(),
        filler_count: countFillers(safeTranscript),
        wpm: wpm,
        pause_count: behavioralStatsRef.current.pauseCount,
        time_spent_seconds: timeSpent,
        tab_switches: behavioralStatsRef.current.tabSwitches,
        face_alerts: behavioralStatsRef.current.faceAlerts,
        noise_alerts: behavioralStatsRef.current.noiseAlerts
      })
    } catch (e) {
      console.error("Failed to save behavioral data during round transition:", e)
    }

    accumulatedTranscriptRef.current = ''
    currentSessionFinalRef.current = ''
    interimTextRef.current = ''
    whisperAudioChunksRef.current = []
    whisperFinalizedTranscriptRef.current = ''
    liveInterimGhostRef.current = ''
    segmentHasSpeechRef.current = false
    setTranscriptionText('')
    setInterimTranscriptText('')
    setCodeAnswer('')
    setCodeOutput('')
    behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 }
    questionStartTimeRef.current = Date.now()
    startNextRound()
  }

  const handleNextQuestion = async () => {
    if (currentQuestionIndex >= questions.length) return
    if (isNextingRef.current) return  // prevent rapid-click double submit
    isNextingRef.current = true
    try {
      // Immediately stop any playing question TTS audio so Next works instantly without waiting for playback
      if (currentAudioRef.current) {
        try {
          currentAudioRef.current.pause()
          currentAudioRef.current.currentTime = 0
        } catch (_) { }
        currentAudioRef.current = null
      }
      if (window.speechSynthesis) {
        try { window.speechSynthesis.cancel() } catch (_) { }
      }
      isTTSPlayingRef.current = false

      const currentQuestion = questions[currentQuestionIndex]
      stopSilenceTimer()

      // Flush any in-flight speech from recognizer
      commitSpeechSessionToAccumulator()

      let safeTranscript = (accumulatedTranscriptRef.current || transcriptionText || '').trim()

      if (currentQuestion.type !== 'coding') {
        const flushed = await flushWhisperTranscription()
        if (flushed) safeTranscript = flushed
      }

      const timeSpent = Math.round((Date.now() - (questionStartTimeRef.current || Date.now())) / 1000)
      const words = safeTranscript ? safeTranscript.split(/\s+/).filter(w => w.length > 0).length : 0
      const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
      const iid = interviewId || sessionDetail?.interview_id || sessionId
      if (currentQuestion.type === 'case_study') {
        const response = await api.post(`/case-study/submit-answer`, {
          interview_id: iid,
          question_index: currentQuestion.caseStudyIndex,
          answer_text: safeTranscript || ' '
        })
        if (!response.data || response.status !== 200) throw new Error('Failed to submit case study answer')
      } else {
        const answerForm = new FormData()
        answerForm.append('interview_id', iid)
        answerForm.append('question_id', currentQuestion.id || (currentQuestionIndex + 1))
        answerForm.append('question_text', currentQuestion.text || currentQuestion.question || currentQuestion.prompt || currentQuestion.scenario || currentQuestion.question_text || '')
        answerForm.append('answer_text', currentQuestion.type === 'coding' ? (codeAnswer || 'No code submitted') : (safeTranscript || 'No answer provided'))
        answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
        answerForm.append('time_spent_seconds', timeSpent.toString())
        answerForm.append('time_limit_seconds', '120')

        const token = monitoringTokenRef.current || monitoringToken || getCandidateSessionToken()
        if (token) answerForm.append('monitoring_token', token)

        await api.post(`/save-answer`, answerForm, {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        })
      }

      // Fire behavioral data save in background so question transition is instant
      const payload = {
        interview_id: iid,
        question_id: (currentQuestion.id || (currentQuestionIndex + 1)).toString(),
        filler_count: countFillers(safeTranscript),
        wpm: wpm,
        pause_count: behavioralStatsRef.current.pauseCount,
        time_spent_seconds: timeSpent,
        tab_switches: behavioralStatsRef.current.tabSwitches,
        face_alerts: behavioralStatsRef.current.faceAlerts,
        noise_alerts: behavioralStatsRef.current.noiseAlerts
      }
      api.post(`/save-behavioral-data`, payload).catch(() => {})

      if (currentQuestionIndex === questions.length - 1) {
        const isCodingQ = currentQuestion.type === 'coding'
        const isCaseStudyQ = currentQuestion.type === 'case_study'

        if (isCodingQ) {
          try {
            await api.post(`/coding-round/submit`, {
              interview_id: iid,
              code: codeAnswer,
              explanation: codeAnswer,
              language: selectedLanguage
            })
          } catch (e) { }
          handleSubmitInterview()
        } else if (isCaseStudyQ) {
          handleSubmitInterview()
        } else if (!isRoundTwo && sessionDetail?.interview_type !== 'Normal') {
          accumulatedTranscriptRef.current = ''
          currentSessionFinalRef.current = ''
          interimTextRef.current = ''
          whisperAudioChunksRef.current = []
          whisperFinalizedTranscriptRef.current = ''
          liveInterimGhostRef.current = ''
          segmentHasSpeechRef.current = false
          setTranscriptionText('')
          setInterimTranscriptText('')
          setCodeAnswer('')
          setCodeOutput('')
          behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 }
          questionStartTimeRef.current = Date.now()
          startNextRound()
        } else {
          // Time still remaining? Try to load pre-fetched questions seamlessly
          if (isPrefetchingRef.current && globalCountdown > 30) {
            Swal.fire({
              title: 'Generating Next Question...',
              html: 'Just a moment...',
              allowOutsideClick: false,
              didOpen: () => { Swal.showLoading() },
              background: '#0f172a',
              color: '#fff'
            })
            let waits = 0;
            while (isPrefetchingRef.current && waits < 30) {
              await new Promise(r => setTimeout(r, 500))
              waits++;
            }
            Swal.close()
          }

          if (prefetchedQuestionsRef.current.length > 0 && globalCountdown > 30) {
            const batch = prefetchedQuestionsRef.current
            prefetchedQuestionsRef.current = []
            const nextIdx = currentQuestionIndex + 1
            setQuestions(prev => {
              const updated = [...prev, ...batch]
              return updated
            })
            accumulatedTranscriptRef.current = ''
            currentSessionFinalRef.current = ''
            interimTextRef.current = ''
            whisperAudioChunksRef.current = []
            whisperFinalizedTranscriptRef.current = ''
            liveInterimGhostRef.current = ''
            segmentHasSpeechRef.current = false
            setTranscriptionText('')
            setInterimTranscriptText('')
            setCodeAnswer('')
            setCodeOutput('')
            behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 }
            setCurrentQuestionIndex(nextIdx)
            questionStartTimeRef.current = Date.now()
            const nextQ = questions[nextIdx] || batch[0]
            if (nextQ && nextQ.type !== 'coding') {
              speakAIQuestion(nextQ.text || nextQ.question || nextQ.prompt || '')
            }
          } else {
            handleSubmitInterview()
          }
        }
      } else {
        // ── Pre-fetch next batch when on second-to-last question ──
        const qsLen = questions.length
        if (qsLen < 22 && !isPrefetchingRef.current && qsLen - currentQuestionIndex <= 2 && prefetchedQuestionsRef.current.length === 0) {
          isPrefetchingRef.current = true
          const alreadyAskedIds = questions.map(q => String(q.id || '')).join(',')
          const fd = new FormData()
          fd.append('interview_id', iid)
          fd.append('asked_question_ids', alreadyAskedIds)
          fd.append('count', '5')
          fetch(`${import.meta.env.VITE_API_URL || ''}/generate-more-questions`, { method: 'POST', body: fd })
            .then(r => r.json())
            .then(data => {
              if (data.questions && data.questions.length > 0) {
                prefetchedQuestionsRef.current = data.questions
              }
            })
            .catch(() => { })
            .finally(() => { isPrefetchingRef.current = false })
        }

        accumulatedTranscriptRef.current = ''
        currentSessionFinalRef.current = ''
        interimTextRef.current = ''
        whisperAudioChunksRef.current = []
        whisperFinalizedTranscriptRef.current = ''
        liveInterimGhostRef.current = ''
        segmentHasSpeechRef.current = false
        setTranscriptionText('')
        setInterimTranscriptText('')
        setCodeAnswer('')
        setCodeOutput('')
        behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 }

        const nextIdx = currentQuestionIndex + 1
        setCurrentQuestionIndex(nextIdx)
        questionStartTimeRef.current = Date.now()

        if (questions[nextIdx] && questions[nextIdx].type !== 'coding') {
          speakAIQuestion(questions[nextIdx].text || questions[nextIdx].question || questions[nextIdx].prompt || '')
        }
      }
    } catch (e) {
      const errMsg = e.response?.data?.detail || e.message || 'Unknown error'
      Swal.fire({
        title: 'Save Failed',
        text: `Failed to save your response. Error: ${errMsg}. Please try again.`,
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
    } finally {
      isNextingRef.current = false  // release lock so user can click Next again
    }
  }

  useEffect(() => {
    handleNextQuestionRef.current = handleNextQuestion
  }, [handleNextQuestion])

  const handleSubmitInterview = async (forceClose = false, terminationReason = null) => {
    const isTimeout = forceClose === true || (typeof forceClose === 'boolean' && forceClose)

    if (isSubmittingRef.current) return  // Prevent double-submit
    isSubmittingRef.current = true
    setIsSaving(true)

    // ── Immediately mark as completed so the interview UI hides right away ──
    // This prevents the interview from staying visible during async cleanup,
    // and stops back-navigation from re-showing the interview.
    setIsCompleted(true)
    setUploadingText("Finalizing interview...")
    setUploadPercentage(10)

    if (window.speechSynthesis) window.speechSynthesis.cancel()
    stopSilenceTimer()
    if (_sessionKey) sessionStorage.removeItem(_sessionKey)
    visualizerActiveRef.current = false

    if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current)
    if (noiseMonitorFrameRef.current) cancelAnimationFrame(noiseMonitorFrameRef.current)
    isSpeechRecordingRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { }
    }

    if (segmentRecorderRef.current && segmentRecorderRef.current.state !== 'inactive') {
      try { segmentRecorderRef.current.stop() } catch (e) { }
      segmentRecorderRef.current = null
    }
    if (whisperMediaRecorderRef.current && whisperMediaRecorderRef.current.state !== 'inactive') {
      try { whisperMediaRecorderRef.current.stop() } catch (e) { }
      whisperMediaRecorderRef.current = null
    }
    if (whisperPauseTimeoutRef.current) clearTimeout(whisperPauseTimeoutRef.current)

    // Async helper to cleanly request data and wait for onstop before killing stream tracks
    const stopRecorderAsync = (recorderRef, name) => {
      return new Promise(resolve => {
        const recorder = recorderRef.current
        if (!recorder || recorder.state === 'inactive') {
          console.log(`[REC_TRACE] ${name} recorder already inactive`)
          return resolve()
        }
        let resolved = false
        const finish = () => {
          if (!resolved) {
            resolved = true
            console.log(`[REC_TRACE] ${name} recorder stopped cleanly. Final state: ${recorder.state}`)
            resolve()
          }
        }
        recorder.onstop = finish
        try { recorder.requestData() } catch (e) { console.warn(`[REC_TRACE] ${name} requestData warn:`, e) }
        try { recorder.stop() } catch (e) { console.warn(`[REC_TRACE] ${name} stop warn:`, e); finish() }
        setTimeout(finish, 400) // Fallback timeout if onstop event doesn't fire
      })
    }

    console.log("[REC_TRACE] Stopping camera and screen recorders asynchronously...")
    await Promise.all([
      stopRecorderAsync(cameraRecorderRef, 'Camera'),
      stopRecorderAsync(screenRecorderRef, 'Screen')
    ])

    try {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => { try { track.stop() } catch (e) { } })
        console.log("[REC_TRACE] Camera stream tracks stopped.")
      }
    } catch (e) { console.error("[REC_TRACE] Error stopping media tracks:", e) }

    try {
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => { try { track.stop() } catch (e) { } })
        console.log("[REC_TRACE] Screen stream tracks stopped.")
      }
    } catch (e) { console.error("[REC_TRACE] Error stopping screen tracks:", e) }

    try {
      if (audioMixerDestRef.current && audioMixerDestRef.current.stream) {
        audioMixerDestRef.current.stream.getTracks().forEach(track => { try { track.stop() } catch (e) { } })
      }
      if (audioMixerCtxRef.current && audioMixerCtxRef.current.state !== 'closed') {
        audioMixerCtxRef.current.close().catch(e => console.error("Error closing audio mixer:", e))
      }
    } catch (e) { console.error("[REC_TRACE] Error stopping audio mixer:", e) }

    let uploadPromiseChain = Promise.resolve()

    const cameraChunksCount = cameraChunksRef.current ? cameraChunksRef.current.length : 0
    const screenChunksCount = screenChunksRef.current ? screenChunksRef.current.length : 0
    console.log(`[REC_TRACE] Recording summary before upload: Camera chunks = ${cameraChunksCount}, Screen chunks = ${screenChunksCount}`)

    if (cameraChunksCount > 0 || screenChunksCount > 0) {
      setUploadingText("Uploading video recordings...")
      setUploadPercentage(10)
      setShowSkipButton(true)

      const uploadPromise = (chunks, type) => {
        return new Promise((resolve, reject) => {
          if (!chunks || chunks.length === 0) {
            console.log(`[REC_TRACE] No chunks for ${type}, skipping upload.`)
            return resolve()
          }
          const mime = recordedMimeTypeRef.current || 'video/webm'
          const cleanMime = mime.split(';')[0].trim() || 'video/webm'
          const ext = cleanMime.includes('mp4') ? 'mp4' : 'webm'
          const blob = new Blob(chunks, { type: cleanMime })
          console.log(`[REC_TRACE] Assembled ${type} Blob. Size: ${blob.size} bytes, Type: ${cleanMime}, File: interview_${type}.${ext}`)

          const formData = new FormData()
          const iid = interviewIdRef.current || sessionDetail?.interview_id || sessionId || ''
          formData.append('file', blob, `interview_${type}.${ext}`)
          formData.append('interview_id', iid)
          formData.append('recording_type', type)
          formData.append('link_id', sessionId || '')

          const xhr = new XMLHttpRequest()
          const uploadBase = (api.defaults.baseURL || '').replace(/\/api\/?$/, '')
          const uploadUrl = `${uploadBase}/upload-full-recording`
          console.log(`[REC_TRACE] Initiating XHR POST ${uploadUrl} for ${type} (interview_id: ${iid}, link_id: ${sessionId})`)
          xhr.open('POST', uploadUrl, true)
          const token = getCandidateSessionToken()
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`)
            console.log(`[REC_TRACE] Attached Bearer token for ${type} upload.`)
          } else {
            console.warn(`[REC_TRACE] No candidate session token found for ${type} upload!`)
          }

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && type === 'camera') {
              const percent = Math.floor((e.loaded / e.total) * 100)
              console.log(`[REC_TRACE] Upload progress (${type}): ${percent}% (${e.loaded}/${e.total} bytes)`)
              setUploadPercentage(percent)
            }
          }

          xhr.onload = () => {
            console.log(`[REC_TRACE] XHR response (${type}): status = ${xhr.status}, body = ${xhr.responseText}`)
            if (xhr.status === 200) {
              console.log(`[REC_TRACE] ${type} upload successful.`)
              resolve()
            } else {
              console.error(`[REC_TRACE] ${type} upload HTTP failure: status ${xhr.status}, text: ${xhr.responseText}`)
              reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`))
            }
          }
          xhr.onerror = (e) => {
            console.error(`[REC_TRACE] ${type} upload network error:`, e)
            reject(new Error("Network error during recording upload"))
          }
          xhr.send(formData)
        })
      }

      // Keep track of the upload promise to await it later
      uploadPromiseChain = Promise.all([
        uploadPromise(cameraChunksRef.current, 'camera'),
        uploadPromise(screenChunksRef.current, 'screen')
      ]).catch(err => console.error("Background upload failed:", err))
    }

    try {
      const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)
      const words = transcriptionText.trim().split(/\s+/).filter(w => w.length > 0).length
      const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
      const currentQuestion = questions[currentQuestionIndex] || {}

      // If forced termination (e.g., proctoring alert or timeout), save the answer first!
      if (forceClose && currentQuestion) {
        let finalAnswer = (transcriptionText || '').trim()
        if (currentQuestion.type !== 'coding') {
          const flushed = await flushWhisperTranscription()
          if (flushed) finalAnswer = flushed
        }
        const iid = interviewIdRef.current || sessionId
        const answerForm = new FormData()
        answerForm.append('interview_id', iid)
        answerForm.append('question_id', currentQuestion.id || (currentQuestionIndex + 1))
        answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
        answerForm.append('answer_text', currentQuestion.type === 'coding' ? (codeAnswer || 'No code submitted') : (finalAnswer || 'No answer provided'))
        answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
        answerForm.append('time_spent_seconds', timeSpent.toString())
        answerForm.append('time_limit_seconds', '120')
        const token = monitoringTokenRef.current || monitoringToken || getCandidateSessionToken()
        if (token) answerForm.append('monitoring_token', token)
        try {
          await api.post(`/save-answer`, answerForm, {
            headers: {
              'Content-Type': 'multipart/form-data',
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            }
          })
        } catch (e) {
          // Persist failed answers before promising automatic recovery (forceClose submission)
          try {
            const failedKey = `failed_answer_${sessionId}_${currentQuestion.id || (currentQuestionIndex + 1)}`
            const answerData = {
              interview_id: iid,
              question_id: currentQuestion.id || (currentQuestionIndex + 1),
              question_text: currentQuestion.text || currentQuestion.question || '',
              answer_text: currentQuestion.type === 'coding' ? (codeAnswer || 'No code submitted') : (finalAnswer || 'No answer provided'),
              time_spent_seconds: timeSpent
            }
            sessionStorage.setItem(failedKey, JSON.stringify(answerData))
          } catch (_) { }
        }
      }

      const payload = {
        interview_id: interviewIdRef.current || sessionId,
        question_id: (currentQuestion.id || (currentQuestionIndex + 1)).toString(),
        wpm: wpm,
        pause_count: behavioralStatsRef.current.pauseCount,
        filler_count: countFillers(transcriptionText),
        time_spent_seconds: timeSpent,
        keyword_match_pct: 0,
        tab_switches: behavioralStatsRef.current.tabSwitches,
        face_alerts: behavioralStatsRef.current.faceAlerts,
        noise_alerts: behavioralStatsRef.current.noiseAlerts
      }
      await api.post(`/save-behavioral-data`, payload)
    } catch (e) { console.error("Failed to save final behavioral data:", e) }

    try {
      const queryParams = terminationReason ? `?reason=${encodeURIComponent(terminationReason)}` : ''
      await api.post(`/complete-session/${sessionId}${queryParams}`)
      if (sessionId) {
        try { sessionStorage.setItem(`interview_done_${sessionId}`, '1') } catch (e) { }
      }
    } catch (completionError) {
      console.error('Failed to complete interview session:', completionError)
      isSubmittingRef.current = false
      setIsCompleted(false)
      Swal.fire({
        title: 'Submission Failed',
        text: 'Your interview could not be finalized. Please check your connection and submit again.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
      return
    }

    // Wait for the video upload to finish before marking everything complete
    await uploadPromiseChain

    setShowSkipButton(false)
    setUploadPercentage(100)
    setUploadingText("")
    setTimeout(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err))
      }
      setShowAllSet(true)
      setIsSaving(false)  // Upload complete, allow tab close
    }, 1500)
  }
  handleSubmitInterviewRef.current = handleSubmitInterview

  const handleFinishEarly = () => {
    Swal.fire({
      title: 'Finish Interview?',
      html: '<p style="color:#94a3b8;font-size:14px">Are you sure you want to end the interview now? Your answers will be saved and submitted.</p>',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Confirm finish interview',
      cancelButtonText: 'Continue the interview',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6366f1',
      background: '#0f172a',
      color: '#fff',
      customClass: {
        popup: 'border border-white/10 rounded-2xl shadow-2xl',
        title: 'text-xl font-bold text-white',
        actions: 'flex gap-4 mt-4 w-full justify-center',
        confirmButton: 'bg-red-500 hover:bg-red-600 text-white rounded-lg px-5 py-2.5 font-medium transition-colors cursor-pointer border-none outline-none',
        cancelButton: 'bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg px-5 py-2.5 font-medium transition-colors cursor-pointer border-none outline-none'
      },
      buttonsStyling: false
    }).then(async result => {
      if (result.isConfirmed) {
        // Save current answer before early exit
        const currentQuestion = questions[currentQuestionIndex]
        if (currentQuestion && (transcriptionText.trim() || codeAnswer.trim())) {
          const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)
          const iid = interviewId || sessionDetail?.interview_id || sessionId
          if (currentQuestion.type === 'case_study') {
            await api.post(`/case-study/submit-answer`, {
              interview_id: iid,
              question_index: currentQuestion.caseStudyIndex,
              answer_text: transcriptionText || ' '
            }).catch(() => { })
          } else {
            const answerForm = new FormData()
            answerForm.append('interview_id', iid)
            answerForm.append('question_id', currentQuestion.id || (currentQuestionIndex + 1))
            answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
            answerForm.append('answer_text', currentQuestion.type === 'coding' ? (codeAnswer || ' ') : (transcriptionText || ' '))
            answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
            answerForm.append('time_spent_seconds', timeSpent.toString())
            const token = monitoringTokenRef.current || monitoringToken || getCandidateSessionToken()
            if (token) answerForm.append('monitoring_token', token)
            await api.post(`/save-answer`, answerForm, {
              headers: {
                'Content-Type': 'multipart/form-data',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
              }
            }).catch(() => { })
          }
        }
        handleSubmitInterview(false, 'early_exit')
      }
    })
  }

  const completeVoiceCloneSetup = (voiceId = null) => {
    if (voiceId) {
      setClonedVoiceId(voiceId)
      clonedVoiceIdRef.current = voiceId
    }
    setShowVoiceCloneSetup(false)

    if (questions.length > 0) {
      speakAIQuestion(questions[0].text || questions[0].question || questions[0].prompt || '')
    }
  }

  return {
    loading,
    showAllSet,
    error,
    isDisclaimerAccepted,
    agreeChecked,
    setAgreeChecked,
    acceptDisclaimer,
    promptScreenShare,
    showDeviceCheck,
    setShowDeviceCheck,
    setupMedia,
    autoReconnecting,
    sessionDetail,
    interviewId,
    questions,
    setQuestions,
    currentQuestionIndex,
    setCurrentQuestionIndex,
    currentQuestion,
    codingTask,
    isMediaReady,
    proctoringAlert,
    modelsFailed: proctoring.modelsFailed,
    faceAlertCount,
    noiseAlertCount,
    showNoiseBanner,
    securityMessage,
    fullscreenWarning,
    screenShareWarning,
    screenShareViolations,
    uploadPercentage,
    uploadingText,
    skipCountdown,
    showSkipButton,
    transcriptionText,
    setTranscriptionText,
    codeAnswer,
    setCodeAnswer,
    selectedLanguage,
    setSelectedLanguage,
    codeOutput,
    setCodeOutput,
    runResultData,
    setRunResultData,
    evaluatedCount,
    setEvaluatedCount,
    selectedTestCase,
    setSelectedTestCase,
    consoleOutput,
    setConsoleOutput,
    activeConsoleTab,
    setActiveConsoleTab,
    activeRightTab,
    setActiveRightTab,
    compiling,
    setCompiling,
    codeOutputState: codeOutput,
    setCodeOutputState: setCodeOutput,
    globalCountdown,
    totalDuration,
    isRoundTwo,
    setIsRoundTwo,
    showRound2Confirm,
    setShowRound2Confirm,
    codingRoundLoading,
    setCodingRoundLoading,
    codingRoundData,
    setCodingRoundData,
    aiInsights,
    videoPreviewRef,
    visualizerCanvasRef,
    visualizerActiveRef,
    visualizerAudioCtxRef,
    enableFullscreen,
    restartScreenShare,
    speakAIQuestion,
    showVoiceCloneSetup,
    completeVoiceCloneSetup,
    handleStartRound2Click,
    proceedToRoundTwo,
    handleNextQuestion,
    handleSubmitInterview,
    handleFinishEarly,
    handleSkipUpload,
    isMobileDevice,
    recognitionRef,
    isSpeechRecordingRef,
    interimTranscriptText,
    isCompleted,
    scheduledStart,
    isOnline
  }
}
