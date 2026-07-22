import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { candidateFetch } from '../utils/candidateAuth'
import { Volume2, ArrowRight, ShieldAlert, Cpu, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

export default function CaseStudyPage() {
  const [searchParams] = useSearchParams()
  const interviewId = searchParams.get('interview_id') || searchParams.get('session_id') || searchParams.get('session')
  const durationParam = parseInt(searchParams.get('duration') || '15', 10)

  // Screen states
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  // Question & Session details
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)

  // Mic & Speech Recognition state
  const [isListening, setIsListening] = useState(false)
  const [transcriptionText, setTranscriptionText] = useState('')

  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(durationParam * 60)

  // References
  const recognitionRef = useRef(null)
  const timerIntervalRef = useRef(null)

  // Word count calculations
  const getWordCount = (text = '') => {
    const trimmed = text.trim()
    return trimmed ? trimmed.split(/\s+/).length : 0
  }

  // Load case study data
  useEffect(() => {
    if (!interviewId) {
      setError('Missing Interview ID in URL parameters. Please check your invitation link.')
      setLoading(false)
      return
    }

    async function loadCaseStudy() {
      try {
        const res = await candidateFetch(`${API_BASE_URL}/case-study/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interview_id: interviewId })
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.detail || data.message || 'Failed to load case study round')
        }

        const fetchedQuestions = data.case_study_round?.questions || []
        setQuestions(fetchedQuestions)

        const initialAnswers = data.case_study_round?.answers || new Array(fetchedQuestions.length).fill(null)
        setAnswers(initialAnswers)

        const savedIndex = data.case_study_round?.current_question || 0
        setCurrentIndex(savedIndex < fetchedQuestions.length ? savedIndex : 0)

        // Initialize saved answer text for the active index
        const currentSaved = initialAnswers[savedIndex < fetchedQuestions.length ? savedIndex : 0]
        setTranscriptionText(currentSaved ? currentSaved.answer_text || '' : '')

        // Initialize Speech Recognition
        initSpeechRecognition()

        setLoading(false)
        startTimer()
      } catch (err) {
        setError(err.message || 'Unable to access the Case Study session.')
        setLoading(false)
      }
    }

    loadCaseStudy()

    return () => {
      stopTimer()
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch (e) { }
      }
    }
  }, [interviewId])

  // Sync active question details when index changes
  const handleIndexChange = (idx) => {
    if (idx < 0 || idx >= questions.length) return

    // Silent save current answer first
    handleSaveAnswer(true)

    // Stop recording if running
    if (isListening) {
      stopMic()
    }

    setCurrentIndex(idx)

    // Set transcription to saved answer for new index
    const saved = answers[idx]
    setTranscriptionText(saved ? saved.answer_text || '' : '')
  }

  // Timer logic
  function startTimer() {
    stopTimer()
    timerIntervalRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          stopTimer()
          Swal.fire({
            title: 'Time is up!',
            text: 'Case Study time window has closed. Auto-submitting answers.',
            icon: 'warning',
            background: '#161c2d',
            color: '#fff',
          }).then(() => {
            handleSubmitAll()
          })
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  function stopTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  // Speech Recognition initialization
  function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      console.warn('Speech recognition not supported in this browser.')
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SpeechRecognition()
    rec.continuous = true
    rec.interimResults = true

    // Retrieve active language setting from global context if accessible
    const parentLang = (window.parent && window.parent.sessionLanguage) || 'English'
    const langMap = {
      'Hindi': 'hi-IN',
      'Telugu': 'te-IN',
      'Tamil': 'ta-IN',
      'Malayalam': 'ml-IN',
      'Kannada': 'kn-IN',
      'English': 'en-IN'
    }
    rec.lang = langMap[parentLang] || 'en-IN'

    rec.onstart = () => {
      setIsListening(true)
    }

    rec.onend = () => {
      setIsListening(false)
    }

    rec.onresult = (event) => {
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript + ' '
        }
      }
      if (finalChunk) {
        setTranscriptionText(prev => (prev + (prev.endsWith(' ') || !prev ? '' : ' ') + finalChunk).trim() + ' ')
      }
    }

    rec.onerror = (e) => {
      console.error('Speech error:', e.error)
      if (e.error !== 'no-speech') {
        stopMic()
      }
    }

    recognitionRef.current = rec
  }

  function startMic() {
    if (!recognitionRef.current) {
      Swal.fire({
        title: 'Not Supported',
        text: 'Speech recognition is not supported in this browser.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
      return
    }
    try {
      recognitionRef.current.start()
    } catch (err) {
      console.error('Mic start error:', err)
    }
  }

  function stopMic() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (err) {
        console.error('Mic stop error:', err)
      }
    }
    setIsListening(false)
  }

  function toggleMic() {
    if (isListening) {
      stopMic()
    } else {
      startMic()
    }
  }

  // Save current question response
  const handleSaveAnswer = async (silent = false) => {
    const text = transcriptionText.trim()
    if (!text) {
      if (!silent) {
        Swal.fire({
          title: 'Empty Response',
          text: 'Please write or record your answer before saving.',
          icon: 'warning',
          background: '#161c2d',
          color: '#fff',
        })
      }
      return
    }

    // Update locally
    const updated = [...answers]
    updated[currentIndex] = { answer_text: text }
    setAnswers(updated)

    try {
      const response = await candidateFetch(`${API_BASE_URL}/case-study/submit-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interview_id: interviewId,
          question_index: currentIndex,
          answer_text: text
        })
      })
      if (response.ok) {
        if (!silent) {
          Swal.fire({
            title: 'Saved',
            text: 'Your response has been saved successfully.',
            icon: 'success',
            background: '#161c2d',
            color: '#fff',
            timer: 1500,
            showConfirmButton: false,
          })
        }
      } else {
        throw new Error('Save response rejected')
      }
    } catch (e) {
      if (!silent) {
        Swal.fire({
          title: 'Save Failed',
          text: 'Could not connect to the proctoring server. Please verify your connection.',
          icon: 'error',
          background: '#161c2d',
          color: '#fff',
        })
      }
    }
  }

  // Finalize Submission
  const handleSubmitAll = async () => {
    if (isListening) stopMic()

    // Save active question answer
    await handleSaveAnswer(true)

    // Check unanswered questions
    const unansweredCount = answers.filter(a => !a || !a.answer_text?.trim()).length
    if (unansweredCount > 0) {
      const confirmResult = await Swal.fire({
        title: 'Unanswered Questions',
        text: `You have ${unansweredCount} unanswered questions remaining. Are you sure you want to submit?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Submit anyway',
        cancelButtonText: 'Review answers',
        background: '#161c2d',
        color: '#fff',
      })
      if (!confirmResult.isConfirmed) return
    }

    stopTimer()
    setDone(true)

    // Send message to parent window / session proctor window
    if (window.parent && window.parent.caseStudyRoundComplete) {
      window.parent.caseStudyRoundComplete()
    } else if (window.opener && window.opener.caseStudyRoundComplete) {
      window.opener.caseStudyRoundComplete()
    }
  }

  // Format timer display
  const getTimerDisplay = () => {
    const min = Math.floor(secondsLeft / 60).toString().padStart(2, '0')
    const sec = (secondsLeft % 60).toString().padStart(2, '0')
    return `${min}:${sec}`
  }

  const isTimerUrgent = secondsLeft <= 60
  const isTimerWarning = secondsLeft <= 120 && secondsLeft > 60

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-screen gap-4 bg-slate-50 text-slate-600">
        <RefreshCw className="animate-spin text-indigo-600" size={40} />
        <span className="font-semibold text-sm">Loading Case Study Round...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center h-screen p-6 text-center bg-slate-50">
        <AlertTriangle className="text-red-500 mb-4 animate-bounce" size={54} />
        <h2 className="text-2xl font-bold text-slate-800">Access Restricted</h2>
        <p className="text-slate-600 mt-2 max-w-md text-sm">{error}</p>
        <Link to="/" className="mt-6 px-6 py-2.5 rounded-full font-bold text-sm bg-indigo-600 hover:bg-indigo-700 text-white shadow-md no-underline">
          Return to Platform
        </Link>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 text-center text-white">
        <CheckCircle2 size={80} className="text-emerald-400 mb-6 animate-pulse" />
        <h1 className="text-3xl font-extrabold tracking-tight">Round 2 Complete!</h1>
        <p className="text-indigo-200 mt-3 max-w-md text-base leading-relaxed">
          Your case study response transcript has been submitted. You can now close this tab and return to the main interview window.
        </p>
        <button
          onClick={() => window.close()}
          className="mt-8 px-10 py-3.5 rounded-full bg-indigo-600 hover:bg-indigo-500 font-bold text-sm shadow-[0_4px_14px_rgba(99,102,241,0.25)] border-none outline-none cursor-pointer"
        >
          Close Tab
        </button>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const isLastQuestion = currentIndex === questions.length - 1

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-50 via-white to-indigo-50/40 text-slate-900 font-sans relative overflow-hidden pb-32">
      
      {/* Decorative Background Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-400/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] rounded-full bg-sky-400/10 blur-[120px] pointer-events-none" />

      {/* Top Header / Progress Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 px-4 py-4 sm:px-8">
        <div className="max-w-[1000px] mx-auto bg-white/70 backdrop-blur-xl border border-white shadow-[0_4px_24px_-8px_rgba(0,0,0,0.1)] rounded-2xl flex items-center justify-between p-3 px-5 transition-all">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 shadow-lg shadow-indigo-200 text-white text-[0.75rem] font-bold tracking-widest uppercase px-4 py-1.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Round 2
            </div>
            <span className="text-[0.95rem] font-extrabold text-slate-800 tracking-tight hidden sm:block">Audio Case Study</span>
          </div>

          <div className="flex items-center gap-4 flex-1 justify-center max-w-[200px] mx-4 hidden md:flex">
             <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
               <div 
                 className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-500 ease-out relative"
                 style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
               >
                 <div className="absolute top-0 right-0 bottom-0 left-0 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)] animate-[shimmer_2s_infinite]" />
               </div>
             </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2.5 border rounded-xl px-4 py-1.5 font-bold shadow-sm backdrop-blur-md transition-colors ${isTimerUrgent ? 'bg-red-50/90 border-red-200 text-red-600' : isTimerWarning ? 'bg-amber-50/90 border-amber-200 text-amber-600' : 'bg-white/60 border-slate-200/60 text-slate-700'}`}>
              <span className={`w-2 h-2 rounded-full ${isTimerUrgent ? 'bg-red-500 animate-ping' : isTimerWarning ? 'bg-amber-500' : 'bg-emerald-500'} shadow-sm`} />
              <span className="font-mono text-sm tracking-wide">
                {getTimerDisplay()}
              </span>
            </div>

            {isLastQuestion && (
              <button
                onClick={handleSubmitAll}
                className="hidden sm:flex px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-all hover:-translate-y-0.5 cursor-pointer items-center gap-2"
              >
                Submit &amp; Finish
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="max-w-[850px] mx-auto px-4 sm:px-6 pt-32 flex flex-col gap-8 relative z-10">
        
        {/* Breadcrumb / Status Line */}
        <div className="flex justify-between items-center flex-wrap gap-2 px-2">
          <div className="flex flex-col">
            <span className="text-slate-400 font-bold text-xs uppercase tracking-widest mb-1">
              Progress
            </span>
            <span className="text-slate-800 font-extrabold text-lg tracking-tight">
              Question {currentIndex + 1} <span className="text-slate-400 font-medium text-sm">of {questions.length}</span>
            </span>
          </div>
          <span className="rounded-full bg-white border border-slate-200/60 shadow-sm text-indigo-600 text-xs font-bold px-4 py-1.5 flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5" />
            {currentQuestion?.skill_tested || 'Scenario Assessment'}
          </span>
        </div>

        {/* Scenario Block */}
        <section className="bg-white/60 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-[24px] p-6 sm:p-8 flex flex-col gap-4 relative group hover:shadow-[0_8px_40px_rgb(0,0,0,0.08)] transition-all">
          <div className="absolute top-0 left-8 w-16 h-1 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-b-full opacity-70" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <span className="text-sm">📖</span>
            </div>
            <span className="text-[0.75rem] font-bold text-blue-700 uppercase tracking-widest">Scenario Context</span>
          </div>
          <div className="text-[0.95rem] leading-relaxed text-slate-700 font-medium">
            {currentQuestion?.scenario || 'No details available.'}
          </div>
        </section>

        {/* Question Block */}
        <section className="bg-white/70 backdrop-blur-2xl border border-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-[24px] p-6 sm:p-8 flex flex-col gap-4 relative">
          <div className="absolute top-0 left-8 w-16 h-1 bg-gradient-to-r from-rose-400 to-red-500 rounded-b-full opacity-70" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
              <span className="text-sm">❓</span>
            </div>
            <span className="text-[0.75rem] font-bold text-rose-600 uppercase tracking-widest">Question</span>
          </div>
          <p className="text-lg font-bold leading-relaxed text-slate-900 tracking-tight">
            {currentQuestion?.question || 'No question details loaded.'}
          </p>
        </section>

        {/* Answer Recording Workspace Block */}
        <section className="bg-white/80 backdrop-blur-3xl border border-white shadow-[0_8px_40px_rgb(0,0,0,0.08)] rounded-[32px] p-6 sm:p-8 space-y-6 relative overflow-hidden">
          {/* Subtle glow behind mic */}
          {isListening && <div className="absolute top-8 right-8 w-32 h-32 bg-red-400/20 rounded-full blur-[40px] pointer-events-none animate-pulse" />}

          <div className="flex justify-between items-center flex-wrap gap-4 border-b border-slate-100/60 pb-4 relative z-10">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                 <Volume2 className="w-4 h-4" />
               </div>
               <span className="text-[0.75rem] font-bold text-emerald-600 uppercase tracking-widest">Your Response</span>
            </div>
            
            <div className="flex items-center gap-4 bg-white border border-slate-100 shadow-sm rounded-full px-4 py-1.5">
              {isListening && (
                <div className="flex items-center gap-2">
                  <div className="flex items-end gap-[3px] h-[14px]">
                    <span className="w-1 h-2 bg-red-500 rounded-full animate-bounce" />
                    <span className="w-1 h-3 bg-red-500 rounded-full animate-bounce delay-75" />
                    <span className="w-1 h-2 bg-red-500 rounded-full animate-bounce delay-150" />
                    <span className="w-1 h-3.5 bg-red-500 rounded-full animate-bounce delay-[225ms]" />
                  </div>
                  <span className="text-red-500 font-bold text-[0.65rem] tracking-widest uppercase animate-pulse">
                    Recording
                  </span>
                </div>
              )}
              {!isListening && (
                 <span className="text-[0.65rem] font-bold text-slate-400 tracking-widest uppercase">
                    Mic Ready
                 </span>
              )}
              <div className="w-px h-4 bg-slate-200" />
              <span className="text-xs text-slate-500 font-bold tracking-wide">
                <span className="text-slate-900">{getWordCount(transcriptionText)}</span> words
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-6 items-start relative z-10">
             {/* Mic Trigger */}
            <button
              onClick={toggleMic}
              className={`relative shrink-0 w-full sm:w-[120px] h-[120px] rounded-[28px] flex flex-col items-center justify-center gap-2 font-bold cursor-pointer transition-all duration-300 ${isListening
                  ? 'bg-red-500 text-white shadow-[0_10px_30px_rgba(239,68,68,0.4)] scale-95 ring-4 ring-red-100'
                  : 'bg-white border border-slate-200 hover:border-indigo-300 text-slate-600 hover:text-indigo-600 shadow-sm hover:shadow-md hover:bg-slate-50 hover:-translate-y-1'
                }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-sm ${!isListening && 'bg-slate-100'} transition-all`}>
                 {isListening ? (
                   <div className="w-4 h-4 bg-white rounded-[4px] animate-pulse" />
                 ) : (
                   <Volume2 className="w-6 h-6" />
                 )}
              </div>
              <span className="text-[0.65rem] uppercase tracking-widest opacity-90">
                {isListening ? 'Stop' : 'Speak'}
              </span>
            </button>

            {/* Textarea Workspace */}
            <div className="w-full relative group flex-1 h-[120px]">
              <textarea
                value={transcriptionText}
                onChange={(e) => setTranscriptionText(e.target.value)}
                placeholder="Tap 'Speak' to start recording, or click here to type your answer..."
                className="w-full h-full rounded-[24px] bg-slate-50/50 border border-slate-200 p-5 pr-12 text-[0.95rem] leading-relaxed text-slate-800 font-medium placeholder:text-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-50 shadow-inner resize-none transition-all custom-scrollbar"
              />
              <div className="absolute bottom-4 right-4 text-[1.2rem] opacity-30 group-focus-within:opacity-100 transition-opacity">
                ✍️
              </div>
            </div>
          </div>
        </section>

        {/* Evaluation Criteria Block */}
        {currentQuestion?.evaluation_criteria && currentQuestion.evaluation_criteria.length > 0 && (
          <section className="bg-amber-50/60 backdrop-blur-md border border-amber-200/60 rounded-2xl p-5 sm:p-6 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span className="text-[0.7rem] font-bold text-amber-800 uppercase tracking-widest">
                Evaluation Criteria
              </span>
            </div>
            <ul className="list-none space-y-2.5">
              {currentQuestion.evaluation_criteria.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 text-amber-900/80 text-sm font-medium">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                  <span className="leading-relaxed">{c}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Footer Navigation Dock */}
      <footer className="fixed bottom-6 left-0 right-0 z-50 px-4 pointer-events-none flex justify-center">
        <div className="bg-slate-900/90 backdrop-blur-2xl border border-white/10 shadow-[0_20px_40px_rgba(0,0,0,0.3)] rounded-full p-2 flex items-center justify-between gap-4 pointer-events-auto max-w-[500px] w-full">
          <button
            onClick={() => handleIndexChange(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-white/5 hover:bg-white/15 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
            title="Previous Question"
          >
            ←
          </button>
          
          <button
            onClick={() => handleSaveAnswer(false)}
            className="flex-1 h-12 rounded-full font-bold text-white bg-white/10 border border-white/5 hover:bg-white/20 hover:border-white/10 cursor-pointer text-sm tracking-wide transition-all flex items-center justify-center gap-2"
          >
            💾 Save Current Progress
          </button>

          {!isLastQuestion ? (
            <button
              onClick={() => handleIndexChange(currentIndex + 1)}
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-indigo-500 hover:bg-indigo-400 cursor-pointer transition-all shadow-[0_0_15px_rgba(99,102,241,0.5)]"
              title="Next Question"
            >
              →
            </button>
          ) : (
            <button
              onClick={handleSubmitAll}
              className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-white bg-emerald-500 hover:bg-emerald-400 cursor-pointer transition-all shadow-[0_0_15px_rgba(16,185,129,0.5)]"
              title="Submit All"
            >
              <CheckCircle2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
