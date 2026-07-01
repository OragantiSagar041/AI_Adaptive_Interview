import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
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
        const res = await fetch(`${API_BASE_URL}/case-study/start`, {
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
      const response = await fetch(`${API_BASE_URL}/case-study/submit-answer`, {
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
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans">
      {/* Top Bar Navigation */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-slate-200 shadow-sm z-50 flex items-center justify-between px-6 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white text-[0.68rem] font-bold tracking-wider uppercase px-3 py-1">
            Round 2
          </span>
          <span className="text-sm font-bold text-slate-900">Audio Case Study</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 border border-slate-200 rounded-full px-4 py-1.5 bg-slate-50 text-xs font-bold">
            <span className={`w-2 h-2 rounded-full bg-emerald-500 ${isListening ? 'animate-ping' : ''}`} />
            <span
              className={`font-mono text-sm ${isTimerUrgent ? 'text-red-500 font-extrabold' : isTimerWarning ? 'text-amber-500 font-bold' : 'text-slate-800'
                }`}
            >
              {getTimerDisplay()}
            </span>
          </div>

          {isLastQuestion && (
            <button
              onClick={handleSubmitAll}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-sm border-none cursor-pointer flex items-center gap-1.5"
            >
              Submit &amp; Finish
            </button>
          )}
        </div>
      </header>

      {/* Progress Bar */}
      <div className="fixed top-16 left-0 right-0 h-1 bg-slate-200 z-50">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Main Workspace Layout */}
      <main className="max-w-[900px] mx-auto px-6 py-28 flex flex-col gap-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <span className="text-slate-500 font-bold text-xs">
            Question {currentIndex + 1} of {questions.length}
          </span>
          <span className="rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1">
            {currentQuestion?.skill_tested || 'Scenario'}
          </span>
        </div>

        {/* Scenario Block */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <span className="text-[0.68rem] font-bold text-blue-600 uppercase tracking-widest block">📖 Scenario</span>
          <div className="text-sm leading-relaxed text-slate-700 bg-slate-50 border-l-4 border-indigo-600 px-5 py-3.5 rounded-r-xl">
            {currentQuestion?.scenario || 'No details available.'}
          </div>
        </section>

        {/* Question Block */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-3">
          <span className="text-[0.68rem] font-bold text-red-600 uppercase tracking-widest block">❓ Question</span>
          <p className="text-base font-semibold leading-relaxed text-slate-900">
            {currentQuestion?.question || 'No question details loaded.'}
          </p>
        </section>

        {/* Answer Recording Workspace Block */}
        <section className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2 border-b border-slate-100 pb-3">
            <span className="text-[0.68rem] font-bold text-emerald-600 uppercase tracking-widest block">🎙 Your Answer</span>
            <div className="flex items-center gap-3">
              {isListening && (
                <div className="flex items-end gap-[3px] h-[20px] transition-opacity">
                  <span className="w-1 h-3 bg-red-500 rounded-full animate-bounce" />
                  <span className="w-1 h-4 bg-red-500 rounded-full animate-bounce delay-75" />
                  <span className="w-1 h-2.5 bg-red-500 rounded-full animate-bounce" />
                  <span className="w-1 h-5 bg-red-500 rounded-full animate-bounce delay-150" />
                </div>
              )}
              {isListening && (
                <span className="rounded-full bg-red-50 border border-red-200 text-red-500 font-extrabold text-[0.65rem] tracking-wider px-2.5 py-0.5 animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" /> RECORDING
                </span>
              )}
              <span className="text-xs text-slate-500 font-medium">
                {getWordCount(transcriptionText)} words
              </span>
            </div>
          </div>

          {/* Mic Trigger */}
          <button
            onClick={toggleMic}
            className={`w-full py-4 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 font-bold text-sm cursor-pointer transition-all ${isListening
                ? 'border-red-500 bg-red-50 text-red-500 shadow-md ring-4 ring-red-100'
                : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-indigo-500 text-slate-600 hover:text-indigo-600'
              }`}
          >
            <span className={`text-base ${isListening ? 'animate-bounce' : ''}`}>
              {isListening ? '⏹' : '🎤'}
            </span>
            <span>{isListening ? 'Recording... Tap to stop' : 'Tap to start recording your answer'}</span>
          </button>

          {/* Textarea Workspace */}
          <textarea
            value={transcriptionText}
            onChange={(e) => setTranscriptionText(e.target.value)}
            placeholder="Your spoken answer will appear here... (You can also type your answer)"
            className="w-full min-h-[180px] rounded-xl border border-slate-200 p-4 text-sm leading-relaxed text-slate-900 placeholder:text-slate-300 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 shadow-inner resize-y transition-all"
          />

          <div className="text-[0.72rem] text-slate-500 flex items-center gap-1.5">
            <span>💡</span> Speak your full answer, then tap the microphone again to stop.
          </div>
        </section>

        {/* Evaluation Criteria Block */}
        {currentQuestion?.evaluation_criteria && currentQuestion.evaluation_criteria.length > 0 && (
          <section className="bg-yellow-50/50 border border-yellow-200 rounded-2xl p-5">
            <span className="text-[0.68rem] font-bold text-amber-800 uppercase tracking-widest block mb-2">
              🎯 What we're looking for
            </span>
            <ul className="list-disc pl-5 text-amber-900 text-xs leading-relaxed space-y-1 font-medium">
              {currentQuestion.evaluation_criteria.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>
        )}
      </main>

      {/* Footer Navigation Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 py-4 shadow-lg z-50 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => handleIndexChange(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="px-4 py-2.5 rounded-lg font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors flex items-center"
          >
            ← Prev
          </button>
          <button
            onClick={() => handleSaveAnswer(false)}
            className="px-4 py-2.5 rounded-lg font-bold text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 cursor-pointer text-xs transition-colors flex items-center gap-1"
          >
            💾 Save Answer
          </button>
        </div>

        <div className="flex gap-2">
          {!isLastQuestion ? (
            <button
              onClick={() => handleIndexChange(currentIndex + 1)}
              className="px-5 py-2.5 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-500 border-none cursor-pointer text-xs transition-all shadow-sm flex items-center"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmitAll}
              className="px-6 py-2.5 rounded-lg font-bold text-white bg-emerald-600 hover:bg-emerald-500 border-none cursor-pointer text-xs transition-all shadow-sm flex items-center gap-1"
            >
              ✅ Submit All
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
