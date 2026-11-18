import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Volume2,
  CheckCircle2,
  Clock,
  AlertCircle,
  MessageSquare,
  X,
  UserCheck,
  Wifi,
  WifiOff,
  MonitorSmartphone,
  ExternalLink,
  Code2,
  Play,
  Terminal,
  FileText,
  AlertTriangle,
  RotateCcw,
  GripHorizontal,
  Minimize2,
  Maximize2,
  Sparkles,
  LayoutGrid,
  User,
} from 'lucide-react'
import api from '../../utils/api'
import { API_BASE_URL } from '../../apiConfig'
import { candidateFetch, setCandidateSessionAuth } from '../../utils/candidateAuth'
import useBidirectionalCallWebRTC from '../../hooks/useBidirectionalCallWebRTC'
import DeviceCheckModal from '../../components/DeviceCheckModal'
import { useProctoring } from '../../hooks/useProctoring'
import ProctoringAlerts from '../../components/interview/ProctoringAlerts'

const Editor = React.lazy(() => import('@monaco-editor/react'))

const STARTER_CODES = {
  python: `# Write your solution below\n\ndef solve():\n    pass\n`,
  javascript: `// Write your solution below\n\nfunction solve() {\n}\n`,
  java: `// Write your solution below\n\npublic class Solution {\n    public static void main(String[] args) {\n    }\n}\n`,
  cpp: `// Write your solution below\n\n#include <iostream>\nusing namespace std;\n\nint main() {\n    return 0;\n}\n`,
}

const LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'java', label: 'Java' },
  { id: 'cpp', label: 'C++' },
]

