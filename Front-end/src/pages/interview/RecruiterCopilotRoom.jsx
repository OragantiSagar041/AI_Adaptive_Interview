import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SkipForward,
  Send,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Clock,
  Sparkles,
  FileText,
  MonitorSmartphone,
  Volume2,
  ArrowLeft,
  Wifi,
  WifiOff,
  User,
  ExternalLink,
  Link2,
  Code2,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Users,
  EyeOff,
  Plus,
  Play,
  Terminal,
  BookOpen,
  Sliders,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Columns,
  LayoutGrid,
  X,
  Keyboard,
  Lightbulb,
  CheckCheck,
} from 'lucide-react'
import api from '../../utils/api'
import useBidirectionalCallWebRTC from '../../hooks/useBidirectionalCallWebRTC'

const RATING_OPTIONS = [
  {
    value: 'Correct',
    label: 'Correct',
    score: 100,
    icon: CheckCircle2,
    activeCls: 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/40',
    idleCls: 'bg-slate-800/80 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/15',
  },
  {
    value: 'Partial',
    label: 'Partial',
    score: 50,
    icon: AlertTriangle,
    activeCls: 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-950/40',
    idleCls: 'bg-slate-800/80 text-amber-300 border-amber-500/30 hover:bg-amber-500/15',
  },
  {
    value: 'Incorrect',
    label: 'Incorrect',
    score: 0,
    icon: XCircle,
    activeCls: 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-950/40',
    idleCls: 'bg-slate-800/80 text-rose-300 border-rose-500/30 hover:bg-rose-500/15',
  },
  {
    value: 'Skip',
    label: 'Skip',
    score: null,
    icon: SkipForward,
    activeCls: 'bg-slate-600 text-white border-slate-500',
    idleCls: 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700',
  },
]

const RECOMMENDATIONS = ['Strongly Recommend', 'Recommend', 'Hold', 'Reject']

