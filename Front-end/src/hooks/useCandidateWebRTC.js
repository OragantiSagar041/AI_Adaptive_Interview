import { useEffect, useRef } from 'react'
import { API_BASE_URL } from '../apiConfig'

export default function useCandidateWebRTC(linkId, mediaStreamRef, telemetryData) {
  const wsRef = useRef(null)
  const pcsRef = useRef({}) // Admin session ID -> RTCPeerConnection (Map if multiple admins view)

  // Initialize Signaling WebSocket
  useEffect(() => {
    if (!linkId) return

    const wsUrl = API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') + `/ws/webrtc/candidate/${linkId}`
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
          if (!mediaStreamRef.current) return

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
            pc.addTrack(track, mediaStreamRef.current)
          })

          pc.onicecandidate = (e) => {
            if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
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

          wsRef.current.send(JSON.stringify({
            type: 'webrtc_answer',
            sdp: pc.localDescription,
            target_admin_id: adminId
          }))

        } else if (msg.type === 'webrtc_ice_candidate') {
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
  }, [linkId, mediaStreamRef])

  // Send Telemetry Updates periodically to keep candidate marked as 'online'
  useEffect(() => {
    const sendTelemetry = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN && telemetryData) {
        wsRef.current.send(JSON.stringify({
          type: 'telemetry',
          data: telemetryData
        }))
      }
    }

    // Send immediately when data changes
    sendTelemetry()

    // Send every 5 seconds to maintain heartbeat
    const intervalId = setInterval(sendTelemetry, 5000)

    return () => clearInterval(intervalId)
  }, [JSON.stringify(telemetryData)])

  return wsRef.current
}
