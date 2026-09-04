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
export default function useCandidateWebRTC(linkId, mediaStreamRef, telemetryData, monitoringToken, secondaryMediaStreamRef = null) {
  const wsRef = useRef(null)
  const pcsRef = useRef({})                         // adminId → RTCPeerConnection
  const pendingIceCandidatesRef = useRef({})        // adminId → Array of RTCIceCandidateInit
  const latestTelemetryRef = useRef(telemetryData)
  const reconnectTimerRef = useRef(null)
  const reconnectDelayRef = useRef(2000)            // starts at 2 s, doubles up to 30 s
  const destroyedRef = useRef(false)                // set true on hook unmount → stop reconnecting
  const heartbeatTimerRef = useRef(null)

  // Keep telemetry data ref fresh without re-triggering the main effect
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
          const adminId = msg.admin_id || msg.spectator_id || msg.viewer_id || 'admin'

          if (msg.type === 'pong' || msg.type === 'ping') return

          // Backend notifies candidate when an admin/viewer connects — 
          // candidate logs this so we know the signaling path is clear
          if (msg.type === 'admin_joined') {
            console.log(`[CandidateWebRTC] Admin joined the room: ${msg.admin_id}. Ready to answer offers.`)
            return
          }

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

            const streamTier = msg.stream_tier || (adminId.startsWith('grid_') ? 'low' : 'high')
            const isLowTier = streamTier === 'low'
            console.log(`[CandidateWebRTC] Negotiating peer connection with tier: ${streamTier.toUpperCase()} for viewer: ${adminId}`)

            // Deterministic track mapping:
            // High Tier: Camera + Screen + Audio
            // Low Tier: Camera only (360p/15fps) to conserve candidate upload and proctor download
            let cameraSender = null
            if (cameraVideoTrack) {
              console.log(`[CandidateWebRTC] Adding camera track (${isLowTier ? '360p/15fps Low Tier' : '720p/30fps High Tier'}) to PC`)
              cameraSender = pc.addTrack(cameraVideoTrack, cameraStream || new MediaStream([cameraVideoTrack]))
            }
            if (!isLowTier && screenVideoTrack) {
              console.log('[CandidateWebRTC] Adding screen track to PC (High Tier)')
              pc.addTrack(screenVideoTrack, screenStream || new MediaStream([screenVideoTrack]))
            }
            if (!isLowTier && audioTrack) {
              console.log('[CandidateWebRTC] Adding audio track to PC (High Tier)')
              pc.addTrack(audioTrack, new MediaStream([audioTrack]))
            }

            // Apply Layered Adaptive Stream Subscription (LASS) parameters to camera sender
            if (cameraSender) {
              try {
                const params = cameraSender.getParameters()
                if (!params.encodings || params.encodings.length === 0) {
                  params.encodings = [{}]
                }
                if (isLowTier) {
                  // Low Layer: 360p / ~15 FPS / ~220 kbps (matches SFU Simulcast low-tier spec)
                  params.encodings[0].scaleResolutionDownBy = 2.0
                  params.encodings[0].maxFramerate = 15
                  params.encodings[0].maxBitrate = 220000
                } else {
                  // High Layer: 720p / ~30 FPS / ~1.5 Mbps (matches SFU Simulcast high-tier spec)
                  params.encodings[0].scaleResolutionDownBy = 1.0
                  params.encodings[0].maxFramerate = 30
                  params.encodings[0].maxBitrate = 1500000
                }
                await cameraSender.setParameters(params)
                console.log(`[CandidateWebRTC] Successfully set ${streamTier.toUpperCase()} tier encoding parameters on camera sender.`)
              } catch (paramErr) {
                console.warn('[CandidateWebRTC] Could not set encoding parameters (browser fallback active):', paramErr)
              }
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
  }, [linkId, monitoringToken])

  return wsRef
}
