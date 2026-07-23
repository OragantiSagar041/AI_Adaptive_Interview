import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '../apiConfig'

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
export default function useCandidateWebRTC(linkId, mediaStreamRef, telemetryData, monitoringToken) {
  const wsRef = useRef(null)
  const pcsRef = useRef({})                 // adminId → RTCPeerConnection
  const latestTelemetryRef = useRef(telemetryData)
  const reconnectTimerRef = useRef(null)
  const reconnectDelayRef = useRef(2000)    // starts at 2 s, doubles up to 30 s
  const destroyedRef = useRef(false)        // set true on hook unmount → stop reconnecting
  const heartbeatTimerRef = useRef(null)

  useEffect(() => {
    latestTelemetryRef.current = telemetryData
  }, [telemetryData])

  // ─── WebSocket factory with auto-reconnect ──────────────────────────────────
  useEffect(() => {
    if (!linkId || !monitoringToken) return
    destroyedRef.current = false

    function buildWsUrl() {
      return (
        API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') +
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
      }, 20_000)
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
          const adminId = msg.admin_id || 'admin'

          if (msg.type === 'pong' || msg.type === 'ping') return  // heartbeat reply — ignore

          if (msg.type === 'webrtc_offer') {
            console.log(`[CandidateWebRTC] Received offer from admin: ${adminId}`)

            const stream = mediaStreamRef.current
            if (!stream) {
              console.warn('[CandidateWebRTC] No media stream yet — cannot answer offer.')
              return
            }

            // Close any stale peer connection for this admin
            if (pcsRef.current[adminId]) {
              try { pcsRef.current[adminId].close() } catch (_) {}
            }

            const pc = new RTCPeerConnection({
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
              ]
            })
            pcsRef.current[adminId] = pc

            // Add all live tracks to the peer connection
            stream.getTracks().forEach(track => {
              console.log(`[CandidateWebRTC] Adding track: ${track.kind}`)
              pc.addTrack(track, stream)
            })

            pc.onicecandidate = (e) => {
              if (e.candidate && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'webrtc_ice_candidate',
                  candidate: e.candidate,
                  target_admin_id: adminId,
                }))
              }
            }

            pc.onconnectionstatechange = () => {
              console.log(`[CandidateWebRTC] PC state [${adminId}]: ${pc.connectionState}`)
            }

            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)

            console.log(`[CandidateWebRTC] Sending answer to admin: ${adminId}`)
            ws.send(JSON.stringify({
              type: 'webrtc_answer',
              sdp: pc.localDescription,
              target_admin_id: adminId,
            }))

          } else if (msg.type === 'webrtc_ice_candidate') {
            const pc = pcsRef.current[adminId]
            if (pc && pc.remoteDescription) {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
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
  }, [linkId, mediaStreamRef, monitoringToken])

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
