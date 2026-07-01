import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import api from '../../utils/api'
import useCandidateWebRTC from '../../hooks/useCandidateWebRTC'
import { useProctoring } from '../../hooks/useProctoring'

const langMap = {
  'Hindi': 'hi-IN',
  'Telugu': 'te-IN',
  'Tamil': 'ta-IN',
  'Malayalam': 'ml-IN',
  'Kannada': 'kn-IN',
  'English': 'en-IN'
}

export const useInterviewSession = (sessionId, interviewType, startRoundTwo) => {
  const navigate = useNavigate()

  // Screen States
  const [loading, setLoading] = useState(true)
  const [showAllSet, setShowAllSet] = useState(false)
  const [error, setError] = useState(null)
  const _sessionKey = sessionId ? `interview_session_${sessionId}` : null
  const _savedSession = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false)
  const [agreeChecked, setAgreeChecked] = useState(false)
  const [autoReconnecting, setAutoReconnecting] = useState(!!_savedSession?.accepted)

  // Voice Cloning intermediate state
  const [showVoiceCloneSetup, setShowVoiceCloneSetup] = useState(false)
  const [clonedVoiceId, setClonedVoiceId] = useState(null)
  const clonedVoiceIdRef = useRef(null)

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
  const [isMobileDevice, setIsMobileDevice] = useState(false)

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

  // Fetch AI Insights dynamically
  useEffect(() => {
    const iid = interviewId || sessionDetail?.interview_id || sessionId
    if (!iid) return

    const fetchInsights = async () => {
      try {
        const response = await api.get(`/api/interview/${iid}/insights`)
        setAiInsights(response.data)
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
      }, 400);
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
  const whisperMediaRecorderRef = useRef(null)
  const whisperAudioChunksRef = useRef([])
  const whisperPauseTimeoutRef = useRef(null)

  // Proctoring Loops
  const faceDetectionIntervalRef = useRef(null)
  const noiseAudioContextRef = useRef(null)
  const noiseMonitorFrameRef = useRef(null)
  const noiseFrameCountRef = useRef(0)
  const noiseCooldownRef = useRef(0)

  // Feature Migration Refs
  const visualizerCanvasRef = useRef(null)
  const visualizerActiveRef = useRef(false)
  const visualizerAudioCtxRef = useRef(null)
  const silenceTimeoutRef = useRef(null)
  const questionStartTimeRef = useRef(Date.now())
  const behavioralStatsRef = useRef({ wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 })
  const handleNextQuestionRef = useRef(null)

  // WebRTC Candidate Logic
  const telemetryData = {
    round_type: isRoundTwo ? 'coding' : 'verbal',
    current_question: currentQuestionIndex + 1,
    total_questions: questions.length,
    question_text: questions[currentQuestionIndex]?.text || '',
    audio_level: 50,
    proctoring_alerts: screenShareViolations + noiseAlertCount + behavioralStatsRef.current.faceAlerts + behavioralStatsRef.current.tabSwitches
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
      if (document.hidden && isDisclaimerAccepted && !showAllSet) {
        behavioralStatsRef.current.tabSwitches += 1
        Swal.fire({
          icon: 'error',
          title: 'Tab Switch Detected',
          text: 'Switching tabs or minimizing the browser is not allowed during this proctored interview. Your action has been recorded.',
          confirmButtonText: 'I Understand',
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
          buttonsStyling: false
        })
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [isDisclaimerAccepted, showAllSet])

  // Track unload events (Refresh or Close tab)
  useEffect(() => {
    const handleUnload = () => {
      if (sessionId && isDisclaimerAccepted) {
        navigator.sendBeacon(`${api.defaults.baseURL || ''}/interview/${sessionId}/alert`, JSON.stringify({
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
    
    if (visualizerAudioCtxRef.current) {
      visualizerAudioCtxRef.current.close().catch(()=>{})
      visualizerAudioCtxRef.current = null
    }

    const ctx = canvas.getContext("2d")
    
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      visualizerAudioCtxRef.current = audioCtx
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.log("AudioContext resume failed:", e))
      }
      
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      visualizerActiveRef.current = true

      const draw = () => {
        if (!visualizerActiveRef.current) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          return
        }

      requestAnimationFrame(draw)
      analyser.getByteFrequencyData(dataArray)

      // Ensure canvas dimensions match actual size to prevent distortion
      if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth
      if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight

      const width = canvas.width
      const height = canvas.height
      
      ctx.clearRect(0, 0, width, height)
      
      // Draw frequency bars
      const numBars = 32 // limit bars for aesthetics
      const barWidth = width / numBars
      const step = Math.floor(analyser.frequencyBinCount / numBars)
      
      let x = 0
      for (let i = 0; i < numBars; i++) {
        // Average the frequencies in this step range for smoother bars
        let sum = 0
        for(let j = 0; j < step; j++) {
           sum += dataArray[i * step + j] || 0
        }
        const avg = sum / step
        
        // Map 0-255 to 10%-90% height
        const barHeight = Math.max(height * 0.1, (avg / 255) * height * 0.9)
        
        const gradient = ctx.createLinearGradient(0, height, 0, 0)
        gradient.addColorStop(0, '#6366f1') // Indigo
        gradient.addColorStop(1, '#a855f7') // Purple
        
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.roundRect(x + 2, height - barHeight, barWidth - 4, barHeight, [4, 4, 0, 0])
        ctx.fill()
        
        x += barWidth
      }
    }
    draw()
    } catch (err) {
      console.error("Audio visualizer failed to start:", err)
    }
  }

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
        visualizerAudioCtxRef.current.close().catch(()=>{})
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
      try {
        const payload = await api.get(`/session/${sessionId}`).then(r => r.data)
        if (payload.status !== 'success') {
          throw new Error(payload.detail || payload.message || "Failed to load session details.")
        }

        setSessionDetail(payload)

        if (payload.is_deactivated) {
          throw new Error("This interview link has been temporarily deactivated by the recruiter.")
        }
        if (payload.is_expired) {
          throw new Error("This interview link has expired. Please contact the recruiter for a new link.")
        }
        if (payload.is_before_schedule && payload.scheduled_start) {
          const startTime = new Date(payload.scheduled_start.endsWith('Z') || payload.scheduled_start.includes('+') ? payload.scheduled_start : payload.scheduled_start + 'Z')
          throw new Error(`This interview is scheduled to start on ${startTime.toLocaleString()}. Please try again at the scheduled time.`)
        }
        if (payload.session_status === 'completed') {
          throw new Error("This interview session has already been completed.")
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
          throw new Error("This interview session has already been completed.")
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
        setQuestions(qList)
        setInterviewId(startPayload.interview_id || '')
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

          if (_savedSession?.startedAt && _savedSession?.accepted) {
            const elapsedSeconds = Math.floor((Date.now() - _savedSession.startedAt) / 1000)
            const halfDur = fullDuration / 2
            const remaining = Math.max(0, halfDur - elapsedSeconds)
            setGlobalCountdown(remaining)
            if (_savedSession.isRoundTwo) {
              setIsRoundTwo(true)
              isRoundTwoRef.current = true
            }
          } else {
            setGlobalCountdown((dur / 2) * 60)
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
  }, [isDisclaimerAccepted, navigate])

  const enableFullscreen = () => {
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log(err))
    }
    setFullscreenWarning(false)
  }

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
      
      // Start Whisper MediaRecorder if not already running
      if (mediaStreamRef.current && !whisperMediaRecorderRef.current) {
        try {
          const mr = new MediaRecorder(mediaStreamRef.current, { mimeType: 'audio/webm' })
          mr.ondataavailable = (e) => {
            if (e.data.size > 0) whisperAudioChunksRef.current.push(e.data)
          }
          mr.onstop = async () => {
            const blob = new Blob(whisperAudioChunksRef.current, { type: 'audio/webm' })
            whisperAudioChunksRef.current = [] // reset for next chunk
            
            if (blob.size > 1000) { // prevent empty or silent blobs
              const formData = new FormData()
              formData.append('audio', blob, 'audio.webm')
              formData.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
              formData.append('language', sessionDetail?.language || 'English')
              
              try {
                // Post directly to backend Whisper endpoint
                const res = await api.post('/transcribe', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' }
                })
                if (res.data && res.data.text) {
                  // Append perfect Whisper text instead of Google's transcript
                  setTranscriptionText(prev => prev + res.data.text + ' ')
                }
              } catch (err) {
                console.error("Whisper transcription failed:", err)
              }
            }
          }
          whisperMediaRecorderRef.current = mr
          mr.start()
        } catch(e) {
          console.error("Failed to start Whisper MediaRecorder:", e)
        }
      }
    }

    rec.onend = () => {
      if (isSpeechRecordingRef.current) {
        behavioralStatsRef.current.pauseCount += 1
        try { rec.start() } catch (e) { }
      }
    }

    rec.onresult = (event) => {
      // We are using Google SpeechRecognition PURELY as a Voice Activity Detector (VAD) now!
      // DO NOT use event.results[i][0].transcript because it fails on Indian accents.
      
      // Stop and restart Whisper recording to trigger transcription if they pause for 1.5s
      if (whisperPauseTimeoutRef.current) clearTimeout(whisperPauseTimeoutRef.current)
      whisperPauseTimeoutRef.current = setTimeout(() => {
        if (whisperMediaRecorderRef.current && whisperMediaRecorderRef.current.state === 'recording') {
          whisperMediaRecorderRef.current.stop()
          whisperMediaRecorderRef.current.start()
        }
      }, 1500)

      // Existing 10-second absolute silence timeout to auto-skip question
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

  const recordAlertMetric = async (type) => {
    behavioralStatsRef.current.faceAlerts += 1
  }

  useProctoring(videoPreviewRef, isDisclaimerAccepted && !showAllSet && !loading, recordAlertMetric);

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
      buttonsStyling: false,
      preConfirm: () => {
        enableFullscreen()
      }
    }).then(async (result) => {
      if (!result.isConfirmed) return
      await setupMedia()
    })
  }

  const setupMedia = async () => {
    try {
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

      let screenStream
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor", frameRate: 15 },
          audio: false
        })
      } catch (err) {
        console.error("Screen Share getDisplayMedia error:", err)
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

      const previewVideo = videoPreviewRef.current || document.createElement('video')
      previewVideo.srcObject = stream
      previewVideo.muted = true
      previewVideo.playsInline = true
      previewVideo.play().catch(e => console.log(e))

      const track = screenStream.getVideoTracks()[0]
      track.onended = () => {
        handleScreenShareStop()
      }

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        screenStream.addTrack(audioTracks[0])
      }

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

      cameraRecorderRef.current.start(2000)
      screenRecorderRef.current.start(2000)

      Swal.fire({
        icon: 'success',
        title: 'Setup Complete',
        text: 'Camera and screen share connected successfully. Click below to enter fullscreen and begin your interview.',
        confirmButtonText: 'Start Interview',
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
        buttonsStyling: false
      }).then(() => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(err => console.log(err));
        }

        initSpeechRecognition()
        if (recognitionRef.current) {
          recognitionRef.current.start()
        }

        startBackgroundNoiseMonitor(stream)

      const savedSess = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null
      
      // Voice cloning setup is now handled server-side via CARTESIA_VOICE_ID env var.
      // Skip the setup screen and go directly to the first question.
      if (!savedSess?.accepted && questions.length > 0) {
        speakAIQuestion(questions[0].text || questions[0].question || questions[0].prompt || '')
      }

      setIsDisclaimerAccepted(true)

      if (_sessionKey) {
        const sess = JSON.parse(sessionStorage.getItem(_sessionKey) || '{}')
        sess.accepted = true
        sess.startedAt = sess.startedAt || Date.now()
        sessionStorage.setItem(_sessionKey, JSON.stringify(sess))
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

      if (mediaStreamRef.current) {
        const audioTracks = mediaStreamRef.current.getAudioTracks()
        if (audioTracks.length > 0) {
          screenStream.addTrack(audioTracks[0])
        }
      }

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

  const speakAIQuestion = async (text) => {
    if (clonedVoiceIdRef.current) {
      // --- Cloned Voice TTS (Backend) ---
      try {
        if (window.speechSynthesis) window.speechSynthesis.cancel()
        const res = await fetch(`${api.defaults.baseURL || ''}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'shimmer', language: sessionDetail?.language || 'English', voice_id: clonedVoiceIdRef.current })
        })
        if (!res.ok) throw new Error('TTS failed')
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => {
          if (!isRoundTwoRef.current) {
            if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)
            silenceTimeoutRef.current = setTimeout(() => {
              if (handleNextQuestionRef.current) handleNextQuestionRef.current()
            }, 10000)
          }
        }
        audio.play()
        return // Successfully used cloned voice
      } catch (err) {
        console.error("Cloned TTS failed, falling back to browser TTS", err)
      }
    }

    // --- Browser TTS (Fallback/Default) ---
    if (!window.speechSynthesis) return
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
    setIsRoundTwo(true)
    isRoundTwoRef.current = true

    if (totalDuration > 0) {
      setGlobalCountdown(totalDuration / 2)
    }

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

      await api.post(`/save-answer`, answerForm, {
        headers: { 'Content-Type': 'multipart/form-data' }
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
      await api.post(`/save-behavioral-data`, payload)
    } catch (e) { }

    try {
      const iid = interviewId || sessionDetail?.interview_id || sessionId

      if (currentQuestion.type === 'case_study') {
        const response = await api.post(`/case-study/submit-answer`, {
          interview_id: iid,
          question_index: currentQuestion.caseStudyIndex,
          answer_text: transcriptionText || ' '
        })
        if (!response.data || response.status !== 200) throw new Error('Failed to submit case study answer')
      } else {
        const answerForm = new FormData()
        answerForm.append('interview_id', iid)
        answerForm.append('question_id', currentQuestion.id || (currentQuestionIndex + 1))
        answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
        answerForm.append('answer_text', currentQuestion.type === 'coding' ? (codeAnswer || ' ') : (transcriptionText || ' '))
        answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
        answerForm.append('time_spent_seconds', '0')
        answerForm.append('time_limit_seconds', '120')

        await api.post(`/save-answer`, answerForm, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

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
        setTranscriptionText('')
        setCodeAnswer('')
        setCodeOutput('')
        behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 }

        const nextIdx = currentQuestionIndex + 1
        setCurrentQuestionIndex(nextIdx)
        questionStartTimeRef.current = Date.now()

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

  useEffect(() => {
    handleNextQuestionRef.current = handleNextQuestion
  }, [handleNextQuestion])

  const handleSubmitInterview = async (forceClose = false) => {
    // Stop any currently-speaking TTS immediately
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (silenceTimeoutRef.current) { clearTimeout(silenceTimeoutRef.current); silenceTimeoutRef.current = null }
    if (_sessionKey) sessionStorage.removeItem(_sessionKey)
    visualizerActiveRef.current = false

    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current)

    if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current)
    if (noiseMonitorFrameRef.current) cancelAnimationFrame(noiseMonitorFrameRef.current)
    isSpeechRecordingRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { }
    }
    
    if (whisperMediaRecorderRef.current && whisperMediaRecorderRef.current.state !== 'inactive') {
      try { whisperMediaRecorderRef.current.stop() } catch (e) { }
      whisperMediaRecorderRef.current = null
    }
    if (whisperPauseTimeoutRef.current) clearTimeout(whisperPauseTimeoutRef.current)

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop())
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop())
    }

    if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
      cameraRecorderRef.current.stop()
    }
    if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
      screenRecorderRef.current.stop()
    }

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
          xhr.open('POST', `${api.defaults.baseURL || ''}/upload-full-recording`, true)

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

    try {
      await api.post(`/complete-session/${sessionId}`)
    } catch (e) { }

    setShowSkipButton(false)
    setUploadPercentage(100)
    setTimeout(() => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err))
      }
      setShowAllSet(true)
    }, 1500)
  }

  return {
    loading,
    showAllSet,
    error,
    isDisclaimerAccepted,
    agreeChecked,
    setAgreeChecked,
    acceptDisclaimer,
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
    noiseAlertCount,
    showNoiseBanner,
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
    enableFullscreen,
    restartScreenShare,
    speakAIQuestion,
    showVoiceCloneSetup,
    completeVoiceCloneSetup,
    handleStartRound2Click,
    proceedToRoundTwo,
    handleNextQuestion,
    handleSubmitInterview,
    handleSkipUpload,
    isMobileDevice,
    recognitionRef,
    isSpeechRecordingRef
  }
}
