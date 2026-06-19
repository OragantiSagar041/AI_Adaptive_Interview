// import React, { useState, useEffect, useRef } from 'react'
// import { useSearchParams, useNavigate } from 'react-router-dom'
// import { API_BASE_URL } from '../apiConfig'
// import { Video, Play, Volume2, Hammer, SkipForward, ArrowRight, Eye, ShieldAlert, Cpu, AlertTriangle } from 'lucide-react'
// import Swal from 'sweetalert2'
// import 'sweetalert2/dist/sweetalert2.min.css'

// function InterviewPage() {
//   const [searchParams] = useSearchParams()
//   const navigate = useNavigate()
//   const sessionId = searchParams.get('session_id') || searchParams.get('session')

//   // Screen States
//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState(null)
//   const [isDisclaimerAccepted, setIsDisclaimerAccepted] = useState(false)
//   const [agreeChecked, setAgreeChecked] = useState(false)
  
//   // Session details from backend
//   const [sessionDetail, setSessionDetail] = useState(null)
//   const [interviewId, setInterviewId] = useState('')
//   const [questions, setQuestions] = useState([])
//   const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  
//   // Proctoring/Recording states
//   const [isMediaReady, setIsMediaReady] = useState(false)
//   const [proctoringAlert, setProctoringAlert] = useState('')
//   const [noiseAlertCount, setNoiseAlertCount] = useState(0)
//   const [showNoiseBanner, setShowNoiseBanner] = useState(false)
//   const [fullscreenWarning, setFullscreenWarning] = useState(false)
//   const [screenShareWarning, setScreenShareWarning] = useState(false)
//   const [screenShareViolations, setScreenShareViolations] = useState(0)
  
//   // Upload states
//   const [uploadPercentage, setUploadPercentage] = useState(0)
//   const [uploadingText, setUploadingText] = useState('')

//   // Answer state
//   const [transcriptionText, setTranscriptionText] = useState('')
//   const [codeAnswer, setCodeAnswer] = useState('')
//   const [selectedLanguage, setSelectedLanguage] = useState('python')
//   const [codeOutput, setCodeOutput] = useState('')
//   const [compiling, setCompiling] = useState(false)

//   // Recording Ref elements
//   const videoPreviewRef = useRef(null)
//   const canvasRef = useRef(null)
  
//   // Audio context/recorder references
//   const cameraRecorderRef = useRef(null)
//   const screenRecorderRef = useRef(null)
//   const cameraChunksRef = useRef([])
//   const screenChunksRef = useRef([])
//   const mediaStreamRef = useRef(null)
//   const screenStreamRef = useRef(null)
  
//   // Speech Recognition Reference
//   const recognitionRef = useRef(null)
//   const isSpeechRecordingRef = useRef(false)

//   // Proctoring Loops
//   const faceDetectionIntervalRef = useRef(null)
//   const noiseAudioContextRef = useRef(null)
//   const noiseMonitorFrameRef = useRef(null)
//   const noiseFrameCountRef = useRef(0)
//   const noiseCooldownRef = useRef(0)

//   const normalizeQuestions = (rawQuestions = []) => {
//     return rawQuestions.map((question, index) => ({
//       ...question,
//       id: question.id ?? index + 1,
//       text: question.text || question.question || question.prompt || '',
//       type: question.type || question.category || 'Interview'
//     }))
//   }

//   useEffect(() => {
//     if (!sessionId) {
//       setError("Missing Session ID in URL parameters. Please check your interview link.")
//       setLoading(false)
//       return
//     }

//     // Verify session details
//     async function verifySession() {
//       try {
//         // Step 1: Check session status and details
//         const response = await fetch(`${API_BASE_URL}/session/${sessionId}`)
//         const payload = await response.json()
//         if (!response.ok || payload.status !== 'success') {
//           throw new Error(payload.detail || payload.message || "Failed to load session details.")
//         }
        
//         // Save session info
//         setSessionDetail(payload)

//         // Handle error cases first
//         if (payload.is_deactivated) {
//           throw new Error("This interview link has been temporarily deactivated by the recruiter.")
//         }
//         if (payload.is_expired) {
//           throw new Error("This interview link has expired. Please contact the recruiter for a new link.")
//         }
//         if (payload.is_before_schedule && payload.scheduled_start) {
//           const startTime = new Date(payload.scheduled_start.endsWith('Z') || payload.scheduled_start.includes('+') ? payload.scheduled_start : payload.scheduled_start + 'Z')
//           throw new Error(`This interview is scheduled to start on ${startTime.toLocaleString()}. Please try again at the scheduled time.`)
//         }
//         if (payload.session_status === 'completed') {
//           throw new Error("This interview session has already been completed.")
//         }

//         // Step 2: Call start-session-interview to initialize/retrieve questions
//         const formData = new FormData()
//         formData.append('link_id', sessionId)
        
