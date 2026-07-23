/**
 * VoiceCaseStudy.jsx
 * AI-moderated case study discussion round
 * Conversational branching follow-ups based on candidate keywords
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../apiConfig'
import OrbAvatar from '../components/OrbAvatar'
import { VOICE_TRANSLATIONS } from '../utils/voiceTranslations'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import aiVideoUrl from '../assets/ai_avatar.mp4'
import { useExitConfirmation } from '../hooks/useExitConfirmation'

// ── VideoAvatar for case study ─────────────────────────────────────────────────────
function CaseStudyVideoAvatar({ status, size = 200 }) {
  const videoRef = useRef(null)
  const isSpeaking = status === 'speaking'

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isSpeaking) { video.play().catch(() => {}) }
    else { video.pause(); video.currentTime = 0 }
  }, [isSpeaking])

  const ringColor = status === 'speaking'
    ? 'rgba(139,92,246,0.8)'
    : status === 'listening'
    ? 'rgba(16,185,129,0.6)'
    : 'rgba(139,92,246,0.3)'
  const glowColor = status === 'speaking'
    ? '0 0 50px rgba(139,92,246,0.6), 0 0 100px rgba(139,92,246,0.25)'
    : status === 'listening'
    ? '0 0 40px rgba(16,185,129,0.5)'
    : '0 0 20px rgba(139,92,246,0.15)'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <style>{`
        @keyframes csRingSpeak { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.08);opacity:1} }
        @keyframes csRingListen { 0%{transform:scale(1);opacity:.4} 100%{transform:scale(1.05);opacity:.9} }
      `}</style>
      {(status === 'speaking' || status === 'listening') && (
        <div style={{
          position: 'absolute', inset: -8, borderRadius: '50%',
          border: `2px solid ${ringColor}`,
          animation: status === 'speaking' ? 'csRingSpeak 1.4s ease-in-out infinite' : 'csRingListen 2s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }}/>
      )}
      {(status === 'speaking' || status === 'listening') && (
        <div style={{
          position: 'absolute', inset: -18, borderRadius: '50%',
          border: `1px solid ${ringColor.replace('0.8','0.2').replace('0.6','0.15')}`,
          animation: status === 'speaking' ? 'csRingSpeak 1.4s ease-in-out 0.4s infinite' : 'csRingListen 2s ease-in-out 0.6s infinite alternate',
          pointerEvents: 'none',
        }}/>
      )}
      <video
        ref={videoRef}
        src={aiVideoUrl}
        loop
        muted={false}
        playsInline
        preload="auto"
        style={{
          width: size, height: size,
          objectFit: 'cover',
          borderRadius: '50%',
          boxShadow: glowColor,
          border: `3px solid ${ringColor}`,
          transition: 'box-shadow 0.5s ease, border-color 0.5s ease',
          display: 'block',
          background: '#0a0f1e',
        }}
      />
    </div>
  )
}

// ── Follow-up question trees by topic keywords ────────────────────────────
const FOLLOWUP_TREES = {
  // Scaling / Technical
  scaling: {
    keywords: ['scale', 'traffic', 'load', 'database', 'performance', 'latency', 'throughput'],
    followups: [
      "Good thinking on scaling. Can you walk me through specifically how you'd handle database bottlenecks?",
      "Interesting! What caching strategy would you implement, and why?",
      "You mentioned scaling — how would you ensure data consistency across distributed services?",
      "Great! What monitoring and alerting would you put in place to catch performance regressions early?"
    ]
  },
  // Architecture
  architecture: {
    keywords: ['microservices', 'monolith', 'api', 'architecture', 'design', 'service', 'modular'],
    followups: [
      "Interesting architecture choice. What trade-offs does this introduce that you'd need to manage?",
      "How would you handle service-to-service communication and failures in that design?",
      "What would be your rollback strategy if this architectural change caused issues in production?",
      "How do you ensure observability across these services?"
    ]
  },
  // Team / People
  people: {
    keywords: ['team', 'stakeholder', 'conflict', 'communicate', 'manager', 'priority', 'deadline'],
    followups: [
      "How would you handle pushback from the team on your proposed solution?",
      "Can you describe how you'd prioritize competing demands from different stakeholders?",
      "What does success look like here, and how would you measure it with your team?",
      "How would you ensure alignment across different teams working on this?"
    ]
  },
  // Product
  product: {
    keywords: ['user', 'feature', 'product', 'metric', 'kpi', 'retention', 'growth', 'revenue'],
    followups: [
      "What metrics would you use to measure the success of this initiative?",
      "How would you validate that users actually want this before building it?",
      "What's the minimum viable version of this that you could ship first?",
      "How does this align with the company's broader strategic goals?"
    ]
  },
  // Budget / Resources
  budget: {
    keywords: ['budget', 'cost', 'resource', 'tradeoff', 'prioritize', 'limited', 'constraint'],
    followups: [
      "Given resource constraints, how would you sequence the implementation?",
      "What would you cut first if the budget was reduced by half?",
      "How do you make the business case for the investment this requires?",
      "What's the ROI timeline you'd present to leadership?"
    ]
  },
  // Default fallback
  default: {
    followups: [
      "Interesting perspective. Can you tell me more about the risks involved in that approach?",
      "How would you validate that decision before fully committing to it?",
      "What would you do differently if that approach didn't work as expected?",
      "How does this connect to the bigger business objective?"
    ]
  }
}

function getFollowup(transcript, usedFollowups, language = 'English') {
  const text = transcript.toLowerCase()
  for (const [key, tree] of Object.entries(FOLLOWUP_TREES)) {
    if (key === 'default') continue
    if (tree.keywords.some(kw => text.includes(kw))) {
      const unused = tree.followups.filter(f => !usedFollowups.has(f))
      if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)]
    }
  }
  const t = VOICE_TRANSLATIONS[language] || VOICE_TRANSLATIONS['English']
  const generics = t.generics
  return generics[Math.floor(Math.random() * generics.length)]
}

// ── Chat Bubble ───────────────────────────────────────────────────────────
function Bubble({ role, text, typing }) {
  return (
    <div className={`flex gap-3 mb-4 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      {role === 'ai' ? (
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0">
          <OrbAvatar status={typing ? 'speaking' : 'idle'} />
        </div>
      ) : (
        <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-emerald-500/20 border-2 border-emerald-500/40">
          <i className="fas fa-user text-sm text-emerald-400"/>
        </div>
      )}
      <div className={`max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
        role === 'ai' ? 'bg-indigo-500/10 border border-indigo-500/15 text-slate-200 rounded-tl-none' :
                        'bg-emerald-500/10 border border-emerald-500/15 text-slate-200 rounded-tr-none'
      }`}>
        {typing ? (
          <span className="flex gap-1.5 items-center py-1">
            {[0,1,2].map(i => <span key={i} className="w-2 h-2 rounded-full bg-indigo-400" style={{animation:'bounce-dot 0.9s ease infinite',animationDelay:`${i*0.15}s`}}/>)}
          </span>
        ) : text}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function VoiceCaseStudy({
  question,         // { id, text, type, caseStudyIndex }
  allQuestions,     // array of all case study questions
  interviewId,
  linkId,
  sessionDetail,
  language: sessionLang,
  wsRef,             // WebSocket reference for sending answers
  duration,
  onComplete
}) {
  const [chatMessages, setChatMessages] = useState([])
  const [aiStatus, setAiStatus]         = useState('idle')
  const [transcript, setTranscript]     = useState('')
  const [interimText, setInterimText]   = useState('')
  const [inputMode, setInputMode]       = useState('voice')
  const [typedInput, setTypedInput]     = useState('')
  const [currentScenarioIdx, setCurrentScenarioIdx] = useState(0)
  const [questionCount, setQuestionCount] = useState(0)
  const [usedFollowups]                 = useState(new Set())
  const [phase, setPhase]               = useState('presenting') // presenting | discussing | transitioning | done
  const [timeLeft, setTimeLeft]         = useState(duration || 600) // 10 min per case study

  const mediaRecorderRef = useRef(null)
  const recognitionRef   = useRef(null)
  const silenceTimerRef  = useRef(null)
  const isListeningRef   = useRef(false)
  const currentTxRef     = useRef('')
  const chatBottomRef    = useRef(null)
  const submittingRef    = useRef(false)
  const isTransitioningRef = useRef(false)
  const playingAudioRef  = useRef(null)
  const langMap = { 'Hindi':'hi-IN','Telugu':'te-IN','Tamil':'ta-IN','Malayalam':'ml-IN','Kannada':'kn-IN','English':'en-US' }

  const scenarios = allQuestions?.length ? allQuestions : [question]

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  // Temporarily removed timer effect to place it below handleComplete

  // Unload Tracking + Exit Confirmation Dialog
  useExitConfirmation({
    active: true,
    onConfirmExit: async () => {
      if (linkId) {
        navigator.sendBeacon(`${API_BASE_URL}/interview/${linkId}/alert`, JSON.stringify({
          type: "warning",
          message: "Candidate closed the window during the case study round."
        }))
      }
    },
    message: `You are in the middle of the <strong>Case Study Round</strong>.<br/><br/>If you leave now, your response will not be saved and your session may be marked as <strong>incomplete</strong>.<br/><br/>Are you sure you want to exit?`,
  })

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── ESC + Fullscreen proctoring ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.key === 'Escape') {
        setTimeout(async () => {
          try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
              await document.documentElement.requestFullscreen().catch(() => {})
            }
          } catch (_) {}
        }, 150)
      }
    }
    const handleFullscreenChange = async () => {
      if (!document.fullscreenElement) {
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
              document.documentElement.requestFullscreen().catch(() => {})
            }
          } else {
            window.location.href = '/dashboard'
          }
        })
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  // ── TTS / STT ──────────────────────────────────────────────────────────────
  const speak = useCallback(async (text, onEnd) => {
    try {
      setAiStatus('speaking')
      if (playingAudioRef.current) {
        playingAudioRef.current.pause()
        playingAudioRef.current = null
      }
      
      const res = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voice: 'shimmer', 
          language: sessionLang,
          use_custom_voice: sessionDetail?.voice_clone || sessionDetail?.voice_cloning_enabled || false,
          ...(sessionDetail?.custom_voice_id ? { voice_id: sessionDetail.custom_voice_id } : {})
        })
      })
      if (!res.ok) throw new Error('TTS Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      playingAudioRef.current = audio
      
      audio.onended = () => {
        if (playingAudioRef.current === audio) playingAudioRef.current = null
        setAiStatus('idle')
        URL.revokeObjectURL(url)
        setTimeout(() => onEnd?.(), 200) // Race condition guard
      }
      audio.onerror = () => {
        if (playingAudioRef.current === audio) playingAudioRef.current = null
        setAiStatus('idle')
        onEnd?.()
      }
      audio.play().catch(e => {
        console.error('Audio play error:', e)
        if (playingAudioRef.current === audio) playingAudioRef.current = null
        setAiStatus('idle')
        onEnd?.()
      })
    } catch (e) {
      console.error('TTS error:', e)
      setAiStatus('idle')
      onEnd?.()
    }
  }, [sessionLang])

  const addMsg = useCallback((role, text) => setChatMessages(p => [...p, { role, text, ts: Date.now() }]), [])

  const aiSay = useCallback((text, onEnd) => {
    addMsg('ai', text)
    speak(text, onEnd)
  }, [addMsg, speak])

  const stopListening = useCallback(() => {
    isListeningRef.current = false
    clearTimeout(silenceTimerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop() } catch(_) {}
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch(_) {}
    }
    setAiStatus('idle')
  }, [])

  const startListening = useCallback(async (onFinish) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      const audioChunks = []
      
      let localTranscript = ''
      currentTxRef.current = ''
      setTranscript('')
      setInterimText('')

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition()
        recognitionRef.current = recognition
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = langMap[sessionLang] || 'en-US'

        recognition.onresult = (event) => {
          let interim = ''
          let final = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript
            else interim += event.results[i][0].transcript
          }
          if (final) {
            localTranscript += (localTranscript ? ' ' : '') + final.trim()
            setTranscript(localTranscript)
          }
          setInterimText(interim)
          currentTxRef.current = localTranscript + (interim ? ' ' + interim : '')

          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
          }, 5000)  // 5s grace after last detected speech
        }
        recognition.start()
      }

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        setAiStatus('idle')
        if (recognitionRef.current) {
          try { recognitionRef.current.stop() } catch(e) {}
        }
        
        const finalTx = currentTxRef.current.trim()
        if (finalTx) {
          onFinish?.(finalTx)
        } else {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' })
          const fd = new FormData()
          fd.append('file', audioBlob, 'audio.webm')
          try {
            const targetLang = langMap[sessionLang] || 'en-US'
            const res = await fetch(`${API_BASE_URL}/stt?language=${targetLang.split('-')[0]}`, { method: 'POST', body: fd })
            const data = await res.json()
            if (data.transcript) {
              setTranscript(data.transcript)
              onFinish?.(data.transcript)
            } else {
              onFinish?.('')
            }
          } catch (e) {
            onFinish?.('')
          }
        }
        stream.getTracks().forEach(t => t.stop())
        isListeningRef.current = false
      }

      isListeningRef.current = true
      setAiStatus('listening')
      mediaRecorder.start()

      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      }, 15000)  // 15s initial grace period before first speech

    } catch (err) {
      console.error("Mic access denied or error:", err)
      onFinish?.('')
    }
  }, [sessionLang, stopListening])

  // ── Handle candidate's answer ─────────────────────────────────────────────
  const handleAnswer = useCallback((answer, currentIdx) => {
    if (isTransitioningRef.current) return
    const t = VOICE_TRANSLATIONS[sessionLang] || VOICE_TRANSLATIONS['English']
    
    // Check intent
    const lowerAns = answer?.toLowerCase() || ''
    const isSkip = /(skip|next question|move to next|move on|next scenario)/.test(lowerAns)
    const isRepeat = /(repeat|come again|didn't understand|not understand|what did you say|say that again)/.test(lowerAns)

    if (isSkip) {
      isTransitioningRef.current = true
      addMsg('user', answer || 'Skip Scenario')
      if (playingAudioRef.current) playingAudioRef.current.pause()
      
      const nextIdx = currentIdx + 1
      if (nextIdx < scenarios.length) {
        setCurrentScenarioIdx(nextIdx)
        setQuestionCount(0)
        const transList = t.csTransitions
        const transition = transList[Math.floor(Math.random() * transList.length)]
        setTimeout(() => {
          isTransitioningRef.current = false
          presentScenario(nextIdx, transition)
        }, 100)
      } else {
        handleComplete()
      }
      return
    }

    if (isRepeat) {
      addMsg('user', answer)
      const sc = scenarios[currentIdx]
      const scenarioPrefix = currentIdx === 0 ? t.csScenarioPrefix : t.csScenarioNextPrefix
      const scenarioText = `${scenarioPrefix}${sc.text}`
      const prompt = currentIdx === 0 ? `${scenarioText}. ${t.csPromptFirst}` : `${scenarioText}. ${t.csPromptNext}`
      aiSay(prompt, () => startListening(ans => handleAnswer(ans, currentIdx)))
      return
    }

    if (!answer?.trim()) { aiSay(t.csNeedMore, () => startListening(ans => handleAnswer(ans, currentIdx))); return }
    addMsg('user', answer)
    setQuestionCount(p => p + 1)

    // Save to backend
    const scenario = scenarios[currentIdx]
    if (interviewId && scenario) {
      if (wsRef?.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          action: "save_answer",
          interview_id: interviewId,
          question_id: scenario.id || currentIdx,
          question_text: scenario.text,
          answer_text: answer,
          candidate_name: sessionDetail?.candidate_name || 'Candidate',
          timestamp: new Date().toISOString()
        }))
      } else {
        const fd = new FormData()
        fd.append('interview_id', interviewId)
        fd.append('question_id', scenario.id || currentIdx)
        fd.append('question_text', scenario.text)
        fd.append('answer_text', answer)
        fd.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
        fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(()=>{})
      }
    }

    // Should we ask a follow-up or move to next scenario?
    const followup = questionCount < 4 ? getFollowup(answer, usedFollowups, sessionLang) : null
    if (followup && questionCount < 5) {
      usedFollowups.add(followup)
      const ackList = t.csAck
      const transition = ackList[Math.floor(Math.random() * ackList.length)]
      setTimeout(() => {
        aiSay(`${transition} ${followup}`, () => {
          startListening(ans => handleAnswer(ans, currentIdx))
        })
      }, 400)
    } else {
      // Move to next scenario or finish
      isTransitioningRef.current = true
      const nextIdx = currentIdx + 1
      if (nextIdx < scenarios.length) {
        setCurrentScenarioIdx(nextIdx)
        setQuestionCount(0)
        const transList = t.csTransitions
        const transition = transList[Math.floor(Math.random() * transList.length)]
        setTimeout(() => {
          isTransitioningRef.current = false
          presentScenario(nextIdx, transition)
        }, 100)
      } else {
        handleComplete()
      }
    }
  }, [questionCount, scenarios, interviewId, sessionDetail, addMsg, aiSay, startListening, usedFollowups, sessionLang])

  // ── Present scenario ───────────────────────────────────────────────────────
  const presentScenario = useCallback((idx, prefix = '') => {
    const sc = scenarios[idx]
    if (!sc) { handleComplete(); return }
    const t = VOICE_TRANSLATIONS[sessionLang] || VOICE_TRANSLATIONS['English']
    const scenarioPrefix = idx === 0 ? t.csScenarioPrefix : t.csScenarioNextPrefix
    const scenarioText = `${prefix ? prefix + ' ' : ''}${scenarioPrefix}${sc.text}`
    const prompt = idx === 0
      ? `${scenarioText}. ${t.csPromptFirst}`
      : `${scenarioText}. ${t.csPromptNext}`

    setTimeout(() => {
      aiSay(prompt, () => {
        setPhase('discussing')
        startListening(ans => handleAnswer(ans, idx))
      })
    }, 400)
  }, [scenarios, aiSay, startListening, handleAnswer, sessionLang])

  // ── Start ─────────────────────────────────────────────────────────────────
  const hasStartedRef = useRef(false)
  
  useEffect(() => {
    if (hasStartedRef.current) return
    hasStartedRef.current = true
    
    const t = VOICE_TRANSLATIONS[sessionLang] || VOICE_TRANSLATIONS['English']
    const introTemplate = scenarios.length > 1 ? t.csIntro : t.csIntroSingle
    const intro = introTemplate.replace('[COUNT]', scenarios.length)
    setTimeout(() => aiSay(intro, () => presentScenario(0)), 800)
  }, [])  

  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => { if (p <= 1) { handleComplete(); return 0 } return p - 1 }), 1000)
    return () => clearInterval(t)
  }, [handleComplete])

  const handleComplete = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    
    stopListening()
    window.speechSynthesis?.cancel()
    if (playingAudioRef.current) {
      playingAudioRef.current.pause()
      playingAudioRef.current = null
    }
    
    onComplete?.()
  }, [stopListening, onComplete])

  useEffect(() => {
    return () => {
      stopListening()
      window.speechSynthesis?.cancel()
      if (playingAudioRef.current) playingAudioRef.current.pause()
    }
  }, [stopListening])

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentScenario = scenarios[currentScenarioIdx]

  return (
    <div className="h-screen bg-[#0a0f1e] text-white flex flex-col overflow-hidden" style={{ fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes wave { 0%{height:4px} 100%{height:28px} }
        @keyframes bounce-dot { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 30px rgba(139,92,246,0.4)} 50%{box-shadow:0 0 70px rgba(139,92,246,0.8)} }
      `}</style>

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/6 bg-[#0a0f1e]/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-500 to-indigo-600 flex items-center justify-center">
            <i className="fas fa-brain text-sm text-white"/>
          </div>
          <span className="font-black tracking-tight">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-indigo-400 font-medium tracking-normal">Voice AI</span></span>
          <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-full px-2.5 py-0.5">
            <i className="fas fa-briefcase mr-1"/>Round 3: Case Study
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold px-3 py-1.5 rounded-full border ${timeLeft < 120 ? 'border-rose-500/50 text-rose-400 bg-rose-500/10' : 'border-violet-500/30 text-violet-300 bg-violet-500/10'}`}>
            <i className="fas fa-clock mr-2"/>{fmt(timeLeft)}
          </div>
          <div className="text-sm text-slate-400">{currentScenarioIdx + 1}/{scenarios.length}</div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

        {/* Left: AI Avatar */}
        <div className="lg:w-[360px] flex flex-col items-center justify-center gap-6 px-8 py-8 border-r border-white/6 bg-gradient-to-b from-violet-950/20 to-[#0a0f1e]">
          {/* Video Avatar */}
          <CaseStudyVideoAvatar status={aiStatus} size={200} />

          {/* Zara ID */}
          <div className="text-center">
            <p className="text-base font-bold text-violet-300">Zara</p>
            <p className="text-xs text-slate-500">AI Interviewer · Case Study Round</p>
            <div className={`mt-2 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 ${
              aiStatus === 'speaking'  ? 'text-violet-400' :
              aiStatus === 'listening' ? 'text-emerald-400' : 'text-slate-600'
            }`}>
              {aiStatus === 'speaking'  && <><span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse"/>Speaking</>}
              {aiStatus === 'listening' && <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Listening</>}
              {aiStatus === 'idle'      && 'Ready'}
            </div>
          </div>

          {/* Mic bars */}
          {aiStatus === 'listening' && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-slate-600 uppercase tracking-widest"><i className="fas fa-microphone text-emerald-500 mr-1"/>Your mic</p>
              <div className="flex items-center gap-1.5 h-8">
                {[0,1,2,3,4,5,6].map(i => <div key={i} className="w-1.5 rounded-full bg-emerald-500/60" style={{height:4,animation:`wave ${0.3+i*0.07}s ease-in-out infinite alternate`,animationDelay:`${i*0.05}s`}}/>)}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="mt-auto w-full pt-4 border-t border-white/5 space-y-2 text-xs">
            <div className="flex justify-between text-slate-600"><span>Candidate</span><span className="text-slate-400">{sessionDetail?.candidate_name}</span></div>
            <div className="flex justify-between text-slate-600"><span>Scenario</span><span className="text-violet-400 font-semibold">{currentScenarioIdx + 1} of {scenarios.length}</span></div>
            <div className="flex justify-between text-slate-600"><span>Follow-ups asked</span><span className="text-slate-400">{questionCount}</span></div>
          </div>
        </div>

        {/* Right: Scenario + Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Scenario card */}
          {currentScenario && (
            <div className="m-5 mb-3 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-2xl p-5 shadow-xl shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0">
                  <i className="fas fa-briefcase text-violet-400"/>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-violet-400">Scenario {currentScenarioIdx + 1}</span>
                    <span className="w-1 h-1 rounded-full bg-slate-600"/>
                    <span className="text-xs text-slate-500 uppercase tracking-widest">{currentScenario.type || 'Case Study'}</span>
                  </div>
                  <p className="text-base font-semibold text-white leading-relaxed">{currentScenario.text}</p>
                </div>
              </div>
            </div>
          )}

          {/* Chat feed */}
          <div className="flex-1 overflow-y-auto px-5 py-2 space-y-1">
            {chatMessages.map((m, i) => <Bubble key={i} role={m.role} text={m.text} typing={false}/>)}
            {aiStatus === 'listening' && (
              <div className="flex gap-3 mb-4 flex-row-reverse">
                <div className="w-9 h-9 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center shrink-0">
                  <i className="fas fa-user text-sm text-emerald-400"/>
                </div>
                <div className="max-w-[72%] rounded-2xl rounded-tr-none px-4 py-3 text-sm leading-relaxed bg-emerald-500/10 border border-emerald-500/15 text-slate-300">
                  {transcript || <span className="text-slate-600 italic">Listening to your response...</span>}
                  {interimText && <span className="text-slate-500 italic"> {interimText}</span>}
                </div>
              </div>
            )}
            <div ref={chatBottomRef}/>
          </div>

          {/* Controls */}
          <div className="p-5 border-t border-white/6 space-y-3 shrink-0">
            <div className="flex gap-2">
              <button onClick={() => setInputMode('voice')} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${inputMode==='voice' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-slate-500 border border-transparent'}`}>
                <i className="fas fa-microphone mr-1.5"/>Voice
              </button>
              <button onClick={() => setInputMode('text')} className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${inputMode==='text' ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30' : 'bg-white/5 text-slate-500 border border-transparent'}`}>
                <i className="fas fa-keyboard mr-1.5"/>Type
              </button>
            </div>

            {inputMode === 'text' ? (
              <div className="flex gap-2">
                <input value={typedInput} onChange={e => setTypedInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && typedInput.trim()) { handleAnswer(typedInput, currentScenarioIdx); setTypedInput('') } }}
                  placeholder="Type your response and press Enter..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/50"/>
                <button onClick={() => { if (typedInput.trim()) { handleAnswer(typedInput, currentScenarioIdx); setTypedInput('') } }}
                  className="w-10 h-10 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center hover:bg-violet-500/30 transition-all">
                  <i className="fas fa-paper-plane text-sm"/>
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => {
                  if (aiStatus === 'listening') {
                    stopListening()
                    // do not call handleAnswer here, startListening's onstop handles it
                  } else {
                    startListening(ans => handleAnswer(ans, currentScenarioIdx))
                  }
                }} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  aiStatus === 'listening' ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                }`}>
                  <i className={`fas ${aiStatus === 'listening' ? 'fa-stop-circle' : 'fa-microphone'}`}/>
                  {aiStatus === 'listening' ? 'Done Speaking' : 'Speak Your Answer'}
                </button>
                <button onClick={() => {
                  if (currentScenarioIdx < scenarios.length - 1) {
                    stopListening()
                    handleAnswer('skip', currentScenarioIdx)
                  } else {
                    handleComplete()
                  }
                }} disabled={isTransitioningRef.current} className="px-4 py-3 rounded-xl bg-white/5 text-slate-300 border border-white/10 text-xs font-semibold hover:bg-white/10 transition-all uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed">
                  {currentScenarioIdx < scenarios.length - 1 ? 'Next Scenario' : 'Submit Interview'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
