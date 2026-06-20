import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { Video, Volume2, ArrowRight, ShieldAlert, Cpu, AlertTriangle, RefreshCw } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

const langMap = {
  'Hindi': 'hi-IN',
  'Telugu': 'te-IN',
  'Tamil': 'ta-IN',
  'Malayalam': 'ml-IN',
  'Kannada': 'kn-IN',
  'English': 'en-IN'
}

function HomePage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const sessionId = searchParams.get('session_id') || searchParams.get('session')

  // Screen States
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false)
  const [agreeChecked, setAgreeChecked] = useState(false)
  
  // Session details from backend
  const [sessionDetail, setSessionDetail] = useState(null)
  const [interviewId, setInterviewId] = useState('')
  const [questions, setQuestions] = useState([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  
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
  const [codeAnswer, setCodeAnswer] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('python')
  const [codeOutput, setCodeOutput] = useState('')
  const [compiling, setCompiling] = useState(false)
  const [codingRoundData, setCodingRoundData] = useState(null) // { coding_round, tests }
  const codingRoundStartedRef = useRef(false)
  const [codingRoundLoading, setCodingRoundLoading] = useState(false)

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
  const handleNextQuestionRef = useRef(null)

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
      if (document.hidden) {
        behavioralStatsRef.current.tabSwitches += 1
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

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
        audioCtx.close().catch(() => {})
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

  const handleSkipUpload = () => {
    Swal.fire({
      title: 'Interview Completed',
      text: 'Your textual responses were saved successfully. Video upload skipped.',
      icon: 'success',
      background: '#161c2d',
      color: '#fff',
      customClass: {
        popup: 'border border-white/8 rounded-2xl shadow-2xl',
        title: 'text-xl font-bold text-white',
        htmlContainer: 'text-slate-300 text-sm',
        confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
      },
      buttonsStyling: false,
      allowOutsideClick: false
    }).then(() => {
      document.body.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; text-align:center; background:#0f172a; color:#fff;">
          <h1 style="font-size:24px; font-weight:bold; margin-bottom:16px;">Thanks! Your interview is complete.</h1>
          <p style="color:#94a3b8; margin-bottom:24px;">You can now close this tab safely.</p>
          <button onclick="window.close()" style="padding:10px 24px; background:#4f46e5; color:white; border:none; border-radius:9999px; cursor:pointer;">Close Window</button>
        </div>
      `
    })
  }

  useEffect(() => {
    if (!sessionId) {
      setError("Missing Session ID in URL parameters. Please check your secure interview invitation link.")
      setLoading(false)
      return
    }

    // Verify session details
    async function verifySession() {
      try {
        // Step 1: Check session status and details
        const response = await fetch(`${API_BASE_URL}/session/${sessionId}`)
        const payload = await response.json()
        if (!response.ok || payload.status !== 'success') {
          throw new Error(payload.detail || payload.message || "Failed to load session details.")
        }
        
        // Save session info
        setSessionDetail(payload)

        // Handle error cases first
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

        // Step 2: Call start-session-interview to initialize/retrieve questions
        const formData = new FormData()
        formData.append('link_id', sessionId)
        
        const startResponse = await fetch(`${API_BASE_URL}/start-session-interview`, {
          method: 'POST',
          body: formData
        })
        const startPayload = await startResponse.json()
        if (!startResponse.ok) {
          throw new Error(startPayload.detail || "Failed to start interview session.")
        }

        if (startPayload.is_expired) {
          throw new Error(startPayload.message || "This interview link has expired.")
        }
        if (startPayload.is_before_schedule) {
          throw new Error("This interview session is scheduled for a future time window.")
        }
        if (startPayload.session_status === 'completed') {
          throw new Error("This interview session has already been completed.")
        }

        // Hydrate questions and states
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
        
        // Resolve resume index
        const resumeQId = Number(startPayload.resume_question_id) || (startPayload.first_question ? Number(startPayload.first_question.id) : 1)
        const qIndex = qList.findIndex(q => Number(q.id) === Number(resumeQId))
        setCurrentQuestionIndex(qIndex >= 0 ? qIndex : 0)
        
        // Update session duration if returned
        if (startPayload.interview_duration) {
          setSessionDetail(prev => ({
            ...prev,
            interview_duration: startPayload.interview_duration
          }))
        }

        setLoading(false)
      } catch (err) {
        setError(err.message || "Unable to access this interview session.")
        setLoading(false)
      }
    }
    verifySession()
  }, [sessionId])

  // Proctoring: Fullscreen Checker
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
    const interval = setInterval(checkFullscreen, 1500)

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen)
      clearInterval(interval)
    }
  }, [isDisclaimerAccepted])

  // Enable Fullscreen
  const enableFullscreen = () => {
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(err => console.log(err))
    }
    setFullscreenWarning(false)
  }

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
        try { rec.start() } catch (e) {}
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
      silenceTimeoutRef.current = setTimeout(() => {
        if (handleNextQuestionRef.current) handleNextQuestionRef.current()
      }, 10000)
    }

    rec.onerror = (e) => {
      if (e.error !== 'no-speech') {
        console.error("Speech Recognition Error:", e.error)
      }
    }

    recognitionRef.current = rec
  }

  // Setup face proctoring BlazeFace
  const startFaceProctoring = async (videoElement) => {
    if (!window.blazeface) return
    let faceModel = null
    let cocoModel = null
    try {
      faceModel = await window.blazeface.load({
        maxFaces: 5,
        scoreThreshold: 0.55,
        iouThreshold: 0.3
      })
      if (window.cocoSsd) {
        cocoModel = await window.cocoSsd.load()
      }
    } catch (e) {
      console.error("TensorFlow models failed to load", e)
      return
    }

    let isProcessing = false
    faceDetectionIntervalRef.current = setInterval(async () => {
      if (isProcessing) return
      const currentVideo = videoElement || videoPreviewRef.current
      if (!currentVideo || !currentVideo.srcObject) return
      if (currentVideo.readyState >= 2 && !currentVideo.paused) {
        isProcessing = true
        try {
          const predictions = await faceModel.estimateFaces(currentVideo, false)
          let phoneDetected = false

          if (cocoModel) {
            const objects = await cocoModel.detect(currentVideo)
            phoneDetected = objects.some(obj => obj.class === 'cell phone')
          }

          if (phoneDetected) {
            setProctoringAlert("MOBILE PHONE DETECTED")
            recordAlertMetric("phone_detected")
          } else if (predictions.length === 0) {
            setProctoringAlert("YOUR FACE IS NOT VISIBLE")
            recordAlertMetric("no_face")
          } else if (predictions.length > 1) {
            setProctoringAlert("MULTIPLE FACES DETECTED")
            recordAlertMetric("multiple_faces")
          } else {
            // Check eye contact / landmarks
            const pred = predictions[0]
            if (pred.landmarks) {
              const rightEye = pred.landmarks[0]
              const leftEye = pred.landmarks[1]
              const nose = pred.landmarks[2]
              const eyeMidX = (rightEye[0] + leftEye[0]) / 2
              const eyeDist = Math.abs(rightEye[0] - leftEye[0])
              const noseDevX = Math.abs(nose[0] - eyeMidX)

              if (noseDevX > (eyeDist * 0.45)) {
                setProctoringAlert("MAINTAIN EYE CONTACT")
              } else {
                setProctoringAlert('')
              }
            } else {
              setProctoringAlert('')
            }
          }
        } catch (e) {
          console.error(e)
        } finally {
          isProcessing = false
        }
      }
    }, 1500)
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
  const recordAlertMetric = async (type) => {
    behavioralStatsRef.current.faceAlerts += 1
    try {
      await fetch(`${API_BASE_URL}/record-proctoring-violation/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violation_type: type })
      })
    } catch (e) {}
  }

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

      try {
        enableFullscreen()

        // 1. Request Camera & Mic
        let stream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, frameRate: 15 },
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

        startFaceProctoring(previewVideo)
        startBackgroundNoiseMonitor(stream)

        // Crucial: set these states last so we render the interview workspace
        setIsDisclaimerAccepted(true)
        setIsMediaReady(true)

        // Play introductory prompt text-to-speech for the first question
        if (questions.length > 0) {
          speakAIQuestion(questions[0].text || questions[0].question || questions[0].prompt || '')
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
    })
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
        const currentQ = questions[currentQuestionIndex]
        if (currentQ?.type !== 'coding') {
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

  // Start Coding Round: called after all verbal questions are answered
  const startCodingRound = async (verbalQuestionsLength) => {
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
        codingTask: task,
        codingTests: payload.tests || []
      }
      setQuestions(prev => [...prev, codingQ])
      setCurrentQuestionIndex(verbalQuestionsLength)
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
    } catch (e) {}

    // Save answer
    try {
      const answerForm = new FormData()
      answerForm.append('interview_id', interviewId || sessionDetail?.interview_id || sessionId)
      answerForm.append('question_id', currentQuestion.id)
      answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
      answerForm.append('answer_text', currentQuestion.type === 'coding' ? codeAnswer : transcriptionText)
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

      // Check if this was the last question
      if (currentQuestionIndex === questions.length - 1) {
        const isTechnical = (sessionDetail?.interview_type || '').toLowerCase() === 'technical'
        const isCodingQ = currentQuestion.type === 'coding'

        if (isCodingQ) {
          // Submit the coding answer to the coding-round/submit endpoint
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
          } catch (e) {}
          handleSubmitInterview()
        } else if (isTechnical) {
          // All verbal questions done — transition to coding round
          setTranscriptionText('')
          setCodeAnswer('')
          setCodeOutput('')
          behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 }
          questionStartTimeRef.current = Date.now()
          // Pass current question count so startCodingRound knows the new index
          startCodingRound(questions.length)
        } else {
          handleSubmitInterview()
        }
      } else {
        // Clear templates
        setTranscriptionText('')
        setCodeAnswer('')
        setCodeOutput('')

        behavioralStatsRef.current = { wordCount: 0, fillerCount: 0, pauseCount: 0, faceAlerts: 0, tabSwitches: 0 }
        questionStartTimeRef.current = Date.now()

        const nextIdx = currentQuestionIndex + 1
        setCurrentQuestionIndex(nextIdx)
        speakAIQuestion(questions[nextIdx].text || questions[nextIdx].question || questions[nextIdx].prompt || '')
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
    if (!codeAnswer) return
    setCompiling(true)
    setCodeOutput("Compiling and executing code...")
    try {
      const response = await fetch(`${API_BASE_URL}/run-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeAnswer,
          language: selectedLanguage,
          question_id: questions[currentQuestionIndex]?.id
        })
      })
      const payload = await response.json()
      if (response.ok) {
        setCodeOutput(payload.output || "Code executed successfully with no stdout.")
      } else {
        setCodeOutput(`Compilation Error:\n${payload.detail || payload.message || "Execution failed."}`)
      }
    } catch (e) {
      setCodeOutput("Execution failed due to server error.")
    } finally {
      setCompiling(false)
    }
  }

  // End Interview & Upload Recordings
  const handleSubmitInterview = async (forceClose = false) => {
    visualizerActiveRef.current = false
    // Stop loops
    if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current)
    if (noiseMonitorFrameRef.current) cancelAnimationFrame(noiseMonitorFrameRef.current)
    isSpeechRecordingRef.current = false
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) {}
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
    } catch (e) {}

    // Complete UI screen
    setShowSkipButton(false)
    setUploadingText("Interview Completed successfully! Thank you for participating.")
    setTimeout(() => {
      // Exit fullscreen
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(err => console.log(err))
      }
      navigate('/')
    }, 3000)
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
        <Link to="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all shadow-[0_4px_14px_rgba(99,102,241,0.15)] mt-6 no-underline">Go to Platform Page</Link>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const currentQuestionText = currentQuestion?.text || currentQuestion?.question || currentQuestion?.prompt || ''

  // Render Disclaimer Page first
  if (!isDisclaimerAccepted) {
    return (
      <div className="max-w-2xl mx-auto my-16 px-6">
        <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-3xl p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] flex flex-col gap-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Secure Interview Environment</h2>
            <p className="text-slate-500 text-sm mt-1">Acme Proctoring Portal — {sessionDetail?.interview_title}</p>
          </div>

          <div className="flex flex-col gap-3.5 bg-slate-50 p-5 rounded-2xl border border-slate-200 text-sm">
            <strong className="text-warning block">⚠️ Security Guidelines & Integrity Checks:</strong>
            <ul className="pl-5 flex flex-col gap-2 text-slate-600 list-disc">
              <li>Entire screen share and webcam streams will be recorded continuously.</li>
              <li>Leaving full-screen or switching tabs will flag alerts in the system.</li>
              <li>AI face detection checks eye contact and flags cell phone usage.</li>
              <li>Please complete the assessment individually in a quiet room.</li>
            </ul>
          </div>

          <div className="flex gap-2.5 items-center">
            <input
              type="checkbox"
              id="agree"
              checked={agreeChecked}
              onChange={(e) => setAgreeChecked(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
            />
            <label htmlFor="agree" className="cursor-pointer font-semibold text-sm text-slate-900 select-none">I agree to follow the proctoring guidelines above.</label>
          </div>

          <button
            onClick={acceptDisclaimer}
            disabled={!agreeChecked}
            className="w-full py-3.5 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer border-none shadow-[0_4px_14px_rgba(99,102,241,0.15)]"
          >
            I Understand & Start Interview
          </button>
        </div>
      </div>
    )
  }

  // Render Video uploading progress panel
  if (uploadingText) {
    return (
      <div className="flex justify-center items-center h-screen flex-col gap-5 p-6 text-center">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{uploadingText}</h2>
        {uploadPercentage > 0 && uploadPercentage < 100 && (
          <div className="w-[300px] h-2.5 bg-slate-100 border border-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-300" style={{ width: `${uploadPercentage}%` }}></div>
          </div>
        )}
        {showSkipButton && uploadPercentage < 100 && (
          <div className="mt-4 p-4 border border-amber-200 bg-amber-50 rounded-xl max-w-sm">
            <p className="text-amber-800 text-sm font-medium mb-3">
              Takes too long? Your text answers are already saved.
            </p>
            <button 
              onClick={handleSkipUpload}
              disabled={skipCountdown > 0}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${skipCountdown > 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-amber-100 text-amber-700 hover:bg-amber-200 border border-amber-300'}`}
            >
              {skipCountdown > 0 ? `Skip available in ${skipCountdown}s` : 'Skip Video Upload'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen flex flex-col gap-6">
      
      {/* Background Noise banner */}
      {showNoiseBanner && (
        <div className="fixed top-5 right-5 z-[99999] p-4 rounded-xl bg-warning/10 border border-warning text-warning flex items-center gap-3 shadow-lg max-w-sm">
          <Volume2 size={20} className="flex-shrink-0 animate-bounce" />
          <div>
            <strong className="text-sm block">Background Noise Alert</strong>
            <p className="text-xs text-warning/90 mt-0.5">Please maintain silence. Alerts: {noiseAlertCount}/20</p>
          </div>
        </div>
      )}

      {/* Fullscreen Alert Banner */}
      {fullscreenWarning && (
        <div className="fixed inset-0 bg-black/95 z-[99999] flex flex-col justify-center items-center gap-5 text-center p-6">
          <ShieldAlert size={60} className="text-danger animate-pulse" />
          <h2 className="text-3xl font-extrabold text-white tracking-tight">⚠️ Anti-Cheating Alert</h2>
          <p className="text-base text-slate-400 max-w-lg leading-relaxed">Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
          <button
            onClick={enableFullscreen}
            className="px-8 py-3 rounded-full bg-primary hover:bg-primary-hover text-white font-semibold text-sm shadow-[0_4px_14px_rgba(99,102,241,0.15)] cursor-pointer border-none"
          >
            Enable Full Screen
          </button>
        </div>
      )}

      {/* Screen Share alert */}
      {screenShareWarning && (
        <div className="fixed inset-0 bg-black/95 z-[99999] flex flex-col justify-center items-center gap-5 text-center p-6">
          <ShieldAlert size={60} className="text-danger animate-pulse" />
          <h2 className="text-2xl font-bold text-white tracking-tight">Screen Sharing Stopped</h2>
          <p className="text-slate-400 text-sm max-w-md">You must share your entire screen to continue the proctored interview. Violations: {screenShareViolations} of 3</p>
          <button
            onClick={restartScreenShare}
            className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary-hover text-white text-sm font-semibold cursor-pointer border-none shadow-[0_4px_14px_rgba(99,102,241,0.15)]"
          >
            Restart Screen Share
          </button>
        </div>
      )}

      {/* Header Info */}
      <header className="flex justify-between items-center bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl px-6 py-4 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
        <div>
          <span className="text-[0.68rem] font-bold text-slate-500 uppercase tracking-wider block">Secure Candidate Portal</span>
          <h3 className="text-base font-bold text-slate-900 mt-0.5">{sessionDetail?.candidate_name} — {sessionDetail?.interview_title}</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">Q: {currentQuestionIndex + 1} / {questions.length}</span>
          <span className="bg-success/10 text-success px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider animate-pulse">Proctored</span>
        </div>
      </header>

      {/* Main Panel Grid */}
      <main className={`grid gap-6 flex-grow ${currentQuestion?.type === 'coding' ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[380px_1fr]'}`}>
        
        {/* Left Side: Avatar/Camera Preview (Hidden in coding round for layout space) */}
        {currentQuestion?.type !== 'coding' && (
          <div className="flex flex-col gap-6">
            <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-0 overflow-hidden relative shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
              <video ref={videoPreviewRef} className="w-full h-[260px] object-cover bg-black" />
              {proctoringAlert && (
                <div className="absolute bottom-3 left-3 right-3 p-3 bg-danger text-white rounded-lg text-xs font-extrabold flex gap-2 items-center shadow-md animate-pulse">
                  <ShieldAlert size={14} className="flex-shrink-0" /> {proctoringAlert}
                </div>
              )}
            </div>

            <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-4 text-center flex flex-col gap-2 shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
              <span className="text-slate-500 text-xs font-semibold uppercase tracking-wider">Continuous AI Proctoring</span>
              <div className="flex justify-center gap-1 items-end h-[24px]">
                <span className="w-1 h-3 bg-success rounded-full"></span>
                <span className="w-1 h-5 bg-success rounded-full animate-bounce"></span>
                <span className="w-1 h-2 bg-success rounded-full"></span>
                <span className="w-1 h-4.5 bg-success rounded-full animate-bounce delay-75"></span>
              </div>
            </div>
          </div>
        )}

        {/* Right Side / Entire layout: Question Workspace */}
        <div className="flex flex-col gap-6">
          
          {/* Question Text */}
          <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] flex flex-col items-start gap-3">
            <span className="bg-primary/10 text-primary px-3 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider">{currentQuestion?.type} round</span>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-relaxed">{currentQuestionText || 'Question is loading...'}</h2>
          </div>

          {/* Answer Workspace */}
          {currentQuestion?.type === 'coding' ? (
            /* Coding Round side-by-side workspace */
            <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6 flex-grow">
              {/* Left Column: Compiler details & code editor */}
              <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 m-0">Code Editor</label>
                  <select
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1 text-slate-900 text-xs outline-none cursor-pointer focus:border-primary"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                  >
                    <option value="python">Python 3</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                  </select>
                </div>
                
                <textarea
                  className="w-full bg-[#0e111a] border border-white/8 rounded-lg p-4 text-[#82aaff] text-sm font-mono outline-none focus:border-primary min-h-[300px] flex-grow resize-y"
                  value={codeAnswer}
                  onChange={(e) => setCodeAnswer(e.target.value)}
                  placeholder="// Write your code solution here..."
                />

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={handleRunCode}
                    disabled={compiling}
                    className="flex-1 py-3 rounded-full font-semibold text-sm bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <Cpu size={16} /> {compiling ? "Running..." : "Run Test Code"}
                  </button>
                  <button
                    onClick={handleNextQuestion}
                    className="flex-1 py-3 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white cursor-pointer transition-all border-none flex items-center justify-center gap-1.5 shadow-[0_4px_14px_rgba(99,102,241,0.15)]"
                  >
                    Submit Code Answer <ArrowRight size={16} />
                  </button>
                </div>
              </div>

              {/* Right Column: Execution stdout console & webcam widget */}
              <div className="flex flex-col gap-6">
                {/* Webcam feedback during coding */}
                <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-0 overflow-hidden h-[150px] relative shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                  <video ref={videoPreviewRef} className="w-full h-full object-cover bg-black" />
                </div>

                {/* Console */}
                <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] flex flex-col gap-3 flex-grow">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 m-0">Output Console</label>
                  <pre className="flex-grow bg-[#090d16] border border-white/5 rounded-lg p-3 font-mono text-xs text-emerald-400 overflow-auto whitespace-pre-wrap min-h-[140px]">
                    {codeOutput || "No compilation stdout. Run test code to check outputs."}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            /* Traditional Q&A Speech-to-Text workspace */
            <div className="bg-white/90 backdrop-blur-md border border-slate-200 rounded-2xl p-6 shadow-[0_18px_45px_rgba(15,23,42,0.12)] flex flex-col gap-4 flex-grow">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 m-0">Live Transcription Answer Box</label>
              
              <textarea
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-slate-900 text-sm outline-none placeholder:text-slate-500 min-h-[180px] flex-grow resize-y cursor-default"
                value={transcriptionText}
                readOnly
                placeholder="Microphone transcription will stream here automatically."
              />
              <canvas 
                id="audioVisualizer" 
                ref={visualizerCanvasRef} 
                width="800" 
                height="80" 
                className="w-full h-[80px] mt-4 rounded-lg bg-slate-50 border border-slate-200 shadow-inner"
              ></canvas>

              <div className="flex justify-between items-center mt-2 flex-wrap gap-3">
                <button
                  onClick={() => speakAIQuestion(currentQuestionText)}
                  className="py-2.5 px-5 rounded-full font-semibold text-xs bg-white hover:bg-slate-50 text-slate-900 border border-slate-200 cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Volume2 size={16} /> Repeat Question
                </button>
                
                <button
                  onClick={handleNextQuestion}
                  className="py-3 px-8 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white border-none cursor-pointer transition-all flex items-center gap-1.5 shadow-[0_4px_14px_rgba(99,102,241,0.15)]"
                >
                  Next Question <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}

export default HomePage