//         const startResponse = await fetch(`${API_BASE_URL}/start-session-interview`, {
//           method: 'POST',
//           body: formData
//         })
//         const startPayload = await startResponse.json()
//         if (!startResponse.ok) {
//           throw new Error(startPayload.detail || "Failed to start interview session.")
//         }

//         if (startPayload.is_expired) {
//           throw new Error(startPayload.message || "This interview link has expired.")
//         }
//         if (startPayload.is_before_schedule) {
//           throw new Error("This interview session is scheduled for a future time window.")
//         }
//         if (startPayload.session_status === 'completed') {
//           throw new Error("This interview session has already been completed.")
//         }

//         // Hydrate questions and states
//         const rawQuestions = startPayload.questions?.length
//           ? startPayload.questions
//           : startPayload.first_question
//           ? [startPayload.first_question]
//           : []
//         const qList = normalizeQuestions(rawQuestions)
//         if (qList.length === 0) {
//           throw new Error("No interview questions are available for this session. Please contact the recruiter.")
//         }
//         setQuestions(qList)
//         setInterviewId(startPayload.interview_id || '')
//         setSessionDetail(prev => ({
//           ...prev,
//           interview_id: startPayload.interview_id || prev?.interview_id,
//           candidate_name: startPayload.candidate_name || prev?.candidate_name,
//           interview_duration: startPayload.interview_duration || prev?.interview_duration,
//           interview_type: startPayload.interview_type || prev?.interview_type,
//           record_video: startPayload.record_video ?? prev?.record_video
//         }))
        
//         // Resolve resume index
//         const resumeQId = Number(startPayload.resume_question_id) || (startPayload.first_question ? Number(startPayload.first_question.id) : 1)
//         const qIndex = qList.findIndex(q => Number(q.id) === Number(resumeQId))
//         setCurrentQuestionIndex(qIndex >= 0 ? qIndex : 0)
        
//         // Update session duration if returned
//         if (startPayload.interview_duration) {
//           setSessionDetail(prev => ({
//             ...prev,
//             interview_duration: startPayload.interview_duration
//           }))
//         }

//         setLoading(false)
//       } catch (err) {
//         setError(err.message || "Unable to access this interview session.")
//         setLoading(false)
//       }
//     }
//     verifySession()
//   }, [sessionId])

//   // Proctoring: Fullscreen Checker
//   useEffect(() => {
//     if (!isDisclaimerAccepted) return

//     const checkFullscreen = () => {
//       if (!document.fullscreenElement) {
//         setFullscreenWarning(true)
//       } else {
//         setFullscreenWarning(false)
//       }
//     }
//     document.addEventListener('fullscreenchange', checkFullscreen)
//     const interval = setInterval(checkFullscreen, 1500)

//     return () => {
//       document.removeEventListener('fullscreenchange', checkFullscreen)
//       clearInterval(interval)
//     }
//   }, [isDisclaimerAccepted])

//   // Enable Fullscreen
//   const enableFullscreen = () => {
//     const elem = document.documentElement
//     if (elem.requestFullscreen) {
//       elem.requestFullscreen().catch(err => console.log(err))
//     }
//     setFullscreenWarning(false)
//   }

//   // Handle Speech Recognition setup
//   const initSpeechRecognition = () => {
//     if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
//       console.warn("Speech recognition not supported in this browser.")
//       return
//     }
//     const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
//     const rec = new SpeechRecognition()
//     rec.continuous = false
//     rec.interimResults = true
//     rec.lang = 'en-IN'

//     rec.onstart = () => {
//       isSpeechRecordingRef.current = true
//     }

//     rec.onend = () => {
//       if (isSpeechRecordingRef.current) {
//         try { rec.start() } catch (e) {}
//       }
//     }

//     rec.onresult = (event) => {
//       let finalChunk = ''
//       for (let i = event.resultIndex; i < event.results.length; ++i) {
//         if (event.results[i].isFinal) {
//           finalChunk += event.results[i][0].transcript
//         }
//       }
//       if (finalChunk) {
//         setTranscriptionText(prev => prev + finalChunk + ' ')
//       }
//     }

//     rec.onerror = (e) => {
//       if (e.error !== 'no-speech') {
//         console.error("Speech Recognition Error:", e.error)
//       }
//     }

//     recognitionRef.current = rec
//   }

//   // Setup face proctoring BlazeFace
//   const startFaceProctoring = async (videoElement) => {
//     if (!window.blazeface) return
//     let faceModel = null
//     let cocoModel = null
//     try {
//       faceModel = await window.blazeface.load({
//         maxFaces: 5,
//         scoreThreshold: 0.55,
//         iouThreshold: 0.3
//       })
//       if (window.cocoSsd) {
//         cocoModel = await window.cocoSsd.load()
//       }
//     } catch (e) {
//       console.error("TensorFlow models failed to load", e)
//       return
//     }

