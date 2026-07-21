import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function useCandidateWebRTC(linkId, mediaStreamRef, telemetryData, monitoringToken) {
  const wsRef = useRef(null)
  const pcsRef = useRef({}) // Admin session ID -> RTCPeerConnection (Map if multiple admins view)
  const latestTelemetryRef = useRef(telemetryData)

  useEffect(() => {
    latestTelemetryRef.current = telemetryData
  }, [telemetryData])

  // Initialize Signaling WebSocket
  useEffect(() => {
    if (!linkId || !monitoringToken) return

    const wsUrl = API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') +
      `/ws/webrtc/candidate/${linkId}?token=${encodeURIComponent(monitoringToken)}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Candidate WebRTC signaling connected.')
    }

    ws.onerror = (e) => {
      console.error('Candidate WebRTC WS Error:', e)
    }

    ws.onclose = (e) => {
      console.log(`Candidate WebRTC WS Closed: ${e.code} ${e.reason}`)
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)
        
        // Use an admin ID if they send one, otherwise default to "admin"
        const adminId = msg.admin_id || "admin"

        if (msg.type === 'webrtc_offer') {
          console.log(`[WebRTC Candidate] Received offer from admin: ${adminId}`)
          if (!mediaStreamRef.current) {
            console.warn('[WebRTC Candidate] No mediaStreamRef.current yet! Cannot answer offer.')
            return
          }

          // Close existing if any
          if (pcsRef.current[adminId]) {
            pcsRef.current[adminId].close()
          }

          // Create new Peer Connection for this admin request
          const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          })
          pcsRef.current[adminId] = pc

          // Add all active tracks (camera and mic)
          mediaStreamRef.current.getTracks().forEach(track => {
            console.log(`[WebRTC Candidate] Adding track: ${track.kind}`)
            pc.addTrack(track, mediaStreamRef.current)
          })

          pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
              console.log(`[WebRTC Candidate] Sending ICE candidate to admin: ${adminId}`)
              wsRef.current.send(JSON.stringify({ 
                type: 'webrtc_ice_candidate', 
                candidate: e.candidate,
                target_admin_id: adminId
              }))
            }
          }

          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          console.log(`[WebRTC Candidate] Sending answer to admin: ${adminId}`)
          wsRef.current.send(JSON.stringify({
            type: 'webrtc_answer',
            sdp: pc.localDescription,
            target_admin_id: adminId
          }))

        } else if (msg.type === 'webrtc_ice_candidate') {
          console.log(`[WebRTC Candidate] Received ICE candidate from admin: ${adminId}`)
          const pc = pcsRef.current[adminId]
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
          }
        }
      } catch (err) {
        console.error('Candidate WebRTC Error:', err)
      }
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      Object.values(pcsRef.current).forEach(pc => pc.close())
    }
  }, [linkId, mediaStreamRef, monitoringToken])

  // Send Telemetry Updates periodically to keep candidate marked as 'online'
  useEffect(() => {
    if (!linkId || !monitoringToken) return

    let audioContext = null
    let analyser = null
    let audioData = null
    let measuredStream = null

    const measureAudioLevel = () => {
      const stream = mediaStreamRef.current
      if (!stream?.getAudioTracks().some(track => track.readyState === 'live')) return 0
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
        let sumSquares = 0
        for (const sample of audioData) {
          const normalized = (sample - 128) / 128
          sumSquares += normalized * normalized
        }
        const rms = Math.sqrt(sumSquares / audioData.length)
        return Math.min(100, Math.round(rms * 300))
      } catch {
        return 0
      }
    }

    const sendTelemetry = () => {
      const currentTelemetry = latestTelemetryRef.current
      if (wsRef.current?.readyState === WebSocket.OPEN && currentTelemetry) {
        wsRef.current.send(JSON.stringify({
          type: 'telemetry',
          data: {
            ...currentTelemetry,
            audio_level: measureAudioLevel(),
          }
        }))
      }
    }

    // Send immediately when data changes
    sendTelemetry()

    // Send every 5 seconds to maintain heartbeat
    const intervalId = setInterval(sendTelemetry, 5000)

    return () => {
      clearInterval(intervalId)
      audioContext?.close().catch(() => {})
    }
  }, [linkId, mediaStreamRef, monitoringToken])

  return wsRef
}
