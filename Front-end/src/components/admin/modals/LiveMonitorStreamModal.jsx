import React, { useState, useEffect, useRef, useCallback } from 'react'
import { API_BASE_URL } from '../../../apiConfig'
import { getIceServers } from '../../../utils/webrtcConfig'
import Modal from '../../Modal'
import { useSelector } from 'react-redux'
import { Video, Mic, MicOff, MonitorOff, Activity, ShieldAlert, Code, MessageSquare, Briefcase, AlertTriangle, RefreshCw, Share2, Copy, CheckCircle2, Eye } from 'lucide-react'

// Maps violation_type values to a human-readable label + colour class
const VIOLATION_META = {
  tab_switch:          { label: 'Tab Switch',          color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200' },
  screenshot_shortcut: { label: 'Screenshot Attempt',  color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  clipboard_attempt:   { label: 'Copy / Paste',        color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  print_attempt:       { label: 'Print Attempt',       color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  save_attempt:        { label: 'Save Page',           color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  devtools_open:       { label: 'DevTools Opened',     color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200' },
  devtools_attempt:    { label: 'DevTools Attempt',    color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200' },
  window_blur:         { label: 'App Switch',          color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  multi_monitor:       { label: 'Multi-Monitor',       color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  no_face:             { label: 'No Face Detected',    color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200' },
  multi_person:        { label: 'Multiple Faces',      color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200' },
  phone:               { label: 'Phone Detected',      color: 'text-rose-600',   bg: 'bg-rose-50   border-rose-200' },
  eye_contact:         { label: 'Eye Contact Lost',    color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  lip_sync:            { label: 'Lip-Sync Mismatch',   color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
  noise_alert:         { label: 'Background Noise',    color: 'text-amber-600',  bg: 'bg-amber-50  border-amber-200' },
}

function violationMeta(type) {
  return VIOLATION_META[type] || { label: type, color: 'text-slate-600', bg: 'bg-slate-50 border-slate-200' }
}

function formatTs(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

const ICE_SERVERS = getIceServers()
// How long to wait before deciding the candidate hasn't answered and retrying
const STREAM_TIMEOUT_MS = 12000

export default function LiveMonitorStreamModal({ isOpen, onClose, session }) {
  const [status, setStatus] = useState('connecting')
  const [telemetry, setTelemetry] = useState(null)
  const [violations, setViolations] = useState([])
  const [retryCount, setRetryCount] = useState(0)
  const [spectatorCount, setSpectatorCount] = useState(0)
  const [shareLink, setShareLink] = useState('')
  const [copied, setCopied] = useState(false)

  const violationsPollRef = useRef(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const streamTimeoutRef = useRef(null)
  const mountedRef = useRef(false)
  // Unique ID for this admin viewer — ensures ICE/answer routing only goes to this viewer
  const viewerIdRef = useRef(Math.random().toString(36).substring(2, 10))
  // Keep a stable ref to the current WS so sendOffer can always access it without stale closure
  const wsReadyRef = useRef(false)
  // Queue ICE candidates that arrive before remoteDescription is set
  const iceCandidateQueue = useRef([])

  const token = useSelector(state => state.auth.token)

  // ── Violations + spectator count polling ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !session) return
    const linkId = session.link_id || session.session_id || session.id
    if (!linkId) return

    const fetchViolations = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/interview/${linkId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const raw = data?.violations ?? data?.proctoring_alerts ?? []
        if (Array.isArray(raw)) {
          setViolations(raw.map(v => ({
            type: v.violation_type || v.type || v.alert_type || 'unknown',
            details: v.details || v.message || '',
            timestamp: v.timestamp || v.ts || '',
          })))
        }
      } catch { /* non-fatal */ }
    }

    const fetchSpectatorCount = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/interview/${linkId}/spectator-count`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        setSpectatorCount(data.spectator_count || 0)
      } catch {}
    }

    fetchViolations()
    fetchSpectatorCount()
    violationsPollRef.current = setInterval(() => {
      fetchViolations()
      fetchSpectatorCount()
    }, 5000)
    
    return () => {
      clearInterval(violationsPollRef.current)
      setViolations([])
      setSpectatorCount(0)
    }
  }, [isOpen, session, token])

  // ── Peer Connection teardown helper ─────────────────────────────────────────
  const closePc = useCallback(() => {
    clearTimeout(streamTimeoutRef.current)
    iceCandidateQueue.current = []
    if (pcRef.current) {
      try { pcRef.current.close() } catch (_) {}
      pcRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // ── Full cleanup (PC + WS) ───────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    closePc()
    wsReadyRef.current = false
    if (wsRef.current) {
      try { wsRef.current.close() } catch (_) {}
      wsRef.current = null
    }
  }, [closePc])

  // ── sendOffer ────────────────────────────────────────────────────────────────
  // Uses wsRef.current directly (no closure over ws param) to avoid stale refs.
  // Called when: WS opens, user force-retries, or 12s timeout fires.
  const sendOffer = useCallback(async () => {
    closePc()

    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[AdminWebRTC] sendOffer: WS not open, skipping')
      return
    }

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      iceCandidateQueue.current = []

      pc.onicecandidate = (e) => {
        if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            candidate: e.candidate,
            viewer_id: viewerIdRef.current,
          }))
        }
      }

      pc.ontrack = (e) => {
        console.log('[AdminWebRTC] Track received:', e.track.kind)
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0]
          clearTimeout(streamTimeoutRef.current)
          if (mountedRef.current) setStatus('streaming')
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('[AdminWebRTC] PC state:', pc.connectionState)
        if (!mountedRef.current) return
        if (pc.connectionState === 'connected') {
          // Don't override 'streaming' if we already have a track
        } else if (pc.connectionState === 'failed') {
          setStatus('disconnected')
        } else if (pc.connectionState === 'disconnected') {
          // Give it 5s to reconnect before declaring dead
          streamTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && pcRef.current?.connectionState !== 'connected') {
              setStatus('disconnected')
            }
          }, 5000)
        }
      }

      // Admin only receives — candidate pushes video/audio tracks
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      if (wsRef.current?.readyState !== WebSocket.OPEN) {
        console.warn('[AdminWebRTC] WS closed before offer could be sent')
        closePc()
        return
      }

      wsRef.current.send(JSON.stringify({
        type: 'webrtc_offer',
        sdp: offer,
        viewer_id: viewerIdRef.current,
      }))

      if (mountedRef.current) setStatus('negotiating')
      console.log('[AdminWebRTC] Offer sent, waiting for answer...')

      // If no track arrives in STREAM_TIMEOUT_MS, retry
      streamTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && pcRef.current?.connectionState !== 'connected') {
          console.warn('[AdminWebRTC] No stream arrived — auto-retrying offer')
          sendOffer()
        }
      }, STREAM_TIMEOUT_MS)

    } catch (err) {
      console.error('[AdminWebRTC] sendOffer error:', err)
      if (mountedRef.current) setStatus('error')
    }
  }, [closePc])  // note: NO 'status' dep — avoids stale closure on the retry timer

  // ── Main WebSocket Effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !session) return
    mountedRef.current = true

    const sessionId = session.link_id || session.session_id || session.id
    const wsUrl =
      API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') +
      `/ws/webrtc/admin/${sessionId}?token=${token}`

    console.log('[AdminWebRTC] Opening WS:', wsUrl)
    setStatus('connecting')

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[AdminWebRTC] WS open')
      wsReadyRef.current = true
      sendOffer()
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'admin_connected') {
          // Server ack — offer already sent in ws.onopen
          return
        }

        if (msg.type === 'telemetry') {
          if (mountedRef.current) setTelemetry(msg.data)
          return
        }

        if (msg.type === 'webrtc_answer') {
          // Discard answers not addressed to this viewer
          if (msg.viewer_id && msg.viewer_id !== viewerIdRef.current) return

          const pc = pcRef.current
          if (!pc) return
          if (pc.signalingState === 'stable') {
            console.warn('[AdminWebRTC] Got answer but already stable — ignoring')
            return
          }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            console.log('[AdminWebRTC] Remote description set. Draining ICE queue:', iceCandidateQueue.current.length)
            // Drain any ICE candidates that arrived before the answer
            for (const candidate of iceCandidateQueue.current) {
              try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch (_) {}
            }
            iceCandidateQueue.current = []
          } catch (err) {
            console.error('[AdminWebRTC] setRemoteDescription failed:', err)
          }
          return
        }

        if (msg.type === 'webrtc_ice_candidate') {
          // Discard ICE not addressed to this viewer
          if (msg.viewer_id && msg.viewer_id !== viewerIdRef.current) return

          const pc = pcRef.current
          if (!pc) return
          if (pc.remoteDescription) {
            try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)) } catch (_) {}
          } else {
            // Queue ICE candidates until remote description is set
            iceCandidateQueue.current.push(msg.candidate)
          }
          return
        }

        if (msg.type === 'candidate_disconnected') {
          if (mountedRef.current) setStatus('disconnected')
          return
        }

      } catch (err) {
        console.error('[AdminWebRTC] onmessage error:', err)
      }
    }

    ws.onerror = (e) => {
      console.error('[AdminWebRTC] WS error:', e)
      if (mountedRef.current) setStatus('error')
    }

    ws.onclose = (e) => {
      console.log(`[AdminWebRTC] WS closed (code=${e.code})`)
      wsReadyRef.current = false
      if (mountedRef.current) setStatus('disconnected')
    }

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [isOpen, session, token, retryCount])

  const handleManualRetry = () => {
    cleanup()
    setStatus('connecting')
    setRetryCount(c => c + 1)
  }

  const handleGenerateShareLink = async () => {
    const linkId = session?.link_id || session?.session_id || session?.id
    if (!linkId) return
    try {
      const res = await fetch(`${API_BASE_URL}/admin/interview/${linkId}/spectator-token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to generate token')
      const data = await res.json()
      const spectatorUrl = `${window.location.origin}/spectate/${linkId}?token=${data.token}`
      setShareLink(spectatorUrl)
    } catch (err) {
      console.error('Failed to generate spectator link', err)
    }
  }

  const handleCopyLink = () => {
    if (!shareLink) return
    navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getRoundIcon = (type) => {
    if (type === 'coding') return <Code size={16} />
    if (type === 'case_study') return <Briefcase size={16} />
    return <MessageSquare size={16} />
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center justify-between w-full pr-8">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${status === 'streaming' ? 'bg-success animate-pulse' : 'bg-amber-500'}`} />
            Live Stream: <span className="font-bold">{session?.candidate_name}</span>
          </div>
          {spectatorCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-semibold border border-indigo-100">
              <Eye size={14} />
              {spectatorCount} Spectator{spectatorCount !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      }
      subtitle={`Email: ${session?.candidate_email} | Session: ${session?.session_id}`}
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-4 text-slate-800 bg-white">

        {/* Controls Bar */}
        <div className="flex items-center justify-between border border-slate-200 rounded-lg p-3 bg-slate-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Mic size={16} className={telemetry?.audio_level > 0.05 ? 'text-indigo-500' : 'text-slate-400'} />
              <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 transition-all duration-100 ease-linear"
                  style={{ width: `${Math.min(100, (telemetry?.audio_level || 0) * 100)}%` }}
                />
              </div>
            </div>

            <div className="h-6 w-px bg-slate-300" />

            <button 
              onClick={handleManualRetry}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
            >
              <RefreshCw size={14} className={status === 'connecting' || status === 'negotiating' ? 'animate-spin' : ''} />
              Refresh Connection
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            {!shareLink ? (
              <button
                onClick={handleGenerateShareLink}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
              >
                <Share2 size={14} />
                Share Spectator Link
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="text-xs text-slate-500 bg-white border border-slate-300 rounded px-2 py-1 w-48 truncate outline-none"
                  onFocus={e => e.target.select()}
                />
                <button
                  onClick={handleCopyLink}
                  className="flex items-center justify-center p-1.5 text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors"
                  title="Copy Link"
                >
                  {copied ? <CheckCircle2 size={14} className="text-success" /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Top Telemetry Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-center">
            <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</span>
            <div className="flex items-center gap-1.5 font-bold text-sm">
              {status === 'streaming'   ? <span className="text-emerald-600">LIVE</span> :
               status === 'connecting'  ? <span className="text-amber-500">Connecting...</span> :
               status === 'negotiating' ? <span className="text-indigo-500">Establishing...</span> :
               <span className="text-red-500 uppercase">{status}</span>}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-center">
            <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider mb-1">Current Focus</span>
            <div className="flex items-center gap-1.5 font-bold text-sm text-slate-800">
              {telemetry ? (
                <>
                  <span className="text-indigo-600">{getRoundIcon(telemetry.round_type)}</span>
                  Q{telemetry.current_question} of {telemetry.total_questions}
                </>
              ) : '--'}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-center">
            <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider mb-1">Audio Level</span>
            <div className="flex items-center gap-2 font-bold text-sm text-slate-800">
              {telemetry?.audio_level > 5 ? <Mic size={16} className="text-emerald-500" /> : <MicOff size={16} className="text-slate-400" />}
              {telemetry ? Math.round(telemetry.audio_level) + '%' : '--'}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-center">
            <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider mb-1">Proctoring Alerts</span>
            <div className="flex items-center gap-1.5 font-bold text-sm">
              <ShieldAlert size={16} className={telemetry?.proctoring_alerts > 0 ? "text-rose-500" : "text-emerald-500"} />
              <span className={telemetry?.proctoring_alerts > 0 ? "text-rose-600" : "text-emerald-600"}>
                {telemetry?.proctoring_alerts ?? violations.length} Alerts
              </span>
            </div>
          </div>
        </div>

        {/* Video Player Area */}
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">

          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            className={`w-full h-full object-contain ${status === 'streaming' ? 'opacity-100' : 'opacity-0'}`}
          />

          {status !== 'streaming' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/90 z-10">
              {status === 'connecting' || status === 'negotiating' ? (
                <div className="flex flex-col items-center gap-3">
                  <Activity size={40} className="animate-pulse text-indigo-500" />
                  <p className="text-sm font-semibold tracking-wide">
                    {status === 'connecting' ? 'Connecting to Candidate Stream...' : 'Negotiating WebRTC connection...'}
                  </p>
                  <p className="text-xs text-slate-500">Candidate must be on the interview page for this to connect</p>
                  <button
                    onClick={sendOffer}
                    className="mt-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 transition-colors text-white text-xs font-bold rounded shadow-md"
                  >
                    Force Retry Connection
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <MonitorOff size={40} className="text-rose-500" />
                  <p className="text-sm font-semibold tracking-wide text-rose-400">Stream Disconnected or Offline</p>
                  <button
                    onClick={handleManualRetry}
                    className="mt-2 px-4 py-1.5 bg-rose-600 hover:bg-rose-500 transition-colors text-white text-xs font-bold rounded shadow-md flex items-center gap-2"
                  >
                    <RefreshCw size={13} /> Reconnect
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Live overlay */}
          {status === 'streaming' && telemetry && (
            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end pointer-events-none">
              <div className="bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-white flex items-center gap-2 pointer-events-auto">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider">LIVE</span>
              </div>
              <div className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-lg border border-white/10 text-white flex flex-col gap-1 pointer-events-auto max-w-[50%]">
                <span className="text-[0.65rem] text-slate-300 font-bold uppercase truncate">
                  {telemetry.round_type === 'coding' ? 'Coding Challenge' : 'Verbal Response'}
                </span>
                <span className="text-sm font-bold truncate">
                  Q{telemetry.current_question}: {telemetry.question_text || 'Interview Question'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Violations Feed ──────────────────────────────────────────────── */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className={violations.length > 0 ? 'text-rose-500' : 'text-slate-400'} />
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">Security Events</span>
            </div>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              violations.length === 0
                ? 'bg-emerald-100 text-emerald-700'
                : violations.length < 3
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-rose-100 text-rose-700'
            }`}>
              {violations.length} event{violations.length !== 1 ? 's' : ''}
            </span>
          </div>

          {violations.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs text-slate-400 font-medium">
              No security violations recorded yet. Updates every 5 s.
            </div>
          ) : (
            <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100">
              {[...violations].reverse().map((v, i) => {
                const meta = violationMeta(v.type)
                return (
                  <li
                    key={i}
                    className={`flex items-start gap-3 px-4 py-2.5 text-xs ${meta.bg} border-l-2 ${meta.color.replace('text-', 'border-')}`}
                  >
                    <ShieldAlert size={13} className={`mt-0.5 shrink-0 ${meta.color}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`font-bold ${meta.color}`}>{meta.label}</span>
                      {v.details && v.details !== v.type && (
                        <span className="ml-1.5 text-slate-500 truncate">{v.details}</span>
                      )}
                    </div>
                    {v.timestamp && (
                      <span className="text-slate-400 shrink-0 font-mono">{formatTs(v.timestamp)}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

      </div>
    </Modal>
  )
}