//     let isProcessing = false
//     faceDetectionIntervalRef.current = setInterval(async () => {
//       if (isProcessing) return
//       const currentVideo = videoElement || videoPreviewRef.current
//       if (!currentVideo || !currentVideo.srcObject) return
//       if (currentVideo.readyState >= 2 && !currentVideo.paused) {
//         isProcessing = true
//         try {
//           const predictions = await faceModel.estimateFaces(currentVideo, false)
//           let phoneDetected = false

//           if (cocoModel) {
//             const objects = await cocoModel.detect(currentVideo)
//             phoneDetected = objects.some(obj => obj.class === 'cell phone')
//           }

//           if (phoneDetected) {
//             setProctoringAlert("MOBILE PHONE DETECTED")
//             recordAlertMetric("phone_detected")
//           } else if (predictions.length === 0) {
//             setProctoringAlert("YOUR FACE IS NOT VISIBLE")
//             recordAlertMetric("no_face")
//           } else if (predictions.length > 1) {
//             setProctoringAlert("MULTIPLE FACES DETECTED")
//             recordAlertMetric("multiple_faces")
//           } else {
//             // Check eye contact / landmarks
//             const pred = predictions[0]
//             if (pred.landmarks) {
//               const rightEye = pred.landmarks[0]
//               const leftEye = pred.landmarks[1]
//               const nose = pred.landmarks[2]
//               const eyeMidX = (rightEye[0] + leftEye[0]) / 2
//               const eyeDist = Math.abs(rightEye[0] - leftEye[0])
//               const noseDevX = Math.abs(nose[0] - eyeMidX)

//               if (noseDevX > (eyeDist * 0.45)) {
//                 setProctoringAlert("MAINTAIN EYE CONTACT")
//               } else {
//                 setProctoringAlert('')
//               }
//             } else {
//               setProctoringAlert('')
//             }
//           }
//         } catch (e) {
//           console.error(e)
//         } finally {
//           isProcessing = false
//         }
//       }
//     }, 1500)
//   }

//   useEffect(() => {
//     if (!isDisclaimerAccepted || !mediaStreamRef.current || !videoPreviewRef.current) return
//     if (videoPreviewRef.current.srcObject !== mediaStreamRef.current) {
//       videoPreviewRef.current.srcObject = mediaStreamRef.current
//       videoPreviewRef.current.muted = true
//       videoPreviewRef.current.play().catch(e => console.log(e))
//     }
//   }, [isDisclaimerAccepted, currentQuestionIndex])

//   // Monitor Mic Noise
//   const startBackgroundNoiseMonitor = (stream) => {
//     if (!stream || stream.getAudioTracks().length === 0) return

//     try {
//       const AudioCtx = window.AudioContext || window.webkitAudioContext
//       const actx = new AudioCtx()
//       noiseAudioContextRef.current = actx
//       const source = actx.createMediaStreamSource(stream)
//       const analyser = actx.createAnalyser()
//       analyser.fftSize = 256
//       source.connect(analyser)
//       const dataArray = new Uint8Array(analyser.frequencyBinCount)

//       const tick = () => {
//         if (!noiseAudioContextRef.current) return
//         noiseMonitorFrameRef.current = requestAnimationFrame(tick)
//         analyser.getByteTimeDomainData(dataArray)

//         let sumSquares = 0
//         for (let i = 0; i < dataArray.length; i++) {
//           const normalized = (dataArray[i] - 128) / 128
//           sumSquares += normalized * normalized
//         }
//         const rms = Math.sqrt(sumSquares / dataArray.length)
//         const now = Date.now()

//         // Background noise calculation
//         if (rms > 0.18 && now > noiseCooldownRef.current) {
//           noiseFrameCountRef.current++
//         } else {
//           noiseFrameCountRef.current = Math.max(0, noiseFrameCountRef.current - 2)
//         }

//         if (noiseFrameCountRef.current >= 18) {
//           noiseCooldownRef.current = now + 5000
//           noiseFrameCountRef.current = 0
//           setNoiseAlertCount(prev => {
//             const next = prev + 1
//             recordAlertMetric("noise_alert")
//             return next
//           })
//           setShowNoiseBanner(true)
//           setTimeout(() => setShowNoiseBanner(false), 4000)
//         }
//       }
//       tick()
//     } catch (e) {
//       console.warn("Noise monitor fail", e)
//     }
//   }

//   // Record proctoring metrics
//   const recordAlertMetric = async (type) => {
//     try {
//       await fetch(`${API_BASE_URL}/record-proctoring-violation/${sessionId}`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ violation_type: type })
//       })
//     } catch (e) {}
//   }

