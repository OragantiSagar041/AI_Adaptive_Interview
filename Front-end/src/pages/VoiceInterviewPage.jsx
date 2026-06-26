/**
 * VoiceInterviewPage.jsx — Master orchestrator
 * Micro1-style conversational AI interview with:
 *   Round 1: Verbal (conversational with AI follow-ups, chat-bubble UI)
 *   Round 2: Coding (Monaco Editor + live code sentinel)
 *   Round 3: Case Study (branching AI discussion)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import VoiceCodingRound from './VoiceCodingRound'
import VoiceCaseStudy   from './VoiceCaseStudy'
import useCandidateWebRTC from '../hooks/useCandidateWebRTC'
import OrbAvatar from '../components/OrbAvatar'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

import { VOICE_TRANSLATIONS } from '../utils/voiceTranslations'

// ── Language map ─────────────────────────────────────────────────────────────
const langMap = {
  'Hindi':'hi-IN','Telugu':'te-IN','Tamil':'ta-IN',
  'Malayalam':'ml-IN','Kannada':'kn-IN','English':'en-US'
}

// ── Conversational follow-up engine ──────────────────────────────────────────
const FOLLOWUP_MAP = [
  { keywords: ['react','vue','angular','frontend','ui','component','hook'],
    questions: ["Can you tell me more about which state management approach you prefer?","How do you handle performance optimization in frontend applications?","Walk me through how you'd architect a complex React app."] },
  { keywords: ['python','java','node','backend','api','rest','graphql','server'],
    questions: ["How do you handle error management and logging in your backend services?","Can you describe a time you improved API performance significantly?","How do you approach securing REST APIs?"] },
  { keywords: ['team','lead','mentor','manage','collaborate','agile','scrum'],
    questions: ["How do you handle disagreements within your team?","Tell me about a time you had to give critical feedback to a peer.","How do you keep your team aligned when requirements change frequently?"] },
  { keywords: ['challenge','difficult','problem','solved','debug','issue','bug'],
    questions: ["What made that problem particularly challenging?","How did that experience change your approach to similar problems?","What would you do differently looking back?"] },
  { keywords: ['database','sql','nosql','mongo','postgres','redis','query'],
    questions: ["How do you decide between SQL and NoSQL for a given problem?","Walk me through how you'd optimize a slow database query.","How do you think about data modeling for scalability?"] },
  { keywords: ['ml','ai','machine learning','model','neural','data science','training'],
    questions: ["How do you validate that an ML model is production-ready?","How do you handle data drift in deployed models?","Walk me through your feature engineering process."] },
  { keywords: ['cloud','aws','azure','gcp','docker','kubernetes','devops','deploy','ci'],
    questions: ["How do you approach zero-downtime deployments?","Describe your ideal CI/CD pipeline.","How do you handle infrastructure costs at scale?"] },
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
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0">
          <OrbAvatar status="idle" />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/15 border-2 border-emerald-500/30">
          <i className="fas fa-user text-sm text-emerald-400"/>
        </div>
      )}
      <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
        role === 'ai'
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

  // Session
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState(null)
  const [sessionDetail, setSessionDetail] = useState(null)
  const [questions, setQuestions]         = useState([])
  const [codingQuestion, setCodingQuestion] = useState(null)
  const [caseStudyQuestions, setCaseStudyQuestions] = useState([])
  const [interviewId, setInterviewId]     = useState('')
  const [language, setLanguage]           = useState('English')
  const [interviewType, setInterviewType] = useState('Technical')

  // Round control
  const [round, setRound]   = useState('pre_checks')
  // 'pre_checks' | 'intro' | 'verbal' | 'coding' | 'case_study' | 'done'
  const [permissionsGranted, setPermissionsGranted] = useState(false)

  // Verbal interview state
  const [chatMessages, setChatMessages]     = useState([])
  const [currentQIdx, setCurrentQIdx]       = useState(0)
  const [aiStatus, setAiStatus]             = useState('idle')
  const [transcript, setTranscript]         = useState('')
  const [interimText, setInterimText]       = useState('')
  const [countdown, setCountdown]           = useState(0)
  const [roundDuration, setRoundDuration]   = useState(900)
  const [answeredCount, setAnsweredCount]   = useState(0)
  const [followUpCount, setFollowUpCount]   = useState(0)  // follow-ups per question
  const [warningsCount, setWarningsCount]   = useState(0)
  const usedFollowUps = useRef(new Set())
  const [displayedQuestion, setDisplayedQuestion] = useState('')  // typewriter text
  const [isTyping, setIsTyping]   = useState(false)              // typewriter running
  const typewriterRef = useRef(null)

  // Screen recording & WebRTC
  const mediaRecorderRef  = useRef(null)
  const mediaStreamRef    = useRef(null)
  const recordedChunksRef = useRef([])
  const [isRecording, setIsRecording] = useState(false)
  const activeAudioRef    = useRef(null)

  // Camera recording
  const cameraRecorderRef = useRef(null)
  const cameraStreamRef   = useRef(null)
  const cameraChunksRef   = useRef([])

  // Set a mock audio level that bounces slightly when speaking, or 0 when silent
  const isSpeaking = aiStatus === 'listening' && interimText.length > 0
  const mockAudioLevel = isSpeaking ? Math.floor(Math.random() * 40) + 20 : 0

  // Initialize WebRTC
  const telemetryData = {
    round_type: round,
    status: aiStatus === 'idle' ? 'online' : aiStatus,
    proctoring_alerts: warningsCount,
    current_question: currentQIdx + 1,
    total_questions: questions.length || 0,
    audio_level: mockAudioLevel,
    question_text: questions[currentQIdx] ? questions[currentQIdx].question_text : ''
  }
  useCandidateWebRTC(linkId, cameraStreamRef, telemetryData)

  // Refs
  const recognitionRef   = useRef(null)
  const silenceTimerRef  = useRef(null)
  const isListeningRef   = useRef(false)
  const currentTxRef     = useRef('')
  const submittingRef    = useRef(false)
  const currentQIdxRef   = useRef(0)
  const questionsRef     = useRef([])
  const interviewIdRef   = useRef('')
  const sessionDetailRef = useRef(null)
  const roundRef         = useRef('pre_checks')
  const chatBottomRef    = useRef(null)
  const wsRef            = useRef(null)
  const languageRef      = useRef('English')
  const isTransitioningRef = useRef(false)

  // Sync refs
  useEffect(() => { currentQIdxRef.current   = currentQIdx },   [currentQIdx])
  useEffect(() => { questionsRef.current     = questions },     [questions])
  useEffect(() => { interviewIdRef.current   = interviewId },   [interviewId])
  useEffect(() => { sessionDetailRef.current = sessionDetail }, [sessionDetail])
  useEffect(() => { roundRef.current         = round },         [round])
  useEffect(() => { languageRef.current      = language },      [language])
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
      } catch (e) {}
    }
    wsRef.current = ws
    return () => ws.close()
  }, [linkId])

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (round !== 'verbal' || countdown <= 0) return
    const t = setInterval(() => setCountdown(p => {
      if (p <= 1) { clearInterval(t); transitionToNextRound(); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [round]) // eslint-disable-line

  // ── Load Session ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!linkId) { setError('Missing session ID.'); setLoading(false); return }
    async function init() {
      try {
        const r = await fetch(`${API_BASE_URL}/session/${linkId}`)
        const d = await r.json()
        if (!r.ok || d.status !== 'success') throw new Error(d.detail || 'Session not found.')
        if (d.is_deactivated) throw new Error('This link is deactivated.')
        if (d.is_expired)     throw new Error('This link has expired.')
        if (d.session_status === 'completed') throw new Error('Interview already completed.')
        setSessionDetail(d)
        const langVal = d.language || 'English'
        setLanguage(langVal.charAt(0).toUpperCase() + langVal.slice(1).toLowerCase())
        setInterviewType(d.interview_type || 'Technical')
        
        // Calculate duration based on rounds
        const typeStr = d.interview_type || 'Technical'
        let numRounds = 1;
        if (typeStr.includes('Coding') && typeStr.includes('Case Study')) numRounds = 3;
        else if (typeStr === 'Technical' || typeStr === 'Non-Technical' || typeStr.includes('Coding') || typeStr.includes('Case Study')) numRounds = 2;
        
        const durationPerRound = Math.floor((d.interview_duration || 30) * 60 / numRounds);
        setRoundDuration(durationPerRound);
        setCountdown(durationPerRound)

        const fd = new FormData(); fd.append('link_id', linkId)
        const sr = await fetch(`${API_BASE_URL}/start-session-interview`, { method: 'POST', body: fd })
        const sd = await sr.json()
        if (!sr.ok) throw new Error(sd.detail || 'Failed to start session.')
        if (sd.session_status === 'completed') throw new Error('Interview already completed.')

        const qs = (sd.questions?.length ? sd.questions : sd.first_question ? [sd.first_question] : [])
          .map((q, i) => ({ ...q, id: q.id ?? i + 1, text: q.text || q.question || q.prompt || '', type: q.type || 'Interview' }))
          .filter(q => q.type !== 'coding' && q.type !== 'case_study') // verbal only

        if (!qs.length) throw new Error('No questions found for this session.')
        setQuestions(qs); setInterviewId(sd.interview_id || ''); setLoading(false)
      } catch(e) { setError(e.message); setLoading(false) }
    }
    init()
  }, [linkId])

  // ── TTS with female voice ──────────────────────────────────────────────────
  const speak = useCallback(async (text, onEnd) => {
    try {
      setAiStatus('speaking')
      const res = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'shimmer', language: languageRef.current })
      })
      if (!res.ok) throw new Error('TTS Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      activeAudioRef.current = audio
      audio.onended = () => {
        setAiStatus('listening')
        URL.revokeObjectURL(url)
        activeAudioRef.current = null
        onEnd?.()
      }
      audio.onerror = () => {
        setAiStatus('idle')
        activeAudioRef.current = null
        onEnd?.()
      }
      audio.play()
    } catch (e) {
      setAiStatus('idle')
      onEnd?.()
    }
  }, [])

  const addMsg = useCallback((role, text) => setChatMessages(p => [...p, { role, text }]), [])
  const aiSay  = useCallback((text, onEnd) => { addMsg('ai', text); speak(text, onEnd) }, [addMsg, speak])

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
  }, [currentQIdx, questions]) // eslint-disable-line

  // ── Screen & Camera Recording ───────────────────────────────────────────────
  const startScreenRecording = useCallback(async () => {
    try {
      // Force fullscreen mode
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen().catch(() => {})
      }
      
      // 1. Get Screen Stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', frameRate: 15, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true
      })
      
      const videoTrack = screenStream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      if (settings.displaySurface && settings.displaySurface !== 'monitor') {
        screenStream.getTracks().forEach(t => t.stop());
        throw new Error("Please select 'Entire Screen' when sharing. Window or Tab sharing is not allowed.");
      }
      
      // 2. Get Camera & Mic Stream
      let micStream = null
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        cameraStreamRef.current = micStream
        
        // Start Camera Recorder
        const cameraMr = new MediaRecorder(micStream, { mimeType: 'video/webm' })
        cameraChunksRef.current = []
        cameraMr.ondataavailable = e => { if (e.data.size > 0) cameraChunksRef.current.push(e.data) }
        cameraMr.start(5000)
        cameraRecorderRef.current = cameraMr
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
              console.log('Screen recording uploaded to Cloudinary')
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
              console.log('Camera recording uploaded to Cloudinary')
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
    try { recognitionRef.current?.stop() } catch(_) {}
    setAiStatus('idle')
  }, [])

  const startListening = useCallback((onFinish) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { onFinish?.(''); return }
    try { recognitionRef.current?.stop() } catch(_) {}
    const rec = new SR()
    rec.lang = langMap[languageRef.current] || 'en-US'
    rec.continuous = true; rec.interimResults = true
    recognitionRef.current = rec; isListeningRef.current = true
    currentTxRef.current = ''; setTranscript(''); setInterimText('')
    setAiStatus('listening')

    // Initial 10s grace period timer
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
      
      // Reset 10s timer when candidate speaks
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) { stopListening(); onFinish?.(currentTxRef.current.trim()) }
      }, 10000)
    }
    rec.onend = () => { if (isListeningRef.current) try { rec.start() } catch(_) {} }
    rec.onerror = e => { 
      if (e.error === 'aborted') isListeningRef.current = false
      if (e.error !== 'no-speech') console.warn('SR:', e.error) 
    }
    try { rec.start() } catch(e) { console.warn(e) }
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
      // 10s silence -> Skip to next question
      const nextIdx = qIdx + 1
      if (!qs[nextIdx]) {
        aiSay(t.wrapUpVerbal, () => transitionToNextRound())
      } else {
        setCurrentQIdx(nextIdx)
        aiSay(`${t.nextQuestion.replace('[X]', nextIdx + 1)}${qs[nextIdx].text}`, () => startListening(ans => handleAnswer(ans, nextIdx, 0)))
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
        fd.append('question_id',  q.id)
        fd.append('question_text', q.text)
        fd.append('answer_text',  answer)
        fd.append('candidate_name', sessionDetailRef.current?.candidate_name || 'Candidate')
        fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(()=>{})
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
  }, [addMsg, aiSay, startListening]) // eslint-disable-line

  // ── Load coding/case study round questions ────────────────────────────────
  const transitionToNextRound = useCallback(async () => {
    if (submittingRef.current || isTransitioningRef.current) return
    isTransitioningRef.current = true
    stopListening(); window.speechSynthesis?.cancel()
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    
    const type = interviewType
    const iid  = interviewIdRef.current

    if (type === 'Technical' || type === 'Non-Technical') {
      setAiStatus('thinking')
      setLoading(true) // Immediately show loading state to candidate
      const t = VOICE_TRANSLATIONS[languageRef.current] || VOICE_TRANSLATIONS['English']
      
      // Speak transition phrase but don't wait for it to finish before fetching
      aiSay(t.verbalComplete)

      if (type === 'Technical') {
        try {
          const res = await fetch(`${API_BASE_URL}/coding-round/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interview_id: iid })
          })
          const data = await res.json()
          const task = data.coding_round?.task || {}
          const codingQ = {
            id: 'coding_1', type: 'coding', text: task.description || task.title || 'Implement the required function',
            codingTask: task, codingTests: data.tests || []
          }
          setCodingQuestion(codingQ)
          setRound('coding')
          setLoading(false)
        } catch(err) { 
          console.error("Coding round start failed:", err)
          setError('Failed to load coding round. Please retry.')
          setRound('error')
          setLoading(false)
        }
      } else {
        // Non-Technical → case study
        try {
          const res = await fetch(`${API_BASE_URL}/case-study/start`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ interview_id: iid })
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          const data = await res.json()
          const cqs = (data.case_study_round?.questions || []).map((q, i) => ({
            id: `cs_${i}`, type: 'case_study', text: q.text, caseStudyIndex: i
          }))
          setCaseStudyQuestions(cqs.length ? cqs : [{ id: 'cs_0', type: 'case_study', text: data.scenario || 'Present your business case.', caseStudyIndex: 0 }])
          setRound('case_study')
          setLoading(false)
        } catch(err) { 
          console.error('Case study start failed:', err)
          setError('Failed to load case study. Please retry.')
          setRound('error')
          setLoading(false)
        }
      }
    } else {
      completeInterview()
    }
  }, [interviewType, stopListening, aiSay]) // eslint-disable-line

  // ── Complete interview ────────────────────────────────────────────────────
  const completeInterview = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    stopListening(); window.speechSynthesis?.cancel()
    const iid = interviewIdRef.current
    await stopAndUploadRecording(iid)
    try { await fetch(`${API_BASE_URL}/complete-session/${linkId}?warnings=${warningsCount}`, { method: 'POST' }) } catch(_) {}
    setRound('done')
  }, [stopListening, linkId, stopAndUploadRecording, warningsCount])

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

  // ── Cleanup and Tab Monitoring ────────────────────────────────────────────
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && round !== 'done' && round !== 'intro' && round !== 'pre_checks') {
        setWarningsCount(p => p + 1)
        console.warn('Tab switch detected!')
        Swal.fire({
          icon: 'warning',
          title: 'Tab Switch Detected!',
          text: 'Please do not switch tabs or minimize the window during the interview. This incident has been recorded.',
          confirmButtonColor: '#ef4444',
          confirmButtonText: 'I Understand'
        })
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      stopListening()
      window.speechSynthesis?.cancel()
      clearTimeout(silenceTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [stopListening, round])

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER — delegate to sub-components for coding/case study
  // ─────────────────────────────────────────────────────────────────────────────

  if (round === 'coding' && codingQuestion) {
    return <VoiceCodingRound question={codingQuestion} interviewId={interviewId} linkId={linkId} duration={roundDuration}
              sessionDetail={sessionDetail} language={language} wsRef={wsRef} onComplete={() => {
                const type = interviewType
                if (type === 'Non-Technical') {
                  // fetch case study after coding
                  fetch(`${API_BASE_URL}/case-study/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ interview_id: interviewId }) })
                    .then(r => r.json()).then(data => {
                      const cqs = (data.case_study_round?.questions || []).map((q, i) => ({ id:`cs_${i}`, type:'case_study', text: q.text || q.scenario || '', caseStudyIndex: i }))
                      setCaseStudyQuestions(cqs); setRound('case_study')
                    }).catch(() => completeInterview())
                } else {
                  completeInterview()
                }
              }}/>
  }

  if (round === 'case_study' && caseStudyQuestions.length) {
    return <VoiceCaseStudy question={caseStudyQuestions[0]} allQuestions={caseStudyQuestions} duration={roundDuration}
              interviewId={interviewId} linkId={linkId} sessionDetail={sessionDetail}
              language={language} wsRef={wsRef} onComplete={completeInterview}/>
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white gap-5">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center animate-pulse">
        <i className="fas fa-microphone text-2xl"/>
      </div>
      <p className="text-slate-400 text-sm animate-pulse">Setting up your AI Interview...</p>
    </div>
  )

  if (error || round === 'error') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6 text-center gap-6">
      <div className="w-16 h-16 rounded-full bg-rose-500/10 border-2 border-rose-500/40 flex items-center justify-center">
        <i className="fas fa-exclamation-triangle text-2xl text-rose-400"/>
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

  if (round === 'done') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6 text-center gap-8">
      <style>{`@keyframes pop{0%{transform:scale(.5);opacity:0}80%{transform:scale(1.1)}100%{transform:scale(1);opacity:1}}`}</style>
      <div className="w-28 h-28 rounded-full bg-emerald-500/10 border-4 border-emerald-500 flex items-center justify-center shadow-[0_0_60px_rgba(16,185,129,0.4)]" style={{animation:'pop 0.6s ease forwards'}}>
        <i className="fas fa-check text-5xl text-emerald-400"/>
      </div>
      <div>
        <h1 className="text-3xl font-black mb-2">Interview Complete! 🎉</h1>
        <p className="text-slate-400 max-w-md">Excellent work! You answered {answeredCount} question{answeredCount !== 1 ? 's' : ''} across all rounds. Your responses have been sent to the recruiter.</p>
      </div>
      <div className="text-slate-600 text-sm">You may safely close this tab.</div>
    </div>
  )

  // ── Pre-Interview Checks Screen ───────────────────────────────────────────
  if (round === 'pre_checks') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6" style={{fontFamily:"'Inter',sans-serif"}}>
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="flex flex-col items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.3)]">
            <i className="fas fa-shield-alt text-3xl text-white"/>
          </div>
          <h1 className="text-3xl font-black">Pre-Interview Checklist</h1>
          <p className="text-slate-400">Before we begin, please review the rules and grant the required permissions.</p>
        </div>

        {/* Rules */}
        <div className="grid gap-3 text-left bg-[#0d1117] border border-white/10 rounded-2xl p-6 shadow-xl">
          <h3 className="text-lg font-bold text-white mb-2 border-b border-white/10 pb-2">Interview Rules</h3>
          {[
            { i:'fa-volume-mute', c:'text-rose-400', t:'Ensure you are in a quiet environment without background noise.' },
            { i:'fa-window-close', c:'text-amber-400', t:'Do not close, refresh, or switch away from this tab.' },
            { i:'fa-user-check', c:'text-emerald-400', t:'Your microphone, camera, and screen will be recorded.' },
          ].map((rule, idx) => (
            <div key={idx} className="flex items-center gap-4">
              <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                <i className={`fas ${rule.i} ${rule.c}`}/>
              </div>
              <span className="text-slate-300 text-sm">{rule.t}</span>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="space-y-4">
          <button onClick={async () => {
            try {
              if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen().catch(() => {})
              }
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
              // Stop the streams immediately, we just wanted permission
              stream.getTracks().forEach(t => t.stop())
              setPermissionsGranted(true)
            } catch (err) {
              alert("Permissions are required to proceed: " + err.message)
            }
          }}
            className={`w-full py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-3 ${
              permissionsGranted 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default' 
                : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20'
            }`}>
            <i className={`fas ${permissionsGranted ? 'fa-check-circle' : 'fa-lock-open'}`}/>
            {permissionsGranted ? 'Permissions Granted' : 'Grant Camera & Mic Permissions'}
          </button>

          <button 
            disabled={!permissionsGranted}
            onClick={() => setRound('intro')}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-3 ${
              permissionsGranted 
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_4px_30px_rgba(16,185,129,0.4)] hover:shadow-[0_4px_50px_rgba(16,185,129,0.6)] hover:scale-[1.02]' 
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}>
            I Agree & Continue
            <i className="fas fa-arrow-right"/>
          </button>
        </div>
      </div>
    </div>
  )

  // ── Intro Screen ──────────────────────────────────────────────────────────
  if (round === 'intro') return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col items-center justify-center text-white px-6" style={{fontFamily:"'Inter',sans-serif"}}>
      <style>{`
        @keyframes pulse-ring{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.12);opacity:1}}
        @keyframes wave{0%{height:4px}100%{height:28px}}
      `}</style>
      <div className="max-w-xl w-full text-center space-y-10">
        <div className="flex items-center justify-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl">
            <i className="fas fa-brain text-lg text-white"/>
          </div>
          <span className="text-2xl font-black">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium text-xl">Voice AI</span></span>
        </div>

        {/* Avatar */}
        <div className="relative flex items-center justify-center h-64 mb-4">
          <div className="w-56 h-56">
            <OrbAvatar status="idle" />
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-black mb-3">Meet Zara, Your AI Interviewer</h1>
          <p className="text-slate-400 leading-relaxed">
            Hi, <span className="text-white font-semibold">{sessionDetail?.candidate_name}</span>! I'm Zara. We'll have a natural voice conversation across {
              interviewType === 'Technical' ? '2 rounds — Verbal Q&A + Coding' :
              interviewType === 'Non-Technical' ? '3 rounds — Verbal Q&A + Coding + Case Study' :
              '1 round of Verbal Q&A'
            }. I'll ask follow-up questions to dig deeper into your answers.
          </p>
        </div>

        {/* Round badges */}
        <div className="flex flex-wrap gap-3 justify-center">
          <div className="flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-sm">
            <i className="fas fa-comments text-indigo-400"/> Verbal Q&A ({questions.length} questions)
          </div>
          {(interviewType === 'Technical' || interviewType === 'Non-Technical') && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full text-sm">
              <i className="fas fa-code text-amber-400"/> Live Coding
            </div>
          )}
          {interviewType === 'Non-Technical' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-sm">
              <i className="fas fa-briefcase text-violet-400"/> Case Study
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="grid gap-3 text-sm text-left">
          {[
            { i:'fa-volume-up', c:'text-indigo-400', t:'I speak each question aloud — listen before answering' },
            { i:'fa-microphone', c:'text-emerald-400', t:'Just talk naturally — your mic captures everything' },
            { i:'fa-comment-dots', c:'text-violet-400', t:'I\'ll ask follow-up questions based on your answers' },
            { i:'fa-arrow-right', c:'text-amber-400', t:'After 5 seconds of silence, the interview auto-advances' },
          ].map((tip, idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white/4 border border-white/6 rounded-xl px-5 py-3">
              <i className={`fas ${tip.i} ${tip.c} w-5 text-center`}/>
              <span className="text-slate-300">{tip.t}</span>
            </div>
          ))}
        </div>

        <button onClick={startInterview}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg shadow-[0_4px_30px_rgba(99,102,241,0.5)] hover:shadow-[0_4px_50px_rgba(99,102,241,0.8)] hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
          <i className="fas fa-microphone-alt"/> Begin Interview with Zara
        </button>
      </div>
    </div>
  )

  // ── Verbal Round ─────────────────────────────────────────────────────
  const currentQ = questions[currentQIdx]
  const progress = questions.length ? ((currentQIdx) / questions.length) * 100 : 0

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#07091a] flex flex-col text-white" style={{fontFamily:"'Inter',sans-serif"}}>
      <style>{`
        @keyframes wave{0%{height:4px;opacity:.5}100%{height:32px;opacity:1}}
        @keyframes glow-speak{0%,100%{box-shadow:0 0 40px rgba(99,102,241,.5),0 0 80px rgba(99,102,241,.2)}50%{box-shadow:0 0 80px rgba(99,102,241,.9),0 0 140px rgba(99,102,241,.4)}}
        @keyframes glow-listen{0%,100%{box-shadow:0 0 40px rgba(16,185,129,.4)}50%{box-shadow:0 0 80px rgba(16,185,129,.8)}}
        @keyframes spin-slow{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/6 bg-[#0a0f1e]/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
            <i className="fas fa-brain text-sm text-white"/>
          </div>
          <span className="font-black tracking-tight">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium">Voice AI</span></span>
          <span className="ml-2 text-xs font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2.5 py-0.5 uppercase tracking-widest">
            <i className="fas fa-comments mr-1"/>Round 1: Verbal
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold px-4 py-1.5 rounded-full border ${countdown < 300 ? 'border-rose-500/50 text-rose-400 bg-rose-500/10' : 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'}`}>
            <i className="fas fa-clock mr-2"/>{fmt(countdown)}
          </div>
          <span className="text-sm text-slate-400">Q <span className="text-white font-bold">{currentQIdx+1}</span>/{questions.length}</span>
        </div>
      </header>

      {/* Progress */}
      <div className="h-1 bg-white/5"><div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-700" style={{width:`${progress}%`}}/></div>

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
            <div className="w-56 h-56">
              <OrbAvatar status={aiStatus} />
            </div>
          </div>

          {/* AI Status label */}
          <div className={`text-xs font-bold uppercase tracking-widest flex items-center gap-2 ${
            aiStatus==='speaking'?'text-indigo-400':
            aiStatus==='listening'?'text-emerald-400':
            aiStatus==='thinking'?'text-amber-400':'text-slate-600'
          }`}>
            {aiStatus==='speaking'&&<><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"/>Zara is Speaking</>}
            {aiStatus==='listening'&&<><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Listening to you</>}
            {aiStatus==='thinking'&&<><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"/>Thinking...</>}
            {aiStatus==='idle'&&'Ready'}
          </div>

          {/* Typewriter Question Text */}
          <div className="max-w-2xl w-full text-center mt-4">
            <p className={`text-xl font-semibold text-white leading-snug ${isTyping ? 'cursor-blink' : ''}`}>
              {displayedQuestion || '\u00a0'}
            </p>
          </div>

          {/* User's live transcript while listening */}
          {aiStatus === 'listening' && (
            <div className="max-w-xl w-full mx-auto mt-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-5 py-3 text-center">
                {transcript
                  ? <p className="text-emerald-300 text-sm leading-relaxed">{transcript}<span className="text-slate-500 italic">{interimText ? ' ' + interimText : ''}</span></p>
                  : <p className="text-slate-600 text-sm italic flex items-center justify-center gap-2">
                      <i className="fas fa-microphone text-emerald-600"/>
                      Listening — speak now...
                    </p>
                }
                {/* Listener waveform */}
                <div className="flex items-center justify-center gap-1.5 h-5 mt-2">
                  {[0,1,2,3,4,5,6,7,8].map(i => (
                    <div key={i} className="w-1 rounded-full bg-emerald-500/50"
                      style={{height:4,animation:`wave ${.25+i*.06}s ease-in-out infinite alternate`,animationDelay:`${i*.04}s`}}/>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Bottom controls */}
        <div className="w-full max-w-lg space-y-4 shrink-0 mt-6">
          <div className="flex gap-2">
            <button onClick={()=>{
              if(aiStatus==='listening'){
                stopListening()
                handleAnswer(currentTxRef.current.trim(), currentQIdx, 0)
              }
              else{startListening(ans=>handleAnswer(ans,currentQIdx,0))}
            }} className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2.5 ${
              aiStatus==='listening'
                ?'bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-[0_0_30px_rgba(239,68,68,.15)]'
                :'bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20'
            }`}>
              <i className={`fas ${aiStatus==='listening'?'fa-stop-circle':'fa-microphone'} text-base`}/>
              {aiStatus==='listening'?'Done Speaking':'Speak Answer'}
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
            {questions.map((_,i) => (
              <div key={i} className={`rounded-full transition-all duration-300 ${
                i<currentQIdx?'w-2 h-2 bg-emerald-500':
                i===currentQIdx?'w-3.5 h-3.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,.8)]':
                'w-2 h-2 bg-white/10'
              }`}/>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
