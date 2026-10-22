import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '../apiConfig'
import { getIceServers, initIceServers } from '../utils/webrtcConfig'

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

  // Broadcast streams update when camera or screen stream becomes ready so watching admins renegotiate
  useEffect(() => {
    let lastTrackKey = ''
    const notifyAdminsIfReady = () => {
      const hasCam = mediaStreamRef.current?.getVideoTracks()?.some(t => t.readyState === 'live')
      const hasScr = secondaryMediaStreamRef?.current?.getVideoTracks()?.some(t => t.readyState === 'live')
      const trackKey = `${Boolean(hasCam)}_${Boolean(hasScr)}`

      if ((hasCam || hasScr) && trackKey !== lastTrackKey) {
        lastTrackKey = trackKey
        console.log(`[CandidateWebRTC] Live video tracks confirmed (cam: ${Boolean(hasCam)}, scr: ${Boolean(hasScr)}) — notifying watching admins`)
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          try {
            wsRef.current.send(JSON.stringify({ type: 'candidate_connected' }))
          } catch (_) {}
        }
      } else if (!hasCam && !hasScr) {
        lastTrackKey = ''
      }
    }

    notifyAdminsIfReady()
    const pollId = setInterval(notifyAdminsIfReady, 2500)
    return () => clearInterval(pollId)
  }, [])

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

            ;(async () => {
            // Await dynamic ICE servers from backend — ensures TURN credentials are fetched
            // before RTCPeerConnection is created
            await initIceServers()

            // Wait up to 3 seconds if tracks are in the process of initializing
            let cameraStream = mediaStreamRef.current
            let screenStream = secondaryMediaStreamRef?.current
            let cameraVideoTrack = cameraStream?.getVideoTracks()?.find(t => t.readyState === 'live')
            let screenVideoTrack = screenStream?.getVideoTracks()?.find(t => t.readyState === 'live')

            if (!cameraVideoTrack && !screenVideoTrack) {
              console.log('[CandidateWebRTC] Waiting for camera/screen tracks to become live...')
              for (let i = 0; i < 10; i++) {
                await new Promise(r => setTimeout(r, 300))
                cameraStream = mediaStreamRef.current
                screenStream = secondaryMediaStreamRef?.current
                cameraVideoTrack = cameraStream?.getVideoTracks()?.find(t => t.readyState === 'live')
                screenVideoTrack = screenStream?.getVideoTracks()?.find(t => t.readyState === 'live')
                if (cameraVideoTrack || screenVideoTrack) break
              }
            }

            const audioTrack = (screenStream?.getAudioTracks()?.find(t => t.readyState === 'live')) ||
                               (cameraStream?.getAudioTracks()?.find(t => t.readyState === 'live'))

            if (!cameraVideoTrack && !screenVideoTrack) {
              console.warn('[CandidateWebRTC] No live video tracks available after waiting — sending notice.')
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'candidate_not_ready',
                  target_admin_id: adminId,
                  viewer_id: adminId,
                  spectator_id: adminId,
                  reason: 'tracks_initializing'
                }))
              }
              return
            }

            // Close any stale peer connection for this admin
            if (pcsRef.current[adminId]) {
              try { pcsRef.current[adminId].close() } catch (_) {}
            }

            const pc = new RTCPeerConnection({
              iceServers: getIceServers(),
            })
            console.log('[CandidateWebRTC] RTCPeerConnection created with', getIceServers().length, 'ICE servers')
            pcsRef.current[adminId] = pc

            const streamTier = msg.stream_tier || (adminId.startsWith('grid_') ? 'low' : 'high')
            const isLowTier = streamTier === 'low'
            console.log(`[CandidateWebRTC] Negotiating peer connection with tier: ${streamTier.toUpperCase()} for viewer: ${adminId}`)

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
              if (pc.connectionState === 'connected') {
                try {
                  const trans = pc.getTransceivers()
                  trans.forEach(t => {
                    if (t.sender && typeof t.sender.generateKeyFrame === 'function') {
                      t.sender.generateKeyFrame().catch(() => {})
                    }
                  })
                } catch (_) {}
              }
            }

            // 1. Set Remote Description FIRST (JSEP RFC 8829 Answerer Protocol)
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))

            // 2. Map candidate tracks directly to incoming transceivers from the offer
            const transceivers = pc.getTransceivers()
            const videoTransceivers = transceivers.filter(t => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video')
            const audioTransceivers = transceivers.filter(t => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio')

            let cameraSender = null
            let screenSender = null

            // Slot 0 (Video): Camera track (or screen if only screen is active)
            if (videoTransceivers.length > 0) {
              const camTransceiver = videoTransceivers[0]
              if (cameraVideoTrack) {
                console.log(`[CandidateWebRTC] Attaching camera track (${isLowTier ? '360p Low Tier' : '720p High Tier'}) to transceiver 0`)
                await camTransceiver.sender.replaceTrack(cameraVideoTrack)
                camTransceiver.direction = 'sendonly'
                cameraSender = camTransceiver.sender
              } else if (screenVideoTrack) {
                console.log('[CandidateWebRTC] Attaching screen track to transceiver 0 (fallback)')
                await camTransceiver.sender.replaceTrack(screenVideoTrack)
                camTransceiver.direction = 'sendonly'
                screenSender = camTransceiver.sender
              } else {
                camTransceiver.direction = 'inactive'
              }
            } else if (cameraVideoTrack) {
              cameraSender = pc.addTrack(cameraVideoTrack, cameraStream || new MediaStream([cameraVideoTrack]))
            }

            // Slot 1 (Video): Screen track (High tier only)
            if (videoTransceivers.length > 1) {
              const scrTransceiver = videoTransceivers[1]
              if (!isLowTier && screenVideoTrack && screenVideoTrack !== cameraVideoTrack) {
                console.log('[CandidateWebRTC] Attaching screen track to transceiver 1 (High Tier)')
                await scrTransceiver.sender.replaceTrack(screenVideoTrack)
                scrTransceiver.direction = 'sendonly'
                screenSender = scrTransceiver.sender
              } else {
                scrTransceiver.direction = 'inactive'
              }
            } else if (!isLowTier && screenVideoTrack && !screenSender) {
              screenSender = pc.addTrack(screenVideoTrack, screenStream || new MediaStream([screenVideoTrack]))
            }

            // Slot 2 (Audio): Microphone / Mixed Audio track
            if (audioTransceivers.length > 0) {
              const audTransceiver = audioTransceivers[0]
              if (!isLowTier && audioTrack) {
                console.log('[CandidateWebRTC] Attaching audio track to transceiver (High Tier)')
                await audTransceiver.sender.replaceTrack(audioTrack)
                audTransceiver.direction = 'sendonly'
              } else {
                audTransceiver.direction = 'inactive'
              }
            } else if (!isLowTier && audioTrack) {
              pc.addTrack(audioTrack, new MediaStream([audioTrack]))
            }

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

            // Safely apply encoding parameters after descriptions are set
            if (cameraSender) {
              try {
                const params = cameraSender.getParameters()
                if (!params.encodings || params.encodings.length === 0) {
                  params.encodings = [{}]
                }
                if (isLowTier) {
                  params.encodings[0].scaleResolutionDownBy = 2.0
                  params.encodings[0].maxFramerate = 15
                  params.encodings[0].maxBitrate = 200000
                } else {
                  params.encodings[0].scaleResolutionDownBy = 1.0
                  params.encodings[0].maxFramerate = 24
                  params.encodings[0].maxBitrate = 900000
                }
                await cameraSender.setParameters(params)
                console.log(`[CandidateWebRTC] Successfully set ${streamTier.toUpperCase()} tier encoding parameters on camera sender.`)
              } catch (paramErr) {
                console.warn('[CandidateWebRTC] Could not set camera encoding parameters:', paramErr)
              }
            }

            if (screenSender) {
              try {
                const sParams = screenSender.getParameters()
                if (!sParams.encodings || sParams.encodings.length === 0) {
                  sParams.encodings = [{}]
                }
                sParams.encodings[0].maxFramerate = 15
                sParams.encodings[0].maxBitrate = 1200000
                await screenSender.setParameters(sParams)
                console.log('[CandidateWebRTC] Successfully set screen encoding parameters.')
              } catch (sErr) {
                console.warn('[CandidateWebRTC] Could not set screen encoding parameters:', sErr)
              }
            }

            console.log(`[CandidateWebRTC] Sending answer to viewer: ${adminId}`)
            ws.send(JSON.stringify({
              type: 'webrtc_answer',
              sdp: pc.localDescription,
              target_admin_id: adminId,
              viewer_id: adminId,
              spectator_id: adminId,
              offer_id: msg.offer_id,
            }))

            })()

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

    const sendTelemetry = async () => {
      const current = latestTelemetryRef.current
      if (!current) return

      const payload = { ...current, audio_level: measureAudioLevel() }

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'telemetry',
          data: payload,
        }))
      } else {
        // Fallback to HTTP if WebRTC signaling socket is blocked or reconnecting
        try {
          const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL
          await fetch(`${baseUrl}/api/webrtc/telemetry/${linkId}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${monitoringToken}`
            },
            body: JSON.stringify(payload)
          })
        } catch (err) {
          // Silent catch for telemetry
        }
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