//   // Accept Disclaimer & Start Interview
//   const acceptDisclaimer = () => {
//     Swal.fire({
//       title: 'Media Access Required',
//       html: `
//         <div class="text-left space-y-3">
//           <p class="text-slate-300">This proctored assessment requires permissions to access your:</p>
//           <ul class="list-disc pl-5 text-slate-300 text-sm space-y-1">
//             <li><strong>Webcam</strong> (for face detection & identity verification)</li>
//             <li><strong>Microphone</strong> (for speech-to-text recording)</li>
//             <li><strong>Entire Screen</strong> (for browser proctoring verification)</li>
//           </ul>
//           <p class="text-xs text-amber-500 mt-3 font-semibold">⚠️ Note: Please select your "Entire Screen" when prompted for screen sharing.</p>
//         </div>
//       `,
//       icon: 'info',
//       showCancelButton: true,
//       confirmButtonText: 'Start Setup',
//       cancelButtonText: 'Cancel',
//       background: '#161c2d',
//       color: '#fff',
//       customClass: {
//         popup: 'border border-white/8 rounded-2xl shadow-2xl',
//         title: 'text-xl font-bold text-white',
//         htmlContainer: 'text-slate-300 text-sm',
//         confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none mr-2',
//         cancelButton: 'bg-white/6 hover:bg-white/12 text-white border border-white/8 rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer outline-none'
//       },
//       buttonsStyling: false
//     }).then(async (result) => {
//       if (!result.isConfirmed) return

//       try {
//         enableFullscreen()

//         // 1. Request Camera & Mic
//         let stream
//         try {
//           stream = await navigator.mediaDevices.getUserMedia({
//             video: { width: 640, height: 480, frameRate: 15 },
//             audio: true
//           })
//         } catch (err) {
//           console.error("Camera/Mic getUserMedia error:", err)
//           if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
//             throw new Error("webcam_mic_not_found")
//           } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
//             throw new Error("webcam_mic_denied")
//           } else {
//             throw new Error(`webcam_mic_failed: ${err.message || err.name}`)
//           }
//         }

//         // 2. Request Screen Share
//         let screenStream
//         try {
//           screenStream = await navigator.mediaDevices.getDisplayMedia({
//             video: { displaySurface: "monitor", frameRate: 15 },
//             audio: false
//           })
//         } catch (err) {
//           console.error("Screen Share getDisplayMedia error:", err)
//           // Stop camera stream since screen share failed
//           stream.getTracks().forEach(t => t.stop())
//           if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
//             throw new Error("screenshare_denied")
//           } else {
//             throw new Error(`screenshare_failed: ${err.message || err.name}`)
//           }
//         }

//         mediaStreamRef.current = stream
//         screenStreamRef.current = screenStream

//         // Setup preview
//         const previewVideo = videoPreviewRef.current || document.createElement('video')
//         previewVideo.srcObject = stream
//         previewVideo.muted = true
//         previewVideo.playsInline = true
//         previewVideo.play().catch(e => console.log(e))

//         // Monitor screen share stop
//         const track = screenStream.getVideoTracks()[0]
//         track.onended = () => {
//           handleScreenShareStop()
//         }

//         // Mix Audio tracks into screen share
//         const audioTracks = stream.getAudioTracks()
//         if (audioTracks.length > 0) {
//           screenStream.addTrack(audioTracks[0])
//         }

//         // Initialize recorders
//         let options = { videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 }
//         cameraRecorderRef.current = new MediaRecorder(stream, options)
//         cameraChunksRef.current = []
//         cameraRecorderRef.current.ondataavailable = e => {
//           if (e.data.size > 0) cameraChunksRef.current.push(e.data)
//         }

//         screenRecorderRef.current = new MediaRecorder(screenStream, options)
//         screenChunksRef.current = []
//         screenRecorderRef.current.ondataavailable = e => {
//           if (e.data.size > 0) screenChunksRef.current.push(e.data)
//         }

//         // Start recorders
//         cameraRecorderRef.current.start(2000)
//         screenRecorderRef.current.start(2000)

//         // Start triggers
//         initSpeechRecognition()
//         if (recognitionRef.current) {
//           recognitionRef.current.start()
//         }

//         startFaceProctoring(previewVideo)
//         startBackgroundNoiseMonitor(stream)

//         // Crucial: set these states last so we render the interview workspace
//         setIsDisclaimerAccepted(true)
//         setIsMediaReady(true)

//         // Play introductory prompt text-to-speech for the first question
//         if (questions.length > 0) {
//           speakAIQuestion(questions[0].text || questions[0].question || questions[0].prompt || '')
//         }

//       } catch (err) {
//         console.error("Setup permissions failure:", err)
//         let errTitle = 'Setup Failed'
//         let errText = 'All permissions (webcam, microphone, and screen share) are required to take this proctored interview.'
//         let errIcon = 'error'

