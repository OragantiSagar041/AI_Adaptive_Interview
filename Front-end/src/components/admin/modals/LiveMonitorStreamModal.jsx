import React, { useState, useEffect, useRef } from 'react'
import { API_BASE_URL } from '../../../apiConfig'
import Modal from '../../Modal'
import { useSelector } from 'react-redux'
import { Video, Mic, MicOff, MonitorOff, Activity, ShieldAlert, Code, MessageSquare, Briefcase } from 'lucide-react'

export default function LiveMonitorStreamModal({ isOpen, onClose, session }) {
  const [status, setStatus] = useState('connecting')
  const [telemetry, setTelemetry] = useState(null)
  const videoRef = useRef(null)
  const wsRef = useRef(null)
  const pcRef = useRef(null)
  const token = useSelector(state => state.auth.token)

  useEffect(() => {
    if (!isOpen || !session) return

    const sessionId = session.link_id || session.session_id || session.id
    const wsUrl = API_BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') + `/ws/webrtc/admin/${sessionId}?token=${token}`
    console.log('Connecting Admin WebRTC to:', wsUrl)
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = async () => {
      setStatus('connected')
      
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        })
        pcRef.current = pc

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'webrtc_ice_candidate', candidate: e.candidate }))
          }
        }

        pc.ontrack = (e) => {
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0]
            setStatus('streaming')
          }
        }

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            setStatus('disconnected')
          }
        }

        // We only want to receive media
        pc.addTransceiver('video', { direction: 'recvonly' })
        pc.addTransceiver('audio', { direction: 'recvonly' })

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        ws.send(JSON.stringify({ type: 'webrtc_offer', sdp: offer }))

      } catch (err) {
        console.error('Admin WebRTC setup error:', err)
      }
    }

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'telemetry') {
          setTelemetry(msg.data)
        } else if (msg.type === 'webrtc_answer') {
          setStatus('negotiating')
          if (pcRef.current) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp))
          }
        } else if (msg.type === 'webrtc_ice_candidate') {
          if (pcRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate))
          }
        } else if (msg.type === 'candidate_disconnected') {
          setStatus('disconnected')
        }
      } catch (err) {
        console.error('WebRTC Admin Error:', err)
      }
    }

    ws.onerror = (e) => {
      console.error('WebRTC Admin WS Error:', e)
      setStatus('error')
    }
    ws.onclose = (e) => {
      console.log(`WebRTC Admin WS Closed: ${e.code} ${e.reason}`)
      setStatus('disconnected')
    }

    return () => {
      if (pcRef.current) pcRef.current.close()
      if (wsRef.current) wsRef.current.close()
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [isOpen, session, token])

  const getRoundIcon = (type) => {
    if (type === 'coding') return <Code size={16} />
    if (type === 'case_study') return <Briefcase size={16} />
    return <MessageSquare size={16} />
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${status === 'streaming' ? 'bg-success animate-pulse' : 'bg-amber-500'}`} />
          Live Stream: <span className="font-bold">{session?.candidate_name}</span>
        </div>
      }
      subtitle={`Email: ${session?.candidate_email} | Session: ${session?.session_id}`}
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-4 text-slate-800 bg-white">
        
        {/* Top Telemetry Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-col justify-center">
            <span className="text-[0.65rem] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</span>
            <div className="flex items-center gap-1.5 font-bold text-sm">
              {status === 'streaming' ? <span className="text-emerald-600">LIVE</span> : 
               status === 'connecting' ? <span className="text-amber-500">Connecting...</span> : 
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
              <ShieldAlert size={16} className={telemetry?.proctoring_alerts > 0 ? "text-rose-500" : "text-emerald-500"} />
              <span className={telemetry?.proctoring_alerts > 0 ? "text-rose-600" : "text-emerald-600"}>
                {telemetry?.proctoring_alerts || 0} Alerts
              </span>
            </div>
          </div>
        </div>

        {/* Video Player Area */}
        <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden border border-slate-200 shadow-inner flex items-center justify-center">
          
          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            className={`w-full h-full object-contain ${status === 'streaming' ? 'opacity-100' : 'opacity-0'}`}
          />

          {status !== 'streaming' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-900/90 z-10">
              {status === 'connecting' || status === 'negotiating' ? (
                <div className="flex flex-col items-center gap-3">
                  <Activity size={40} className="animate-pulse text-indigo-500" />
                  <p className="text-sm font-semibold tracking-wide">Connecting to Candidate's Stream...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <MonitorOff size={40} className="text-rose-500" />
                  <p className="text-sm font-semibold tracking-wide text-rose-400">Stream Disconnected or Offline</p>
                </div>
              )}
            </div>
          )}

          {/* Telemetry Overlay */}
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
      </div>
    </Modal>
  )
}