function formatDuration(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function CandidateLiveRoom() {
  const { sessionId } = useParams()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [statusBanner, setStatusBanner] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)
  const [sessionInfo, setSessionInfo] = useState(null)
  const [monitoringToken, setMonitoringToken] = useState('')
  const [showDeviceCheck, setShowDeviceCheck] = useState(true)

  const [localStream, setLocalStream] = useState(null)
  const [externalCallMode, setExternalCallMode] = useState(false)
  const [externalMeetingUrl, setExternalMeetingUrl] = useState('')
  const [micMuted, setMicMuted] = useState(false)
  const [micLevel, setMicLevel] = useState(0)
  const [camOff, setCamOff] = useState(false)
  const [mediaWarning, setMediaWarning] = useState('')
  const [audioBlocked, setAudioBlocked] = useState(false)
  const [remoteVideoHasFrames, setRemoteVideoHasFrames] = useState(false)
  const [pushedQuestion, setPushedQuestion] = useState(null)
  const [pushedCaseStudy, setPushedCaseStudy] = useState(null)
  const [pushedHint, setPushedHint] = useState(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // Screen Sharing states
  const [screenStream, setScreenStream] = useState(null)
  const [showScreenShareModal, setShowScreenShareModal] = useState(false)
  const [screenShareError, setScreenShareError] = useState('')
  const screenTrackRef = useRef(null)

  // Tab switch & proctoring states
  const [tabSwitchAlert, setTabSwitchAlert] = useState(null)
  const tabSwitchCountRef = useRef(0)
  const blurTimerRef = useRef(null)
  const agentWarnedRef = useRef(false)

  // Live Coding Workspace states
  const [activeCodingTask, setActiveCodingTask] = useState(null)
  const [codingLanguage, setCodingLanguage] = useState('python')
  const [codingCode, setCodingCode] = useState(STARTER_CODES.python)
  const [runningCode, setRunningCode] = useState(false)
  const [runResult, setRunResult] = useState(null)
  const [runOutput, setRunOutput] = useState('')
  const codeSyncTimerRef = useRef(null)

  // Google Meet-style layout toggle ('grid' side-by-side | 'spotlight' PiP)
  const [callLayoutMode, setCallLayoutMode] = useState('grid')

  // Draggable & Movable Mini Screen in Coding Mode
  const [miniCorner, setMiniCorner] = useState('top-right') // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  const [miniPos, setMiniPos] = useState(null) // { x: number, y: number } in px when freely dragged
  const [miniCollapsed, setMiniCollapsed] = useState(false)
  const isDraggingMiniRef = useRef(false)
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, elemX: 0, elemY: 0 })
  const miniScreenRef = useRef(null)
  const editorContainerRef = useRef(null)

  const handleMiniDragStart = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return
    isDraggingMiniRef.current = true

    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY

    const rect = miniScreenRef.current?.getBoundingClientRect()
    const parentRect = editorContainerRef.current?.getBoundingClientRect() || {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }

    const curX = rect ? rect.left - parentRect.left : 10
    const curY = rect ? rect.top - parentRect.top : 10

    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      elemX: curX,
      elemY: curY,
      parentWidth: parentRect.width,
      parentHeight: parentRect.height,
      elemWidth: rect?.width || 240,
      elemHeight: rect?.height || 140,
    }

    const onMove = (moveEvent) => {
      if (!isDraggingMiniRef.current) return
      const curMouseX = moveEvent.touches ? moveEvent.touches[0].clientX : moveEvent.clientX
      const curMouseY = moveEvent.touches ? moveEvent.touches[0].clientY : moveEvent.clientY

      const deltaX = curMouseX - dragStartRef.current.startX
      const deltaY = curMouseY - dragStartRef.current.startY

      let newX = dragStartRef.current.elemX + deltaX
      let newY = dragStartRef.current.elemY + deltaY

      const maxX = Math.max(10, dragStartRef.current.parentWidth - dragStartRef.current.elemWidth - 10)
      const maxY = Math.max(10, dragStartRef.current.parentHeight - dragStartRef.current.elemHeight - 10)

      newX = Math.max(10, Math.min(newX, maxX))
      newY = Math.max(10, Math.min(newY, maxY))

      setMiniPos({ x: newX, y: newY })
    }

    const onEnd = () => {
      isDraggingMiniRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onEnd)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onEnd)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
  }, [])

  const mountedRef = useRef(true)
  const mediaReqIdRef = useRef(0)
  const localStreamRef = useRef(null)
  const localVideoRef = useRef(null)
  const proctoringVideoRef = useRef(null) // Dedicated permanent video element for continuous proctoring
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)
  const remoteAudioSigRef = useRef('')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      mediaReqIdRef.current += 1
      if (codeSyncTimerRef.current) clearTimeout(codeSyncTimerRef.current)
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
        'Camera/Mic requires HTTPS or localhost. Open this link via HTTPS or http://localhost:5173 to share video/audio.'
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
        setMediaWarning('No microphone detected or mic permission denied. Click Unmute Mic or allow microphone access.')
      }
      return stream
    } catch (err) {
      if (!mountedRef.current || reqId !== mediaReqIdRef.current) return null
      console.warn('[CandidateLiveRoom] Video+Audio failed, trying audio-only fallback:', err)
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
        setMediaWarning('Camera unavailable — joined with microphone audio. You can still see and hear the recruiter.')
        return audioOnly
      } catch (audioErr) {
        if (!mountedRef.current || reqId !== mediaReqIdRef.current) return null
        console.warn('[CandidateLiveRoom] Audio-only also failed, checking video-only:', audioErr)
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
          setMediaWarning('Camera and microphone permissions are blocked. Allow access in your browser bar and click Retry.')
          return null
        }
      }
    }
  }, [stopLocalMedia])

  // Join lightweight live session on mount
  useEffect(() => {
    if (!sessionId) {
      setErrorMsg('Missing interview session link.')
      setLoading(false)
      return
    }

    let cancelled = false
    const joinSession = async () => {
      try {
        const { data } = await api.post(`/session/${sessionId}/live-join`)
        if (cancelled) return

        if (data.is_expired) {
          setErrorMsg(data.detail || 'This interview link has expired.')
          setLoading(false)
          return
        }
        if (data.is_before_schedule) {
          const dt = data.scheduled_start
            ? new Date(
                data.scheduled_start.endsWith('Z') || data.scheduled_start.includes('+')
                  ? data.scheduled_start
                  : data.scheduled_start + 'Z'
              ).toLocaleString()
            : ''
          setStatusBanner(dt ? `Scheduled to start at ${dt}` : 'This interview has not started yet.')
          setErrorMsg(data.detail || 'This interview is scheduled for a future time window.')
          setLoading(false)
          return
        }
        if (data.already_completed || data.status === 'completed') {
          setSessionInfo(data)
          setIsCompleted(true)
          setShowDeviceCheck(false)
          setLoading(false)
          return
        }

        setSessionInfo(data)
        const initialExtUrl = data.external_meeting_url || ''
        const initialExtMode = Boolean(data.external_call_mode || initialExtUrl)
        setExternalMeetingUrl(initialExtUrl)
        setExternalCallMode(initialExtMode)
        if (data.monitoring_token) {
          setCandidateSessionAuth(data.monitoring_token, sessionId, data.interview_id)
          setMonitoringToken(data.monitoring_token)
        }
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        const msg =
          err.response?.data?.detail ||
          err.response?.data?.message ||
          err.message ||
          'Unable to join this live interview room.'
        setErrorMsg(msg)
        setLoading(false)
      }
    }

    joinSession()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Acquire / release local camera & mic dynamically after device check completes or mode changes
  useEffect(() => {
    if (loading || errorMsg || isCompleted || showDeviceCheck) return
    if (externalCallMode) {
      stopLocalMedia()
    } else {
      acquireLocalMedia()
    }
    return () => {
      stopLocalMedia()
    }
  }, [loading, errorMsg, isCompleted, showDeviceCheck, externalCallMode, acquireLocalMedia, stopLocalMedia])

  // Elapsed timer while active
  useEffect(() => {
    if (loading || errorMsg || isCompleted || showDeviceCheck) return
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(timer)
  }, [loading, errorMsg, isCompleted, showDeviceCheck])

  // Incoming custom WebSocket message router
  const handleCustomMessage = useCallback(
    (msg) => {
      if (!msg) return

      if (msg.type === 'push_coding_question') {
        const task = msg.coding_task || msg.question?.coding_task || null
        if (task) {
          const defaultLang = (task.recommended_language || 'python').toLowerCase()
          setActiveCodingTask(task)
          setCodingLanguage(defaultLang)
          const starter =
            task.starter_code?.[defaultLang] ||
            STARTER_CODES[defaultLang] ||
            STARTER_CODES.python
          setCodingCode(starter)
          setRunResult(null)
          setRunOutput('')
          setPushedQuestion(null)
          setPushedCaseStudy(null)
        }
      } else if (msg.type === 'close_coding_view') {
        setActiveCodingTask(null)
      } else if (msg.type === 'push_case_study') {
        const cs = msg.case_study || msg.question?.case_study || null
        if (cs) {
          setActiveCodingTask(null)
          setPushedCaseStudy({
            id: msg.question?.id || 'case_study',
            title: cs.title || msg.question?.question || 'Scenario Case Study',
            scenario: cs.scenario || '',
            dilemma: cs.dilemma || '',
            instructions:
              cs.candidate_instructions ||
              cs.instructions ||
              'Review the scenario and discuss your approach with the recruiter.',
            industry: cs.industry || '',
            timestamp: msg.timestamp || Date.now(),
          })
          setPushedQuestion(null)
        }
      } else if (msg.type === 'push_question' && msg.question) {
        const q = msg.question
        // Check if pushed item is a coding task or case study
        if (q.question_type === 'coding' && (q.coding_task || msg.coding_task)) {
          const task = q.coding_task || msg.coding_task
          const defaultLang = (task.recommended_language || 'python').toLowerCase()
          setActiveCodingTask(task)
          setCodingLanguage(defaultLang)
          setCodingCode(task.starter_code?.[defaultLang] || STARTER_CODES[defaultLang] || STARTER_CODES.python)
          setRunResult(null)
          setRunOutput('')
          setPushedQuestion(null)
          setPushedCaseStudy(null)
        } else if (q.question_type === 'case_study' && (q.case_study || msg.case_study)) {
          const cs = q.case_study || msg.case_study
          setActiveCodingTask(null)
          setPushedCaseStudy({
            id: q.id,
            title: cs.title || q.question || 'Scenario Case Study',
            scenario: cs.scenario || '',
            dilemma: cs.dilemma || '',
            instructions: cs.candidate_instructions || cs.instructions || 'Discuss your strategy and recommendations.',
            industry: cs.industry || '',
            timestamp: msg.timestamp || Date.now(),
          })
          setPushedQuestion(null)
        } else {
          // Defensive strip: display prompt & metadata only, never cheat-sheet solutions
          setActiveCodingTask(null)
          setPushedQuestion({
            id: q.id || Date.now(),
            question: typeof q === 'string' ? q : q.question || '',
            category: q.category || '',
            difficulty: q.difficulty || '',
            timestamp: msg.timestamp || Date.now(),
          })
          setPushedCaseStudy(null)
        }

        // Play subtle incoming question chime
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext
          if (AudioContext) {
            const ctx = new AudioContext()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.frequency.setValueAtTime(587.33, ctx.currentTime)
            gain.gain.setValueAtTime(0.08, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.3)
          }
        } catch (_) {}
      } else if (msg.type === 'hint_pushed') {
        setPushedHint({
          text: msg.hint,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        })
      } else if (msg.type === 'external_meeting_state') {
        setExternalCallMode(Boolean(msg.enabled))
        if (typeof msg.url === 'string') {
          setExternalMeetingUrl(msg.url)
        }
      } else if (msg.type === 'interview_ended') {
        stopLocalMedia()
        setIsCompleted(true)
      }
    },
    [stopLocalMedia]
  )

  const {
    remoteStream,
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
    role: 'candidate',
    linkId: sessionId,
    token: monitoringToken,
    localStream,
    screenStream,
    enabled: Boolean(monitoringToken && !isCompleted && !errorMsg && (localStream || camOff)),
    mediaEnabled: !externalCallMode,
    onCustomMessage: handleCustomMessage,
  })

  // Acquire Screen Media handler (Prompted before joining or re-sharing if ended)
  const acquireScreenMedia = useCallback(async () => {
    setScreenShareError('')
    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setScreenShareError('Screen sharing is not supported in this browser. Please use Google Chrome.')
      return null
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor' },
        audio: false,
      })
      const track = stream.getVideoTracks()[0]
      if (!track) {
        throw new Error('No screen video track was provided.')
      }

      track.onended = () => {
        setScreenStream(null)
        screenTrackRef.current = null
        setShowScreenShareModal(true)
        setScreenShareError('⚠️ Screen sharing was stopped! Please re-share your entire screen to continue the interview.')
        sendSignal({
          type: 'candidate_proctoring_alert',
          alert: {
            type: 'screen_share_stopped',
            message: 'Candidate stopped sharing their screen!',
          },
          timestamp: new Date().toLocaleTimeString(),
        })
        sendSignal({
          type: 'candidate_screenshare_state',
          active: false,
        })
        setTimeout(() => {
          reconnectCall()
        }, 300)
      }

      screenTrackRef.current = track
      setScreenStream(stream)
      setShowScreenShareModal(false)
      sendSignal({
        type: 'candidate_screenshare_state',
        active: true,
      })
      // Trigger WebRTC renegotiation immediately so the screen transceiver starts sending packets
      setTimeout(() => {
        reconnectCall()
      }, 300)
      return stream
    } catch (err) {
      console.warn('Candidate screen share prompt cancelled or failed:', err)
      setScreenShareError(
        'Entire screen sharing is required before starting the live interview. Please select your screen to proceed.'
      )
      return null
    }
  }, [sendSignal, reconnectCall])

  // Dedicated permanent video element for proctoring — never unmounts across layout modes
  useEffect(() => {
    const el = proctoringVideoRef.current
    if (!el) return
    const target = localStream || null
    if (el.srcObject !== target) {
      el.srcObject = target
    }
    if (target) {
      el.play?.().catch(() => {})
    }
  }, [localStream])

  // Full proctoring engine attached to permanent proctoringVideoRef
  const proctoring = useProctoring({
    videoRef: proctoringVideoRef,
    enabled: Boolean(!showDeviceCheck && !showScreenShareModal && !loading && !errorMsg && !isCompleted && !externalCallMode && localStream),
    onViolation: (violation) => {
      sendSignal({
        type: 'candidate_proctoring_alert',
        alert: violation,
        timestamp: new Date().toLocaleTimeString(),
      })
    },
  })

  // Tab Switch & Application Focus Violation Trigger
  const triggerTabSwitchViolation = useCallback((msgText) => {
    tabSwitchCountRef.current += 1
    const count = tabSwitchCountRef.current
    const alertData = {
      type: 'tab_switch',
      message: msgText || `Tab switch detected (#${count})! Navigating away is not permitted.`,
      count,
    }
    setTabSwitchAlert(alertData)

    // Audio chime alert
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      if (AudioCtx) {
        const ctx = new AudioCtx()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sawtooth'
        osc.frequency.setValueAtTime(880, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.35)
        gain.gain.setValueAtTime(0.3, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.4)
      }
    } catch (_) {}

    sendSignal({
      type: 'candidate_proctoring_alert',
      alert: alertData,
      timestamp: new Date().toLocaleTimeString(),
    })

    setTimeout(() => {
      setTabSwitchAlert((cur) => (cur?.count === count ? null : cur))
    }, 6000)
  }, [sendSignal])

  // Tab Switching, Blur & Focus listeners
  useEffect(() => {
    if (showDeviceCheck || showScreenShareModal || isCompleted || !wsConnected) return

    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        triggerTabSwitchViolation('Candidate switched browser tab or minimized the interview!')
      }
    }

    const handleBlur = () => {
      blurTimerRef.current = setTimeout(() => {
        if (!document.hasFocus()) {
          triggerTabSwitchViolation('Candidate navigated away from the interview application!')
        }
      }, 1500)
    }

    const handleFocus = () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current)
        blurTimerRef.current = null
      }
    }

    const handleKeyDown = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (ctrl && (key === 't' || key === 'w' || key === 'n' || key === 'tab' || ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key))) {
        e.preventDefault()
        triggerTabSwitchViolation(`Browser shortcut (Ctrl+${key.toUpperCase()}) blocked! Tab switching is prohibited.`)
      }
      if (e.altKey && (key === 'tab' || key === 'escape')) {
        e.preventDefault()
        triggerTabSwitchViolation('Alt+Tab application switching blocked! Stay within the interview.')
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('keydown', handleKeyDown, true)
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [showDeviceCheck, showScreenShareModal, isCompleted, wsConnected, triggerTabSwitchViolation])

  // Strict Security Agent Enforcement during live call
  useEffect(() => {
    if (showDeviceCheck || showScreenShareModal || isCompleted || !wsConnected) return

    if (!proctoring.agentConnected && !agentWarnedRef.current) {
      agentWarnedRef.current = true
      sendSignal({
        type: 'candidate_proctoring_alert',
        alert: {
          type: 'agent_disconnected',
          message: 'HireIQ Security Agent disconnected on candidate machine!',
        },
        timestamp: new Date().toLocaleTimeString(),
      })
    } else if (proctoring.agentConnected && agentWarnedRef.current) {
      agentWarnedRef.current = false
      sendSignal({
        type: 'candidate_proctoring_alert',
        alert: {
          type: 'agent_reconnected',
          message: 'HireIQ Security Agent reconnected successfully.',
        },
        timestamp: new Date().toLocaleTimeString(),
      })
    }
  }, [showDeviceCheck, showScreenShareModal, isCompleted, wsConnected, proctoring.agentConnected, sendSignal])

  // Periodic Telemetry sync: broadcasts live proctoring & security state to Recruiter Cockpit
  useEffect(() => {
    if (showDeviceCheck || isCompleted || !wsConnected) return
    const timer = setInterval(() => {
      sendSignal({
        type: 'telemetry',
        data: {
          audio_level: micLevel,
          proctoring_alerts: proctoring.alertCount || 0,
          proctoring_status: {
            agentConnected: Boolean(proctoring.agentConnected),
            screenShareActive: Boolean(screenStream && screenStream.getVideoTracks().some((t) => t.readyState === 'live')),
            faceVisible: Boolean(proctoring.faceVisible),
            faceCount: proctoring.faceCount || 1,
            multiFace: Boolean(proctoring.multiFace),
            phoneDetected: Boolean(proctoring.phoneDetected),
            eyeContactLost: Boolean(proctoring.eyeContactLost),
            screenCastingDetected: Boolean(proctoring.screenCastingDetected),
            detectedPlatforms: proctoring.detectedPlatforms || [],
            lastAlertType: proctoring.activeAlerts?.[0] || '',
          },
        },
      })
    }, 2000)
    return () => clearInterval(timer)
  }, [
    showDeviceCheck,
    isCompleted,
    wsConnected,
    micLevel,
    screenStream,
    proctoring.alertCount,
    proctoring.agentConnected,
    proctoring.faceVisible,
    proctoring.faceCount,
    proctoring.multiFace,
    proctoring.phoneDetected,
    proctoring.eyeContactLost,
    proctoring.screenCastingDetected,
    proctoring.detectedPlatforms,
    proctoring.activeAlerts,
    sendSignal,
  ])

  // Synchronous callback ref to attach local candidate video
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

  // Bind local PiP video
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
  }, [localStream, externalCallMode, activeCodingTask, screenStream])

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

  // Synchronous callback ref to attach remote stream to any video element immediately
  const bindRemoteVideoRef = useCallback((el) => {
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

  // Bind remote recruiter video ONLY (kept muted so video frames never fail autoplay or mute audio)
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
  }, [remoteStream, externalCallMode, activeCodingTask])

  // Dual-Pipeline remote recruiter audio playback: DOM <audio> element + Web Audio API fallback
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

    // Web Audio API pipeline: routes directly to system audio hardware
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
        console.warn('[CandidateLiveRoom] WebAudio fallback notice:', err)
      }
    }

    return () => {
      if (audioCtx) audioCtx.close().catch(() => {})
    }
  }, [remoteStream, remoteAudioActive, externalCallMode, activeCodingTask])

  const unlockRemoteAudio = useCallback(() => {
    const audioEl = remoteAudioRef.current
    if (audioEl) {
      audioEl.muted = false
      audioEl.volume = 1.0
      audioEl.play().catch(() => {})
    }
    setAudioBlocked(false)
  }, [])

  // Auto-unmute remote audio as soon as the user interacts anywhere on the page
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

  const toggleMic = async () => {
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

    const nextMuted = !micMuted
    liveAudioTracks.forEach((t) => {
      t.enabled = !nextMuted
    })
    setMicMuted(nextMuted)
  }

  const toggleCam = () => {
    const stream = localStreamRef.current
    if (!stream) return
    const nextOff = !camOff
    stream.getVideoTracks().forEach((t) => {
      t.enabled = !nextOff
    })
    setCamOff(nextOff)
  }

  const handleLeaveCall = () => {
    stopLocalMedia()
    setIsCompleted(true)
    setConfirmLeave(false)
  }

  // ── Candidate Coding Round Actions ──
  const handleCodeChange = (newVal) => {
    const val = newVal || ''
    setCodingCode(val)
    if (codeSyncTimerRef.current) clearTimeout(codeSyncTimerRef.current)
    codeSyncTimerRef.current = setTimeout(() => {
      sendSignal({
        type: 'code_update',
        taskId: activeCodingTask?.id,
        language: codingLanguage,
        code: val,
      })
    }, 400)
  }

  const handleLanguageChange = (newLang) => {
    setCodingLanguage(newLang)
    const starter =
      activeCodingTask?.starter_code?.[newLang] ||
      STARTER_CODES[newLang] ||
      STARTER_CODES.python
    setCodingCode(starter)
    sendSignal({
      type: 'code_update',
      taskId: activeCodingTask?.id,
      language: newLang,
      code: starter,
    })
  }

  const handleResetCode = () => {
    const starter =
      activeCodingTask?.starter_code?.[codingLanguage] ||
      STARTER_CODES[codingLanguage] ||
      STARTER_CODES.python
    setCodingCode(starter)
    sendSignal({
      type: 'code_update',
      taskId: activeCodingTask?.id,
      language: codingLanguage,
      code: starter,
    })
  }

  const handleRunCode = async () => {
    if (!codingCode.trim() || runningCode) return
    setRunningCode(true)
    setRunOutput('Executing solution against test cases...')
    try {
      const res = await candidateFetch(`${API_BASE_URL}/coding-round/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: sessionInfo?.interview_id || sessionId,
          code: codingCode,
          language: codingLanguage,
          task: activeCodingTask,
        }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || errData.error || `Execution server error (HTTP ${res.status})`)
      }
      const data = await res.json()
      const rr = data.run_result
      setRunResult(rr || null)
      let outputText = ''
      if (rr?.runtime_error) {
        outputText = `Execution Error:\n${rr.runtime_error}`
      } else if (rr?.visible_results?.length) {
        const passedCount =
          rr.visible_results.filter((r) => r.passed).length + (rr.hidden_summary?.passed || 0)
        const totalTests = (rr.visible_results.length || 0) + (rr.hidden_summary?.total || 0)
        outputText = `Passed ${passedCount} / ${totalTests} Test Cases\n\n`
        outputText += rr.visible_results
          .map(
            (r, i) =>
              `Test ${i + 1}: ${r.passed ? 'PASSED ✅' : 'FAILED ❌'}\nInput: ${JSON.stringify(
                r.input
              )}\nExpected: ${JSON.stringify(r.expected)}\nGot: ${JSON.stringify(r.actual ?? r.output)}`
          )
          .join('\n\n')
      } else if (rr?.output) {
        outputText = `Output:\n${rr.output}`
      } else {
        outputText = data.error || 'Code executed with no output.'
      }
      setRunOutput(outputText)
      sendSignal({
        type: 'code_run_result',
        taskId: activeCodingTask?.id,
        language: codingLanguage,
        code: codingCode,
        result: rr,
        output: outputText,
      })
    } catch (err) {
      const errText = `Execution error: ${err.message || 'Run failed'}`
      setRunOutput(errText)
      sendSignal({
        type: 'code_run_result',
        taskId: activeCodingTask?.id,
        language: codingLanguage,
        code: codingCode,
        result: { runtime_error: errText },
        output: errText,
      })
    } finally {
      setRunningCode(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-4 px-4">
        <RefreshCw className="animate-spin text-indigo-400" size={36} />
        <p className="text-slate-300 font-medium">Connecting to your live interview room...</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
            <AlertCircle className="text-rose-400" size={28} />
          </div>
          <h1 className="text-xl font-bold mb-2">Unable to Join Call</h1>
          <p className="text-slate-300 text-sm mb-3">{errorMsg}</p>
          {statusBanner && (
            <p className="text-xs text-indigo-300 bg-indigo-500/10 rounded-lg py-2 px-3">{statusBanner}</p>
          )}
        </div>
      </div>
    )
  }

  if (isCompleted) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="text-emerald-400" size={34} />
          </div>
          <h1 className="text-2xl font-bold mb-2">Interview Completed</h1>
          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            Thank you{sessionInfo?.candidate_name ? `, ${sessionInfo.candidate_name}` : ''}. Your live interview
            session has ended. The recruiting team will follow up with next steps shortly.
          </p>
          <div className="text-xs text-slate-400 bg-slate-800/60 rounded-xl py-3 px-4">
            Session Duration: {formatDuration(elapsedSeconds)} · Safe to close this tab.
          </div>
        </div>
      </div>
    )
  }

  const hasRemoteVideo = Boolean(
    remoteStream?.getVideoTracks()?.some((t) => t.readyState === 'live')
  )
  const hasLocalVideo = Boolean(localStream?.getVideoTracks()?.some((t) => t.readyState === 'live')) && !camOff

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col relative overflow-hidden">
      {/* ── Permanent Audio Element for Recruiter Speech ── */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        style={{ position: 'fixed', top: -9999, left: -9999, width: 1, height: 1, opacity: 0.01, pointerEvents: 'none' }}
      />
      {/* ── Security & Device Check Modal Gate ── */}
      {showDeviceCheck && (
        <DeviceCheckModal
          onSuccess={() => {
            setShowDeviceCheck(false)
            setShowScreenShareModal(true)
          }}
          onCancel={handleLeaveCall}
        />
      )}

      {/* ── Mandatory Screen Share Modal Gate ── */}
      {showScreenShareModal && !showDeviceCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0f1e]/90 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4">
              <MonitorSmartphone size={32} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Share Entire Screen to Begin
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mb-4 leading-relaxed">
              To ensure interview authenticity and integrity, you must share your <strong>Entire Screen</strong>. The recruiter will monitor your screen and workspace in real-time alongside your camera.
            </p>
            {screenShareError && (
              <div className="w-full mb-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 text-left">
                <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                <span>{screenShareError}</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                type="button"
                onClick={acquireScreenMedia}
                className="flex-1 py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <MonitorSmartphone size={16} />
                <span>Share Entire Screen & Join</span>
              </button>
              <button
                type="button"
                onClick={handleLeaveCall}
                className="py-3 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition border border-slate-700"
              >
                Cancel
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-3">
              💡 When prompted by your browser, select <strong>"Entire Screen"</strong> (not a single window or tab).
            </p>
          </div>
        </div>
      )}

      {/* ── Permanent Hidden Video Element for Proctoring Frame Extraction ── */}
      <video
        ref={proctoringVideoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
        style={{ display: 'none', position: 'absolute', pointerEvents: 'none' }}
      />

      {/* ── Tab Switch Alert Warning Banner ── */}
      {tabSwitchAlert && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-rose-600/95 backdrop-blur-md text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border border-rose-400 animate-in slide-in-from-top-4 max-w-lg">
          <AlertTriangle className="text-amber-300 shrink-0" size={24} />
          <div className="text-xs">
            <p className="font-bold text-sm tracking-wide">⚠️ TAB SWITCH VIOLATION DETECTED</p>
            <p className="text-rose-100">{tabSwitchAlert.message}</p>
          </div>
        </div>
      )}

      {/* ── Strict Security Agent Warning Banner ── */}
      {!proctoring.agentConnected && !showDeviceCheck && !showScreenShareModal && !isCompleted && (
        <div className="bg-amber-600/90 text-amber-50 px-4 py-2 text-xs flex items-center justify-between border-b border-amber-500 z-30 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-200 shrink-0 animate-pulse" />
            <span className="font-medium">
              <strong>⚠️ Security Agent Disconnected:</strong> The HireIQ Security Agent must remain running on your computer (port 28253). Recruiter has been notified.
            </span>
          </div>
        </div>
      )}

      {/* ── Stacked Proctoring Notification Alerts (Top-Center) ── */}
      <ProctoringAlerts
        faceAlertCount={proctoring.alertCount || 0}
        proctoringAlert={proctoring.activeAlerts?.[0] || ''}
        modelsFailed={proctoring.modelsFailed}
      />

      {/* Top Bar */}
      <header className="h-16 px-4 sm:px-6 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur flex items-center justify-between gap-4 z-20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
            {activeCodingTask ? (
              <Code2 className="text-indigo-400" size={18} />
            ) : (
              <Video className="text-indigo-400" size={18} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm sm:text-base truncate">
                {sessionInfo?.interview_title || 'Live Recruiter Interview'}
              </span>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Live Human Call
              </span>
              {activeCodingTask && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                  Coding Workspace Active
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">
              Candidate: {sessionInfo?.candidate_name || 'Candidate'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
            {externalCallMode ? (
              <>
                <MonitorSmartphone size={14} className="text-sky-400" />
                <span className="text-sky-300 font-medium">External Call Mode</span>
              </>
            ) : callStatus === 'connected' ? (
              <>
                <Wifi size={14} className="text-emerald-400" />
                <span className="text-emerald-300 font-medium">Recruiter Connected</span>
              </>
            ) : wsConnected ? (
              <>
                <RefreshCw size={13} className="text-amber-400 animate-spin" />
                <span className="text-amber-200 font-medium">
                  {peerConnected ? 'Connecting A/V...' : 'Waiting for Recruiter'}
                </span>
              </>
            ) : (
              <>
                <WifiOff size={14} className="text-rose-400" />
                <span className="text-rose-300 font-medium">Reconnecting...</span>
              </>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300">
            <Clock size={13} className="text-indigo-400" />
            <span>{formatDuration(elapsedSeconds)}</span>
          </div>
        </div>
      </header>

      {/* Alerts / Autoplay unlock / Case Study / Pushed Question */}
      <div className="px-4 sm:px-6 pt-3 space-y-2 max-w-6xl w-full mx-auto z-10 shrink-0">
        {wsError && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs sm:text-sm">
            <span>{wsError}</span>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 rounded-lg bg-rose-500 text-white font-semibold hover:bg-rose-400 transition"
            >
              Reload Page
            </button>
          </div>
        )}

        {mediaWarning && !externalCallMode && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs sm:text-sm">
            <span>{mediaWarning}</span>
            <button
              onClick={acquireLocalMedia}
              className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-semibold hover:bg-amber-400 transition"
            >
              Retry Camera & Mic
            </button>
          </div>
        )}

        {audioBlocked && !externalCallMode && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-indigo-600/25 border border-indigo-500/50 text-indigo-100 text-sm">
            <div className="flex items-center gap-2">
              <Volume2 size={18} className="text-indigo-300" />
              <span>Your browser muted incoming audio. Click below to hear the recruiter clearly.</span>
            </div>
            <button
              onClick={unlockRemoteAudio}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-semibold text-xs shrink-0"
            >
              Enable Audio
            </button>
          </div>
        )}

        {/* Pushed Case Study Card */}
        {pushedCaseStudy && (
          <div className="flex items-start justify-between gap-3 p-4 rounded-xl bg-slate-900 border border-sky-500/40 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <FileText size={16} className="text-sky-300" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-sky-300">
                    Active Scenario Case Study
                  </span>
                  {pushedCaseStudy.industry && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {pushedCaseStudy.industry}
                    </span>
                  )}
                </div>
                <h3 className="text-sm sm:text-base font-bold text-white">{pushedCaseStudy.title}</h3>
                {pushedCaseStudy.scenario && (
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {pushedCaseStudy.scenario}
                  </p>
                )}
                {pushedCaseStudy.dilemma && (
                  <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5 mt-2">
                    <span className="font-semibold">Core Dilemma: </span>
                    {pushedCaseStudy.dilemma}
                  </div>
                )}
                {pushedCaseStudy.instructions && (
                  <p className="text-[11px] text-slate-400 mt-1 italic">{pushedCaseStudy.instructions}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setPushedCaseStudy(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg"
              aria-label="Dismiss case study"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Pushed Standard Discussion Question */}
        {pushedQuestion && pushedQuestion.question && (
          <div
            key={`${pushedQuestion.id}-${pushedQuestion.timestamp || ''}`}
            className="flex items-start justify-between gap-3 p-4 rounded-xl bg-slate-900 border-2 border-indigo-500/60 shadow-xl shadow-indigo-950/40 animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0 mt-0.5 border border-indigo-400/30">
                <MessageSquare size={16} className="text-indigo-300" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] uppercase tracking-wider font-bold text-indigo-300 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Current Discussion Question
                  </span>
                  {pushedQuestion.category && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 font-semibold">
                      {pushedQuestion.category}
                    </span>
                  )}
                  {pushedQuestion.difficulty && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-semibold">
                      {pushedQuestion.difficulty}
                    </span>
                  )}
                </div>
                <p className="text-base sm:text-lg font-semibold text-white leading-relaxed">
                  {pushedQuestion.question}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPushedQuestion(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              aria-label="Dismiss question"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Pushed Interviewer Hint */}
        {pushedHint && (
          <div className="flex items-start justify-between gap-3 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-100 shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles size={15} className="text-amber-300" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <span>Interviewer Hint</span>
                  {pushedHint.timestamp && (
                    <span className="text-[10px] text-amber-400/70 font-normal font-mono">[{pushedHint.timestamp}]</span>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-100 mt-0.5 leading-relaxed">
                  {pushedHint.text}
                </p>
              </div>
            </div>
            <button
              onClick={() => setPushedHint(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition"
              aria-label="Dismiss hint"
            >
              <X size={15} />
            </button>
          </div>
        )}
      </div>

      {/* ── Main Call & Coding Stage ── */}
      <main className="flex-1 p-3 sm:p-5 flex flex-col items-center justify-center max-w-[1680px] w-full mx-auto overflow-hidden">
        {activeCodingTask ? (
          /* ── Split Coding Workspace Layout ── */
          <div className="w-full h-full min-h-[520px] max-h-[78vh] grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Problem Narrative & Test Output Console */}
            <div className="lg:col-span-5 flex flex-col gap-3 h-full overflow-hidden">
              {/* Problem Details Card */}
              <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 overflow-y-auto space-y-4 shadow-xl">
                <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Code2 className="text-indigo-400" size={18} />
                    <h2 className="text-base font-bold text-white">
                      {activeCodingTask.title || 'Coding Challenge'}
                    </h2>
                  </div>
                  {activeCodingTask.difficulty && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold">
                      {activeCodingTask.difficulty}
                    </span>
                  )}
                </div>

                <div className="text-xs sm:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {activeCodingTask.description}
                </div>

                {activeCodingTask.constraints && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Constraints
                    </div>
                    <div className="text-xs font-mono text-slate-300 whitespace-pre-wrap">
                      {activeCodingTask.constraints}
                    </div>
                  </div>
                )}

                {Array.isArray(activeCodingTask.test_cases) && activeCodingTask.test_cases.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Sample Test Cases
                    </div>
                    <div className="space-y-2">
                      {activeCodingTask.test_cases.slice(0, 2).map((tc, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs space-y-1"
                        >
                          <div>
                            <span className="text-slate-400">Input: </span>
                            <span className="text-indigo-300">{JSON.stringify(tc.input)}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Expected: </span>
                            <span className="text-emerald-300">{JSON.stringify(tc.expected)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Execution Console */}
              <div className="h-44 sm:h-52 bg-slate-900 border border-slate-800 rounded-2xl p-3 flex flex-col shadow-xl">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
                    <Terminal size={14} className="text-indigo-400" />
                    <span>Test Execution Console</span>
                  </div>
                  {runResult && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        runResult.all_passed
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                      }`}
                    >
                      {runResult.all_passed ? 'All Tests Passed' : 'Tests Evaluated'}
                    </span>
                  )}
                </div>
                <div className="flex-1 mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 font-mono text-xs overflow-y-auto text-slate-300 whitespace-pre-wrap">
                  {runOutput || 'Click "Run Tests" to execute your code against test cases.'}
                </div>
              </div>
            </div>

            {/* Right Column: Code Editor + Floating 2-Way Video Call PiP */}
            <div className="lg:col-span-7 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
              {/* Editor Header Bar */}
              <div className="h-12 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-300">Language:</span>
                  <select
                    value={codingLanguage}
                    onChange={(e) => handleLanguageChange(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleResetCode}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
                    title="Reset to starter template"
                  >
                    <RotateCcw size={13} />
                    <span className="hidden sm:inline">Reset</span>
                  </button>

                  <button
                    onClick={handleRunCode}
                    disabled={runningCode}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition shadow-md shadow-emerald-950/40"
                  >
                    {runningCode ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : (
                      <Play size={13} fill="currentColor" />
                    )}
                    <span>{runningCode ? 'Running...' : 'Run Tests'}</span>
                  </button>
                </div>
              </div>

              {/* Monaco Editor Container */}
              <div ref={editorContainerRef} className="flex-1 w-full h-full min-h-0 relative overflow-hidden">
                <Suspense
                  fallback={
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                      <RefreshCw className="animate-spin text-indigo-400" size={24} />
                      <span>Loading Monaco Code Workspace...</span>
                    </div>
                  }
                >
                  <Editor
                    height="100%"
                    language={codingLanguage}
                    value={codingCode}
                    onChange={handleCodeChange}
                    theme="vs-dark"
                    options={{
                      fontSize: 14,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 4,
                      lineNumbers: 'on',
                    }}
                  />
                </Suspense>

                {/* ── Persistent Movable & Minimizable Video Call PiP ── */}
                {(() => {
                  const getCornerClasses = () => {
                    if (miniPos) return ''
                    switch (miniCorner) {
                      case 'top-left':
                        return 'top-3 left-4'
                      case 'bottom-left':
                        return 'bottom-4 left-4'
                      case 'bottom-right':
                        return 'bottom-4 right-4'
                      case 'top-right':
                      default:
                        return 'top-3 right-4'
                    }
                  }

                  return (
                    <div
                      ref={miniScreenRef}
                      style={miniPos ? { left: `${miniPos.x}px`, top: `${miniPos.y}px` } : undefined}
                      className={`absolute ${getCornerClasses()} z-30 flex flex-col gap-1.5 pointer-events-auto bg-slate-950/95 p-2 rounded-xl border border-slate-700/80 shadow-2xl backdrop-blur select-none transition-shadow ${
                        isDraggingMiniRef.current ? 'shadow-indigo-500/20 border-indigo-500/50' : ''
                      }`}
                    >
                      {/* Drag Handle & Action Bar */}
                      <div
                        onMouseDown={handleMiniDragStart}
                        onTouchStart={handleMiniDragStart}
                        className="flex items-center justify-between text-[10px] text-slate-300 px-1 pb-1 cursor-grab active:cursor-grabbing border-b border-slate-800/80 gap-2 select-none"
                        title="Click and drag to move anywhere"
                      >
                        <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                          <GripHorizontal size={13} className="text-slate-400 shrink-0" />
                          <span>Live Call</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        </div>

                        {/* Minimize / Expand Toggle */}
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setMiniCollapsed(!miniCollapsed) }}
                          className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition"
                          title={miniCollapsed ? 'Expand video feeds' : 'Minimize to avoid blocking code'}
                        >
                          {miniCollapsed ? <Maximize2 size={11} /> : <Minimize2 size={11} />}
                        </button>
                      </div>

                      {/* Dual Video Feeds (Google Meet style: Recruiter + Candidate face cam) */}
                      <div className={`flex items-center gap-2 pt-0.5 ${miniCollapsed ? 'hidden' : ''}`}>
                        {/* Remote Recruiter PiP */}
                        <div className="w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-700 relative flex items-center justify-center">
                          <video
                            ref={bindRemoteVideoRef}
                            autoPlay
                            playsInline
                            muted
                            onLoadedMetadata={(e) => {
                              e.currentTarget.play?.().catch(() => {})
                              if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                            }}
                            onCanPlay={(e) => {
                              e.currentTarget.play?.().catch(() => {})
                            }}
                            onLoadedData={(e) => {
                              if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                            }}
                            className={`w-full h-full object-cover ${
                              hasRemoteVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                          />
                          {/* Remote audio stream handled by root <audio> element */}
                          {!hasRemoteVideo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-slate-400 gap-1 bg-slate-900">
                              <UserCheck size={15} className="text-indigo-400" />
                              <span>Recruiter</span>
                            </div>
                          )}
                          <span className="absolute bottom-1 left-1.5 px-1.5 py-0.2 rounded bg-slate-950/80 text-[9px] text-slate-200 font-medium">
                            Recruiter
                          </span>
                        </div>

                        {/* Local Candidate Face Cam PiP */}
                        <div className="w-28 sm:w-36 aspect-video rounded-lg overflow-hidden bg-slate-900 border border-slate-700 relative flex items-center justify-center">
                          <video
                            ref={bindLocalVideoRef}
                            autoPlay
                            playsInline
                            muted
                            onLoadedMetadata={(e) => {
                              e.currentTarget.play?.().catch(() => {})
                            }}
                            className={`w-full h-full object-cover scale-x-[-1] ${
                              hasLocalVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                            }`}
                          />
                          {!hasLocalVideo && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] text-slate-400 gap-1 bg-slate-900">
                              <VideoOff size={14} />
                              <span>Cam Off</span>
                            </div>
                          )}
                          <span className="absolute bottom-1 left-1.5 px-1.5 py-0.2 rounded bg-slate-950/80 text-[9px] text-slate-200 font-medium">
                            You {micMuted ? '(Muted)' : ''}
                          </span>
                        </div>
                      </div>

                      {miniCollapsed && (
                        <div
                          onClick={() => setMiniCollapsed(false)}
                          className="text-[10px] text-slate-400 hover:text-indigo-300 cursor-pointer px-1 py-0.5 flex items-center gap-1.5"
                        >
                          <UserCheck size={12} className="text-indigo-400" />
                          <span>Live Call · Click to Expand</span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        ) : (
          /* ── Standard 2-Way Video Call Stage (Google Meet Dual-Tile / Spotlight) ── */
          <div className="relative w-full h-[64vh] min-h-[380px] max-h-[720px] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shadow-2xl flex items-center justify-center">
            {externalCallMode ? (
              <div className="flex flex-col items-center justify-center text-center px-6 py-8 max-w-lg">
                <div className="w-20 h-20 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center mb-5">
                  <MonitorSmartphone size={36} className="text-sky-400" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
                  External Video Call (Google Meet / Zoom)
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed mb-6">
                  Your recruiter is conducting this live call via an external video platform. Built-in camera and
                  microphone in this browser tab are paused so your Meet/Zoom audio works smoothly.
                </p>

                {externalMeetingUrl ? (
                  <a
                    href={externalMeetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm shadow-lg shadow-sky-950/50 transition mb-4"
                  >
                    <ExternalLink size={18} />
                    <span>Join Google Meet / Zoom Call</span>
                  </a>
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700 text-xs sm:text-sm text-amber-200 mb-4 flex items-center gap-2">
                    <RefreshCw size={15} className="animate-spin text-amber-400 shrink-0" />
                    <span>Waiting for your recruiter to share the Google Meet or Zoom link...</span>
                  </div>
                )}

                <p className="text-xs text-slate-400 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5">
                  Keep this HireIQ tab open during your call to receive live discussion questions and coding challenges.
                </p>
              </div>
            ) : (
              <div
                className={`relative w-full h-full ${
                  callLayoutMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-slate-950'
                    : 'relative bg-slate-900'
                }`}
              >
                {/* Google Meet Layout Switcher (Grid vs Spotlight PiP) */}
                <div className="absolute top-4 right-4 z-30 flex items-center gap-1 p-1 rounded-xl bg-slate-950/80 backdrop-blur border border-slate-700/70 shadow-lg">
                  <button
                    type="button"
                    onClick={() => setCallLayoutMode('grid')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      callLayoutMode === 'grid'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Google Meet side-by-side grid view"
                  >
                    <LayoutGrid size={12} />
                    <span>Grid</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallLayoutMode('spotlight')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition ${
                      callLayoutMode === 'spotlight'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Spotlight recruiter with corner self-view"
                  >
                    <User size={12} />
                    <span>Spotlight</span>
                  </button>
                </div>

                {/* Tile 1: Remote Recruiter Video */}
                <div
                  className={
                    callLayoutMode === 'grid'
                      ? 'relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-center'
                      : 'relative w-full h-full flex items-center justify-center'
                  }
                >
                  <video
                    ref={bindRemoteVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      e.currentTarget.play?.().catch(() => {})
                      if (e.currentTarget.videoWidth > 0) setRemoteVideoHasFrames(true)
                    }}
                    onCanPlay={(e) => {
                      e.currentTarget.play?.().catch(() => {})
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
                  {/* Remote audio stream handled by root <audio> element */}

                  {!hasRemoteVideo && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 bg-slate-900/95">
                      <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mb-4">
                        <UserCheck size={34} className="text-indigo-400" />
                      </div>
                      <h2 className="text-base sm:text-lg font-semibold text-white mb-1">
                        {callStatus === 'connected'
                          ? 'Recruiter Audio Connected (Camera Off)'
                          : peerConnected
                          ? `Recruiter Connected (${iceState})...`
                          : 'Waiting for Recruiter to Join'}
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 max-w-sm">
                        Stay right here — as soon as your recruiter joins the cockpit room, you will see and hear them live.
                      </p>
                    </div>
                  )}

                  {/* Recruiter Name Pill (Google Meet bottom-left style) */}
                  <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-slate-950/75 backdrop-blur border border-slate-700/70 text-xs font-medium text-slate-100 z-10 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${peerConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                    <span>Recruiter</span>
                  </div>
                </div>

                {/* Tile 2: Candidate's Own Face Cam ("You") — Always Visible like Google Meet */}
                <div
                  className={
                    callLayoutMode === 'grid'
                      ? 'relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-lg flex items-center justify-center'
                      : 'absolute bottom-4 right-4 w-40 sm:w-56 aspect-video rounded-xl overflow-hidden bg-slate-800 border-2 border-slate-700 shadow-2xl flex items-center justify-center z-20'
                  }
                >
                  <video
                    ref={bindLocalVideoRef}
                    autoPlay
                    playsInline
                    muted
                    onLoadedMetadata={(e) => {
                      e.currentTarget.play?.().catch(() => {})
                    }}
                    onCanPlay={(e) => {
                      e.currentTarget.play?.().catch(() => {})
                    }}
                    className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-200 ${
                      hasLocalVideo ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  />
                  {!hasLocalVideo && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs gap-2 bg-slate-900">
                      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <VideoOff size={22} className="text-slate-400" />
                      </div>
                      <span>Your Camera is Off</span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 px-3 py-1 rounded-lg bg-slate-950/75 backdrop-blur border border-slate-700/70 text-xs font-medium text-slate-100 z-10 flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${micMuted ? 'bg-rose-400' : micLevel > 8 ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500/70'}`} />
                    <span>{sessionInfo?.candidate_name ? `${sessionInfo.candidate_name} (You)` : 'You'}{micMuted ? ' · Muted' : ''}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Bottom Controls Bar */}
      <footer className="pb-6 pt-2 px-4 flex items-center justify-center gap-3 shrink-0 z-20">
        {!externalCallMode && (
          <>
            <button
              onClick={toggleMic}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition border ${
                micMuted
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
              }`}
            >
              {micMuted ? <MicOff size={18} /> : <Mic size={18} className={micLevel > 8 ? 'text-emerald-400' : ''} />}
              <span>{micMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
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
              className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm transition border ${
                camOff
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-200 hover:bg-rose-500/30'
                  : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
              }`}
            >
              {camOff ? <VideoOff size={18} /> : <Video size={18} />}
              <span>{camOff ? 'Start Camera' : 'Stop Camera'}</span>
            </button>

            <button
              onClick={reconnectCall}
              title="Refresh Audio/Video Connection"
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-medium text-sm bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition"
            >
              <RefreshCw size={16} />
              <span className="hidden sm:inline">Reconnect</span>
            </button>
          </>
        )}

        <button
          onClick={() => setConfirmLeave(true)}
          className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm bg-rose-600 hover:bg-rose-500 text-white shadow-lg transition"
        >
          <PhoneOff size={18} />
          <span>Leave Call</span>
        </button>
      </footer>

      {/* Confirm Leave Modal */}
      {confirmLeave && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Leave Live Call?</h3>
            <p className="text-sm text-slate-300 mb-5">
              If your interview is still in progress, you can stay or leave once the recruiter confirms completion.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmLeave(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium"
              >
                Stay in Call
              </button>
              <button
                onClick={handleLeaveCall}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold"
              >
                Leave Room
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