//         if (err.message === 'webcam_mic_not_found') {
//           errTitle = 'Camera/Microphone Not Found'
//           errText = 'We could not detect a working camera or microphone. Please make sure they are connected and try again.'
//           errIcon = 'warning'
//         } else if (err.message === 'webcam_mic_denied') {
//           errTitle = 'Camera/Microphone Access Denied'
//           errText = 'Permission to access your camera and microphone was denied. Please check your browser settings and allow access to continue.'
//         } else if (err.message === 'screenshare_denied') {
//           errTitle = 'Screen Sharing Required'
//           errText = 'You must share your entire screen to proceed with the secure proctored interview.'
//           errIcon = 'warning'
//         }

//         Swal.fire({
//           title: errTitle,
//           text: errText,
//           icon: errIcon,
//           background: '#161c2d',
//           color: '#fff',
//           customClass: {
//             popup: 'border border-white/8 rounded-2xl shadow-2xl',
//             title: 'text-xl font-bold text-white',
//             htmlContainer: 'text-slate-300 text-sm',
//             confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none'
//           },
//           buttonsStyling: false
//         })
//       }
//     })
//   }

//   // Handle Screen share stop violation
//   const handleScreenShareStop = () => {
//     setScreenShareViolations(prev => {
//       const next = prev + 1
//       if (next >= 4) {
//         setScreenShareWarning(false)
//         alert("Interview terminated: Screen sharing was stopped 4 times. Your responses have been saved.")
//         handleSubmitInterview(true)
//       } else {
//         setScreenShareWarning(true)
//       }
//       return next
//     })
//   }

//   // Restart screen share
//   const restartScreenShare = async () => {
//     try {
//       const screenStream = await navigator.mediaDevices.getDisplayMedia({
//         video: { displaySurface: "monitor", frameRate: 15 },
//         audio: false
//       })
//       screenStreamRef.current = screenStream
//       setScreenShareWarning(false)

//       const track = screenStream.getVideoTracks()[0]
//       track.onended = () => {
//         handleScreenShareStop()
//       }
      
//       // Mix microphone
//       if (mediaStreamRef.current) {
//         const audioTracks = mediaStreamRef.current.getAudioTracks()
//         if (audioTracks.length > 0) {
//           screenStream.addTrack(audioTracks[0])
//         }
//       }
      
//       // Setup recorder
//       let options = { videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 }
//       screenRecorderRef.current = new MediaRecorder(screenStream, options)
//       screenChunksRef.current = []
//       screenRecorderRef.current.ondataavailable = e => {
//         if (e.data.size > 0) screenChunksRef.current.push(e.data)
//       }
//       screenRecorderRef.current.start(2000)
//     } catch (e) {
//       alert("You must re-enable screen sharing to continue.")
//     }
//   }

//   // Speech helper: TTS
//   const speakAIQuestion = (text) => {
//     if (!window.speechSynthesis) return
//     window.speechSynthesis.cancel() // stop any active speech
//     const utterance = new SpeechSynthesisUtterance(text)
//     utterance.lang = 'en-US'
//     window.speechSynthesis.speak(utterance)
//   }

//   // Submit Answer & Move Next
//   const handleNextQuestion = async () => {
//     if (currentQuestionIndex >= questions.length) return
//     const currentQuestion = questions[currentQuestionIndex]

//     // Save answer
//     try {
//       const answerForm = new FormData()
//       answerForm.append('interview_id', interviewId || sessionDetail?.interview_id || sessionId)
//       answerForm.append('question_id', currentQuestion.id)
//       answerForm.append('question_text', currentQuestion.text || currentQuestion.question || '')
//       answerForm.append('answer_text', currentQuestion.type === 'coding' ? codeAnswer : transcriptionText)
//       answerForm.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
//       answerForm.append('time_spent_seconds', '0')
//       answerForm.append('time_limit_seconds', '120')

//       const response = await fetch(`${API_BASE_URL}/save-answer`, {
//         method: 'POST',
//         body: answerForm
//       })
//       if (!response.ok) {
//         const payload = await response.json().catch(() => ({}))
//         throw new Error(payload.detail || payload.message || 'Failed to save answer')
//       }

//       // Check if this was the last question
//       if (currentQuestionIndex === questions.length - 1) {
//         handleSubmitInterview()
//       } else {
//         // Clear templates
//         setTranscriptionText('')
//         setCodeAnswer('')
//         setCodeOutput('')
//         const nextIdx = currentQuestionIndex + 1
//         setCurrentQuestionIndex(nextIdx)
//         speakAIQuestion(questions[nextIdx].text || questions[nextIdx].question || questions[nextIdx].prompt || '')
//       }
//     } catch (e) {
//       alert("Failed to save your response. Please try again.")
//     }
//   }

//   // Compiler code runner
//   const handleRunCode = async () => {
//     if (!codeAnswer) return
//     setCompiling(true)
//     setCodeOutput("Compiling and executing code...")
//     try {
//       const response = await fetch(`${API_BASE_URL}/run-code`, {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           code: codeAnswer,
//           language: selectedLanguage,
//           question_id: questions[currentQuestionIndex]?.id
//         })
//       })
//       const payload = await response.json()
//       if (response.ok) {
//         setCodeOutput(payload.output || "Code executed successfully with no stdout.")
//       } else {
//         setCodeOutput(`Compilation Error:\n${payload.detail || payload.message || "Execution failed."}`)
//       }
//     } catch (e) {
//       setCodeOutput("Execution failed due to server error.")
//     } finally {
//       setCompiling(false)
//     }
//   }