function formatElapsed(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function toSafeQId(id, fallback = 1) {
  if (id == null || id === '') return fallback
  const n = Number(id)
  return isNaN(n) ? String(id) : n
}

export function checkIsCodingQuestion(q) {
  if (!q) return false
  return Boolean(
    q.question_type === 'coding' ||
    q.coding_task ||
    q.code ||
    q.starter_code ||
    String(q.category || '').toLowerCase().includes('coding') ||
    String(q.question || '').toLowerCase().includes('coding challenge') ||
    String(q.question || '').toLowerCase().includes('live coding')
  )
}

export function checkIsCaseStudyQuestion(q) {
  if (!q) return false
  return Boolean(
    q.question_type === 'case_study' ||
    q.case_study ||
    String(q.category || '').toLowerCase().includes('case study') ||
    String(q.question || '').toLowerCase().includes('case study')
  )
}

export default function RecruiterCopilotRoom() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const reduxToken = useSelector((state) => state.auth?.token)
  const userRole = useSelector(
    (state) =>
      state.auth?.role ||
      state.auth?.adminUser?.role ||
      state.auth?.user?.role ||
      localStorage.getItem('adminRole') ||
      ''
  )
  const authToken =
    reduxToken ||
    localStorage.getItem('adminToken') ||
    localStorage.getItem('superadminToken') ||
    localStorage.getItem('masterToken') ||
    localStorage.getItem('token') ||
    ''

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [sessionData, setSessionData] = useState(null)
  const [interviewId, setInterviewId] = useState('')
  const [questions, setQuestions] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [evaluationsMap, setEvaluationsMap] = useState({})
  const [overallNotes, setOverallNotes] = useState('')
  const [recommendation, setRecommendation] = useState('Recommend')

  const [showModelAnswer, setShowModelAnswer] = useState(false)
  const [showProfileDrawer, setShowProfileDrawer] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedResult, setSubmittedResult] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [pushedQuestionId, setPushedQuestionId] = useState(null)
  const [copiedInvite, setCopiedInvite] = useState(false)

  // Infinite Question Generation states
  const [generatingMore, setGeneratingMore] = useState(false)
  const [genNotice, setGenNotice] = useState('')

  // Live Proctoring & Security Radar states
  const [candidateTelemetry, setCandidateTelemetry] = useState({
    agentConnected: false,
    alerts: 0,
    faceVisible: true,
    multiFace: false,
    phoneDetected: false,
    eyeContactLost: false,
    screenCastingDetected: false,
    detectedPlatforms: [],
    lastAlert: '',
  })
  const [alertTimeline, setAlertTimeline] = useState([])
  const [showRadarDrawer, setShowRadarDrawer] = useState(false)

  // Live Candidate Code Streaming states
  const [liveCandidateCode, setLiveCandidateCode] = useState({
    code: '',
    language: 'python',
    lastUpdated: '',
  })
  const [liveCandidateRunResult, setLiveCandidateRunResult] = useState(null)
  const [candidateWorkspaceActive, setCandidateWorkspaceActive] = useState(false)

  // Candidate Live Screen Sharing states
  const [activeMediaView, setActiveMediaView] = useState('camera') // 'camera' | 'screen'
  const [candidateScreenShared, setCandidateScreenShared] = useState(false)
  const remoteScreenVideoRef = useRef(null)

  // 2-Way Screen Layout & Adjustment Options
  const [screenSplit, setScreenSplit] = useState('wide-video') // 'wide-video' (7:5 / ~60%) | 'balanced' (5:7) | 'compact-video' (4:8)
  const [videoLayoutMode, setVideoLayoutMode] = useState('pip') // 'pip' | 'side-by-side'
  const [candidatePipPos, setCandidatePipPos] = useState('top-right') // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'hidden'
  const [candidatePipCoords, setCandidatePipCoords] = useState(null) // { x: number, y: number } in px when freely dragged
  const [candidatePipCollapsed, setCandidatePipCollapsed] = useState(false)
  const isDraggingCandidatePipRef = useRef(false)
  const candidatePipDragStartRef = useRef({ startX: 0, startY: 0, elemX: 0, elemY: 0 })
  const candidatePipTileRef = useRef(null)
  const videoStageContainerRef = useRef(null)
  const [recruiterPipPos, setRecruiterPipPos] = useState('bottom-right') // 'bottom-right' | 'top-right' | 'bottom-left' | 'top-left' | 'hidden'
  const [pipScale, setPipScale] = useState('normal') // 'small' | 'normal' | 'large'
  const [isTheaterMode, setIsTheaterMode] = useState(false)
  const [showAdjustPanel, setShowAdjustPanel] = useState(false)
  const [screenFit, setScreenFit] = useState('contain') // 'contain' | 'cover'

  // Question Pacing timer & Time Budget Helper
  const [questionElapsed, setQuestionElapsed] = useState(0)

  // 1-Click Hint state
  const [hintSentNotice, setHintSentNotice] = useState('')

  // Pro-Shortcuts & End-Interview Modals
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showEndInterviewModal, setShowEndInterviewModal] = useState(false)

  // Instant Real-Time Alert Toast notification
  const [activeAlertToast, setActiveAlertToast] = useState(null)

  const getPipPosClass = (pos) => {
    switch (pos) {
      case 'top-left':
        return 'top-3 left-3'
      case 'top-right':
        return 'top-3 right-3'
      case 'bottom-right':
        return 'bottom-3 right-3'
      case 'hidden':
        return 'hidden'
      case 'bottom-left':
      default:
        return 'bottom-3 left-3'
    }
  }

  const getPipSizeClass = (size) => {
    switch (size) {
      case 'small':
        return 'w-24 sm:w-28'
      case 'large':
        return 'w-44 sm:w-56'
      case 'normal':
      default:
        return 'w-32 sm:w-40'
    }
  }

  // Draggable Candidate PiP Camera Tile Handlers
  const handleCandidatePipDragStart = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    isDraggingCandidatePipRef.current = true

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    const rect = candidatePipTileRef.current?.getBoundingClientRect()
    const parentRect = videoStageContainerRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }

    const curX = rect ? rect.left - parentRect.left : 10
    const curY = rect ? rect.top - parentRect.top : 10

    candidatePipDragStartRef.current = {
      startX: clientX,
      startY: clientY,
      elemX: curX,
      elemY: curY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      elemWidth: rect?.width || 200,
      elemHeight: rect?.height || 130,
    }

    const onMove = (moveEvent) => {
      if (!isDraggingCandidatePipRef.current) return
      const curMouseX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX
      const curMouseY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY

      const deltaX = curMouseX - candidatePipDragStartRef.current.startX
      const deltaY = curMouseY - candidatePipDragStartRef.current.startY

      let newX = candidatePipDragStartRef.current.elemX + deltaX
      let newY = candidatePipDragStartRef.current.elemY + deltaY

      const maxX = Math.max(10, candidatePipDragStartRef.current.parentWidth - candidatePipDragStartRef.current.elemWidth - 10)
      const maxY = Math.max(10, candidatePipDragStartRef.current.parentHeight - candidatePipDragStartRef.current.elemHeight - 10)

      newX = Math.max(10, Math.min(newX, maxX))
      newY = Math.max(10, Math.min(newY, maxY))

      setCandidatePipCoords({ x: newX, y: newY })
    }

    const onEnd = () => {
      isDraggingCandidatePipRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onEnd)
  }, [])

  // WebRTC & Local A/V states
  const [externalCallMode, setExternalCallMode] = useState(false)
  const [externalMeetingUrl, setExternalMeetingUrl] = useState('')
  const [externalUrlInput, setExternalUrlInput] = useState('')
  const [savingExternalMeeting, setSavingExternalMeeting] = useState(false)
  const [externalMeetingNotice, setExternalMeetingNotice] = useState('')
  const [localStream, setLocalStream] = useState(null)
  const [micMuted, setMicMuted] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [camOff, setCamOff] = useState(false)
  const [mediaWarning, setMediaWarning] = useState('')
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [remoteVideoHasFrames, setRemoteVideoHasFrames] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  const mountedRef = useRef(true)
  const mediaReqIdRef = useRef(0)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const remoteAudioSigRef = useRef('')
  const pillsContainerRef = useRef(null)
  const activePillRef = useRef(null)

  // Auto-scroll active question pill into center view when activeIndex changes
  useEffect(() => {
    if (activePillRef.current) {
      activePillRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeIndex])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      mediaReqIdRef.current += 1
    }
  }, [])

  const stopLocalMedia = useCallback(() => {
    mediaReqIdRef.current += 1
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch (_) {}
      })
      localStreamRef.current = null
      setLocalStream(null)
    }
  }, [])

  const acquireLocalMedia = useCallback(async () => {
    setMediaWarning('')
    stopLocalMedia()
    const reqId = ++mediaReqIdRef.current

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!mountedRef.current || reqId !== mediaReqIdRef.current) return null
      setCamOff(true)
      setMicMuted(true)
      setMediaWarning(
        'Camera/Mic requires HTTPS or localhost. Open Cockpit via http://localhost:5173 or HTTPS.'
      )
      return null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      if (!mountedRef.current || reqId !== mediaReqIdRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return null
      }
      const hasAudio = stream.getAudioTracks().some((t) => t.readyState === 'live')
      localStreamRef.current = stream
      setLocalStream(stream)
      setMicMuted(!hasAudio)
      setCamOff(false)
      if (!hasAudio) {
        setMediaWarning('No microphone detected or mic permission denied. Click Unmute or allow microphone access.')
      }
      return stream
    } catch (err) {
      if (!mountedRef.current || reqId !== mediaReqIdRef.current) return null
      console.warn('[RecruiterCopilot] Video+Audio failed, trying audio-only fallback:', err)
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        if (!mountedRef.current || reqId !== mediaReqIdRef.current) {
          audioOnly.getTracks().forEach((t) => t.stop())
          return null
        }
        localStreamRef.current = audioOnly
        setLocalStream(audioOnly)
        setCamOff(true)
        setMicMuted(false)
        setMediaWarning('Camera unavailable — running with microphone audio only.')
        return audioOnly
      } catch (audioErr) {
        if (!mountedRef.current || reqId !== mediaReqIdRef.current) return null
        try {
          const videoOnly = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          })
          if (!mountedRef.current || reqId !== mediaReqIdRef.current) {
            videoOnly.getTracks().forEach((t) => t.stop())
            return null
          }
          localStreamRef.current = videoOnly
          setLocalStream(videoOnly)
          setCamOff(false)
          setMicMuted(true)
          setMediaWarning('Microphone unavailable or blocked. Allow microphone permission in browser bar to speak.')
          return videoOnly
        } catch (videoErr) {
          if (!mountedRef.current || reqId !== mediaReqIdRef.current) return null
          setCamOff(true)
          setMicMuted(true)
          setMediaWarning('Mic/Camera blocked. Allow permissions or switch to External Call Mode (Zoom/Meet).')
          return null
        }
      }
    }
  }, [stopLocalMedia])

  const toggleMic = useCallback(async () => {
    const stream = localStreamRef.current
    const liveAudioTracks = stream ? stream.getAudioTracks().filter((t) => t.readyState === 'live') : []

    if (liveAudioTracks.length === 0) {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
        const existingTracks = stream ? stream.getVideoTracks().filter((t) => t.readyState === 'live') : []
        const combined = new MediaStream([...existingTracks, ...audioStream.getAudioTracks()])
        localStreamRef.current = combined
        setLocalStream(combined)
        setMicMuted(false)
        setMediaWarning('')
      } catch (err) {
        setMicMuted(true)
        setMediaWarning('Microphone access blocked or no microphone found. Check browser site permissions.')
      }
      return
    }

    const next = !micMuted
    liveAudioTracks.forEach((t) => {
      t.enabled = !next
    })
    setMicMuted(next)
  }, [micMuted])

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current
    if (!stream) return
    const next = !camOff
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !next
    })
    setCamOff(next)
  }, [camOff])

  // Load cheat-sheet questions & saved state
  useEffect(() => {
    if (!sessionId) {
      setLoadError('Missing session ID.')
      setLoading(false)
      return
    }
    let cancelled = false
    const fetchCockpitData = async () => {
      try {
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
        const { data } = await api.get(`/recruiter/session/${sessionId}/questions`, { headers })
        if (cancelled) return

        setSessionData(data)
        setInterviewId(data.interview_id || sessionId)
        const initialExtUrl = data.external_meeting_url || ''
        const initialExtMode = Boolean(data.external_call_mode || initialExtUrl)
        setExternalMeetingUrl(initialExtUrl)
        setExternalUrlInput(initialExtUrl)
        setExternalCallMode(initialExtMode)
        const qList = Array.isArray(data.questions) ? data.questions : []
        const isNonTech = String(data.interview_type || '').toLowerCase().includes('non-tech') || String(data.interview_type || '').toLowerCase().includes('case')
        const sanitizedQList = isNonTech ? qList.filter((q) => !checkIsCodingQuestion(q)) : qList
        setQuestions(sanitizedQList)
        setActiveIndex(
          Math.min(Math.max(0, Number(data.active_question_index || 0)), Math.max(0, qList.length - 1))
        )
        setOverallNotes(data.overall_notes || '')
        if (data.overall_recommendation) {
          setRecommendation(data.overall_recommendation)
        }

        const evalMap = {}
        ;(data.evaluations || []).forEach((ev) => {
          if (ev && ev.question_id != null) {
            const safeQId = toSafeQId(ev.question_id, 0)
            evalMap[safeQId] = {
              question_id: safeQId,
              question: ev.question || '',
              rating: ev.rating || 'Skip',
              notes: ev.notes || '',
            }
          }
        })
        setEvaluationsMap(evalMap)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err.response?.data?.detail || err.message || 'Failed to load Recruiter Cockpit.'
        )
        setLoading(false)
      }
    }

    fetchCockpitData()
    return () => {
      cancelled = true
    }
  }, [sessionId, authToken, retryKey])

  // Acquire / release media when External Call Mode toggles
  useEffect(() => {
    if (loading || loadError || submittedResult) return
    if (externalCallMode) {
      stopLocalMedia()
    } else {
      acquireLocalMedia()
    }
    return () => {
      stopLocalMedia()
    }
  }, [externalCallMode, loading, loadError, submittedResult, acquireLocalMedia, stopLocalMedia])

  // Elapsed timer
  useEffect(() => {
    if (loading || loadError || submittedResult) return
    const t = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [loading, loadError, submittedResult])

  // Receive telemetry, alerts, and live candidate code updates via WebSocket
  const handleCustomMessage = useCallback((msg) => {
    if (!msg) return

    if (msg.type === 'telemetry') {
      const data = msg.data || {}
      const pStatus = data.proctoring_status || {}
      setCandidateTelemetry((prev) => ({
        ...prev,
        alerts: data.proctoring_alerts ?? prev.alerts,
        agentConnected: pStatus.agentConnected ?? prev.agentConnected,
        faceVisible: pStatus.faceVisible ?? prev.faceVisible,
        multiFace: pStatus.multiFace ?? prev.multiFace,
        phoneDetected: pStatus.phoneDetected ?? prev.phoneDetected,
        eyeContactLost: pStatus.eyeContactLost ?? prev.eyeContactLost,
        screenCastingDetected: pStatus.screenCastingDetected ?? prev.screenCastingDetected,
        detectedPlatforms: pStatus.detectedPlatforms || prev.detectedPlatforms,
        lastAlert: pStatus.lastAlertType || prev.lastAlert,
      }))
    } else if (msg.type === 'candidate_proctoring_alert') {
      const alert = msg.alert || {}
      const timeStr = msg.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      const alertMessage = alert.message || alert.type || 'Proctoring alert triggered by candidate.'
      const alertEvent = {
        id: Date.now() + Math.random(),
        type: alert.type || 'violation',
        message: alertMessage,
        count: alert.count || 1,
        timestamp: timeStr,
        lastSeen: Date.now(),
      }
      setAlertTimeline((prev) => {
        const last = prev[0]
        // If the same alert type/message arrived consecutively, increment count and refresh timestamp
        if (last && (last.message === alertMessage || last.type === alertEvent.type)) {
          const updated = {
            ...last,
            count: (last.count || 1) + 1,
            timestamp: timeStr,
            lastSeen: Date.now(),
          }
          return [updated, ...prev.slice(1, 15)]
        }
        return [alertEvent, ...prev.slice(0, 14)]
      })
      setCandidateTelemetry((prev) => ({
        ...prev,
        alerts: (prev.alerts || 0) + 1,
        lastAlert: alertMessage,
      }))
      setActiveAlertToast({
        id: Date.now(),
        message: alertMessage,
        timestamp: timeStr,
      })
      setTimeout(() => {
        setActiveAlertToast((cur) => (cur?.timestamp === timeStr ? null : cur))
      }, 6000)
    } else if (msg.type === 'code_update') {
      setCandidateWorkspaceActive(true)
      setLiveCandidateCode({
        code: msg.code || '',
        language: msg.language || 'python',
        lastUpdated: new Date().toLocaleTimeString(),
      })
    } else if (msg.type === 'code_run_result') {
      setCandidateWorkspaceActive(true)
      setLiveCandidateRunResult({
        result: msg.result,
        output: msg.output || '',
        language: msg.language || 'python',
        timestamp: new Date().toLocaleTimeString(),
      })
    } else if (msg.type === 'candidate_screenshare_state') {
      setCandidateScreenShared(Boolean(msg.active))
      if (msg.active) {
        setActiveMediaView('screen')
      }
    }
  }, [])

  const {
    remoteStream,
    remoteScreenStream,
    hasRemoteScreen,
    remoteVideoActive,
    remoteAudioActive,
    wsConnected,
    peerConnected,
    callStatus,
    iceState,
    wsError,
    sendSignal,
    reconnectCall,
  } = useBidirectionalCallWebRTC({
    role: 'admin',
    linkId: sessionId,
    token: authToken,
    localStream,
    enabled: Boolean(authToken && !loading && !loadError && !submittedResult),
    mediaEnabled: !externalCallMode,
    onCustomMessage: handleCustomMessage,
  })

  // Auto-decay old alerts so the live ticker automatically clears without requiring manual scrolling
  useEffect(() => {
    const interval = setInterval(() => {
      setAlertTimeline((prev) => {
        if (prev.length === 0) return prev
        const now = Date.now()
        const filtered = prev.filter((a) => (a.lastSeen ? now - a.lastSeen < 30000 : true))
        return filtered.length === prev.length ? prev : filtered
      })
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Bind local PiP & remote video
  const bindLocalVideoRef = useCallback((el) => {
    localVideoRef.current = el
    if (!el) return
    const target = localStream || null
    if (el.srcObject !== target) {
      el.srcObject = target
    }
    el.muted = true
    if (target) {
      el.play?.().catch(() => {})
    }
  }, [localStream])

  useEffect(() => {
    const el = localVideoRef.current
    if (!el) return
    const target = localStream || null
    if (el.srcObject !== target) {
      el.srcObject = target
    }
    if (target) {
      el.play?.().catch(() => {})
    }
  }, [localStream, externalCallMode])

  // Bind remote candidate screen share stream
  useEffect(() => {
    const el = remoteScreenVideoRef.current
    if (!el) return
    const target = remoteScreenStream || null
    if (el.srcObject !== target) {
      el.srcObject = target
    }
    if (target) {
      el.play?.().catch(() => {})
    }
  }, [remoteScreenStream, activeMediaView])

  // Live local microphone input level meter
  useEffect(() => {
    const audioTrack = localStream?.getAudioTracks()?.find((t) => t.readyState === 'live')
    if (!audioTrack || micMuted || externalCallMode) {
      setMicLevel(0)
      return
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return

    let ctx = null
    let rafId = null
    try {
      ctx = new AudioCtx()
      const src = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        if (!mountedRef.current) return
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i += 1) sum += data[i]
        const avg = sum / data.length
        setMicLevel(Math.min(100, Math.round(avg * 1.8)))
        rafId = requestAnimationFrame(tick)
      }
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      tick()
    } catch (_) {
      setMicLevel(0)
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (ctx) ctx.close().catch(() => {})
    }
  }, [localStream, micMuted, externalCallMode])

  // Synchronous callback ref to attach candidate video to whatever video element mounts
  const bindCandidateVideoRef = useCallback((el) => {
    remoteVideoRef.current = el
    if (!el) return
    const target = remoteStream || null
    if (el.srcObject !== target) {
      el.srcObject = target
    }
    el.muted = true
    if (target) {
      el.play?.().catch(() => {})
    }
  }, [remoteStream])

  // Synchronous callback ref to attach candidate screen share to screen video element
  const bindCandidateScreenVideoRef = useCallback((el) => {
    remoteScreenVideoRef.current = el
    if (!el) return
    const target = remoteScreenStream || null
    if (el.srcObject !== target) {
      el.srcObject = target
    }
    el.muted = true
    if (target) {
      el.play?.().catch(() => {})
    }
  }, [remoteScreenStream])

  // Remote candidate video ONLY (kept muted so video frames never stall or abort audio)
  useEffect(() => {
    const el = remoteVideoRef.current
    if (!el) return
    if (!remoteStream) {
      if (el.srcObject !== null) {
        el.srcObject = null
      }
      setRemoteVideoHasFrames(false)
      return
    }
    if (el.srcObject !== remoteStream) {
      el.srcObject = remoteStream
    }
    el.muted = true
    el.play?.().catch(() => {})
  }, [remoteStream, externalCallMode, activeMediaView, videoLayoutMode, candidatePipPos, candidatePipCollapsed])

  // Dedicated remote candidate audio playback: DOM <audio> element + Web Audio API fallback
  useEffect(() => {
    const audioTracks = remoteStream
      ? remoteStream.getAudioTracks().filter((t) => t && t.readyState === 'live')
      : []

    if (externalCallMode || audioTracks.length === 0) {
      if (remoteAudioSigRef.current !== '') {
        remoteAudioSigRef.current = ''
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
      }
      setAudioBlocked(false)
      return
    }

    const sig = audioTracks.map((t) => t.id).sort().join('|')
    const audioEl = remoteAudioRef.current
    if (audioEl) {
      if (sig !== remoteAudioSigRef.current || !audioEl.srcObject) {
        remoteAudioSigRef.current = sig
        audioEl.srcObject = new MediaStream(audioTracks)
      }
      audioEl.muted = false
      audioEl.volume = 1.0
      const p = audioEl.play()
      if (p && typeof p.then === 'function') {
        p.then(() => {
          if (mountedRef.current) setAudioBlocked(false)
        }).catch((err) => {
          if (err?.name === 'NotAllowedError' && mountedRef.current) {
            setAudioBlocked(true)
          }
        })
      }
    }

    // Web Audio API pipeline
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    let audioCtx = null
    if (AudioCtx) {
      try {
        audioCtx = new AudioCtx()
        const mediaStream = new MediaStream(audioTracks)
        const source = audioCtx.createMediaStreamSource(mediaStream)
        source.connect(audioCtx.destination)
        if (audioCtx.state === 'suspended') {
          const resumeAudio = () => {
            audioCtx.resume().then(() => {
              if (mountedRef.current) setAudioBlocked(false)
            }).catch(() => {})
          }
          window.addEventListener('pointerdown', resumeAudio, { once: true })
          window.addEventListener('keydown', resumeAudio, { once: true })
          window.addEventListener('click', resumeAudio, { once: true })
        } else {
          if (mountedRef.current) setAudioBlocked(false)
        }
      } catch (err) {
        console.warn('[RecruiterCopilot] WebAudio notice:', err)
      }
    }

    return () => {
      if (audioCtx) audioCtx.close().catch(() => {})
    }
  }, [remoteStream, remoteAudioActive, externalCallMode])

  const unlockRemoteAudio = useCallback(() => {
    const audioEl = remoteAudioRef.current
    if (!audioEl) return
    audioEl.muted = false
    audioEl.volume = 1.0
    audioEl.play()
      .then(() => {
        if (mountedRef.current) setAudioBlocked(false)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!audioBlocked) return
    const onInteract = () => unlockRemoteAudio()
    window.addEventListener('pointerdown', onInteract, { once: true })
    window.addEventListener('keydown', onInteract, { once: true })
    return () => {
      window.removeEventListener('pointerdown', onInteract)
      window.removeEventListener('keydown', onInteract)
    }
  }, [audioBlocked, unlockRemoteAudio])

  const isNonTechnical = useMemo(() => {
    const t = String(sessionData?.interview_type || '').toLowerCase()
    return t.includes('non-technical') || t.includes('non technical') || t.includes('non_technical') || t.includes('case')
  }, [sessionData?.interview_type])

  const activeQuestion = questions[activeIndex] || null
  const activeQId = activeQuestion ? toSafeQId(activeQuestion.id, activeIndex + 1) : 0
  const isCodingQuestion = !isNonTechnical && checkIsCodingQuestion(activeQuestion)
  const isCaseStudyQuestion = isNonTechnical || checkIsCaseStudyQuestion(activeQuestion)
  const activeEval = evaluationsMap[activeQId] || {
    question_id: activeQId,
    question: activeQuestion?.question || '',
    rating: '',
    notes: '',
  }

  // Build ordered evaluation array + live deterministic score preview
  const evaluationList = useMemo(() => {
    return questions
      .map((q, idx) => {
        const qId = toSafeQId(q.id, idx + 1)
        const existing = evaluationsMap[qId]
        if (!existing || !existing.rating) return null
        return {
          question_id: qId,
          question: q.question || existing.question || '',
          rating: existing.rating,
          notes: existing.notes || '',
        }
      })
      .filter(Boolean)
  }, [questions, evaluationsMap])

  const liveScoreStats = useMemo(() => {
    const weights = { Correct: 100, Partial: 50, Incorrect: 0 }
    const scored = evaluationList.filter((e) => weights[e.rating] !== undefined)
    const avg =
      scored.length > 0
        ? Math.round((scored.reduce((sum, e) => sum + weights[e.rating], 0) / scored.length) * 10) / 10
        : null
    return {
      gradedCount: scored.length,
      totalEvaluated: evaluationList.length,
      score: avg,
    }
  }, [evaluationList])

  const triggerAutoSave = useCallback(
    async (nextIndex, nextMap = evaluationsMap, nextNotes = overallNotes) => {
      if (!interviewId) return
      const payloadList = questions
        .map((q, idx) => {
          const qId = toSafeQId(q.id, idx + 1)
          const ev = nextMap[qId]
          if (!ev || !ev.rating) return null
          return {
            question_id: qId,
            question: q.question || '',
            rating: ev.rating,
            notes: ev.notes || '',
          }
        })
        .filter(Boolean)

      setAutoSaveStatus('Saving...')
      try {
        const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
        await api.post(
          `/interview/${interviewId}/auto-save-progress`,
          {
            active_question_index: nextIndex,
            evaluations: payloadList,
            overall_notes: nextNotes,
          },
          { headers }
        )
        setAutoSaveStatus(
          `Saved ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        )
      } catch (err) {
        console.warn('[RecruiterCopilot] Auto-save failed:', err)
        setAutoSaveStatus('Autosave retrying...')
      }
    },
    [interviewId, questions, evaluationsMap, overallNotes, authToken]
  )

  const handleSelectRating = useCallback((ratingValue) => {
    if (!activeQuestion) return
    const updatedMap = {
      ...evaluationsMap,
      [activeQId]: {
        question_id: activeQId,
        question: activeQuestion.question || '',
        rating: ratingValue,
        notes: activeEval.notes || '',
      },
    }
    setEvaluationsMap(updatedMap)
    triggerAutoSave(activeIndex, updatedMap, overallNotes)
  }, [activeQuestion, activeQId, activeEval.notes, evaluationsMap, triggerAutoSave, activeIndex, overallNotes])

  const handleQuestionNotesChange = useCallback((val) => {
    if (!activeQuestion) return
    setEvaluationsMap((prev) => ({
      ...prev,
      [activeQId]: {
        question_id: activeQId,
        question: activeQuestion.question || '',
        rating: prev[activeQId]?.rating || 'Skip',
        notes: val,
      },
    }))
  }, [activeQuestion, activeQId])

  // Infinite Question Generation Handler
  const generatingMoreRef = useRef(false)
  const autoGenLastLengthRef = useRef(0)

  const handleGenerateMoreQuestions = useCallback(async (count = 5) => {
    if (generatingMoreRef.current || generatingMore || !sessionId) return
    generatingMoreRef.current = true
    setGeneratingMore(true)
    setGenNotice('')
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const { data } = await api.post(
        `/recruiter/session/${sessionId}/generate-more-questions`,
        { count, num_questions: count },
        { headers }
      )
      if (data?.questions && Array.isArray(data.questions)) {
        const isNonTech = String(sessionData?.interview_type || '').toLowerCase().includes('non-tech') || String(sessionData?.interview_type || '').toLowerCase().includes('case')
        const sanitizedDataQuestions = isNonTech ? data.questions.filter((q) => !checkIsCodingQuestion(q)) : data.questions
        const added = data.added_count ?? Math.max(0, sanitizedDataQuestions.length - questions.length)
        setQuestions(sanitizedDataQuestions)
        setGenNotice(
          added > 0
            ? `Added ${added} new unique question${added === 1 ? '' : 's'} to the cheat sheet!`
            : 'No additional unique questions available right now.'
        )
        setTimeout(() => setGenNotice(''), 3500)
      }
    } catch (err) {
      setGenNotice(err.response?.data?.detail || 'Failed to generate more questions.')
      setTimeout(() => setGenNotice(''), 4000)
    } finally {
      generatingMoreRef.current = false
      setGeneratingMore(false)
    }
  }, [generatingMore, sessionId, authToken, questions.length])

  // Pre-emptive infinite question generation trigger when reaching near the end (at most once per list length)
  useEffect(() => {
    if (
      questions.length > 0 &&
      activeIndex >= questions.length - 2 &&
      questions.length < 40 &&
      !generatingMore &&
      !generatingMoreRef.current &&
      autoGenLastLengthRef.current !== questions.length
    ) {
      autoGenLastLengthRef.current = questions.length
      handleGenerateMoreQuestions(4)
    }
  }, [activeIndex, questions.length, generatingMore, handleGenerateMoreQuestions])

  const goToQuestion = useCallback((nextIdx) => {
    if (nextIdx < 0 || nextIdx >= questions.length) return
    setActiveIndex(nextIdx)
    setShowModelAnswer(false)
    triggerAutoSave(nextIdx, evaluationsMap, overallNotes)
  }, [questions.length, triggerAutoSave, evaluationsMap, overallNotes])

  // Push standard discussion question
  const handlePushQuestion = useCallback((targetQ) => {
    const q = targetQ && typeof targetQ === 'object' && targetQ.question ? targetQ : activeQuestion
    if (!q) return
    const qIndex = targetQ && typeof targetQ === 'object' ? questions.indexOf(targetQ) : activeIndex
    const qId = toSafeQId(q.id, (qIndex >= 0 ? qIndex : activeIndex) + 1)
    const ok = sendSignal({
      type: 'push_question',
      timestamp: Date.now(),
      question: {
        id: qId,
        question: q.question,
        category: q.category || '',
        difficulty: q.difficulty || '',
        question_type: q.question_type || 'discussion',
      },
    })
    if (ok) {
      setCandidateWorkspaceActive(false)
      setPushedQuestionId(qId)
      setTimeout(() => setPushedQuestionId(null), 3000)
    }
  }, [activeQuestion, activeIndex, questions, sendSignal])

  // Push coding challenge to candidate's Monaco workspace
  const handlePushCodingChallenge = useCallback(() => {
    if (!activeQuestion) return
    const task = activeQuestion.coding_task || {
      id: `task_${activeQId}`,
      title: activeQuestion.question,
      description: activeQuestion.question,
      recommended_language: 'python',
      starter_code: {
        python: '# Write your solution below\ndef solve():\n    pass\n',
        javascript: '// Write your solution below\nfunction solve() {\n}\n',
        java: '// Write your solution below\npublic class Solution {\n    public static void main(String[] args) {\n    }\n}\n',
        cpp: '// Write your solution below\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n',
      },
      test_cases: [
        { id: 1, input: '', expected: '' },
      ],
    }

    const ok = sendSignal({
      type: 'push_coding_question',
      timestamp: Date.now(),
      question_id: activeQId,
      coding_task: task,
      question: {
        id: activeQId,
        question: activeQuestion.question,
        category: activeQuestion.category || 'Coding Challenge',
        difficulty: activeQuestion.difficulty || 'Medium',
        question_type: 'coding',
      },
    })
    if (ok) {
      setCandidateWorkspaceActive(true)
      setPushedQuestionId(activeQId)
      setTimeout(() => setPushedQuestionId(null), 3000)
    }
  }, [activeQuestion, activeQId, sendSignal])

  // Close candidate coding workspace
  const handleCloseCodingWorkspace = useCallback(() => {
    sendSignal({ type: 'close_coding_view' })
    setCandidateWorkspaceActive(false)
  }, [sendSignal])

  // Push Case Study narrative to candidate screen
  const handlePushCaseStudy = useCallback(() => {
    if (!activeQuestion) return
    const cs = activeQuestion.case_study || {
      title: activeQuestion.question,
      scenario: activeQuestion.question,
      dilemma: activeQuestion.quick_summary || '',
      instructions: 'Review the scenario and discuss your proposed recommendations with the recruiter.',
      industry: sessionData?.industry || 'General',
    }

    const ok = sendSignal({
      type: 'push_case_study',
      timestamp: Date.now(),
      case_study: cs,
      question: {
        id: activeQId,
        question: activeQuestion.question,
        category: activeQuestion.category || 'Case Study',
        difficulty: activeQuestion.difficulty || 'Medium',
        question_type: 'case_study',
      },
    })
    if (ok) {
      setCandidateWorkspaceActive(false)
      setPushedQuestionId(activeQId)
      setTimeout(() => setPushedQuestionId(null), 3000)
    }
  }, [activeQuestion, activeQId, sessionData?.industry, sendSignal])

  // Question Pacing Timer
  useEffect(() => {
    setQuestionElapsed(0)
  }, [activeIndex])

  useEffect(() => {
    const timer = setInterval(() => {
      setQuestionElapsed((s) => s + 1)
    }, 1000)
    return () => clearInterval(timer)
  }, [activeIndex])

  // Smart Hint Helper & Push
  const getSmartHint = (q) => {
    if (!q) return ''
    if (q.coding_task?.hint) return q.coding_task.hint
    if (q.hint) return q.hint
    if (q.constraints) return `Keep in mind the constraints: ${q.constraints}`
    if (Array.isArray(q.key_points) && q.key_points[0]) return `Consider: ${q.key_points[0]}`
    if (q.case_study?.probing_questions?.[0]) return q.case_study.probing_questions[0]
    return 'Consider edge cases, complexity constraints, and trade-offs.'
  }

  const handlePushHint = useCallback(() => {
    if (!activeQuestion) return
    const hintText = getSmartHint(activeQuestion)
    sendSignal({
      type: 'hint_pushed',
      hint: hintText,
      questionId: activeQId,
    })
    setHintSentNotice('Hint Pushed!')
    setTimeout(() => setHintSentNotice(''), 3000)
  }, [activeQuestion, activeQId, sendSignal])

  const handleCopyInviteLink = useCallback(() => {
    const inviteUrl = `${window.location.origin}/candidate-live-room/${sessionId}`
    navigator.clipboard.writeText(inviteUrl)
    setCopiedInvite(true)
    setTimeout(() => setCopiedInvite(false), 2500)
  }, [sessionId])

  const persistExternalMeeting = useCallback(async (nextEnabled, rawUrl) => {
    const cleanUrl = (rawUrl || '').trim()
    setSavingExternalMeeting(true)
    setExternalMeetingNotice('')
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const { data } = await api.post(
        `/recruiter/session/${sessionId}/external-meeting`,
        {
          external_call_mode: Boolean(nextEnabled),
          external_meeting_url: cleanUrl,
        },
        { headers }
      )
      const savedUrl = data?.external_meeting_url ?? cleanUrl
      setExternalMeetingUrl(savedUrl)
      setExternalUrlInput(savedUrl)
      setExternalCallMode(Boolean(data?.external_call_mode ?? nextEnabled))
      sendSignal({
        type: 'external_meeting_state',
        enabled: Boolean(data?.external_call_mode ?? nextEnabled),
        url: savedUrl,
      })
      setExternalMeetingNotice(
        nextEnabled
          ? savedUrl
            ? 'Meeting link saved & synced to candidate screen!'
            : 'External Call Mode enabled for candidate.'
          : 'Switched back to built-in 2-way video call.'
      )
      setTimeout(() => setExternalMeetingNotice(''), 3500)
    } catch (err) {
      setExternalMeetingNotice(
        err.response?.data?.detail || 'Failed to update external meeting settings.'
      )
    } finally {
      setSavingExternalMeeting(false)
    }
  }, [authToken, sessionId, sendSignal])

  const handleToggleExternalCallMode = useCallback(() => {
    const nextMode = !externalCallMode
    setExternalCallMode(nextMode)
    const activeUrl = (externalUrlInput || externalMeetingUrl || '').trim()
    sendSignal({
      type: 'external_meeting_state',
      enabled: nextMode,
      url: activeUrl,
    })
    persistExternalMeeting(nextMode, activeUrl)
  }, [externalCallMode, externalUrlInput, externalMeetingUrl, sendSignal, persistExternalMeeting])

  const handleSaveExternalMeetingUrl = useCallback((e) => {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()
    persistExternalMeeting(true, externalUrlInput)
  }, [persistExternalMeeting, externalUrlInput])

  const handleSubmitEvaluation = useCallback(async () => {
    if (!interviewId) return
    setSubmitError('')
    setSubmitting(true)
    try {
      const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {}
      const finalEvals =
        evaluationList.length > 0
          ? evaluationList
          : questions.map((q, idx) => ({
              question_id: toSafeQId(q.id, idx + 1),
              question: q.question || '',
              rating: 'Skip',
              notes: '',
            }))

      const { data } = await api.post(
        `/interview/${interviewId}/save-recruiter-evaluation`,
        {
          evaluations: finalEvals,
          recommendation,
          overall_notes: overallNotes,
          active_question_index: activeIndex,
        },
        { headers }
      )

      sendSignal({ type: 'interview_ended' })
      stopLocalMedia()
      setSubmittedResult(data)
    } catch (err) {
      setSubmitError(
        err.response?.data?.detail || err.message || 'Failed to submit final evaluation.'
      )
    } finally {
      setSubmitting(false)
    }
  }, [
    interviewId,
    authToken,
    evaluationList,
    questions,
    recommendation,
    overallNotes,
    activeIndex,
    sendSignal,
    stopLocalMedia,
  ])

  const handleBackToDashboard = useCallback(() => {
    const norm = String(userRole || '').toLowerCase()
    if (norm.includes('super')) {
      navigate('/superadmin/interviews')
    } else if (norm === 'master') {
      navigate('/master/dashboard')
    } else {
      navigate('/admin/interviews')
    }
  }, [userRole, navigate])

  // Pro-Interviewer Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
        return
      }
      if (e.key === 'Escape') {
        if (isTheaterMode) setIsTheaterMode(false)
        if (showShortcutsModal) setShowShortcutsModal(false)
        if (showEndInterviewModal) setShowEndInterviewModal(false)
        return
      }
      if (e.key === '1') {
        handleSelectRating('Correct')
      } else if (e.key === '2') {
        handleSelectRating('Partial')
      } else if (e.key === '3') {
        handleSelectRating('Incorrect')
      } else if (e.key === '4') {
        handleSelectRating('Skip')
      } else if (e.key === 'n' || e.key === 'N') {
        goToQuestion(Math.min(questions.length - 1, activeIndex + 1))
      } else if (e.key === 'b' || e.key === 'B') {
        goToQuestion(Math.max(0, activeIndex - 1))
      } else if (e.key === 'p' || e.key === 'P') {
        if (isCodingQuestion) handlePushCodingChallenge()
        else if (isCaseStudyQuestion) handlePushCaseStudy()
        else handlePushQuestion()
      } else if (e.key === 'h' || e.key === 'H') {
        handlePushHint()
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMic()
      } else if (e.key === '?') {
        setShowShortcutsModal((v) => !v)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeIndex,
    questions.length,
    isTheaterMode,
    showShortcutsModal,
    showEndInterviewModal,
    isCodingQuestion,
    isCaseStudyQuestion,
    handlePushCodingChallenge,
    handlePushCaseStudy,
    handlePushQuestion,
    handlePushHint,
    handleSelectRating,
    goToQuestion,
    toggleMic,
  ])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4">
        <RefreshCw className="animate-spin text-indigo-400" size={36} />
        <p className="text-slate-300 font-medium">Preparing AI Q&A Cheat Sheet & Recruiter Cockpit...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <AlertTriangle className="mx-auto text-rose-400 mb-3" size={32} />
          <h1 className="text-xl font-bold mb-2">Cockpit Unavailable</h1>
          <p className="text-sm text-slate-300 mb-6">{loadError}</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => {
                setLoadError('')
                setLoading(true)
                setRetryKey((k) => k + 1)
              }}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-sm font-semibold transition flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} />
              Retry Connection
            </button>
            <button
              onClick={handleBackToDashboard}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-300 transition"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (submittedResult) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="text-emerald-400" size={34} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Evaluation Submitted</h1>
          <p className="text-slate-300 text-sm mb-6">
            {sessionData?.candidate_name}&apos;s Recruiter-Led scorecard is saved and synced to the dashboard.
          </p>
          <div className="grid grid-cols-2 gap-3 mb-6 text-left">
            <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Deterministic Score</div>
              <div className="text-2xl font-bold text-emerald-400">{submittedResult.final_score}%</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-800/70 border border-slate-700">
              <div className="text-xs text-slate-400 mb-1">Final Verdict</div>
              <div className="text-base font-semibold text-indigo-300">{submittedResult.recommendation}</div>
            </div>
          </div>
          <button
            onClick={handleBackToDashboard}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 font-semibold text-sm transition"
          >
            Return to Interviews Dashboard
          </button>
        </div>
      </div>
    )
  }

  const hasRemoteVideo = Boolean(
    remoteStream?.getVideoTracks()?.some((t) => t.readyState === 'live')
  )
  const hasLocalVideo =
    Boolean(localStream?.getVideoTracks()?.some((t) => t.readyState === 'live')) && !camOff && !externalCallMode

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Permanent top-level audio element for remote candidate speech */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0.01, pointerEvents: 'none' }}
      />
      {/* Top Bar */}
      <header className="px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur flex flex-wrap items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={handleBackToDashboard}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Back to Interviews"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-white truncate">
                {sessionData?.candidate_name || 'Candidate'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                Recruiter Cockpit
              </span>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {sessionData?.interview_title || sessionData?.interview_type || 'Recruiter-Led Live Call'}
              {sessionData?.experience ? ` · ${sessionData.experience} exp` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* ── Live Proctoring Radar Pill ── */}
          <div
            onClick={() => setShowRadarDrawer((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 cursor-pointer hover:border-slate-600 transition shadow-sm"
            title="Click to view full Live Proctoring & Security Timeline"
          >
            {candidateTelemetry.agentConnected ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span className="hidden md:inline">Agent Active</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <ShieldAlert size={14} className="text-amber-400" />
                <span className="hidden md:inline">Agent Offline</span>
              </span>
            )}

            <div className="h-3 w-px bg-slate-700" />

            <span
              className={`text-xs font-bold px-1.5 py-0.2 rounded-full ${
                candidateTelemetry.alerts > 0
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : 'text-slate-400'
              }`}
            >
              {candidateTelemetry.alerts} Alert{candidateTelemetry.alerts === 1 ? '' : 's'}
            </span>

            {/* Dynamic Alert Flags */}
            {candidateTelemetry.phoneDetected && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold animate-pulse">
                <Smartphone size={10} /> Phone
              </span>
            )}
            {candidateTelemetry.multiFace && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold animate-pulse">
                <Users size={10} /> Multi-Face
              </span>
            )}
            {candidateTelemetry.screenCastingDetected && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold animate-pulse">
                <MonitorSmartphone size={10} /> Cast
              </span>
            )}
            {candidateTelemetry.eyeContactLost && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-semibold">
                <EyeOff size={10} /> Gaze
              </span>
            )}
          </div>

          <button
            onClick={handleCopyInviteLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition"
          >
            {copiedInvite ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span>{copiedInvite ? 'Copied Candidate Link' : 'Copy Candidate Link'}</span>
          </button>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs">
            {externalCallMode ? (
              <span className="text-sky-300 font-medium">External Call Mode</span>
            ) : callStatus === 'connected' ? (
              <>
                <Wifi size={14} className="text-emerald-400" />
                <span className="text-emerald-300 font-medium">Candidate Live</span>
              </>
            ) : wsConnected ? (
              <>
                <RefreshCw size={13} className="text-amber-400 animate-spin" />
                <span className="text-amber-200 font-medium">
                  {peerConnected ? 'Connecting A/V...' : 'Waiting Candidate'}
                </span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-rose-400" />
                <span className="text-rose-300 font-medium">WS Offline</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300">
            <Clock size={13} className="text-indigo-400" />
            <span>{formatElapsed(elapsedSeconds)}</span>
          </div>

          {/* Keyboard Shortcuts Trigger */}
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-300 transition"
            title="Keyboard Shortcuts (1-4 Rating, N/B Navigation, P Push, H Hint, M Mute)"
          >
            <Keyboard size={13} className="text-indigo-400" />
            <span>Shortcuts</span>
          </button>

          {/* End Interview & Submit CTA */}
          <button
            onClick={() => setShowEndInterviewModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 border border-rose-500 text-white text-xs font-bold transition shadow-md shadow-rose-950/40"
            title="Open Scorecard Summary, Select Hiring Verdict & Complete Interview"
          >
            <CheckCircle2 size={13} />
            <span>End Interview</span>
          </button>
        </div>
      </header>

      {/* Real-time High-Visibility Violation Toast Banner */}
      {activeAlertToast && (
        <div className="bg-rose-600/95 text-white px-4 py-2 border-b border-rose-500/50 flex items-center justify-between text-xs font-semibold shadow-lg animate-in slide-in-from-top duration-200 z-40">
          <div className="flex items-center gap-2 max-w-[1600px] mx-auto w-full">
            <ShieldAlert size={16} className="animate-bounce shrink-0" />
            <span>🚨 Live Security Violation: {activeAlertToast.message}</span>
            <span className="text-[11px] opacity-80 font-mono">[{activeAlertToast.timestamp}]</span>
            <button
              onClick={() => setShowRadarDrawer(true)}
              className="ml-auto underline hover:opacity-90 font-bold"
            >
              Open Security Log
            </button>
            <button
              onClick={() => setActiveAlertToast(null)}
              className="p-1 hover:bg-rose-700 rounded ml-2"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Proctoring & Security Timeline Drawer (Collapsible) */}
      {showRadarDrawer && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 sm:px-6 py-3 shadow-2xl backdrop-blur">
          <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-indigo-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-white">
                  Real-time Candidate Proctoring & Security Telemetry
                </span>
              </div>
              <p className="text-xs text-slate-400">
                HireIQ Security Agent detects background apps, screen mirrors, secondary displays, multi-face, and phones.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                <span className="text-slate-400">Agent: </span>
                <span className={candidateTelemetry.agentConnected ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                  {candidateTelemetry.agentConnected ? 'Connected (Port 28253)' : 'Not Running / Remote'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                <span className="text-slate-400">Screen Mirroring: </span>
                <span className={candidateTelemetry.screenCastingDetected ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {candidateTelemetry.screenCastingDetected ? 'Active (Blocked)' : 'Clean'}
                </span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
                <span className="text-slate-400">Recent Violation: </span>
                <span className="text-slate-200 font-medium">
                  {candidateTelemetry.lastAlert || 'None'}
                </span>
              </div>
              <button
                onClick={() => setShowRadarDrawer(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <XCircle size={16} />
              </button>
            </div>
          </div>

          {alertTimeline.length > 0 && (
            <div className="max-w-[1600px] mx-auto mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3 text-[11px] overflow-hidden">
              <div className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />
                <span>Live Alert Stream</span>
              </div>

              {/* Continuous Auto-Scrolling Ticker */}
              <div className="flex-1 overflow-hidden relative group">
                <div className="flex items-center gap-2.5 animate-marquee whitespace-nowrap group-hover:[animation-play-state:paused]">
                  {[...alertTimeline, ...alertTimeline].map((ev, i) => (
                    <span
                      key={`${ev.id || i}-${i}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-200 font-mono text-xs shrink-0 shadow-sm"
                    >
                      <ShieldAlert size={12} className="text-rose-400 shrink-0" />
                      <span className="text-slate-400 font-medium">[{ev.timestamp}]</span>
                      <span className="font-semibold text-rose-100">{ev.message}</span>
                      {ev.count > 1 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                          x{ev.count}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAlertTimeline([])}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-semibold transition"
                title="Clear all alerts"
              >
                Clear Stream
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Split Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 sm:p-5 max-w-[1650px] w-full mx-auto">
        {/* LEFT COLUMN: 2-Way Call Video + Profile Context + Candidate Live Code Viewer */}
        <section className={`${screenSplit === 'wide-video' ? 'lg:col-span-7' : screenSplit === 'compact-video' ? 'lg:col-span-4' : 'lg:col-span-6'} flex flex-col gap-4 transition-all duration-300`}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col gap-3 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  2-Way Video Call
                </span>
                {/* Quick Split Ratio Selectors */}
                <div className="hidden sm:inline-flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setScreenSplit('balanced')}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      screenSplit === 'balanced' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Balanced View (5:7)"
                  >
                    50:50
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenSplit('wide-video')}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      screenSplit === 'wide-video' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Wide Video (60% Video, 40% Questions)"
                  >
                    Wide Video
                  </button>
                  <button
                    type="button"
                    onClick={() => setScreenSplit('compact-video')}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      screenSplit === 'compact-video' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                    title="Compact Video (Focus on Questions)"
                  >
                    Compact
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                {/* Adjust Options Dropdown Toggle */}
                {!externalCallMode && (
                  <button
                    type="button"
                    onClick={() => setShowAdjustPanel(!showAdjustPanel)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                      showAdjustPanel
                        ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-200'
                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                    title="Adjust 2-way screen layout, PiP positions, and size"
                  >
                    <Sliders size={12} />
                    <span>Adjust Screen</span>
                    <ChevronDown size={11} className={`transition-transform ${showAdjustPanel ? 'rotate-180' : ''}`} />
                  </button>
                )}

                {/* Theater Mode Button */}
                {!externalCallMode && (
                  <button
                    type="button"
                    onClick={() => setIsTheaterMode(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
                    title="Fullscreen Theater Mode for 2-Way Screen"
                  >
                    <Maximize2 size={12} />
                  </button>
                )}

                <button
                  onClick={handleToggleExternalCallMode}
                  disabled={savingExternalMeeting}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                    externalCallMode
                      ? 'bg-sky-500/20 border-sky-500/40 text-sky-200'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <MonitorSmartphone size={12} />
                  <span>{externalCallMode ? 'Built-In Video' : 'Zoom/Meet'}</span>
                </button>
              </div>
            </div>

            {/* Adjustments Sub-Panel */}
            {showAdjustPanel && !externalCallMode && (
              <div className="bg-slate-950/95 border border-indigo-500/30 rounded-xl p-3 text-xs text-slate-200 space-y-2.5 shadow-xl animate-in fade-in slide-in-from-top-1">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                  <span className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Sliders size={13} className="text-indigo-400" /> 2-Way Screen Adjustments
                  </span>
                  <button
                    onClick={() => setShowAdjustPanel(false)}
                    className="text-slate-400 hover:text-white p-0.5 rounded"
                  >
                    <X size={13} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* View Mode: PiP vs Side-by-Side */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Screen Layout Mode
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setVideoLayoutMode('pip')}
                        className={`py-1 px-2 rounded text-[11px] font-medium transition ${
                          videoLayoutMode === 'pip' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        PiP Overlay
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoLayoutMode('side-by-side')}
                        className={`py-1 px-2 rounded text-[11px] font-medium transition ${
                          videoLayoutMode === 'side-by-side' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Side by Side
                      </button>
                    </div>
                  </div>

                  {/* PiP Overlay Size */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Overlay Window Size
                    </label>
                    <div className="grid grid-cols-3 gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                      {['small', 'normal', 'large'].map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setPipScale(s)}
                          className={`py-1 px-1 rounded text-[11px] font-medium capitalize transition ${
                            pipScale === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Candidate Camera PiP Position */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Candidate Face Position
                    </label>
                    <select
                      value={candidatePipPos}
                      onChange={(e) => setCandidatePipPos(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="bottom-left">Bottom-Left (Default)</option>
                      <option value="bottom-right">Bottom-Right</option>
                      <option value="top-left">Top-Left</option>
                      <option value="top-right">Top-Right</option>
                      <option value="hidden">Hide Candidate PiP</option>
                    </select>
                  </div>

                  {/* Recruiter "You" Camera Position */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Your Camera Position
                    </label>
                    <select
                      value={recruiterPipPos}
                      onChange={(e) => setRecruiterPipPos(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value="bottom-right">Bottom-Right (Default)</option>
                      <option value="bottom-left">Bottom-Left</option>
                      <option value="top-right">Top-Right</option>
                      <option value="top-left">Top-Left</option>
                      <option value="hidden">Hide Self View</option>
                    </select>
                  </div>
                </div>

                {/* Screen Fit Mode */}
                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-400">Screen Scaling:</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setScreenFit('contain')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        screenFit === 'contain' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Fit Whole Screen
                    </button>
                    <button
                      type="button"
                      onClick={() => setScreenFit('cover')}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                        screenFit === 'cover' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Fill Container
                    </button>
                  </div>
                </div>
              </div>
            )}

            {wsError && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
                <span>{wsError}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="px-2.5 py-1 rounded bg-rose-500 text-white font-semibold shrink-0"
                >
                  Reload
                </button>
              </div>
            )}

            {mediaWarning && !externalCallMode && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs">
                <span>{mediaWarning}</span>
                <button
                  onClick={acquireLocalMedia}
                  className="px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-semibold shrink-0"
                >
                  Retry
                </button>
              </div>
            )}

            {audioBlocked && !externalCallMode && (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-600/25 border border-indigo-500/50 text-indigo-100 text-xs">
                <span className="flex items-center gap-1.5">
                  <Volume2 size={14} /> Autoplay blocked candidate audio
                </span>
                <button
                  onClick={unlockRemoteAudio}
                  className="px-2.5 py-1 rounded bg-indigo-500 text-white font-semibold"
                >
                  Unmute Audio
                </button>
              </div>
            )}

            {/* Video Viewport (Responsive to Layout Modes, PiP Positions, and Full-screen Theater Mode) */}
            <div
              className={`${
                isTheaterMode
                  ? 'fixed inset-0 z-50 bg-slate-950 p-4 sm:p-6 flex flex-col gap-3 animate-in fade-in duration-200'
                  : 'relative aspect-video w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center'
              }`}
            >
              {externalCallMode ? (
                <div className="w-full h-full flex flex-col justify-center px-5 py-4 overflow-y-auto">
                  <div className="text-center mb-3">
                    <MonitorSmartphone size={28} className="mx-auto text-sky-400 mb-1.5" />
                    <p className="text-sm font-semibold text-white">External Call Mode (Google Meet / Zoom)</p>
                    <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                      Built-in mic/camera are paused. Paste a Meet or Zoom URL below to sync the join button directly to the candidate&apos;s screen.
                    </p>
                  </div>

                  <form onSubmit={handleSaveExternalMeetingUrl} className="space-y-2 max-w-md w-full mx-auto">
                    <div className="flex items-center gap-1.5">
                      <div className="relative flex-1">
                        <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="url"
                          value={externalUrlInput}
                          onChange={(e) => setExternalUrlInput(e.target.value)}
                          placeholder="https://meet.google.com/xxx-xxxx-xxx or Zoom URL"
                          className="w-full pl-8 pr-3 py-2 rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-500 focus:outline-none text-xs text-slate-100 placeholder-slate-500"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={savingExternalMeeting}
                        className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white text-xs font-semibold shrink-0 transition"
                      >
                        {savingExternalMeeting ? 'Saving...' : 'Save & Send'}
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.open('https://meet.new', '_blank', 'noopener,noreferrer')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition"
                      >
                        <ExternalLink size={12} />
                        <span>New Google Meet</span>
                      </button>

                      {externalMeetingUrl && (
                        <a
                          href={externalMeetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                        >
                          <ExternalLink size={12} />
                          <span>Open Meeting</span>
                        </a>
                      )}
                    </div>

                    {externalMeetingNotice && (
                      <p className="text-center text-[11px] text-emerald-300 font-medium">
                        {externalMeetingNotice}
                      </p>
                    )}
                  </form>
                </div>
              ) : (
                <>
                  {/* Top Bar for Theater Mode */}
                  {isTheaterMode && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-sm font-bold text-white">
                            {sessionData?.candidate_name || 'Candidate'}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-semibold">
                            Theater Mode
                          </span>
                        </div>

                        {/* Media View selector (Camera vs Screen) */}
                        {(hasRemoteScreen || candidateScreenShared) && (
                          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                            <button
                              type="button"
                              onClick={() => setActiveMediaView('camera')}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition ${
                                activeMediaView === 'camera' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              <Video size={13} />
                              <span>Camera</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveMediaView('screen')}
                              className={`flex items-center gap-1.5 px-2.5 py-1 rounded font-medium transition ${
                                activeMediaView === 'screen' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              <MonitorSmartphone size={13} />
                              <span>Screen</span>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                            </button>
                          </div>
                        )}

                        {/* Layout mode toggle */}
                        <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                          <button
                            type="button"
                            onClick={() => setVideoLayoutMode('pip')}
                            className={`px-2.5 py-1 rounded font-medium transition ${
                              videoLayoutMode === 'pip' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            PiP Overlay
                          </button>
                          <button
                            type="button"
                            onClick={() => setVideoLayoutMode('side-by-side')}
                            className={`px-2.5 py-1 rounded font-medium transition ${
                              videoLayoutMode === 'side-by-side' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Side by Side
                          </button>
                        </div>

                        {/* Screen scaling toggle */}
                        <div className="hidden md:flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-xs">
                          <button
                            type="button"
                            onClick={() => setScreenFit('contain')}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              screenFit === 'contain' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Fit Whole Screen
                          </button>
                          <button
                            type="button"
                            onClick={() => setScreenFit('cover')}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                              screenFit === 'cover' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Fill Container
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Call controls */}
                        <button
                          type="button"
                          onClick={toggleMic}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            micMuted ? 'bg-rose-500/20 border-rose-500/40 text-rose-200' : 'bg-slate-800 border-slate-700 text-slate-200'
                          }`}
                        >
                          {micMuted ? <MicOff size={14} /> : <Mic size={14} />}
                          <span>{micMuted ? 'Unmute' : 'Mute'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={toggleCam}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                            camOff ? 'bg-rose-500/20 border-rose-500/40 text-rose-200' : 'bg-slate-800 border-slate-700 text-slate-200'
                          }`}
                        >
                          {camOff ? <VideoOff size={14} /> : <Video size={14} />}
                          <span>{camOff ? 'Start Cam' : 'Stop Cam'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={reconnectCall}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition"
                          title="Reconnect Call"
                        >
                          <RefreshCw size={13} />
                          <span>Reconnect</span>
                        </button>

                        {/* Exit Theater Button */}
                        <button
                          type="button"
                          onClick={() => setIsTheaterMode(false)}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 text-white transition shadow"
                          title="Exit Theater Mode (Esc)"
                        >
                          <Minimize2 size={14} />
                          <span>Exit Theater (Esc)</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Inner Video Container (Central Stage) */}
                  <div
                    ref={videoStageContainerRef}
                    className={`relative ${
                      isTheaterMode
                        ? 'flex-1 min-h-0 w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800'
                        : 'w-full h-full'
                    } flex items-center justify-center`}
                  >
                    {/* View Selector in Normal View (Candidate Cam vs Candidate Live Screen) */}
                    {!isTheaterMode && (hasRemoteScreen || candidateScreenShared) && (
                      <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-slate-950/90 backdrop-blur border border-slate-800 p-1 rounded-xl shadow-lg">
                        <button
                          type="button"
                          onClick={() => setActiveMediaView('camera')}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                            activeMediaView === 'camera'
                              ? 'bg-indigo-600 text-white shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Video size={13} />
                          <span>Camera</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveMediaView('screen')}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition ${
                            activeMediaView === 'screen'
                              ? 'bg-indigo-600 text-white shadow'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <MonitorSmartphone size={13} />
                          <span>Screen</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-0.5" />
                        </button>
                      </div>
                    )}

                    {/* Candidate Screen View (Permanently mounted; visible in 'screen' view) */}
                    <div
                      className={`transition-all duration-300 ${
                        videoLayoutMode === 'side-by-side'
                          ? activeMediaView === 'screen'
                            ? 'absolute left-2 top-2 bottom-2 w-[calc(50%-10px)] rounded-xl overflow-hidden bg-slate-950 border border-slate-800 z-10'
                            : 'opacity-0 pointer-events-none absolute inset-0 z-0'
                          : activeMediaView === 'screen'
                          ? 'absolute inset-0 w-full h-full bg-slate-950 z-10 pointer-events-auto'
                          : 'opacity-0 pointer-events-none absolute inset-0 z-0'
                      }`}
                    >
                      <video
                        ref={bindCandidateScreenVideoRef}
                        autoPlay
                        playsInline
                        muted
                        onLoadedMetadata={(e) => {
                          e.currentTarget.play?.().catch(() => {})
                        }}
                        onCanPlay={(e) => {
                          e.currentTarget.play?.().catch(() => {})
                        }}
                        className={`w-full h-full object-${screenFit}`}
                      />
                      {!hasRemoteScreen && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs">
                          <MonitorSmartphone size={24} className="mb-2 text-slate-500 animate-pulse" />
                          <span>Connecting Candidate Screen Stream...</span>
                        </div>
                      )}
                      {activeMediaView === 'screen' && (
                        <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-700/60 text-[10px] text-emerald-300 font-medium z-20 flex items-center gap-1">
                          <MonitorSmartphone size={11} /> Screen Stream
                        </span>
                      )}
                    </div>

                    {/* Candidate Camera View (Permanently mounted; Draggable PiP during Screen Share) */}
                    {(() => {
                      const hasActiveAlert = Boolean(
                        candidateTelemetry.alerts > 0 &&
                        (candidateTelemetry.phoneDetected || candidateTelemetry.multiFace || candidateTelemetry.screenCastingDetected)
                      )
                      const isPipOnScreen = activeMediaView === 'screen' && videoLayoutMode !== 'side-by-side'

                      if (isPipOnScreen) {
                        if (candidatePipPos === 'hidden') {
                          return (
                            <div className="opacity-0 pointer-events-none absolute inset-0 z-0">
                              <video ref={bindCandidateVideoRef} autoPlay playsInline muted className="hidden" />
                            </div>
                          )
                        }

                        const cornerClass = candidatePipPos ? getPipPosClass(candidatePipPos) : 'top-3 right-3'

                        return (
                          <div
                            ref={candidatePipTileRef}
                            style={candidatePipCoords ? { left: `${candidatePipCoords.x}px`, top: `${candidatePipCoords.y}px` } : undefined}
                            className={`absolute ${candidatePipCoords ? '' : cornerClass} ${candidatePipCollapsed ? 'w-auto' : getPipSizeClass(pipScale)} z-30 flex flex-col pointer-events-auto bg-slate-950/95 p-1.5 rounded-xl border border-slate-700/80 shadow-2xl backdrop-blur select-none transition-shadow ${
                              hasActiveAlert ? 'ring-2 ring-rose-500 shadow-rose-950/60' : ''
                            } ${isDraggingCandidatePipRef.current ? 'shadow-indigo-500/20 border-indigo-500/50' : ''}`}
                          >
                            {/* Drag Handle & Header */}
                            <div
                              onMouseDown={handleCandidatePipDragStart}
                              onTouchStart={handleCandidatePipDragStart}
                              className="flex items-center justify-between text-[11px] text-slate-300 px-1 pb-1 cursor-grab active:cursor-grabbing border-b border-slate-800/80 gap-2 select-none"
                              title="Click and drag to move anywhere"
                            >
                              <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                                <GripHorizontal size={13} className="text-slate-400 shrink-0" />
                                <span>Candidate Cam</span>
                                {hasActiveAlert && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setCandidatePipCollapsed(!candidatePipCollapsed) }}
                                className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                                title={candidatePipCollapsed ? 'Expand candidate webcam' : 'Minimize'}
                              >
                                {candidatePipCollapsed ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
                              </button>
                            </div>

                            {/* Video Feed */}
                            <div className={`aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-700 relative flex items-center justify-center mt-1 ${candidatePipCollapsed ? 'hidden' : ''}`}>
                              <video
                                ref={bindCandidateVideoRef}
                                autoPlay
                                playsInline
                                muted
                                onLoadedData={(e) => {
                                  if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                                }}
                                onResize={(e) => {
                                  setRemoteVideoHasFrames(e.currentTarget.videoWidth > 0)
                                }}
                                className={`w-full h-full object-cover transition-opacity duration-200 ${
                                  hasRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                                }`}
                              />
                              {!hasRemoteVideo && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-slate-950/90 text-slate-400 text-xs">
                                  <User size={16} className="mb-1 text-slate-500" />
                                  <span>Cam Off</span>
                                </div>
                              )}
                              <span className="absolute bottom-1 left-1.5 px-1 py-0.2 rounded bg-slate-950/80 backdrop-blur border border-slate-700/60 text-[9px] text-slate-200 font-medium z-20 flex items-center gap-1">
                                <User size={10} /> Candidate
                              </span>
                              {hasActiveAlert && (
                                <span className="absolute top-1 right-1 px-1 py-0.2 rounded bg-rose-600 text-[9px] font-bold text-white shadow animate-pulse flex items-center gap-0.5 z-20">
                                  <AlertTriangle size={9} /> Alert
                                </span>
                              )}
                            </div>

                            {candidatePipCollapsed && (
                              <div
                                onClick={() => setCandidatePipCollapsed(false)}
                                className="text-[10px] text-slate-400 hover:text-indigo-300 cursor-pointer px-1 py-0.5 flex items-center gap-1.5"
                              >
                                <User size={12} className="text-indigo-400" />
                                <span>Candidate Cam · Click to Expand</span>
                              </div>
                            )}
                          </div>
                        )
                      }

                      // Standard Camera View or Side-by-Side View
                      return (
                        <div
                          className={`transition-all duration-300 ${
                            hasActiveAlert ? 'ring-2 ring-rose-500 shadow-rose-950/60 shadow-lg' : ''
                          } ${
                            videoLayoutMode === 'side-by-side'
                              ? activeMediaView === 'screen'
                                ? 'absolute right-2 top-2 bottom-2 w-[calc(50%-10px)] rounded-xl overflow-hidden bg-slate-900 border border-slate-800 z-10'
                                : 'absolute left-2 top-2 bottom-2 w-[calc(50%-10px)] rounded-xl overflow-hidden bg-slate-900 border border-slate-800 z-10'
                              : 'absolute inset-0 w-full h-full z-10'
                          }`}
                        >
                          <video
                            ref={bindCandidateVideoRef}
                            autoPlay
                            playsInline
                            muted
                            onLoadedMetadata={(e) => {
                              e.currentTarget.play?.().catch(() => {})
                              if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                            }}
                            onCanPlay={(e) => {
                              e.currentTarget.play?.().catch(() => {})
                              if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                            }}
                            onLoadedData={(e) => {
                              if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                            }}
                            onResize={(e) => {
                              setRemoteVideoHasFrames(e.currentTarget.videoWidth > 0)
                            }}
                            className={`w-full h-full object-cover transition-opacity duration-200 ${
                              hasRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                          />
                          {!hasRemoteVideo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-slate-950/90 text-slate-400 text-xs">
                              <User size={24} className="mb-1 text-slate-500" />
                              <span>Waiting for Candidate Camera...</span>
                            </div>
                          )}
                          <span className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-700/60 text-[10px] text-slate-200 font-medium z-20 flex items-center gap-1">
                            <User size={11} /> Candidate
                          </span>
                          {hasActiveAlert && (
                            <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-rose-600 text-[10px] font-bold text-white shadow animate-pulse flex items-center gap-1 z-20">
                              <AlertTriangle size={10} /> Alert Active
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    {/* Candidate Audio Track (Always mounted) */}
                    {/* Remote candidate audio handled by root <audio> element */}

                    {!hasRemoteVideo && activeMediaView !== 'screen' && videoLayoutMode !== 'side-by-side' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-slate-950/90 pointer-events-none">
                        <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center pointer-events-auto">
                          <User size={24} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-medium text-slate-200 mb-1">
                          {callStatus === 'connected'
                            ? 'Candidate Audio Connected (Camera Off)'
                            : peerConnected
                            ? `Connecting Candidate A/V (${iceState})...`
                            : 'Waiting for Candidate to Join'}
                        </p>
                        <p className="text-xs text-slate-400 mb-3">
                          Share the candidate invite link or wait for them to open it.
                        </p>
                        <button
                          onClick={handleCopyInviteLink}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 text-xs font-medium hover:bg-indigo-600/30 pointer-events-auto"
                        >
                          <Copy size={12} /> Copy Invite Link
                        </button>
                      </div>
                    )}

                    {/* Recruiter Self PiP / Tile: Fixed at bottom-right so recruiter's own tab is always visible */}
                    {recruiterPipPos !== 'hidden' && (
                      <div
                        className={`transition-all duration-300 ${
                          videoLayoutMode === 'side-by-side'
                            ? 'absolute right-2 top-2 bottom-2 w-[calc(50%-10px)] rounded-xl overflow-hidden bg-slate-900 border border-slate-800 z-20'
                            : `absolute ${getPipPosClass(recruiterPipPos)} ${getPipSizeClass(pipScale)} aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-700 shadow-xl z-20 pointer-events-auto`
                        }`}
                      >
                        <video
                          ref={bindLocalVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-200 ${
                            hasLocalVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                          }`}
                        />
                        {!hasLocalVideo && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-slate-400 gap-0.5 bg-slate-950/90">
                            <VideoOff size={14} />
                            <span>Cam Off</span>
                          </div>
                        )}
                        <span className="absolute bottom-1.5 left-2 px-1.5 py-0.5 rounded bg-slate-950/80 backdrop-blur border border-slate-700/60 text-[10px] text-slate-200 font-medium z-20 flex items-center gap-1">
                          <User size={11} /> You
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Bottom Cockpit Bar in Theater Mode (Evaluation + Question Nav) */}
                  {isTheaterMode && activeQuestion && (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900 border border-slate-800 shrink-0">
                      <div className="flex items-center gap-2.5 flex-1 min-w-[280px]">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => goToQuestion(Math.max(0, activeIndex - 1))}
                            disabled={activeIndex === 0}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                            title="Previous Question"
                          >
                            <ChevronLeft size={16} />
                          </button>
                          <span className="px-2 py-0.5 rounded bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-bold shrink-0">
                            Q{activeIndex + 1} of {questions.length}
                          </span>
                          <button
                            type="button"
                            onClick={() => goToQuestion(Math.min(questions.length - 1, activeIndex + 1))}
                            disabled={activeIndex === questions.length - 1}
                            className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300"
                            title="Next Question"
                          >
                            <ChevronRight size={16} />
                          </button>
                        </div>

                        <p className="text-xs text-slate-200 font-medium line-clamp-1 max-w-xl">
                          {activeQuestion.question}
                        </p>

                        <button
                          type="button"
                          onClick={() => handlePushQuestion(activeQuestion)}
                          className="ml-auto px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shrink-0 flex items-center gap-1 transition"
                        >
                          <Send size={12} />
                          <span>Push</span>
                        </button>
                      </div>

                      {/* 1-Click Candidate Rating */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1">Rate:</span>
                        {RATING_OPTIONS.map((opt) => {
                          const isSelected = activeEval.rating === opt.value
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleSelectRating(opt.value)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                                isSelected ? opt.activeCls : opt.idleCls
                              }`}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Call Controls Row */}
            {!externalCallMode && (
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  onClick={toggleMic}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition ${
                    micMuted
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {micMuted ? <MicOff size={15} /> : <Mic size={15} className={micLevel > 8 ? 'text-emerald-400' : ''} />}
                  <span>{micMuted ? 'Unmute' : 'Mute'}</span>
                  {!micMuted && (
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-400 transition-transform"
                      style={{ transform: `scale(${1 + Math.min(micLevel, 100) / 140})` }}
                      title="Microphone active"
                    />
                  )}
                </button>
                <button
                  onClick={toggleCam}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border transition ${
                    camOff
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
                      : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {camOff ? <VideoOff size={15} /> : <Video size={15} />}
                  <span>{camOff ? 'Start Cam' : 'Stop Cam'}</span>
                </button>
                <button
                  onClick={reconnectCall}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition"
                >
                  <RefreshCw size={14} />
                  <span>Reconnect</span>
                </button>
              </div>
            )}
          </div>


          {/* Candidate Resume & JD Context Drawer */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
            <button
              onClick={() => setShowProfileDrawer((v) => !v)}
              className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/50 transition"
            >
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-300">
                <FileText size={15} className="text-indigo-400" />
                Resume & Job Description Context
              </span>
              {showProfileDrawer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showProfileDrawer && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3 max-h-64 overflow-y-auto text-xs text-slate-300">
                {sessionData?.job_description && (
                  <div>
                    <div className="font-semibold text-indigo-300 mb-1">Job Description</div>
                    <p className="whitespace-pre-wrap text-slate-400 leading-relaxed">
                      {sessionData.job_description}
                    </p>
                  </div>
                )}
                {sessionData?.resume_text && (
                  <div>
                    <div className="font-semibold text-emerald-300 mb-1">Candidate Resume Extract</div>
                    <p className="whitespace-pre-wrap text-slate-400 leading-relaxed">
                      {sessionData.resume_text}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: AI Q&A Cheat Sheet & 1-Click Evaluation Cockpit */}
        <section className={`${screenSplit === 'wide-video' ? 'lg:col-span-5' : screenSplit === 'compact-video' ? 'lg:col-span-8' : 'lg:col-span-6'} flex flex-col gap-4 transition-all duration-300`}>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 shadow-xl flex-1">
            {/* Sleek 1-Row Question Stepper Carousel + Live Score */}
            <div className="flex items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800 shrink-0">
              {/* Stepper with Left/Right arrows and smooth horizontal scroll */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => {
                    const el = pillsContainerRef.current
                    if (el) el.scrollBy({ left: -140, behavior: 'smooth' })
                  }}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 transition"
                  title="Scroll questions left"
                >
                  <ChevronLeft size={14} />
                </button>

                <div
                  ref={pillsContainerRef}
                  className="flex items-center gap-1.5 overflow-x-auto py-0.5 scroll-smooth"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {questions.map((q, idx) => {
                    const qId = toSafeQId(q.id, idx + 1)
                    const r = evaluationsMap[qId]?.rating
                    const isCurrent = idx === activeIndex
                    const isCode = !isNonTechnical && (q.question_type === 'coding' || Boolean(q.coding_task))
                    const isCase = isNonTechnical || (q.question_type === 'case_study' || Boolean(q.case_study))

                    let pillCls = 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    if (r === 'Correct') pillCls = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    else if (r === 'Partial') pillCls = 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    else if (r === 'Incorrect') pillCls = 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    else if (r === 'Skip') pillCls = 'bg-slate-700/70 text-slate-400 border-slate-600'

                    return (
                      <button
                        key={qId}
                        ref={isCurrent ? activePillRef : null}
                        onClick={() => goToQuestion(idx)}
                        title={`Q${idx + 1}: ${q.question || ''}`}
                        className={`h-7 px-2.5 rounded-lg text-xs font-bold border transition flex items-center gap-1 shrink-0 ${pillCls} ${
                          isCurrent ? 'ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900 bg-indigo-600/40 text-white' : ''
                        }`}
                      >
                        {isCode && <Code2 size={11} className="text-purple-300 shrink-0" />}
                        {isCase && <BookOpen size={11} className="text-sky-300 shrink-0" />}
                        <span>Q{idx + 1}</span>
                      </button>
                    )
                  })}

                  {/* Generate More Questions Button */}
                  <button
                    onClick={() => handleGenerateMoreQuestions(5)}
                    disabled={generatingMore}
                    className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 transition flex items-center gap-1 shrink-0 disabled:opacity-50"
                    title="Generate 5 additional tailored questions on-demand"
                  >
                    {generatingMore ? (
                      <RefreshCw size={12} className="animate-spin text-indigo-400" />
                    ) : (
                      <Plus size={13} className="text-indigo-400" />
                    )}
                    <span>{generatingMore ? 'Generating...' : '+5'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const el = pillsContainerRef.current
                    if (el) el.scrollBy({ left: 140, behavior: 'smooth' })
                  }}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white shrink-0 transition"
                  title="Scroll questions right"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Live Score Pill */}
              <div className="flex items-center gap-2 shrink-0 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-xl">
                {genNotice && (
                  <span className="text-[11px] text-indigo-300 font-medium animate-pulse">
                    {genNotice}
                  </span>
                )}
                <div className="text-xs text-slate-400 font-medium flex items-center gap-1">
                  <span>Score:</span>
                  <span className="text-emerald-400 font-bold">
                    {liveScoreStats.score !== null ? `${liveScoreStats.score}%` : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500">({liveScoreStats.gradedCount}/{questions.length})</span>
                </div>
              </div>
            </div>

            {activeQuestion && (
              <>
                {/* 1. Sub-Header Toolbar: Question Meta Badges (Left) & Action CTAs (Right) */}
                <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-400">
                      Question {activeIndex + 1} of {questions.length}
                    </span>

                    {/* Question Type Badge */}
                    {isCodingQuestion ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold">
                        <Code2 size={12} /> Coding Challenge
                      </span>
                    ) : isCaseStudyQuestion ? (
                      <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold">
                        <BookOpen size={12} /> Scenario Case Study
                      </span>
                    ) : (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold">
                        Technical Discussion
                      </span>
                    )}

                    {activeQuestion.category && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                        {activeQuestion.category}
                      </span>
                    )}
                    {activeQuestion.difficulty && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                        {activeQuestion.difficulty}
                      </span>
                    )}

                    {/* Question Pacing Indicator */}
                    {(() => {
                      const targetMinutes = isCodingQuestion ? 10 : 5
                      const isOverTarget = questionElapsed > targetMinutes * 60
                      const isWarning = questionElapsed > (targetMinutes - 1) * 60
                      const min = Math.floor(questionElapsed / 60)
                      const sec = String(questionElapsed % 60).padStart(2, '0')
                      return (
                        <div
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-medium border ${
                            isOverTarget
                              ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                              : isWarning
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                          title={`Target time: ~${targetMinutes} mins`}
                        >
                          <Clock size={11} className={isOverTarget ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-indigo-400'} />
                          <span>Pace: {min}:{sec} / ~{targetMinutes}m</span>
                          {isOverTarget && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping" />}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Right Action Buttons */}
                  <div className="flex items-center gap-2">
                    {/* 1-Click Send Hint Button */}
                    <button
                      onClick={handlePushHint}
                      disabled={!wsConnected}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 text-xs font-semibold transition disabled:opacity-50"
                      title={`Send smart hint to candidate screen: "${getSmartHint(activeQuestion)}"`}
                    >
                      <Lightbulb size={13} className="text-amber-300 shrink-0" />
                      <span>{hintSentNotice || 'Send Hint'}</span>
                    </button>

                    {isCodingQuestion ? (
                      <>
                        <button
                          onClick={handlePushCodingChallenge}
                          disabled={!wsConnected}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/40 border border-purple-500/50 text-purple-200 text-xs font-semibold transition shadow-md shadow-purple-950/40 disabled:opacity-50"
                          title="Open split Monaco Editor on candidate's screen"
                        >
                          <Play size={13} fill="currentColor" />
                          <span>
                            {pushedQuestionId === activeQId
                              ? 'Workspace Pushed!'
                              : 'Push Coding Challenge'}
                          </span>
                        </button>
                        {candidateWorkspaceActive && (
                          <button
                            onClick={handleCloseCodingWorkspace}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium transition"
                            title="Close candidate coding workspace and return to video stage"
                          >
                            <XCircle size={14} />
                            <span>Close Editor</span>
                          </button>
                        )}
                      </>
                    ) : isCaseStudyQuestion ? (
                      <button
                        onClick={handlePushCaseStudy}
                        disabled={!wsConnected}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-600/30 hover:bg-sky-600/40 border border-sky-500/50 text-sky-200 text-xs font-semibold transition shadow-md shadow-sky-950/40 disabled:opacity-50"
                        title="Display Case Study narrative card on candidate's screen"
                      >
                        <Send size={13} />
                        <span>
                          {pushedQuestionId === activeQId
                            ? 'Case Study Pushed!'
                            : 'Push Case Study'}
                        </span>
                      </button>
                    ) : (
                      <button
                        onClick={handlePushQuestion}
                        disabled={!wsConnected}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 text-xs font-semibold transition disabled:opacity-50"
                        title="Show question prompt on Candidate's screen"
                      >
                        <Send size={13} />
                        <span>
                          {pushedQuestionId === activeQId ? 'Sent to Screen!' : 'Push Question'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Full-Width Question Statement Box (Spans 100% of card, no wasted space) */}
                <div className="w-full p-4 rounded-xl bg-slate-950/80 border border-slate-800 shadow-md">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    <div className="flex items-center gap-1.5 text-indigo-300">
                      {isCodingQuestion ? <Code2 size={13} className="text-purple-400" /> : isCaseStudyQuestion ? <BookOpen size={13} className="text-sky-400" /> : <Sparkles size={13} className="text-indigo-400" />}
                      <span>{isCodingQuestion ? 'Coding Challenge Statement' : isCaseStudyQuestion ? 'Case Study Scenario' : 'Discussion Question'}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Q{activeIndex + 1}</span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-white leading-relaxed">
                    {activeQuestion.question}
                  </h2>
                </div>

                {/* Live Candidate Code Execution Results Badge (for Coding Questions) */}
                {isCodingQuestion && liveCandidateRunResult && (
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950 border border-purple-500/30 text-xs shadow-inner">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Terminal size={14} className="text-purple-400 shrink-0" />
                      <span className="font-bold text-slate-300">Live Test Run:</span>
                      {liveCandidateRunResult.result?.test_results ? (
                        (() => {
                          const trs = liveCandidateRunResult.result.test_results
                          const passed = trs.filter((t) => t.passed).length
                          const total = trs.length
                          const allPass = passed === total
                          return (
                            <span className={`px-2 py-0.5 rounded-full font-bold text-[11px] ${
                              allPass ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}>
                              {passed} of {total} Tests Passed {allPass ? '✓' : ''}
                            </span>
                          )
                        })()
                      ) : liveCandidateRunResult.result?.runtime_error ? (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          Runtime Error
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full font-bold text-[11px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          Execution Complete
                        </span>
                      )}
                      <span className="text-slate-500 text-[10px] font-mono">[{liveCandidateRunResult.timestamp}]</span>
                    </div>
                  </div>
                )}

                {/* Cheat Sheet Box: Adapts to Coding Challenge, Case Study, or Technical Q&A */}
                {isCodingQuestion && activeQuestion.coding_task ? (
                  /* Coding Challenge Cheat Sheet Box */
                  <div className="rounded-xl bg-slate-950/70 border border-purple-500/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-purple-300">
                        <Code2 size={14} />
                        <span>Coding Task Specification & Test Cases</span>
                      </div>
                      <span className="text-[11px] font-mono text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded">
                        Rec: {activeQuestion.coding_task.recommended_language || 'python'}
                      </span>
                    </div>

                    {activeQuestion.coding_task.description && activeQuestion.coding_task.description !== activeQuestion.question && (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {activeQuestion.coding_task.description}
                      </p>
                    )}

                    {activeQuestion.coding_task.constraints && (
                      <div className="text-xs font-mono text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                        <span className="text-purple-300 font-bold">Constraints: </span>
                        {activeQuestion.coding_task.constraints}
                      </div>
                    )}

                    {Array.isArray(activeQuestion.coding_task.test_cases) && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Automated Test Cases ({activeQuestion.coding_task.test_cases.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {activeQuestion.coding_task.test_cases.slice(0, 4).map((tc, i) => (
                            <div
                              key={i}
                              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono"
                            >
                              <div className="text-slate-400">
                                In: <span className="text-slate-200">{JSON.stringify(tc.input)}</span>
                              </div>
                              <div className="text-emerald-400">
                                Exp: <span className="text-emerald-300">{JSON.stringify(tc.expected)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Model Solution & Complexity */}
                    <div className="pt-2 border-t border-slate-800">
                      <button
                        onClick={() => setShowModelAnswer((v) => !v)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-purple-300 hover:text-purple-200 py-1"
                      >
                        {showModelAnswer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{showModelAnswer ? 'Hide Solution & Complexity' : 'View Model Solution & Complexity'}</span>
                      </button>
                      {showModelAnswer && (
                        <div className="mt-2 space-y-2 bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs">
                          {activeQuestion.quick_summary && (
                            <div className="text-emerald-300 font-medium">{activeQuestion.quick_summary}</div>
                          )}
                          <pre className="font-mono text-xs text-slate-200 overflow-x-auto whitespace-pre p-2.5 bg-slate-950 rounded-lg">
                            {activeQuestion.model_answer || 'Reference implementation available.'}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                ) : isCaseStudyQuestion && activeQuestion.case_study ? (
                  /* Case Study Cheat Sheet Box */
                  <div className="rounded-xl bg-slate-950/70 border border-sky-500/30 p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-sky-300">
                      <BookOpen size={14} />
                      <span>Case Study Scenario Narrative & Evaluation Rubric</span>
                    </div>

                    <div className="space-y-1.5">
                      <div className="text-xs text-slate-300 leading-relaxed">
                        {activeQuestion.case_study.scenario}
                      </div>
                      {activeQuestion.case_study.dilemma && (
                        <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/25 text-xs text-sky-200">
                          <span className="font-bold">Core Conflict / Dilemma: </span>
                          {activeQuestion.case_study.dilemma}
                        </div>
                      )}
                    </div>

                    {Array.isArray(activeQuestion.case_study.key_competencies) && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {activeQuestion.case_study.key_competencies.map((comp, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-semibold text-slate-300 border border-slate-700"
                          >
                            {comp}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* STAR Model Answer & Red Flags */}
                    <div className="pt-2 border-t border-slate-800">
                      <button
                        onClick={() => setShowModelAnswer((v) => !v)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200 py-1"
                      >
                        {showModelAnswer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>
                          {showModelAnswer
                            ? 'Hide STAR Answer Framework'
                            : 'View STAR Answer Framework & Red Flags'}
                        </span>
                      </button>
                      {showModelAnswer && (
                        <div className="mt-2 space-y-3 bg-slate-900 p-3 rounded-lg border border-slate-800 text-xs">
                          <div>
                            <div className="font-bold text-emerald-300 mb-1">Model STAR Response Framework:</div>
                            <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                              {activeQuestion.case_study.model_answer_framework || activeQuestion.model_answer}
                            </p>
                          </div>

                          {Array.isArray(activeQuestion.case_study.probing_questions) &&
                            activeQuestion.case_study.probing_questions.length > 0 && (
                              <div>
                                <div className="font-bold text-indigo-300 mb-1">Probing Questions to Deep-Dive:</div>
                                <ul className="space-y-1">
                                  {activeQuestion.case_study.probing_questions.map((pq, idx) => (
                                    <li key={idx} className="text-slate-300 flex items-start gap-2">
                                      <span className="text-indigo-400">•</span>
                                      <span>{pq}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                          {Array.isArray(activeQuestion.case_study.red_flags) &&
                            activeQuestion.case_study.red_flags.length > 0 && (
                              <div>
                                <div className="font-bold text-rose-300 mb-1">Red Flags to Watch For:</div>
                                <ul className="space-y-1">
                                  {activeQuestion.case_study.red_flags.map((rf, idx) => (
                                    <li key={idx} className="text-rose-200/90 flex items-start gap-2">
                                      <span className="text-rose-400">⚠</span>
                                      <span>{rf}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Standard 2-Second Technical Discussion Cheat Sheet Box */
                  <div className="rounded-xl bg-slate-950/70 border border-indigo-500/25 p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-300">
                      <Sparkles size={14} />
                      <span>2-Second Core Answer</span>
                    </div>
                    <p className="text-sm font-medium text-emerald-200 leading-relaxed">
                      {activeQuestion.quick_summary}
                    </p>

                    {Array.isArray(activeQuestion.key_points) && activeQuestion.key_points.length > 0 && (
                      <div className="pt-1">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                          Key Signals to Listen For
                        </div>
                        <ul className="space-y-1">
                          {activeQuestion.key_points.map((kp, i) => (
                            <li key={i} className="text-xs sm:text-sm text-slate-200 flex items-start gap-2">
                              <span className="text-emerald-400 mt-0.5">•</span>
                              <span>{kp}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Collapsible Reference Answer */}
                    <div className="pt-1 border-t border-slate-800">
                      <button
                        onClick={() => setShowModelAnswer((v) => !v)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 hover:text-indigo-200 py-1"
                      >
                        {showModelAnswer ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        <span>{showModelAnswer ? 'Hide Reference Answer' : 'View Full Reference Model Answer'}</span>
                      </button>
                      {showModelAnswer && (
                        <p className="mt-2 text-xs sm:text-sm text-slate-300 leading-relaxed bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                          {activeQuestion.model_answer}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 1-Click Rating Controls */}
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    1-Click Candidate Rating
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {RATING_OPTIONS.map((opt) => {
                      const Icon = opt.icon
                      const isSelected = activeEval.rating === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => handleSelectRating(opt.value)}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-semibold transition ${
                            isSelected ? opt.activeCls : opt.idleCls
                          }`}
                        >
                          <Icon size={16} />
                          <span>{opt.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Question Note */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    Question Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={activeEval.notes || ''}
                    onChange={(e) => handleQuestionNotesChange(e.target.value)}
                    onBlur={() => triggerAutoSave(activeIndex, evaluationsMap, overallNotes)}
                    placeholder="Quick observation on candidate's answer..."
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-sm text-slate-100 placeholder-slate-500"
                  />
                </div>

                {/* Compact Action Footer & Navigation */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800 text-xs mt-auto">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToQuestion(activeIndex - 1)}
                      disabled={activeIndex === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 font-semibold transition"
                      title="Previous Question (B or Left Arrow)"
                    >
                      <ChevronLeft size={15} /> Prev
                    </button>
                    <button
                      onClick={() => goToQuestion(activeIndex + 1)}
                      disabled={activeIndex >= questions.length - 1}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-semibold transition"
                      title="Next Question (N or Right Arrow)"
                    >
                      Next <ChevronRight size={15} />
                    </button>
                    <span className="text-[11px] text-slate-500 hidden sm:inline font-mono">
                      Q{activeIndex + 1}/{questions.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[10px] text-slate-400 hidden lg:inline font-mono">
                      {autoSaveStatus || 'Auto-saved'}
                    </span>
                    <button
                      onClick={() => setShowEndInterviewModal(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs shadow-md shadow-rose-950/40 transition"
                      title="Open Scorecard Summary, Select Hiring Verdict & Complete Interview"
                    >
                      <CheckCircle2 size={13} />
                      <span>End & Submit Scorecard</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {/* ── End Interview & Scorecard Review Modal ── */}
      {showEndInterviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-4 shadow-2xl relative my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300">
                  <CheckCircle2 size={18} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Final Evaluation Scorecard</h2>
                  <p className="text-xs text-slate-400">
                    Candidate: {sessionData?.candidate_name || 'Candidate'} · {sessionData?.interview_title || 'Technical Interview'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowEndInterviewModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Score & Evaluation Overview */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] text-slate-400 block font-medium">Calculated Score</span>
                <span className="text-xl font-bold text-emerald-400">
                  {liveScoreStats.score !== null ? `${liveScoreStats.score}%` : '0%'}
                </span>
                <span className="text-[11px] text-slate-500 ml-1.5">
                  ({liveScoreStats.gradedCount} of {questions.length} graded)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-[11px] text-slate-400 block font-medium">Proctoring Telemetry</span>
                <span className={`text-base font-bold ${candidateTelemetry.alerts > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {candidateTelemetry.alerts} Alert{candidateTelemetry.alerts === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] text-slate-500 ml-1.5">
                  ({candidateTelemetry.agentConnected ? 'Agent verified' : 'Remote session'})
                </span>
              </div>
            </div>

            {/* Final Hiring Verdict */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-2">
                Final Hiring Verdict
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RECOMMENDATIONS.map((rec) => (
                  <button
                    key={rec}
                    type="button"
                    onClick={() => setRecommendation(rec)}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                      recommendation === rec
                        ? rec === 'Reject'
                          ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-950/40'
                          : rec === 'Hold'
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-950/40'
                          : 'bg-emerald-600 text-white border-emerald-500 shadow-lg shadow-emerald-950/40'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {rec}
                  </button>
                ))}
              </div>
            </div>

            {/* Overall Interview Summary Notes */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Overall Interviewer Summary & Recommendations
              </label>
              <textarea
                rows={3}
                value={overallNotes}
                onChange={(e) => setOverallNotes(e.target.value)}
                placeholder="Overall strengths, coding proficiency, communication, notice period, or cultural fit..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 focus:border-indigo-500 focus:outline-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 resize-none"
              />
            </div>

            {submitError && (
              <div className="text-xs text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-xl px-3 py-2">
                {submitError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEndInterviewModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Back to Interview
              </button>
              <button
                type="button"
                onClick={handleSubmitEvaluation}
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-indigo-950/50 transition flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Submitting Scorecard...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    <span>Confirm & Complete Interview</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pro-Interviewer Keyboard Shortcuts Modal ── */}
      {showShortcutsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <Keyboard size={16} className="text-indigo-400" />
                <span>Interviewer Shortcuts</span>
              </div>
              <button
                onClick={() => setShowShortcutsModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300 font-medium">Rate Question (1, 2, 3, 4)</span>
                <span className="font-mono text-indigo-300 font-bold">1=Correct, 2=Partial, 3=Wrong, 4=Skip</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300 font-medium">Next / Prev Question</span>
                <span className="font-mono text-indigo-300 font-bold">N / B or Arrows</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300 font-medium">Push Question / Coding Task</span>
                <span className="font-mono text-indigo-300 font-bold">P</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300 font-medium">Push Hint to Candidate</span>
                <span className="font-mono text-indigo-300 font-bold">H</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300 font-medium">Mute / Unmute Microphone</span>
                <span className="font-mono text-indigo-300 font-bold">M</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                <span className="text-slate-300 font-medium">Exit Theater / Close Modals</span>
                <span className="font-mono text-indigo-300 font-bold">Esc</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 text-center italic">
              Shortcuts automatically pause when typing in note fields.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
