import React, { useState, useEffect, useRef } from 'react'
import aiVideoUrl from '../assets/ai_avatar.mp4'

function VideoAvatar({ status, size = 220 }) {
  const videoRef = useRef(null)
  const candidateGlowRef = useRef(null)
  const isSpeaking = status === 'speaking'

  useEffect(() => {
    if (status !== 'listening') return
    const handleRms = (e) => {
      if (!candidateGlowRef.current) return
      const rms = e.detail
      // scale from 1.0 to 1.2 based on volume
      const scale = 1 + Math.min(rms * 1.5, 0.2)
      // opacity from 0.4 to 1.0
      const opacity = 0.4 + Math.min(rms * 2, 0.6)
      candidateGlowRef.current.style.transform = `scale(${scale})`
      candidateGlowRef.current.style.opacity = opacity
    }
    window.addEventListener('candidate_audio_rms', handleRms)
    return () => window.removeEventListener('candidate_audio_rms', handleRms)
  }, [status])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    // Always play the flowing animation
    video.play().catch(() => { })
  }, [])

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
      {/* Dynamic Voice Visualizer Ring (Only when listening) */}
      {status === 'listening' && (
        <div ref={candidateGlowRef} style={{
          position: 'absolute', inset: -12,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, rgba(16,185,129,0) 70%)',
          border: '2px solid rgba(16,185,129,0.6)',
          boxShadow: '0 0 40px rgba(16,185,129,0.5)',
          pointerEvents: 'none',
          transition: 'transform 0.05s ease-out, opacity 0.05s ease-out',
          opacity: 0.4,
          transform: 'scale(1)',
          zIndex: 10
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
        autoPlay
        muted
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
  'Malayalam': 'ml-IN', 'Kannada': 'kn-IN', 'English': 'en-IN'
}

// Offline follow-ups removed; now utilizing the backend AI-generated follow-up pipeline.


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

export { VideoAvatar, Bubble }
