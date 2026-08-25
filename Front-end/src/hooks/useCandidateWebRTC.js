import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '../apiConfig'
import { getIceServers } from '../utils/webrtcConfig'

/**
 * useCandidateWebRTC
 *
 * Manages the candidate-side WebRTC signaling channel.
 *
 * Key fixes (v2):
 *  - Auto-reconnects the WebSocket when it drops (with exponential back-off)
 *  - Sends a "heartbeat" ping every 20 s so Render/Uvicorn won't kill the idle socket
 *  - Handles the race condition where the admin connects before the candidate's
 *    WS is fully open by flushing a queued answer once the socket re-opens
 */
export default function useCandidateWebRTC(linkId, mediaStreamRef, telemetryData, monitoringToken, secondaryMediaStreamRef = null) {
  const wsRef = useRef(null)
  const pcsRef = useRef({})                         // adminId → RTCPeerConnection
  const pendingIceCandidatesRef = useRef({})        // adminId → Array of RTCIceCandidateInit
  const latestTelemetryRef = useRef(telemetryData)
  const reconnectTimerRef = useRef(null)
  const reconnectDelayRef = useRef(2000)            // starts at 2 s, doubles up to 30 s
  const destroyedRef = useRef(false)                // set true on hook unmount → stop reconnecting
  const heartbeatTimerRef = useRef(null)

  useEffect(() => {
    latestTelemetryRef.current = telemetryData
  }, [telemetryData])

  // Broadcast streams update when screen stream changes so all watching admins renegotiate
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && secondaryMediaStreamRef?.current) {
      console.log('[CandidateWebRTC] Screen stream active/updated — notifying watching admins')
      try {
        wsRef.current.send(JSON.stringify({ type: 'candidate_connected' }))
      } catch (_) {}
    }
  }, [secondaryMediaStreamRef?.current])

  // ─── WebSocket factory with auto-reconnect ──────────────────────────────────
  useEffect(() => {
    if (!linkId || !monitoringToken) return
    destroyedRef.current = false

    function buildWsUrl() {
      const candBaseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
      return (
        candBaseUrl.replace(/^https/, 'wss').replace(/^http/, 'ws') +
        `/ws/webrtc/candidate/${linkId}?token=${encodeURIComponent(monitoringToken)}`
      )
    }

    function startHeartbeat(ws) {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          // Send a lightweight ping so the server-side idle timeout never fires
          ws.send(JSON.stringify({ type: 'ping' }))
        }
      }, 15_000)
    }

    function connect() {
      if (destroyedRef.current) return

      const ws = new WebSocket(buildWsUrl())
      wsRef.current = ws
      console.log('[CandidateWebRTC] Connecting signaling socket...')

      ws.onopen = () => {
        console.log('[CandidateWebRTC] Signaling connected.')
        reconnectDelayRef.current = 2000  // reset back-off on successful connect
        startHeartbeat(ws)
      }

      ws.onerror = (e) => {
        console.warn('[CandidateWebRTC] WS error:', e)
      }

      ws.onclose = (e) => {
        console.log(`[CandidateWebRTC] WS closed (${e.code}). Will reconnect...`)
        clearInterval(heartbeatTimerRef.current)

        // Close all peer connections — they're all dead without the signaling channel
        Object.values(pcsRef.current).forEach(pc => {
          try { pc.close() } catch (_) {}
        })
        pcsRef.current = {}
        pendingIceCandidatesRef.current = {}

        if (!destroyedRef.current) {
          const delay = reconnectDelayRef.current
          reconnectDelayRef.current = Math.min(delay * 2, 30_000)  // exponential back-off capped at 30 s
          console.log(`[CandidateWebRTC] Reconnecting in ${delay}ms...`)
          reconnectTimerRef.current = setTimeout(connect, delay)
        }
      }

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data)
          const adminId = msg.admin_id || msg.spectator_id || msg.viewer_id || 'admin'

          if (msg.type === 'pong' || msg.type === 'ping') return  // heartbeat reply — ignore

          if (msg.type === 'admin_connected') {
            console.log(`[CandidateWebRTC] Admin connected: ${adminId}`)
            return
          }

          if (msg.type === 'webrtc_offer') {
            console.log(`[CandidateWebRTC] Received offer from ${msg.role === 'spectator' ? 'spectator' : 'admin'}: ${adminId}`)

            const cameraStream = mediaStreamRef.current
            const screenStream = secondaryMediaStreamRef?.current

            const cameraVideoTrack = cameraStream?.getVideoTracks()?.find(t => t.readyState === 'live')
            const screenVideoTrack = screenStream?.getVideoTracks()?.find(t => t.readyState === 'live')
            const audioTrack = (screenStream?.getAudioTracks()?.find(t => t.readyState === 'live')) ||
                               (cameraStream?.getAudioTracks()?.find(t => t.readyState === 'live'))

            if (!cameraVideoTrack && !screenVideoTrack) {
              console.warn('[CandidateWebRTC] No live video tracks available — cannot answer offer yet.')
              return
            }

            // Close any stale peer connection for this admin
            if (pcsRef.current[adminId]) {
              try { pcsRef.current[adminId].close() } catch (_) {}
            }

            const pc = new RTCPeerConnection({
              iceServers: getIceServers(),
            })
            pcsRef.current[adminId] = pc

            // Deterministic track mapping:
            // Transceiver 0 (video) -> Camera
            // Transceiver 1 (video) -> Screen
            // Transceiver 2 (audio) -> Mic / Mixed audio
            if (cameraVideoTrack) {
              console.log('[CandidateWebRTC] Adding camera track to PC')
              pc.addTrack(cameraVideoTrack, cameraStream || new MediaStream([cameraVideoTrack]))
            }
            if (screenVideoTrack) {
              console.log('[CandidateWebRTC] Adding screen track to PC')
              pc.addTrack(screenVideoTrack, screenStream || new MediaStream([screenVideoTrack]))
            }
            if (audioTrack) {
              console.log('[CandidateWebRTC] Adding audio track to PC')
              pc.addTrack(audioTrack, new MediaStream([audioTrack]))
            }

            pc.onicecandidate = (e) => {
              if (e.candidate && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'webrtc_ice_candidate',
                  candidate: e.candidate,
                  target_admin_id: adminId,
                  viewer_id: adminId,
                  spectator_id: adminId,
                  offer_id: msg.offer_id,
                }))
              }
            }

            pc.onconnectionstatechange = () => {
              console.log(`[CandidateWebRTC] PC state [${adminId}]: ${pc.connectionState}`)
            }

            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))

            // Flush any ICE candidates queued before remoteDescription was set
            const queued = pendingIceCandidatesRef.current[adminId] || []
            delete pendingIceCandidatesRef.current[adminId]
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand))
              } catch (iceErr) {
                console.warn('[CandidateWebRTC] Error adding queued ICE candidate:', iceErr)
              }
            }

            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            console.log(`[CandidateWebRTC] Sending answer to viewer: ${adminId}`)
            ws.send(JSON.stringify({
              type: 'webrtc_answer',
              sdp: pc.localDescription,
              target_admin_id: adminId,
              viewer_id: adminId,
              spectator_id: adminId,
              offer_id: msg.offer_id,
            }))

          } else if (msg.type === 'webrtc_ice_candidate') {
            const pc = pcsRef.current[adminId]
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
              } catch (iceErr) {
                console.warn('[CandidateWebRTC] addIceCandidate error:', iceErr)
              }
            } else {
              // Queue candidate until remoteDescription is ready
              if (!pendingIceCandidatesRef.current[adminId]) {
                pendingIceCandidatesRef.current[adminId] = []
              }
              pendingIceCandidatesRef.current[adminId].push(msg.candidate)
            }

          } else if (msg.type === 'admin_disconnected') {
            const disconnectedAdminId = msg.admin_id
            if (disconnectedAdminId && pcsRef.current[disconnectedAdminId]) {
              console.log(`[CandidateWebRTC] Admin disconnected: ${disconnectedAdminId}, closing PC`)
              try { pcsRef.current[disconnectedAdminId].close() } catch (_) {}
              delete pcsRef.current[disconnectedAdminId]
              delete pendingIceCandidatesRef.current[disconnectedAdminId]
            }
          }
        } catch (err) {
          console.error('[CandidateWebRTC] Error handling message:', err)
        }
      }
    }

    connect()

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !destroyedRef.current) {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED || wsRef.current.readyState === WebSocket.CLOSING) {
          console.log('[CandidateWebRTC] Candidate tab focused: socket closed. Reconnecting immediately...')
          clearTimeout(reconnectTimerRef.current)
          connect()
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleVisibilityChange)

    return () => {
      destroyedRef.current = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleVisibilityChange)
      clearTimeout(reconnectTimerRef.current)
      clearInterval(heartbeatTimerRef.current)
      if (wsRef.current) wsRef.current.close()
      Object.values(pcsRef.current).forEach(pc => {
        try { pc.close() } catch (_) {}
      })
      pendingIceCandidatesRef.current = {}
    }
  }, [linkId, mediaStreamRef, monitoringToken, secondaryMediaStreamRef])

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
  }, [linkId, mediaStreamRef, monitoringToken])

  return wsRef
}