//   // End Interview & Upload Recordings
//   const handleSubmitInterview = async (forceClose = false) => {
//     // Stop loops
//     if (faceDetectionIntervalRef.current) clearInterval(faceDetectionIntervalRef.current)
//     if (noiseMonitorFrameRef.current) cancelAnimationFrame(noiseMonitorFrameRef.current)
//     isSpeechRecordingRef.current = false
//     if (recognitionRef.current) {
//       try { recognitionRef.current.stop() } catch (e) {}
//     }

//     // Stop streams
//     if (mediaStreamRef.current) {
//       mediaStreamRef.current.getTracks().forEach(track => track.stop())
//     }
//     if (screenStreamRef.current) {
//       screenStreamRef.current.getTracks().forEach(track => track.stop())
//     }

//     // Stop Recorders
//     if (cameraRecorderRef.current && cameraRecorderRef.current.state !== 'inactive') {
//       cameraRecorderRef.current.stop()
//     }
//     if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
//       screenRecorderRef.current.stop()
//     }

//     // Check if we should upload
//     if (cameraChunksRef.current.length > 0 || screenChunksRef.current.length > 0) {
//       setUploadingText("Uploading video recordings...")
//       setUploadPercentage(10)

//       const uploadPromise = (chunks, type) => {
//         return new Promise((resolve, reject) => {
//           if (chunks.length === 0) return resolve()
//           const blob = new Blob(chunks, { type: 'video/webm' })
//           const formData = new FormData()
//           formData.append('file', blob, `interview_${type}.webm`)
//           formData.append('interview_id', sessionDetail.interview_id)
//           formData.append('recording_type', type)
//           formData.append('link_id', sessionId)

//           const xhr = new XMLHttpRequest()
//           xhr.open('POST', `${API_BASE_URL}/upload-full-recording`, true)
          
//           xhr.upload.onprogress = (e) => {
//             if (e.lengthComputable && type === 'camera') {
//               const percent = Math.floor((e.loaded / e.total) * 100)
//               setUploadPercentage(percent)
//             }
//           }

//           xhr.onload = () => {
//             if (xhr.status === 200) resolve()
//             else reject(new Error("Upload failed"))
//           }
//           xhr.onerror = () => reject(new Error("Network error"))
//           xhr.send(formData)
//         })
//       }

//       try {
//         await Promise.all([
//           uploadPromise(cameraChunksRef.current, 'camera'),
//           uploadPromise(screenChunksRef.current, 'screen')
//         ])
//         setUploadPercentage(100)
//       } catch (err) {
//         console.error(err)
//       }
//     }

//     // Complete session
//     try {
//       await fetch(`${API_BASE_URL}/complete-session/${sessionId}`, { method: 'POST' })
//     } catch (e) {}

//     // Complete UI screen
//     setUploadingText("Interview Completed successfully! Thank you for participating.")
//     setTimeout(() => {
//       // Exit fullscreen
//       if (document.fullscreenElement) {
//         document.exitFullscreen().catch(err => console.log(err))
//       }
//       navigate('/')
//     }, 3000)
//   }

//   if (loading) {
//     return (
//       <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '16px' }}>
//         <RefreshCw style={{ animation: 'spinSlow 2s linear infinite' }} />
//         <span>Loading interview session details...</span>
//       </div>
//     )
//   }

//   if (error) {
//     return (
//       <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', padding: '24px', textAlign: 'center' }}>
//         <AlertTriangle style={{ color: 'var(--danger)', marginBottom: '16px' }} size={48} />
//         <h2>Access Denied</h2>
//         <p style={{ color: 'var(--text-secondary)', marginTop: '8px', maxWidth: '420px' }}>{error}</p>
//         <Link to="/" className="btn btn-primary" style={{ marginTop: '20px' }}>Back to Home</Link>
//       </div>
//     )
//   }

//   const currentQuestion = questions[currentQuestionIndex]
//   const currentQuestionText = currentQuestion?.text || currentQuestion?.question || currentQuestion?.prompt || ''

//   // Render Disclaimer Page first
//   if (!isDisclaimerAccepted) {
//     return (
//       <div style={{ maxWidth: '680px', margin: '60px auto', padding: '0 24px' }}>
//         <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
//           <div style={{ textAlign: 'center' }}>
//             <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>Adaptive Interview Environment</h2>
//             <p style={{ color: 'var(--text-secondary)' }}>Please review guidelines before starting your secure proctored session.</p>
//           </div>

