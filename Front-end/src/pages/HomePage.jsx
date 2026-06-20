import React, { useState, useEffect, useRef } from 'react'
import '../Interview.css'
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
  const [showAllSet, setShowAllSet] = useState(false)
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
    setShowSkipButton(false)
    setShowAllSet(true)
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
      /* Backend endpoint doesn't exist yet
      await fetch(`${API_BASE_URL}/record-proctoring-violation/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violation_type: type })
      })
      */
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

  // Render "All Set!" screen
  if (showAllSet) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif', textAlign: 'center', background: '#0f172a', color: '#fff' }}>
        <div style={{ background: '#22c55e', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
          <svg style={{ width: '40px', height: '40px', color: '#fff' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '16px' }}>All Set!</h1>
        <p style={{ color: '#94a3b8', marginBottom: '32px', fontSize: '18px' }}>Your interview has been successfully submitted and saved.</p>
        <button onClick={() => navigate('/')} style={{ padding: '12px 32px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '9999px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}>
          Exit Now
        </button>
      </div>
    )
  }

  // Render Video uploading progress panel
  if (uploadingText) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px', padding: '24px', textAlign: 'center', background: '#0f172a' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>{uploadingText}</h2>
        {uploadPercentage > 0 && uploadPercentage < 100 && (
          <div style={{ width: '300px', height: '10px', background: '#1e293b', border: '1px solid #334155', borderRadius: '9999px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#4f46e5', transition: 'width 0.3s', width: `${uploadPercentage}%` }}></div>
          </div>
        )}
        {showSkipButton && uploadPercentage < 100 && (
          <div style={{ marginTop: '16px', padding: '16px', border: '1px solid #fbbf24', background: '#fffbeb', borderRadius: '12px', maxWidth: '380px' }}>
            <p style={{ color: '#92400e', fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
              Takes too long? Your text answers are already saved.
            </p>
            <button 
              onClick={handleSkipUpload}
              disabled={skipCountdown > 0}
              style={{ padding: '8px 16px', borderRadius: '9999px', fontSize: '14px', fontWeight: 'bold', cursor: skipCountdown > 0 ? 'not-allowed' : 'pointer', background: skipCountdown > 0 ? '#e2e8f0' : '#fef3c7', color: skipCountdown > 0 ? '#94a3b8' : '#b45309', border: skipCountdown > 0 ? 'none' : '1px solid #fcd34d' }}
            >
              {skipCountdown > 0 ? `Skip available in ${skipCountdown}s` : 'Skip Video Upload'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="container">
      {/* Background Noise banner */}
      {showNoiseBanner && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 99999, padding: '16px', borderRadius: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid #f59e0b', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', maxWidth: '380px' }}>
          <Volume2 size={20} style={{ animation: 'bounce 1s infinite' }} />
          <div>
            <strong style={{ fontSize: '14px', display: 'block' }}>Background Noise Alert</strong>
            <p style={{ fontSize: '12px', opacity: 0.9, margin: '2px 0 0 0' }}>Please maintain silence. Alerts: {noiseAlertCount}/20</p>
          </div>
        </div>
      )}

      {/* Fullscreen Alert Banner */}
      {fullscreenWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '30px', fontWeight: '800', color: '#fff' }}>⚠️ Anti-Cheating Alert</h2>
          <p style={{ fontSize: '16px', color: '#94a3b8', maxWidth: '500px', lineHeight: '1.5' }}>Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
          <button
            onClick={enableFullscreen}
            style={{ padding: '12px 32px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
          >
            Enable Full Screen
          </button>
        </div>
      )}

      {/* Screen Share alert */}
      {screenShareWarning && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '20px', textAlign: 'center', padding: '24px' }}>
          <ShieldAlert size={60} color="#ef4444" style={{ animation: 'pulse 2s infinite' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#fff' }}>Screen Sharing Stopped</h2>
          <p style={{ color: '#94a3b8', fontSize: '14px', maxWidth: '400px' }}>You must share your entire screen to continue the proctored interview. Violations: {screenShareViolations} of 3</p>
          <button
            onClick={restartScreenShare}
            style={{ padding: '10px 24px', borderRadius: '9999px', background: '#4f46e5', color: '#fff', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', border: 'none' }}
          >
            Restart Screen Share
          </button>
        </div>
      )}

      <div id="interviewSection">
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <defs>
            <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#6366f1" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
        </svg>

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="ip-left">
          {/* AI Avatar */}
          <div className="ip-avatar-card">
            <video ref={videoPreviewRef} autoPlay muted playsInline id="videoPreview" />
            <div className="live-badge">LIVE</div>
            {proctoringAlert && (
               <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, fontSize: '1.2rem', fontWeight: 'bold', flexDirection: 'column', textAlign: 'center', padding: '20px' }}>
                 <span style={{ fontSize: '3rem', marginBottom: '10px' }}>⚠️</span>
                 <div>{proctoringAlert}</div>
               </div>
            )}
          </div>

          {/* AI Analyzing Status */}
          <div className="ip-analyzing-card">
            <div className="ip-analyzing-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
              </svg>
            </div>
            <div className="ip-analyzing-text">
              <h4>AI Analyzing</h4>
              <p>AI is Reading the Question...</p>
            </div>
            <div className="ip-audio-bars">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>

          {/* Circular Timer */}
          <div className="ip-timer-card">
            <div className="ip-timer-ring">
              <svg width="110" height="110" viewBox="0 0 110 110">
                <circle className="track" cx="55" cy="55" r="47" />
                <circle className="fill" cx="55" cy="55" r="47" />
              </svg>
              <div className="ip-timer-label">
                <span>02:00</span>
                <span className="remaining-lbl">Remaining</span>
              </div>
            </div>
            <button className="ip-end-btn" onClick={() => handleSubmitInterview(false)}>
              ⏹ End Interview
            </button>
          </div>

          {/* AI Insights */}
          <div className="ip-insights-card">
            <h4>AI Insights</h4>

            <div className="insight-row">
              <div className="insight-row-header">
                <span className="insight-label">CLARITY</span>
                <span className="insight-value" style={{ color: '#10b981' }}>60%</span>
              </div>
              <div className="insight-bar-track">
                <div className="insight-bar-fill clarity" style={{ width: '60%' }}></div>
              </div>
            </div>

            <div className="insight-row">
              <div className="insight-row-header">
                <span className="insight-label">TECHNICAL DEPTH</span>
                <span className="insight-value" style={{ color: '#6366f1' }}>30%</span>
              </div>
              <div className="insight-bar-track">
                <div className="insight-bar-fill techDepth" style={{ width: '30%' }}></div>
              </div>
            </div>

            <div className="insight-row">
              <div className="insight-row-header">
                <span className="insight-label">CONFIDENCE</span>
                <span className="insight-value" style={{ color: '#f59e0b' }}>80%</span>
              </div>
              <div className="insight-bar-track">
                <div className="insight-bar-fill confidence" style={{ width: '80%' }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="ip-right">
          {currentQuestion?.type === 'coding' ? (
            <div className="coding-round-shell" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', marginTop: '0', background: '#0f172a', borderColor: '#1e293b', borderRadius: '14px', padding: '1.5rem' }}>
              <div className="coding-round-header">
                <div>
                  <h5 className="coding-round-kicker" style={{ color: '#818cf8' }}>Technical Assessment</h5>
                  <h2 style={{ color: '#f8fafc', margin: 0 }}>Coding Round</h2>
                </div>
                <div className="coding-round-actions">
                  <select
                    className="coding-tab-pill"
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    style={{ background: '#1e293b', color: '#f8fafc', borderColor: '#334155' }}
                  >
                    <option value="python">Python 3</option>
                    <option value="javascript">JavaScript</option>
                    <option value="cpp">C++</option>
                  </select>
                </div>
              </div>

              <div className="coding-round-grid" style={{ display: 'flex', flexDirection: 'column', minHeight: '300px', flexGrow: 1 }}>
                <div className="coding-editor-card" style={{ background: '#0f172a', borderColor: '#1e293b', flexGrow: 1 }}>
                  
                  <div className="coding-editor-container" style={{ background: '#020617', border: 'none' }}>
                    <textarea
                      className="w-full h-full bg-transparent text-[#e2e8f0] p-4 font-mono text-sm border-none outline-none resize-none"
                      value={codeAnswer}
                      onChange={(e) => setCodeAnswer(e.target.value)}
                      placeholder="// Write your code solution here..."
                      style={{ minHeight: '200px' }}
                    ></textarea>
                  </div>

                  <div className="coding-console-shell" style={{ background: '#0f172a', borderColor: '#1e293b', minHeight: '120px' }}>
                    <div className="coding-console-tabs" style={{ background: '#1e293b', borderColor: '#334155' }}>
                      <button className="coding-console-tab active" style={{ color: '#f8fafc' }}>Test Output</button>
                    </div>
                    <div className="coding-console-pane active">
                      <pre className="text-emerald-400 font-mono text-xs whitespace-pre-wrap">
                        {codeOutput || "Run code to see output..."}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Question Card */}
              <div className="ip-question-card">
                <div style={{ fontSize: '0.78rem', color: '#9ca3af', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Question <span id="questionNumber">{currentQuestionIndex + 1}</span> of <span id="totalQuestions">{questions.length}</span>
                </div>
                <div className="ip-question-meta">
                  <span className="ip-tag type">{currentQuestion?.type || 'Self-Introduction'}</span>
                  <span className="ip-tag difficulty">Easy</span>
                </div>
                <div className="ip-question-body">
                  <div className="q-bar"></div>
                  <p>{currentQuestionText || 'Question is loading...'}</p>
                  <button className="ip-mute-btn" onClick={() => speakAIQuestion(currentQuestionText)}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="1" y1="1" x2="23" y2="23" />
                      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Live Transcript Card */}
              <div className="ip-transcript-card">
                <div className="ip-transcript-header">
                  <div className="ip-transcript-title">
                    🎙 Live Transcript
                  </div>
                  <div className="ip-recording-badge">
                    <div className="rec-dot"></div>
                    RECORDING
                  </div>
                </div>
                <textarea 
                  className="ip-transcript-box" 
                  placeholder="Your speech will appear here automatically..." 
                  readOnly
                  value={transcriptionText}
                />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="ip-nav-row">
            {currentQuestion?.type === 'coding' && (
              <button className="ip-btn-prev" onClick={handleRunCode} disabled={compiling} style={{ marginRight: 'auto', background: '#3b82f6', color: 'white', border: 'none' }}>
                {compiling ? 'Running...' : 'Run Code'}
              </button>
            )}
            
            <button className="ip-btn-prev" onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0}>← Prev</button>
            
            {currentQuestionIndex === questions.length - 1 ? (
              <button className="ip-btn-next" style={{ background: '#2563eb' }} onClick={() => {
                handleSubmitInterview(false);
                setTimeout(() => navigate('/case-study'), 1500);
              }}>
                Next Round →
              </button>
            ) : (
              <button className="ip-btn-next" onClick={handleNextQuestion}>Next →</button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

export default HomePage

