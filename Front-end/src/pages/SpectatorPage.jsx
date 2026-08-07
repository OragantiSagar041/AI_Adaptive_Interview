import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { getIceServers } from '../utils/webrtcConfig'
import { Video, MicOff, MonitorOff, Code, MessageSquare, Briefcase, RefreshCw, Eye } from 'lucide-react'

// Maps violation_type values to a human-readable label
const VIOLATION_META = {
  tab_switch:          { label: 'Tab Switch',          color: 'text-rose-600',   bg: 'bg-rose-50' },
  screenshot_shortcut: { label: 'Screenshot Attempt',  color: 'text-orange-600', bg: 'bg-orange-50' },
  clipboard_attempt:   { label: 'Copy / Paste',        color: 'text-amber-600',  bg: 'bg-amber-50' },
  print_attempt:       { label: 'Print Attempt',       color: 'text-amber-600',  bg: 'bg-amber-50' },
  save_attempt:        { label: 'Save Page',           color: 'text-amber-600',  bg: 'bg-amber-50' },
  devtools_open:       { label: 'DevTools Opened',     color: 'text-rose-600',   bg: 'bg-rose-50' },
  devtools_attempt:    { label: 'DevTools Attempt',    color: 'text-rose-600',   bg: 'bg-rose-50' },
  window_blur:         { label: 'App Switch',          color: 'text-orange-600', bg: 'bg-orange-50' },
  multi_monitor:       { label: 'Multi-Monitor',       color: 'text-amber-600',  bg: 'bg-amber-50' },
  no_face:             { label: 'No Face Detected',    color: 'text-rose-600',   bg: 'bg-rose-50' },
  multi_person:        { label: 'Multiple Faces',      color: 'text-rose-600',   bg: 'bg-rose-50' },
  phone:               { label: 'Phone Detected',      color: 'text-rose-600',   bg: 'bg-rose-50' },
  eye_contact:         { label: 'Eye Contact Lost',    color: 'text-orange-600', bg: 'bg-orange-50' },
  lip_sync:            { label: 'Lip-Sync Mismatch',   color: 'text-amber-600',  bg: 'bg-amber-50' },
  noise_alert:         { label: 'Background Noise',    color: 'text-amber-600',  bg: 'bg-amber-50' },
}

