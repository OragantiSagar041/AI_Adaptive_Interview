import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { API_BASE_URL } from '../../../apiConfig'
import { getIceServers } from '../../../utils/webrtcConfig'
import Modal from '../../Modal'
import { useSelector } from 'react-redux'
import { Video, Mic, MicOff, MonitorOff, Monitor, Camera, Activity, ShieldAlert, Code, MessageSquare, Briefcase, AlertTriangle, RefreshCw, Share2, Copy, CheckCircle2, Users } from 'lucide-react'

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
const MAX_OFFER_ATTEMPTS = 3

function getTrackType(track) {
  const label = (track.label || '').toLowerCase()
  if (/screen|display|monitor|window|tab|share/.test(label)) return 'screen'
  if (/camera|webcam|front|user|face/.test(label)) return 'camera'
  return 'unknown'
}

const buildRemoteViewStream = (stream, mode) => {
  if (!stream) return null
  const videoTracks = [...stream.getVideoTracks()]
  const audioTracks = [...stream.getAudioTracks()]
  if (videoTracks.length === 0) return stream

  let selectedVideoTrack = null

  if (mode === 'camera') {
    selectedVideoTrack = videoTracks.find(track => getTrackType(track) === 'camera') || videoTracks[0]
  } else {
    // Candidate publishers add camera to transceiver 0 and screen to transceiver 1.
    // If track labels are obfuscated by the browser, fallback to the expected transceiver index order.
    selectedVideoTrack = videoTracks.find(track => getTrackType(track) === 'screen') || (videoTracks.length > 1 ? videoTracks[1] : videoTracks[0])
  }

  if (!selectedVideoTrack) {
    return stream
  }

  return new MediaStream([selectedVideoTrack, ...audioTracks])
}

