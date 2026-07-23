/**
 * VoiceCodingRound.jsx
 * AI-powered coding round — clean, immersive layout
 * Left: Problem only | Center: Editor | Floating orb: voice indicator
 */
import React, { useState, useRef, useCallback, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { API_BASE_URL } from '../apiConfig'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import aiVideoUrl from '../assets/ai_avatar.mp4'
import { useExitConfirmation } from '../hooks/useExitConfirmation'

// ── Language config with brand colors ─────────────────────────────────────
const LANGUAGES = [
  { id: 'python', label: 'Python', color: '#3b82f6', bg: '#1e3a5f' },
  { id: 'javascript', label: 'JavaScript', color: '#f59e0b', bg: '#3d2e00' },
  { id: 'java', label: 'Java', color: '#ef4444', bg: '#3d1515' },
  { id: 'cpp', label: 'C++', color: '#8b5cf6', bg: '#2e1f4f' },
  { id: 'typescript', label: 'TypeScript', color: '#60a5fa', bg: '#1a2f4a' },
  { id: 'go', label: 'Go', color: '#22d3ee', bg: '#0c2e33' },
  { id: 'rust', label: 'Rust', color: '#fb923c', bg: '#3d2200' },
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

// ── Video Avatar Orb (replaces VoiceOrb) ─────────────────────────────────────────────────
function VideoAvatarOrb({ status }) {
  const videoRef = useRef(null)
  const isSpeaking = status === 'speaking'

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isSpeaking) {
      video.play().catch(() => { })
    } else {
      video.pause()
      video.currentTime = 0
    }
  }, [isSpeaking])

  const size = isSpeaking ? 88 : 72
  const ringColor = status === 'speaking'
    ? 'rgba(168,85,247,0.8)'
    : status === 'listening'
      ? 'rgba(16,185,129,0.7)'
      : 'rgba(99,102,241,0.3)'
  const glowColor = status === 'speaking'
    ? '0 0 40px rgba(168,85,247,0.7), 0 0 80px rgba(168,85,247,0.3)'
    : status === 'listening'
      ? '0 0 30px rgba(16,185,129,0.6), 0 0 60px rgba(16,185,129,0.25)'
      : '0 0 12px rgba(99,102,241,0.2)'

  return (
    <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`
        @keyframes vidOrbSpeak { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(1.1);opacity:1} }
        @keyframes vidOrbListen { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.05);opacity:1} }
      `}</style>
      {/* Pulsing ring */}
      {(status === 'speaking' || status === 'listening') && (
        <div style={{
          position: 'absolute', inset: -6, borderRadius: '50%',
          border: `2px solid ${ringColor}`,
          animation: status === 'speaking' ? 'vidOrbSpeak 1.3s ease-in-out infinite' : 'vidOrbListen 2s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }} />
      )}
      <video
        ref={videoRef}
        src={aiVideoUrl}
        loop
        muted
        playsInline
        preload="auto"
        style={{
          width: size, height: size,
          objectFit: 'cover',
          borderRadius: '50%',
          boxShadow: glowColor,
          border: `2px solid ${ringColor}`,
          transition: 'all 0.4s ease',
          display: 'block',
          background: '#0a0f1e',
        }}
      />
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
          <path d={open ? 'M1 5L5 1L9 5' : 'M1 1L5 5L9 1'} stroke={currentLang.color} strokeWidth="1.5" strokeLinecap="round" />
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
                  <path d="M2 6L5 9L10 3" stroke={lang.color} strokeWidth="1.5" strokeLinecap="round" />
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
  duration,
  onComplete
}) {
  const [code, setCode] = useState(question?.codingTask?.starter_code || '# Write your solution here\n\n')
  const [selectedLang, setSelectedLang] = useState('python')
  const [aiStatus, setAiStatus] = useState('idle')  // idle | speaking | listening
  const [transcript, setTranscript] = useState('')
  const [detectedPatterns, setDetectedPatterns] = useState(new Set())
  const [timeLeft, setTimeLeft] = useState(duration || 900)
  const [runOutput, setRunOutput] = useState('')
  const [runResultData, setRunResultData] = useState(null)
  const [evaluatedCount, setEvaluatedCount] = useState(0)
  const [selectedTestCase, setSelectedTestCase] = useState(0)
  const [consoleHeight, setConsoleHeight] = useState(250)
  const [orbPos, setOrbPos] = useState({ x: null, y: null })
  const [running, setRunning] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [orbLabel, setOrbLabel] = useState('Zara is watching')

  const recognitionRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const codeChangeTimer = useRef(null)
  const isListeningRef = useRef(false)
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const currentTxRef = useRef('')
  const submittingRef = useRef(false)
  const lastRunResultRef = useRef(null)  // stores latest run result for chat context
  const activeAudioRef = useRef(null)    // prevents overlapping audio

  // Unload Tracking + Exit Confirmation Dialog
  useExitConfirmation({
    active: true,
    onConfirmExit: async () => {
      if (linkId) {
        navigator.sendBeacon(`${API_BASE_URL}/interview/${linkId}/alert`, JSON.stringify({
          type: "warning",
          message: "Candidate closed the window during the coding round."
        }))
      }
    },
    message: `You are in the middle of the <strong>Coding Round</strong>.<br/><br/>If you leave now, your current code will not be submitted and your session may be marked as <strong>incomplete</strong>.<br/><br/>Are you sure you want to exit?`,
  })

  // Test case animation
  useEffect(() => {
    if (runResultData) {
      setEvaluatedCount(0);
      const totalToEvaluate = (runResultData.visible_results?.length || 0) + (runResultData.hidden_summary?.total || 0);
      let count = 0;
      const interval = setInterval(() => {
        count++;
        setEvaluatedCount(count);
        if (count >= totalToEvaluate) {
          clearInterval(interval);
        }
      }, 400); // 400ms delay per test case
      return () => clearInterval(interval);
    }
  }, [runResultData]);

  const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  // ── TTS ────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text, onEnd) => {
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause()
        activeAudioRef.current = null
      }
      setAiStatus('speaking')
      setOrbLabel('Zara speaking…')
      const res = await fetch(`${API_BASE_URL}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          voice: 'shimmer',
          language: sessionLang,
          use_custom_voice: sessionDetail?.voice_clone || sessionDetail?.voice_cloning_enabled || false,
          voice_id: sessionDetail?.custom_voice_id || null
        })
      })
      if (!res.ok) throw new Error('TTS Failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      activeAudioRef.current = audio
      audio.onended = () => {
        setAiStatus('idle')
        setOrbLabel('Zara is watching')
        URL.revokeObjectURL(url)
        activeAudioRef.current = null
        onEnd?.()
      }
      audio.onerror = () => { 
        setAiStatus('idle')
        setOrbLabel('Zara is watching')
        activeAudioRef.current = null
        onEnd?.() 
      }
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

  const askAIForReply = useCallback(async (transcriptText, runResult) => {
    try {
      const res = await fetch(`${API_BASE_URL}/coding-round/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewId,
          transcript: transcriptText,
          code,
          run_result: runResult || lastRunResultRef.current || null
        })
      })
      const data = await res.json()
      if (data.reply) aiSay(data.reply)
    } catch (e) {
      aiSay("I didn't catch that — could you repeat?")
    }
  }, [interviewId, code, aiSay])

  // ── STT ────────────────────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    clearTimeout(silenceTimerRef.current)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Stopping the MediaRecorder triggers onstop → STT fetch automatically
      mediaRecorderRef.current.stop()
    } else {
      // Nothing was recording, just reset UI
      setAiStatus('idle')
      setOrbLabel('Zara is watching')
      isListeningRef.current = false
    }
  }, [])

  const startListening = useCallback((onFinish) => {
    if (isListeningRef.current) return
    isListeningRef.current = true
    setAiStatus('listening')
    setOrbLabel('Listening… tap orb to stop')
    setTranscript('')

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        // Reset UI immediately so user knows recording ended
        setAiStatus('idle')
        setOrbLabel('Processing…')

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const fd = new FormData()
        fd.append('file', audioBlob, 'audio.webm')

        try {
          const langMap = { 'Hindi': 'hi', 'Telugu': 'te', 'Tamil': 'ta', 'Malayalam': 'ml', 'Kannada': 'kn', 'English': 'en' };
          const sttLang = langMap[sessionLang] || 'en';
          const res = await fetch(`${API_BASE_URL}/stt?language=${sttLang}`, { method: 'POST', body: fd })
          const data = await res.json()
          if (data.transcript) {
            setTranscript(data.transcript)
            onFinish?.(data.transcript)
          } else {
            onFinish?.('')
          }
        } catch (e) {
          onFinish?.('')
        } finally {
          stream.getTracks().forEach(t => t.stop())
          setOrbLabel('Zara is watching')
          isListeningRef.current = false
        }
      }

      mediaRecorder.start()
      // Auto-stop after 60s of recording
      silenceTimerRef.current = setTimeout(() => {
        if (mediaRecorder.state !== 'inactive') mediaRecorder.stop()
      }, 60000)

    }).catch(err => {
      console.error("Mic error:", err)
      setAiStatus('idle')
      setOrbLabel('Mic error — check permissions')
      isListeningRef.current = false
      onFinish?.('')
    })
  }, [])

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
              fetch(`${API_BASE_URL}/save-answer`, { method: 'POST', body: fd }).catch(() => { })
            }
            setTimeout(() => aiSay("Great! Now implement your solution and talk through your thinking as you code."), 400)
          } else {
            aiSay("Let's jump into coding — feel free to talk through your logic as you write.")
          }
        })
      })
    }, 800)
  }, [])  

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
    setRunning(true); setRunOutput(''); setRunResultData(null)
    try {
      const res = await fetch(`${API_BASE_URL}/coding-round/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interview_id: interviewId, code, language: selectedLang })
      })
      const data = await res.json()
      const totalTests = question?.codingTask?.test_cases?.length || 14;
      let outputText = '';
      const rr = data.run_result;

      if (rr?.runtime_error) {
        outputText = `Execution Error:\n${rr.runtime_error}\n\nPassed 0 / ${totalTests} Test Cases`;
      } else if (rr?.visible_results?.length) {
        const passedCount = rr.visible_results.filter(r => r.passed).length + (rr.hidden_summary?.passed || 0);
        outputText = `Passed ${passedCount} / ${totalTests} Test Cases\n\n`;
        outputText += rr.visible_results.map(r =>
          `Test ${r.id} (Visible): ${r.passed ? 'PASSED ✅' : 'FAILED ❌'}\nInput: ${JSON.stringify(r.input)}\nExpected: ${JSON.stringify(r.expected)}\nGot: ${JSON.stringify(r.output)}`
        ).join('\n\n');
        if (rr.hidden_summary) {
          outputText += `\n\nHidden Tests: ${rr.hidden_summary.passed} / ${rr.hidden_summary.total} Passed`;
        }
      } else if (rr?.output) {
        outputText = `Output:\n${rr.output}`;
      }

      setRunOutput(outputText || data.error || 'No output')
      setRunResultData(rr || null)
      lastRunResultRef.current = rr || null

      // ── Zara speaks about the result ──
      if (rr?.runtime_error) {
        // Read out a short version of the error
        const shortErr = rr.runtime_error.length > 120
          ? rr.runtime_error.slice(0, 120) + '…'
          : rr.runtime_error
        aiSay(`There's an error in your code: ${shortErr}. Can you tell me where you think the bug might be?`, () => {
          startListening(ans => { if (ans) askAIForReply(ans, rr) })
        })
      } else if (rr?.all_passed) {
        aiSay("Excellent! All test cases passed! Can you walk me through the time and space complexity of your solution?", () => {
          startListening(ans => { if (ans) askAIForReply(ans, rr) })
        })
      } else {
        const passedVisible = rr?.visible_results?.filter(r => r.passed).length || 0
        const totalVisible = rr?.visible_results?.length || 0
        const failedTc = rr?.visible_results?.find(r => !r.passed)
        let zaraMsg = `You passed ${passedVisible} out of ${totalVisible} visible test cases.`
        if (failedTc) {
          zaraMsg += ` For example, with input ${JSON.stringify(failedTc.input)}, your code returned ${JSON.stringify(failedTc.output)} but I expected ${JSON.stringify(failedTc.expected)}.`
        }
        zaraMsg += ` What do you think is causing the failure?`
        aiSay(zaraMsg, () => {
          startListening(ans => { if (ans) askAIForReply(ans, rr) })
        })
      }
    } catch (e) {
      setRunOutput('Error running code — please try again')
    }
    setRunning(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (isTimeout = false) => {
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    stopListening()
    
    // Stop ongoing audio immediately
    if (window.speechSynthesis) window.speechSynthesis.cancel()
    if (activeAudioRef.current) {
      activeAudioRef.current.pause()
      activeAudioRef.current = null
    }
    setAiStatus('idle')

    const timeoutFlag = typeof isTimeout === 'boolean' ? isTimeout : false;
    const message = timeoutFlag 
      ? "Thank you for the interview."
      : "We are saving your interview, please wait.";

    // Speak the message and submit the code concurrently, wait for both
    const speakPromise = new Promise(resolve => {
      aiSay(message, resolve)
    })

    const fetchPromise = fetch(`${API_BASE_URL}/coding-round/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interview_id: interviewId, code, language: selectedLang })
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
    })

    try {
      await Promise.all([speakPromise, fetchPromise])
      setTimeout(() => onComplete?.(), 500)
    } catch (err) {
      console.error("Failed to submit coding round:", err)
      alert("Failed to save your code. Please check your connection and try submitting again.")
      setIsSubmitting(false)
      submittingRef.current = false
    }
  }, [stopListening, interviewId, code, selectedLang, onComplete, aiSay])

  // Timer
  useEffect(() => {
    const t = setInterval(() => setTimeLeft(p => {
      if (p <= 1) { handleSubmit(true); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [handleSubmit])

  // ── ESC + Fullscreen proctoring ────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = async (e) => {
      if (e.key === 'Escape') {
        setTimeout(async () => {
          try {
            if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
              await document.documentElement.requestFullscreen().catch(() => { })
            }
          } catch (_) { }
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
      stopListening()
      clearTimeout(codeChangeTimer.current)
      clearTimeout(silenceTimerRef.current)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
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
            <i className="fas fa-brain text-xs text-white" />
          </div>
          <span className="font-black text-sm">HireIQ <span className="text-indigo-400">Voice AI</span></span>
          <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5">
            <i className="fas fa-code mr-1" />Round 2: Coding
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold px-3 py-1 rounded-full border ${timeLeft < 180 ? 'border-rose-500/50 text-rose-400 bg-rose-500/10' : 'border-amber-500/30 text-amber-300 bg-amber-500/10'}`}>
            <i className="fas fa-clock mr-1.5" />{fmt(timeLeft)}
          </div>
        </div>
      </header>

      {/* ── Main: 2-column ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left: Problem Statement Only */}
        <div className="w-[450px] shrink-0 flex flex-col border-r border-white/6 bg-[#0d1117] overflow-y-auto">
          <div className="p-5">
            {/* Problem header */}
            <div className="flex items-center gap-2 mb-3">
              <i className="fas fa-puzzle-piece text-amber-400 text-xs" />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Problem</span>
              <span className="ml-auto text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 font-semibold">
                {question?.codingTask?.difficulty || 'Medium'}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-base font-bold text-white leading-relaxed mb-4">
              {question?.text || question?.codingTask?.title}
            </h2>

            {/* Description */}
            {question?.codingTask?.description && (
              <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap mb-6">
                {question.codingTask.description}
              </p>
            )}

            {/* Constraints */}
            {question?.codingTask?.constraints && (
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <i className="fas fa-shield-alt text-rose-400 text-xs" />
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
                  <i className="fas fa-flask text-indigo-400 text-xs" />
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
                  <i className="fas fa-vial text-purple-400 text-xs" />
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Test Cases</span>
                </div>
                {question.codingTask.test_cases.filter(tc => tc.visible !== false).map((tc, i) => (
                  <div key={i} className="mb-2 bg-white/4 border border-white/8 rounded-lg p-3 text-xs font-mono">
                    <div className="mb-1">
                      <span className="text-slate-500 mr-1">Input:</span>
                      <span className="text-emerald-300">
                        {typeof tc.input === 'object' ? JSON.stringify(tc.input) : String(tc.input)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 mr-1">Expected:</span>
                      <span className="text-amber-300">
                        {typeof (tc.expected !== undefined ? tc.expected : tc.output) === 'object' 
                          ? JSON.stringify(tc.expected !== undefined ? tc.expected : tc.output) 
                          : String(tc.expected !== undefined ? tc.expected : tc.output)}
                      </span>
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
                  ? <><i className="fas fa-spinner fa-spin" />Running…</>
                  : <><i className="fas fa-play" />Run Code</>
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
                <i className="fas fa-check" />Submit
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
            <div className="relative shrink-0 border-t border-white/6 bg-[#0a0a0f] flex flex-col" style={{ height: consoleHeight }}>
              {/* Drag Handle */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-indigo-500/50 transition-colors z-10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  const startY = e.clientY;
                  const startH = consoleHeight;
                  const onMouseMove = (moveEvent) => {
                    const deltaY = startY - moveEvent.clientY;
                    setConsoleHeight(Math.max(100, Math.min(600, startH + deltaY)));
                  };
                  const onMouseUp = () => {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                  };
                  document.addEventListener('mousemove', onMouseMove);
                  document.addEventListener('mouseup', onMouseUp);
                }}
              />
              <div className="flex-1 flex overflow-hidden p-0 m-0">
                {runResultData ? (
                  <div className="flex flex-col w-full h-full text-slate-300 bg-[#0a0f1e] overflow-hidden">
                    {runResultData.status === 'error' && runResultData.runtime_error && (
                      <div className="bg-rose-500/10 border-b border-rose-500/20 p-3 text-rose-400 font-mono text-[11px] whitespace-pre-wrap shrink-0">
                        <i className="fas fa-exclamation-triangle mr-2"></i>
                        {runResultData.runtime_error}
                      </div>
                    )}
                    <div className="flex w-full flex-grow overflow-hidden">
                      {/* LEFT PANEL */}
                      <div className="w-1/3 border-r border-slate-700/50 flex flex-col h-full bg-slate-900/30 overflow-y-auto scrollbar-none">
                        {(() => {
                          const visibleLen = runResultData.visible_results?.length || 0;
                          const hiddenLen = runResultData.hidden_summary?.total || 0;
                          const allCount = visibleLen + hiddenLen;

                          return Array.from({ length: allCount }).map((_, i) => {
                            const isHidden = i >= visibleLen;
                            const tc = isHidden ? null : runResultData.visible_results[i];
                            const passed = isHidden
                              ? (i - visibleLen < runResultData.hidden_summary.passed)
                              : tc?.passed;

                            if (i >= evaluatedCount) {
                              return (
                                <div key={i} className="px-4 py-3 flex items-center gap-2 border-b border-slate-800/50 text-[11px] font-bold text-slate-500 bg-slate-900/20">
                                  <i className="fas fa-spinner fa-spin text-slate-500 w-4 text-center" /> Test case {i} {isHidden && <i className="fas fa-lock ml-1 text-slate-600" />}
                                </div>
                              );
                            }

                            return (
                              <button
                                key={i}
                                onClick={() => setSelectedTestCase(i)}
                                className={`w-full px-4 py-3 flex items-center gap-2 border-b border-slate-800/50 text-[11px] font-bold text-left transition-colors ${selectedTestCase === i ? 'bg-indigo-500/10 text-indigo-300' : 'hover:bg-slate-800/50 text-slate-300'}`}
                              >
                                <i className={`fas ${passed ? 'fa-check text-emerald-500' : 'fa-times text-rose-500'} text-[13px] w-4 text-center`} />
                                Test case {i} {isHidden && <i className="fas fa-lock ml-1 text-slate-500" />}
                              </button>
                            );
                          });
                        })()}
                      </div>
                      {/* RIGHT PANEL */}
                      <div className="w-2/3 h-full overflow-y-auto p-4 scrollbar-none">
                        {(() => {
                          if (selectedTestCase >= evaluatedCount) {
                            return <div className="text-slate-500 text-sm italic flex items-center gap-2"><i className="fas fa-spinner fa-spin" /> Evaluating...</div>;
                          }

                          const visibleLen = runResultData.visible_results?.length || 0;
                          const isHidden = selectedTestCase >= visibleLen;

                          if (isHidden) {
                            const passed = (selectedTestCase - visibleLen) < runResultData.hidden_summary?.passed;
                            return (
                              <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                                <i className="fas fa-lock text-4xl opacity-50" />
                                <h3 className="text-lg font-bold">Hidden Test Case</h3>
                                <p className="text-xs max-w-sm text-center opacity-80 leading-relaxed">Use print or log statements to debug why your hidden test cases are failing. Hidden test cases are used to evaluate if your code can handle different scenarios, including corner cases.</p>
                                <div className={`mt-2 px-3 py-1.5 rounded text-xs font-bold border ${passed ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                  Status: {passed ? 'Passed' : 'Failed'}
                                </div>
                              </div>
                            );
                          }

                          const tc = runResultData.visible_results?.[selectedTestCase];
                          if (!tc) return null;

                          return (
                            <div className="space-y-4 text-xs">
                              <div className="font-bold text-lg mb-2 flex items-center gap-2">
                                {tc.passed ? <span className="text-emerald-400">Accepted</span> : <span className="text-rose-400">Wrong Answer</span>}
                              </div>
                              <div>
                                <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Input</div>
                                <div className="bg-white/5 rounded p-2.5 font-mono text-emerald-300 break-all">{JSON.stringify(tc.input)}</div>
                              </div>
                              <div>
                                <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Expected Output</div>
                                <div className="bg-white/5 rounded p-2.5 font-mono text-amber-300 break-all">{JSON.stringify(tc.expected)}</div>
                              </div>
                              <div>
                                <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Your Output</div>
                                <div className="bg-white/5 rounded p-2.5 font-mono text-rose-300 break-all">{JSON.stringify(tc.output)}</div>
                              </div>
                              {runResultData.output && (
                                <div>
                                  <div className="text-slate-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Stdout</div>
                                  <div className="bg-white/5 rounded p-2.5 font-mono text-slate-300 whitespace-pre-wrap">{runResultData.output}</div>
                                </div>
                              )}
                              {runResultData.runtime_error && (
                                <div>
                                  <div className="text-rose-500 mb-1 font-semibold uppercase tracking-wider text-[10px]">Runtime Error</div>
                                  <div className="bg-rose-500/10 border border-rose-500/20 rounded p-2.5 font-mono text-rose-400 whitespace-pre-wrap">{runResultData.runtime_error}</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <pre className="text-slate-300 text-xs font-mono whitespace-pre-wrap p-3 overflow-y-auto h-full">
                    {runOutput || 'Ready...'}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Voice Orb ── */}
      <div
        className="fixed flex flex-col items-center pointer-events-none transition-transform"
        style={{
          zIndex: 40,
          left: orbPos.x !== null ? orbPos.x : '50%',
          top: orbPos.y !== null ? orbPos.y : 'auto',
          bottom: orbPos.y !== null ? 'auto' : 20,
          transform: orbPos.x !== null ? 'translate(-50%, -50%)' : 'translateX(-50%)'
        }}
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

        <div
          className="flex flex-col items-center gap-1.5 pointer-events-auto group cursor-move"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            let startX = e.clientX;
            let startY = e.clientY;
            let hasDragged = false;
            const rect = e.currentTarget.getBoundingClientRect();
            let currentX = orbPos.x !== null ? orbPos.x : rect.left + rect.width / 2;
            let currentY = orbPos.y !== null ? orbPos.y : rect.top + rect.height / 2;

            const onMouseMove = (moveEvent) => {
              hasDragged = true;
              const deltaX = moveEvent.clientX - startX;
              const deltaY = moveEvent.clientY - startY;
              startX = moveEvent.clientX;
              startY = moveEvent.clientY;
              currentX += deltaX;
              currentY += deltaY;
              setOrbPos({ x: currentX, y: currentY });
            };
            const onMouseUp = (upEvent) => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              if (hasDragged) {
                // Prevent click on children if dragged
                window.__zaraDragged = true;
                setTimeout(() => {
                  window.__zaraDragged = false;
                }, 100);
              }
            };
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          }}
          onClickCapture={(e) => {
            if (window.__zaraDragged) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          {/* Orb itself — tap to start/stop speaking */}
          <button
            onClick={() => {
              if (aiStatus === 'speaking') {
                // Do nothing while Zara is speaking
                return
              } else if (aiStatus === 'listening') {
                // STOP recording immediately — triggers onstop → STT
                stopListening()
              } else {
                // Start recording
                startListening(ans => {
                  if (ans) askAIForReply(ans)
                })
              }
            }}
            className="focus:outline-none hover:scale-105 transition-transform"
            title={
              aiStatus === 'speaking' ? 'Zara is speaking…' :
                aiStatus === 'listening' ? 'Tap to finish speaking' :
                  'Tap to speak to Zara'
            }
          >
            <VideoAvatarOrb status={aiStatus} />
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
            <span className="text-[10px] text-slate-600">Click to speak</span>
          )}
        </div>
      </div>

      {/* Submitting overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 z-50 bg-[#0a0f1e]/90 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 relative mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight mb-2">Saving Solution…</h2>
          <p className="text-slate-400 font-medium">Please wait while we upload the session recording securely.</p>
        </div>
      )}
    </div>
  )
}