function formatTs(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

const ICE_SERVERS = getIceServers()

export default function SpectatorPage() {
  const { linkId } = useParams()
  const [token, setToken] = useState(() => {
    if (typeof window === 'undefined') return null
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const queryParams = new URLSearchParams(window.location.search)
    return hashParams.get('token') || queryParams.get('token')
  })

  const [status, setStatus] = useState('connecting')
  const [telemetry, setTelemetry] = useState(null)
  const [violations, setViolations] = useState([])
  const [retryCount, setRetryCount] = useState(0)

  const videoRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const streamTimeoutRef = useRef(null)
  const mountedRef = useRef(false)
  const spectatorIdRef = useRef(null)
  const iceCandidateQueueRef = useRef([])
  const statusRef = useRef(status)
  const violationsRef = useRef([])

  useEffect(() => {
    if (typeof window === 'undefined' || !token) return
    const hashParams = new URLSearchParams(window.location.hash.slice(1))
    const queryParams = new URLSearchParams(window.location.search)
    let cleaned = false

    if (hashParams.has('token')) {
      hashParams.delete('token')
      cleaned = true
    }
    if (queryParams.has('token')) {
      queryParams.delete('token')
      cleaned = true
    }

    if (cleaned) {
      const cleanedHash = hashParams.toString()
      const cleanedSearch = queryParams.toString()
      const newUrl = `${window.location.pathname}${cleanedSearch ? `?${cleanedSearch}` : ''}${cleanedHash ? `#${cleanedHash}` : ''}`
      window.history.replaceState(null, '', newUrl)
    }
  }, [token])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  // ── WebRTC / Signaling ──────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearTimeout(streamTimeoutRef.current)
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    spectatorIdRef.current = null
  }, [])

  const sendOffer = useCallback(async (ws) => {
    clearTimeout(streamTimeoutRef.current)
    if (!spectatorIdRef.current) {
      console.warn('[SpectatorWebRTC] No spectator_id yet, waiting for identity before sending offer')
      return
    }
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      iceCandidateQueueRef.current = []

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'webrtc_ice_candidate', 
            candidate: e.candidate,
          }))
        }
      }

      pc.ontrack = (e) => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0]
          videoRef.current.play().catch(() => {})
          clearTimeout(streamTimeoutRef.current)
          if (mountedRef.current) setStatus('streaming')
        }
      }

      pc.onconnectionstatechange = () => {
        if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && mountedRef.current) {
          setStatus('disconnected')
        }
      }

      // Read-only: recvonly transceivers
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      ws.send(JSON.stringify({ 
        type: 'webrtc_offer', 
        sdp: offer,
      }))

      if (mountedRef.current) setStatus('negotiating')

      streamTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && statusRef.current !== 'streaming') {
          sendOffer(ws)
        }
      }, 8000)
    } catch (err) {
      if (mountedRef.current) setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (!linkId || !token) {
      setStatus('error')
      return
    }
    mountedRef.current = true

    const wsUrl = API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') +
      `/ws/webrtc/spectator/${linkId}?token=${token}`

    setStatus('connecting')

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = async () => {
      await sendOffer(ws)
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'spectator_connected') {
          if (!spectatorIdRef.current && msg.spectator_id) {
            spectatorIdRef.current = msg.spectator_id
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              await sendOffer(wsRef.current)
            }
          }
          return
        }
        if (msg.type === 'telemetry') {
          if (mountedRef.current) {
            const data = msg.data || {}
            setTelemetry(data)

            const alertType = data?.proctoring_status?.lastAlertType || data?.last_alert_type
            if (alertType) {
              const label = alertType.toString()
              const entry = {
                type: label.replace(/\s+/g, '_').toLowerCase(),
                details: label,
                timestamp: new Date().toISOString(),
              }
              if (!violationsRef.current.length || violationsRef.current[0].details !== entry.details) {
                violationsRef.current = [entry, ...violationsRef.current].slice(0, 20)
                setViolations(violationsRef.current)
              }
            }
          }
        } else if (msg.type === 'webrtc_answer') {
          if (msg.viewer_id) {
            if (!spectatorIdRef.current) spectatorIdRef.current = msg.viewer_id
            else if (msg.viewer_id !== spectatorIdRef.current) return;
          }
          if (mountedRef.current) setStatus('negotiating')
          if (pcRef.current && pcRef.current.signalingState !== 'stable') {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            const queue = iceCandidateQueueRef.current || []
            for (const candidate of queue) {
              try { await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate)) } catch (_) {}
            }
            iceCandidateQueueRef.current = []
          }
        } else if (msg.type === 'webrtc_ice_candidate') {
          if (msg.viewer_id) {
            if (!spectatorIdRef.current) spectatorIdRef.current = msg.viewer_id
            else if (msg.viewer_id !== spectatorIdRef.current) return;
          }
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
          } else {
            iceCandidateQueueRef.current.push(msg.candidate)
          }
        } else if (msg.type === 'candidate_disconnected') {
          if (mountedRef.current) setStatus('disconnected')
        }
      } catch (err) {}
    }

    ws.onerror = () => {
      if (mountedRef.current) setStatus('error')
    }

    ws.onclose = () => {
      if (mountedRef.current) setStatus('disconnected')
    }

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [linkId, token, retryCount])

  const handleManualRetry = () => {
    cleanup()
    setStatus('connecting')
    setRetryCount(c => c + 1)
  }

  const getRoundIcon = (type) => {
    if (type === 'coding') return <Code size={16} />
    if (type === 'case_study') return <Briefcase size={16} />
    return <MessageSquare size={16} />
  }

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0f0f1a] text-white">
        Invalid or missing spectator token.
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-slate-200 flex flex-col font-sans">
      
      {/* ── Header / Watermark ──────────────────────────────────────────────── */}
      <header className="bg-slate-900/50 border-b border-white/10 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/20 p-2 rounded-full border border-indigo-500/30">
            <Eye className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide">HireIQ Spectator Mode</h1>
            <p className="text-xs text-slate-400 font-medium">Read-only live interview stream</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${status === 'streaming' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
              {status === 'streaming'   ? 'LIVE' :
               status === 'connecting'  ? 'Connecting...' :
               status === 'negotiating' ? 'Establishing...' : status}
            </span>
          </div>
          
          <button 
            onClick={handleManualRetry}
            className="flex items-center gap-2 px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-semibold rounded-full border border-slate-700 transition-colors"
          >
            <RefreshCw size={14} className={status === 'connecting' || status === 'negotiating' ? 'animate-spin' : ''} />
            Retry
          </button>
        </div>
      </header>

      {/* ── Main Content Grid ─────────────────────────────────────────────── */}
      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        
        {/* Left Column (Video) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-slate-900 rounded-2xl border border-white/5 shadow-xl overflow-hidden aspect-video relative flex items-center justify-center">
            
            {status !== 'streaming' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/90 backdrop-blur-sm">
                <Video className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-slate-400 font-medium">
                  {status === 'disconnected' ? 'Candidate disconnected.' : 
                   status === 'error' ? 'Connection error.' : 
                   'Waiting for candidate stream...'}
                </p>
              </div>
            )}

            <video
              ref={videoRef}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            
            <div className="absolute top-4 left-4 flex gap-2 z-20">
              <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-semibold border border-white/10 flex items-center gap-2">
                <MicOff size={12} className="text-rose-400" /> Spectator Mic Muted
              </div>
              <div className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-semibold border border-white/10 flex items-center gap-2">
                <MonitorOff size={12} className="text-rose-400" /> Cannot Interact
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Telemetry & Logs) */}
        <div className="bg-slate-900 rounded-2xl border border-white/5 shadow-xl flex flex-col overflow-hidden max-h-[80vh]">
          
          <div className="p-5 border-b border-white/5 bg-slate-800/30">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4">Current Focus</h3>
            {telemetry ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold bg-indigo-500/10 px-3 py-2 rounded-lg border border-indigo-500/20">
                  {getRoundIcon(telemetry.round_type)}
                  <span className="capitalize">{telemetry.round_type?.replace('_', ' ')} Round</span>
                  <span className="text-indigo-300 ml-auto">Q{telemetry.current_question} of {telemetry.total_questions}</span>
                </div>
                {telemetry.question_text && (
                  <div className="text-sm text-slate-300 leading-relaxed bg-slate-800 p-4 rounded-lg border border-slate-700">
                    "{telemetry.question_text}"
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">Waiting for telemetry...</p>
            )}
          </div>
          
          <div className="flex-1 p-5 overflow-y-auto">
            <h3 className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center justify-between">
              Proctoring Events
              {telemetry && (
                <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full">
                  {telemetry.proctoring_alerts} Total
                </span>
              )}
            </h3>
            
            {violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500">
                <p className="text-sm">No integrity violations recorded.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {violations.map((v, i) => {
                  const meta = VIOLATION_META[v.type] || { label: v.type, color: 'text-slate-400', bg: 'bg-slate-800' }
                  return (
                    <div key={i} className={`p-3 rounded-lg border ${meta.bg.replace('50', '500/10')} border-white/5 flex flex-col gap-1`}>
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-bold ${meta.color.replace('600', '400')}`}>{meta.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{formatTs(v.timestamp)}</span>
                      </div>
                      {v.details && <p className="text-xs text-slate-400 mt-1">{v.details}</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