export default function LiveMonitorStreamModal({ isOpen, onClose, session }) {
  const [status, setStatus] = useState('connecting')
  const [telemetry, setTelemetry] = useState(null)
  const [violations, setViolations] = useState([])
  const [retryCount, setRetryCount] = useState(0)
  const [viewMode, setViewMode] = useState('screen')
  const [remoteStream, setRemoteStream] = useState(null)
  const [trackAvailability, setTrackAvailability] = useState({ camera: false, screen: false })
  const [shareLink, setShareLink] = useState('')
  const [generatingLink, setGeneratingLink] = useState(false)
  const [copied, setCopied] = useState(false)
  const [spectatorCount, setSpectatorCount] = useState(0)

  const violationsPollRef = useRef(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const pendingIceCandidatesRef = useRef([])
  const streamTimeoutRef = useRef(null)  // fire if no video track arrives in time
  const mountedRef = useRef(false)
  // Keep a ref to the latest status so the setTimeout inside sendOffer always
  // reads the current value without needing `status` in its dependency array.
  // Without this the useCallback recreates on every status transition, which
  // causes ws.onopen to capture a stale sendOffer reference.
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status }, [status])
  const token = useSelector(state => state.auth.token)
  const user = useSelector(state => state.auth.user)
  // Generate a distinct tab/session-unique ID so multiple tabs/windows logged into the same admin do not conflict
  const adminIdRef = useRef(null)
  if (!adminIdRef.current) {
    const base = (user?.email || user?._id || user?.id || 'admin').replace(/[^a-zA-Z0-9_]/g, '_')
    adminIdRef.current = `${base}_tab_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`
  }
  const heartbeatTimerRef = useRef(null)

  // ── Violations & Spectator Count polling ───────────────────────────────────
  useEffect(() => {
    if (!isOpen || !session) return
    const linkId = typeof session === 'string' ? session : (session?.link_id || session?.session_id || session?.id || session?._id || session?.interview_id)
    if (!linkId || linkId === 'undefined') return

    const fetchViolations = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/admin/interview/${linkId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const data = await res.json()
        const raw = data?.violations ?? data?.alerts ?? data?.proctoring_alerts ?? []
        if (Array.isArray(raw)) {
          setViolations(raw.map(v => ({
            type: v.violation_type || v.type || v.alert_type || 'warning',
            details: v.details || v.message || (typeof v === 'string' ? v : ''),
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
        if (res.ok) {
          const data = await res.json()
          setSpectatorCount(data.spectator_count || 0)
        }
      } catch { /* non-fatal */ }
    }

    fetchViolations()
    fetchSpectatorCount()
    violationsPollRef.current = setInterval(() => {
      fetchViolations()
    }, 15000)
    // Spectator count changes rarely — poll less aggressively
    const spectatorPoll = setInterval(() => {
      fetchSpectatorCount()
    }, 20000)
    return () => clearInterval(spectatorPoll)

    return () => {
      clearInterval(violationsPollRef.current)
      setViolations([])
      setSpectatorCount(0)
      setShareLink('')
      setCopied(false)
    }
  }, [isOpen, session, token])

  const handleGenerateShareLink = async () => {
    try {
      setGeneratingLink(true)
      const linkId = typeof session === 'string' ? session : (session?.link_id || session?.session_id || session?.id || session?._id || session?.interview_id)
      const res = await fetch(`${API_BASE_URL}/admin/interview/${linkId}/spectator-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.detail || 'Failed to generate token')
      }
      const data = await res.json()
      const spectatorUrl = `${window.location.origin}/spectate/${linkId}#token=${encodeURIComponent(data.token)}`
      setShareLink(spectatorUrl)
    } catch (err) {
      console.error('Failed to generate spectator link', err)
      alert(err.message || 'Failed to generate spectator link')
    } finally {
      setGeneratingLink(false)
    }
  }

  const handleCopyLink = () => {
    if (!shareLink) return
    navigator.clipboard.writeText(shareLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── WebRTC / Signaling ──────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    clearTimeout(streamTimeoutRef.current)
    clearInterval(heartbeatTimerRef.current)
    if (pcRef.current) {
      try { pcRef.current.close() } catch (_) {}
      pcRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setRemoteStream(null)
  }, [])

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

  /**
   * sendOffer:
   * (Re-)creates the RTCPeerConnection, attaches track listeners, creates an SDP offer,
   * sets localDescription, and sends it over the WebSocket.
   *
   * Called once on socket open, and re-invoked on-demand if the stream doesn't arrive in time.
   */
  const sendOfferRef = useRef(null)
  const connectionIdRef = useRef(null)
  const viewerIdRef = useRef(null)
  const offerIdRef = useRef(null)
  const iceCandidateQueue = useRef([])
  const wsReadyRef = useRef(false)
  const offerAttemptsRef = useRef(0)

  const closePc = useCallback(() => {
    clearTimeout(streamTimeoutRef.current)
    pendingIceCandidatesRef.current = []
    if (pcRef.current) {
      try { pcRef.current.close() } catch (_) {}
      pcRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  // ── sendOffer ────────────────────────────────────────────────────────────────
  // Uses wsRef.current directly (no closure over ws param) to avoid stale refs.
  // Called when: WS opens, user force-retries, or 12s timeout fires.
  const sendOffer = useCallback(async (ws, connectionId) => {
    const currentConnectionId = connectionId ?? connectionIdRef.current

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('[AdminWebRTC] sendOffer: WS not open, skipping')
      return
    }

    if (currentConnectionId && connectionIdRef.current && connectionIdRef.current !== currentConnectionId) {
      console.warn('[AdminWebRTC] sendOffer: stale socket, skipping')
      return
    }

    if (wsRef.current && wsRef.current !== ws) {
      console.warn('[AdminWebRTC] sendOffer: stale socket instance, skipping')
      return
    }

    if (currentConnectionId) connectionIdRef.current = currentConnectionId

    closePc()

    try {
      const nextOfferAttempt = offerAttemptsRef.current + 1
      if (nextOfferAttempt > MAX_OFFER_ATTEMPTS) {
        if (mountedRef.current) setStatus('disconnected')
        return
      }
      offerAttemptsRef.current = nextOfferAttempt

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      iceCandidateQueue.current = []
      const offerId = currentConnectionId ? `offer-${currentConnectionId}-${nextOfferAttempt}` : `offer-${Date.now()}-${nextOfferAttempt}`
      offerIdRef.current = offerId

      pc.onicecandidate = (e) => {
        if (e.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            candidate: e.candidate,
            admin_id: adminIdRef.current
          }))
        }
      }

      pc.onicecandidate = (e) => {
        if (
          !isCurrentPc() ||
          !e.candidate ||
          ws.readyState !== WebSocket.OPEN ||
          connectionIdRef.current !== connectionId ||
          wsRef.current !== ws
        ) {
          return
        }
        ws.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          candidate: e.candidate,
          viewer_id: viewerIdRef.current,
          offer_id: offerId,
        }))
      }

      pc.ontrack = (e) => {
        console.log(`[AdminWebRTC] Remote track received: ${e.track.kind}`)
        // Listen for track unmuting, which fires when media packets begin flowing
        e.track.onunmute = () => {
          console.log(`[AdminWebRTC] Remote track unmuted: ${e.track.kind}`)
          updateRemoteStreamFromReceivers()
        }
        updateRemoteStreamFromReceivers()
        clearTimeout(streamTimeoutRef.current)
        if (mountedRef.current) setStatus('streaming')
      }

      pc.onconnectionstatechange = () => {
        if (!isCurrentPc()) return
        console.log('[AdminWebRTC] PC state:', pc.connectionState)
        if (pc.connectionState === 'connected') {
          if (mountedRef.current) setStatus('streaming')
        } else if (pc.connectionState === 'failed') {
          if (mountedRef.current) {
            console.warn('[AdminWebRTC] PC state failed. Retrying offer...')
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              sendOfferRef.current?.(wsRef.current)
            } else {
              setStatus('disconnected')
            }
          }
        } else if (pc.connectionState === 'disconnected') {
          // Grace period for transient disconnects (window switch / background throttling)
          setTimeout(() => {
            if (mountedRef.current && pcRef.current?.connectionState === 'disconnected') {
              console.warn('[AdminWebRTC] PC still disconnected. Retrying offer...')
              if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                sendOfferRef.current?.(wsRef.current)
              } else {
                setStatus('disconnected')
              }
            }
          }, 4000)
        }
      }

      // The candidate publishes two video tracks: camera first, screen second.
      // Advertise both receive slots so the screen track is negotiated instead
      // of being dropped by the single-video offer.
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('video', { direction: 'recvonly' })
      pc.addTransceiver('audio', { direction: 'recvonly' })

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      ws.send(JSON.stringify({
        type: 'webrtc_offer',
        sdp: offer,
        admin_id: adminIdRef.current
      }))

      if (mountedRef.current) setStatus('negotiating')
      console.log('[AdminWebRTC] Offer sent, waiting for answer...')

      // If no video track arrives within 8 s, retry the offer automatically.
      streamTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current && statusRef.current !== 'streaming') {
          console.warn('[AdminWebRTC] No stream in 8 s — retrying offer...')
          if (sendOfferRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            sendOfferRef.current(wsRef.current)
          }
        }
        if (offerAttemptsRef.current >= MAX_OFFER_ATTEMPTS) {
          if (mountedRef.current) setStatus('disconnected')
          return
        }
        console.warn('[AdminWebRTC] No stream arrived — auto-retrying offer')
        sendOffer(ws, connectionId)
      }, STREAM_TIMEOUT_MS)

    } catch (err) {
      console.error('[AdminWebRTC] sendOffer error:', err)
      if (mountedRef.current) setStatus('error')
    }
  }, [])

  useEffect(() => {
    sendOfferRef.current = sendOffer
  }, [sendOffer])

  // ── Main WebSocket Effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !session) return
    mountedRef.current = true

    const sessionId = typeof session === 'string' ? session : (session?.link_id || session?.session_id || session?.id || session?._id || session?.interview_id)
    if (!sessionId || sessionId === 'undefined') {
      console.warn('[AdminWebRTC] No valid session ID provided to LiveMonitorStreamModal:', session)
      setStatus('error')
      return
    }

    const base = (user?.email || user?._id || user?.id || 'admin').replace(/[^a-zA-Z0-9_]/g, '_')
    adminIdRef.current = `${base}_tab_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`

    const adminBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
    const wsUrl =
      adminBaseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') +
      `/ws/webrtc/admin/${sessionId}?token=${token}&admin_id=${encodeURIComponent(adminIdRef.current)}`

    console.log('[AdminWebRTC] Connecting with admin_id:', adminIdRef.current)
    setStatus('connecting')

    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = async () => {
      console.log('[AdminWebRTC] WS open — starting heartbeat & sending initial offer')
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 15_000)

      await sendOffer(ws)
    }

    ws.onmessage = async (event) => {
      if (connectionIdRef.current !== connectionId || wsRef.current !== ws) return
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'pong' || msg.type === 'ping') {
          return // Heartbeat response
        }

        if (msg.type === 'admin_connected') {
          if (msg.admin_id) {
            adminIdRef.current = msg.admin_id
          }
          return
        }

        if (msg.type === 'candidate_connected') {
          console.log('[AdminWebRTC] Candidate reconnected/ready. Sending fresh offer...')
          if (mountedRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            sendOffer(wsRef.current)
          }
          return
        }

        if (msg.type === 'telemetry') {
          if (mountedRef.current) setTelemetry(msg.data)

        } else if (msg.type === 'webrtc_answer') {
          // Strictly ignore SDP answers meant for other admin instances / tabs
          if (msg.target_admin_id && msg.target_admin_id !== adminIdRef.current) {
            return
          }
          if (mountedRef.current) setStatus('negotiating')
          console.debug('[AdminWebRTC] Received answer — applying remote description')
          if (pcRef.current && pcRef.current.signalingState !== 'stable') {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          }
          
          // Flush any pending ICE candidates received before the remote description was set
          const queued = pendingIceCandidatesRef.current || []
          pendingIceCandidatesRef.current = []
          for (const cand of queued) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(cand)) } catch (_) {}
          }
          
          // Try extracting tracks from receivers after applying remote description
          updateRemoteStreamFromReceivers()

        } else if (msg.type === 'webrtc_ice_candidate') {
          // Strictly ignore ICE candidates meant for other admin instances / tabs
          if (msg.target_admin_id && msg.target_admin_id !== adminIdRef.current) {
            return
          }
          if (pcRef.current && pcRef.current.remoteDescription && pcRef.current.remoteDescription.type) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)) } catch (_) {}
          } else {
            // Remote description not set yet, queue the candidate
            pendingIceCandidatesRef.current.push(msg.candidate)
          }

        } else if (msg.type === 'candidate_disconnected') {
          if (mountedRef.current) setStatus('disconnected')
        }

        if (msg.type === 'webrtc_answer') {
          // Require exact viewer and offer identifiers for current attempt
          if (!msg.viewer_id || msg.viewer_id !== viewerIdRef.current) return
          if (!msg.offer_id || msg.offer_id !== offerIdRef.current) return

          const pc = pcRef.current
          if (!pc) return
          if (pc.signalingState === 'stable') {
            console.warn('[AdminWebRTC] Got answer but already stable — ignoring')
            return
          }
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            if (connectionIdRef.current !== connectionId || wsRef.current !== ws || offerIdRef.current !== msg.offer_id) {
              console.warn('[AdminWebRTC] Stale answer after await, ignoring')
              return
            }
            console.log('[AdminWebRTC] Remote description set. Draining ICE queue:', iceCandidateQueue.current.length)
            // Drain any ICE candidates that arrived before the answer
            for (const candidate of iceCandidateQueue.current) {
              if (connectionIdRef.current !== connectionId || wsRef.current !== ws || offerIdRef.current !== msg.offer_id) {
                break
              }
              try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch (_) {}
            }
            iceCandidateQueue.current = []
          } catch (err) {
            console.error('[AdminWebRTC] setRemoteDescription failed:', err)
          }
          return
        }

        if (msg.type === 'webrtc_ice_candidate') {
          // Require exact viewer and offer identifiers for current attempt
          if (!msg.viewer_id || msg.viewer_id !== viewerIdRef.current) return
          if (!msg.offer_id || msg.offer_id !== offerIdRef.current) return

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
      if (connectionIdRef.current !== connectionId || wsRef.current !== ws) return
      console.error('[AdminWebRTC] WS error:', e)
      wsReadyRef.current = false
      if (mountedRef.current) setStatus('error')
    }

    ws.onclose = (e) => {
      console.log(`[AdminWebRTC] WS closed (${e.code})`)
      clearInterval(heartbeatTimerRef.current)
      if (mountedRef.current) {
        if (sessionId && sessionId !== 'undefined') {
          // Auto-reconnect on drop with exponential backoff
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000)
          console.log(`[AdminWebRTC] Auto-reconnecting in ${delay}ms...`)
          setTimeout(() => {
            if (mountedRef.current) {
              setRetryCount(c => c + 1)
            }
          }, delay)
        } else {
          setStatus('disconnected')
        }
      }
    }

    // Auto-recover stream when admin switches back to the tab/window
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mountedRef.current) {
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          console.log('[AdminWebRTC] Tab focused: socket closed. Reconnecting...')
          setRetryCount(c => c + 1)
        } else if (statusRef.current !== 'streaming') {
          console.log('[AdminWebRTC] Tab focused: stream inactive. Retrying offer...')
          if (sendOfferRef.current && wsRef.current) {
            sendOfferRef.current(wsRef.current)
          }
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      mountedRef.current = false
      cleanup()
    }
  }, [isOpen, session, token, retryCount])  // retryCount forces full reconnect

  const handleManualRetry = () => {
    offerAttemptsRef.current = 0
    cleanup()
    setStatus('connecting')
    setRetryCount(c => c + 1)
  }

  const videoTracks = remoteStream?.getVideoTracks() || []
  const hasCameraTrack = trackAvailability.camera
  const hasScreenTrack = trackAvailability.screen

  useEffect(() => {
    if (!remoteStream) {
      setTrackAvailability({ camera: false, screen: false })
      return
    }

    const cameraFound = videoTracks.some(track => getTrackType(track) === 'camera') || videoTracks.length >= 1
    const screenFound = videoTracks.some(track => getTrackType(track) === 'screen') || videoTracks.length >= 2
    setTrackAvailability({ camera: cameraFound, screen: screenFound })
  }, [remoteStream, videoTracks.length])

  useEffect(() => {
    if (!videoRef.current) return
    if (!remoteStream) {
      videoRef.current.srcObject = null
      return
    }
    const stream = buildRemoteViewStream(remoteStream, viewMode)
    videoRef.current.srcObject = stream
    videoRef.current.muted = true
    videoRef.current.play().catch(() => {
      // Autoplay may be blocked, but the video source is attached.
    })
  }, [remoteStream, viewMode])

  useEffect(() => {
    if (!isOpen) return
    const interval = setInterval(() => {
      if (!remoteStream) updateRemoteStreamFromReceivers()
    }, 2500)
    return () => clearInterval(interval)
  }, [isOpen, remoteStream, updateRemoteStreamFromReceivers])

  useEffect(() => {
    if (isOpen && session) {
      setViewMode('screen')
    }
  }, [isOpen, session])

  useEffect(() => {
    if (viewMode === 'camera' && !hasCameraTrack) {
      setViewMode('screen')
    }
  }, [viewMode, hasCameraTrack])

  const getRoundIcon = (type) => {
    if (type === 'coding') return <Code size={16} />
    if (type === 'case_study') return <Briefcase size={16} />
    return <MessageSquare size={16} />
  }

  const candidateName = (typeof session === 'object' && session?.candidate_name) ? session.candidate_name : 'Live Candidate'
  const candidateEmail = (typeof session === 'object' && session?.candidate_email) ? session.candidate_email : 'Active Stream'
  const displaySessionId = (typeof session === 'object' && (session?.session_id || session?.link_id)) ? (session.session_id || session.link_id) : (typeof session === 'string' ? session : 'N/A')

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${status === 'streaming' ? 'bg-success animate-pulse' : 'bg-amber-500'}`} />
          Live Stream: <span className="font-bold">{candidateName}</span>
          {spectatorCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              <Users size={12} />
              {spectatorCount} Spectator{spectatorCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      }
      subtitle={`Email: ${candidateEmail} | Session: ${displaySessionId}`}
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-4 text-slate-800 bg-white">

        {/* Action bar: Refresh & Share Spectator Link */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <RefreshCw size={13} className={status === 'connecting' || status === 'negotiating' ? 'animate-spin' : ''} />
              Refresh Stream
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!shareLink ? (
              <button
                type="button"
                onClick={handleGenerateShareLink}
                disabled={generatingLink}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors shadow-sm disabled:opacity-50"
              >
                <Share2 size={13} />
                {generatingLink ? 'Generating...' : 'Share Spectator Link'}
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={shareLink}
                  className="text-xs text-slate-600 bg-white border border-slate-300 rounded px-2.5 py-1 w-56 truncate outline-none select-all"
                  onFocus={e => e.target.select()}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors shadow-sm ${
                    copied
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                  title="Copy Link"
                >
                  {copied ? (
                    <>
                      <CheckCircle2 size={13} className="text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      Copy
                    </>
                  )}
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
              <ShieldAlert size={16} className={(telemetry?.proctoring_alerts || violations.length) > 0 ? "text-rose-500" : "text-emerald-500"} />
              <span className={(telemetry?.proctoring_alerts || violations.length) > 0 ? "text-rose-600" : "text-emerald-600"}>
                {Math.max(telemetry?.proctoring_alerts || 0, violations.length)} Alerts
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <div className="font-semibold text-slate-700 uppercase tracking-wide">Stream View</div>
            <div>{viewMode === 'camera' ? 'Candidate Camera' : 'Screen Share'}</div>
          </div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('screen')}
              disabled={!hasScreenTrack}
              className={`px-3 py-1 text-xs font-semibold transition ${viewMode === 'screen' ? 'bg-white text-slate-900' : 'text-slate-500 hover:bg-slate-100'} ${!hasScreenTrack ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Monitor size={14} />
              <span className="ml-1">Screen</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              disabled={!hasCameraTrack}
              className={`px-3 py-1 text-xs font-semibold transition ${viewMode === 'camera' ? 'bg-white text-slate-900' : 'text-slate-500 hover:bg-slate-100'} ${!hasCameraTrack ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Camera size={14} />
              <span className="ml-1">Camera</span>
            </button>
          </div>
        </div>

        {remoteStream && !hasCameraTrack && viewMode === 'camera' && (
          <div className="text-xs text-amber-600">Camera feed not detected. Showing available stream data where possible.</div>
        )}

        {!remoteStream && (
          <div className="text-xs text-slate-500">Waiting for the candidate stream to arrive...</div>
        )}

        {/* Video Player Area */}
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">

          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            className={`w-full h-full object-contain ${remoteStream ? 'opacity-100' : 'opacity-0'}`}
          />

          {!remoteStream && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/90 z-10">
              {status === 'connecting' || status === 'negotiating' ? (
                <div className="flex flex-col items-center gap-3">
                  <Activity size={40} className="animate-pulse text-indigo-500" />
                  <p className="text-sm font-semibold tracking-wide">
                    {status === 'connecting' ? 'Connecting to Candidate Stream...' : 'Negotiating WebRTC connection...'}
                  </p>
                  <p className="text-xs text-slate-500">Candidate must be on the interview page for this to connect</p>
                  <button
                    onClick={handleManualRetry}
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
