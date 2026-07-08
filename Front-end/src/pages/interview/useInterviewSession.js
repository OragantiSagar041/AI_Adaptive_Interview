import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import api from '../../utils/api'
import useCandidateWebRTC from '../../hooks/useCandidateWebRTC'
import { useProctoring } from '../../hooks/useProctoring'
import { useScreenshotProtection } from '../../hooks/useScreenshotProtection'
import { useExamSecurity } from '../../hooks/useExamSecurity'
import { countFillers } from './interviewUtils'

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
  const [isCompleted, setIsCompleted] = useState(false)
  const _sessionKey = sessionId ? `interview_session_${sessionId}` : null
  const _savedSession = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null

  // Web Audio Mixer for Screen Recording
  const audioMixerCtxRef = useRef(null)
  const audioMixerDestRef = useRef(null)

  // WebRTC Global Cleanup
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false)
  const [agreeChecked, setAgreeChecked] = useState(false)
  const [autoReconnecting, setAutoReconnecting] = useState(!!_savedSession?.accepted)

  // Voice Cloning intermediate state
  const [showVoiceCloneSetup, setShowVoiceCloneSetup] = useState(false)
  const [clonedVoiceId, setClonedVoiceId] = useState(null)
  const clonedVoiceIdRef = useRef(null)

  // Session details from backend
  const [sessionDetail, setSessionDetail] = useState(null)
  const sessionDetailRef = useRef(null)   // ref so async callbacks always read the latest value
  const [interviewId, setInterviewId] = useState('')
  const interviewIdRef = useRef('') // Add ref for interviewId to access in async functions

  useEffect(() => {
    interviewIdRef.current = interviewId
  }, [interviewId])

  useEffect(() => {
    sessionDetailRef.current = sessionDetail
  }, [sessionDetail])

  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(_savedSession?.currentQuestionIndex || 0)
  const currentQuestion = questions[currentQuestionIndex]
  const codingTask = currentQuestion?.codingTask || currentQuestion || {}

  // Proctoring/Recording states
  const [isMediaReady, setIsMediaReady] = useState(false)
  const [proctoringAlert, setProctoringAlert] = useState('')
  const [noiseAlertCount, setNoiseAlertCount] = useState(0)
  const noiseAlertCountRef = useRef(0)
  const isSubmittingRef = useRef(false)
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
  const [transcriptionText, setTranscriptionText] = useState('')
  const [interimTranscriptText, setInterimTranscriptText] = useState('')
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
  const [showDeviceCheck, setShowDeviceCheck] = useState(false)

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
            ? `function find_duplicates(records) {\n    // Write your code here\n    \n}`
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
  // Refs that hold session-data values used in async transcription callbacks.
  // Using refs (not state) prevents the stale-closure / race-condition where
  // sessionDetail state is not yet populated when the MediaRecorder onstop fires.
  const candidateNameRef = useRef('Candidate')
  const interviewLanguageRef = useRef('English')
  const transcribeInFlightRef = useRef(false) // prevent overlapping Whisper API calls

  // Proctoring Loops
  const faceDetectionIntervalRef = useRef(null)
  const noiseAudioContextRef = useRef(null)
  const noiseMonitorFrameRef = useRef(null)
  const noiseFrameCountRef = useRef(0)
  const noiseCooldownRef = useRef(0)
  const audioRmsRef = useRef(0)
  const lipSyncStreakRef = useRef(0)
  const lipSyncCooldownRef = useRef(0)

  // Feature Migration Refs
  const visualizerCanvasRef = useRef(null)
  const visualizerActiveRef = useRef(false)
  const visualizerAudioCtxRef = useRef(null)
  const silenceIntervalRef = useRef(null)
  const silenceTimeoutRef = useRef(null)
  const lastSpeechTimeRef = useRef(0)
  const questionStartTimeRef = useRef(Date.now())
  const behavioralStatsRef = useRef({ wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 })
  const globalTabSwitchesRef = useRef(0)
  const globalFaceAlertsRef = useRef(0)
  const [faceAlertCount, setFaceAlertCount] = useState(0)
  const handleNextQuestionRef = useRef(null)
  // TTS cache: Map<cacheKey, blobUrl> — avoids re-fetching identical questions.
  // Capped at 20 entries (FIFO) to prevent unbounded memory growth.
  const ttsCacheRef = useRef(new Map())
  const TTS_CACHE_MAX = 20

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
        
        // Ensure Voice Cloning works for Standard interviews
        if (payload.voice_clone && payload.custom_voice_id) {
          clonedVoiceIdRef.current = payload.custom_voice_id
          setClonedVoiceId(payload.custom_voice_id)
        }

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
        setQuestions(qList)
        setInterviewId(startPayload.interview_id || '')
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
    rec.continuous = true  // Keep listening continuously without restarting
    rec.interimResults = true
    const targetLang = langMap[sessionDetail?.language] || 'en-IN'
    rec.lang = targetLang

    // Helper to (re)start the Whisper MediaRecorder cleanly
    const ensureWhisperRunning = () => {
      if (!mediaStreamRef.current) return
      if (whisperMediaRecorderRef.current && whisperMediaRecorderRef.current.state === 'recording') return

      const audioTracks = mediaStreamRef.current.getAudioTracks()
      if (!audioTracks || audioTracks.length === 0) {
        console.warn('No audio tracks available for Whisper recorder')
        return
      }

      try {
        const audioStream = new MediaStream(audioTracks)

        // Detect supported MIME type at runtime
        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/ogg;codecs=opus',
          'audio/ogg',
          'audio/mp4',
          ''  // browser default
        ]
        const supportedMime = mimeTypes.find(m => {
          try { return !m || MediaRecorder.isTypeSupported(m) } catch { return false }
        }) || ''

        const mrOptions = supportedMime ? { mimeType: supportedMime } : {}
        const mr = new MediaRecorder(audioStream, mrOptions)
        whisperAudioChunksRef.current = []

        mr.ondataavailable = (e) => {
          if (e.data.size > 0) whisperAudioChunksRef.current.push(e.data)
        }
        mr.onstop = async () => {
          const chunks = [...whisperAudioChunksRef.current]
          whisperAudioChunksRef.current = []
          const actualMime = mr.mimeType || supportedMime || 'audio/webm'
          const blob = new Blob(chunks, { type: actualMime })

          // VAD handles restarting; we no longer automatically restart here.

          if (blob.size > 1000) {
            // We no longer skip blobs if a transcription is in-flight.
            // Skipping blobs causes speech to be permanently lost (typing stops).
            // Fast API can handle overlapping POST requests safely.
            // Pick correct file extension for backend
            const ext = actualMime.includes('ogg') ? 'ogg' : actualMime.includes('mp4') ? 'mp4' : 'webm'
            const formData = new FormData()
            formData.append('audio', blob, `audio.${ext}`)
            // Use refs (populated synchronously at session-load) instead of
            // sessionDetail?.  to avoid stale-closure / race-condition 422 errors.
            formData.append('candidate_name', candidateNameRef.current)
            formData.append('language', interviewLanguageRef.current)
            transcribeInFlightRef.current = true
            try {
              const res = await api.post('/transcribe', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 10000
              })
              if (res.data && res.data.text && res.data.text.trim()) {
                setTranscriptionText(prev => prev + res.data.text.trim() + ' ')
              }
            } catch (err) {
              console.error('Whisper transcription failed:', err)
            } finally {
              transcribeInFlightRef.current = false
            }
          }
        }
        whisperMediaRecorderRef.current = mr
        // Do NOT start automatically. The VAD logic in tick() will start it on speech.
      } catch(e) {
        console.error('Failed to start Whisper MediaRecorder:', e)
        whisperMediaRecorderRef.current = null
      }
    }

    rec.onstart = () => {
      isSpeechRecordingRef.current = true
      ensureWhisperRunning()
    }

    rec.onend = () => {
      // With continuous=true this fires only on error/abort, restart it
      if (isSpeechRecordingRef.current) {
        try { rec.start() } catch (e) { }
      }
    }

    rec.onresult = (event) => {
      // Show Google's live transcript immediately as fallback text
      // Whisper will replace/append more accurate text asynchronously
      let interimText = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalText += t + ' '
        } else {
          interimText += t
        }
      }
      // Show interim text in real time (visible while speaking)
      setInterimTranscriptText(interimText)
      if (finalText) {
        // We no longer append Google's final text to avoid duplication with Whisper
        setInterimTranscriptText('')
      }      // Trigger Whisper transcription after 1.5s pause in speech
      // Removed: We now rely purely on VAD (audio volume) rather than Google SpeechRecognition timeouts.
    }

    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        console.error("Microphone permission denied:", e.error)
        return
      }
      // For no-speech or other transient errors, just restart
      if (isSpeechRecordingRef.current) {
        setTimeout(() => { try { rec.start() } catch (err) { } }, 300)
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
        
        audioRmsRef.current = rms

        const now = Date.now()
        
        // Treat RMS > 0.03 as speech and bump the silence timer
        if (rms > 0.03) {
          lastSpeechTimeRef.current = now
        }

        // True Voice Activity Detection (VAD) for Whisper
        const mr = whisperMediaRecorderRef.current
        if (mr && isSpeechRecordingRef.current) {
          if (rms > 0.03) {
            // Speech detected: ensure recorder is capturing
            if (mr.state === 'inactive') {
              try { mr.start() } catch (e) { }
            }
          } else {
            // Silence detected: if silent for > 1.5s, stop and flush to backend
            if (mr.state === 'recording' && (now - lastSpeechTimeRef.current > 1500)) {
              try { mr.stop() } catch (e) { }
            }
          }
        }

        if (rms > 0.18 && now > noiseCooldownRef.current) {
          noiseFrameCountRef.current++
        } else {
          noiseFrameCountRef.current = Math.max(0, noiseFrameCountRef.current - 2)
        }

        if (noiseFrameCountRef.current >= 18) {
          noiseCooldownRef.current = now + 5000
          noiseFrameCountRef.current = 0
          // recordAlertMetric must be called OUTSIDE the setState updater.
          // setState updaters must be pure/synchronous; calling an async function
          // inside one causes the promise to be silently dropped and React may
          // invoke the updater multiple times (strict mode), duplicating the call.
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

  const lastAlertTimeRef = useRef({})

  const recordAlertMetric = async (type, details = '') => {
    const now = Date.now()
    if (lastAlertTimeRef.current[type] && (now - lastAlertTimeRef.current[type] < 5000)) {
      return false // Throttle same alert type to once every 5 seconds
    }
    lastAlertTimeRef.current[type] = now

    const ts = new Date().toISOString()

    // POST to unified proctoring endpoint — stores interview_id, candidate_id,
    // violation_type, details, and timestamp in session.violations[]
    try {
      await api.post('/proctoring/violation', {
        interview_id: interviewIdRef.current || '',
        candidate_id: sessionDetailRef.current?.candidate_id || '',
        violation_type: type,
        details: details || type,
        timestamp: ts,
      })
    } catch (e) {
      // Fallback to legacy endpoint if new one is unavailable
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
      if (noiseAlertCountRef.current >= 10) {
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
          handleSubmitInterview(true, "Terminated: Exceeded Background Noise Alerts (10)")
        })
      }
    } else if (type === 'tab_switch') {
      // Tab-switch termination is handled by the visibilitychange listener — no-op here
    } else if (
      // Advisory-only types: logged to backend but do NOT count toward
      // the face-alert termination cap (not security-critical enough).
      type === 'window_blur'       ||
      type === 'devtools_open'     ||
      type === 'multi_monitor'     ||
      type === 'clipboard_attempt' ||
      type === 'print_attempt'     ||
      type === 'save_attempt'
    ) {
      // Logged via POST above — no UI counter increment
    } else {
      // Terminating face/security alerts: no_face, multi_person, phone,
      // eye_contact, lip_sync, screenshot_shortcut, etc.
      behavioralStatsRef.current.faceAlerts += 1
      globalFaceAlertsRef.current += 1
      setFaceAlertCount(globalFaceAlertsRef.current)
      
      if (globalFaceAlertsRef.current >= 20) {
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
          handleSubmitInterview(true, `Terminated: Exceeded Face Alerts (20) - Last: ${type}`)
        })
      }
    }
    return true
  }
  const proctoring = useProctoring({
    videoRef: videoPreviewRef,
    enabled: isDisclaimerAccepted && !showAllSet && !loading,
    maxAlerts: 999, // Real termination is managed by recordAlertMetric (20 face / 10 noise caps)
    onViolation: async (v) => {
      const recorded = await recordAlertMetric(v.type)
      if (!recorded) return // skip UI popups if throttled

      setProctoringAlert(v.message)
      setTimeout(() => setProctoringAlert(''), 3000)
      if (v.type !== 'noise_alert') {
        Swal.fire({
          icon: 'warning',
          title: '⚠️ Proctoring Alert',
          text: v.message,
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          background: '#161c2d',
          color: '#fff',
          customClass: {
            popup: 'z-[99999]'
          }
        })
      }
    }
  });

