import React, { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import api from '../utils/api'

export default function Interview() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id') || searchParams.get('session')
  const [error, setError] = useState(null)
  const _sessionKey = sessionId ? `interview_session_${sessionId}` : null
  const _savedSession = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false)
  const [agreeChecked, setAgreeChecked] = useState(false)
  const [autoReconnecting, setAutoReconnecting] = useState(!!_savedSession?.accepted)
  const [isMobileDevice, setIsMobileDevice] = useState(false)

  // Session details from backend
  const [sessionDetail, setSessionDetail] = useState(null)
  const [interviewId, setInterviewId] = useState('')
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(_savedSession?.currentQuestionIndex || 0)
  const currentQuestion = questions[currentQuestionIndex]
  const codingTask = currentQuestion?.codingTask || currentQuestion || {}

  // Proctoring/Recording states
  const [isMediaReady, setIsMediaReady] = useState(false)
  const [proctoringAlert, setProctoringAlert] = useState('')
  const [noiseAlertCount, setNoiseAlertCount] = useState(0)
  const [showNoiseBanner, setShowNoiseBanner] = useState(false)
  const [fullscreenWarning, setFullscreenWarning] = useState(false)
  const [screenShareWarning, setScreenShareWarning] = useState(false)
  const [screenShareViolations, setScreenShareViolations] = useState(0)

  // Upload states
  const [uploadPercentage, setUploadPercentage] = useState(0)
  const [uploadingText, setUploadingText] = useState('')
  const [skipCountdown, setSkipCountdown] = useState(30)
  const [showSkipButton, setShowSkipButton] = useState(false)

  // Answer state
  const [transcriptionText, setTranscriptionText] = useState('')
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
  const [isRoundTwo, setIsRoundTwo] = useState(false)
  const isRoundTwoRef = useRef(false)
  const [showRound2Confirm, setShowRound2Confirm] = useState(false)
  const codingRoundStartedRef = useRef(false)
  const [codingRoundLoading, setCodingRoundLoading] = useState(false)
  const [codingRoundData, setCodingRoundData] = useState(null)
  const [aiInsights, setAiInsights] = useState({ clarity: 50, technicalDepth: 50, confidence: 50 })

  // Mobile Screen Detection
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      const isMobile = mobileRegex.test(userAgent.toLowerCase()) || window.innerWidth <= 768;

      if (isMobile) {
        setIsMobileDevice(true);
        Swal.fire({
          icon: 'error',
          title: 'Device Not Supported',
          text: 'This proctored interview requires a desktop or laptop computer. Mobile devices and small screens are not supported.',
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
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch AI Insights dynamically
  useEffect(() => {
    const iid = interviewId || sessionDetail?.interview_id || sessionId
    if (!iid) return

    const fetchInsights = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/interview/${iid}/insights`)
        if (response.ok) {
          const data = await response.json()
          setAiInsights(data)
        }
      } catch (err) {
        console.error("Failed to fetch AI insights", err)
      }
    }

    fetchInsights()
    const interval = setInterval(fetchInsights, 15000)
    return () => clearInterval(interval)
  }, [interviewId, sessionDetail?.interview_id, sessionId])

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
      }, 400); // 400ms delay per test case
      return () => clearInterval(interval);
    }
  }, [runResultData]);

  useEffect(() => {
    if (currentQuestion?.type === 'coding' && currentQuestion?.codingTask) {
      const task = currentQuestion.codingTask
      const templates = {
        python: task.starter_function_signature || `def ${task.function_name || 'winner'}(donuts, starter):\n    # Write your code here\n    pass`,
        javascript: task.function_name === 'winner'
          ? `function winner(donuts, starter) {\n    // Write your code here\n    \n}`
          : task.function_name === 'find_duplicates'
            ? `function findDuplicates(records) {\n    // Write your code here\n    \n}`
            : `function debounceSimulation(calls, delay) {\n    // Write your code here\n    \n}`,
        cpp: task.function_name === 'winner'
          ? `#include <vector>\n#include <string>\n\nstd::vector<std::string> winner(std::vector<int> donuts, std::vector<std::string> starter) {\n    // Write your code here\n    \n}`
          : task.function_name === 'find_duplicates'
            ? `#include <vector>\n#include <string>\n\nstd::vector<std::string> findDuplicates(std::vector<std::string> records) {\n    // Write your code here\n    \n}`
            : `#include <vector>\n\nint debounceSimulation(std::vector<int> calls, int delay) {\n    // Write your code here\n    \n}`
      }

      const isDefault = !codeAnswer || Object.values(templates).some(tmpl => codeAnswer.trim() === tmpl.trim())
      if (isDefault) {
        setCodeAnswer(templates[selectedLanguage] || '')
      }
    }
  }, [currentQuestion, selectedLanguage])

  // Recording Ref elements
  const videoPreviewRef = useRef(null)

  // Audio context/recorder references
  const cameraRecorderRef = useRef(null)
  const screenRecorderRef = useRef(null)
  const cameraChunksRef = useRef([])
  const screenChunksRef = useRef([])
  const mediaStreamRef = useRef(null)
  const screenStreamRef = useRef(null)

  // Speech Recognition Reference
  const recognitionRef = useRef(null)
  const isSpeechRecordingRef = useRef(false)

  // Proctoring Loops
  const faceDetectionIntervalRef = useRef(null)
  const noiseAudioContextRef = useRef(null)
  const noiseMonitorFrameRef = useRef(null)
  const noiseFrameCountRef = useRef(0)
  const noiseCooldownRef = useRef(0)

  // Feature Migration Refs
  const visualizerCanvasRef = useRef(null)
  const visualizerActiveRef = useRef(false)
  const silenceTimeoutRef = useRef(null)
  const questionStartTimeRef = useRef(Date.now())
  const behavioralStatsRef = useRef({ wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 })
  const [proctoringBanner, setProctoringBanner] = useState(null)
  const [proctoringState, setProctoringState] = useState({
    modelsReady: false,
    faceVisible: null,
    faceCount: 0,
    multiFace: false,
    phoneDetected: false,
    eyeContactLost: false,
    lastAlertType: ''
  })
  const handleNextQuestionRef = useRef(null)

  // WebRTC Candidate Logic
  const telemetryData = {
    round_type: isRoundTwo ? 'coding' : 'verbal',
    current_question: currentQuestionIndex + 1,
    total_questions: questions.length,
    question_text: questions[currentQuestionIndex]?.text || '',
    audio_level: 50, // Static or dynamically retrieved if needed
    proctoring_alerts: screenShareViolations + noiseAlertCount + behavioralStatsRef.current.faceAlerts + behavioralStatsRef.current.tabSwitches,
    proctoring_status: proctoringState
  }
  useCandidateWebRTC(sessionId, mediaStreamRef, telemetryData)

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
      if (document.hidden && sessionId && isDisclaimerAccepted) {
        behavioralStatsRef.current.tabSwitches += 1
        const count = behavioralStatsRef.current.tabSwitches
        // Log to backend
        fetch(`${API_BASE_URL}/interview/${sessionId}/alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'tab_switch', message: `Tab switch detected (count: ${count})` })
        }).catch(() => { })
        // Show visible banner
        setProctoringBanner({ type: 'tab_switch', message: `⚠️ Tab switch detected! (${count} total)` })
        setTimeout(() => setProctoringBanner(null), 4000)

        // Show blocking SweetAlert
        Swal.fire({
          icon: 'warning',
          title: '⚠️ Tab Switch Detected',
          text: `You have switched tabs or minimized the window. This is a violation of the proctoring rules. (Warning ${count})`,
          confirmButtonText: 'I Understand',
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
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [sessionId, isDisclaimerAccepted])

  // Track unload events (Refresh or Close tab)
  useEffect(() => {
    const handleUnload = () => {
      if (sessionId && isDisclaimerAccepted) {
        // Send a beacon so it fires reliably during page unload
        navigator.sendBeacon(`${API_BASE_URL}/interview/${sessionId}/alert`, JSON.stringify({
          type: "warning",
          message: "Candidate refreshed or closed the window."
        }))
      }
    }
    window.addEventListener("beforeunload", handleUnload)
    return () => window.removeEventListener("beforeunload", handleUnload)
  }, [sessionId, isDisclaimerAccepted])

  // Persist current question index
  useEffect(() => {
    if (!_sessionKey || !isDisclaimerAccepted) return
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
    sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, currentQuestionIndex }))
  }, [currentQuestionIndex, isDisclaimerAccepted, _sessionKey])

  // Audio Visualizer
  const visualizeAudio = (stream) => {
    const canvas = visualizerCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)

    visualizerActiveRef.current = true

    const draw = () => {
      if (!visualizerActiveRef.current) {
        audioCtx.close().catch(() => { })
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        return
      }

      requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
      gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)')
      gradient.addColorStop(0.5, 'rgba(79, 70, 229, 1)')
      gradient.addColorStop(1, 'rgba(99, 102, 241, 0.4)')
      ctx.strokeStyle = gradient

      ctx.beginPath()

      const drawLength = Math.floor(bufferLength * 0.6)
      const sliceWidth = canvas.width / drawLength
      let x = 0

      for (let i = 0; i < drawLength; i++) {
        const v = dataArray[i] / 255.0
        const amplitude = (canvas.height / 2) * 0.8
        const y = (canvas.height / 2) + (v * amplitude * (i % 2 === 0 ? 1 : -1))

        if (i === 0) {
          ctx.moveTo(x, canvas.height / 2)
        } else {
          ctx.lineTo(x, y)
        }
        x += sliceWidth
      }

      ctx.stroke()
    }
    draw()
  }

  useEffect(() => {
    if (isMediaReady && mediaStreamRef.current && visualizerCanvasRef.current) {
      visualizeAudio(mediaStreamRef.current)
    }
    return () => {
      visualizerActiveRef.current = false
    }
  }, [isMediaReady, currentQuestionIndex])

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

  const handleSkipUpload = () => {
    setShowSkipButton(false)
    setShowAllSet(true)
  }

  useEffect(() => {
    if (!sessionId) {
      setError("Missing Session ID in URL parameters. Please check your secure interview invitation link.")
      return
    }

    const resolveSession = async () => {
      try {
        const payload = await api.get(`/session/${sessionId}`).then(r => r.data)

        if (payload.status !== 'success') {
          throw new Error(payload.detail || payload.message || "Failed to load session details.")
        }
        if (payload.is_deactivated) {
          throw new Error("This interview link has been temporarily deactivated by the recruiter.")
        }
        if (payload.is_expired) {
          throw new Error("This interview link has expired. Please contact the recruiter for a new link.")
        }
        if (payload.session_status === 'completed') {
          throw new Error("This interview session has already been completed.")
        }

        if (payload.interview_format === 'Voice') {
          navigate(`/voice-interview/${sessionId}`, { replace: true })
          return
        }

        const type = payload.interview_type || 'Technical'
        if (type === 'Technical') {
          navigate(`/interview/technical?session_id=${sessionId}`, { replace: true })
        } else if (type === 'Non-Technical') {
          navigate(`/interview/non-technical?session_id=${sessionId}`, { replace: true })
        } else {
          navigate(`/interview/normal?session_id=${sessionId}`, { replace: true })
        }
      } catch (err) {
        setError(err.message || "Unable to access this interview session.")
        setLoading(false)
      }
    }
    verifySession()
  }, [sessionId])

  // Auto-reconnect: if page was refreshed during an active session, silently re-request media
  useEffect(() => {
    if (!autoReconnecting || loading || error || questions.length === 0) return
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
      buttonsStyling: false
    }).then(result => {
      if (result.isConfirmed) {
        setupMedia()
      } else {
        // User chose to start over — clear saved session
        if (_sessionKey) sessionStorage.removeItem(_sessionKey)
        setAutoReconnecting(false)
      }
    })
  }, [autoReconnecting, loading, error, questions.length])

  // Enable Fullscreen
  function enableFullscreen() {
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log(err))
    } else if (elem.webkitRequestFullscreen) { /* Safari */
      elem.webkitRequestFullscreen().catch(err => console.log(err));
    } else if (elem.msRequestFullscreen) { /* IE11 */
      elem.msRequestFullscreen().catch(err => console.log(err));
    }
    setFullscreenWarning(false)
  }

  // Proctoring: Fullscreen Checker
  useEffect(() => {
    if (!isDisclaimerAccepted) return

    const checkFullscreen = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
        setFullscreenWarning(true)
      } else {
        setFullscreenWarning(false)
      }
    }
    document.addEventListener('fullscreenchange', checkFullscreen)
    document.addEventListener('webkitfullscreenchange', checkFullscreen)
    document.addEventListener('MSFullscreenChange', checkFullscreen)

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen)
      document.removeEventListener('webkitfullscreenchange', checkFullscreen)
      document.removeEventListener('MSFullscreenChange', checkFullscreen)
    }
  }, [isDisclaimerAccepted, navigate])

  // Handle Speech Recognition setup
  const initSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.warn("Speech recognition not supported in this browser.")
      return
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = true
    const targetLang = langMap[sessionDetail?.language] || 'en-IN'
    rec.lang = targetLang

    rec.onstart = () => {
      isSpeechRecordingRef.current = true
    }

    rec.onend = () => {
      if (isSpeechRecordingRef.current) {
        behavioralStatsRef.current.pauseCount += 1
        try { rec.start() } catch (e) { }
      }
    }

    rec.onresult = (event) => {
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript
        }
      }
      if (finalChunk) {
        setTranscriptionText(prev => prev + finalChunk + ' ')
      }

      if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
      if (!isRoundTwoRef.current) {
        silenceTimeoutRef.current = setTimeout(() => {
          if (handleNextQuestionRef.current) handleNextQuestionRef.current()
        }, 10000)
      }
    }

    rec.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.error("Speech Recognition Error:", e.error)
      }
    }

    recognitionRef.current = rec
  }



  useEffect(() => {
    if (!isDisclaimerAccepted || !mediaStreamRef.current || !videoPreviewRef.current) return
    if (videoPreviewRef.current.srcObject !== mediaStreamRef.current) {
      videoPreviewRef.current.srcObject = mediaStreamRef.current
      videoPreviewRef.current.muted = true
      videoPreviewRef.current.play().catch(e => console.log(e))
    }
  }, [isDisclaimerAccepted, currentQuestionIndex])

  // Monitor Mic Noise
  const startBackgroundNoiseMonitor = (stream) => {
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
        const now = Date.now()

        // Background noise calculation
        if (rms > 0.18 && now > noiseCooldownRef.current) {
          noiseFrameCountRef.current++
        } else {
          noiseFrameCountRef.current = Math.max(0, noiseFrameCountRef.current - 2)
        }

        if (noiseFrameCountRef.current >= 18) {
          noiseCooldownRef.current = now + 5000
          noiseFrameCountRef.current = 0
          setNoiseAlertCount(prev => {
            const next = prev + 1
            recordAlertMetric("noise_alert")
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

  // Record proctoring metrics
  const recordAlertMetric = async (type, message) => {
    behavioralStatsRef.current.faceAlerts += 1
    setProctoringState(prev => ({ ...prev, lastAlertType: type }))
    const alertMessages = {
      'multi_person': '⚠️ Multiple faces detected in frame!',
      'no_face': '⚠️ No face detected — please face the camera!',
      'phone': '🚫 Mobile phone detected in frame!',
      'eye_contact': '👁️ Please maintain eye contact with the screen.',
    }
    const displayMsg = alertMessages[type] || `⚠️ Proctoring alert: ${type}`
    // Show visible overlay banner
    setProctoringBanner({ type, message: displayMsg })
    setTimeout(() => setProctoringBanner(null), 4000)

    if (type === 'eye_contact') {
      Swal.fire({
        icon: 'warning',
        title: '⚠️ Eye Contact Lost',
        text: 'Please maintain eye contact with the screen. Looking away is a violation of the proctoring rules.',
        confirmButtonText: 'I Understand',
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
    }

    // Log to backend
    if (sessionId) {
      try {
        await fetch(`${API_BASE_URL}/interview/${sessionId}/alert`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, message: message || displayMsg })
        })
      } catch (e) { }
    }
  }

  // Use Centralized AI Proctoring Hook
  useProctoring(videoPreviewRef, isDisclaimerAccepted && !showAllSet && !loading, recordAlertMetric, setProctoringState);

  useEffect(() => {
    if (!sessionId || !isDisclaimerAccepted || showAllSet || loading) return

    const captureSnapshot = () => {
      const video = videoPreviewRef.current
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * canvas.width))
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', 0.55)
      } catch (_) {
        return null
      }
    }

    const sendHeartbeat = () => {
      const alertTypes = []
      if (proctoringState.multiFace) alertTypes.push('multi_person')
      if (proctoringState.faceVisible === false) alertTypes.push('no_face')
      if (proctoringState.phoneDetected) alertTypes.push('phone')
      if (proctoringState.eyeContactLost) alertTypes.push('eye_contact')
      if (proctoringState.lastAlertType) alertTypes.push(proctoringState.lastAlertType)

      fetch(`${API_BASE_URL}/live-heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          link_id: sessionId,
          snapshot_dataurl: captureSnapshot(),
          audio_level: 50,
          current_question: currentQuestionIndex + 1,
          total_questions: questions.length || 0,
          tab_active: !document.hidden,
          face_visible: proctoringState.faceVisible,
          proctoring_alerts: screenShareViolations + noiseAlertCount + behavioralStatsRef.current.faceAlerts + behavioralStatsRef.current.tabSwitches,
          alert_types: [...new Set(alertTypes)],
          last_alert_type: proctoringState.lastAlertType || null,
          face_count: proctoringState.faceCount || 0,
          multi_face: !!proctoringState.multiFace,
          phone_detected: !!proctoringState.phoneDetected,
          eye_contact_lost: !!proctoringState.eyeContactLost
        })
      }).catch(() => { })
    }

    sendHeartbeat()
    const heartbeatInterval = setInterval(sendHeartbeat, 5000)
    return () => clearInterval(heartbeatInterval)
  }, [sessionId, isDisclaimerAccepted, showAllSet, loading, currentQuestionIndex, questions.length, proctoringState, screenShareViolations, noiseAlertCount])

  // Accept Disclaimer & Start Interview
  const acceptDisclaimer = () => {
    Swal.fire({
      title: 'Media Access Required',
      html: `
        <div class="text-left space-y-3">
          <p class="text-slate-300">This proctored assessment requires permissions to access your:</p>
          <ul class="list-disc pl-5 text-slate-300 text-sm space-y-1">
            <li><strong>Webcam</strong> (for face detection & identity verification)</li>
            <li><strong>Microphone</strong> (for speech-to-text recording)</li>
            <li><strong>Entire Screen</strong> (for browser proctoring verification)</li>
          </ul>
          <p class="text-xs text-amber-500 mt-3 font-semibold">⚠️ Note: Please select your "Entire Screen" when prompted for screen sharing.</p>
        </div>
      `,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Start Setup',
      cancelButtonText: 'Cancel',
      background: '#161c2d',
      color: '#fff',
      customClass: {
        popup: 'border border-white/8 rounded-2xl shadow-2xl',
        title: 'text-xl font-bold text-white',
        htmlContainer: 'text-slate-300 text-sm',
        confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none mr-2',
        cancelButton: 'bg-white/6 hover:bg-white/12 text-white border border-white/8 rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer outline-none'
      },
      buttonsStyling: false
    }).then(async (result) => {
      if (!result.isConfirmed) return
      await setupMedia()
    })
  }

  const setupMedia = async () => {
    try {
      // 1. Request Camera & Mic
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: 15 },
          audio: true
        })
      } catch (err) {
        console.error("Camera/Mic getUserMedia error:", err)
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error("webcam_mic_not_found")
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("webcam_mic_denied")
        } else {
          throw new Error(`webcam_mic_failed: ${err.message || err.name}`)
        }
      }

      // 2. Request Screen Share
      let screenStream
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor", frameRate: 15 },
          audio: false
        })
      } catch (err) {
        console.error("Screen Share getDisplayMedia error:", err)
        // Stop camera stream since screen share failed
        stream.getTracks().forEach(t => t.stop())
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("screenshare_denied")
        } else {
          throw new Error(`screenshare_failed: ${err.message || err.name}`)
        }
      }

      const videoTrack = screenStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        screenStream.getTracks().forEach(t => t.stop());
        stream.getTracks().forEach(t => t.stop());
        throw new Error("Please select 'Entire Screen' to proceed. Window or Tab sharing is not allowed.");
      }

      mediaStreamRef.current = stream
      screenStreamRef.current = screenStream

      // Setup preview
      const previewVideo = videoPreviewRef.current || document.createElement('video')
      previewVideo.srcObject = stream
      previewVideo.muted = true
      previewVideo.playsInline = true
      previewVideo.play().catch(e => console.log(e))

      // Monitor screen share stop
      const track = screenStream.getVideoTracks()[0]
      track.onended = () => {
        handleScreenShareStop()
      }

      // Mix Audio tracks into screen share
      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        screenStream.addTrack(audioTracks[0])
      }

      // Initialize recorders
      let options = { videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 }
      cameraRecorderRef.current = new MediaRecorder(stream, options)
      cameraChunksRef.current = []
      cameraRecorderRef.current.ondataavailable = e => {
        if (e.data.size > 0) cameraChunksRef.current.push(e.data)
      }

      screenRecorderRef.current = new MediaRecorder(screenStream, options)
      screenChunksRef.current = []
      screenRecorderRef.current.ondataavailable = e => {
        if (e.data.size > 0) screenChunksRef.current.push(e.data)
      }

      // Start recorders
      cameraRecorderRef.current.start(2000)
      screenRecorderRef.current.start(2000)

      // Start triggers
      initSpeechRecognition()
      if (recognitionRef.current) {
        recognitionRef.current.start()
      }

      // startFaceProctoring is now handled by useProctoring hook
      startBackgroundNoiseMonitor(stream)

      // Show fullscreen prompt before entering workspace
      Swal.fire({
        title: 'Setup Complete',
        text: 'Your camera, microphone, and screen sharing are ready. Click below to enter full screen and begin the interview.',
        icon: 'success',
        confirmButtonText: 'Enter Fullscreen & Begin',
        allowOutsideClick: false,
        allowEscapeKey: false,
        background: '#161c2d',
        color: '#fff',
        customClass: {
          popup: 'border border-white/8 rounded-2xl shadow-2xl',
          title: 'text-xl font-bold text-white',
          htmlContainer: 'text-slate-300 text-sm',
          confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
        },
        buttonsStyling: false,
        didOpen: () => {
          const confirmBtn = Swal.getConfirmButton();
          if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
              enableFullscreen();
            });
          }
        }
      }).then(() => {
        // Crucial: set these states last so we render the interview workspace
        setIsDisclaimerAccepted(true)
        setIsMediaReady(true)
        setAutoReconnecting(false)

        // Play introductory prompt text-to-speech for the first question (only on first start, not reconnect)
        const savedSess = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null
        if (!savedSess?.accepted && questions.length > 0) {
          speakAIQuestion(questions[0].text || questions[0].question || questions[0].prompt || '')
        }
      })

    } catch (err) {
      console.error("Setup permissions failure:", err)
      let errTitle = 'Setup Failed'
      let errText = 'All permissions (webcam, microphone, and screen share) are required to take this proctored interview.'
      let errIcon = 'error'

      if (err.message === 'webcam_mic_not_found') {
        errTitle = 'Camera/Microphone Not Found'
        errText = 'We could not detect a working camera or microphone. Please make sure they are connected and try again.'
        errIcon = 'warning'
      } else if (err.message === 'webcam_mic_denied') {
        errTitle = 'Camera/Microphone Access Denied'
        errText = 'Permission to access your camera and microphone was denied. Please check your browser settings and allow access to continue.'
      } else if (err.message === 'screenshare_denied') {
        errTitle = 'Screen Sharing Required'
        errText = 'You must share your entire screen to proceed with the secure proctored interview.'
        errIcon = 'warning'
      }

      Swal.fire({
        title: errTitle,
        text: errText,
        icon: errIcon,
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
    }
  }

  // Handle Screen share stop violation
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
        handleSubmitInterview(true)
      } else {
        setScreenShareWarning(true)
      }
      return next
    })
  }

  // Restart screen share
  const restartScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 15 },
        audio: false
      })
      screenStreamRef.current = screenStream
      setScreenShareWarning(false)

      const track = screenStream.getVideoTracks()[0]
      track.onended = () => {
        handleScreenShareStop()
      }

      // Mix microphone
      if (mediaStreamRef.current) {
        const audioTracks = mediaStreamRef.current.getAudioTracks()
        if (audioTracks.length > 0) {
          screenStream.addTrack(audioTracks[0])
        }
      }

      // Setup recorder
      let options = { videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 }
      screenRecorderRef.current = new MediaRecorder(screenStream, options)
      screenChunksRef.current = []
      screenRecorderRef.current.ondataavailable = e => {
        if (e.data.size > 0) screenChunksRef.current.push(e.data)
      }
      screenRecorderRef.current.start(2000)
    } catch (e) {
      Swal.fire({
        title: 'Screen Share Required',
        text: 'You must re-enable screen sharing to continue.',
        icon: 'warning',
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
    }
  }

  // Speech helper: TTS
  const speakAIQuestion = (text) => {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel() // stop any active speech
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

      utterance.onend = () => {
        if (!isRoundTwoRef.current) {
          if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = setTimeout(() => {
            if (handleNextQuestionRef.current) handleNextQuestionRef.current()
          }, 10000)
        }
      }

      window.speechSynthesis.speak(utterance)
    }

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = setVoiceAndSpeak
    } else {
      setVoiceAndSpeak()
    }
  }


  // Helper to count fillers
  const countFillers = (text) => {
    const FILLER_WORDS = ["um", "uh", "er", "like", "you know", "basically", "actually", "literally", "sort of", "kind of"]
    let count = 0
    const lower = text.toLowerCase()
    for (let fw of FILLER_WORDS) {
      const regex = new RegExp(`\\b${fw}\\b`, 'g')
      const matches = lower.match(regex)
      if (matches) count += matches.length
    }
    return count
  }

  // Start Next Round (Handles both Coding and Case Study)
  const startNextRound = async () => {
    if (isRoundTwoRef.current) return
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }
    if (sessionDetail?.interview_type === 'Normal') {
      handleSubmitInterview()
      return
    }
    setIsRoundTwo(true)
    isRoundTwoRef.current = true

    if (totalDuration > 0) {
      setGlobalCountdown(totalDuration / 2)
    }

    const type = sessionDetail?.interview_type || 'Technical'
    if (type === 'Non-Technical') {
      await startCaseStudyRound(questions.length)
    } else {
      await startCodingRound(questions.length)
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
    setShowRound2Confirm(false)

    // Save current answer first
    try {
      const activeQuestion = questions[currentQuestionIndex]
      const iid = interviewId || sessionDetail?.interview_id || sessionId
      const answerForm = new FormData()
      answerForm.append('interview_id', iid)
      answerForm.append('question_id', activeQuestion?.id || (currentQuestionIndex + 1))
      answerForm.append('question_text', activeQuestion?.text || activeQuestion?.question || '')
      answerForm.append('answer_text', activeQuestion?.type === 'coding' ? (codeAnswer || ' ') : (transcriptionText || ' '))
      answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
      answerForm.append('time_spent_seconds', '0')
      answerForm.append('time_limit_seconds', '120')

      await fetch(`${API_BASE_URL}/save-answer`, {
        method: 'POST',
        body: answerForm
      })
    } catch (e) {
      console.error("Failed to save answer during transition:", e)
    }

    setTranscriptionText('')
    setCodeAnswer('')
    setCodeOutput('')
    behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 }
    questionStartTimeRef.current = Date.now()
    startNextRound()
  }

  const startCaseStudyRound = async (verbalQuestionsLength, savedIndex = null) => {
    if (codingRoundStartedRef.current) return
    codingRoundStartedRef.current = true
    setCodingRoundLoading(true)

    const iid = interviewId || sessionDetail?.interview_id || sessionId
    try {
      const res = await fetch(`${API_BASE_URL}/case-study/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: iid })
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.detail || 'Failed to start case study round')

      const caseStudyQuestions = payload.case_study_round?.questions || []

      const formattedQs = caseStudyQuestions.map((q, idx) => {
        const text = `📁 CASE STUDY ROUND: ${q.skill_tested || 'Scenario'}\n\n${q.scenario}\n\nQuestion: ${q.question}`
        return {
          id: verbalQuestionsLength + idx + 1,
          text: text,
          question: text,
          type: 'case_study',
          category: 'Case Study',
          difficulty: 'Medium',
          caseStudyIndex: idx,
          evaluationCriteria: q.evaluation_criteria || []
        }
      })

      setQuestions(prev => [...prev, ...formattedQs])

      const targetIndex = (savedIndex !== null && savedIndex >= verbalQuestionsLength && savedIndex < verbalQuestionsLength + formattedQs.length)
        ? savedIndex
        : verbalQuestionsLength;

      setCurrentQuestionIndex(targetIndex)
    } catch (err) {
      console.error('Case study round start failed:', err)
      handleSubmitInterview()
    } finally {
      setCodingRoundLoading(false)
    }
  }

  // Start Coding Round: called after all verbal questions are answered
  const startCodingRound = async (verbalQuestionsLength, savedIndex = null) => {
    if (codingRoundStartedRef.current) return
    codingRoundStartedRef.current = true
    setCodingRoundLoading(true)

    const iid = interviewId || sessionDetail?.interview_id || sessionId
    try {
      const res = await fetch(`${API_BASE_URL}/coding-round/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: iid })
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.detail || 'Failed to start coding round')

      const task = payload.coding_round?.task || {}
      const recommendedLang = task.recommended_language || 'python'
      setSelectedLanguage(recommendedLang)
      setCodingRoundData(payload)

      // Build the display text shown in the question card
      const constraintsText = (task.constraints || []).join(' | ')
      const questionText = [
        `🖥️ CODING ROUND — ${task.title || 'Coding Challenge'}`,
        '',
        task.description || '',
        task.input_format ? `\nInput: ${task.input_format}` : '',
        task.output_format ? `Output: ${task.output_format}` : '',
        constraintsText ? `\nConstraints: ${constraintsText}` : '',
      ].filter(Boolean).join('\n')

      // Inject the coding question as the next (last) question
      const codingQ = {
        id: verbalQuestionsLength + 1,
        text: questionText,
        question: questionText,
        type: 'coding',
        category: 'Coding',
        difficulty: task.difficulty || 'Medium',
        title: task.title,
        description: task.description,
        input_format: task.input_format,
        constraints: task.constraints,
        output_format: task.output_format,
        examples: task.examples,
        codingTask: task,
        codingTests: payload.tests || []
      }
      setQuestions(prev => [...prev, codingQ])

      const targetIndex = (savedIndex !== null && savedIndex >= verbalQuestionsLength) ? savedIndex : verbalQuestionsLength;
      setCurrentQuestionIndex(targetIndex)
    } catch (err) {
      console.error('Coding round start failed:', err)
      // Fallback: skip coding round gracefully if it fails
      codingRoundStartedRef.current = false
      handleSubmitInterview()
    } finally {
      setCodingRoundLoading(false)
    }
  }

  // Submit Answer & Move Next
  const handleNextQuestion = async () => {
    if (currentQuestionIndex >= questions.length) return
    const currentQuestion = questions[currentQuestionIndex]

    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)

    const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)
    const words = transcriptionText.trim().split(/\s+/).filter(w => w.length > 0).length
    const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
    const payload = {
      interview_id: interviewId || sessionDetail?.interview_id || sessionId,
      question_id: currentQuestion.id,
      filler_words_count: countFillers(transcriptionText),
      speaking_pace_wpm: wpm,
      pause_count: behavioralStatsRef.current.pauseCount,
      tab_switches: behavioralStatsRef.current.tabSwitches,
      face_not_visible_alerts: behavioralStatsRef.current.faceAlerts
    }
    try {
      await fetch(`${API_BASE_URL}/save-behavioral-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
    } catch (e) { }

    // Save answer
    try {
      const iid = interviewId || sessionDetail?.interview_id || sessionId

      if (currentQuestion.type === 'case_study') {
        const response = await fetch(`${API_BASE_URL}/case-study/submit-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            interview_id: iid,
            question_index: currentQuestion.caseStudyIndex,
            answer_text: transcriptionText || ' '
          })
        })
        if (!response.ok) throw new Error('Failed to submit case study answer')
      } else {
        const answerForm = new FormData()
        answerForm.append('interview_id', iid)
        answerForm.append('question_id', currentQuestion.id || (currentQuestionIndex + 1))
        answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
        answerForm.append('answer_text', currentQuestion.type === 'coding' ? (codeAnswer || ' ') : (transcriptionText || ' '))
        answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
        answerForm.append('time_spent_seconds', '0')
        answerForm.append('time_limit_seconds', '120')

        const response = await fetch(`${API_BASE_URL}/save-answer`, {
          method: 'POST',
          body: answerForm
        })
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}))
          throw new Error(payload.detail || payload.message || 'Failed to save answer')
        }
      }

      // Check if this was the last question
      if (currentQuestionIndex === questions.length - 1) {
        const isCodingQ = currentQuestion.type === 'coding'
        const isCaseStudyQ = currentQuestion.type === 'case_study'

        if (isCodingQ) {
          // Submit the coding answer to the coding-round/submit endpoint
          try {
            await fetch(`${API_BASE_URL}/coding-round/submit`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                interview_id: iid,
                code: codeAnswer,
                explanation: codeAnswer,
                language: selectedLanguage
              })
            })
          } catch (e) { }
          handleSubmitInterview()
        } else if (isCaseStudyQ) {
          handleSubmitInterview()
        } else if (!isRoundTwo && sessionDetail?.interview_type !== 'Normal') {
          // All verbal questions done before timer forced transition — transition to Round 2
          setTranscriptionText('')
          setCodeAnswer('')
          setCodeOutput('')
          behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 }
          questionStartTimeRef.current = Date.now()
          startNextRound()
        } else {
          handleSubmitInterview()
        }
      } else {
        // Clear templates
        setTranscriptionText('')
        setCodeAnswer('')
        setCodeOutput('')
        behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 }

        const nextIdx = currentQuestionIndex + 1
        setCurrentQuestionIndex(nextIdx)
        questionStartTimeRef.current = Date.now()

        // Read out the next question
        if (questions[nextIdx] && questions[nextIdx].type !== 'coding') {
          speakAIQuestion(questions[nextIdx].text || questions[nextIdx].question || questions[nextIdx].prompt || '')
        }
      }
    } catch (e) {
      Swal.fire({
        title: 'Save Failed',
        text: 'Failed to save your response. Please try again.',
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
    }
  }

  // Keep ref in sync so callbacks (silence timer, TTS onend) always call the latest version
  useEffect(() => {
    handleNextQuestionRef.current = handleNextQuestion
  }, [handleNextQuestion])

  // Compiler code runner
  const handleRunCode = async () => {
    if (compiling) return
    setCompiling(true)
    setCodeOutput("Compiling and executing code...")
    setRunResultData(null)
    setConsoleOutput(`Compiling and executing code...\nLanguage: ${selectedLanguage}\nRunning tests...`)

    // Helper to safely parse print / console.log / cout statements and extract stdout
    const extractStdout = (code, lang) => {
      let outputs = []
      if (!code) return ""
      const lines = code.split('\n')

      if (lang === 'python') {
        for (let line of lines) {
          const match = line.match(/^\s*print\s*\(\s*(['"`])(.*?)\1\s*\)/)
          if (match) {
            outputs.push(match[2])
          } else {
            const simpleMatch = line.match(/^\s*print\s*\(\s*([a-zA-Z0-9_+\-*/\s]+)\s*\)/)
            if (simpleMatch) {
              const val = simpleMatch[1].trim()
              try {
                if (/^[0-9\s+\-*/()]+$/.test(val)) {
                  outputs.push(Function(`return (${val})`)())
                } else {
                  outputs.push(val)
                }
              } catch (e) {
                outputs.push(val)
              }
            }
          }
        }
      } else if (lang === 'javascript') {
        for (let line of lines) {
          const match = line.match(/^\s*console\.log\s*\(\s*(['"`])(.*?)\1\s*\)/)
          if (match) {
            outputs.push(match[2])
          } else {
            const simpleMatch = line.match(/^\s*console\.log\s*\(\s*([a-zA-Z0-9_+\-*/\s()]+)\s*\)/)
            if (simpleMatch) {
              const val = simpleMatch[1].trim()
              try {
                if (/^[0-9\s+\-*/()]+$/.test(val)) {
                  outputs.push(Function(`return (${val})`)())
                } else {
                  outputs.push(val)
                }
              } catch (e) {
                outputs.push(val)
              }
            }
          }
        }
      } else if (lang === 'cpp') {
        for (let line of lines) {
          if (line.includes("cout")) {
            const matches = [...line.matchAll(/(?:<<\s*)(?:(["'`])(.*?)\1|([a-zA-Z0-9_+\-*/\s()]+))/g)]
            let lineOutput = ""
            for (let m of matches) {
              const strVal = m[2]
              const rawVal = m[3]
              if (strVal !== undefined) {
                lineOutput += strVal
              } else if (rawVal !== undefined) {
                const trimmed = rawVal.trim()
                if (trimmed !== "endl" && trimmed !== "std::endl") {
                  try {
                    if (/^[0-9\s+\-*/()]+$/.test(trimmed)) {
                      lineOutput += Function(`return (${trimmed})`)()
                    } else {
                      lineOutput += trimmed
                    }
                  } catch (e) {
                    lineOutput += trimmed
                  }
                }
              }
            }
            if (lineOutput) {
              outputs.push(lineOutput)
            }
          }
        }
      }
      return outputs.length > 0 ? outputs.join('\n') : null
    }

    // We need interviewId for the coding round
    const iid = interviewId || sessionDetail?.interview_id || sessionId
    let errorText = null

    // Check frontend syntax errors
    if (selectedLanguage === 'javascript') {
      try {
        new Function(codeAnswer)
      } catch (err) {
        errorText = `SyntaxError: ${err.message}`
      }
    } else if (selectedLanguage === 'python') {
      let count = 0
      for (let i = 0; i < codeAnswer.length; i++) {
        if (codeAnswer[i] === '(') count++
        if (codeAnswer[i] === ')') count--
        if (count < 0) {
          errorText = `SyntaxError: Unmatched closing parenthesis ')' at index ${i}`
          break
        }
      }
      if (count > 0 && !errorText) {
        errorText = "SyntaxError: Unmatched opening parenthesis '(' (parenthesis was never closed)"
      }
    }

    const userStdout = extractStdout(codeAnswer, selectedLanguage)

    // Abort early and display execution failure if frontend syntax validation failed
    if (errorText) {
      setCodeOutput(`Code Execution Result:\n❌ Execution Failed / Syntax Error\n\nError:\n${errorText}`)
      setConsoleOutput(`Current Output:\n\nError:\n${errorText}`)
      setCompiling(false)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/coding-round/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: iid,
          code: codeAnswer,
          language: selectedLanguage,
          explanation: transcriptionText
        })
      })
      const payload = await response.json()

      setRunResultData(payload.run_result || null)

      // Build output string based on actual test results from backend
      let passedOutputStr = "Code Execution Result:\n";
      let executionError = payload?.run_result?.runtime_error || payload?.run_result?.compiler_error || '';

      const totalTests = codingRoundData?.coding_round?.task?.test_cases?.length || 14;
      let realTestOutput = '';

      if (executionError) {
        realTestOutput = `❌ Execution Error\nPassed 0 / ${totalTests} Test Cases\n\nError:\n${executionError}\n\n--------------------------------------------------\n\n`;
      } else if (payload?.run_result?.visible_results?.length) {
        const passedCount = payload.run_result.visible_results.filter(r => r.passed).length + (payload.run_result.hidden_summary?.passed || 0);
        const allPassed = passedCount === totalTests;

        realTestOutput = `${allPassed ? '✅ All Tests Passed!' : '❌ Some Tests Failed'}\nPassed ${passedCount} / ${totalTests} Test Cases\n\n`;
        realTestOutput += payload.run_result.visible_results.map(r =>
          `Test ${r.id} (Visible): ${r.passed ? 'PASSED ✅' : 'FAILED ❌'}\nInput: ${JSON.stringify(r.input)}\nExpected: ${JSON.stringify(r.expected)}\nGot: ${JSON.stringify(r.output)}`
        ).join('\n\n');

        if (payload.run_result.hidden_summary) {
          realTestOutput += `\n\nHidden Tests: ${payload.run_result.hidden_summary.passed} / ${payload.run_result.hidden_summary.total} Passed`;
        }
        realTestOutput += "\n\n--------------------------------------------------\n\n";
      } else if (payload?.run_result?.output) {
        realTestOutput = `Output:\n${payload.run_result.output}\n\n--------------------------------------------------\n\n`;
      } else {
        realTestOutput = `No output\n\n--------------------------------------------------\n\n`;
      }
      passedOutputStr += realTestOutput;

      if (response.ok) {
        // Check if native runner is disabled for security reasons
        const isNativeDisabled = payload?.run_result?.runtime_error?.includes(
          "Native code execution is disabled"
        )

        if (isNativeDisabled) {
          setCodeOutput("Native runner is unavailable. Getting AI feedback on your solution instead...")

          // Fallback: Get AI Feedback checkpoint
          const aiResponse = await fetch(`${API_BASE_URL}/coding-round/checkpoint`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              interview_id: iid,
              code: codeAnswer,
              language: selectedLanguage,
              explanation: transcriptionText
            })
          })
          const aiPayload = await aiResponse.json()
          if (aiResponse.ok) {
            const fb = aiPayload.feedback
            if (fb && typeof fb === 'object') {
              let formattedFeedback = "AI Code Evaluation Feedback:\n\n"
              if (fb.coach_message) {
                formattedFeedback += `Coach Message:\n${fb.coach_message}\n\n`
              }
              if (fb.strengths && fb.strengths.length > 0) {
                formattedFeedback += `Strengths:\n${fb.strengths.map(s => `• ${s}`).join('\n')}\n\n`
              }
              if (fb.risks && fb.risks.length > 0) {
                formattedFeedback += `Risks/Concerns:\n${fb.risks.map(r => `• ${r}`).join('\n')}\n\n`
              }
              if (fb.next_steps && fb.next_steps.length > 0) {
                formattedFeedback += `Next Steps:\n${fb.next_steps.map(n => `• ${n}`).join('\n')}\n\n`
              }
              if (fb.scorecard) {
                formattedFeedback += `Scorecard:\n`
                formattedFeedback += `• Problem Understanding: ${fb.scorecard.problem_understanding ?? '--'}/100\n`
                formattedFeedback += `• Implementation: ${fb.scorecard.implementation ?? '--'}/100\n`
                formattedFeedback += `• Communication: ${fb.scorecard.communication ?? '--'}/100\n`
                formattedFeedback += `• Overall: ${fb.scorecard.overall ?? '--'}/100\n`
              }

              if (errorText) {
                setCodeOutput(`Code Execution Result:\n❌ Some Tests Failed / Execution Error\n\nError:\n${errorText}\n\n--------------------------------------------------\n\n${formattedFeedback}`)
              } else {
                setCodeOutput(passedOutputStr + formattedFeedback)
              }
            } else {
              if (errorText) {
                setCodeOutput(`Code Execution Result:\n❌ Some Tests Failed / Execution Error\n\nError:\n${errorText}\n\n--------------------------------------------------\n\nAI Code Evaluation Feedback:\n\n${fb || 'No feedback details returned.'}`)
              } else {
                setCodeOutput(passedOutputStr + `AI Code Evaluation Feedback:\n\n${fb || 'No feedback details returned.'}`)
              }
            }
          } else {
            errorText = aiPayload.detail || aiPayload.message || "Failed to retrieve AI feedback."
            setCodeOutput(`Code Execution Result:\n❌ Execution Failed / AI Evaluation Error\n\nError:\n${errorText}`)
          }
          let simulatedConsoleOutput = `Current Output:\n${userStdout || ''}`
          if (errorText) {
            simulatedConsoleOutput += `\n\nError:\n${errorText}`
          }
          setConsoleOutput(simulatedConsoleOutput)
          return
        }

        // Native runner succeeded (non-security error cases)
        const res = payload.run_result
        if (res?.compiler_error) {
          errorText = res.compiler_error
        } else if (res?.runtime_error) {
          errorText = res.runtime_error
        }

        if (errorText) {
          setCodeOutput(passedOutputStr.replace("\n\n--------------------------------------------------\n\n", ""))
        } else {
          setCodeOutput(passedOutputStr.replace("\n\n--------------------------------------------------\n\n", ""))
        }

        let simulatedConsoleOutput = `Current Output:\n${userStdout || res?.output || ''}`
        if (errorText) {
          simulatedConsoleOutput += `\n\nError:\n${errorText}`
        }
        setConsoleOutput(simulatedConsoleOutput)
      } else {
        errorText = payload.detail || payload.message || "Execution error occurred."
        setCodeOutput(`Code Execution Result:\n❌ Some Tests Failed / Execution Error\n\nError:\n${errorText}`)
        let simulatedConsoleOutput = `Current Output:\n${userStdout || ''}`
        if (errorText) {
          simulatedConsoleOutput += `\n\nError:\n${errorText}`
        }
        setConsoleOutput(simulatedConsoleOutput)
      }
    } catch (e) {
      // In case of error, print execution failure status!
      errorText = e.message || "Network request failed."
      setCodeOutput(`Code Execution Result:\n❌ Execution Failed\n\nError:\n${errorText}`)
      let simulatedConsoleOutput = `Current Output:\n${userStdout || ''}`
      if (errorText) {
        simulatedConsoleOutput += `\n\nError:\n${errorText}`
      }
      setConsoleOutput(simulatedConsoleOutput)
    } finally {
      setCompiling(false)
    }
  }

  // Helper to submit code answer and end interview
  const handleSubmitCodingAndInterview = async () => {
    const iid = interviewId || sessionDetail?.interview_id || sessionId
    try {
      await fetch(`${API_BASE_URL}/coding-round/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: iid,
          code: codeAnswer,
          explanation: codeAnswer,
          language: selectedLanguage
        })
      })
    } catch (e) {
      console.error("Failed to submit coding answer:", e)
    }
    handleSubmitInterview(false)
  }

  // End Interview & Upload Recordings
  const handleSubmitInterview = async (forceClose = false) => {
    // Clear persisted session so next visit starts fresh
    if (_sessionKey) sessionStorage.removeItem(_sessionKey)
    visualizerActiveRef.current = false

    // Stop AI speech to prevent it from continuing to ask questions
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);

    // Stop loops
    if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current)
    if (noiseMonitorFrameRef.current) cancelAnimationFrame(noiseMonitorFrameRef.current)
    isSpeechRecordingRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { }
    }

    // Stop streams
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
    }

    // Stop Recorders
    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
      cameraRecorderRef.current.stop()
    }
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      screenRecorderRef.current.stop()
    }

    // Check if we should upload
    if (cameraChunksRef.current.length > 0 || screenChunksRef.current.length > 0) {
      setUploadingText("Uploading video recordings...")
      setUploadPercentage(10)
      setShowSkipButton(true)

      const uploadPromise = (chunks, type) => {
        return new Promise((resolve, reject) => {
          if (chunks.length === 0) return resolve()
          const blob = new Blob(chunks, { type: 'video/webm' })
          const formData = new FormData()
          formData.append('file', blob, `interview_${type}.webm`)
          formData.append('interview_id', sessionDetail.interview_id)
          formData.append('recording_type', type)
          formData.append('link_id', sessionId)

          const xhr = new XMLHttpRequest()
          xhr.open('POST', `${API_BASE_URL}/upload-full-recording`, true)

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && type === 'camera') {
              const percent = Math.floor((e.loaded / e.total) * 100)
              setUploadPercentage(percent)
            }
          }

          xhr.onload = () => {
            if (xhr.status === 200) resolve()
            else reject(new Error("Upload failed"))
          }
          xhr.onerror = () => reject(new Error("Network error"))
          xhr.send(formData)
        })
      }

      try {
        await Promise.all([
          uploadPromise(cameraChunksRef.current, 'camera'),
          uploadPromise(screenChunksRef.current, 'screen')
        ])
        setUploadPercentage(100)
      } catch (err) {
        console.error(err)
      }
    }

    // Complete session
    try {
      await fetch(`${API_BASE_URL}/complete-session/${sessionId}`, { method: 'POST' })
    } catch (e) { }

    // Complete UI screen
    setShowSkipButton(false)
    setUploadPercentage(100)
    setTimeout(() => {
      // Exit fullscreen
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err))
      }
      setShowAllSet(true)
    }, 1500)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen flex-col gap-4 text-slate-600">
        <RefreshCw className="animate-spin text-primary" size={32} />
        <span>Loading secure candidate interview environment...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-screen flex-col p-6 text-center">
        <AlertTriangle className="text-danger mb-4" size={48} />
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Access Denied</h2>
        <p className="text-slate-600 mt-2 max-w-md text-sm">{error}</p>
        <a href="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all shadow-[0_4px_14px_rgba(99,102,241,0.15)] mt-6 no-underline">Go to Platform Page</a>
      </div>
    )
  }

  if (isMobileDevice) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#161c2d', zIndex: 999999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
        <ShieldAlert size={60} color="#ef4444" />
        <h2 style={{ fontSize: '30px', fontWeight: '800', color: '#fff' }}>Device Not Supported</h2>
        <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.5' }}>This proctored interview requires a desktop or laptop computer with screen sharing capabilities. Mobile devices and small screens are not supported.</p>
      </div>
    )
  }

  return (
    <div className={currentQuestion?.type === 'coding' ? "w-screen h-screen p-0 m-0 max-w-none overflow-hidden flex flex-col" : "container"}>
      {/* Alerts */}
      {showNoiseBanner && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '380px' }}>
          <Volume2 size={20} style={{ animation: 'bounce 1s infinite' }} />
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>Background Noise Alert</strong>
            <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>Please maintain silence. Alerts: {noiseAlertCount}/20</p>
          </div>
        </div>
      )}

      {fullscreenWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '30px', fontWeight: '800', color: '#fff' }}>⚠️ Anti-Cheating Alert</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.5' }}>Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button onClick={enableFullscreen} style={{ padding: '12px 32px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>Enable Full Screen</button>
            <button onClick={() => { setFullscreenWarning(false); handleSubmitInterview(true); }} style={{ padding: '12px 32px', borderRadius: '9999px', background: 'transparent', color: '#ef4444', fontWeight: 'bold', border: '2px solid #ef4444', cursor: 'pointer' }}>Exit Interview</button>
          </div>
        </div>
      )}

      {screenShareWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>Screen Sharing Stopped</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '400px' }}>You must share your entire screen to continue the proctored interview. Violations: {screenShareViolations} of 3</p>
          <button onClick={restartScreenShare} style={{ padding: '10px 24px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}>Restart Screen Share</button>
        </div>
      )}

      {currentQuestion?.type === 'coding' ? (
        <div id="codingRoundSection" className="coding-round-shell" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', padding: '16px', boxSizing: 'border-box', overflow: 'hidden' }}>
          <div className="coding-round-header" style={{ marginBottom: '12px', flexShrink: 0 }}>
            <div>
              <p className="coding-round-kicker">Round 2</p>
              <h2>Live Coding Task</h2>
              <p>Round 2 has {Math.floor(globalCountdown / 60).toString().padStart(2, '0')}:{(globalCountdown % 60).toString().padStart(2, '0')} remaining. Explain your logic to the AI while you code.</p>
            </div>
            <div className="coding-round-actions" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button className="ip-btn-prev" onClick={handleRunCode} disabled={compiling}>Get AI Feedback</button>
              <button className="ip-btn-next" onClick={handleSubmitCodingAndInterview}>Submit Code</button>
            </div>
          </div>

          <div className="coding-round-grid" style={{ flexGrow: 1, display: 'grid', gridTemplateColumns: 'minmax(360px, 0.95fr) minmax(520px, 1.25fr)', gap: '16px', minHeight: '0', overflow: 'hidden' }}>
            <div className="coding-problem-card" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="coding-problem-topbar" style={{ flexShrink: 0 }}>
                <div className="coding-problem-tabs">
                  <span className="coding-tab-pill active" style={{ background: '#fff', border: '1px solid #e2e8f0', color: '#4b5563' }}>Description</span>
                  <span className="coding-tab-pill" style={{ color: '#94a3b8' }}>Editorial Disabled</span>
                </div>
                <div className="coding-problem-meta" style={{ display: 'flex', gap: '8px' }}>
                  <span className="question-difficulty" style={{ background: '#dcfce7', color: '#166534', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600' }}>Easy</span>
                  <span className="question-type" style={{ background: '#e0e7ff', color: '#3730a3', padding: '4px 12px', borderRadius: '9999px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase' }}>{selectedLanguage}</span>
                </div>
              </div>
              <div className="coding-problem-scroll" style={{ padding: '24px', flexGrow: 1, overflowY: 'auto', minHeight: '0', paddingBottom: '140px' }}>
                <h3 style={{ fontSize: '22px', fontWeight: '700', color: '#2c3e50', marginBottom: '12px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                  {currentQuestion.type === 'coding' ? '1. ' : ''}{codingTask.title || 'Technical Assessment'}
                </h3>
                <div style={{ height: '1px', backgroundColor: '#eef2f6', margin: '12px 0 20px 0' }}></div>

                {codingTask.description ? (
                  <div style={{ color: '#3c4d57', fontSize: '14.5px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                    {/* Description */}
                    <div style={{ marginBottom: '20px', whiteSpace: 'pre-line' }}>
                      {codingTask.description}
                    </div>

                    {/* Input Format */}
                    {codingTask.input_format && (
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '15px', marginTop: '20px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Input Format</h4>
                        <p style={{ margin: 0, color: '#3c4d57', fontSize: '14px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{codingTask.input_format}</p>
                      </div>
                    )}

                    {/* Constraints */}
                    {codingTask.constraints && (Array.isArray(codingTask.constraints) ? codingTask.constraints.length > 0 : true) && (
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '15px', marginTop: '20px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Constraints</h4>
                        <ul style={{ margin: 0, paddingLeft: '20px', listStyleType: 'disc', color: '#3c4d57', fontSize: '14.5px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
                          {Array.isArray(codingTask.constraints) ? (
                            codingTask.constraints.map((c, i) => (
                              <li key={i} style={{ marginBottom: '6px', fontStyle: c.includes('<=') || c.includes('≤') ? 'italic' : 'normal' }}>{c}</li>
                            ))
                          ) : (
                            <li style={{ marginBottom: '6px' }}>{codingTask.constraints}</li>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* Output Format */}
                    {codingTask.output_format && (
                      <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '15px', marginTop: '20px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Output Format</h4>
                        <p style={{ margin: 0, color: '#3c4d57', fontSize: '14px', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{codingTask.output_format}</p>
                      </div>
                    )}

                    {/* Examples / Samples */}
                    {codingTask.examples && codingTask.examples.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '20px' }}>
                        {codingTask.examples.map((ex, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div>
                              <h5 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '14px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Sample Input {idx + 1}</h5>
                              <pre style={{ background: '#f3f7f9', padding: '12px 16px', borderRadius: '4px', fontSize: '13px', color: '#2c3e50', fontFamily: 'Consolas, Monaco, "Andale Mono", monospace', overflowX: 'auto', margin: 0, border: 'none', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                {ex.input}
                              </pre>
                            </div>
                            <div>
                              <h5 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '14px', marginBottom: '8px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Sample Output {idx + 1}</h5>
                              <pre style={{ background: '#f3f7f9', padding: '12px 16px', borderRadius: '4px', fontSize: '13px', color: '#2c3e50', fontFamily: 'Consolas, Monaco, "Andale Mono", monospace', overflowX: 'auto', margin: 0, border: 'none', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                {ex.output}
                              </pre>
                            </div>
                            {ex.explanation && (
                              <div style={{ marginBottom: '12px' }}>
                                <h5 style={{ fontWeight: '700', color: '#2c3e50', fontSize: '14px', marginBottom: '4px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>Explanation {idx + 1}</h5>
                                <p style={{ margin: 0, fontSize: '14px', color: '#3c4d57', lineHeight: '1.6', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>{ex.explanation}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ color: '#475569', lineHeight: '1.6', marginBottom: '24px' }}>{currentQuestionText}</p>
                )}

              </div>
            </div>

            <div className="coding-editor-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="coding-editor-topbar" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '0 16px', flexShrink: 0 }}>
                <div className="coding-right-tabs" style={{ display: 'flex', gap: '24px' }}>
                  <button onClick={() => setActiveRightTab('code')} className={`coding-right-tab ${activeRightTab === 'code' ? 'active' : ''}`} style={activeRightTab === 'code' ? { borderBottom: '2px solid var(--primary-color)', color: 'var(--text-main)', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' } : { color: 'var(--text-muted)', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Code</button>
                  <button onClick={() => { setActiveRightTab('testcase'); setActiveConsoleTab('results'); }} className={`coding-right-tab ${activeRightTab === 'testcase' ? 'active' : ''}`} style={activeRightTab === 'testcase' ? { borderBottom: '2px solid var(--primary-color)', color: 'var(--text-main)', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' } : { color: 'var(--text-muted)', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Testcase</button>
                  <button onClick={() => { setActiveRightTab('result'); setActiveConsoleTab('results'); }} className={`coding-right-tab ${activeRightTab === 'result' ? 'active' : ''}`} style={activeRightTab === 'result' ? { borderBottom: '2px solid var(--primary-color)', color: 'var(--text-main)', fontWeight: '600', padding: '16px 0', background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none', cursor: 'pointer' } : { color: 'var(--text-muted)', fontWeight: '500', padding: '16px 0', background: 'transparent', border: 'none', cursor: 'pointer' }}>Result</button>
                </div>
              </div>

              <div className="coding-toolbar" style={{ padding: '12px 16px', display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--card-bg)', backdropFilter: 'blur(8px)', borderBottom: '1px solid var(--card-border)', flexShrink: 0 }}>
                <label style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: '600' }}>Language</label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: '1px solid #cbd5e1', outline: 'none', background: '#fff', fontWeight: '500', color: 'var(--text-main)' }}
                >
                  <option value="python">Python</option>
                  <option value="javascript">JavaScript</option>
                  <option value="cpp">C++</option>
                </select>
                <button className="ip-btn-prev" style={{ padding: '8px 20px', marginLeft: 'auto' }}>Start Voice Notes</button>
                <button className="ip-btn-next" style={{ padding: '8px 20px' }} onClick={handleRunCode}>Run & Evaluate</button>
              </div>

              <div className="coding-editor-wrap" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minHeight: '0', overflow: 'hidden' }}>
                <div className="coding-editor-header" style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', color: '#1e293b' }}>Editor</h4>
                    <div style={{ fontSize: '12px', color: '#94a3b8' }}>Write your solution in the IDE below.</div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Autosave by language</div>
                </div>

                {activeRightTab === 'code' && (
                  <textarea
                    className="coding-codebox"
                    spellCheck="false"
                    placeholder="// Write your solution here..."
                    value={codeAnswer}
                    onChange={(e) => setCodeAnswer(e.target.value)}
                    style={{ flexGrow: 1, width: '100%', border: 'none', outline: 'none', padding: '16px', fontFamily: 'monospace', fontSize: '14px', resize: 'none', background: '#fff', minHeight: '100px', overflowY: 'auto' }}
                  ></textarea>
                )}

                <div className="coding-console-shell" style={{ borderTop: activeRightTab === 'code' ? '1px solid #e2e8f0' : 'none', background: '#f8fafc', display: 'flex', flexDirection: 'column', maxHeight: activeRightTab === 'code' ? '40%' : '100%', minHeight: activeRightTab === 'code' ? '160px' : '0', flexGrow: activeRightTab === 'code' ? 0 : 1 }}>
                  <div className="coding-console-tabs" style={{ display: 'flex', gap: '2px', background: '#e2e8f0', padding: '8px 8px 0 8px', flexShrink: 0 }}>
                    <button
                      className={`coding-console-tab ${activeConsoleTab === 'results' ? 'active' : ''}`}
                      onClick={() => setActiveConsoleTab('results')}
                      style={{
                        background: activeConsoleTab === 'results' ? '#fff' : 'transparent',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: '600',
                        color: activeConsoleTab === 'results' ? '#1e293b' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      Test Results
                    </button>
                    <button
                      className={`coding-console-tab ${activeConsoleTab === 'console' ? 'active' : ''}`}
                      onClick={() => setActiveConsoleTab('console')}
                      style={{
                        background: activeConsoleTab === 'console' ? '#fff' : 'transparent',
                        border: 'none',
                        padding: '8px 16px',
                        borderRadius: '8px 8px 0 0',
                        fontWeight: '600',
                        color: activeConsoleTab === 'console' ? '#1e293b' : '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      Console
                    </button>
                  </div>
                  <div className="coding-console-pane active" style={{ padding: '16px', background: '#fff', flexGrow: 1, overflowY: 'auto', minHeight: '0' }}>
                    {activeConsoleTab === 'results' ? (
                      <>
                        {runResultData ? (
                          <div className="flex flex-col w-full h-full text-slate-700 bg-white overflow-hidden rounded border border-slate-200" style={{ minHeight: '300px' }}>
                            {runResultData.status === 'error' && runResultData.runtime_error && (
                              <div className="bg-rose-50 border-b border-rose-200 p-3 text-rose-600 font-mono text-[11px] whitespace-pre-wrap shrink-0">
                                <i className="fas fa-exclamation-triangle mr-2"></i>
                                {runResultData.runtime_error}
                              </div>
                            )}
                            <div className="flex w-full flex-grow overflow-hidden">
                              {/* LEFT PANEL */}
                              <div className="w-1/3 border-r border-slate-200 flex flex-col h-full bg-slate-50 overflow-y-auto scrollbar-none">
                                {(() => {
                                  const visibleLen = runResultData.visible_results?.length || 0;
                                  const hiddenLen = runResultData.hidden_summary?.total || 0;
                                  const allCount = visibleLen + hiddenLen;

                                  return Array.from({ length: allCount }).map((_, i) => {
                                    const isHidden = i >= visibleLen;
                                    const tc = isHidden ? null : runResultData.visible_results[i];
                                    const passed = isHidden
                                      ? (i - visibleLen < runResultData.hidden_summary.passed)
                                      : tc?.passed;

                                    if (i >= evaluatedCount) {
                                      return (
                                        <div key={i} className="px-4 py-3 flex items-center gap-2 border-b border-slate-200 text-[11px] font-bold text-slate-500 bg-slate-50">
                                          <i className="fas fa-spinner fa-spin text-slate-400 w-4 text-center" /> Test case {i} {isHidden && <i className="fas fa-lock ml-1 text-slate-400" />}
                                        </div>
                                      );
                                    }

                                    return (
                                      <button
                                        key={i}
                                        onClick={() => setSelectedTestCase(i)}
                                        className={`w-full px-4 py-3 flex items-center gap-2 border-b border-slate-200 text-[11px] font-bold text-left transition-colors ${selectedTestCase === i ? 'bg-indigo-50 text-indigo-600' : 'bg-white hover:bg-slate-50 text-slate-600'}`}
                                      >
                                        <i className={`fas ${passed ? 'fa-check text-emerald-500' : 'fa-times text-rose-500'} text-[13px] w-4 text-center`} />
                                        Test case {i} {isHidden && <i className="fas fa-lock ml-1 text-slate-400" />}
                                      </button>
                                    );
                                  });
                                })()}
                              </div>
                              {/* RIGHT PANEL */}
                              <div className="w-2/3 h-full overflow-y-auto p-4 scrollbar-none bg-white">
                                {(() => {
                                  if (selectedTestCase >= evaluatedCount) {
                                    return <div className="text-slate-500 text-sm italic flex items-center gap-2"><i className="fas fa-spinner fa-spin" /> Evaluating...</div>;
                                  }

                                  const visibleLen = runResultData.visible_results?.length || 0;
                                  const isHidden = selectedTestCase >= visibleLen;

                                  if (isHidden) {
                                    const passed = (selectedTestCase - visibleLen) < runResultData.hidden_summary?.passed;
                                    return (
                                      <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                                        <i className="fas fa-lock text-4xl opacity-30" />
                                        <h3 className="text-lg font-bold text-slate-700">Hidden Test Case</h3>
                                        <p className="text-xs max-w-sm text-center opacity-80 leading-relaxed">Use print or log statements to debug why your hidden test cases are failing. Hidden test cases are used to evaluate if your code can handle different scenarios, including corner cases.</p>
                                        <div className={`mt-2 px-3 py-1.5 rounded text-xs font-bold border ${passed ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
                                          Status: {passed ? 'Passed' : 'Failed'}
                                        </div>
                                      </div>
                                    );
                                  }

                                  const tc = runResultData.visible_results?.[selectedTestCase];
                                  if (!tc) return null;

                                  return (
                                    <div className="space-y-4 text-xs">
                                      <div className="font-bold text-lg mb-2 flex items-center gap-2">
                                        {tc.passed ? <span className="text-emerald-600">Accepted</span> : <span className="text-rose-600">Wrong Answer</span>}
                                      </div>
                                      <div>
                                        <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Input</div>
                                        <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-700 break-all">{JSON.stringify(tc.input)}</div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Expected Output</div>
                                        <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-700 break-all">{JSON.stringify(tc.expected)}</div>
                                      </div>
                                      <div>
                                        <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Your Output</div>
                                        <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-700 break-all">{JSON.stringify(tc.output)}</div>
                                      </div>
                                      {runResultData.output && (
                                        <div>
                                          <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Stdout</div>
                                          <div className="bg-slate-50 border border-slate-100 rounded p-2.5 font-mono text-slate-600 whitespace-pre-wrap">{runResultData.output}</div>
                                        </div>
                                      )}
                                      {runResultData.runtime_error && (
                                        <div>
                                          <div className="text-rose-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Runtime Error</div>
                                          <div className="bg-rose-50 border border-rose-100 rounded p-2.5 font-mono text-rose-600 whitespace-pre-wrap">{runResultData.runtime_error}</div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#334155', whiteSpace: 'pre-wrap' }}>
                              {codeOutput || "Run the code to see compiler errors, runtime errors, or pass/fail updates."}
                            </pre>
                            <div style={{ marginTop: '12px', fontSize: '11px', color: '#6366f1', fontStyle: 'italic', fontWeight: 500 }}>
                              💡 Test results are evaluated by AI in this environment.
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <pre style={{ margin: 0, fontSize: '12px', fontFamily: 'monospace', color: '#334155', whiteSpace: 'pre-wrap' }}>
                          {consoleOutput || "Console output will display here after execution."}
                        </pre>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div id="interviewSection" className="grid grid-cols-1 md:grid-cols-[320px_1fr] lg:grid-cols-[360px_1fr] gap-6 flex-1 min-h-0 overflow-hidden p-2">
          <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>

          <div className="ip-left flex flex-col gap-4 h-full overflow-y-auto pr-1 scrollbar-none">
            {/* AI Analyzing Status Card */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all duration-300 hover:shadow-md hover:scale-[1.01] hover:border-indigo-100">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
                </svg>
              </div>
              <div className="flex-1">
                <h4 className="m-0 text-sm font-bold text-slate-800">AI Analyzing</h4>
                <p className="m-0 text-[11px] text-slate-500 font-medium">AI is Reading the Question...</p>
              </div>
              <div className="flex items-end gap-0.5 h-6 shrink-0">
                <span className="w-1 bg-emerald-500 rounded-full h-2 animate-[audioBar_0.8s_ease-in-out_infinite_alternate]"></span>
                <span className="w-1 bg-emerald-500 rounded-full h-4 animate-[audioBar_0.8s_ease-in-out_infinite_alternate_0.15s]"></span>
                <span className="w-1 bg-emerald-500 rounded-full h-3 animate-[audioBar_0.8s_ease-in-out_infinite_alternate_0.3s]"></span>
                <span className="w-1 bg-emerald-500 rounded-full h-5 animate-[audioBar_0.8s_ease-in-out_infinite_alternate_0.1s]"></span>
              </div>
            </div>

            {/* Timer Card */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-sm flex flex-col items-center gap-4 transition-all duration-300 hover:shadow-md">
              <div className="relative w-28 h-28">
                <svg className="-rotate-90 w-28 h-28" viewBox="0 0 110 110">
                  <circle className="fill-none stroke-slate-100 stroke-[8px]" cx="55" cy="55" r="47" />
                  <circle className="fill-none stroke-[8px] stroke-[url(#timerGradient)] [stroke-linecap:round] [stroke-dasharray:295.3] [stroke-dashoffset:0] transition-[stroke-dashoffset] duration-1000 ease-linear" cx="55" cy="55" r="47" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-extrabold text-slate-800 font-mono leading-none">
                    {Math.floor(globalCountdown / 60).toString().padStart(2, '0')}:{(globalCountdown % 60).toString().padStart(2, '0')}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Remaining</span>
                </div>
              </div>

              {!isRoundTwo && sessionDetail?.interview_type !== 'Normal' && (
                <button
                  onClick={handleStartRound2Click}
                  className="w-full py-2.5 px-4 rounded-full font-bold text-xs bg-indigo-600 hover:bg-indigo-700 text-white transition-all cursor-pointer border-none shadow-[0_4px_12px_rgba(99,102,241,0.2)] flex items-center justify-center gap-2"
                >
                  🚀 Start Round 2 &rarr;
                </button>
              )}

              <button
                className="w-full py-2.5 px-4 rounded-full font-bold text-xs bg-slate-800 hover:bg-slate-900 text-white transition-all cursor-pointer border-none shadow-sm flex items-center justify-center gap-2"
                onClick={() => handleSubmitInterview(false)}
              >
                ⏹ End Interview
              </button>
            </div>

            {/* AI insights Card */}
            <div className="bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-md">
              <h4 className="m-0 mb-4 text-[13px] font-bold text-slate-800 tracking-wide uppercase">AI Live Evaluation</h4>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">CLARITY & COMMUNICATION</span>
                  <span className="text-xs font-bold text-emerald-500">{aiInsights.clarity}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-1000" style={{ width: `${aiInsights.clarity}%` }}></div>
                </div>
              </div>

              <div className="mb-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">
                    {sessionDetail?.interview_type === 'Non-Technical' || sessionDetail?.interview_type === 'Normal'
                      ? 'STRUCTURED THINKING'
                      : 'TECHNICAL DEPTH'}
                  </span>
                  <span className="text-xs font-bold text-indigo-500">{aiInsights.technicalDepth}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000" style={{ width: `${aiInsights.technicalDepth}%` }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-extrabold text-slate-500 tracking-wider">
                    {sessionDetail?.interview_type === 'Non-Technical' || sessionDetail?.interview_type === 'Normal'
                      ? 'CASE RESOLUTION'
                      : 'CONFIDENCE'}
                  </span>
                  <span className="text-xs font-bold text-amber-500">{aiInsights.confidence}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-1000" style={{ width: `${aiInsights.confidence}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="ip-right flex flex-col gap-4 h-full min-h-0">
            {/* Question Card */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl p-5 md:p-6 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md before:content-[''] before:absolute before:top-0 before:left-0 before:w-1.5 before:h-full before:bg-gradient-to-b before:from-indigo-500 before:to-emerald-500">
              <div className="text-[11px] text-slate-400 font-extrabold tracking-wider uppercase mb-2">
                Question <span id="questionNumber" className="text-indigo-600 font-black">{currentQuestionIndex + 1}</span> of <span id="totalQuestions">{questions.length}</span>
              </div>
              <div className="flex gap-2 justify-end mb-4">
                <span className="px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-50 text-indigo-600 border border-indigo-100">
                  {currentQuestion?.category || currentQuestion?.type || 'Case Analysis'}
                </span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase border ${String(currentQuestion?.difficulty || 'Easy').toLowerCase() === 'easy'
                  ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                  : String(currentQuestion?.difficulty || 'Easy').toLowerCase() === 'medium'
                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                    : 'bg-red-50 text-red-600 border-red-100'
                  }`}>
                  {currentQuestion?.difficulty || 'Easy'}
                </span>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-1.5 bg-indigo-600 self-stretch rounded-full shrink-0 min-h-[60px]" />
                <p className="flex-1 text-slate-800 text-base md:text-lg font-semibold leading-relaxed m-0">{currentQuestionText || 'Question is loading...'}</p>
                <button
                  className="bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 border border-slate-200 hover:border-indigo-100 cursor-pointer p-2.5 rounded-full transition-all duration-200 shrink-0"
                  onClick={() => speakAIQuestion(currentQuestionText)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                </button>
              </div>
            </div>

            {/* Transcript Card */}
            <div className="bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-3xl p-5 shadow-sm flex flex-col flex-1 min-h-0 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-extrabold text-slate-800 tracking-wide uppercase">
                  <span>🎙</span> Live Transcript
                </div>
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-500 text-[10px] font-bold tracking-wider px-3 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                  RECORDING
                </div>
              </div>
              <textarea
                className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 text-base leading-relaxed text-slate-800 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-inner resize-none w-full flex-1 h-28 min-h-[80px] overflow-y-auto transition-all"
                placeholder="Your speech will appear here automatically..."
                readOnly
                value={transcriptionText}
              />
            </div>

            {/* Navigation buttons */}
            <div className="flex gap-3 justify-center items-center mt-2 shrink-0">
              {currentQuestionIndex === questions.length - 1 ? (
                !isRoundTwo && sessionDetail?.interview_type !== 'Normal' ? (
                  <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-4 py-2.5 rounded-xl">
                    <span className="text-xs font-semibold text-indigo-600">
                      Round 1 complete. Click "Start Round 2" in the sidebar to proceed.
                    </span>
                  </div>
                ) : (
                  <button
                    className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/20 hover:shadow-red-500/30 transition-all duration-200 cursor-pointer border-none"
                    onClick={() => handleSubmitInterview(false)}
                  >
                    Submit Interview
                  </button>
                )
              ) : (
                <button
                  className="px-8 py-3.5 rounded-xl font-bold text-sm text-white bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-200 cursor-pointer border-none"
                  onClick={handleNextQuestion}
                >
                  Next &rarr;
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Camera Preview Widget */}
      {isDisclaimerAccepted && !showAllSet && !loading && (
        <div className="fixed bottom-6 right-6 w-56 h-36 rounded-xl overflow-hidden shadow-2xl border-2 border-indigo-600 z-[9999] bg-black transition-all duration-300 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-[0_15px_30px_rgba(99,102,241,0.25)] hover:border-violet-500">
          <video ref={videoPreviewRef} autoPlay muted playsInline id="videoPreview" className="w-full h-full object-cover" />
          <div className="absolute bottom-3 left-3 bg-red-500 text-white text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
          </div>
          {proctoringAlert && (
            <div className="absolute inset-0 bg-black/85 text-red-500 flex flex-col items-center justify-center p-3 text-center z-10">
              <span className="text-xl mb-1 animate-bounce">⚠️</span>
              <div className="text-[10px] font-bold leading-tight">{proctoringAlert}</div>
            </div>
          )}
        </div>
      )}

      {showRound2Confirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 transform transition-all text-left">
            <div className="flex items-center gap-3 text-amber-500 mb-4">
              <span className="text-3xl">⚠️</span>
              <h3 className="text-lg font-bold text-slate-950 m-0">Switch to Round 2?</h3>
            </div>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              Round 1 is not complete. Are you sure you want to move to Round 2?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRound2Confirm(false)}
                className="px-4 py-2 rounded-lg font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors border-none cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={proceedToRoundTwo}
                className="px-4 py-2 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 transition-colors border-none cursor-pointer"
              >
                Yes, Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
