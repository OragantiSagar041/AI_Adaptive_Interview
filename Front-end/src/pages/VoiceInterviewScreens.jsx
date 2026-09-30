import React, { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { API_BASE_URL } from '../apiConfig'
import { candidateFetch } from '../utils/candidateAuth'
import DeviceCheckModal from '../components/DeviceCheckModal'
import { VideoAvatar } from './VoiceAvatar'

export function WaitingScreen({
  securityAlert,
  countdown,
  fmt,
  warningsCount,
  candidateVideoElement,
  proctoring
}) {
  return (
    <div className="h-screen w-screen overflow-hidden bg-[#07091a] flex flex-col text-white" style={{ fontFamily: "'Inter',sans-serif" }}>
      {/* Security Alert Pill */}
      {securityAlert && createPortal(
        <div role="alert" style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 500,
          whiteSpace: 'nowrap', pointerEvents: 'none',
          background: 'rgba(22,10,10,0.88)', backdropFilter: 'blur(14px)',
          border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5',
          boxShadow: '0 4px 24px rgba(0,0,0,0.25)',
          animation: 'alertSlideDown 0.25s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}>
          <span style={{ display:'flex', alignItems:'center', justifyContent:'center', width:22, height:22, borderRadius:'50%', background:'rgba(239,68,68,0.2)', color:'#ef4444', flexShrink:0 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </span>
          <span style={{ fontWeight:700, fontSize:12, textTransform:'uppercase', letterSpacing:'0.05em', opacity:0.75, marginRight:2 }}>Security</span>
          {securityAlert}
        </div>,
        document.body
      )}

      {/* Header with live timer */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/6 bg-[#0a0f1e]/90 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center">
            <i className="fas fa-brain text-sm text-white" />
          </div>
          <span className="font-black tracking-tight">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium">Voice AI</span></span>
          <span className="ml-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-0.5 uppercase tracking-widest">
            <i className="fas fa-hourglass-half mr-1" />Waiting
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-sm font-mono font-bold px-4 py-1.5 rounded-full border ${countdown < 300 ? 'border-rose-500/50 text-rose-400 bg-rose-500/10' : 'border-indigo-500/30 text-indigo-300 bg-indigo-500/10'}`}>
            <i className="fas fa-clock mr-2" />{fmt(countdown)}
          </div>
          {warningsCount > 0 && (
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-bold" title={`${warningsCount} proctoring alert${warningsCount > 1 ? 's' : ''} detected`}>
              <i className="fas fa-exclamation-triangle text-[10px]" />{warningsCount}
            </div>
          )}
        </div>
      </header>

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">
        <style>{`
          @keyframes waiting-pulse { 0%,100%{transform:scale(1);opacity:.7} 50%{transform:scale(1.06);opacity:1} }
          @keyframes waiting-ring  { 0%{transform:scale(.95);opacity:.3} 100%{transform:scale(1.18);opacity:0} }
        `}</style>

        {/* Animated hourglass icon */}
        <div className="relative flex items-center justify-center">
          <div className="absolute w-28 h-28 rounded-full border-2 border-amber-500/30"
            style={{ animation: 'waiting-ring 2s ease-out infinite' }} />
          <div className="absolute w-36 h-36 rounded-full border border-amber-500/15"
            style={{ animation: 'waiting-ring 2s ease-out infinite', animationDelay: '0.5s' }} />
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,.5)]"
            style={{ animation: 'waiting-pulse 2.5s ease-in-out infinite' }}>
            <i className="fas fa-hourglass-half text-3xl text-white" />
          </div>
        </div>

        {/* Message */}
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-black text-white mb-3">You've answered all questions!</h2>
          <p className="text-slate-400 leading-relaxed">
            Waiting for the interview timer to finish. Please stay on this page — your camera, microphone, and proctoring remain active.
          </p>
        </div>

        {/* Live countdown pill */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Time remaining</span>
          <div className={`text-4xl font-black font-mono px-8 py-4 rounded-2xl border-2 ${countdown < 60
            ? 'text-rose-400 border-rose-500/40 bg-rose-500/10 shadow-[0_0_30px_rgba(239,68,68,.2)]'
            : countdown < 300
              ? 'text-amber-400 border-amber-500/40 bg-amber-500/10 shadow-[0_0_30px_rgba(245,158,11,.2)]'
              : 'text-indigo-300 border-indigo-500/30 bg-indigo-500/10'
            }`}>
            {fmt(countdown)}
          </div>
        </div>

        {/* Info note */}
        <div className="flex items-center gap-2 text-xs text-slate-500 !bg-white/4 border border-white/8 rounded-xl px-5 py-3 max-w-sm text-center">
          <i className="fas fa-info-circle text-slate-400" />
          <span>The interview will submit automatically when the timer reaches zero.</span>
        </div>

        {/* Disabled submit button */}
        <button
          disabled
          onClick={(e) => { e.preventDefault(); return; }}
          className="px-8 py-3 rounded-2xl bg-slate-800 text-slate-600 border border-white/6 text-sm font-bold cursor-not-allowed flex items-center gap-2"
          title="Submission is locked until the timer reaches zero"
        >
          <i className="fas fa-lock" />
          Submit Locked — Timer Running
        </button>
      </div>

      {/* Hidden video for AI Proctoring — must stay visible for MediaPipe frame decoding */}
      {candidateVideoElement}

      {/* Proctoring model failure alert */}
      {proctoring?.modelsFailed && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-rose-500/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3">
          <i className="fas fa-exclamation-triangle" />
          <span className="text-sm font-bold">⚠️ Proctoring AI models failed to load. Monitoring is temporarily disabled.</span>
        </div>
      )}
    </div>
  )
}

export function PreChecksScreen({
  permissionsGranted,
  setPermissionsGranted,
  showDeviceCheck,
  setShowDeviceCheck,
  cameraStreamRef,
  setRound
}) {
  return (
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
        <div className="grid gap-3 text-left !bg-[#0d1117] border border-white/10 rounded-2xl p-6 shadow-xl">
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
              ? '!bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
              : '!bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20'
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
}

export function VoiceCloneSetupScreen({
  linkId,
  cameraStreamRef,
  setRound,
  setVoiceCloneId,
  voiceCloneIdRef
}) {
  const [vcStep, setVcStep] = useState('idle')
  const [vcError, setVcError] = useState('')
  const vcMediaRecorderRef = useRef(null)
  const vcChunksRef = useRef([])

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
          const resp = await candidateFetch(`${API_BASE_URL}/voice-clone-instant`, { method: 'POST', body: fd })
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
        <div className="!bg-[#0d1117] border border-violet-500/30 rounded-2xl p-6 shadow-xl">
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
          <div className="!bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-emerald-300">
            <i className="fas fa-check-circle text-3xl mb-2 block" />
            <p className="font-bold">Voice Cloned Successfully!</p>
            <p className="text-sm text-emerald-400/80 mt-1">The AI interviewer will now speak in your voice.</p>
          </div>
        )}

        {(vcStep === 'error') && (
          <div className="!bg-rose-500/10 border border-rose-500/30 rounded-2xl p-5 text-rose-300">
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
            <button onClick={() => setRound('intro')} className="w-full py-3 rounded-xl !bg-white/5 border border-white/10 text-slate-400 hover:text-white text-sm font-medium transition-all">
              Skip voice cloning — use default AI voice
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function IntroScreen({
  sessionDetail,
  interviewType,
  questions,
  startInterview
}) {
  return (
    <div className="min-h-screen h-screen bg-[#0a0f1e] flex flex-col items-center justify-between text-white px-6 py-6 sm:py-8 overflow-y-auto" style={{ fontFamily: "'Inter',sans-serif" }}>
      <style>{`
        @keyframes pulse-ring{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.12);opacity:1}}
        @keyframes wave{0%{height:4px}100%{height:28px}}
      `}</style>
      <div className="max-w-xl w-full my-auto text-center space-y-4 sm:space-y-5">
        <div className="flex items-center justify-center gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <i className="fas fa-brain text-base text-white" />
          </div>
          <span className="text-xl font-black">HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium text-lg">Voice AI</span></span>
        </div>

        {/* Avatar */}
        <div className="relative flex items-center justify-center h-44 sm:h-48 my-1">
          <style>{`
            @keyframes vidRingSpeak { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.08);opacity:1} }
            @keyframes vidRingListen { 0%{transform:scale(1);opacity:.5} 100%{transform:scale(1.04);opacity:1} }
          `}</style>
          <VideoAvatar status="idle" size={170} />
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-black mb-2">Meet Zara, Your AI Interviewer</h1>
          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-lg mx-auto">
            Hi, <span className="text-white font-semibold">{sessionDetail?.candidate_name}</span>! I'm Zara. We'll have a natural voice conversation across {
              interviewType === 'Technical' ? '2 rounds — Verbal Q&A + Coding' :
                interviewType === 'Non-Technical' ? '2 rounds — Verbal Q&A + Case Study' :
                  '1 round of Verbal Q&A'
            }. I'll ask follow-up questions to dig deeper into your answers.
          </p>
        </div>

        {/* Round badges */}
        <div className="flex flex-wrap gap-2 justify-center">
          <div className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-xs font-semibold text-indigo-300">
            <i className="fas fa-comments text-indigo-400" /> Verbal Q&A ({questions.length} questions)
          </div>
          {interviewType === 'Technical' && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-xs font-semibold text-amber-300">
              <i className="fas fa-code text-amber-400" /> Live Coding
            </div>
          )}
          {interviewType === 'Non-Technical' && (
            <div className="flex items-center gap-2 px-3.5 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-xs font-semibold text-violet-300">
              <i className="fas fa-briefcase text-violet-400" /> Case Study
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="grid gap-2 text-xs text-left max-w-lg mx-auto">
          {[
            { i: 'fa-volume-up', c: 'text-indigo-400', t: 'I speak each question aloud — listen before answering' },
            { i: 'fa-microphone', c: 'text-emerald-400', t: 'Just talk naturally — your mic captures everything' },
            { i: 'fa-comment-dots', c: 'text-violet-400', t: "I'll ask follow-up questions based on your answers" },
            { i: 'fa-arrow-right', c: 'text-amber-400', t: 'After 3 seconds of silence, the interview auto-advances' },
          ].map((tip, idx) => (
            <div key={idx} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'rgba(255, 255, 255, 0.08)', borderWidth: 1 }}>
              <i className={`fas ${tip.i} ${tip.c} w-4 text-center text-sm`} />
              <span className="text-slate-300 font-medium">{tip.t}</span>
            </div>
          ))}
        </div>

        <button onClick={startInterview}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-base shadow-[0_4px_30px_rgba(99,102,241,0.5)] hover:shadow-[0_4px_50px_rgba(99,102,241,0.8)] hover:scale-[1.01] transition-all flex items-center justify-center gap-2.5 cursor-pointer mt-2">
          <i className="fas fa-microphone-alt" /> Begin Interview with Zara
        </button>
      </div>
    </div>
  )
}
