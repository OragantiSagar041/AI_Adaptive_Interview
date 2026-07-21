/**
 * VoiceInterviewPage.jsx — Master orchestrator
 * Micro1-style conversational AI interview with:
 *   Round 1: Verbal (conversational with AI follow-ups, chat-bubble UI)
 *   Round 2: Coding (Monaco Editor + live code sentinel)
 *   Round 3: Case Study (branching AI discussion)
 */
import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Mic, MicOff,
  CheckCircle, Video, Monitor, Info, Camera,
  AlertCircle
} from 'lucide-react'

// Internal Components
import ErrorBoundary from '../components/ErrorBoundary'
const VoiceCodingRound = React.lazy(() => import('./VoiceCodingRound'))
const VoiceCaseStudy = React.lazy(() => import('./VoiceCaseStudy'))
import { API_BASE_URL } from '../apiConfig'
import useCandidateWebRTC from '../hooks/useCandidateWebRTC'
import OrbAvatar from '../components/OrbAvatar'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { RefreshCw } from 'lucide-react'
import aiVideoUrl from '../assets/ai_avatar.mp4'
import { useProctoring } from '../hooks/useProctoring'
import { useScreenshotProtection } from '../hooks/useScreenshotProtection'
import { useExamSecurity } from '../hooks/useExamSecurity'
import DeviceCheckModal from '../components/DeviceCheckModal'

import { VOICE_TRANSLATIONS } from '../utils/voiceTranslations'

// ── Video Avatar Component ────────────────────────────────────────────────────
function VideoAvatar({ status, size = 220 }) {
  const videoRef = useRef(null)
  const isSpeaking = status === 'speaking'

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isSpeaking) {
      video.play().catch(() => { })
    } else {
      video.pause()
      // Reset to frame 0 when not speaking so it's ready for next time
      if (!isSpeaking) video.currentTime = 0
    }
  }, [isSpeaking])

  const ringColor = status === 'speaking'
    ? 'rgba(168,85,247,0.7)'
    : status === 'listening'
      ? 'rgba(16,185,129,0.6)'
      : 'rgba(99,102,241,0.35)'

  const glowColor = status === 'speaking'
    ? '0 0 50px rgba(168,85,247,0.6), 0 0 100px rgba(168,85,247,0.25)'
    : status === 'listening'
      ? '0 0 40px rgba(16,185,129,0.5), 0 0 80px rgba(16,185,129,0.2)'
      : '0 0 20px rgba(99,102,241,0.2)'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {/* Animated ring */}
      {(status === 'speaking' || status === 'listening') && (
        <div style={{
          position: 'absolute', inset: -8,
          borderRadius: '50%',
          border: `2px solid ${ringColor}`,
          animation: status === 'speaking' ? 'vidRingSpeak 1.4s ease-in-out infinite' : 'vidRingListen 2s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }} />
      )}
      {/* Outer glow ring */}
      {(status === 'speaking' || status === 'listening') && (
        <div style={{
          position: 'absolute', inset: -18,
          borderRadius: '50%',
          border: `1px solid ${ringColor.replace('0.7', '0.25').replace('0.6', '0.2')}`,
          animation: status === 'speaking' ? 'vidRingSpeak 1.4s ease-in-out 0.4s infinite' : 'vidRingListen 2s ease-in-out 0.5s infinite alternate',
          pointerEvents: 'none',
        }} />
      )}
      {/* Video circle */}
      <video
        ref={videoRef}
        src={aiVideoUrl}
        loop
        muted={false}
        playsInline
        preload="auto"
        style={{
          width: size,
          height: size,
          objectFit: 'cover',
          borderRadius: '50%',
          boxShadow: glowColor,
          border: `3px solid ${ringColor}`,
          transition: 'box-shadow 0.5s ease, border-color 0.5s ease',
          display: 'block',
          background: '#0a0f1e',
        }}
      />
      {/* Overlay label */}
      {status === 'idle' && (
        <div style={{
          position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 20, padding: '2px 10px', fontSize: 10, color: '#818cf8',
          fontWeight: 700, letterSpacing: '0.1em', whiteSpace: 'nowrap',
        }}>ZARA · READY</div>
      )}
    </div>
  )
}

// ── Language map ─────────────────────────────────────────────────────────────
const langMap = {
  'Hindi': 'hi-IN', 'Telugu': 'te-IN', 'Tamil': 'ta-IN',
  'Malayalam': 'ml-IN', 'Kannada': 'kn-IN', 'English': 'en-US'
}

