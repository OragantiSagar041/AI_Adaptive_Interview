import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { getIceServers } from '../utils/webrtcConfig'
import { Video, MicOff, MonitorOff, Code, MessageSquare, Briefcase, RefreshCw, Eye, Monitor, Camera, Volume2, ShieldAlert } from 'lucide-react'

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
    const t = hashParams.get('token') || queryParams.get('token') || (linkId ? sessionStorage.getItem(`spectator_token_${linkId}`) : null)
    if (t && linkId) {
      try { sessionStorage.setItem(`spectator_token_${linkId}`, t) } catch (_) {}
    }
    return t
  })

  const [status, setStatus] = useState('connecting')
  const [telemetry, setTelemetry] = useState(null)
  const [violations, setViolations] = useState([])
  const [retryCount, setRetryCount] = useState(0)
  const [remoteStream, setRemoteStream] = useState(null)
  const [activeView, setActiveView] = useState('camera') // 'camera' | 'screen'

  const videoRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const streamTimeoutRef = useRef(null)
  const heartbeatTimerRef = useRef(null)
  const mountedRef = useRef(false)
  const spectatorIdRef = useRef(null)
  const iceCandidateQueueRef = useRef([])
  const statusRef = useRef(status)
  const violationsRef = useRef([])
  const sendOfferRef = useRef(null)

  useEffect(() => {
    statusRef.current = status
  }, [status])

  // ── WebRTC Receiver Extraction ──────────────────────────────────────────────
  const updateRemoteStreamFromReceivers = useCallback(() => {
    const pc = pcRef.current
    if (!pc) return

    const receiverTracks = pc.getReceivers()
      .map(receiver => receiver.track)
      .filter(Boolean)

    if (receiverTracks.length === 0) return

    const receiverStream = new MediaStream(receiverTracks)
    setRemoteStream(receiverStream)
    if (mountedRef.current) setStatus('streaming')
  }, [])

  // Derive sub-streams for camera vs screen
  const { cameraStream, screenStream, hasScreen } = useMemo(() => {
    if (!remoteStream) return { cameraStream: null, screenStream: null, hasScreen: false }

    const videoTracks = remoteStream.getVideoTracks()
    const audioTracks = remoteStream.getAudioTracks()

    const cameraVideo = videoTracks[0] || null
    const screenVideo = videoTracks[1] || null

    return {
      cameraStream: cameraVideo ? new MediaStream([cameraVideo, ...audioTracks]) : null,
      screenStream: screenVideo ? new MediaStream([screenVideo, ...audioTracks]) : null,
      hasScreen: !!screenVideo && screenVideo.readyState === 'live',
    }
  }, [remoteStream])

  // Attach stream to video element
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const targetStream = activeView === 'screen' && screenStream ? screenStream : cameraStream
    if (targetStream) {
      if (video.srcObject !== targetStream) {
        video.srcObject = targetStream
      }
      video.play().catch(err => {
        console.warn('[SpectatorWebRTC] Autoplay prevented:', err)
      })
    } else {
      video.srcObject = null
    }
  }, [activeView, cameraStream, screenStream])

  // ── Cleanup ─────────────────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearTimeout(streamTimeoutRef.current)
    clearInterval(heartbeatTimerRef.current)
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setRemoteStream(null)
  }, [])

  // ── Send Offer ──────────────────────────────────────────────────────────────
  const sendOffer = useCallback(async (ws) => {
    clearTimeout(streamTimeoutRef.current)
    iceCandidateQueueRef.current = []
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    try {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ 
            type: 'webrtc_ice_candidate', 
            candidate: e.candidate,
            spectator_id: spectatorIdRef.current,
            admin_id: spectatorIdRef.current,
          }))
        }
      }

      pc.ontrack = (e) => {
        console.log(`[SpectatorWebRTC] Remote track received: ${e.track.kind}`)
        e.track.onunmute = () => {
          console.log(`[SpectatorWebRTC] Remote track unmuted: ${e.track.kind}`)
          updateRemoteStreamFromReceivers()
        }
        updateRemoteStreamFromReceivers()
        clearTimeout(streamTimeoutRef.current)
        if (mountedRef.current) setStatus('streaming')
      }

      pc.onconnectionstatechange = () => {
        console.log('[SpectatorWebRTC] PC state:', pc.connectionState)
        if (pc.connectionState === 'connected') {
          if (mountedRef.current) setStatus('streaming')
        } else if (pc.connectionState === 'failed') {
          if (mountedRef.current) {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              sendOfferRef.current?.(wsRef.current)
            } else {
              setStatus('disconnected')
            }
          }
        } else if (pc.connectionState === 'disconnected') {
          setTimeout(() => {
            if (mountedRef.current && pcRef.current?.connectionState === 'disconnected') {
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                sendOfferRef.current?.(wsRef.current)
              } else {
                setStatus('disconnected')
              }
            }
          }, 4000)
        }
      }

      // Add two video transceivers (camera + screen) and one audio transceiver
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      ws.send(JSON.stringify({ 
        type: 'webrtc_offer', 
        sdp: offer,
        spectator_id: spectatorIdRef.current,
        admin_id: spectatorIdRef.current,
      }))

      if (mountedRef.current) setStatus('negotiating')

      streamTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && statusRef.current !== 'streaming') {
          console.warn('[SpectatorWebRTC] Stream timeout — retrying offer...')
          if (sendOfferRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            sendOfferRef.current(wsRef.current)
          }
        }
      }, 8000)
    } catch (err) {
      console.error('[SpectatorWebRTC] Error in sendOffer:', err)
      if (mountedRef.current) setStatus('error')
    }
  }, [updateRemoteStreamFromReceivers])

  sendOfferRef.current = sendOffer

  // ── WebSocket Connection Lifecycle ──────────────────────────────────────────
  useEffect(() => {
    if (!linkId || !token) {
      setStatus('error')
      return
    }
    mountedRef.current = true

    const wsUrl = API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') +
      `/ws/webrtc/spectator/${linkId}?token=${encodeURIComponent(token)}`

    setStatus('connecting')

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = async () => {
      console.log('[SpectatorWebRTC] WebSocket connected')
      // Heartbeat ping every 10 seconds
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 10000)

      await sendOffer(ws)
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'pong' || msg.type === 'ping') return

        if (msg.type === 'spectator_connected' || msg.type === 'admin_connected') {
          if (msg.spectator_id) {
            spectatorIdRef.current = msg.spectator_id
          }
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            await sendOffer(wsRef.current)
          }
          return
        }

        if (msg.type === 'candidate_connected') {
          console.log('[SpectatorWebRTC] Candidate connected, renegotiating...')
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            await sendOffer(wsRef.current)
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
          if (msg.viewer_id || msg.target_admin_id || msg.spectator_id) {
            const targetId = msg.viewer_id || msg.target_admin_id || msg.spectator_id
            if (spectatorIdRef.current && targetId !== spectatorIdRef.current) return
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
          if (msg.viewer_id || msg.target_admin_id || msg.spectator_id) {
            const targetId = msg.viewer_id || msg.target_admin_id || msg.spectator_id
            if (spectatorIdRef.current && targetId !== spectatorIdRef.current) return
          }
          if (pcRef.current && pcRef.current.remoteDescription) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
          } else {
            iceCandidateQueueRef.current.push(msg.candidate)
          }
        } else if (msg.type === 'candidate_disconnected') {
          if (mountedRef.current) setStatus('disconnected')
        }
      } catch (err) {
        console.warn('[SpectatorWebRTC] Error handling message:', err)
      }
    }

    ws.onerror = (e) => {
      console.warn('[SpectatorWebRTC] WebSocket error:', e)
      if (mountedRef.current) setStatus('error')
    }

    ws.onclose = (e) => {
      console.log('[SpectatorWebRTC] WebSocket closed:', e.code, e.reason)
      if (mountedRef.current) setStatus('disconnected')
    }

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [linkId, token, retryCount, sendOffer, cleanup])

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
      <div className="flex h-screen flex-col items-center justify-center bg-[#0f0f1a] text-white p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
          <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Invalid Spectator Link</h2>
          <p className="text-sm text-slate-400 mb-6">
            The spectator token is missing or has expired. Please ask the interview host for a fresh spectator link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-slate-200 flex flex-col font-sans">
      
      {/* ── Header / Watermark ──────────────────────────────────────────────── */}
      <header className="bg-slate-900/80 backdrop-blur-md border-b border-white/10 px-6 py-3.5 flex items-center justify-between shadow-sm sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/20 p-2 rounded-xl border border-indigo-500/30">
            <Eye className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold text-white tracking-wide flex items-center gap-2">
              HireIQ Spectator Mode
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">READ-ONLY</span>
            </h1>
            <p className="text-xs text-slate-400 font-medium">Session ID: {linkId}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/90 px-3.5 py-1.5 rounded-full border border-slate-700">
            <span className={`w-2.5 h-2.5 rounded-full ${
              status === 'streaming' ? 'bg-emerald-500 animate-pulse' :
              status === 'connecting' || status === 'negotiating' ? 'bg-amber-400 animate-pulse' : 'bg-rose-500'
            }`} />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
              {status === 'streaming'   ? 'LIVE' :
               status === 'connecting'  ? 'Connecting...' :
               status === 'negotiating' ? 'Establishing...' : status}
            </span>
          </div>
          
          <button 
            onClick={handleManualRetry}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-full border border-slate-700 transition-colors shadow-sm"
          >
            <RefreshCw size={13} className={status === 'connecting' || status === 'negotiating' ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </header>

      {/* ── Main Content Grid ─────────────────────────────────────────────── */}
      <main className="flex-1 p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
        
        {/* Left Column (Video Stream) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden aspect-video relative flex items-center justify-center group">
            
            {status !== 'streaming' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-slate-900/90 backdrop-blur-sm p-6 text-center">
                <Video className="w-12 h-12 text-slate-600 mb-4 animate-pulse" />
                <p className="text-slate-300 font-semibold mb-1">
                  {status === 'disconnected' ? 'Candidate disconnected.' : 
                   status === 'error' ? 'Connection error.' : 
                   'Connecting to candidate stream...'}
                </p>
                <p className="text-xs text-slate-500 max-w-xs">
                  {status === 'connecting' || status === 'negotiating' ? 'Performing peer handshake and media negotiation...' : 'Click refresh to attempt reconnecting.'}
                </p>
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
            />
            
            {/* Top Overlay badges */}
            <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-20">
              <div className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-semibold border border-white/10 flex items-center gap-1.5 text-slate-300">
                <MicOff size={12} className="text-rose-400" /> Spectator Mic Muted
              </div>
              <div className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-full text-xs font-semibold border border-white/10 flex items-center gap-1.5 text-slate-300">
                <MonitorOff size={12} className="text-rose-400" /> Cannot Interact
              </div>
            </div>

            {/* View Switcher (Camera vs Screen) */}
            {hasScreen && (
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md p-1 rounded-xl border border-white/10 z-20">
                <button
                  type="button"
                  onClick={() => setActiveView('camera')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    activeView === 'camera'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Camera size={12} />
                  Camera
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('screen')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    activeView === 'screen'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Monitor size={12} />
                  Screen
                </button>
              </div>
            )}

            {/* Audio level indicator in overlay */}
            {telemetry && typeof telemetry.audio_level === 'number' && (
              <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/10 z-20">
                <Volume2 size={12} className={telemetry.audio_level > 10 ? 'text-emerald-400' : 'text-slate-500'} />
                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-150"
                    style={{ width: `${Math.min(100, Math.max(0, telemetry.audio_level))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column (Telemetry & Logs) */}
        <div className="bg-slate-900 rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[80vh]">
          
          <div className="p-5 border-b border-white/10 bg-slate-800/40">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Current Focus</h3>
            {telemetry ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-indigo-400 font-semibold bg-indigo-500/10 px-3 py-2 rounded-xl border border-indigo-500/20">
                  {getRoundIcon(telemetry.round_type)}
                  <span className="capitalize text-sm">{telemetry.round_type ? `${telemetry.round_type.replace('_', ' ')} Round` : 'Interview Round'}</span>
                  {telemetry.total_questions > 0 && (
                    <span className="text-xs text-indigo-300 ml-auto font-mono">Q{telemetry.current_question || 1} of {telemetry.total_questions}</span>
                  )}
                </div>
                {telemetry.question_text && (
                  <div className="text-sm text-slate-200 leading-relaxed bg-slate-800/80 p-3.5 rounded-xl border border-slate-700/80 font-medium">
                    "{telemetry.question_text}"
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Waiting for interview telemetry...</p>
            )}
          </div>
          
          <div className="flex-1 p-5 overflow-y-auto">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center justify-between">
              Proctoring Events
              {telemetry && typeof telemetry.proctoring_alerts === 'number' && (
                <span className="text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                  {telemetry.proctoring_alerts} Total
                </span>
              )}
            </h3>
            
            {violations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-slate-500 text-center">
                <p className="text-xs">No integrity violations recorded in this session.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {violations.map((v, i) => {
                  const meta = VIOLATION_META[v.type] || { label: v.type, color: 'text-slate-400', bg: 'bg-slate-800' }
                  return (
                    <div key={i} className="p-2.5 rounded-xl border border-white/5 bg-slate-800/50 flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-bold ${meta.color.replace('600', '400')}`}>{meta.label}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{formatTs(v.timestamp)}</span>
                      </div>
                      {v.details && <p className="text-xs text-slate-400">{v.details}</p>}
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
