/**
 * VoiceCodingRound.jsx
 * AI-powered coding round with Monaco Editor + live code sentinel
 * Inspired by Micro1's "explain-while-solving" IDE
 */
import React, { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { API_BASE_URL } from '../apiConfig'

// ── Code Pattern Detector ──────────────────────────────────────────────────
const CODE_PATTERNS = [
  {
    id: 'nested_loop',
    regex: /for\s*.+:\s*\n\s*(for|while)\s*.+:|for\s*\(.*\)\s*\{[\s\S]*?for\s*\(|for\s+\w+\s+in\s+[\w.]+[\s\S]{0,50}for\s+\w+\s+in/,
    observation: "I notice a nested loop in your code — that suggests O(n²) complexity. Is that the best approach for this problem, or can we optimize it?",
    weight: 3
  },
  {
    id: 'recursion',
    regex: /def\s+(\w+)\s*\([^)]*\)[\s\S]{0,200}\1\s*\(|function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,200}\2\s*\(/,
    observation: "You're using recursion here — nice! Can you walk me through the base case and how you're avoiding infinite recursion?",
    weight: 3
  },
  {
    id: 'sort',
    regex: /\.sort\s*\(|sorted\s*\(/,
    observation: "I see you're sorting the data. That's O(n log n). Is there a linear time approach you considered, like using a hash map or counting sort?",
    weight: 2
  },
  {
    id: 'hash_map',
    regex: /\{\s*\}|dict\s*\(\)|Map\s*\(\)|HashMap|{}/,
    observation: "Good instinct using a hash map! This usually gives O(1) lookups. Can you explain what you're storing as keys and values?",
    weight: 2
  },
  {
    id: 'two_pointers',
    regex: /left\s*=\s*0[\s\S]{0,100}right\s*=|pointer|head.*next|slow.*fast/,
    observation: "It looks like you might be using a two-pointer technique — very efficient! Can you explain the intuition behind the pointer movement?",
    weight: 2
  },
  {
    id: 'dp_array',
    regex: /dp\s*=\s*\[|memo\s*=\s*\{|cache\s*=|@lru_cache|memoize/,
    observation: "I see dynamic programming or memoization here — excellent approach! Can you explain what the DP state represents?",
    weight: 3
  },
  {
    id: 'binary_search',
    regex: /mid\s*=\s*(left|low|start|l)\s*[\+\/]|binarySearch|binary_search/,
    observation: "Binary search! Great choice for sorted data. Can you explain how you're handling the edge cases — what happens when the element isn't found?",
    weight: 2
  },
  {
    id: 'stack_queue',
    regex: /\.append\s*\(|\.push\s*\(|deque|Stack\s*\(\)|Queue\s*\(\)/,
    observation: "You're using a stack or queue data structure. Can you explain why this is the right data structure for this problem?",
    weight: 2
  }
]

function detectCodePattern(code) {
  for (const p of CODE_PATTERNS) {
    if (p.regex.test(code)) return p
  }
  return null
}

// ── AI Chat Bubble ─────────────────────────────────────────────────────────
function ChatBubble({ role, text, speaking }) {
  return (
    <div className={`flex gap-3 ${role === 'user' ? 'flex-row-reverse' : ''} mb-3`}>
      {role === 'ai' && (
        <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 ${speaking ? 'ring-2 ring-indigo-400 ring-offset-1 ring-offset-slate-900' : ''}`}>
          <i className="fas fa-robot text-xs text-white" />
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        role === 'ai' ? 'bg-indigo-500/15 border border-indigo-500/20 text-slate-200 rounded-tl-none' :
                        'bg-emerald-500/15 border border-emerald-500/20 text-slate-200 rounded-tr-none'
      }`}>
        {speaking && role === 'ai' && <span className="inline-flex gap-1 mr-2">{[0,1,2].map(i=><span key={i} className="w-1 h-1 rounded-full bg-indigo-400 animate-bounce inline-block" style={{animationDelay:`${i*0.15}s`}}/>)}</span>}
        {text}
      </div>
      {role === 'user' && (
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <i className="fas fa-user text-xs text-emerald-400" />
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function VoiceCodingRound({
  question,          // { id, text, type, codingTask, codingTests }
  interviewId,
  linkId,
  sessionDetail,
  language: sessionLang,
  wsRef,             // WebSocket reference for sending answers/observations
  onComplete         // called when coding round is done
}) {
  const [code, setCode]               = useState(question?.codingTask?.starter_code || '# Write your solution here\n\n')
  const [selectedLang, setSelectedLang] = useState('python')
  const [chatMessages, setChatMessages] = useState([])
  const [aiStatus, setAiStatus]       = useState('idle')  // idle | speaking | listening
  const [transcript, setTranscript]   = useState('')
  const [interimText, setInterimText] = useState('')
  const [inputMode, setInputMode]     = useState('voice') // voice | text
  const [typedInput, setTypedInput]   = useState('')
  const [detectedPatterns, setDetectedPatterns] = useState(new Set())
  const [timeLeft, setTimeLeft]       = useState(900)    // 15 min coding round
  const [runOutput, setRunOutput]     = useState('')
  const [running, setRunning]         = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [phase, setPhase]             = useState('approach') // approach | coding | done

  const recognitionRef    = useRef(null)
  const silenceTimerRef   = useRef(null)
  const codeChangeTimer   = useRef(null)
  const isListeningRef    = useRef(false)
  const mediaRecorderRef  = useRef(null)
  const audioChunksRef    = useRef([])
  const currentTxRef      = useRef('')
  const currentTxRef      = useRef('')
  const chatBottomRef     = useRef(null)
  const submittingRef     = useRef(false)
  const langMap = { 'Hindi':'hi-IN', 'Telugu':'te-IN', 'Tamil':'ta-IN', 'Malayalam':'ml-IN', 'Kannada':'kn-IN', 'English':'en-US' }

  // Auto-scroll chat
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  // Timer
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => { if (p <= 1) { handleSubmit(); return 0 } return p - 1 }), 1000)
    return () => clearInterval(t)
  }, [])

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── TTS ──────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text, onEnd) => {
    try {
      setAiStatus('speaking')
      const res = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' })
      })
      if (!res.ok) throw new Error('TTS Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        setAiStatus('idle')
        URL.revokeObjectURL(url)
        onEnd?.()
      }
      audio.onerror = () => {
        setAiStatus('idle')
        onEnd?.()
      }
      audio.play()
    } catch (e) {
      setAiStatus('idle')
      onEnd?.()
    }
  }, [])

  const addMessage = useCallback((role, text) => {
    setChatMessages(p => [...p, { role, text, ts: Date.now() }])
  }, [])

  const aiSay = useCallback((text, onEnd) => {
    addMessage('ai', text)
    speak(text, onEnd)
  }, [addMessage, speak])

  const askAIForReply = useCallback(async (transcriptText) => {
    try {
      const res = await fetch(`${API_BASE_URL}/coding-round/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: interviewId, transcript: transcriptText, code })
      })
      const data = await res.json()
      if (data.reply) {
        aiSay(data.reply)
      }
    } catch(e) {
      aiSay("I didn't quite catch that. Could you repeat?")
    }
  }, [interviewId, code, aiSay])

  // ── STT ──────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    clearTimeout(silenceTimerRef.current)
    setAiStatus('idle')
    isListeningRef.current = false
  }, [])

  const startListening = useCallback((onFinish) => {
    if (isListeningRef.current) return
    isListeningRef.current = true
    setAiStatus('listening')
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
          const res = await fetch(`${API_BASE_URL}/stt`, { method: 'POST', body: fd })
          const data = await res.json()
          if (data.transcript) {
            onFinish?.(data.transcript)
          } else {
            onFinish?.('')
          }
        } catch (e) {
          onFinish?.('')
        }
        stream.getTracks().forEach(t => t.stop())
      }

      mediaRecorder.start()
      silenceTimerRef.current = setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      }, 5000)

    }).catch(err => {
      console.error("Mic error:", err)
      setAiStatus('idle')
      isListeningRef.current = false
      onFinish?.('')
    })
  }, [stopListening])

  // ── Start: Ask about approach ─────────────────────────────────────────────
  useEffect(() => {
    const intro = `Welcome to the coding round! I'm going to give you a programming problem. Before you write any code, I'd like to hear your approach. Here's the problem: ${question?.text || question?.codingTask?.title || 'Implement the required function'}. Now, before you start coding — can you walk me through your initial thoughts and what approach you'd take?`
    setTimeout(() => {
      aiSay(intro, () => {
        setPhase('approach')
        startListening((answer) => {
          if (answer) {
            addMessage('user', answer)
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
              fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(()=>{})
            }
            setTimeout(() => {
              aiSay("Great approach! Now go ahead and implement your solution. Talk through your thinking as you code — I'll be watching and may ask follow-up questions.", () => setPhase('coding'))
            }, 500)
          } else {
            aiSay("No problem! Let's jump into the coding. Talk through your logic as you write.", () => setPhase('coding'))
          }
        })
      })
    }, 800)
  }, []) // eslint-disable-line

  // ── Code Sentinel: Detect patterns while typing ───────────────────────────
  const handleCodeChange = useCallback((value) => {
    setCode(value || '')
    if (phase !== 'coding') return
    clearTimeout(codeChangeTimer.current)
    codeChangeTimer.current = setTimeout(() => {
      if (aiStatus === 'speaking' || aiStatus === 'listening') return
      const pattern = detectCodePattern(value || '')
      if (pattern && !detectedPatterns.has(pattern.id)) {
        setDetectedPatterns(prev => new Set([...prev, pattern.id]))
        aiSay(pattern.observation, () => {
          startListening((answer) => {
            if (answer) {
              addMessage('user', answer)
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
              } else {
                const fd = new FormData()
                fd.append('interview_id', interviewId)
                fd.append('question_id', `${question?.id}_code_discussion`)
                fd.append('question_text', pattern.observation)
                fd.append('answer_text', answer)
                fd.append('candidate_name', sessionDetail?.candidate_name || 'Candidate')
                fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(()=>{})
              }
              askAIForReply(answer)
            }
          })
        })
        // Send coding observation to background queue via WS
        if (wsRef?.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            action: "coding_observation",
            code: value,
            language: selectedLang
          }))
        }
      }
    }, 3000) // 3s pause in typing triggers observation
  }, [phase, aiStatus, detectedPatterns, aiSay, startListening, addMessage, interviewId, question, sessionDetail, wsRef, selectedLang])

  // ── Submit typed input ────────────────────────────────────────────────────
  const handleSendTyped = () => {
    if (!typedInput.trim()) return
    addMessage('user', typedInput)
    const text = typedInput
    setTypedInput('')
    askAIForReply(text)
  }

  // ── Run code ──────────────────────────────────────────────────────────────
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
        aiSay("Excellent! All test cases passed! Can you walk me through the time and space complexity of your solution?", () => {
          startListening(ans => { if (ans) addMessage('user', ans) })
        })
      } else {
        aiSay("Some test cases didn't pass. Can you think about what edge cases might be causing issues?", () => {
          startListening(ans => { if (ans) addMessage('user', ans) })
        })
      }
    } catch(e) { setRunOutput('Error running code') }
    setRunning(false)
  }

  // ── Submit coding round ───────────────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    stopListening(); window.speechSynthesis?.cancel()

    aiSay("Great work on the coding round! Saving your solution and waiting for uploads...", async () => {
      try {
        await fetch(`${API_BASE_URL}/coding-round/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interview_id: interviewId, code, language: selectedLang })
        })
      } catch(_) {}
      // We don't automatically call onComplete here. 
      // The parent component (VoiceInterviewPage) waits for the video upload to finish 
      // and handles the full session complete.
      setTimeout(() => onComplete?.(), 1500)
    })
  }, [stopListening, aiSay, interviewId, code, selectedLang, onComplete])

  // ── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => () => {
    stopListening(); window.speechSynthesis?.cancel()
    clearTimeout(codeChangeTimer.current); clearTimeout(silenceTimerRef.current)
  }, [stopListening])

  return (
    <div className="flex flex-col h-screen bg-[#0a0f1e] text-white overflow-hidden" style={{ fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes wave { 0%{height:4px} 100%{height:24px} }
        @keyframes bounce-dot { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        .monaco-scroll { background: #0d1117 !important; }
      `}</style>

      {/* Header */}
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
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full border ${
            aiStatus === 'speaking'  ? 'border-indigo-500/50 text-indigo-400 bg-indigo-500/10' :
            aiStatus === 'listening' ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' :
            'border-white/10 text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${aiStatus === 'speaking' ? 'bg-indigo-400 animate-pulse' : aiStatus === 'listening' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}/>
            {aiStatus === 'speaking' ? 'Zara speaking' : aiStatus === 'listening' ? 'Listening' : 'Zara watching'}
          </div>
        </div>
      </header>

      {/* Main: 3-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Problem + AI Chat */}
        <div className="w-[320px] shrink-0 flex flex-col border-r border-white/6 bg-[#0d1117]">
          {/* Problem */}
            <div className="p-4 border-b border-white/6 overflow-y-auto max-h-[50%]">
              <div className="flex items-center gap-2 mb-2">
                <i className="fas fa-puzzle-piece text-amber-400 text-xs"/>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Problem</span>
                <span className="ml-auto text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">{question?.codingTask?.difficulty || 'Medium'}</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed font-semibold">{question?.text || question?.codingTask?.title}</p>
              {question?.codingTask?.description && (
                <p className="text-xs text-slate-400 mt-2 leading-relaxed whitespace-pre-wrap">{question.codingTask.description}</p>
              )}
              {question?.codingTask?.constraints && (
                <div className="mt-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Constraints</span>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed whitespace-pre-wrap">{question.codingTask.constraints}</p>
                </div>
              )}
              {question?.codingTask?.examples && question.codingTask.examples.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Examples</span>
                  {question.codingTask.examples.map((ex, i) => (
                    <div key={i} className="mt-2 bg-white/5 rounded p-2 text-xs font-mono text-slate-300">
                      <div><span className="text-slate-500">Input:</span> {ex.input}</div>
                      <div><span className="text-slate-500">Output:</span> {ex.output}</div>
                      {ex.explanation && <div className="text-slate-400 mt-1 italic">// {ex.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}
              {question?.codingTask?.test_cases && question.codingTask.test_cases.length > 0 && (
                <div className="mt-4">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Test Cases</span>
                  {question.codingTask.test_cases.map((tc, i) => (
                    <div key={i} className="mt-2 bg-white/5 rounded p-2 text-xs font-mono text-slate-300">
                      <div><span className="text-slate-500">Input:</span> {tc.input}</div>
                      <div><span className="text-slate-500">Expected:</span> {tc.expected}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          {/* AI Chat */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <i className="fas fa-robot text-xs text-white"/>
              </div>
              <span className="text-xs font-bold text-indigo-300">Zara — AI Interviewer</span>
            </div>
            {chatMessages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} speaking={aiStatus === 'speaking' && i === chatMessages.length - 1 && m.role === 'ai'} />)}
            {aiStatus === 'listening' && (
              <div className="flex items-end gap-2 mt-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <i className="fas fa-user text-xs text-emerald-400"/>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl rounded-tl-none px-3 py-2 text-xs text-slate-400">
                  {transcript || <span className="italic">Listening...</span>}
                  {interimText && <span className="text-slate-600 italic"> {interimText}</span>}
                </div>
              </div>
            )}
            <div ref={chatBottomRef}/>
          </div>

          {/* Input area */}
          <div className="p-3 border-t border-white/6">
            <div className="flex gap-2 mb-2">
              <button onClick={() => setInputMode('voice')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${inputMode==='voice' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-slate-500'}`}>
                <i className="fas fa-microphone mr-1"/> Voice
              </button>
              <button onClick={() => setInputMode('text')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${inputMode==='text' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' : 'bg-white/5 text-slate-500'}`}>
                <i className="fas fa-keyboard mr-1"/> Type
              </button>
            </div>
            {inputMode === 'text' ? (
              <div className="flex gap-2">
                <input value={typedInput} onChange={e => setTypedInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendTyped()}
                  placeholder="Type your response..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 outline-none focus:border-indigo-500/50"/>
                <button onClick={handleSendTyped} className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center hover:bg-indigo-500/30 transition-all">
                  <i className="fas fa-paper-plane text-xs"/>
                </button>
              </div>
            ) : (
              <button onClick={() => {
                if (aiStatus === 'listening') { stopListening() }
                else { startListening(ans => { if (ans) { addMessage('user', ans); askAIForReply(ans) } }) }
              }} className={`w-full py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                aiStatus === 'listening' ? 'bg-rose-500/20 border border-rose-500/30 text-rose-400' : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              }`}>
                <i className={`fas ${aiStatus === 'listening' ? 'fa-stop-circle' : 'fa-microphone'}`}/>
                {aiStatus === 'listening' ? 'Stop Recording' : 'Speak Response'}
              </button>
            )}
          </div>
        </div>

        {/* Center: Monaco Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor toolbar */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-white/6 bg-[#0d1117] shrink-0">
            <select value={selectedLang} onChange={e => setSelectedLang(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none cursor-pointer">
              {['python','javascript','java','cpp','typescript','go','rust'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <div className="ml-auto flex gap-2">
              <button onClick={handleRun} disabled={running}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-40">
                {running ? <><i className="fas fa-spinner fa-spin"/>Running...</> : <><i className="fas fa-play"/>Run Code</>}
              </button>
              <button onClick={handleSubmit}
                className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 text-xs font-bold hover:bg-indigo-500/25 transition-all">
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
              </div>
              <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap">{runOutput}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Submitting Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 relative mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin"></div>
            <i className="fas fa-cloud-upload-alt absolute inset-0 flex items-center justify-center text-indigo-400 text-xl"></i>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Saving Solution...</h2>
          <p className="text-slate-400 font-medium">Please wait while we upload the session recording securely.</p>
        </div>
      )}
    </div>
  )
}