//           <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.02)', padding: '20px', borderRadius: '12px', fontSize: '0.9rem' }}>
//             <strong style={{ color: 'var(--warning)' }}>⚠️ Anti-Cheating & Proctoring Rules:</strong>
//             <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', color: 'var(--text-secondary)' }}>
//               <li>Entire screen share and webcam streams will be recorded continuously.</li>
//               <li>Leaving full-screen or switching tabs will flag alerts in the system.</li>
//               <li>AI face detection checks eye contact and flags cell phone usage.</li>
//               <li>Please complete the assessment individually in a quiet room.</li>
//             </ul>
//           </div>

//           <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
//             <input type="checkbox" id="agree" checked={agreeChecked} onChange={(e) => setAgreeChecked(e.target.checked)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
//             <label htmlFor="agree" style={{ cursor: 'pointer', fontWeight: 600 }}>I agree to follow the proctoring guidelines above.</label>
//           </div>

//           <button onClick={acceptDisclaimer} className="btn btn-primary" style={{ width: '100%', padding: '14px' }} disabled={!agreeChecked}>
//             I Understand & Start Interview
//           </button>
//         </div>
//       </div>
//     )
//   }

//   // Render Video uploading progress panel
//   if (uploadingText) {
//     return (
//       <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '20px', padding: '24px', textAlign: 'center' }}>
//         <h2>{uploadingText}</h2>
//         {uploadPercentage > 0 && uploadPercentage < 100 && (
//           <div style={{ width: '300px', height: '10px', background: 'var(--bg-input)', borderRadius: '5px', overflow: 'hidden' }}>
//             <div style={{ width: `${uploadPercentage}%`, height: '100%', background: 'var(--primary-color)' }}></div>
//           </div>
//         )}
//       </div>
//     )
//   }

//   return (
//     <div style={{ padding: '24px', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
//       {/* Background Noise banner */}
//       {showNoiseBanner && (
//         <div style={{
//           position: 'fixed', top: '20px', right: '20px', zIndex: '99999', padding: '16px', borderRadius: '12px',
//           background: 'var(--warning-glow)', border: '1px solid var(--warning)', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '10px'
//         }}>
//           <Volume2 size={20} />
//           <div>
//             <strong>Background Noise Alert</strong>
//             <p style={{ fontSize: '0.8rem' }}>Please maintain silence. Alerts: {noiseAlertCount}/20</p>
//           </div>
//         </div>
//       )}

//       {/* Fullscreen Alert Banner */}
//       {fullscreenWarning && (
//         <div style={{
//           position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column',
//           justifyContent: 'center', alignItems: 'center', gap: '20px', color: 'white', textAlign: 'center'
//         }}>
//           <ShieldAlert size={60} style={{ color: 'var(--danger)' }} />
//           <h2 style={{ fontSize: '2rem' }}>⚠️ Anti-Cheating Alert</h2>
//           <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', maxWidth: '480px' }}>Full Screen Mode is REQUIRED to take this interview. Exiting fullscreen compromises proctoring validation.</p>
//           <button onClick={enableFullscreen} className="btn btn-primary" style={{ padding: '12px 28px' }}>Enable Full Screen</button>
//         </div>
//       )}

//       {/* Screen Share alert */}
//       {screenShareWarning && (
//         <div style={{
//           position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.95)', zIndex: 99999, display: 'flex', flexDirection: 'column',
//           justifyContent: 'center', alignItems: 'center', gap: '20px', color: 'white', textAlign: 'center'
//         }}>
//           <ShieldAlert size={60} style={{ color: 'var(--danger)' }} />
//           <h2>Screen Sharing Stopped</h2>
//           <p style={{ color: 'var(--text-secondary)', maxWidth: '460px' }}>You must share your entire screen to continue the proctored interview. Violations: {screenShareViolations} of 3</p>
//           <button onClick={restartScreenShare} className="btn btn-primary">Restart Screen Share</button>
//         </div>
//       )}

//       {/* Header Info */}
//       <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="glass-card">
//         <div>
//           <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Secure Candidate Portal</span>
//           <h3 style={{ fontSize: '1.2rem' }}>{sessionDetail?.candidate_name} — {sessionDetail?.interview_title}</h3>
//         </div>
//         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//           <span className="badge badge-primary">Q: {currentQuestionIndex + 1} / {questions.length}</span>
//           <span className="badge badge-success" style={{ animation: 'pulseGlow 2s infinite' }}>Proctored</span>
//         </div>
//       </header>

//       {/* Main Panel Grid */}
//       <main style={{ display: 'grid', gridTemplateColumns: currentQuestion?.type === 'coding' ? '1fr' : '380px 1fr', gap: '20px', flexGrow: 1 }}>
        
