/**
 * VoiceCaseStudy.jsx
 * AI-moderated case study discussion round
 * Conversational branching follow-ups based on candidate keywords
 */
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { API_BASE_URL } from '../apiConfig'

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

function getFollowup(transcript, usedFollowups) {
  const text = transcript.toLowerCase()
  for (const [key, tree] of Object.entries(FOLLOWUP_TREES)) {
    if (key === 'default') continue
    if (tree.keywords.some(kw => text.includes(kw))) {
      const unused = tree.followups.filter(f => !usedFollowups.has(f))
      if (unused.length > 0) return unused[Math.floor(Math.random() * unused.length)]
    }
  }
  const unused = FOLLOWUP_TREES.default.followups.filter(f => !usedFollowups.has(f))
  return unused.length > 0 ? unused[Math.floor(Math.random() * unused.length)] : null
}

// ── Chat Bubble ───────────────────────────────────────────────────────────
function Bubble({ role, text, typing }) {
  return (
    <div className={`flex gap-3 mb-4 ${role === 'user' ? 'flex-row-reverse' : ''}`}>
      <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
        role === 'ai' ? 'bg-gradient-to-br from-violet-500 to-indigo-600 shadow-[0_0_20px_rgba(139,92,246,0.3)]' : 'bg-emerald-500/20 border-2 border-emerald-500/40'
      }`}>
        <i className={`fas ${role === 'ai' ? 'fa-robot' : 'fa-user'} text-sm ${role === 'ai' ? 'text-white' : 'text-emerald-400'}`}/>
      </div>
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
  const [timeLeft, setTimeLeft]         = useState(600) // 10 min per case study

  const recognitionRef  = useRef(null)
  const silenceTimerRef = useRef(null)
  const isListeningRef  = useRef(false)
  const currentTxRef    = useRef('')
  const chatBottomRef   = useRef(null)
  const submittingRef   = useRef(false)
  const langMap = { 'Hindi':'hi-IN','Telugu':'te-IN','Tamil':'ta-IN','Malayalam':'ml-IN','Kannada':'kn-IN','English':'en-US' }

  const scenarios = allQuestions?.length ? allQuestions : [question]

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => { if (p <= 1) { handleComplete(); return 0 } return p - 1 }), 1000)
    return () => clearInterval(t)
  }, [])
  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── TTS / STT ──────────────────────────────────────────────────────────────
  const speak = useCallback((text, onEnd) => {
    const synth = window.speechSynthesis; if (!synth) { onEnd?.(); return }
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = langMap[sessionLang] || 'en-US'; u.rate = 0.9; u.pitch = 1.08
    u.onend = () => { setAiStatus('idle'); onEnd?.() }
    u.onstart = () => setAiStatus('speaking')
    u.onerror = () => { setAiStatus('idle'); onEnd?.() }
    const v = synth.getVoices().find(v => v.lang.startsWith('en') && v.localService) || synth.getVoices().find(v => v.lang.startsWith('en'))
    if (v) u.voice = v
    synth.speak(u)
  }, [sessionLang])

  const addMsg = useCallback((role, text) => setChatMessages(p => [...p, { role, text, ts: Date.now() }]), [])

  const aiSay = useCallback((text, onEnd) => {
    addMsg('ai', text)
    speak(text, onEnd)
  }, [addMsg, speak])

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
    rec.lang = langMap[sessionLang] || 'en-US'
    rec.continuous = true; rec.interimResults = true
    recognitionRef.current = rec; isListeningRef.current = true
    currentTxRef.current = ''; setTranscript(''); setInterimText('')
    setAiStatus('listening')

    rec.onresult = ev => {
      let fin = '', interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) fin += ev.results[i][0].transcript
        else interim += ev.results[i][0].transcript
      }
      if (fin) { currentTxRef.current += fin + ' '; setTranscript(currentTxRef.current) }
      setInterimText(interim)
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = setTimeout(() => {
        if (isListeningRef.current) { stopListening(); onFinish?.(currentTxRef.current.trim()) }
      }, 5000)
    }
    rec.onend = () => { if (isListeningRef.current) try { rec.start() } catch(_) {} }
    rec.onerror = e => { if (e.error !== 'no-speech') console.warn('SR:', e.error) }
    try { rec.start() } catch(e) { console.warn(e) }
  }, [sessionLang, stopListening])

  // ── Handle candidate's answer ─────────────────────────────────────────────
  const handleAnswer = useCallback((answer, currentIdx) => {
    if (!answer?.trim()) { aiSay("Take your time — can you share your initial thoughts?", () => startListening(ans => handleAnswer(ans, currentIdx))); return }
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
    const followup = questionCount < 2 ? getFollowup(answer, usedFollowups) : null
    if (followup && questionCount < 3) {
      usedFollowups.add(followup)
      const transition = ["Interesting perspective!", "Good thinking!", "I like how you approached that.", "That's a solid point."][Math.floor(Math.random()*4)]
      setTimeout(() => {
        aiSay(`${transition} ${followup}`, () => {
          startListening(ans => handleAnswer(ans, currentIdx))
        })
      }, 400)
    } else {
      // Move to next scenario or finish
      const nextIdx = currentIdx + 1
      if (nextIdx < scenarios.length) {
        setCurrentScenarioIdx(nextIdx)
        setQuestionCount(0)
        const transition = ["Let's move to the next scenario.", "Great discussion! Here's another scenario for you.", "Now let's switch gears."][Math.floor(Math.random()*3)]
        setTimeout(() => presentScenario(nextIdx, transition), 600)
      } else {
        handleComplete()
      }
    }
  }, [questionCount, scenarios, interviewId, sessionDetail, addMsg, aiSay, startListening, usedFollowups])

  // ── Present scenario ───────────────────────────────────────────────────────
  const presentScenario = useCallback((idx, prefix = '') => {
    const sc = scenarios[idx]
    if (!sc) { handleComplete(); return }
    const scenarioText = `${prefix} Here's your ${idx === 0 ? '' : 'next '}scenario: ${sc.text}`
    const prompt = idx === 0
      ? `${scenarioText}. Take a moment to process this, then walk me through how you'd approach it.`
      : `${scenarioText}. How would you handle this?`

    setTimeout(() => {
      aiSay(prompt, () => {
        setPhase('discussing')
        startListening(ans => handleAnswer(ans, idx))
      })
    }, 400)
  }, [scenarios, aiSay, startListening, handleAnswer])

  // ── Start ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const intro = `Welcome to the case study discussion round. I'm going to present you with ${scenarios.length > 1 ? `${scenarios.length} business scenarios` : 'a real-world scenario'}. For each one, I'd like you to think out loud and walk me through your reasoning. There are no wrong answers — I'm interested in how you think. Let's begin.`
    setTimeout(() => aiSay(intro, () => presentScenario(0)), 800)
  }, []) // eslint-disable-line

  const handleComplete = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    stopListening(); window.speechSynthesis?.cancel()
    aiSay("Excellent discussion! You've demonstrated strong analytical thinking. I'm saving your responses now.", async () => {
      try { await fetch(`${API_BASE_URL}/complete-session/${linkId}`, { method: 'POST' }) } catch(_) {}
      setTimeout(() => onComplete?.(), 1200)
    })
  }, [stopListening, aiSay, linkId, onComplete])

  useEffect(() => () => { stopListening(); window.speechSynthesis?.cancel() }, [stopListening])

  // ── Render ─────────────────────────────────────────────────────────────────
  const currentScenario = scenarios[currentScenarioIdx]

  return (
    <div className="min-h-screen bg-[#0a0f1e] text-white flex flex-col" style={{ fontFamily: "'Inter',sans-serif" }}>
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
          {/* Avatar */}
          <div className="relative w-52 h-52 flex items-center justify-center">
            <div className={`absolute inset-0 rounded-full transition-all duration-700 ${aiStatus === 'speaking' ? 'bg-violet-500/20 blur-2xl scale-125' : aiStatus === 'listening' ? 'bg-emerald-500/15 blur-2xl scale-110' : 'bg-transparent'}`}/>
            {aiStatus === 'listening' && <div className="absolute inset-0 rounded-full border border-dashed border-emerald-500/30" style={{ animation: 'spin 12s linear infinite' }}/>}
            <div className={`relative z-10 w-44 h-44 rounded-full flex flex-col items-center justify-center gap-2 transition-all duration-500 ${
              aiStatus === 'speaking'  ? 'border-4 border-violet-500 bg-violet-950/60' :
              aiStatus === 'listening' ? 'border-4 border-emerald-500 bg-emerald-950/40' :
              aiStatus === 'thinking'  ? 'border-4 border-amber-500 animate-pulse bg-amber-950/30' :
              'border-4 border-slate-700 bg-slate-900/60'
            }`} style={{ animation: aiStatus === 'speaking' ? 'glow 1.5s ease-in-out infinite' : 'none' }}>
              <i className={`fas fa-robot text-5xl ${
                aiStatus === 'speaking'  ? 'text-violet-300' :
                aiStatus === 'listening' ? 'text-emerald-400' :
                aiStatus === 'thinking'  ? 'text-amber-400' : 'text-slate-500'
              }`}/>
              {aiStatus === 'speaking' && (
                <div className="flex items-center gap-1 h-5">
                  {[0,1,2,3,4].map(i => <div key={i} className="w-1 rounded-full bg-violet-400" style={{ height:4, animation:`wave ${0.4+i*0.08}s ease-in-out infinite alternate`, animationDelay:`${i*0.06}s` }}/>)}
                </div>
              )}
            </div>
          </div>

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
                  if (aiStatus === 'listening') { stopListening() }
                  else { startListening(ans => handleAnswer(ans, currentScenarioIdx)) }
                }} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                  aiStatus === 'listening' ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                }`}>
                  <i className={`fas ${aiStatus === 'listening' ? 'fa-stop-circle' : 'fa-microphone'}`}/>
                  {aiStatus === 'listening' ? 'Done Speaking' : 'Speak Your Answer'}
                </button>
                <button onClick={handleComplete} className="px-4 py-3 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold hover:bg-rose-500/20 transition-all">
                  End
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
