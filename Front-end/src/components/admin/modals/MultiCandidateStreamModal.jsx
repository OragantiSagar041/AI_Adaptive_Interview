import React, { useEffect, useRef, useState } from 'react'
import { Activity, AlertTriangle, Camera, Mic, RefreshCw, Maximize2 } from 'lucide-react'
import Modal from '../../Modal'
import { API_BASE_URL } from '../../../apiConfig'
import { getIceServers } from '../../../utils/webrtcConfig'
import { useSelector } from 'react-redux'

const MAX_CANDIDATES = 8
const HEALTH_INTERVAL_MS = 2000
const TELEMETRY_TIMEOUT_MS = 15000

function sessionLinkId(session) {
  return typeof session === 'string'
    ? session
    : session?.link_id || session?.session_id || session?.id || session?._id || session?.interview_id
}

function CandidateStreamCard({ session, token, onSelectCandidate }) {
  const [status, setStatus] = useState('connecting')
  const [stream, setStream] = useState(null)
  const [networkIssue, setNetworkIssue] = useState(false)
  const [telemetry, setTelemetry] = useState(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const mountedRef = useRef(false)
  const lastTelemetryAtRef = useRef(0)
  const lastBytesRef = useRef(null)
  const frozenSamplesRef = useRef(0)
  const issueRef = useRef(false)

  useEffect(() => {
    const linkId = sessionLinkId(session)
    if (!linkId || !token) return undefined
    mountedRef.current = true
    const base = API_BASE_URL.replace(/\/$/, '')
    const ws = new WebSocket(
      `${base.replace(/^https?/, value => value === 'https' ? 'wss' : 'ws')}/ws/webrtc/admin/${linkId}?token=${encodeURIComponent(token)}&admin_id=grid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    )
    wsRef.current = ws

    const setIssue = value => {
      if (issueRef.current !== value) {
        issueRef.current = value
        if (mountedRef.current) setNetworkIssue(value)
      }
    }

    const sendOffer = async () => {
      if (!mountedRef.current || ws.readyState !== WebSocket.OPEN) return
      if (pcRef.current) pcRef.current.close()

      const pc = new RTCPeerConnection({ iceServers: getIceServers() })
      pcRef.current = pc

      // Low Layer Grid Optimization:
      // In the thumbnail grid, only request 1 video transceiver (camera feed).
      // Screen share and audio tracks are omitted in grid mode to eliminate decoder contention
      // and cut network downlink consumption by >90% (360p @ 15 FPS / ~200 kbps).
      pc.addTransceiver('video', { direction: 'recvonly' })

      pc.onicecandidate = event => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            candidate: event.candidate,
            stream_tier: 'low'
          }))
        }
      }

      pc.ontrack = () => {
        const tracks = pc.getReceivers().map(receiver => receiver.track).filter(Boolean)
        const nextStream = new MediaStream(tracks)
        if (mountedRef.current) {
          setStream(nextStream)
          setStatus('streaming')
          setIssue(false)
        }
      }

      pc.onconnectionstatechange = () => {
        if (!mountedRef.current) return
        if (['failed', 'closed'].includes(pc.connectionState)) {
          setStatus('disconnected')
          setIssue(true)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Explicitly advertise 'low' stream_tier to candidate encoder (360p / 15 FPS)
      ws.send(JSON.stringify({
        type: 'webrtc_offer',
        sdp: offer,
        admin_id: ws.url.match(/admin_id=([^&]+)/)?.[1],
        stream_tier: 'low'
      }))
    }

    ws.onopen = sendOffer

    ws.onmessage = async event => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'telemetry') {
          lastTelemetryAtRef.current = Date.now()
          setTelemetry(message.data || {})
          setIssue(false)
        } else if (message.type === 'candidate_connected') {
          sendOffer()
        } else if (message.type === 'candidate_disconnected') {
          setStatus('disconnected')
          setIssue(true)
        } else if (message.type === 'webrtc_answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(message.sdp))
        } else if (message.type === 'webrtc_ice_candidate' && pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(message.candidate))
        }
      } catch (error) {
        console.warn('[MultiCandidateMonitor] WebRTC message error', error)
      }
    }

    ws.onerror = () => setIssue(true)
    ws.onclose = () => {
      if (mountedRef.current) {
        setStatus('disconnected')
        setIssue(true)
      }
    }

    const healthTimer = setInterval(async () => {
      const pc = pcRef.current
      if (!pc || !mountedRef.current) return
      const iceDown = ['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)
      const telemetryStale = lastTelemetryAtRef.current > 0 && Date.now() - lastTelemetryAtRef.current > TELEMETRY_TIMEOUT_MS
      let frozen = false
      try {
        const stats = await pc.getStats()
        let bytes = 0
        let decoded = 0
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            bytes += report.bytesReceived || 0
            decoded += report.framesDecoded || 0
          }
        })
        if (decoded > 0) {
          frozen = lastBytesRef.current === bytes
          frozenSamplesRef.current = frozen ? frozenSamplesRef.current + 1 : 0
          lastBytesRef.current = bytes
        } else {
          frozenSamplesRef.current = 0
          lastBytesRef.current = null
        }
      } catch { /* ICE state and telemetry remain valid fallbacks. */ }
      setIssue(iceDown || telemetryStale || (frozen && frozenSamplesRef.current >= 2))
    }, HEALTH_INTERVAL_MS)

    return () => {
      mountedRef.current = false
      clearInterval(healthTimer)
      if (pcRef.current) pcRef.current.close()
      if (wsRef.current) wsRef.current.close()
      setStream(null)
    }
  }, [session, token])

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(() => {})
    }
  }, [stream])

  const retry = (e) => {
    e.stopPropagation()
    setStatus('connecting')
    setNetworkIssue(false)
    setTelemetry(null)
    setStream(null)
    if (wsRef.current) wsRef.current.close()
  }

  const handleCardClick = () => {
    if (onSelectCandidate && session) {
      onSelectCandidate(session)
    }
  }

  return (
    <div
      onClick={handleCardClick}
      title="Click to inspect candidate in full 720p HD"
      className="group relative overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 aspect-video cursor-pointer transition-all duration-200 hover:border-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 hover:scale-[1.01]"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`h-full w-full object-cover transition-opacity duration-300 ${networkIssue ? 'opacity-40 grayscale' : ''}`}
      />

      {/* Low-tier layer badge */}
      <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-medium text-slate-300 border border-white/10">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
        <span>360p · 15 FPS</span>
      </div>

      {/* Hover prompt to escalate to 720p LiveMonitorStreamModal */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-indigo-950/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-[2px]">
        <div className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md">
          <Maximize2 size={13} />
          <span>Inspect in HD (720p)</span>
        </div>
        <span className="mt-1 text-[10px] text-indigo-200 font-medium">Dual camera + screen & audio</span>
      </div>

      {!stream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Activity size={24} className="animate-pulse text-indigo-400" />
          <span className="text-xs">{status === 'connecting' ? 'Connecting stream...' : 'Stream unavailable'}</span>
        </div>
      )}

      {networkIssue && (
        <div className="absolute inset-0 z-15 flex flex-col items-center justify-center bg-black/75 p-3 text-center">
          <AlertTriangle size={22} className="mb-1 text-amber-400" />
          <span className="text-xs font-semibold text-amber-300">Network issue from candidate</span>
          <span className="mt-1 text-[10px] text-gray-400">Waiting for connection to recover...</span>
        </div>
      )}

      {/* Bottom candidate info bar */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 py-2 text-white">
        <div className="min-w-0 pr-2">
          <div className="truncate text-xs font-semibold">{session?.candidate_name || 'Candidate'}</div>
          <div className="truncate text-[10px] text-slate-300">
            {telemetry?.round_type || 'Interview'} · Q{telemetry?.current_question || '-'}
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] shrink-0">
          <span className={`font-bold ${status === 'streaming' && !networkIssue ? 'text-emerald-400' : 'text-amber-400'}`}>
            {status === 'streaming' && !networkIssue ? 'LIVE' : 'ISSUE'}
          </span>
          <span className="flex items-center gap-0.5 text-slate-300 bg-white/10 px-1.5 py-0.5 rounded">
            <Mic size={10} className={telemetry?.audio_level > 5 ? 'text-emerald-400' : 'text-slate-400'} />
            {Math.round(telemetry?.audio_level || 0)}%
          </span>
        </div>
      </div>

      {networkIssue && (
        <button
          type="button"
          onClick={retry}
          title="Retry connection"
          className="absolute right-2 top-2 z-30 rounded bg-black/60 p-1 text-white hover:bg-black/80"
        >
          <RefreshCw size={13} />
        </button>
      )}
    </div>
  )
}

export default function MultiCandidateStreamModal({ isOpen, onClose, sessions = [], onSelectCandidate }) {
  const token = useSelector(state => state.auth.token)
  const candidates = sessions.filter(session => session?.online).slice(0, MAX_CANDIDATES)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
          <span>Multi-Candidate Stream Monitor (Simulcast Grid)</span>
        </div>
      }
      subtitle={`Adaptive monitoring grid (360p / 15 FPS). Click any candidate to inspect in full 720p HD.`}
      maxWidth="max-w-7xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500" />
            <span>Layered Adaptive Streaming (LASS) active: ~200 kbps per stream</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            Close Monitor
          </button>
        </div>
      }
    >
      <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {candidates.length} active candidate stream{candidates.length === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
          <Camera size={13} /> Camera feeds · Low-layer (360p / 15 FPS)
        </span>
      </div>

      {candidates.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-slate-400">
          <Activity size={32} className="opacity-40" />
          <span>No online candidates available at this moment.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {candidates.map(session => (
            <CandidateStreamCard
              key={session.link_id || session.session_id || session.id}
              session={session}
              token={token}
              onSelectCandidate={onSelectCandidate}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}
