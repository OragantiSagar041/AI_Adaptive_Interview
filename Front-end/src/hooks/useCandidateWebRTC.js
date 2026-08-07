import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '../apiConfig'
import { getIceServers } from '../utils/webrtcConfig'

/**
 * Custom hook to handle WebRTC connections (WebSockets + WebRTC API) 
 * for the candidate to broadcast their stream to admins/spectators.
 *
 * @param {string} linkId - The interview session ID
 * @param {object} mediaStreamRef - React ref containing the candidate's MediaStream
 * @param {object} telemetryData - React state object containing latest metrics (Q number, round type, etc.)
 * @param {string} monitoringToken - The JWT token used for WebSocket auth
 * @returns {object} The WebSocket reference
 */
export default function useCandidateWebRTC(linkId, mediaStreamRef, telemetryData, monitoringToken) {
  const wsRef = useRef(null)
  const pcsRef = useRef({})                 // viewerId → RTCPeerConnection
  const iceQueuesRef = useRef({})           // viewerId → pending ICE candidates (before remote desc)
  const pendingOffersRef = useRef([])       // offers queued before media stream was ready
  const latestTelemetryRef = useRef(telemetryData)
  const reconnectTimerRef = useRef(null)
  const reconnectDelayRef = useRef(2000)    // starts at 2 s, doubles up to 30 s
  const destroyedRef = useRef(false)        // set true on hook unmount → stop reconnecting
  const heartbeatTimerRef = useRef(null)

  // Keep telemetry data ref fresh without re-triggering the main effect
  useEffect(() => {
    latestTelemetryRef.current = telemetryData
  }, [telemetryData])

  // ─── Process Pending Offers when Stream becomes Available ──────────────────
  useEffect(() => {
    if (!mediaStreamRef.current || pendingOffersRef.current.length === 0 || !wsRef.current) return
    if (wsRef.current.readyState !== WebSocket.OPEN) return

    const processOffers = async () => {
      const offers = [...pendingOffersRef.current]
      pendingOffersRef.current = [] // clear queue
      for (const msg of offers) {
        try {
          await handleOffer(msg)
        } catch (err) {
          console.error('[CandidateWebRTC] Error processing queued offer:', err)
        }
      }
    }
    processOffers()
  }, [mediaStreamRef.current]) // trigger when mediaStream changes

  const handleOffer = async (msg) => {
    const adminId = msg.viewer_id || msg.admin_id || msg.spectator_id || 'admin'
    console.log(`[CandidateWebRTC] Processing offer from viewer: ${adminId}`)

    const stream = mediaStreamRef.current
    if (!stream) {
      console.warn(`[CandidateWebRTC] Still no media stream — re-queueing offer from ${adminId}`)
      pendingOffersRef.current.push(msg)
      return
    }

    // Close any stale peer connection for this viewer
    if (pcsRef.current[adminId]) {
      try { pcsRef.current[adminId].close() } catch (_) {}
    }
    
    // Reset ICE queue for this viewer
    iceQueuesRef.current[adminId] = []

    const pc = new RTCPeerConnection({
      iceServers: getIceServers(),
    })
    pcsRef.current[adminId] = pc

    // Add all live tracks to the peer connection
    stream.getTracks().forEach(track => {
      console.log(`[CandidateWebRTC] Adding track to ${adminId}: ${track.kind}`)
      pc.addTrack(track, stream)
    })

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'webrtc_ice_candidate',
          candidate: e.candidate,
          target_admin_id: msg.admin_id || 'admin',
          viewer_id: adminId,
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`[CandidateWebRTC] PC state [${adminId}]: ${pc.connectionState}`)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    console.log(`[CandidateWebRTC] Sending answer to viewer: ${adminId}`)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'webrtc_answer',
        sdp: pc.localDescription,
        target_admin_id: msg.admin_id || 'admin',
        viewer_id: adminId,
      }))
    }
    
    // Drain ICE queue that arrived while we were processing the offer
    const queue = iceQueuesRef.current[adminId] || []
    for (const candidate of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) } catch (_) {}
    }
    iceQueuesRef.current[adminId] = []
  }

  // ─── Main WebSocket Connection Logic ────────────────────────────────────────
  useEffect(() => {
    if (!linkId || !monitoringToken) return
    destroyedRef.current = false

    const connect = () => {
      if (destroyedRef.current) return

      const wsUrl =
        API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') +
        `/ws/webrtc/candidate/${linkId}?token=${monitoringToken}`

      console.log('[CandidateWebRTC] Connecting to signaling server...')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[CandidateWebRTC] WS Connected')
        reconnectDelayRef.current = 2000 // reset delay on success
      }

      ws.onclose = () => {
        console.warn('[CandidateWebRTC] WS Disconnected')
        if (!destroyedRef.current) {
          const delay = reconnectDelayRef.current
          console.log(`[CandidateWebRTC] Reconnecting in ${delay}ms...`)
          reconnectTimerRef.current = setTimeout(connect, delay)
          reconnectDelayRef.current = Math.min(delay * 1.5, 30000)
        }
      }

      ws.onerror = (err) => {
        console.error('[CandidateWebRTC] WS Error', err)
      }

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data)
          const adminId = msg.viewer_id || msg.admin_id || msg.spectator_id || 'admin'

          if (msg.type === 'pong' || msg.type === 'ping') return

          if (msg.type === 'webrtc_offer') {
            const stream = mediaStreamRef.current
            if (!stream) {
              console.warn(`[CandidateWebRTC] No media stream yet. Queueing offer from ${adminId}`)
              pendingOffersRef.current.push(msg)
              return
            }
            await handleOffer(msg)
          } else if (msg.type === 'webrtc_ice_candidate') {
            const pc = pcsRef.current[adminId]
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
            } else {
              if (!iceQueuesRef.current[adminId]) iceQueuesRef.current[adminId] = []
              iceQueuesRef.current[adminId].push(msg.candidate)
            }
          }
        } catch (err) {
          console.error('[CandidateWebRTC] Error handling message:', err)
        }
      }
    }

    connect()

    return () => {
      destroyedRef.current = true
      clearTimeout(reconnectTimerRef.current)
      clearInterval(heartbeatTimerRef.current)
      if (wsRef.current) wsRef.current.close()
      Object.values(pcsRef.current).forEach(pc => {
        try { pc.close() } catch (_) {}
      })
    }
  }, [linkId, monitoringToken])

  // ─── Telemetry heartbeat ────────────────────────────────────────────────────
  useEffect(() => {
    if (!linkId || !monitoringToken) return

    let audioContext = null
    let analyser = null
    let audioData = null
    let measuredStream = null

    const measureAudioLevel = () => {
      const stream = mediaStreamRef.current
      if (!stream?.getAudioTracks().some(t => t.readyState === 'live')) return 0
      try {
        if (!analyser || measuredStream !== stream) {
          audioContext?.close().catch(() => {})
          audioContext = new (window.AudioContext || window.webkitAudioContext)()
          const source = audioContext.createMediaStreamSource(stream)
          analyser = audioContext.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          audioData = new Uint8Array(analyser.fftSize)
          measuredStream = stream
        }
        if (audioContext.state === 'suspended') audioContext.resume().catch(() => {})
        analyser.getByteTimeDomainData(audioData)
        let sumSq = 0
        for (const s of audioData) {
          const n = (s - 128) / 128
          sumSq += n * n
        }
        return Math.min(100, Math.round(Math.sqrt(sumSq / audioData.length) * 300))
      } catch {
        return 0
      }
    }

    const sendTelemetry = () => {
      const current = latestTelemetryRef.current
      if (wsRef.current?.readyState === WebSocket.OPEN && current) {
        wsRef.current.send(JSON.stringify({
          type: 'telemetry',
          data: { ...current, audio_level: measureAudioLevel() },
        }))
      }
    }

    sendTelemetry()
    const intervalId = setInterval(sendTelemetry, 5000)

    return () => {
      clearInterval(intervalId)
      audioContext?.close().catch(() => {})
    }
  }, [linkId, monitoringToken])

  return wsRef
}