// Screenshot / capture-attempt deterrence & logging.
  // NOTE: this can only catch in-browser vectors (shortcuts, right-click,
  // DevTools) — OS-level screenshot tools cannot be blocked from the page.
  // Every attempt is routed through recordAlertMetric so it is throttled,
  // POSTed to /session/:id/violation, and counted toward the same
  // termination threshold as face alerts (see recordAlertMetric above).
  const SCREENSHOT_ALERT_MESSAGES = {
    screenshot_shortcut: 'Screenshots are not allowed during this interview.',
  }

  useScreenshotProtection({
    enabled: isDisclaimerAccepted && !showAllSet && !isSubmittingRef.current,
    onAttempt: async (v) => {
      const recorded = await recordAlertMetric(v.type)
      if (!recorded) return // throttled — skip duplicate popups

      const message = SCREENSHOT_ALERT_MESSAGES[v.type] || 'Screenshots are not allowed during this interview.'
      setProctoringAlert(message)
      setTimeout(() => setProctoringAlert(''), 4000)
      Swal.fire({
        icon: 'warning',
        title: '📸 Screenshots Not Allowed',
        text: message,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4000,
        background: '#161c2d',
        color: '#fff',
        customClass: { popup: 'z-[99999]' }
      })
    }
  })
  // Track lip sync anomaly (audio is active but mouth isn't moving — suggests a
  // pre-recorded/played-back voice rather than the candidate actually speaking)
  useEffect(() => {
    const isAudioActive = audioRmsRef.current > 0.18
    const mismatch = proctoring.checkLipSync(proctoring.jawOpenScore, isAudioActive)
    const now = Date.now()

    if (mismatch && now > lipSyncCooldownRef.current) {
      lipSyncStreakRef.current += 1
    } else if (!mismatch) {
      lipSyncStreakRef.current = Math.max(0, lipSyncStreakRef.current - 1)
    }

    // ~5 consecutive detection ticks (700ms each) of sustained mismatch before alerting
    if (lipSyncStreakRef.current >= 5) {
      lipSyncCooldownRef.current = now + 8000
      lipSyncStreakRef.current = 0
      recordAlertMetric('lip_sync')
      Swal.fire({
        icon: 'warning',
        title: '⚠️ Proctoring Alert',
        text: 'Audio detected without matching lip movement',
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        background: '#161c2d',
        color: '#fff',
      })
    }
  }, [proctoring.jawOpenScore, proctoring.checkLipSync])

  // ── Browser exam security (copy/paste blocking, DevTools, window blur, etc.) ──
  useExamSecurity({
    enabled: isDisclaimerAccepted && !showAllSet && !isSubmittingRef.current,
    onViolation: async ({ type, message }) => {
      const recorded = await recordAlertMetric(type)
      if (!recorded) return  // throttled by recordAlertMetric's 5-second per-type gate

      setProctoringAlert(message)
      setTimeout(() => setProctoringAlert(''), 4000)
      Swal.fire({
        icon: 'warning',
        title: '⚠️ Security Alert',
        text: message,
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 4000,
        background: '#161c2d',
        color: '#fff',
        customClass: { popup: 'z-[99999]' }
      })
    },
  })

  const acceptDisclaimer = () => {
    setShowDeviceCheck(true)
  }

  const promptScreenShare = async () => {
    // Wait for previous tracks from DeviceCheckModal to release
    enableFullscreen()
    setTimeout(setupMedia, 500)
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

      // Web Audio Mixer setup
      if (!audioMixerCtxRef.current) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext
        audioMixerCtxRef.current = new AudioCtx()
        audioMixerDestRef.current = audioMixerCtxRef.current.createMediaStreamDestination()
      }

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length > 0) {
        // Mix candidate mic into destination
        const micSource = audioMixerCtxRef.current.createMediaStreamSource(new MediaStream([audioTracks[0]]))
        micSource.connect(audioMixerDestRef.current)
      }

      // Add the master mixed track to the screen stream
      const mixedTrack = audioMixerDestRef.current.stream.getAudioTracks()[0]
      if (mixedTrack) {
        screenStream.addTrack(mixedTrack)
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
      setIsMediaReady(true)

      if (_sessionKey) {
        const sess = JSON.parse(sessionStorage.getItem(_sessionKey) || '{}')
        sess.accepted = true
        sess.startedAt = sess.startedAt || Date.now()
        sessionStorage.setItem(_sessionKey, JSON.stringify(sess))
      }
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

      if (audioMixerDestRef.current) {
        const mixedTrack = audioMixerDestRef.current.stream.getAudioTracks()[0]
        if (mixedTrack) {
          screenStream.addTrack(mixedTrack)
        }
      } else if (mediaStreamRef.current) {
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

  const startSilenceTimer = (delayMs = 10000) => {
    if (!isRoundTwoRef.current) {
      if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current)
      lastSpeechTimeRef.current = Date.now()
      silenceIntervalRef.current = setInterval(() => {
        // Only trigger if no speech (RMS > 0.15) was detected in the last delayMs
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

    // --- High-Quality TTS (Backend: Cartesia or Edge TTS) ---
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel()
      const bodyPayload = { 
        text, 
        voice: 'shimmer', 
        language: sessionDetail?.language || 'English',
        use_custom_voice: !!sessionDetail?.voice_clone

      }
      if (clonedVoiceIdRef.current) bodyPayload.voice_id = clonedVoiceIdRef.current

      // Check TTS cache first — same question text + voice doesn't need a new network call.
      const ttsCacheKey = `${text}::${clonedVoiceIdRef.current || 'default'}`
      let url = ttsCacheRef.current.get(ttsCacheKey)

      if (!url) {
        const res = await fetch(`${api.defaults.baseURL || ''}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        })
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

      const audio = new Audio(url)
      
      // --- Web Audio Mixer Routing ---
      if (audioMixerCtxRef.current && audioMixerDestRef.current) {
        audio.crossOrigin = "anonymous"
        const source = audioMixerCtxRef.current.createMediaElementSource(audio)
        source.connect(audioMixerCtxRef.current.destination) // Play to speakers
        source.connect(audioMixerDestRef.current) // Send to screen recorder mixer
      }

      audio.onended = () => {
        // Revoke object URL after playback to free browser memory.
        // Only revoke if not in the cache (cached URLs must stay valid for replay).
        if (!ttsCacheRef.current.has(ttsCacheKey)) {
          URL.revokeObjectURL(url)
        }
        startSilenceTimer(10000)
      }
      audio.play()
      return // Successfully used backend high-quality TTS
    } catch (err) {
      console.error("Backend TTS failed, falling back to browser TTS", err)
    }

    // --- Browser TTS (Fallback/Default) ---
    // If browser speechSynthesis is also missing, set a 15s fallback silence timer
    // so the interview never gets permanently stuck.
    if (!window.speechSynthesis) {
      startSilenceTimer(15000)
      return
    }
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
        startSilenceTimer(10000)
      }

      window.speechSynthesis.speak(utterance)
    }

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = setVoiceAndSpeak
    } else {
      setVoiceAndSpeak()
    }
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

    try {
      const activeQuestion = questions[currentQuestionIndex]
      const iid = interviewId || sessionDetail?.interview_id || sessionId
      const answerForm = new FormData()
      answerForm.append('interview_id', iid)
      answerForm.append('question_id', activeQuestion?.id || (currentQuestionIndex + 1))
      answerForm.append('question_text', activeQuestion?.text || activeQuestion?.question || '')
      answerForm.append('answer_text', activeQuestion?.type === 'coding' ? (codeAnswer || ' ') : (transcriptionText || ' '))
      answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
      const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)
      answerForm.append('time_spent_seconds', timeSpent.toString())
      answerForm.append('time_limit_seconds', '120')

      await api.post(`/save-answer`, answerForm, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      const words = transcriptionText.trim().split(/\s+/).filter(w => w.length > 0).length
      const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
      await api.post(`/save-behavioral-data`, {
        interview_id: iid,
        question_id: (activeQuestion?.id || (currentQuestionIndex + 1)).toString(),
        filler_count: countFillers(transcriptionText),
        wpm: wpm,
        pause_count: behavioralStatsRef.current.pauseCount,
        tab_switches: behavioralStatsRef.current.tabSwitches,
        face_alerts: behavioralStatsRef.current.faceAlerts,
        noise_alerts: behavioralStatsRef.current.noiseAlerts
      })
    } catch (e) {
      console.error("Failed to save answer during transition:", e)
    }

    setTranscriptionText('')
    setCodeAnswer('')
    setCodeOutput('')
    behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 }
    questionStartTimeRef.current = Date.now()
    startNextRound()
  }

  const handleNextQuestion = async () => {
    if (currentQuestionIndex >= questions.length) return
    const currentQuestion = questions[currentQuestionIndex]
    stopSilenceTimer()

    const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)
    const words = transcriptionText.trim().split(/\s+/).filter(w => w.length > 0).length
    const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
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
        answerForm.append('time_spent_seconds', timeSpent.toString())
        answerForm.append('time_limit_seconds', '120')

        await api.post(`/save-answer`, answerForm, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      }

      // Save behavioral data AFTER save-answer, so the record exists to be updated
      const payload = {
        interview_id: iid,
        question_id: (currentQuestion.id || (currentQuestionIndex + 1)).toString(),
        filler_count: countFillers(transcriptionText),
        wpm: wpm,
        pause_count: behavioralStatsRef.current.pauseCount,
        tab_switches: behavioralStatsRef.current.tabSwitches,
        face_alerts: behavioralStatsRef.current.faceAlerts,
        noise_alerts: behavioralStatsRef.current.noiseAlerts
      }
      try {
        await api.post(`/save-behavioral-data`, payload)
      } catch (e) { }

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
          setInterimTranscriptText('')
          setCodeAnswer('')
          setCodeOutput('')
          behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0, noiseAlerts: 0 }
          questionStartTimeRef.current = Date.now()
          startNextRound()
        } else {
          handleSubmitInterview()
        }
      } else {
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

  const handleSubmitInterview = async (forceClose = false, terminationReason = null) => {
    isSubmittingRef.current = true
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

      // Fire and forget background upload
      Promise.all([
        uploadPromise(cameraChunksRef.current, 'camera'),
        uploadPromise(screenChunksRef.current, 'screen')
      ]).then(() => {
        setUploadPercentage(100)
      }).catch(err => console.error("Background upload failed:", err))
    }

    try {
      const timeSpent = Math.round((Date.now() - questionStartTimeRef.current) / 1000)
      const words = transcriptionText.trim().split(/\s+/).filter(w => w.length > 0).length
      const wpm = timeSpent > 0 ? Math.round((words / timeSpent) * 60) : 0
      const currentQuestion = questions[currentQuestionIndex] || {}
      
      // If forced termination (e.g., proctoring alert), save the answer first!
      if (isForceSubmit && currentQuestion) {
        const iid = interviewIdRef.current || sessionId
        const answerForm = new FormData()
        answerForm.append('interview_id', iid)
        answerForm.append('question_id', currentQuestion.id || (currentQuestionIndex + 1))
        answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
        answerForm.append('answer_text', currentQuestion.type === 'coding' ? (codeAnswer || ' ') : (transcriptionText || ' '))
        answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
        answerForm.append('time_spent_seconds', timeSpent.toString())
        answerForm.append('time_limit_seconds', '120')
        try {
          await api.post(`/save-answer`, answerForm, {
            headers: { 'Content-Type': 'multipart/form-data' }
          })
        } catch (e) { }
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
    faceAlertCount,
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
    isSpeechRecordingRef,
    interimTranscriptText,
    isCompleted
  }
}
