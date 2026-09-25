import { useRef, useEffect } from 'react'
import Swal from 'sweetalert2'
import api from '../../utils/api'

export const SEGMENT_SILENCE_MS = 900

export const useInterviewMedia = ({
  sessionDetailRef,
  interviewIdRef,
  isSpeechRecordingRef,
  isTTSPlayingRef,
  candidateNameRef,
  interviewLanguageRef,
  handleScreenShareStop,
  formatCandidateName,
  setTranscriptionText,
  startOrRestartSpeechRecognition,
  startBackgroundNoiseMonitor,
  speakAIQuestion,
  setIsDisclaimerAccepted,
  setIsMediaReady,
  _sessionKey,
  questions,
  enableFullscreen,
  langMap
}) => {
  // Web Audio Mixer for Screen Recording
  const audioMixerCtxRef = useRef(null)
  const audioMixerDestRef = useRef(null)

  // Stream & Recorder references
  const videoPreviewRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const screenStreamRef = useRef(null)
  const cameraRecorderRef = useRef(null)
  const screenRecorderRef = useRef(null)
  const cameraChunksRef = useRef([])
  const screenChunksRef = useRef([])
  const recordedMimeTypeRef = useRef('video/webm')

  // Visualizer references
  const visualizerCanvasRef = useRef(null)
  const visualizerActiveRef = useRef(false)
  const visualizerAudioCtxRef = useRef(null)

  // Segmented Whisper STT references
  const whisperMediaRecorderRef = useRef(null)
  const whisperAudioChunksRef = useRef([])
  const whisperPauseTimeoutRef = useRef(null)
  const whisperFinalizedTranscriptRef = useRef('')
  const segmentRecorderRef = useRef(null)
  const segmentChunksRef = useRef([])
  const segmentHasSpeechRef = useRef(false)
  const segmentPeakRmsRef = useRef(0)
  const segmentStartTimeRef = useRef(0)
  const segmentCuttingRef = useRef(false)
  const segmentTranscribeChainRef = useRef(Promise.resolve())
  const liveInterimGhostRef = useRef('')
  const transcribeInFlightRef = useRef(false)

  const MIN_SEGMENT_MS = 700
  const SEGMENT_MIN_PEAK_RMS = 0.04

  // WebRTC Global Cleanup
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop())
      }
      if (audioMixerDestRef.current && audioMixerDestRef.current.stream) {
        audioMixerDestRef.current.stream.getTracks().forEach(t => { try { t.stop() } catch (_) { } })
      }
      if (audioMixerCtxRef.current && audioMixerCtxRef.current.state !== 'closed') {
        audioMixerCtxRef.current.close().catch(() => { })
      }
      if (visualizerAudioCtxRef.current && visualizerAudioCtxRef.current.state !== 'closed') {
        visualizerAudioCtxRef.current.close().catch(() => { })
      }
    }
  }, [])

  // Audio Visualizer
  const visualizeAudio = (stream) => {
    const canvas = visualizerCanvasRef.current
    if (!canvas) return

    if (visualizerAudioCtxRef.current) {
      visualizerAudioCtxRef.current.close().catch(() => { })
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
        const rect = canvas.getBoundingClientRect()
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width
          canvas.height = rect.height
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const barWidth = (canvas.width / bufferLength) * 2.5
        let barHeight
        let x = 0

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * canvas.height

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0)
          gradient.addColorStop(0, "rgba(99, 102, 241, 0.2)")
          gradient.addColorStop(0.5, "rgba(168, 85, 247, 0.6)")
          gradient.addColorStop(1, "rgba(236, 72, 153, 0.9)")

          ctx.fillStyle = gradient
          ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight)

          x += barWidth + 2
        }
      }

      draw()
    } catch (e) {
      console.error("Audio visualizer initialization error:", e)
    }
  }

  // ── Segmented Whisper Capture System ──
  const startSegmentedWhisperCapture = (stream) => {
    if (!stream || stream.getAudioTracks().length === 0) return
    whisperFinalizedTranscriptRef.current = ''
    liveInterimGhostRef.current = ''
    segmentHasSpeechRef.current = false
    segmentPeakRmsRef.current = 0
    beginNewSegment(stream)
  }

  const beginNewSegment = (stream) => {
    try {
      if (segmentRecorderRef.current && segmentRecorderRef.current.state !== 'inactive') {
        try { segmentRecorderRef.current.stop() } catch (_) { }
      }
      segmentChunksRef.current = []
      segmentHasSpeechRef.current = false
      segmentPeakRmsRef.current = 0
      segmentStartTimeRef.current = Date.now()

      const audioStream = new MediaStream(stream.getAudioTracks())
      const mimeCandidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
      const mime = mimeCandidates.find(v => {
        try { return MediaRecorder.isTypeSupported(v) } catch (_) { return false }
      }) || ''
      const mr = new MediaRecorder(audioStream, mime ? { mimeType: mime } : undefined)
      mr.ondataavailable = e => {
        if (e.data && e.data.size > 0) segmentChunksRef.current.push(e.data)
      }
      mr.start(250) // small timeslice so cuts are near-instant
      segmentRecorderRef.current = mr
    } catch (err) {
      console.warn('[STT] Failed to start segment recorder:', err)
    }
  }

  // Called by the VAD tick() when candidate speaks (marks segment as non-empty)
  const markSegmentHasSpeech = () => {
    segmentHasSpeechRef.current = true
  }

  // Called by the VAD tick() after SEGMENT_SILENCE_MS of silence following speech
  const cutCurrentSegment = (stream) => {
    if (segmentCuttingRef.current) return
    if (!segmentHasSpeechRef.current) return // nothing to send
    if (Date.now() - segmentStartTimeRef.current < MIN_SEGMENT_MS) return
    if (!segmentRecorderRef.current || segmentRecorderRef.current.state === 'inactive') return

    segmentCuttingRef.current = true
    const recorder = segmentRecorderRef.current
    const chunksSnapshot = segmentChunksRef.current

    const finish = () => {
      segmentCuttingRef.current = false
      // Immediately start the next segment so we never miss audio
      if (isSpeechRecordingRef.current) beginNewSegment(stream)
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksSnapshot, { type: 'audio/webm' })
      const hadRealSpeech = segmentPeakRmsRef.current >= SEGMENT_MIN_PEAK_RMS
      if (blob.size < 2500 || !hadRealSpeech) { finish(); return } // silence/noise — never send to Whisper
      // Serialize transcription calls so results commit in spoken order
      segmentTranscribeChainRef.current = segmentTranscribeChainRef.current
        .then(() => transcribeSegment(blob))
        .catch(err => console.warn('[STT] Segment transcription failed:', err))
      finish()
    }
    try { recorder.stop() } catch (_) { finish() }
  }

  const transcribeSegment = async (blob) => {
    // Hard gate: if TTS is playing by the time this resolves, discard the segment
    if (isTTSPlayingRef.current) return
    try {
      const fd = new FormData()
      fd.append('file', blob, 'segment.webm')
      const currentLangName = sessionDetailRef.current?.language || interviewLanguageRef?.current || 'English'
      const langCode = (langMap?.[currentLangName] || 'en-US').split('-')[0]
      const rawTerms = [
        sessionDetailRef.current?.company_name,
        sessionDetailRef.current?.company,
        sessionDetailRef.current?.role,
        sessionDetailRef.current?.job_role,
        sessionDetailRef.current?.interview_title,
        ...(Array.isArray(sessionDetailRef.current?.skills) ? sessionDetailRef.current.skills : (sessionDetailRef.current?.skills ? sessionDetailRef.current.skills.split(',') : [])),
        ...(Array.isArray(sessionDetailRef.current?.known_terms) ? sessionDetailRef.current.known_terms : [])
      ].filter(Boolean).map(s => String(s).trim()).filter(s => s.length > 1)
      const cleanKnownTerms = Array.from(new Set(rawTerms)).join(', ')
      if (cleanKnownTerms) {
        fd.append('prompt', cleanKnownTerms)
      }
      fd.append('language', langCode)

      const resp = await api.post('/speech-to-text-whisper', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 10000,
      })

      // Second check: discard result if TTS fired while we were waiting for Whisper
      if (isTTSPlayingRef.current) return

      const segmentText = (resp.data?.text || '').trim()
      if (!segmentText) return

      // Whisper often hallucinates these phrases when fed background noise
      const lower = segmentText.toLowerCase()
      if (
        lower === 'thank you.' ||
        lower === 'thanks for watching!' ||
        lower === 'you' ||
        lower === 'bye.' ||
        lower.startsWith('subtitles by') ||
        lower.startsWith('transcript by')
      ) return

      // Merge newly transcribed segment text with already committed transcript
      const prev = whisperFinalizedTranscriptRef.current
      const merged = mergeSegmentChunks(prev, segmentText)
      whisperFinalizedTranscriptRef.current = merged

      // Clear the ghost interim text once committed Whisper catches up
      liveInterimGhostRef.current = ''
      setTranscriptionText(formatCandidateName(merged, candidateNameRef.current))
    } catch (err) {
      console.warn('[STT] Whisper segment transcribe error:', err?.message)
    }
  }

  // ── Merge consecutive Whisper segment chunks ──
  const mergeSegmentChunks = (prev, next) => {
    if (!prev) return next
    if (!next) return prev

    const prevWords = prev.trim().split(/\s+/)
    const nextWords = next.trim().split(/\s+/)

    // Check for overlap: does the tail of prev match the head of next?
    const maxOverlap = Math.min(prevWords.length, nextWords.length, 6)
    for (let k = maxOverlap; k >= 1; k--) {
      const prevTail = prevWords.slice(-k).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      const nextHead = nextWords.slice(0, k).map(w => w.toLowerCase().replace(/[^a-z0-9]/g, ''))
      if (prevTail.join(' ') === nextHead.join(' ')) {
        // Overlap found — slice off the duplicate words from next
        const remainingNext = nextWords.slice(k).join(' ')
        return remainingNext ? `${prev} ${remainingNext}` : prev
      }
    }

    // No overlap detected — plain append with a space
    return prev + ' ' + next
  }

  // Flushes any in-progress segment and waits for all pending Whisper calls
  const flushWhisperTranscription = async () => {
    if (segmentRecorderRef.current && segmentRecorderRef.current.state !== 'inactive') {
      const recorder = segmentRecorderRef.current
      const chunksSnapshot = segmentChunksRef.current
      const hadSpeech = segmentHasSpeechRef.current && (segmentPeakRmsRef.current >= SEGMENT_MIN_PEAK_RMS)
      await new Promise(resolve => {
        recorder.onstop = () => {
          if (hadSpeech) {
            const blob = new Blob(chunksSnapshot, { type: 'audio/webm' })
            segmentTranscribeChainRef.current = segmentTranscribeChainRef.current
              .then(() => transcribeSegment(blob))
              .catch(err => console.warn('[STT] Flush transcribe failed:', err))
          }
          resolve()
        }
        try { recorder.stop() } catch (_) { resolve() }
      })
    }
    // Wait for all queued segment transcriptions to settle
    try {
      await segmentTranscribeChainRef.current
    } catch (_) { }
    return whisperFinalizedTranscriptRef.current.trim()
  }

  const promptScreenShare = async () => {
    if (enableFullscreen) enableFullscreen()
    setTimeout(setupMedia, 500)
  }

  const setupMedia = async () => {
    try {
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 720 }, height: { ideal: 1280 }, frameRate: 15 },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
      } catch (err) {
        console.error("Camera/Mic getUserMedia error:", err)
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw new Error("webcam_mic_not_found", { cause: err })
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("webcam_mic_denied", { cause: err })
        } else {
          throw new Error(`webcam_mic_failed: ${err.message || err.name}`, { cause: err })
        }
      }

      const shouldRecordVideo = sessionDetailRef.current?.record_video !== false;

      let screenStream = null;
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: "monitor", frameRate: 15 },
          audio: false
        })
      } catch (err) {
        console.error("Screen Share getDisplayMedia error:", err)
        stream.getTracks().forEach(t => t.stop())
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw new Error("screenshare_denied", { cause: err })
        } else {
          throw new Error(`screenshare_failed: ${err.message || err.name}`, { cause: err })
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

      if (shouldRecordVideo) {
        const track = screenStream.getVideoTracks()[0]
        track.onended = () => {
          if (handleScreenShareStop) handleScreenShareStop()
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

        // Resume AudioContext if suspended
        if (audioMixerCtxRef.current && audioMixerCtxRef.current.state === 'suspended') {
          try { await audioMixerCtxRef.current.resume() } catch (_) { }
        }
      }

      // Determine cross-browser supported video MIME type
      const getSupportedMimeType = () => {
        if (typeof MediaRecorder === 'undefined') return 'video/webm'
        const candidates = [
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
          'video/mp4;codecs=avc1,mp4a',
          'video/mp4'
        ]
        for (const c of candidates) {
          try {
            if (MediaRecorder.isTypeSupported(c)) return c
          } catch (_) { }
        }
        return 'video/webm'
      }

      const mimeType = getSupportedMimeType()
      recordedMimeTypeRef.current = mimeType
      console.log(`[REC_TRACE] Stream initialized. Video tracks: ${stream.getVideoTracks().length}, Audio tracks: ${stream.getAudioTracks().length}. Screen video tracks: ${screenStream ? screenStream.getVideoTracks().length : 0}. Selected mimeType: ${mimeType}`)

      if (shouldRecordVideo) {
        let options = { mimeType, videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 }
        try {
          cameraRecorderRef.current = new MediaRecorder(stream, options)
        } catch (err) {
          console.warn("[REC_TRACE] Camera MediaRecorder options init failed, falling back to default:", err)
          cameraRecorderRef.current = new MediaRecorder(stream)
        }
        cameraChunksRef.current = []
        cameraRecorderRef.current.ondataavailable = e => {
          if (e.data && e.data.size > 0) {
            cameraChunksRef.current.push(e.data)
            console.log(`[REC_TRACE] Camera chunk received: ${e.data.size} bytes. Total chunks: ${cameraChunksRef.current.length}`)
          }
        }
        cameraRecorderRef.current.onerror = e => console.error("[REC_TRACE] Camera recorder error:", e)

        try {
          screenRecorderRef.current = new MediaRecorder(screenStream, options)
        } catch (err) {
          console.warn("[REC_TRACE] Screen MediaRecorder options init failed, falling back to default:", err)
          screenRecorderRef.current = new MediaRecorder(screenStream)
        }
        screenChunksRef.current = []
        screenRecorderRef.current.ondataavailable = e => {
          if (e.data && e.data.size > 0) {
            screenChunksRef.current.push(e.data)
            console.log(`[REC_TRACE] Screen chunk received: ${e.data.size} bytes. Total chunks: ${screenChunksRef.current.length}`)
          }
        }
        screenRecorderRef.current.onerror = e => console.error("[REC_TRACE] Screen recorder error:", e)

        cameraRecorderRef.current.start(1000)
        screenRecorderRef.current.start(1000)
        console.log(`[REC_TRACE] Recorders started. Camera state: ${cameraRecorderRef.current.state}, Screen state: ${screenRecorderRef.current.state}`)
      } else {
        console.log(`[REC_TRACE] Video recording is disabled for this session. Skipping MediaRecorder initialization.`)
      }

      if (enableFullscreen) enableFullscreen()

      isSpeechRecordingRef.current = true
      if (startOrRestartSpeechRecognition) startOrRestartSpeechRecognition()
      if (startBackgroundNoiseMonitor) startBackgroundNoiseMonitor(stream)

      const savedSess = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null

      if (!savedSess?.accepted && questions?.length > 0 && speakAIQuestion) {
        speakAIQuestion(questions[0].text || questions[0].question || questions[0].prompt || '')
      }

      if (setIsDisclaimerAccepted) setIsDisclaimerAccepted(true)
      if (setIsMediaReady) setIsMediaReady(true)

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

  const restartScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "monitor", frameRate: 15 },
        audio: false
      })
      screenStreamRef.current = screenStream

      const track = screenStream.getVideoTracks()[0]
      track.onended = () => {
        if (handleScreenShareStop) handleScreenShareStop()
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

      const shouldRecordVideo = sessionDetailRef.current?.record_video !== false;
      if (shouldRecordVideo) {
        const mimeType = recordedMimeTypeRef.current || 'video/webm'
        let options = { mimeType, videoBitsPerSecond: 800000, audioBitsPerSecond: 64000 }
        try {
          screenRecorderRef.current = new MediaRecorder(screenStream, options)
        } catch (_) {
          screenRecorderRef.current = new MediaRecorder(screenStream)
        }
        if (!screenChunksRef.current) screenChunksRef.current = []
        screenRecorderRef.current.ondataavailable = e => {
          if (e.data && e.data.size > 0) screenChunksRef.current.push(e.data)
        }
        screenRecorderRef.current.onerror = e => console.error("Screen recorder error on restart:", e)
        screenRecorderRef.current.start(1000)
      } else {
        console.log(`[REC_TRACE] Video recording is disabled for this session. Skipping Screen MediaRecorder restart.`)
      }
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

  // Helper to cleanly stop media recorders asynchronously
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
      setTimeout(finish, 400)
    })
  }

  return {
    // Refs
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

    // Methods
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
  }
}