//         {/* Left Side: Avatar/Camera Preview (Hidden in coding round for layout space) */}
//         {currentQuestion?.type !== 'coding' && (
//           <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
//             <div className="glass-card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
//               <video ref={videoPreviewRef} style={{ width: '100%', height: '260px', objectFit: 'cover', background: '#000' }} />
//               {proctoringAlert && (
//                 <div style={{
//                   position: 'absolute', bottom: '12px', left: '12px', right: '12px', padding: '8px 12px',
//                   background: 'var(--danger)', color: 'white', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', gap: '6px', alignItems: 'center'
//                 }}>
//                   <ShieldAlert size={14} /> {proctoringAlert}
//                 </div>
//               )}
//             </div>

//             <div className="glass-card" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//               <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Continuous AI Proctoring</span>
//               <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
//                 <span style={{ width: '4px', height: '14px', background: 'var(--success)' }}></span>
//                 <span style={{ width: '4px', height: '22px', background: 'var(--success)' }}></span>
//                 <span style={{ width: '4px', height: '12px', background: 'var(--success)' }}></span>
//                 <span style={{ width: '4px', height: '18px', background: 'var(--success)' }}></span>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Right Side / Entire layout: Question Workspace */}
//         <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
//           {/* Question Text */}
//           <div className="glass-card">
//             <span className="badge badge-primary" style={{ marginBottom: '8px' }}>{currentQuestion?.type} round</span>
//             <h2 style={{ fontSize: '1.4rem', lineHeight: '1.5', color: '#0f172a' }}>{currentQuestionText || 'Question is loading...'}</h2>
//           </div>

//           {/* Answer Workspace */}
//           {currentQuestion?.type === 'coding' ? (
//             /* Coding Round side-by-side workspace */
//             <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '20px', flexGrow: 1 }}>
//               {/* Left Column: Compiler details & code editor */}
//               <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                   <label className="input-label" style={{ margin: 0 }}>Code Editor</label>
//                   <select className="input-control" value={selectedLanguage} onChange={(e) => setSelectedLanguage(e.target.value)} style={{ width: 'auto', padding: '4px 12px' }}>
//                     <option value="python">Python 3</option>
//                     <option value="javascript">JavaScript</option>
//                     <option value="cpp">C++</option>
//                   </select>
//                 </div>
                
//                 <textarea className="input-control" value={codeAnswer} onChange={(e) => setCodeAnswer(e.target.value)}
//                   placeholder="// Write your code solution here..."
//                   style={{ flexGrow: 1, fontFamily: 'monospace', minHeight: '300px', resize: 'vertical', background: '#0e111a', color: '#82aaff' }} />

//                 <div style={{ display: 'flex', gap: '12px' }}>
//                   <button onClick={handleRunCode} className="btn btn-secondary" style={{ flexGrow: 1 }} disabled={compiling}>
//                     <Cpu size={16} /> {compiling ? "Running..." : "Run Test Code"}
//                   </button>
//                   <button onClick={handleNextQuestion} className="btn btn-primary" style={{ flexGrow: 1 }}>
//                     Submit Code Answer <ArrowRight size={16} />
//                   </button>
//                 </div>
//               </div>

//               {/* Right Column: Execution stdout console & webcam widget */}
//               <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
//                 {/* Webcam feedback during coding */}
//                 <div className="glass-card" style={{ padding: 0, overflow: 'hidden', height: '140px', position: 'relative' }}>
//                   <video ref={videoPreviewRef} style={{ width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
//                 </div>

//                 {/* Console */}
//                 <div className="glass-card" style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
//                   <label className="input-label">Output Console</label>
//                   <pre style={{
//                     flexGrow: 1, background: '#090d16', borderRadius: '8px', padding: '12px',
//                     fontFamily: 'monospace', fontSize: '0.85rem', color: '#10b981', overflow: 'auto', whiteSpace: 'pre-wrap'
//                   }}>
//                     {codeOutput || "No compilation stdout. Run test code to check outputs."}
//                   </pre>
//                 </div>
//               </div>
//             </div>
//           ) : (
//             /* Traditional Q&A Speech-to-Text workspace */
//             <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flexGrow: 1 }}>
//               <label className="input-label">Live Transcription Answer Box</label>
              
//               <textarea className="input-control" value={transcriptionText} readOnly
//                 placeholder="Microphone transcription will stream here automatically."
//                 style={{ flexGrow: 1, minHeight: '160px', resize: 'vertical', cursor: 'default' }} />

//               <div style={{ display: 'flex', gap: '12px' }}>
//                 <button onClick={() => speakAIQuestion(currentQuestionText)} className="btn btn-secondary">
//                   <Volume2 size={16} /> Repeat Question
//                 </button>
                
//                 <button onClick={handleNextQuestion} className="btn btn-primary" style={{ marginLeft: 'auto', padding: '12px 28px' }}>
//                   Next Question <ArrowRight size={16} />
//                 </button>
//               </div>
//             </div>
//           )}

//         </div>
//       </main>
//     </div>
//   )
// }

// export default InterviewPage