// ── Conversational follow-up engine ──────────────────────────────────────────
const FOLLOWUP_MAP = [
  {
    keywords: ['react', 'vue', 'angular', 'frontend', 'ui', 'component', 'hook'],
    questions: ["Can you tell me more about which state management approach you prefer?", "How do you handle performance optimization in frontend applications?", "Walk me through how you'd architect a complex React app."]
  },
  {
    keywords: ['python', 'java', 'node', 'backend', 'api', 'rest', 'graphql', 'server'],
    questions: ["How do you handle error management and logging in your backend services?", "Can you describe a time you improved API performance significantly?", "How do you approach securing REST APIs?"]
  },
  {
    keywords: ['team', 'lead', 'mentor', 'manage', 'collaborate', 'agile', 'scrum'],
    questions: ["How do you handle disagreements within your team?", "Tell me about a time you had to give critical feedback to a peer.", "How do you keep your team aligned when requirements change frequently?"]
  },
  {
    keywords: ['challenge', 'difficult', 'problem', 'solved', 'debug', 'issue', 'bug'],
    questions: ["What made that problem particularly challenging?", "How did that experience change your approach to similar problems?", "What would you do differently looking back?"]
  },
  {
    keywords: ['database', 'sql', 'nosql', 'mongo', 'postgres', 'redis', 'query'],
    questions: ["How do you decide between SQL and NoSQL for a given problem?", "Walk me through how you'd optimize a slow database query.", "How do you think about data modeling for scalability?"]
  },
  {
    keywords: ['ml', 'ai', 'machine learning', 'model', 'neural', 'data science', 'training'],
    questions: ["How do you validate that an ML model is production-ready?", "How do you handle data drift in deployed models?", "Walk me through your feature engineering process."]
  },
  {
    keywords: ['cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'devops', 'deploy', 'ci'],
    questions: ["How do you approach zero-downtime deployments?", "Describe your ideal CI/CD pipeline.", "How do you handle infrastructure costs at scale?"]
  },
]

function getFollowUp(transcript, usedIdx, language = 'English') {
  const text = transcript.toLowerCase()
  for (const entry of FOLLOWUP_MAP) {
    if (entry.keywords.some(k => text.includes(k))) {
      const unused = entry.questions.filter((_, i) => !usedIdx.has(entry.questions.indexOf(entry.questions[i])))
      if (unused.length) return unused[0]
    }
  }
  const t = VOICE_TRANSLATIONS[language] || VOICE_TRANSLATIONS['English']
  const generics = t.generics
  return generics[Math.floor(Math.random() * generics.length)]
}

// ── Chat Bubble ───────────────────────────────────────────────────────────────
function Bubble({ role, text, isNew }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => { setTimeout(() => setVisible(true), 50) }, [])
  return (
    <div className={`flex gap-3 mb-4 transition-all duration-500 ${role === 'user' ? 'flex-row-reverse' : ''} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
      {role === 'ai' ? (
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden border-2 border-indigo-500/40">
          <video src={aiVideoUrl} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/15 border-2 border-emerald-500/30">
          <i className="fas fa-user text-sm text-emerald-400" />
        </div>
      )}
      <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${role === 'ai'
        ? 'bg-indigo-500/10 border border-indigo-500/15 text-slate-200 rounded-tl-none'
        : 'bg-emerald-500/10 border border-emerald-500/15 text-slate-200 rounded-tr-none'
        }`}>
        {role === 'ai' && <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block mb-1">Zara</span>}
        {text}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VoiceInterviewPage() {
  const { linkId } = useParams()

  const _sessionKey = linkId ? `voice_session_${linkId}` : null
  const _savedSession = _sessionKey ? (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || 'null') } catch { return null } })() : null

  // Session
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [sessionDetail, setSessionDetail] = useState(null)
  const [questions, setQuestions] = useState([])
  const [codingQuestion, setCodingQuestion] = useState(null)
  const [caseStudyQuestions, setCaseStudyQuestions] = useState([])
  const [interviewId, setInterviewId] = useState('')
  const [monitoringToken, setMonitoringToken] = useState('')
  const [language, setLanguage] = useState('English')
  const [interviewType, setInterviewType] = useState('Technical')

  // Round control
  const [round, setRound] = useState('pre_checks')
  // 'pre_checks' | 'voice_clone_setup' | 'intro' | 'verbal' | 'coding' | 'case_study' | 'done'
  const [permissionsGranted, setPermissionsGranted] = useState(false)
  const [showDeviceCheck, setShowDeviceCheck] = useState(false)

  // Voice Cloning
  const [voiceCloneId, setVoiceCloneId] = useState(null)   // ElevenLabs voice_id for this session
  const voiceCloneIdRef = useRef(null)
  const voiceCloningEnabledRef = useRef(false)
  const [vcStep, setVcStep] = useState('idle')             // 'idle' | 'recording' | 'uploading' | 'done' | 'error'
  const [vcError, setVcError] = useState('')
  const vcMediaRecorderRef = useRef(null)
  const vcChunksRef = useRef([])
  useEffect(() => { voiceCloneIdRef.current = voiceCloneId }, [voiceCloneId])

  // Verbal interview state
  const [chatMessages, setChatMessages] = useState([])
  const [currentQIdx, setCurrentQIdx] = useState(_savedSession?.currentQIdx || 0)
  const [aiStatus, setAiStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [proctoringBanner, setProctoringBanner] = useState(null)
  const [interimText, setInterimText] = useState('')
  const [countdown, setCountdown] = useState(0)
  const [roundDuration, setRoundDuration] = useState(900)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [followUpCount, setFollowUpCount] = useState(0)  // follow-ups per question
  const [warningsCount, setWarningsCount] = useState(0)
  const [proctoringState, setProctoringState] = useState({
    modelsReady: false,
    faceVisible: null,
    faceCount: 0,
    multiFace: false,
    phoneDetected: false,
    eyeContactLost: false,
    lastAlertType: ''
  })
  const integrityMetricsRef = useRef({
    reason: 'normal',
    tabSwitches: 0,
    faceAlerts: 0,
    noiseAlerts: 0,
    fullscreenExits: 0
  })
  const screenShareViolationsRef = useRef(0)
  const screenShareViolationHandlerRef = useRef(null)  // stable ref to avoid circular deps
  const usedFollowUps = useRef(new Set())
  const [displayedQuestion, setDisplayedQuestion] = useState('')  // typewriter text
  const [isTyping, setIsTyping] = useState(false)              // typewriter running
  const typewriterRef = useRef(null)

  // Screen recording & WebRTC
  const mediaRecorderRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const recordedChunksRef = useRef([])
  const [isRecording, setIsRecording] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [feedbackSuccess, setFeedbackSuccess] = useState(false)
  const activeAudioRef = useRef(null)

  // Camera recording
  const cameraRecorderRef = useRef(null)
  const cameraStreamRef = useRef(null)
  const cameraChunksRef = useRef([])
  const candidateVideoRef = useRef(null)
  


  // Initialize WebRTC
  const telemetryData = {
    round_type: ['verbal', 'coding', 'case_study'].includes(round) ? round : 'verbal',
    status: aiStatus === 'idle' ? 'online' : aiStatus,
    proctoring_alerts: warningsCount,
    proctoring_status: proctoringState,
    current_question: currentQIdx + 1,
    total_questions: questions.length || 0,
    question_text: questions[currentQIdx] ? questions[currentQIdx].question_text : ''
  }
  useCandidateWebRTC(linkId, cameraStreamRef, telemetryData, monitoringToken)

  // Refs
  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const isListeningRef = useRef(false)
  const currentTxRef = useRef('')
  const submittingRef = useRef(false)
  const currentQIdxRef = useRef(0)
  const questionsRef = useRef([])
  const interviewIdRef = useRef('')
  const sessionDetailRef = useRef(null)
  const roundRef = useRef('pre_checks')
  const chatBottomRef = useRef(null)
  const wsRef = useRef(null)
  const languageRef = useRef('English')
  const currentAudioRef = useRef(null)    // ← tracks active TTS audio so stopAudio() can kill it
  const isTransitioningRef = useRef(false)
  // Camera preview element for proctoring - must remain VISIBLE (even if small) for browser to
  // keep decoding frames. A fully hidden/off-screen video gets throttled by Chrome and freezes
  // causing MediaPipe to never detect faces.
  const attachVideo = useCallback((node) => {
    candidateVideoRef.current = node
    if (node && cameraStreamRef.current) {
      if (node.srcObject !== cameraStreamRef.current) {
        node.srcObject = cameraStreamRef.current
        node.muted = true
        node.play().catch(e => console.log(e))
      }
    }
  }, [])

  const candidateVideoElement = (
    <video
      ref={attachVideo}
      playsInline
      muted
      autoPlay
      style={{
        position: 'fixed',
        bottom: '16px',
        left: '16px',
        width: '96px',
        height: '72px',
        objectFit: 'cover',
        borderRadius: '10px',
        border: '2px solid rgba(99,102,241,0.4)',
        zIndex: 50,
        opacity: 1,
        pointerEvents: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        transform: 'scaleX(-1)', // mirror effect
      }}
    />
  )

  // Ensure stream stays attached across round transitions
  useEffect(() => {
    if (candidateVideoRef.current && cameraStreamRef.current) {
      if (candidateVideoRef.current.srcObject !== cameraStreamRef.current) {
        candidateVideoRef.current.srcObject = cameraStreamRef.current
        candidateVideoRef.current.muted = true
        candidateVideoRef.current.play().catch(e => console.log(e))
      }
    }
  }, [round])

  // Sync refs
  useEffect(() => { currentQIdxRef.current = currentQIdx }, [currentQIdx])
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { interviewIdRef.current = interviewId }, [interviewId])
  useEffect(() => { sessionDetailRef.current = sessionDetail }, [sessionDetail])
  useEffect(() => { roundRef.current = round }, [round])
  useEffect(() => { languageRef.current = language }, [language])
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  useEffect(() => {
    if (!linkId) return
    const wsUrl = API_BASE_URL.replace('http', 'ws') + `/ws/interview/${linkId}`
    const ws = new WebSocket(wsUrl)
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'ai_state' && roundRef.current === 'verbal') {
          // Can sync state from backend if needed
        }
      } catch (e) { }
    }
    wsRef.current = ws
    return () => ws.close()
  }, [linkId])

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`


  // ── Persistence & Unload Tracking ──────────────────────────────────────────
  useEffect(() => {
    const handleUnload = () => {
      if (!linkId) return
      const roundNow = roundRef.current
      // If interview is actively in progress (not done/intro/pre_checks), auto-complete it
      if (roundNow && roundNow !== 'done' && roundNow !== 'intro' && roundNow !== 'pre_checks') {
        // sendBeacon is the ONLY reliable way to fire a request on tab close
        navigator.sendBeacon(
          `${API_BASE_URL}/complete-session/${linkId}?warnings=${warningsCount}&reason=tab_closed`,
          JSON.stringify({ reason: 'candidate_exited', timestamp: new Date().toISOString() })
        )
      }
    }
    // pagehide fires on mobile browsers where beforeunload is unreliable
    window.addEventListener('beforeunload', handleUnload)
    window.addEventListener('pagehide', handleUnload)
    return () => {
      window.removeEventListener('beforeunload', handleUnload)
      window.removeEventListener('pagehide', handleUnload)
    }
  }, [linkId, warningsCount])

  // ── Screenshot / Screen-capture Prevention ───────────────────────────────
  // Active while the interview is in progress. Silently swallows PrintScreen,
  // Win+Shift+S, Ctrl+P, Ctrl+Shift+S, Alt+PrintScreen. No alerts shown.
  // Also applies @media print guard so print-to-PDF capture shows a blank page.
  useEffect(() => {
    const interviewActive = round && round !== 'pre_checks' && round !== 'done'
    if (!interviewActive) return

    const BLOCKED_KEYS = new Set(['PrintScreen', 'Snapshot'])

    const handleKeyDown = (e) => {
      const key = e.key
      const ctrl = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      const alt = e.altKey

      if (BLOCKED_KEYS.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); return }
      if ((e.metaKey || key === 'Meta') && shift && key === 'S') { e.preventDefault(); e.stopImmediatePropagation(); return }
      if (ctrl && shift && key === 'S') { e.preventDefault(); e.stopImmediatePropagation(); return }
      if (ctrl && (key === 'p' || key === 'P')) { e.preventDefault(); e.stopImmediatePropagation(); return }
      if (ctrl && shift && (key === 'p' || key === 'P')) { e.preventDefault(); e.stopImmediatePropagation(); return }
      if (alt && BLOCKED_KEYS.has(key)) { e.preventDefault(); e.stopImmediatePropagation(); return }
    }

    const handleKeyUp = (e) => {
      if (BLOCKED_KEYS.has(e.key)) { e.preventDefault(); e.stopImmediatePropagation() }
    }

    const handleKeyPress = (e) => {
      if (BLOCKED_KEYS.has(e.key)) {
        e.preventDefault(); e.stopImmediatePropagation()
        try { navigator.clipboard.writeText('') } catch (_) { /* no-op */ }
      }
    }

    const styleEl = document.createElement('style')
    styleEl.id = 'voice-interview-screenshot-guard'
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

    document.addEventListener('keydown',  handleKeyDown,  true)
    document.addEventListener('keyup',    handleKeyUp,    true)
    document.addEventListener('keypress', handleKeyPress, true)

    return () => {
      document.removeEventListener('keydown',  handleKeyDown,  true)
      document.removeEventListener('keyup',    handleKeyUp,    true)
      document.removeEventListener('keypress', handleKeyPress, true)
      document.getElementById('voice-interview-screenshot-guard')?.remove()
    }
  }, [round])
  // ─────────────────────────────────────────────────────────────────────────


  useEffect(() => {
    if (!_sessionKey) return
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
    if (round === 'verbal' && !existing.startedAt) {
      sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, startedAt: Date.now() }))
    }
  }, [round, _sessionKey])


  useEffect(() => {
    if (!_sessionKey) return
    const existing = (() => { try { return JSON.parse(sessionStorage.getItem(_sessionKey) || '{}') } catch { return {} } })()
    sessionStorage.setItem(_sessionKey, JSON.stringify({ ...existing, currentQIdx }))
  }, [currentQIdx, _sessionKey])

  // ── Load Session ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!linkId) { setError('Missing session ID.'); setLoading(false); return }
    async function init() {
      try {
        const r = await fetch(`${API_BASE_URL}/session/${linkId}`)
        const d = await r.json()
        if (!r.ok || d.status !== 'success') throw new Error(d.detail || 'Session not found.')
        if (d.is_deactivated) throw new Error('This link is deactivated.')
        if (d.is_expired) throw new Error('This link has expired.')
        if (d.session_status === 'completed') throw new Error('Interview already completed.')
        setSessionDetail(d)
        const langVal = d.language || 'English'
        setLanguage(langVal.charAt(0).toUpperCase() + langVal.slice(1).toLowerCase())
        setInterviewType(d.interview_type || 'Technical')
        // Read voice_clone flag set by admin when creating the session
        voiceCloningEnabledRef.current = !!(d.voice_clone)
        if (d.custom_voice_id) {
          voiceCloneIdRef.current = d.custom_voice_id;
        }

        // Calculate duration based on rounds
        const typeStr = d.interview_type || 'Technical'
        let numRounds = 1;
        if (typeStr.includes('Coding') && typeStr.includes('Case Study')) numRounds = 3;
        else if (typeStr === 'Technical' || typeStr === 'Non-Technical' || typeStr.includes('Coding') || typeStr.includes('Case Study')) numRounds = 2;

        const durationPerRound = Math.floor((d.interview_duration || 30) * 60 / numRounds);
        setRoundDuration(durationPerRound);
        if (_savedSession?.startedAt) {
          const elapsed = Math.floor((Date.now() - _savedSession.startedAt) / 1000);
          setCountdown(Math.max(0, durationPerRound - elapsed));
        } else {
          setCountdown(durationPerRound);
        }

        const fd = new FormData(); fd.append('link_id', linkId)
        const sr = await fetch(`${API_BASE_URL}/start-session-interview`, { method: 'POST', body: fd })
        const sd = await sr.json()
        if (!sr.ok) throw new Error(sd.detail || 'Failed to start session.')
        if (sd.session_status === 'completed') throw new Error('Interview already completed.')

        const qs = (sd.questions?.length ? sd.questions : sd.first_question ? [sd.first_question] : [])
          .map((q, i) => ({ ...q, id: q.id ?? i + 1, text: q.text || q.question || q.prompt || '', type: q.type || 'Interview' }))
          .filter(q => q.type !== 'coding' && q.type !== 'case_study') // verbal only

        if (!qs.length) throw new Error('No questions found for this session.')
        setQuestions(qs)
        setInterviewId(sd.interview_id || '')
        setMonitoringToken(sd.monitoring_token || '')
        setLoading(false)
      } catch (e) { setError(e.message); setLoading(false) }
    }
    init()
  }, [linkId])

  // ── TTS with female voice ──────────────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (activeAudioRef.current) {
      activeAudioRef.current.onended = null
      activeAudioRef.current.onerror = null
      activeAudioRef.current.pause()
      activeAudioRef.current.src = ''
      activeAudioRef.current = null
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.onended = null
      currentAudioRef.current.onerror = null
      currentAudioRef.current.pause()
      currentAudioRef.current.src = ''
      currentAudioRef.current = null
    }
  }, [])
  const speak = useCallback(async (text, onEnd) => {
    stopAudio()  // cancel any previous audio first
    try {
      setAiStatus('speaking')
      const res = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: 'shimmer',
          language: languageRef.current,
          use_custom_voice: voiceCloningEnabledRef.current,
          // voice_id from CARTESIA_VOICE_ID env var is used server-side by default
          // Per-session override only if explicitly set (e.g. future cloning flow)
          ...(voiceCloneIdRef.current ? { voice_id: voiceCloneIdRef.current } : {})
        })
      })
      if (!res.ok) throw new Error('TTS Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      activeAudioRef.current = audio
      audio.onended = () => {
        currentAudioRef.current = null
        setAiStatus('listening')
        URL.revokeObjectURL(url)
        activeAudioRef.current = null
        onEnd?.()
      }
      audio.onerror = () => {
        currentAudioRef.current = null
        setAiStatus('idle')
        activeAudioRef.current = null
        onEnd?.()
      }
      audio.play().catch(() => {
        currentAudioRef.current = null
        setAiStatus('idle')
        onEnd?.()
      })
    } catch (e) {
      setAiStatus('idle')
      onEnd?.()
    }
  }, [stopAudio])

  const addMsg = useCallback((role, text) => setChatMessages(p => [...p, { role, text }]), [])
  const aiSay = useCallback((text, onEnd) => {
    if (isTransitioningRef.current || roundRef.current === 'done') return;
    addMsg('ai', text); speak(text, onEnd)
  }, [addMsg, speak])

  // ── Typewriter helper ─────────────────────────────────────────────────────
  const typewrite = useCallback((text, onDone) => {
    clearTimeout(typewriterRef.current)
    setDisplayedQuestion('')
    setIsTyping(true)
    let i = 0
    const step = () => {
      i++
      setDisplayedQuestion(text.slice(0, i))
      if (i < text.length) {
        typewriterRef.current = setTimeout(step, 22)
      } else {
        setIsTyping(false)
        onDone?.()
      }
    }
    typewriterRef.current = setTimeout(step, 30)
  }, [])

  // Update typewriter whenever question changes
  useEffect(() => {
    const q = questions[currentQIdx]
    if (q?.text) typewrite(q.text)
  }, [currentQIdx, questions])  

  // ── Screen & Camera Recording ───────────────────────────────────────────────
  const startScreenRecording = useCallback(async () => {
    if (!sessionDetailRef.current?.record_video) return;

    try {
      // Force fullscreen mode
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => { })
      }

      // 1. Get Screen Stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: 15, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      })

      // Re-request fullscreen after the picker closes, as browsers typically exit fullscreen to show the dialog
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen().catch(() => { })
      }

      const videoTrack = screenStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        screenStream.getTracks().forEach(t => t.stop());
        throw new Error("Please select 'Entire Screen' when sharing. Window or Tab sharing is not allowed.");
      }

      // 2. Get Camera & Mic Stream
      let micStream = cameraStreamRef.current
      try {
        if (!micStream || micStream.getTracks().some(t => t.readyState === 'ended')) {
          micStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
          cameraStreamRef.current = micStream
        }

        // Start Camera Recorder
        const cameraMr = new MediaRecorder(micStream, { mimeType: 'video/webm' })
        cameraChunksRef.current = []
        cameraMr.ondataavailable = e => { if (e.data.size > 0) cameraChunksRef.current.push(e.data) }
        cameraMr.start(5000)
        cameraRecorderRef.current = cameraMr

        // Attach for Proctoring
        if (candidateVideoRef.current) {
          candidateVideoRef.current.srcObject = micStream;
          candidateVideoRef.current.muted = true;
          candidateVideoRef.current.play().catch(e => console.log(e));
        }
      } catch (err) {
        console.warn("Could not get camera/mic stream for recording:", err)
      }

      // 3. Mix audio for Screen Recording (so screen has mic audio too)
      if (micStream) {
        const ctx = new AudioContext()
        const dest = ctx.createMediaStreamDestination()
        micStream.getAudioTracks().forEach(t => {
          const src = ctx.createMediaStreamSource(new MediaStream([t]))
          src.connect(dest)
        })
        screenStream.getAudioTracks().forEach(t => {
          const src = ctx.createMediaStreamSource(new MediaStream([t]))
          src.connect(dest)
        })
        const combinedScreen = new MediaStream([...screenStream.getVideoTracks(), ...dest.stream.getAudioTracks()])
        mediaStreamRef.current = combinedScreen

        const mr = new MediaRecorder(combinedScreen, { mimeType: 'video/webm;codecs=vp8,opus' })
        recordedChunksRef.current = []
        mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
        mr.start(5000)
        mediaRecorderRef.current = mr
      } else {
        mediaStreamRef.current = screenStream
        const mr = new MediaRecorder(screenStream, { mimeType: 'video/webm' })
        recordedChunksRef.current = []
        mr.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data) }
        mr.start(5000)
        mediaRecorderRef.current = mr
      }

      setIsRecording(true)
    } catch (e) {
      console.warn('Screen recording not available or denied:', e)
    }
  }, [])

  const stopAndUploadRecording = useCallback(async (iid) => {
    const screenMr = mediaRecorderRef.current
    const cameraMr = cameraRecorderRef.current

    setIsRecording(false)

    const uploads = []

    // 1. Upload Screen Recording
    if (screenMr && screenMr.state !== 'inactive') {
      const screenPromise = new Promise(resolve => {
        screenMr.onstop = async () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
          if (blob.size >= 1000) {
            const fd = new FormData()
            fd.append('interview_id', iid)
            fd.append('link_id', linkId || '')
            fd.append('recording_type', 'screen')
            fd.append('file', blob, 'screen_recording.webm')
            try {
              await fetch(`${API_BASE_URL}/upload-full-recording`, { method: 'POST', body: fd })
              // Screen recording successfully uploaded
            } catch (e) {
              console.warn('Screen upload failed:', e)
            }
          }
          resolve()
        }
        screenMr.stop()
        mediaStreamRef.current?.getTracks().forEach(t => t.stop())
      })
      uploads.push(screenPromise)
    }

    // 2. Upload Camera Recording
    if (cameraMr && cameraMr.state !== 'inactive') {
      const cameraPromise = new Promise(resolve => {
        cameraMr.onstop = async () => {
          const blob = new Blob(cameraChunksRef.current, { type: 'video/webm' })
          if (blob.size >= 1000) {
            const fd = new FormData()
            fd.append('interview_id', iid)
            fd.append('link_id', linkId || '')
            fd.append('recording_type', 'camera')
            fd.append('file', blob, 'camera_recording.webm')
            try {
              await fetch(`${API_BASE_URL}/upload-full-recording`, { method: 'POST', body: fd })
              // Camera recording successfully uploaded
            } catch (e) {
              console.warn('Camera upload failed:', e)
            }
          }
          resolve()
        }
        cameraMr.stop()
        cameraStreamRef.current?.getTracks().forEach(t => t.stop())
      })
      uploads.push(cameraPromise)
    }

    await Promise.all(uploads)
  }, [linkId])

  // ── STT ───────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    isListeningRef.current = false
    clearTimeout(silenceTimerRef.current)
    try { recognitionRef.current?.stop() } catch (_) { }
    recognitionRef.current = null
    stopAudio()   // ← also kill any in-flight TTS so it doesn't bleed into next state
    setInterimText('')   // clear cursor indicator but KEEP transcript so user sees what was captured
    setAiStatus('idle')
  }, [stopAudio])

  const startListening = useCallback((onFinish) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      isListeningRef.current = false
      setAiStatus('idle')
      Swal.fire({
        title: 'Voice Recognition Unavailable',
        text: 'This browser does not support live speech recognition. Please continue in the latest Chrome or Edge browser.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
        allowOutsideClick: false,
      })
      return
    }

    // Always clean up previous instance first
    try { recognitionRef.current?.stop() } catch (_) { }
    recognitionRef.current = null

    const rec = new SR()
    rec.lang = langMap[languageRef.current] || 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 1
    recognitionRef.current = rec
    isListeningRef.current = true
    currentTxRef.current = ''
    setTranscript('')
    setInterimText('')
    setAiStatus('listening')

    // Grace period: if nothing heard in 10s, auto-submit
    clearTimeout(silenceTimerRef.current)
    silenceTimerRef.current = setTimeout(() => {
      if (isListeningRef.current) { stopListening(); onFinish?.(currentTxRef.current.trim()) }
    }, 10000)

    rec.onresult = ev => {
      if (!isListeningRef.current) return
      let fin = '', interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) fin += ev.results[i][0].transcript
        else interim += ev.results[i][0].transcript
      }
      if (fin) { currentTxRef.current += fin + ' '; setTranscript(currentTxRef.current) }
      setInterimText(interim)

      // Reset silence timer whenever speech is heard
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) { stopListening(); onFinish?.(currentTxRef.current.trim()) }
      }, 10000)
    }

    // ── Smart error handler ────────────────────────────────────────────────
    rec.onerror = (e) => {
      const err = e.error
      if (err === 'no-speech') {
        // Not truly a failure — silence detected. Reset timer so we keep waiting.
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = setTimeout(() => {
          if (isListeningRef.current) { stopListening(); onFinish?.(currentTxRef.current.trim()) }
        }, 10000)
        return
      }
      if (err === 'aborted') return  // intentional stop — do nothing

      if (err === 'network') {
        // Network blip: stop current instance, restart after a brief pause
        console.warn('SR: network error — restarting in 1s')
        try { rec.stop() } catch (_) { }
        if (isListeningRef.current) {
          setTimeout(() => {
            if (isListeningRef.current) startListening(onFinish)
          }, 1000)
        }
        return
      }

      // Any other fatal error (not-allowed, service-not-allowed, etc.)
      console.warn('SR:', err)
      stopListening()
      onFinish?.(currentTxRef.current.trim())
    }

    // ── onend: only restart if still intentionally listening ──────────────
    rec.onend = () => {
      if (!isListeningRef.current) return  // we stopped on purpose — don't restart
      // Recognition stopped by itself (common in Chrome) — restart after a short delay
      // to prevent rapid restart storms and InvalidStateError exceptions.
      setTimeout(() => {
        if (!isListeningRef.current) return
        try {
          if (recognitionRef.current === rec) {  // guard: ensure this is still the active instance
            rec.start()
          }
        } catch (e) {
          // InvalidStateError or similar — start a fresh instance
          if (isListeningRef.current) startListening(onFinish)
        }
      }, 150)
    }

    try { rec.start() } catch (e) {
      console.warn('SR start error:', e)
      stopListening()
      onFinish?.('')
    }
  }, [stopListening])

  // ── Handle one verbal answer ──────────────────────────────────────────────
  const handleAnswer = useCallback((answer, qIdx, fupCount) => {
    if (isTransitioningRef.current) return // Prevent any action if transitioning

    const qs = questionsRef.current
    const t = VOICE_TRANSLATIONS[languageRef.current] || VOICE_TRANSLATIONS['English']

    // Check intent
    const lowerAns = answer?.toLowerCase() || ''
    const isSkip = /(skip|next question|move to next|move on|next round)/.test(lowerAns)
    const isRepeat = /(repeat|come again|didn't understand|not understand|what did you say|say that again)/.test(lowerAns)

    if (isSkip) {
      addMsg('user', answer)
      const nextIdx = qIdx + 1
      if (!qs[nextIdx]) {
        aiSay(t.wrapUpVerbal, () => transitionToNextRound())
      } else {
        setCurrentQIdx(nextIdx)
        aiSay(`${t.nextQuestion.replace('[X]', nextIdx + 1)}${qs[nextIdx].text}`, () => startListening(ans => handleAnswer(ans, nextIdx, 0)))
      }
      return
    }

    if (isRepeat) {
      addMsg('user', answer)
      const q = qs[qIdx]
      const prompt = `${t.intro.replace('[NAME]', sessionDetailRef.current?.candidate_name || 'there')}${q.text}` // simplified repeat
      aiSay(q.text, () => startListening(ans => handleAnswer(ans, qIdx, fupCount)))
      return
    }

    if (!answer?.trim()) {
      // 10s silence -> Skip to next question without AI saying anything
      const nextIdx = qIdx + 1
      if (!qs[nextIdx]) {
        transitionToNextRound()
      } else {
        setCurrentQIdx(nextIdx)
        setTimeout(() => startListening(ans => handleAnswer(ans, nextIdx, 0)), 500)
      }
      return
    }
    addMsg('user', answer)

    // Save answer
    const q = questionsRef.current[qIdx]
    if (q && interviewIdRef.current) {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: "save_answer",
          interview_id: interviewIdRef.current,
          question_id: q.id,
          question_text: q.text,
          answer_text: answer,
          candidate_name: sessionDetailRef.current?.candidate_name || 'Candidate',
          timestamp: new Date().toISOString()
        }))
      } else {
        // Fallback to HTTP if WS is closed
        const fd = new FormData()
        fd.append('interview_id', interviewIdRef.current)
        fd.append('question_id', q.id)
        fd.append('question_text', q.text)
        fd.append('answer_text', answer)
        fd.append('candidate_name', sessionDetailRef.current?.candidate_name || 'Candidate')
        fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(() => { })
      }
    }

    // Decide: follow-up or next question
    if (fupCount < 1) {
      const fu = getFollowUp(answer, usedFollowUps.current, languageRef.current)
      if (fu) {
        usedFollowUps.current.add(fu)
        const t = VOICE_TRANSLATIONS[languageRef.current] || VOICE_TRANSLATIONS['English']
        const acks = t.acks
        const ack = acks[Math.floor(Math.random() * acks.length)]
        setTimeout(() => aiSay(`${ack} ${fu}`, () => startListening(ans => handleAnswer(ans, qIdx, fupCount + 1))), 400)
        return
      }
    }

    // Next question
    setAnsweredCount(p => p + 1)
    const nextIdx = qIdx + 1
    if (!qs[nextIdx]) {
      transitionToNextRound()
    } else {
      setCurrentQIdx(nextIdx)
      const t = VOICE_TRANSLATIONS[languageRef.current] || VOICE_TRANSLATIONS['English']
      const acks = t.acks
      const transition = acks[Math.floor(Math.random() * acks.length)] + " "
      setTimeout(() => {
        aiSay(`${transition}${t.nextQuestion.replace('[X]', nextIdx + 1)}${qs[nextIdx].text}`, () => startListening(ans => handleAnswer(ans, nextIdx, 0)))
      }, 500)
    }
  }, [addMsg, aiSay, startListening])  

  // ── Complete interview ────────────────────────────────────────────────────
  const completeInterview = useCallback(async (options = {}) => {
    if (submittingRef.current) return
    submittingRef.current = true
    
    // Fallback for legacy calls that pass a boolean (isTimeout)
    const isTimeout = typeof options === 'boolean' ? options : (options.isTimeout || false)
    const completionReason = typeof options === 'object' && options.reason ? options.reason : 'normal'
    
    integrityMetricsRef.current.reason = completionReason

    stopListening(); window.speechSynthesis?.cancel(); stopAudio()
    const iid = interviewIdRef.current
    const previousRound = roundRef.current

    // Switch UI to submitting immediately
    setRound('submitting')
    
    const message = isTimeout 
      ? "Thank you for the interview. We are saving your interview, please wait."
      : "We are saving your interview, please wait.";
      
    // Speak asynchronously
    aiSay(message)

    // Fire backend completion with detailed integrity metrics
    try {
      const response = await fetch(`${API_BASE_URL}/complete-session/${linkId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warnings: warningsCountRef.current || warningsCount, // use ref if available to avoid stale closures
          reason: integrityMetricsRef.current.reason,
          total_tab_switches: integrityMetricsRef.current.tabSwitches,
          total_face_alerts: integrityMetricsRef.current.faceAlerts,
          total_noise_alerts: integrityMetricsRef.current.noiseAlerts,
          total_fullscreen_exits: integrityMetricsRef.current.fullscreenExits
        })
      })
      if (!response.ok) throw new Error(`Completion failed with status ${response.status}`)
    } catch (completionError) {
      console.error('Failed to complete voice interview:', completionError)
      submittingRef.current = false
      setRound(previousRound)
      Swal.fire({
        title: 'Submission Failed',
        text: 'Your interview could not be finalized. Please check your connection and try again.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
      return
    }
    
    // Upload heavy recording and WAIT for it so it's not lost
    try {
      await stopAndUploadRecording(iid)
    } catch (err) {
      console.error("Recording upload failed:", err)
    }
    
    // Stop audio and mark done ONLY after upload finishes
    stopAudio() 
    setRound('done')
  }, [stopListening, linkId, stopAndUploadRecording, warningsCount, stopAudio, aiSay])

  // ── Load coding/case study round questions ────────────────────────────────
  const transitionToNextRound = useCallback(async (isTimeout = false) => {
    if (submittingRef.current || isTransitioningRef.current) return
    isTransitioningRef.current = true
    stopListening(); window.speechSynthesis?.cancel()
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }

    const type = interviewType
    const iid = interviewIdRef.current
    
    // Check timeout flag
    const timeoutFlag = typeof isTimeout === 'boolean' ? isTimeout : false;

    if (type === 'Technical' || type === 'Non-Technical') {
      setAiStatus('thinking')
      setLoading(true) // Immediately show loading state to candidate
      const t = VOICE_TRANSLATIONS[languageRef.current] || VOICE_TRANSLATIONS['English']

      // Speak transition phrase and wait for it to finish in parallel with fetching
      const speakPromise = new Promise(resolve => {
        addMsg('ai', t.verbalComplete)
        speak(t.verbalComplete, resolve)
      })

      if (type === 'Technical') {
        try {
          const fetchPromise = fetch(`${API_BASE_URL}/coding-round/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interview_id: iid })
          }).then(r => r.json())

          const [_, data] = await Promise.all([speakPromise, fetchPromise])
          const task = data.coding_round?.task || {}
          const codingQ = {
            id: 'coding_1', type: 'coding', text: task.description || task.title || 'Implement the required function',
            codingTask: task, codingTests: data.tests || []
          }
          setCodingQuestion(codingQ)
          isTransitioningRef.current = false  // allow future transitions/retries
          setRound('coding')
          setLoading(false)
        } catch (err) {
          console.error("Coding round start failed:", err)
          isTransitioningRef.current = false  // allow retry
          setError('Failed to load coding round. Please retry.')
          setRound('error')
          setLoading(false)
        }
      } else {
        // Non-Technical → case study
        try {
          const fetchPromise = fetch(`${API_BASE_URL}/case-study/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interview_id: iid })
          }).then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json()
          })

          const [_, data] = await Promise.all([speakPromise, fetchPromise])
          const cqs = (data.case_study_round?.questions || []).map((q, i) => ({
            id: `cs_${i}`, type: 'case_study', text: q.text, caseStudyIndex: i
          }))
          setCaseStudyQuestions(cqs.length ? cqs : [{ id: 'cs_0', type: 'case_study', text: data.scenario || 'Present your business case.', caseStudyIndex: 0 }])
          isTransitioningRef.current = false  // allow future transitions/retries
          setRound('case_study')
          setLoading(false)
        } catch (err) {
          console.error('Case study start failed:', err)
          isTransitioningRef.current = false  // allow retry
          setError('Failed to load case study. Please retry.')
          setRound('error')
          setLoading(false)
        }
      }
    } else {
      completeInterview(timeoutFlag)
    }
  }, [interviewType, stopListening, aiSay, completeInterview])

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (round !== 'verbal' || countdown <= 0) return
    const t = setInterval(() => setCountdown(p => {
      if (p <= 1) { clearInterval(t); transitionToNextRound(true); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [round, transitionToNextRound])

  // ── Start verbal interview ────────────────────────────────────────────────
  const startInterview = useCallback(async () => {
    await startScreenRecording()
    setRound('verbal')
    const q = questionsRef.current[0]
    if (!q) return
    const t = VOICE_TRANSLATIONS[languageRef.current] || VOICE_TRANSLATIONS['English']
    const introTemplate = t.intro
    const candidateName = sessionDetailRef.current?.candidate_name || 'there'
    const intro = introTemplate.replace('[NAME]', candidateName) + q.text
    setTimeout(() => aiSay(intro, () => startListening(ans => handleAnswer(ans, 0, 0))), 500)
  }, [aiSay, startListening, handleAnswer, startScreenRecording])

  // ── Proctoring: ESC + Tab + Screenshare ──────────────────────────────────
  // Helper to log proctoring events to backend
  const warningsCountRef = useRef(0)
  const logProctoringAlert = useCallback((alertType, details = '') => {
    const alertMessages = {
      'multi_person': '👀 Multiple faces detected in frame!',
      'no_face': '👤 No face detected - please face the camera!',
      'phone': '📱 Mobile phone detected in frame!',
      'eye_contact': '👁️‍🗨️ Please maintain eye contact with the screen.',
      'tab_switch': '🚨 Tab switch detected!',
      'screenshot_shortcut': '📸 Screenshots are not allowed during this interview.',
      'devtools_attempt': '🔧 Developer tools access detected!',
      'save_attempt': '💾 Page save attempt detected!',
      'clipboard_attempt': '📋 Copying or pasting is not allowed.',
      'print_attempt': '🖨️ Printing is not allowed.',
      'devtools_open': '🔧 Developer tools are not allowed during the interview.',
      'window_blur': '⚠️ Switching applications is not allowed.',
      'multi_monitor': '🖥️ Multiple monitors detected — please use a single display.',
    }
    const displayMsg = alertMessages[alertType] || `⚠️ Proctoring alert: ${alertType}`
    setProctoringBanner({ type: alertType, message: displayMsg })
    setTimeout(() => setProctoringBanner(null), 4000)

    if (['multi_person', 'no_face', 'phone', 'eye_contact'].includes(alertType)) {
      integrityMetricsRef.current.faceAlerts += 1
    } else if (alertType === 'tab_switch') {
      integrityMetricsRef.current.tabSwitches += 1
    } else if (alertType === 'fullscreen_exit') {
      integrityMetricsRef.current.fullscreenExits += 1
    } else if (alertType === 'background_noise') {
      integrityMetricsRef.current.noiseAlerts += 1
    }

    setWarningsCount(p => {
      const newCount = p + 1
      warningsCountRef.current = newCount
      setProctoringState(prev => ({ ...prev, lastAlertType: alertType }))

      const ts = new Date().toISOString()

      // 1. Send via WebSocket (real-time admin dashboard)
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: 'save_proctoring_alert',
          interview_id: interviewIdRef.current,
          link_id: linkId,
          alert_type: alertType,
          details,
          warnings_count: newCount,
          timestamp: ts,
        }))
      }

      // 2. POST to unified violation endpoint (persistent DB record)
      // Fire-and-forget — we don't block the alert flow on network latency.
      fetch(`${API_BASE_URL}/proctoring/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewIdRef.current || '',
          link_id: linkId || '',
          candidate_id: sessionDetailRef.current?.candidate_id || '',
          violation_type: alertType,
          details: details || displayMsg,
          timestamp: ts,
        }),
      }).catch(() => {
        // Fallback to legacy endpoint if new one is unavailable
        if (interviewIdRef.current) {
          fetch(`${API_BASE_URL}/session/${interviewIdRef.current}/violation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: alertType, count: newCount, timestamp: ts, details }),
          }).catch(() => {})
        }
      })

      return newCount
    })
  }, [linkId])

  // Handle screenshare track ending
  const handleScreenShareViolation = useCallback(() => {
    screenShareViolationsRef.current += 1
    const count = screenShareViolationsRef.current
    logProctoringAlert('screenshare_stopped', `Violation #${count}`)

    if (count >= 3) {
      Swal.fire({
        icon: 'error',
        title: '🚫 Interview Terminated',
        html: `<p>You stopped screen sharing <strong>${count} times</strong>. This interview has been automatically terminated and the incident has been reported.</p>`,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'OK',
        allowOutsideClick: false,
        allowEscapeKey: false,
      }).then(() => completeInterview())
    } else {
      Swal.fire({
        icon: 'warning',
        title: '⚠️ Screen Sharing Stopped',
        html: `<p>Please restart screen sharing to continue.<br/><span style="color:#ef4444;font-weight:bold">Warning ${count}/3 — Interview will be terminated after 3 violations.</span></p>`,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: 'I Understand',
        allowOutsideClick: false,
      })
    }
  }, [logProctoringAlert, completeInterview])

  // Keep the stable ref in sync
  useEffect(() => {
    screenShareViolationHandlerRef.current = handleScreenShareViolation
  }, [handleScreenShareViolation])

  useEffect(() => {
    // Tab switch counter — auto-end after 3 switches
    let tabSwitchCount = 0
    const MAX_TAB_SWITCHES = 3

    // Tab switch detection
    const handleVisibilityChange = () => {
      if (document.hidden && round !== 'done' && round !== 'intro' && round !== 'pre_checks' && round !== 'submitting') {
        tabSwitchCount++
        logProctoringAlert('tab_switch', `Tab switch #${tabSwitchCount}`)

        if (tabSwitchCount >= MAX_TAB_SWITCHES) {
          // Auto-end interview after too many tab switches
          Swal.fire({
            icon: 'error',
            title: '🚨 Interview Terminated!',
            text: `You have switched tabs ${MAX_TAB_SWITCHES} times. The interview has been automatically ended and saved.`,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'OK',
            allowOutsideClick: false,
          }).then(() => completeInterview({ reason: 'Terminated due to multiple tab switching violations.' }))
        } else {
          Swal.fire({
            icon: 'warning',
            title: `⚠️ Tab Switch Detected! (${tabSwitchCount}/${MAX_TAB_SWITCHES})`,
            text: `Please do not switch tabs or minimize the window. You have ${MAX_TAB_SWITCHES - tabSwitchCount} warning(s) remaining before the interview is automatically ended.`,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'I Understand',
            timer: 8000,
            timerProgressBar: true,
          })
        }
      }
    }

    // Fullscreen change detection with interactive modal
    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement && round !== 'done' && round !== 'pre_checks' && round !== 'intro' && round !== 'submitting') {
        logProctoringAlert('fullscreen_exit', 'User exited fullscreen')

        Swal.fire({
          icon: 'warning',
          title: '⚠️ Fullscreen Required',
          text: 'Exiting fullscreen mode is not allowed during the interview.',
          showCancelButton: true,
          confirmButtonText: 'Enable full screen mode',
          cancelButtonText: 'Exit interview',
          allowOutsideClick: false,
          allowEscapeKey: false
        }).then((result) => {
          if (result.isConfirmed) {
            if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen().catch(() => { })
            }
          } else {
            completeInterview({ reason: 'Terminated due to fullscreen mode exit.' })
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      // NOTE: We DO NOT call window.speechSynthesis?.cancel() here anymore.
      // This cleanup function was accidentally getting triggered whenever a proctoring
      // alert changed the completeInterview or logProctoringAlert reference, muting the AI.
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
    // We intentionally omit logProctoringAlert and completeInterview to prevent re-bind loops muting the AI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopListening, round])

  // Use Centralized AI Proctoring Hook
  const proctoring = useProctoring({
    videoRef: candidateVideoRef,
    enabled: round !== 'done' && round !== 'pre_checks' && round !== 'intro' && round !== 'submitting',
    maxAlerts: 10,
    onViolation: (v) => {
      logProctoringAlert(v.type, v.message)
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
      })
    },
    onTerminate: () => completeInterview({ reason: 'Terminated due to multiple AI proctoring alerts (Face/Camera violations).' })
  })

  useEffect(() => {
    if (setProctoringState) {
      setProctoringState(proctoring)
    }
  }, [
    proctoring.faceVisible,
    proctoring.modelsReady,
    proctoring.faceCount,
    proctoring.multiFace,
    proctoring.phoneDetected,
    proctoring.eyeContactLost,
    setProctoringState
  ])

  // ── Screenshot / snipping-tool deterrence ────────────────────────────
  useScreenshotProtection({
    enabled: round !== 'done' && round !== 'pre_checks' && round !== 'intro' && round !== 'submitting',
    onAttempt: (v) => {
      const message = 'Screenshots are not allowed during this interview.'
      logProctoringAlert(v.type, message)
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
      })
    },
  })

  // ── Browser exam security (copy/paste blocking, DevTools, window blur, multi-monitor) ──
  useExamSecurity({
    enabled: round !== 'done' && round !== 'pre_checks' && round !== 'intro' && round !== 'submitting',
    onViolation: ({ type, message }) => {
      logProctoringAlert(type, message)
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
      })
    },
  })

  const heartbeatStateRef = useRef(null)
  useEffect(() => {
    heartbeatStateRef.current = {
      round,
      currentQIdx,
      totalQuestions: questions.length || 0,
      proctoringState,
      warningsCount,
    }
  }, [round, currentQIdx, questions.length, proctoringState, warningsCount])

  useEffect(() => {
    if (!linkId || !monitoringToken) return

    const captureSnapshot = () => {
      const video = candidateVideoRef.current
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
      const current = heartbeatStateRef.current
      if (!current || current.round === 'done' || current.round === 'pre_checks' || current.round === 'intro') return
      if (!['verbal', 'coding', 'case_study'].includes(current.round)) return
      const currentProctoring = current.proctoringState || {}
      const alertTypes = []
      if (currentProctoring.multiFace) alertTypes.push('multi_person')
      if (currentProctoring.faceVisible === false) alertTypes.push('no_face')
      if (currentProctoring.phoneDetected) alertTypes.push('phone')
      if (currentProctoring.eyeContactLost) alertTypes.push('eye_contact')
      if (currentProctoring.lastAlertType) alertTypes.push(currentProctoring.lastAlertType)

      fetch(`${API_BASE_URL}/live-heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${monitoringToken}`,
        },
        body: JSON.stringify({
          link_id: linkId,
          snapshot_dataurl: captureSnapshot(),
          current_question: current.currentQIdx + 1,
          total_questions: current.totalQuestions,
          tab_active: !document.hidden,
          face_visible: currentProctoring.faceVisible,
          proctoring_alerts: current.warningsCount,
          alert_types: [...new Set(alertTypes)],
          round_type: current.round,
          last_alert_type: currentProctoring.lastAlertType || null,
          face_count: currentProctoring.faceCount || 0,
          multi_face: !!currentProctoring.multiFace,
          phone_detected: !!currentProctoring.phoneDetected,
          eye_contact_lost: !!currentProctoring.eyeContactLost
        })
      }).catch(() => { })
    }

    sendHeartbeat()
    const heartbeatInterval = setInterval(sendHeartbeat, 5000)
    return () => clearInterval(heartbeatInterval)
  }, [linkId, monitoringToken])

  // (Removed old round === 'verbal' useEffect for video srcObject, handled by callback ref now)

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER — delegate to sub-components for coding/case study
  // ─────────────────────────────────────────────────────────────────────────────

  if (round === 'coding' && codingQuestion) {
    return (
      <>
        <ErrorBoundary>
          <React.Suspense fallback={<div className="flex h-screen items-center justify-center text-white text-xl bg-[#0a0f1e]">Loading coding environment...</div>}>
            <VoiceCodingRound question={codingQuestion} interviewId={interviewId} linkId={linkId} duration={roundDuration}
              sessionDetail={sessionDetail} language={language} wsRef={wsRef} onComplete={() => {
              const type = interviewType
              if (type === 'Non-Technical') {
                // fetch case study after coding
                fetch(`${API_BASE_URL}/case-study/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interview_id: interviewId }) })
                  .then(r => r.json()).then(data => {
                    const cqs = (data.case_study_round?.questions || []).map((q, i) => ({ id: `cs_${i}`, type: 'case_study', text: q.text || q.scenario || '', caseStudyIndex: i }))
                    setCaseStudyQuestions(cqs); setRound('case_study')
                  }).catch(() => completeInterview())
              } else {
                completeInterview()
              }
            }} />
          </React.Suspense>
        </ErrorBoundary>
        {candidateVideoElement}
      </>
    )
  }

  if (round === 'case_study' && caseStudyQuestions.length) {
    return (
      <>
        <ErrorBoundary>
          <React.Suspense fallback={<div className="flex h-screen items-center justify-center text-white text-xl bg-[#0a0f1e]">Loading case study environment...</div>}>
            <VoiceCaseStudy question={caseStudyQuestions[0]} allQuestions={caseStudyQuestions} duration={roundDuration}
            interviewId={interviewId} linkId={linkId} sessionDetail={sessionDetail}
            language={language} wsRef={wsRef} onComplete={completeInterview} />
          </React.Suspense>
        </ErrorBoundary>
        {candidateVideoElement}
      </>
    )
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white gap-5">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse">
        <i className="fas fa-microphone text-2xl" />
      </div>
      <p className="text-slate-400 text-sm animate-pulse">Setting up your AI Interview...</p>
    </div>
  )

  if (error || round === 'error') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center">
        <i className="fas fa-exclamation-triangle text-2xl text-rose-400" />
      </div>
      <h2 className="text-xl font-bold">Session Error</h2>
      <p className="text-slate-400 max-w-md">{error}</p>
      {round === 'error' && (
        <button onClick={() => { setRound('pre_checks'); setError(null); transitionToNextRound(); }} className="px-6 py-2.5 bg-indigo-500 hover:bg-indigo-600 rounded-lg font-bold text-sm transition-colors mt-4">
          <i className="fas fa-redo mr-2"></i>Retry
        </button>
      )}
    </div>
  )

  if (round === 'submitting') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white gap-5">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse shadow-[0_0_40px_rgba(99,102,241,0.4)]">
        <RefreshCw size={32} className="animate-spin text-white" />
      </div>
      <h2 className="text-xl font-bold">Submitting Interview...</h2>
      <p className="text-slate-400 text-sm animate-pulse">Please wait, your video and audio are being securely uploaded.</p>
    </div>
  )

  if (round === 'done') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6 text-center gap-8 py-10 overflow-y-auto">
      <style>{`@keyframes pop{0%{transform:scale(.5);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>

      {!feedbackSuccess ? (
        <div className="max-w-xl w-full flex flex-col items-center gap-6">
          <div className="w-24 h-24 rounded-full bg-emerald-500/10 border-4 border-emerald-500 flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.4)]" style={{ animation: 'pop 0.6s ease forwards' }}>
            <i className="fas fa-check text-5xl text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black mb-2">Interview Complete! 🎉</h1>
            <p className="text-slate-400 max-w-md">Excellent work! You answered {answeredCount} question{answeredCount !== 1 ? 's' : ''} across all rounds. Your responses have been sent to the recruiter.</p>
          </div>

          <div className="w-full bg-[#0d1117] border border-white/10 rounded-2xl p-6 shadow-xl mt-4 text-left">
            <h3 className="text-lg font-bold text-white mb-2">How was your experience?</h3>
            <p className="text-sm text-slate-400 mb-4">Your feedback helps us improve the AI interview experience.</p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us about your interview experience..."
              className="w-full bg-[#161b22] border border-white/10 rounded-xl p-4 text-white text-sm min-h-[120px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none mb-4"
            />
            <button
              onClick={async () => {
                if (!feedback.trim()) return
                setIsSubmittingFeedback(true)
                try {
                  await fetch(`${API_BASE_URL}/submit-feedback/${linkId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ feedback_text: feedback })
                  })
                  setFeedbackSuccess(true)
                } catch (e) {
                  console.error(e)
                } finally {
                  setIsSubmittingFeedback(false)
                }
              }}
              disabled={isSubmittingFeedback || !feedback.trim()}
              className="w-full py-3 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-700 disabled:text-slate-400 rounded-xl font-bold text-sm transition-all"
            >
              {isSubmittingFeedback ? <RefreshCw className="inline animate-spin mr-2" size={16} /> : null}
              {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-w-xl w-full flex flex-col items-center gap-6" style={{ animation: 'pop 0.6s ease forwards' }}>
          <div className="w-24 h-24 rounded-full bg-indigo-500/10 border-4 border-indigo-500 flex items-center justify-center shadow-[0_0_60px_rgba(99,102,241,0.4)]">
            <i className="fas fa-heart text-4xl text-indigo-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black mb-2">Thank You!</h1>
            <p className="text-slate-400 max-w-md">Your feedback has been recorded. You can now close this tab.</p>
          </div>
        </div>
      )}
    </div>
  )

  // ── Pre-Interview Checks Screen ───────────────────────────────────────────
  if (round === 'pre_checks') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6" style={{ fontFamily: "'Inter',sans-serif" }}>
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.3)]">
            <i className="fas fa-shield-alt text-3xl text-white" />
          </div>
          <h1 className="text-3xl font-black">Pre-Interview Checklist</h1>
          <p className="text-slate-400">Before we begin, please review the rules and grant the required permissions.</p>
        </div>

        {/* Rules */}
        <div className="grid gap-3 text-left bg-[#0d1117] border border-white/10 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-2 border-b border-white/10 pb-2">Interview Rules</h3>
          {[
            { i: 'fa-volume-mute', c: 'text-rose-400', t: 'Ensure you are in a quiet environment without background noise.' },
            { i: 'fa-window-close', c: 'text-amber-400', t: 'Do not close, refresh, or switch away from this tab.' },
            { i: 'fa-user-check', c: 'text-emerald-400', t: 'Your microphone, camera, and screen will be recorded.' },
          ].map((rule, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                <i className={`fas ${rule.i} ${rule.c}`} />
              </div>
              <span className="text-slate-300 text-sm">{rule.t}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button onClick={() => setShowDeviceCheck(true)}
            className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-3 ${permissionsGranted
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
              : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20'
              }`}>
            <i className={`fas ${permissionsGranted ? 'fa-check-circle' : 'fa-lock-open'}`} />
            {permissionsGranted ? 'Hardware Checked & Permissions Granted' : 'Test Hardware & Grant Permissions'}
          </button>

          <button
            disabled={!permissionsGranted}
            onClick={() => setRound('intro')}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${permissionsGranted
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_4px_30px_rgba(16,185,129,0.4)] hover:shadow-[0_4px_50px_rgba(16,185,129,0.6)] hover:scale-[1.02]'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}>
            I Agree & Continue
            <i className="fas fa-arrow-right" />
          </button>
        </div>
      </div>

      {showDeviceCheck && (
        <DeviceCheckModal 
          onSuccess={() => {
            if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen().catch(() => { })
            }
            navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(stream => {
              cameraStreamRef.current = stream;
              setPermissionsGranted(true);
            }).catch(err => {
              alert("Permissions are required to proceed: " + err.message);
            });
            setShowDeviceCheck(false);
          }}
          onCancel={() => setShowDeviceCheck(false)}
        />
      )}
    </div>
  )

  // ── Voice Clone Setup Screen ──────────────────────────────────────────────
  if (round === 'voice_clone_setup') {
    const SAMPLE_SENTENCE = "The quick brown fox jumps over the lazy dog. Please record this sentence clearly so we can match your voice."

    const startVcRecording = async () => {
      setVcStep('recording')
      setVcError('')
      vcChunksRef.current = []
      try {
        let stream = cameraStreamRef.current
        if (!stream || stream.getAudioTracks().length === 0) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        }
        const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' })
        vcMediaRecorderRef.current = mr
        mr.ondataavailable = (e) => { if (e.data.size > 0) vcChunksRef.current.push(e.data) }
        mr.onstop = async () => {
          if (stream !== cameraStreamRef.current) {
            stream.getTracks().forEach(t => t.stop())
          }
          setVcStep('uploading')
          try {
            const blob = new Blob(vcChunksRef.current, { type: 'audio/webm' })
            const fd = new FormData()
            fd.append('audio', blob, 'voice_sample.webm')
            fd.append('voice_name', `Candidate_${linkId}`)
            const resp = await fetch(`${API_BASE_URL}/voice-clone-instant`, { method: 'POST', body: fd })
            const data = await resp.json()
            if (!resp.ok) throw new Error(data.detail || 'Cloning failed')
            setVoiceCloneId(data.voice_id)
            voiceCloneIdRef.current = data.voice_id
            setVcStep('done')
          } catch (err) {
            setVcError(err.message || 'Voice cloning failed. The interview will use the default AI voice.')
            setVcStep('error')
          }
        }
        mr.start()
        // Auto-stop after 10 seconds
        setTimeout(() => { if (mr.state === 'recording') mr.stop() }, 10000)
      } catch (err) {
        setVcError('Microphone access denied: ' + err.message)
        setVcStep('error')
      }
    }

    const stopVcRecording = () => {
      if (vcMediaRecorderRef.current?.state === 'recording') {
        vcMediaRecorderRef.current.stop()
      }
    }

    return (
      <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6" style={{ fontFamily: "'Inter',sans-serif" }}>
        <style>{`
          @keyframes vcPulse{0%,100%{box-shadow:0 0 0 0 rgba(139,92,246,.5)}70%{box-shadow:0 0 0 18px rgba(139,92,246,0)}}
          @keyframes vcWave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
          .vc-bar{animation:vcWave 0.9s ease-in-out infinite;transform-origin:bottom;background:linear-gradient(to top,#7c3aed,#a78bfa);width:5px;border-radius:99px;height:32px;}
        `}</style>
        <div className="max-w-xl w-full text-center space-y-8">

          {/* Header */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-[0_0_40px_rgba(139,92,246,0.4)]">
              <i className="fas fa-waveform-lines text-2xl text-white" />
            </div>
            <h1 className="text-3xl font-black">Voice Cloning Setup</h1>
            <p className="text-slate-400 max-w-sm">Read the sentence below aloud. We'll clone your voice so the AI interviewer sounds just like you!</p>
          </div>

          {/* Sentence card */}
          <div className="bg-[#0d1117] border border-violet-500/30 rounded-2xl p-6 shadow-xl">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-violet-400 mb-3">Read this sentence clearly:</p>
            <p className="text-white text-lg font-semibold leading-relaxed italic">"{SAMPLE_SENTENCE}"</p>
          </div>

          {/* Status indicator */}
          {vcStep === 'recording' && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-end gap-1 h-10">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="vc-bar" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
              <p className="text-violet-300 text-sm font-semibold animate-pulse">🔴 Recording... speak the sentence now</p>
              <button onClick={stopVcRecording} className="px-6 py-2.5 bg-rose-600 hover:bg-rose-700 rounded-lg font-bold text-sm transition-colors">
                <i className="fas fa-stop mr-2" />Stop Recording
              </button>
            </div>
          )}

          {vcStep === 'uploading' && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full border-4 border-violet-500/30 border-t-violet-500 animate-spin" />
              <p className="text-violet-300 text-sm">Cloning your voice with ElevenLabs AI...</p>
            </div>
          )}

          {vcStep === 'done' && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-emerald-300">
              <i className="fas fa-check-circle text-3xl mb-2 block" />
              <p className="font-bold">Voice Cloned Successfully!</p>
              <p className="text-sm text-emerald-400/80 mt-1">The AI interviewer will now speak in your voice.</p>
            </div>
          )}

          {(vcStep === 'error') && (
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 text-rose-300">
              <i className="fas fa-exclamation-triangle text-2xl mb-2 block" />
              <p className="text-sm">{vcError || 'An error occurred. Proceeding with default voice.'}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-3">
            {vcStep === 'idle' && (
              <button onClick={startVcRecording} className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold text-lg shadow-[0_4px_30px_rgba(139,92,246,0.4)] hover:shadow-[0_4px_50px_rgba(139,92,246,0.7)] hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                <i className="fas fa-microphone" />Start Recording (max 10s)
              </button>
            )}
            {(vcStep === 'done' || vcStep === 'error') && (
              <button onClick={() => setRound('intro')} className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-lg shadow-[0_4px_30px_rgba(16,185,129,0.4)] hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                Continue to Interview <i className="fas fa-arrow-right" />
              </button>
            )}
            {vcStep === 'idle' && (
              <button onClick={() => setRound('intro')} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white text-sm font-medium transition-all">
                Skip voice cloning — use default AI voice
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Intro Screen ──────────────────────────────────────────────────────────
  if (round === 'intro') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6" style={{ fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes pulse-ring{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.12);opacity:1}}
        @keyframes wave{0%{height:4px}100%{height:28px}}
      `}</style>
      <div className="max-w-xl w-full text-center space-y-10">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl">
            <i className="fas fa-brain text-lg text-white" />
          </div>
          <span className="text-2xl font-black">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium text-xl">Voice AI</span></span>
        </div>

        {/* Avatar */}
        <div className="relative flex items-center justify-center h-64 mb-4">
          <style>{`
            @keyframes vidRingSpeak { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.08);opacity:1} }
            @keyframes vidRingListen { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.04);opacity:1} }
          `}</style>
          <VideoAvatar status="idle" size={220} />
        </div>

        <div>
          <h1 className="text-3xl font-black mb-3">Meet Zara, Your AI Interviewer</h1>
          <p className="text-slate-400 leading-relaxed">
            Hi, <span className="text-white font-semibold">{sessionDetail?.candidate_name}</span>! I'm Zara. We'll have a natural voice conversation across {
              interviewType === 'Technical' ? '2 rounds — Verbal Q&A + Coding' :
                interviewType === 'Non-Technical' ? '2 rounds — Verbal Q&A + Case Study' :
                  '1 round of Verbal Q&A'
            }. I'll ask follow-up questions to dig deeper into your answers.
          </p>
        </div>

        {/* Round badges */}
        <div className="flex flex-wrap gap-3 justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-sm">
            <i className="fas fa-comments text-indigo-400" /> Verbal Q&A ({questions.length} questions)
          </div>
          {interviewType === 'Technical' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-sm">
              <i className="fas fa-code text-amber-400" /> Live Coding
            </div>
          )}
          {interviewType === 'Non-Technical' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-sm">
              <i className="fas fa-briefcase text-violet-400" /> Case Study
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="grid gap-3 text-sm text-left">
          {[
            { i: 'fa-volume-up', c: 'text-indigo-400', t: 'I speak each question aloud — listen before answering' },
            { i: 'fa-microphone', c: 'text-emerald-400', t: 'Just talk naturally — your mic captures everything' },
            { i: 'fa-comment-dots', c: 'text-violet-400', t: 'I\'ll ask follow-up questions based on your answers' },
            { i: 'fa-arrow-right', c: 'text-amber-400', t: 'After 5 seconds of silence, the interview auto-advances' },
          ].map((tip, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white/4 border border-white/6 rounded-xl px-5 py-3">
              <i className={`fas ${tip.i} ${tip.c} w-5 text-center`} />
              <span className="text-slate-300">{tip.t}</span>
            </div>
          ))}
        </div>

        <button onClick={startInterview}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg shadow-[0_4px_30px_rgba(99,102,241,0.5)] hover:shadow-[0_4px_50px_rgba(99,102,241,0.8)] hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
          <i className="fas fa-microphone-alt" /> Begin Interview with Zara
        </button>
      </div>
    </div>
  )

  // ── Verbal Round ─────────────────────────────────────────────────────
  const currentQ = questions[currentQIdx]
  const progress = questions.length ? ((currentQIdx) / questions.length) * 100 : 0

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#07091a] flex flex-col text-white" style={{ fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes wave{0%{height:4px;opacity:.5}100%{height:32px;opacity:1}}
        @keyframes glow-speak{0%,100%{box-shadow:0 0 40px rgba(99,102,241,.5),0 0 80px rgba(99,102,241,.2)}50%{box-shadow:0 0 80px rgba(99,102,241,.9),0 0 140px rgba(99,102,241,.4)}}
        @keyframes glow-listen{0%,100%{box-shadow:0 0 40px rgba(16,185,129,.4)}50%{box-shadow:0 0 80px rgba(16,185,129,.8)}}
        @keyframes spin-slow{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      {/* Proctoring Banner */}
      {proctoringBanner && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: proctoringBanner.type === 'tab_switch' ? 'linear-gradient(90deg,#b91c1c,#dc2626)' : 'linear-gradient(90deg,#7c3aed,#6d28d9)',
          color: 'white', padding: '12px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
          fontSize: '15px', fontWeight: '700', letterSpacing: '0.01em',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          animation: 'fadeIn 0.2s ease'
        }}>
          <span style={{ fontSize: '20px' }}>{proctoringBanner.type === 'tab_switch' ? '🚨' : proctoringBanner.type === 'multi_person' ? '👥' : proctoringBanner.type === 'no_face' ? '👤' : '⚠️'}</span>
          <span>{proctoringBanner.message}</span>
          <span style={{ fontSize: '12px', opacity: 0.8, fontWeight: 500 }}>- Recorded &amp; logged</span>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/6 bg-[#0a0f1e]/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
            <i className="fas fa-brain text-sm text-white" />
          </div>
          <span className="font-black tracking-tight">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium">Voice AI</span></span>
          <span className="ml-2 text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2.5 py-0.5 uppercase tracking-widest">
            <i className="fas fa-comments mr-1" />Round 1: Verbal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold px-4 py-1.5 rounded-full border ${countdown < 300 ? 'border-rose-500/50 text-rose-400 bg-rose-500/10' : 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'}`}>
            <i className="fas fa-clock mr-2" />{fmt(countdown)}
          </div>
          <span className="text-sm text-slate-400">Q <span className="text-white font-bold">{currentQIdx + 1}</span>/{questions.length}</span>
        </div>
      </header>

      {/* Progress */}
      <div className="h-1 bg-white/5"><div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-700" style={{ width: `${progress}%` }} /></div>

      {/* Main: center avatar layout */}
      <div className="flex-1 flex flex-col items-center py-8 px-4 overflow-y-auto">

        {/* Question number badge */}
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2 shrink-0">
          {currentQ?.type || 'Interview'} &nbsp;·&nbsp; Question {currentQIdx + 1} of {questions.length}
        </div>

        <div className="flex-1" />

        {/* Center Avatar block */}
        <div className="flex flex-col items-center gap-6 my-4 shrink-0">
          {/* Ripple rings */}
          <div className="relative flex items-center justify-center">
            <style>{`
              @keyframes vidRingSpeak { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.1);opacity:1} }
              @keyframes vidRingListen { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.05);opacity:1} }
            `}</style>
            <VideoAvatar status={aiStatus} size={200} />
          </div>

          {/* AI Status label */}
          <div className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${aiStatus === 'speaking' ? 'text-indigo-400' :
            aiStatus === 'listening' ? 'text-emerald-400' :
              aiStatus === 'thinking' ? 'text-amber-400' : 'text-slate-600'
            }`}>
            {aiStatus === 'speaking' && <><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />Zara is Speaking</>}
            {aiStatus === 'listening' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Listening to you</>}
            {aiStatus === 'thinking' && <><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />Thinking...</>}
            {aiStatus === 'idle' && 'Ready'}
          </div>

          {/* Typewriter Question Text */}
          <div className="max-w-2xl w-full text-center mt-4">
            <p className={`text-xl font-semibold text-white leading-snug ${isTyping ? 'cursor-blink' : ''}`}>
              {displayedQuestion || '\u00a0'}
            </p>
          </div>

          {/* User's live transcript — shows while listening AND after (so user can see what was captured) */}
          {(aiStatus === 'listening' || transcript || interimText) && (
            <div className="max-w-xl w-full mx-auto mt-2">
              <div className={`rounded-2xl border px-5 py-3 text-center transition-all duration-300 ${aiStatus === 'listening'
                ? 'border-emerald-500/30 bg-emerald-500/8'
                : 'border-white/10 bg-white/4'
                }`}>
                {(transcript || interimText)
                  ? <p className="text-emerald-300 text-sm leading-relaxed">
                    {transcript}
                    {interimText && (
                      <span className="text-emerald-400/60 italic"> {interimText}▌</span>
                    )}
                  </p>
                  : <p className="text-slate-600 text-sm italic flex items-center justify-center gap-2">
                    <i className="fas fa-microphone text-emerald-600" />
                    Listening — speak now...
                  </p>
                }
                {/* Listener waveform — only while actively listening */}
                {aiStatus === 'listening' && (
                  <div className="flex items-center justify-center gap-1.5 h-5 mt-2">
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                      <div key={i} className="w-1 rounded-full bg-emerald-500/50"
                        style={{ height: 4, animation: `wave ${.25 + i * .06}s ease-in-out infinite alternate`, animationDelay: `${i * .04}s` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Bottom controls */}
        <div className="w-full max-w-lg space-y-4 shrink-0 mt-6">
          <div className="flex gap-2">
            <button onClick={() => {
              if (aiStatus === 'listening') {
                stopListening()
                handleAnswer(currentTxRef.current.trim(), currentQIdx, 0)
              }
              else { startListening(ans => handleAnswer(ans, currentQIdx, 0)) }
            }} className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2.5 ${aiStatus === 'listening'
              ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-[0_0_30px_rgba(239,68,68,.15)]'
              : 'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20'
              }`}>
              <i className={`fas ${aiStatus === 'listening' ? 'fa-stop-circle' : 'fa-microphone'} text-base`} />
              {aiStatus === 'listening' ? 'Done Speaking' : 'Speak Answer'}
            </button>
            <button onClick={transitionToNextRound} className="px-6 py-3.5 rounded-2xl bg-white/5 text-slate-400 border border-white/8 hover:bg-white/10 text-xs font-bold transition-all uppercase tracking-widest">
              Next Round
            </button>
            <button onClick={completeInterview} className="px-6 py-3.5 rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 text-xs font-bold transition-all uppercase tracking-widest">
              End Interview
            </button>
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {questions.map((_, i) => (
              <div key={i} className={`rounded-full transition-all duration-300 ${i < currentQIdx ? 'w-2 h-2 bg-emerald-500' :
                i === currentQIdx ? 'w-3.5 h-3.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,.8)]' :
                  'w-2 h-2 bg-white/10'
                }`} />
            ))}
          </div>
        </div>
      </div>
      {/* Hidden Video for AI Proctoring - MUST have valid dimensions for MediaPipe to work properly */}
      {candidateVideoElement}

      {/* Proctoring Model Failure Alert */}
      {proctoring?.modelsFailed && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-rose-500/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in slide-in-from-top-4">
          <AlertCircle size={20} />
          <span className="text-sm font-bold">⚠️ Proctoring AI models failed to load. Monitoring is temporarily disabled.</span>
        </div>
      )}
    </div>
  )
}
