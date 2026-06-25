/**
 * VoiceCodingRound.jsx
 * AI-powered coding round — clean, immersive layout
 * Left: Problem only | Center: Editor | Floating orb: voice indicator
 */
import React, { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { API_BASE_URL } from '../apiConfig'

// ── Language config with brand colors ─────────────────────────────────────
const LANGUAGES = [
  { id: 'python',     label: 'Python',     color: '#3b82f6', bg: '#1e3a5f' },
  { id: 'javascript', label: 'JavaScript', color: '#f59e0b', bg: '#3d2e00' },
  { id: 'java',       label: 'Java',       color: '#ef4444', bg: '#3d1515' },
  { id: 'cpp',        label: 'C++',        color: '#8b5cf6', bg: '#2e1f4f' },
  { id: 'typescript', label: 'TypeScript', color: '#60a5fa', bg: '#1a2f4a' },
  { id: 'go',         label: 'Go',         color: '#22d3ee', bg: '#0c2e33' },
  { id: 'rust',       label: 'Rust',       color: '#fb923c', bg: '#3d2200' },
]

// ── Code Pattern Detector ──────────────────────────────────────────────────
const CODE_PATTERNS = [
  {
    id: 'nested_loop',
    regex: /for\s*.+:\s*\n\s*(for|while)\s*.+:|for\s*\(.*\)\s*\{[\s\S]*?for\s*\(|for\s+\w+\s+in\s+[\w.]+[\s\S]{0,50}for\s+\w+\s+in/,
    observation: "I notice a nested loop — that's O(n²) complexity. Is that the best approach, or can we optimize it?"
  },
  {
    id: 'recursion',
    regex: /def\s+(\w+)\s*\([^)]*\)[\s\S]{0,200}\1\s*\(|function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,200}\2\s*\(/,
    observation: "You're using recursion — nice! Can you walk me through the base case and how you're preventing infinite recursion?"
  },
  {
    id: 'sort',
    regex: /\.sort\s*\(|sorted\s*\(/,
    observation: "I see you're sorting — that's O(n log n). Did you consider a linear-time approach like a hash map or counting sort?"
  },
  {
    id: 'hash_map',
    regex: /\{\s*\}|dict\s*\(\)|Map\s*\(\)|HashMap|{}/,
    observation: "Good instinct using a hash map for O(1) lookups! What are you storing as keys and values here?"
  },
  {
    id: 'two_pointers',
    regex: /left\s*=\s*0[\s\S]{0,100}right\s*=|pointer|head.*next|slow.*fast/,
    observation: "Looks like two-pointer technique — very efficient! Can you explain the intuition behind the pointer movement?"
  },
  {
    id: 'dp_array',
    regex: /dp\s*=\s*\[|memo\s*=\s*\{|cache\s*=|@lru_cache|memoize/,
    observation: "Dynamic programming — excellent approach! Can you explain what the DP state represents here?"
  },
]

function detectCodePattern(code) {
  for (const p of CODE_PATTERNS) {
    if (p.regex.test(code)) return p
  }
  return null
}

// ── Animated Orb ─────────────────────────────────────────────────────────
function VoiceOrb({ status }) {
  // status: 'idle' | 'speaking' | 'listening'
  const isAI = status === 'speaking'
  const isUser = status === 'listening'
  const isActive = isAI || isUser

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      {/* Outermost ripple */}
      {isActive && (
        <div
          className="absolute rounded-full"
          style={{
            width: 120, height: 120,
            background: isAI
              ? 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%)',
            animation: 'orbRipple 1.6s ease-out infinite',
          }}
        />
      )}
      {/* Mid ring */}
      {isActive && (
        <div
          className="absolute rounded-full"
          style={{
            width: 90, height: 90,
            background: isAI
              ? 'radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 70%)',
            animation: 'orbRipple 1.6s ease-out 0.3s infinite',
          }}
        />
      )}
      {/* Core orb */}
      <div
        className="rounded-full relative z-10 transition-all duration-500"
        style={{
          width: isActive ? 72 : 60,
          height: isActive ? 72 : 60,
          background: isAI
            ? 'radial-gradient(circle at 35% 35%, #818cf8, #6366f1 50%, #4f46e5)'
            : isUser
            ? 'radial-gradient(circle at 35% 35%, #34d399, #10b981 50%, #059669)'
            : 'radial-gradient(circle at 35% 35%, #475569, #334155 50%, #1e293b)',
          boxShadow: isAI
            ? '0 0 30px rgba(99,102,241,0.8), 0 0 60px rgba(99,102,241,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
            : isUser
            ? '0 0 30px rgba(16,185,129,0.8), 0 0 60px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
            : '0 0 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
          animation: isActive ? 'orbBoom 0.8s ease-in-out infinite alternate' : 'none',
        }}
      >
        {/* Gloss highlight */}
        <div
          className="absolute rounded-full"
          style={{
            top: '15%', left: '20%',
            width: '35%', height: '25%',
            background: 'rgba(255,255,255,0.3)',
            filter: 'blur(2px)',
          }}
        />
      </div>
    </div>
  )
}

// ── Custom Language Dropdown ───────────────────────────────────────────────
function LanguageDropdown({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const currentLang = LANGUAGES.find(l => l.id === value) || LANGUAGES[0]
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative select-none" style={{ minWidth: 140 }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all"
        style={{
          background: currentLang.bg,
          borderColor: currentLang.color + '60',
          color: currentLang.color,
        }}
      >
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: currentLang.color, boxShadow: `0 0 6px ${currentLang.color}` }}
        />
        {currentLang.label}
        <svg className="ml-auto" width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d={open ? 'M1 5L5 1L9 5' : 'M1 1L5 5L9 1'} stroke={currentLang.color} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute top-full mt-1 left-0 rounded-xl border overflow-hidden z-50"
          style={{ background: '#0d1117', borderColor: '#ffffff12', minWidth: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
        >
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              onClick={() => { onChange(lang.id); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold transition-all text-left"
              style={{
                background: lang.id === value ? lang.bg : 'transparent',
                color: lang.color,
              }}
              onMouseEnter={e => { if (lang.id !== value) e.currentTarget.style.background = lang.bg + '80' }}
              onMouseLeave={e => { if (lang.id !== value) e.currentTarget.style.background = 'transparent' }}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: lang.color, boxShadow: lang.id === value ? `0 0 8px ${lang.color}` : 'none' }}
              />
              {lang.label}
              {lang.id === value && (
                <svg className="ml-auto" width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6L5 9L10 3" stroke={lang.color} strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function VoiceCodingRound({
  question,
  interviewId,
  linkId,
  sessionDetail,
  language: sessionLang,
  wsRef,
  onComplete
}) {
  const [code, setCode]               = useState(question?.codingTask?.starter_code || '# Write your solution here\n\n')
  const [selectedLang, setSelectedLang] = useState('python')
  const [aiStatus, setAiStatus]       = useState('idle')  // idle | speaking | listening
  const [transcript, setTranscript]   = useState('')
  const [detectedPatterns, setDetectedPatterns] = useState(new Set())
  const [timeLeft, setTimeLeft]       = useState(900)
  const [runOutput, setRunOutput]     = useState('')
  const [running, setRunning]         = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orbLabel, setOrbLabel]       = useState('Zara is watching')

  const recognitionRef    = useRef(null)
  const silenceTimerRef   = useRef(null)
  const codeChangeTimer   = useRef(null)
  const isListeningRef    = useRef(false)
  const mediaRecorderRef  = useRef(null)
  const audioChunksRef    = useRef([])
  const currentTxRef      = useRef('')
  const submittingRef     = useRef(false)

  // Timer
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => {
      if (p <= 1) { handleSubmit(); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // ── TTS ────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text, onEnd) => {
    try {
      setAiStatus('speaking')
      setOrbLabel('Zara speaking…')
      const res = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'shimmer' })
      })
      if (!res.ok) throw new Error('TTS Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        setAiStatus('idle')
        setOrbLabel('Zara is watching')
        URL.revokeObjectURL(url)
        onEnd?.()
      }
      audio.onerror = () => { setAiStatus('idle'); setOrbLabel('Zara is watching'); onEnd?.() }
      audio.play()
    } catch (e) {
      setAiStatus('idle')
      setOrbLabel('Zara is watching')
      onEnd?.()
    }
  }, [])

  const aiSay = useCallback((text, onEnd) => {
    speak(text, onEnd)
  }, [speak])

  const askAIForReply = useCallback(async (transcriptText) => {
    try {
      const res = await fetch(`${API_BASE_URL}/coding-round/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: interviewId, transcript: transcriptText, code })
      })
      const data = await res.json()
      if (data.reply) aiSay(data.reply)
    } catch (e) {
      aiSay("I didn't catch that — could you repeat?")
    }
  }, [interviewId, code, aiSay])

  // ── STT ────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    clearTimeout(silenceTimerRef.current)
    setAiStatus('idle')
    setOrbLabel('Zara is watching')
    isListeningRef.current = false
    setTranscript('')
  }, [])

  const startListening = useCallback((onFinish) => {
    if (isListeningRef.current) return
    isListeningRef.current = true
    setAiStatus('listening')
    setOrbLabel('Listening to you…')
    setTranscript('')

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const fd = new FormData()
        fd.append('file', audioBlob, 'audio.webm')

        try {
          // Pass language hint for better Indian English recognition
          const res = await fetch(`${API_BASE_URL}/stt?language=en`, { method: 'POST', body: fd })
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
        stream.getTracks().forEach(t => t.stop())
        setAiStatus('idle')
        setOrbLabel('Zara is watching')
        isListeningRef.current = false
        setTranscript('')
      }

      mediaRecorder.start()
      // Auto-stop after 90s of recording
      silenceTimerRef.current = setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      }, 90000)

    }).catch(err => {
      console.error("Mic error:", err)
      setAiStatus('idle')
      setOrbLabel('Zara is watching')
      isListeningRef.current = false
      onFinish?.('')
    })
  }, [stopListening])

  // ── Initial greeting ──────────────────────────────────────────────────
  const hasGreeted = useRef(false)
  useEffect(() => {
    if (hasGreeted.current) return
    hasGreeted.current = true
    
    const intro = `Welcome to the coding round! Here's your problem: ${question?.text || question?.codingTask?.title || 'Implement the required function'}. Before writing code, tell me your approach.`
    setTimeout(() => {
      aiSay(intro, () => {
        startListening((answer) => {
          if (answer) {
            if (wsRef?.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                action: "save_answer",
                interview_id: interviewId,
                question_id: question?.id || 0,
                question_text: 'Coding approach explanation',
                answer_text: answer,
                candidate_name: sessionDetail?.candidate_name || 'Candidate',
                timestamp: new Date().toISOString()
              }))
            } else {
              const fd = new FormData()
              fd.append('interview_id', interviewId)
              fd.append('question_id', question?.id || 0)
              fd.append('question_text', 'Coding approach explanation')
              fd.append('answer_text', answer)
              fd.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
              fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(() => {})
            }
            setTimeout(() => aiSay("Great! Now implement your solution and talk through your thinking as you code."), 400)
          } else {
            aiSay("Let's jump into coding — feel free to talk through your logic as you write.")
          }
        })
      })
    }, 800)
  }, []) // eslint-disable-line

  // ── Code Sentinel ─────────────────────────────────────────────────────
  const handleCodeChange = useCallback((value) => {
    setCode(value || '')
    clearTimeout(codeChangeTimer.current)
    codeChangeTimer.current = setTimeout(() => {
      if (aiStatus === 'speaking' || aiStatus === 'listening') return
      const pattern = detectCodePattern(value || '')
      if (pattern && !detectedPatterns.has(pattern.id)) {
        setDetectedPatterns(prev => new Set([...prev, pattern.id]))
        aiSay(pattern.observation, () => {
          startListening((answer) => {
            if (answer) {
              if (wsRef?.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  action: "save_answer",
                  interview_id: interviewId,
                  question_id: `${question?.id}_code_discussion`,
                  question_text: pattern.observation,
                  answer_text: answer,
                  candidate_name: sessionDetail?.candidate_name || 'Candidate',
                  timestamp: new Date().toISOString()
                }))
              }
              askAIForReply(answer)
            }
          })
        })
      }
    }, 3000)
  }, [aiStatus, detectedPatterns, aiSay, startListening, interviewId, question, sessionDetail, wsRef, askAIForReply])

  // ── Run code ──────────────────────────────────────────────────────────
  const handleRun = async () => {
    setRunning(true); setRunOutput('')
    try {
      const res = await fetch(`${API_BASE_URL}/coding-round/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: interviewId, code, language: selectedLang })
      })
      const data = await res.json()
      setRunOutput(data.output || data.error || 'No output')
      if (data.all_passed) {
        aiSay("Excellent! All test cases passed! Can you walk me through the time and space complexity?", () => {
          startListening(ans => { if (ans) askAIForReply(ans) })
        })
      } else {
        aiSay("Some test cases didn't pass. What edge cases might be causing issues?", () => {
          startListening(ans => { if (ans) askAIForReply(ans) })
        })
      }
    } catch (e) { setRunOutput('Error running code') }
    setRunning(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    stopListening()

    aiSay("Great work on the coding round! Saving your solution…", async () => {
      try {
        await fetch(`${API_BASE_URL}/coding-round/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interview_id: interviewId, code, language: selectedLang })
        })
      } catch (_) {}
      setTimeout(() => onComplete?.(), 1500)
    })
  }, [stopListening, aiSay, interviewId, code, selectedLang, onComplete])

  // ── Cleanup ───────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopListening()
    clearTimeout(codeChangeTimer.current)
    clearTimeout(silenceTimerRef.current)
  }, [stopListening])

  const currentLang = LANGUAGES.find(l => l.id === selectedLang) || LANGUAGES[0]

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1e] text-white overflow-hidden" style={{ fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes orbBoom {
          0%   { transform: scale(1); }
          100% { transform: scale(1.18); }
        }
        @keyframes orbRipple {
          0%   { transform: scale(0.85); opacity: 0.8; }
          100% { transform: scale(1.5);  opacity: 0; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .orb-label { animation: fadeSlideIn 0.3s ease; }
      `}</style>

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-white/6 bg-[#0d1117]/90 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
            <i className="fas fa-brain text-xs text-white"/>
          </div>
          <span className="font-black text-sm">HireIQ <span className="text-indigo-400">Voice AI</span></span>
          <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            <i className="fas fa-code mr-1"/>Round 2: Coding
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold px-3 py-1 rounded-full border ${timeLeft < 180 ? 'border-rose-500/50 text-rose-400 bg-rose-500/10' : 'border-amber-500/30 text-amber-300 bg-amber-500/10'}`}>
            <i className="fas fa-clock mr-1.5"/>{fmt(timeLeft)}
          </div>
        </div>
      </header>

      {/* ── Main: 2-column ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Problem Statement Only */}
        <div className="w-[300px] shrink-0 flex flex-col border-r border-white/6 bg-[#0d1117] overflow-y-auto">
          <div className="p-5">
            {/* Problem header */}
            <div className="flex items-center gap-2 mb-3">
              <i className="fas fa-puzzle-piece text-amber-400 text-xs"/>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Problem</span>
              <span className="ml-auto text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 font-semibold">
                {question?.codingTask?.difficulty || 'Medium'}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-sm font-bold text-white leading-relaxed mb-2">
              {question?.text || question?.codingTask?.title}
            </h2>

            {/* Description */}
            {question?.codingTask?.description && (
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap mb-4">
                {question.codingTask.description}
              </p>
            )}

            {/* Constraints */}
            {question?.codingTask?.constraints && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <i className="fas fa-shield-alt text-rose-400 text-xs"/>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Constraints</span>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/15 rounded-lg p-3">
                  <p className="text-xs text-rose-300 leading-relaxed whitespace-pre-wrap font-mono">
                    {question.codingTask.constraints}
                  </p>
                </div>
              </div>
            )}

            {/* Examples */}
            {question?.codingTask?.examples && question.codingTask.examples.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <i className="fas fa-flask text-indigo-400 text-xs"/>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Examples</span>
                </div>
                {question.codingTask.examples.map((ex, i) => (
                  <div key={i} className="mb-2 bg-white/4 border border-white/8 rounded-lg p-3 text-xs font-mono">
                    <div className="mb-1">
                      <span className="text-slate-500 mr-1">Input:</span>
                      <span className="text-emerald-300">{ex.input}</span>
                    </div>
                    <div className="mb-1">
                      <span className="text-slate-500 mr-1">Output:</span>
                      <span className="text-amber-300">{ex.output}</span>
                    </div>
                    {ex.explanation && (
                      <div className="text-slate-500 italic mt-1 text-[0.68rem]">// {ex.explanation}</div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Test cases (visible ones) */}
            {question?.codingTask?.test_cases && question.codingTask.test_cases.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <i className="fas fa-vial text-purple-400 text-xs"/>
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Test Cases</span>
                </div>
                {question.codingTask.test_cases.map((tc, i) => (
                  <div key={i} className="mb-2 bg-white/4 border border-white/8 rounded-lg p-3 text-xs font-mono">
                    <div className="mb-1">
                      <span className="text-slate-500 mr-1">Input:</span>
                      <span className="text-emerald-300">{tc.input}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 mr-1">Expected:</span>
                      <span className="text-amber-300">{tc.expected}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor toolbar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/6 bg-[#0d1117] shrink-0">
            <LanguageDropdown value={selectedLang} onChange={setSelectedLang} />
            <div className="ml-auto flex gap-2">
              <button
                onClick={handleRun}
                disabled={running}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                style={{
                  background: 'rgba(16,185,129,0.1)',
                  border: '1px solid rgba(16,185,129,0.3)',
                  color: '#10b981',
                }}
              >
                {running
                  ? <><i className="fas fa-spinner fa-spin"/>Running…</>
                  : <><i className="fas fa-play"/>Run Code</>
                }
              </button>
              <button
                onClick={handleSubmit}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  background: 'rgba(99,102,241,0.15)',
                  border: '1px solid rgba(99,102,241,0.3)',
                  color: '#818cf8',
                }}
              >
                <i className="fas fa-check"/>Submit
              </button>
            </div>
          </div>

          {/* Monaco */}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={selectedLang === 'cpp' ? 'cpp' : selectedLang}
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 16, bottom: 16 },
                suggestOnTriggerCharacters: true,
                quickSuggestions: true,
              }}
            />
          </div>

          {/* Output Panel */}
          {runOutput && (
            <div className="h-36 shrink-0 border-t border-white/6 bg-[#0a0a0f] p-3 overflow-auto">
              <div className="flex items-center gap-2 mb-2">
                <i className="fas fa-terminal text-xs text-emerald-400"/>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Output</span>
                <button
                  onClick={() => setRunOutput('')}
                  className="ml-auto text-slate-600 hover:text-slate-400 transition-colors"
                >
                  <i className="fas fa-times text-xs"/>
                </button>
              </div>
              <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap">{runOutput}</pre>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Voice Orb (bottom center) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 flex flex-col items-center pb-5 pointer-events-none"
        style={{ zIndex: 40 }}
      >
        {/* Live transcript strip */}
        {aiStatus === 'listening' && transcript && (
          <div
            className="mb-3 px-4 py-2 rounded-full text-xs font-medium text-white/80 pointer-events-none"
            style={{
              background: 'rgba(16,185,129,0.15)',
              border: '1px solid rgba(16,185,129,0.2)',
              backdropFilter: 'blur(10px)',
              maxWidth: 400,
              textAlign: 'center',
            }}
          >
            {transcript}
          </div>
        )}

        <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
          {/* Orb itself — also acts as mic toggle button */}
          <button
            onClick={() => {
              if (aiStatus === 'listening') {
                stopListening()
              } else if (aiStatus === 'idle') {
                startListening(ans => {
                  if (ans) askAIForReply(ans)
                })
              }
            }}
            className="focus:outline-none"
            title={aiStatus === 'listening' ? 'Click to stop recording' : 'Click to speak'}
          >
            <VoiceOrb status={aiStatus} />
          </button>

          {/* Status label */}
          <span
            key={orbLabel}
            className="orb-label text-xs font-semibold tracking-wide"
            style={{
              color: aiStatus === 'speaking'
                ? '#818cf8'
                : aiStatus === 'listening'
                ? '#34d399'
                : '#475569',
            }}
          >
            {orbLabel}
          </span>
          {aiStatus === 'idle' && (
            <span className="text-[10px] text-slate-600">Click orb to speak</span>
          )}
        </div>
      </div>

      {/* Submitting overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 relative mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20"/>
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"/>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Saving Solution…</h2>
          <p className="text-slate-400 font-medium">Please wait while we upload the session recording securely.</p>
        </div>
      )}
    </div>
  )
}
