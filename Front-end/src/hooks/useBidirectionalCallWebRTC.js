import { useCallback, useEffect, useRef, useState } from 'react'
import { API_BASE_URL } from '../apiConfig'
import { getIceServers, initIceServers } from '../utils/webrtcConfig'

/**
 * useBidirectionalCallWebRTC
 *
 * Full-duplex (sendrecv) WebRTC audio + video hook for Recruiter-Led Live Calls.
 * Works symmetrically for:
 *  - role: 'admin'     (Offerer / Recruiter Cockpit)
 *  - role: 'candidate' (Answerer / Candidate Live Room)
 *
 * Also passes custom WS messages (`push_question`, `external_meeting_state`, `interview_ended`)
 * on the same authenticated WebSocket even when built-in A/V media is paused (External Call Mode).
 */
export default function useBidirectionalCallWebRTC({
  role,
  linkId,
  token,
  localStream,
  screenStream = null,
  enabled = true,
  mediaEnabled = true,
  onCustomMessage,
}) {
  const [remoteStream, setRemoteStream] = useState(null)
  const [remoteScreenStream, setRemoteScreenStream] = useState(null)
  const [hasRemoteScreen, setHasRemoteScreen] = useState(false)
  const [remoteVideoActive, setRemoteVideoActive] = useState(false)
  const [remoteAudioActive, setRemoteAudioActive] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [peerConnected, setPeerConnected] = useState(false)
  const [callStatus, setCallStatus] = useState('idle') // idle | connecting | waiting_peer | negotiating | connected | reconnecting | error
  const [iceState, setIceState] = useState('new')
  const [wsError, setWsError] = useState('')

  const wsRef = useRef(null)
  const pcsRef = useRef({}) // peerKey -> RTCPeerConnection
  const sendersRef = useRef({}) // peerKey -> { video: RTCRtpSender, audio: RTCRtpSender, screen: RTCRtpSender }
  const inboundStreamsRef = useRef({}) // peerKey -> MediaStream
  const pendingIceRef = useRef({}) // peerKey -> RTCIceCandidateInit[]
  const trackSigRef = useRef('')
  const screenSigRef = useRef('')
  const remoteStreamRef = useRef(null)
  const remoteScreenStreamRef = useRef(null)
  const adminIdRef = useRef('')
  const targetAdminIdRef = useRef('')
  const localStreamRef = useRef(localStream)
  const screenStreamRef = useRef(screenStream)
  const mediaEnabledRef = useRef(mediaEnabled)
  const peerConnectedRef = useRef(false)
  const callStatusRef = useRef('idle')
  const onCustomMessageRef = useRef(onCustomMessage)
  const destroyedRef = useRef(false)

  const reconnectTimerRef = useRef(null)
  const reconnectDelayRef = useRef(1500)
  const heartbeatTimerRef = useRef(null)
  const offerDebounceTimerRef = useRef(null)
  const requestOfferTimerRef = useRef(null)
  const retryIntervalRef = useRef(null)
  const lastOfferSentAtRef = useRef(0)
  const offerSeqRef = useRef(0)

  // Handler refs to prevent cyclic WebSocket teardown / camera fluttering
  const createAndSendOfferRef = useRef(null)
  const scheduleAdminOfferRef = useRef(null)
  const handleIncomingOfferRef = useRef(null)
  const cleanupPeerConnectionRef = useRef(null)
  const cleanupAllPeersRef = useRef(null)
  const flushIceQueueRef = useRef(null)
  const updateRemoteStreamFromReceiversRef = useRef(null)

  useEffect(() => {
    localStreamRef.current = localStream
  }, [localStream])

  useEffect(() => {
    screenStreamRef.current = screenStream
  }, [screenStream])

  useEffect(() => {
    mediaEnabledRef.current = mediaEnabled
  }, [mediaEnabled])

  useEffect(() => {
    peerConnectedRef.current = peerConnected
  }, [peerConnected])

  useEffect(() => {
    callStatusRef.current = callStatus
  }, [callStatus])

  useEffect(() => {
    onCustomMessageRef.current = onCustomMessage
  }, [onCustomMessage])

  const setPeerStatus = useCallback((val) => {
    peerConnectedRef.current = val
    setPeerConnected(val)
  }, [])

  const getActiveLocalTracks = useCallback(() => {
    if (!mediaEnabledRef.current || !localStreamRef.current) {
      return { videoTrack: null, audioTrack: null }
    }
    const videoTrack =
      localStreamRef.current.getVideoTracks().find((t) => t.readyState === 'live') || null
    const audioTrack =
      localStreamRef.current.getAudioTracks().find((t) => t.readyState === 'live') || null
    return { videoTrack, audioTrack }
  }, [])

  const updateRemoteStreamFromReceivers = useCallback((pc, peerKey) => {
    if (!pc || pc.connectionState === 'closed' || pcsRef.current[peerKey] !== pc) return

    const receiverTracks = pc
      .getReceivers()
      .map((r) => r.track)
      .filter((t) => t && t.readyState === 'live')

    const inbound = inboundStreamsRef.current[peerKey]
    const inboundTracks = inbound
      ? inbound.getTracks().filter((t) => t && t.readyState === 'live')
      : []

    const mergedMap = new Map()
    receiverTracks.forEach((t) => mergedMap.set(t.id, t))
    inboundTracks.forEach((t) => {
      if (!mergedMap.has(t.id)) mergedMap.set(t.id, t)
    })

    const liveTracks = Array.from(mergedMap.values())
    const videoTracks = liveTracks.filter((t) => t.kind === 'video')
    const audioTracks = liveTracks.filter((t) => t.kind === 'audio')

    // Attach lifecycle listeners to all incoming tracks so unmute immediately delivers frames
    liveTracks.forEach((track) => {
      if (!track._hasLifecycleHook) {
        track._hasLifecycleHook = true
        const sync = () => updateRemoteStreamFromReceiversRef.current?.(pc, peerKey)
        try {
          track.addEventListener('unmute', sync)
          track.addEventListener('mute', sync)
          track.addEventListener('ended', sync)
        } catch (_) {}
      }
    })

    const transceivers = pc.getTransceivers ? pc.getTransceivers() : []
    const videoTransceivers = transceivers.filter(
      (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
    )
    const audioTransceiver = transceivers.find(
      (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
    )

    let primaryVideo = videoTransceivers[0]?.receiver?.track || null
    let secondaryVideo = videoTransceivers.length > 1 ? videoTransceivers[1]?.receiver?.track : null
    let primaryAudio = audioTransceiver?.receiver?.track || null

    if (!primaryVideo && videoTracks.length > 0) primaryVideo = videoTracks[0]
    if (!secondaryVideo && videoTracks.length > 1) secondaryVideo = videoTracks[1]
    if (!primaryAudio && audioTracks.length > 0) primaryAudio = audioTracks[0]

    if (primaryVideo && primaryVideo.readyState !== 'live') primaryVideo = null
    if (secondaryVideo && secondaryVideo.readyState !== 'live') secondaryVideo = null
    if (primaryAudio && primaryAudio.readyState !== 'live') primaryAudio = null

    const audioLive = Boolean(primaryAudio)

    setRemoteVideoActive(Boolean(primaryVideo))
    setRemoteAudioActive(audioLive)

    if (primaryVideo || primaryAudio) {
      const sig = `${primaryVideo?.id || ''}:${primaryAudio?.id || ''}`
      if (sig !== trackSigRef.current || !remoteStreamRef.current) {
        trackSigRef.current = sig
        const newStream = new MediaStream([primaryVideo, primaryAudio].filter(Boolean))
        remoteStreamRef.current = newStream
        setRemoteStream(newStream)
      }
    } else {
      if (trackSigRef.current !== '') {
        trackSigRef.current = ''
        remoteStreamRef.current = null
        setRemoteStream(null)
      }
    }

    const isScreenActive = Boolean(secondaryVideo && secondaryVideo.readyState === 'live' && !secondaryVideo.muted)
    if (isScreenActive) {
      const screenSig = secondaryVideo.id || 'screen'
      if (screenSig !== screenSigRef.current || !remoteScreenStreamRef.current) {
        screenSigRef.current = screenSig
        const newScreenStream = new MediaStream([secondaryVideo])
        remoteScreenStreamRef.current = newScreenStream
        setRemoteScreenStream(newScreenStream)
      }
      setHasRemoteScreen(true)
    } else {
      if (screenSigRef.current !== '') {
        screenSigRef.current = ''
        remoteScreenStreamRef.current = null
        setRemoteScreenStream(null)
      }
      setHasRemoteScreen(false)
    }
  }, [])
  updateRemoteStreamFromReceiversRef.current = updateRemoteStreamFromReceivers

  const cleanupPeerConnection = useCallback((peerKey) => {
    const existingPc = pcsRef.current[peerKey]
    if (existingPc) {
      try {
        existingPc.ontrack = null
        existingPc.onicecandidate = null
        existingPc.onconnectionstatechange = null
        existingPc.oniceconnectionstatechange = null
        existingPc.close()
      } catch (_) {}
      delete pcsRef.current[peerKey]
    }
    delete sendersRef.current[peerKey]
    delete inboundStreamsRef.current[peerKey]
    delete pendingIceRef.current[peerKey]
  }, [])
  cleanupPeerConnectionRef.current = cleanupPeerConnection

  const cleanupAllPeers = useCallback(
    ({ keepPeerStatus = false } = {}) => {
      Object.keys(pcsRef.current).forEach((key) => cleanupPeerConnection(key))
      trackSigRef.current = ''
      screenSigRef.current = ''
      remoteStreamRef.current = null
      remoteScreenStreamRef.current = null
      setRemoteStream(null)
      setRemoteScreenStream(null)
      setHasRemoteScreen(false)
      setRemoteVideoActive(false)
      setRemoteAudioActive(false)
      if (!keepPeerStatus) {
        setPeerStatus(false)
      }
      setIceState('closed')
    },
    [cleanupPeerConnection, setPeerStatus]
  )
  cleanupAllPeersRef.current = cleanupAllPeers

  const attachInboundTrackHandlers = useCallback(
    (pc, peerKey) => {
      const inbound = new MediaStream()
      inboundStreamsRef.current[peerKey] = inbound

      const bindTrackLifecycle = (track) => {
        if (!track) return
        const sync = () => updateRemoteStreamFromReceivers(pc, peerKey)
        track.onunmute = sync
        track.onmute = sync
        track.onended = sync
      }

      pc.ontrack = (event) => {
        const track = event.track
        if (!track) return

        const currentInbound = inboundStreamsRef.current[peerKey] || inbound
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => {
            if (!currentInbound.getTracks().some((existing) => existing.id === t.id)) {
              currentInbound.addTrack(t)
              bindTrackLifecycle(t)
            }
          })
        }
        if (!currentInbound.getTracks().some((existing) => existing.id === track.id)) {
          currentInbound.addTrack(track)
        }
        bindTrackLifecycle(track)
        updateRemoteStreamFromReceivers(pc, peerKey)
      }
    },
    [updateRemoteStreamFromReceivers]
  )

  const flushIceQueue = useCallback(
    async (pc, peerKey) => {
      const queue = pendingIceRef.current[peerKey] || []
      delete pendingIceRef.current[peerKey]
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.warn(`[BidirectionalWebRTC:${role}] Failed queued ICE (${peerKey}):`, err)
        }
      }
    },
    [role]
  )
  flushIceQueueRef.current = flushIceQueue

  // Sync new/updated local tracks to active PeerConnections without tearing down the call
  useEffect(() => {
    if (!mediaEnabled) {
      cleanupAllPeers({ keepPeerStatus: true })
      return
    }
    const { videoTrack, audioTrack } = getActiveLocalTracks()
    const screenTrack =
      screenStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') || null
    Object.entries(sendersRef.current).forEach(async ([peerKey, pair]) => {
      const pc = pcsRef.current[peerKey]
      if (!pc || pc.connectionState === 'closed') return
      try {
        if (pair.video && pair.video.track !== videoTrack) {
          await pair.video.replaceTrack(videoTrack)
          if (videoTrack && localStreamRef.current && typeof pair.video.setStreams === 'function') {
            try { pair.video.setStreams(localStreamRef.current) } catch (_) {}
          }
        }
        if (pair.audio && pair.audio.track !== audioTrack) {
          await pair.audio.replaceTrack(audioTrack)
          if (audioTrack && localStreamRef.current && typeof pair.audio.setStreams === 'function') {
            try { pair.audio.setStreams(localStreamRef.current) } catch (_) {}
          }
        }
        if (pair.screen && pair.screen.track !== screenTrack) {
          await pair.screen.replaceTrack(screenTrack)
          if (screenTrack && screenStreamRef.current && typeof pair.screen.setStreams === 'function') {
            try { pair.screen.setStreams(screenStreamRef.current) } catch (_) {}
          }
        }
      } catch (err) {
        console.warn(`[BidirectionalWebRTC:${role}] replaceTrack warning:`, err)
      }
    })

    // If local tracks changed on an active connection, request or send fresh SDP renegotiation
    const hasActivePc = Object.values(pcsRef.current).some(
      (p) => p && (p.connectionState === 'connected' || p.connectionState === 'connecting')
    )
    if (hasActivePc && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      if (role === 'candidate') {
        try {
          wsRef.current.send(
            JSON.stringify({
              type: 'webrtc_request_offer',
              force: true,
              target_admin_id: targetAdminIdRef.current || undefined,
            })
          )
        } catch (_) {}
      } else if (role === 'admin') {
        scheduleAdminOfferRef.current?.(wsRef.current, 100, { force: true })
      }
    }
  }, [localStream, screenStream, mediaEnabled, getActiveLocalTracks, cleanupAllPeers, role])

  // Admin: Create sendrecv Offer
  const createAndSendOffer = useCallback(
    async (ws, { force = false } = {}) => {
      if (role !== 'admin' || !mediaEnabledRef.current || !ws || ws.readyState !== WebSocket.OPEN) {
        return
      }

      const peerKey = 'candidate'
      const existingPc = pcsRef.current[peerKey]
      const now = Date.now()
      const elapsed = now - lastOfferSentAtRef.current

      // If peer connection is already active and healthy, perform smooth SDP renegotiation
      if (existingPc && (existingPc.connectionState === 'connected' || existingPc.connectionState === 'connecting')) {
        if (existingPc.signalingState !== 'stable') {
          scheduleAdminOfferRef.current?.(ws, 300, { force: true })
          return
        }
        try {
          lastOfferSentAtRef.current = now
          const offer = await existingPc.createOffer()
          await existingPc.setLocalDescription(offer)
          if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'webrtc_offer',
                sdp: offer,
                admin_id: adminIdRef.current,
                renegotiation: true,
              })
            )
          }
          return
        } catch (renegErr) {
          console.warn('[BidirectionalWebRTC:admin] Renegotiation on existing connection failed, falling back to full reset:', renegErr)
        }
      }

      if (!force) {
        if (existingPc && existingPc.signalingState === 'have-local-offer' && elapsed < 5000) {
          return
        }
        if (elapsed < 1200) {
          return
        }
      }

      lastOfferSentAtRef.current = now
      const mySeq = ++offerSeqRef.current
      cleanupPeerConnection(peerKey)

      try {
        await Promise.race([
          initIceServers().catch(() => null),
          new Promise((resolve) => setTimeout(resolve, 600)),
        ])
      } catch (_) {}

      if (
        destroyedRef.current ||
        mySeq !== offerSeqRef.current ||
        wsRef.current !== ws ||
        ws.readyState !== WebSocket.OPEN
      ) {
        return
      }

      const pc = new RTCPeerConnection({ iceServers: getIceServers() })
      pcsRef.current[peerKey] = pc
      attachInboundTrackHandlers(pc, peerKey)

      pc.onicecandidate = (e) => {
        if (e.candidate && wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'webrtc_ice_candidate',
              candidate: e.candidate,
              admin_id: adminIdRef.current,
            })
          )
        }
      }

      pc.oniceconnectionstatechange = () => {
        if (pcsRef.current[peerKey] !== pc) return
        setIceState(pc.iceConnectionState)
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          updateRemoteStreamFromReceivers(pc, peerKey)
        } else if (
          pc.iceConnectionState === 'failed' &&
          ws.readyState === WebSocket.OPEN &&
          mediaEnabledRef.current
        ) {
          setCallStatus('reconnecting')
          setTimeout(() => {
            if (
              !destroyedRef.current &&
              mediaEnabledRef.current &&
              wsRef.current?.readyState === WebSocket.OPEN
            ) {
              createAndSendOffer(wsRef.current, { force: true })
            }
          }, 1200)
        }
      }

      pc.onconnectionstatechange = () => {
        if (pcsRef.current[peerKey] !== pc) return
        const st = pc.connectionState
        console.info(`[BidirectionalWebRTC:admin] connectionState -> ${st}`)
        if (st === 'connected') {
          setCallStatus('connected')
          setPeerStatus(true)
          updateRemoteStreamFromReceivers(pc, peerKey)
        } else if (st === 'connecting') {
          setCallStatus('negotiating')
        } else if (st === 'disconnected' || st === 'failed') {
          setCallStatus('reconnecting')
        } else if (st === 'closed') {
          setCallStatus(peerConnectedRef.current ? 'waiting_peer' : 'idle')
        }
      }

      try {
        const vTrans = pc.addTransceiver('video', { direction: 'sendrecv' })
        const aTrans = pc.addTransceiver('audio', { direction: 'sendrecv' })
        const sTrans = pc.addTransceiver('video', { direction: 'recvonly' })
        sendersRef.current[peerKey] = {
          video: vTrans?.sender || null,
          audio: aTrans?.sender || null,
          screen: sTrans?.sender || null,
        }

        const { videoTrack, audioTrack } = getActiveLocalTracks()
        if (vTrans?.sender && videoTrack) {
          await vTrans.sender.replaceTrack(videoTrack)
          if (localStreamRef.current && typeof vTrans.sender.setStreams === 'function') {
            try { vTrans.sender.setStreams(localStreamRef.current) } catch (_) {}
          }
        }
        if (aTrans?.sender && audioTrack) {
          await aTrans.sender.replaceTrack(audioTrack)
          if (localStreamRef.current && typeof aTrans.sender.setStreams === 'function') {
            try { aTrans.sender.setStreams(localStreamRef.current) } catch (_) {}
          }
        }

        const offer = await pc.createOffer()
        if (mySeq !== offerSeqRef.current || pc.signalingState === 'closed' || pcsRef.current[peerKey] !== pc) return
        await pc.setLocalDescription(offer)

        const latestTracks = getActiveLocalTracks()
        if (vTrans?.sender && latestTracks.videoTrack && vTrans.sender.track !== latestTracks.videoTrack) {
          await vTrans.sender.replaceTrack(latestTracks.videoTrack)
        }
        if (aTrans?.sender && latestTracks.audioTrack && aTrans.sender.track !== latestTracks.audioTrack) {
          await aTrans.sender.replaceTrack(latestTracks.audioTrack)
        }

        updateRemoteStreamFromReceivers(pc, peerKey)

        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'webrtc_offer',
              sdp: pc.localDescription || offer,
              admin_id: adminIdRef.current,
              mode: 'bidirectional',
            })
          )
          setCallStatus('negotiating')
          console.info('[BidirectionalWebRTC:admin] Sent sendrecv webrtc_offer')
        }
      } catch (err) {
        console.error('[BidirectionalWebRTC:admin] createOffer error:', err)
        setCallStatus('error')
      }
    },
    [
      role,
      cleanupPeerConnection,
      attachInboundTrackHandlers,
      getActiveLocalTracks,
      updateRemoteStreamFromReceivers,
      setPeerStatus,
    ]
  )
  createAndSendOfferRef.current = createAndSendOffer

  const scheduleAdminOffer = useCallback(
    (ws, delayMs = 150, { force = false } = {}) => {
      clearTimeout(offerDebounceTimerRef.current)
      offerDebounceTimerRef.current = setTimeout(() => {
        if (!destroyedRef.current && wsRef.current === ws && ws?.readyState === WebSocket.OPEN) {
          createAndSendOffer(ws, { force })
        }
      }, delayMs)
    },
    [createAndSendOffer]
  )
  scheduleAdminOfferRef.current = scheduleAdminOffer

  // Candidate: Handle Offer & Create sendrecv Answer
  const handleIncomingOffer = useCallback(
    async (ws, msg) => {
      if (role !== 'candidate' || !mediaEnabledRef.current || !msg?.sdp) return
      const adminId = msg.admin_id || msg.viewer_id || targetAdminIdRef.current || 'admin_default'
      targetAdminIdRef.current = adminId

      clearTimeout(requestOfferTimerRef.current)
      const mySeq = ++offerSeqRef.current

      let pc = pcsRef.current[adminId]
      const isExistingLivePc = Boolean(pc && (pc.connectionState === 'connected' || pc.connectionState === 'connecting'))

      if (!msg.renegotiation || !isExistingLivePc) {
        const preservedIce = pendingIceRef.current[adminId] ? [...pendingIceRef.current[adminId]] : []
        // Close any stale connections from previous admin_id instances in 1:1 calls
        Object.keys(pcsRef.current).forEach((key) => {
          if (key !== adminId) cleanupPeerConnection(key)
        })
        cleanupPeerConnection(adminId)
        if (preservedIce.length > 0) {
          pendingIceRef.current[adminId] = preservedIce
        }

        try {
          await Promise.race([
            initIceServers().catch(() => null),
            new Promise((resolve) => setTimeout(resolve, 600)),
          ])
        } catch (_) {}

        if (
          destroyedRef.current ||
          mySeq !== offerSeqRef.current ||
          wsRef.current !== ws ||
          ws.readyState !== WebSocket.OPEN
        ) {
          return
        }

        pc = new RTCPeerConnection({ iceServers: getIceServers() })
        pcsRef.current[adminId] = pc
        attachInboundTrackHandlers(pc, adminId)

        pc.onicecandidate = (e) => {
          if (e.candidate && wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: 'webrtc_ice_candidate',
                candidate: e.candidate,
                target_admin_id: adminId,
                viewer_id: adminId,
              })
            )
          }
        }

        pc.oniceconnectionstatechange = () => {
          if (pcsRef.current[adminId] !== pc) return
          setIceState(pc.iceConnectionState)
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            updateRemoteStreamFromReceivers(pc, adminId)
          }
        }

        pc.onconnectionstatechange = () => {
          if (pcsRef.current[adminId] !== pc) return
          const st = pc.connectionState
          console.info(`[BidirectionalWebRTC:candidate] connectionState -> ${st}`)
          if (st === 'connected') {
            setCallStatus('connected')
            setPeerStatus(true)
            updateRemoteStreamFromReceivers(pc, adminId)
          } else if (st === 'connecting') {
            setCallStatus('negotiating')
          } else if (st === 'disconnected' || st === 'failed') {
            setCallStatus('reconnecting')
          } else if (st === 'closed') {
            setCallStatus(peerConnectedRef.current ? 'waiting_peer' : 'idle')
          }
        }
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        if (mySeq !== offerSeqRef.current || pc.signalingState === 'closed' || pcsRef.current[adminId] !== pc) return

        const transceivers = pc.getTransceivers()
        const videoTransList = transceivers.filter(
          (t) => t.receiver?.track?.kind === 'video' || t.sender?.track?.kind === 'video'
        )
        const audioTrans = transceivers.find(
          (t) => t.receiver?.track?.kind === 'audio' || t.sender?.track?.kind === 'audio'
        )

        const videoTrans = videoTransList[0] || null
        const screenTrans = videoTransList.length > 1 ? videoTransList[1] : null

        sendersRef.current[adminId] = {
          video: videoTrans?.sender || null,
          audio: audioTrans?.sender || null,
          screen: screenTrans?.sender || null,
        }

        const { videoTrack, audioTrack } = getActiveLocalTracks()
        const screenTrack =
          screenStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') || null

        if (videoTrans) {
          videoTrans.direction = 'sendrecv'
          if (videoTrack) {
            await videoTrans.sender.replaceTrack(videoTrack)
            if (localStreamRef.current && typeof videoTrans.sender.setStreams === 'function') {
              try { videoTrans.sender.setStreams(localStreamRef.current) } catch (_) {}
            }
          }
        }
        if (audioTrans) {
          audioTrans.direction = 'sendrecv'
          if (audioTrack) {
            await audioTrans.sender.replaceTrack(audioTrack)
            if (localStreamRef.current && typeof audioTrans.sender.setStreams === 'function') {
              try { audioTrans.sender.setStreams(localStreamRef.current) } catch (_) {}
            }
          }
        }
        if (screenTrans) {
          if (screenTrack) {
            screenTrans.direction = 'sendonly'
            await screenTrans.sender.replaceTrack(screenTrack)
            if (screenStreamRef.current && typeof screenTrans.sender.setStreams === 'function') {
              try { screenTrans.sender.setStreams(screenStreamRef.current) } catch (_) {}
            }
          } else {
            screenTrans.direction = 'recvonly'
          }
        }

        await flushIceQueue(pc, adminId)
        if (mySeq !== offerSeqRef.current || pc.signalingState === 'closed' || pcsRef.current[adminId] !== pc) return

        const answer = await pc.createAnswer()
        if (mySeq !== offerSeqRef.current || pc.signalingState === 'closed' || pcsRef.current[adminId] !== pc) return
        await pc.setLocalDescription(answer)

        const latestTracks = getActiveLocalTracks()
        const latestScreen =
          screenStreamRef.current?.getVideoTracks().find((t) => t.readyState === 'live') || null
        if (videoTrans?.sender && latestTracks.videoTrack && videoTrans.sender.track !== latestTracks.videoTrack) {
          await videoTrans.sender.replaceTrack(latestTracks.videoTrack)
        }
        if (audioTrans?.sender && latestTracks.audioTrack && audioTrans.sender.track !== latestTracks.audioTrack) {
          await audioTrans.sender.replaceTrack(latestTracks.audioTrack)
        }
        if (screenTrans?.sender && latestScreen && screenTrans.sender.track !== latestScreen) {
          await screenTrans.sender.replaceTrack(latestScreen)
        }

        updateRemoteStreamFromReceivers(pc, adminId)

        if (wsRef.current === ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'webrtc_answer',
              sdp: pc.localDescription || answer,
              target_admin_id: adminId,
              viewer_id: adminId,
            })
          )
          setCallStatus('negotiating')
          console.info(`[BidirectionalWebRTC:candidate] Sent sendrecv webrtc_answer -> ${adminId}`)
        }
      } catch (err) {
        console.error('[BidirectionalWebRTC:candidate] handleIncomingOffer error:', err)
        setCallStatus('error')
      }
    },
    [
      role,
      cleanupPeerConnection,
      attachInboundTrackHandlers,
      getActiveLocalTracks,
      flushIceQueue,
      updateRemoteStreamFromReceivers,
      setPeerStatus,
    ]
  )
  handleIncomingOfferRef.current = handleIncomingOffer

  // WebSocket lifecycle with StrictMode guard, heartbeat & exponential backoff reconnect
  useEffect(() => {
    if (!enabled || !linkId || !token || !role) return
    destroyedRef.current = false

    if (role === 'admin' && !adminIdRef.current) {
      adminIdRef.current = `recruiter_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`
    }

    const detachAndCloseWs = (sock) => {
      if (!sock) return
      try {
        sock.onopen = null
        sock.onmessage = null
        sock.onerror = null
        sock.onclose = null
        if (sock.readyState === WebSocket.OPEN || sock.readyState === WebSocket.CONNECTING) {
          sock.close()
        }
      } catch (_) {}
    }

    const buildWsUrl = () => {
      const base = (API_BASE_URL || '').replace(/\/+$/, '')
      const wsBase = base.replace(/^https/, 'wss').replace(/^http/, 'ws')
      const basePath = `${wsBase}/ws/webrtc/${role}/${encodeURIComponent(linkId)}?token=${encodeURIComponent(token)}`
      if (role === 'admin') {
        return `${basePath}&admin_id=${encodeURIComponent(adminIdRef.current)}`
      }
      return basePath
    }

    const startHeartbeat = (ws) => {
      clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = setInterval(() => {
        if (destroyedRef.current || wsRef.current !== ws) {
          clearInterval(heartbeatTimerRef.current)
          return
        }
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping' }))
          } catch (_) {}
        }
      }, 15_000)
    }

    const connect = () => {
      if (destroyedRef.current) return
      if (wsRef.current) {
        detachAndCloseWs(wsRef.current)
        wsRef.current = null
      }

      setCallStatus((prev) => (prev === 'connected' ? prev : 'connecting'))

      const url = buildWsUrl()
      console.info(`[BidirectionalWebRTC:${role}] Connecting WS for session ${linkId}`)
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (destroyedRef.current || wsRef.current !== ws) {
          detachAndCloseWs(ws)
          return
        }
        setWsConnected(true)
        setWsError('')
        reconnectDelayRef.current = 1500
        startHeartbeat(ws)
        console.info(`[BidirectionalWebRTC:${role}] WS connected`)

        if (role === 'candidate') {
          try {
            ws.send(JSON.stringify({ type: 'candidate_connected' }))
          } catch (_) {}
          setCallStatus((prev) => (prev === 'connected' ? prev : 'waiting_peer'))
        } else if (role === 'admin') {
          try {
            ws.send(JSON.stringify({ type: 'admin_connected', admin_id: adminIdRef.current }))
          } catch (_) {}
          setCallStatus((prev) => (prev === 'connected' ? prev : 'waiting_peer'))
        }
      }

      ws.onmessage = async (event) => {
        if (destroyedRef.current || wsRef.current !== ws) return
        let msg
        try {
          msg = JSON.parse(event.data)
        } catch {
          return
        }
        if (!msg || !msg.type) return

        if (msg.type === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }))
          }
          return
        }
        if (msg.type === 'pong') return

        // Admin-side signaling handlers
        if (role === 'admin') {
          if (msg.type === 'admin_connected') {
            if (!adminIdRef.current && msg.admin_id) adminIdRef.current = msg.admin_id
            return
          }
          if (msg.type === 'candidate_connected' || msg.type === 'webrtc_request_offer') {
            setPeerStatus(true)
            if (mediaEnabledRef.current) {
              scheduleAdminOfferRef.current?.(ws, msg.type === 'webrtc_request_offer' ? 50 : 120, {
                force: Boolean(msg.force),
              })
            }
            return
          }
          if (msg.type === 'candidate_disconnected') {
            clearTimeout(offerDebounceTimerRef.current)
            cleanupPeerConnectionRef.current?.('candidate')
            trackSigRef.current = ''
            setRemoteStream(null)
            setRemoteVideoActive(false)
            setRemoteAudioActive(false)
            setPeerStatus(false)
            setCallStatus('waiting_peer')
            return
          }
          if (msg.type === 'webrtc_answer') {
            if (msg.target_admin_id && adminIdRef.current && msg.target_admin_id !== adminIdRef.current) {
              return
            }
            const pc = pcsRef.current['candidate']
            if (pc && pc.signalingState === 'have-local-offer') {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
                await flushIceQueueRef.current?.(pc, 'candidate')
                updateRemoteStreamFromReceiversRef.current?.(pc, 'candidate')
              } catch (err) {
                console.warn('[BidirectionalWebRTC:admin] setRemoteDescription warning:', err)
              }
            }
            return
          }
          if (msg.type === 'webrtc_ice_candidate') {
            if (msg.target_admin_id && adminIdRef.current && msg.target_admin_id !== adminIdRef.current) {
              return
            }
            const pc = pcsRef.current['candidate']
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
              } catch (err) {
                console.warn('[BidirectionalWebRTC:admin] addIceCandidate warning:', err)
              }
            } else {
              pendingIceRef.current['candidate'] = pendingIceRef.current['candidate'] || []
              pendingIceRef.current['candidate'].push(msg.candidate)
            }
            return
          }
        }

        // Candidate-side signaling handlers
        if (role === 'candidate') {
          if (msg.type === 'admin_connected') {
            const incomingAdminId = msg.admin_id || 'admin_default'
            targetAdminIdRef.current = incomingAdminId
            setPeerStatus(true)
            clearTimeout(requestOfferTimerRef.current)
            if (mediaEnabledRef.current) {
              requestOfferTimerRef.current = setTimeout(() => {
                if (
                  !destroyedRef.current &&
                  mediaEnabledRef.current &&
                  wsRef.current === ws &&
                  ws.readyState === WebSocket.OPEN
                ) {
                  const existingPc = pcsRef.current[incomingAdminId]
                  const st = existingPc?.connectionState
                  if (!existingPc || (st !== 'connected' && st !== 'connecting')) {
                    ws.send(
                      JSON.stringify({
                        type: 'webrtc_request_offer',
                        target_admin_id: incomingAdminId,
                      })
                    )
                  }
                }
              }, 1400)
            }
            return
          }
          if (msg.type === 'admin_disconnected') {
            const leftId = msg.admin_id || targetAdminIdRef.current
            if (leftId) cleanupPeerConnectionRef.current?.(leftId)
            if (Object.keys(pcsRef.current).length === 0) {
              targetAdminIdRef.current = ''
              trackSigRef.current = ''
              setRemoteStream(null)
              setRemoteVideoActive(false)
              setRemoteAudioActive(false)
              setPeerStatus(false)
              setCallStatus('waiting_peer')
            }
            return
          }
          if (msg.type === 'webrtc_offer') {
            setPeerStatus(true)
            await handleIncomingOfferRef.current?.(ws, msg)
            return
          }
          if (msg.type === 'webrtc_ice_candidate') {
            const admId = msg.admin_id || msg.viewer_id || targetAdminIdRef.current || 'admin_default'
            const pc = pcsRef.current[admId]
            if (pc && pc.remoteDescription) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
              } catch (err) {
                console.warn('[BidirectionalWebRTC:candidate] addIceCandidate warning:', err)
              }
            } else {
              pendingIceRef.current[admId] = pendingIceRef.current[admId] || []
              pendingIceRef.current[admId].push(msg.candidate)
            }
            return
          }
        }

        // Forward custom messages (push_question, external_meeting_state, interview_ended, etc.)
        if (onCustomMessageRef.current) {
          onCustomMessageRef.current(msg)
        }
      }

      ws.onerror = (err) => {
        if (destroyedRef.current || wsRef.current !== ws) return
        console.warn(`[BidirectionalWebRTC:${role}] WS error:`, err)
      }

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return
        wsRef.current = null
        setWsConnected(false)
        clearInterval(heartbeatTimerRef.current)
        if (event?.code === 1008) {
          setWsError('Session signaling rejected (Auth 1008). Please refresh or verify login.')
        }
        if (destroyedRef.current) {
          cleanupAllPeersRef.current?.()
          return
        }
        const delay = reconnectDelayRef.current
        reconnectDelayRef.current = Math.min(delay * 2, 15_000)
        reconnectTimerRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    // Gentle self-healing monitor: presence discovery & stalled ICE recovery (never interrupts active ICE <18s)
    retryIntervalRef.current = setInterval(() => {
      if (destroyedRef.current) return
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return

      if (role === 'admin') {
        if (!peerConnectedRef.current) {
          try {
            ws.send(JSON.stringify({ type: 'admin_connected', admin_id: adminIdRef.current }))
          } catch (_) {}
          return
        }
        if (!mediaEnabledRef.current) return

        const pc = pcsRef.current['candidate']
        const st = pc?.connectionState
        const ice = pc?.iceConnectionState
        const elapsed = Date.now() - lastOfferSentAtRef.current

        const shouldForceOffer =
          !pc ||
          st === 'failed' ||
          st === 'closed' ||
          ice === 'failed' ||
          (st === 'new' && elapsed > 6000) ||
          (st === 'disconnected' && elapsed > 6000) ||
          (st === 'connecting' && elapsed > 18000)

        if (shouldForceOffer) {
          createAndSendOfferRef.current?.(ws, { force: true })
        }
      } else if (role === 'candidate') {
        if (!peerConnectedRef.current) {
          try {
            ws.send(JSON.stringify({ type: 'candidate_connected' }))
          } catch (_) {}
          return
        }
        if (!mediaEnabledRef.current) return

        const admId = targetAdminIdRef.current
        const pc = admId ? pcsRef.current[admId] : null
        const st = pc?.connectionState
        const ice = pc?.iceConnectionState

        if (!pc || st === 'failed' || st === 'closed' || ice === 'failed' || (st !== 'connected' && st !== 'connecting')) {
          try {
            ws.send(
              JSON.stringify({
                type: 'webrtc_request_offer',
                target_admin_id: admId || undefined,
              })
            )
          } catch (_) {}
        }
      }
    }, 3500)

    return () => {
      destroyedRef.current = true
      clearTimeout(reconnectTimerRef.current)
      clearTimeout(offerDebounceTimerRef.current)
      clearTimeout(requestOfferTimerRef.current)
      clearInterval(heartbeatTimerRef.current)
      clearInterval(retryIntervalRef.current)
      if (wsRef.current) {
        const closingSock = wsRef.current
        wsRef.current = null
        detachAndCloseWs(closingSock)
      }
      cleanupAllPeersRef.current?.()
      setWsConnected(false)
    }
  }, [
    enabled,
    role,
    linkId,
    token,
  ])

  // If mediaEnabled resumes from External Call Mode -> Built-In Video, trigger clean offer/request
  useEffect(() => {
    if (!mediaEnabled || !wsConnected || !peerConnected) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    if (role === 'admin' && !pcsRef.current['candidate']) {
      scheduleAdminOfferRef.current?.(ws, 200, { force: true })
    } else if (role === 'candidate' && targetAdminIdRef.current && !pcsRef.current[targetAdminIdRef.current]) {
      try {
        ws.send(
          JSON.stringify({
            type: 'webrtc_request_offer',
            target_admin_id: targetAdminIdRef.current,
            force: true,
          })
        )
      } catch (_) {}
    }
  }, [mediaEnabled, wsConnected, peerConnected, role])

  const sendSignal = useCallback((payload) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    try {
      ws.send(JSON.stringify(payload))
      return true
    } catch (err) {
      console.warn('[BidirectionalWebRTC] sendSignal error:', err)
      return false
    }
  }, [])

  const reconnectCall = useCallback(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (role === 'admin') {
      createAndSendOfferRef.current?.(ws, { force: true })
      return true
    }
    if (role === 'candidate') {
      ws.send(
        JSON.stringify({
          type: 'webrtc_request_offer',
          target_admin_id: targetAdminIdRef.current || undefined,
          force: true,
        })
      )
      return true
    }
    return false
  }, [role])

  return {
    remoteStream,
    remoteScreenStream,
    hasRemoteScreen,
    remoteVideoActive,
    remoteAudioActive,
    wsConnected,
    peerConnected,
    callStatus,
    iceState,
    wsError,
    sendSignal,
    reconnectCall,
  }
}
