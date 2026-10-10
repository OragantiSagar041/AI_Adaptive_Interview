import { API_BASE_URL } from '../apiConfig.js'

function getMeteredIceServers(username, credential) {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
    { urls: 'turn:global.relay.metered.ca:443', username, credential },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential },
  ]
}

// Robust fallback ICE servers with Google STUN + OpenRelay TURN
const FREE_TURN_FALLBACK = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
]

let dynamicIceServers = null

/**
 * Optionally pre-fetch dynamic ICE servers from the backend.
 * Falls back silently to FREE_TURN_FALLBACK if backend is unavailable.
 */
export async function initIceServers() {
  if (dynamicIceServers) return dynamicIceServers
  try {
    const res = await fetch(`${API_BASE_URL}/api/webrtc/ice-servers`)
    if (res.ok) {
      const data = await res.json()
      const serverList = Array.isArray(data) ? data : (data?.iceServers || data?.ice_servers)
      if (Array.isArray(serverList) && serverList.length > 0) {
        dynamicIceServers = serverList
        return dynamicIceServers
      }
    }
  } catch (_) {
    // fallback silently to local config
  }
  return null
}

// Trigger background fetch once on client load
if (typeof window !== 'undefined') {
  initIceServers().catch(() => {})
}

export function getIceServers() {
  if (dynamicIceServers && dynamicIceServers.length > 0) {
    return dynamicIceServers
  }

  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}

  const meteredUsername = env.VITE_METERED_USERNAME || ''
  const meteredCredential = env.VITE_METERED_CREDENTIAL || ''

  // If Metered.ca credentials are in .env, use private TURN servers
  if (meteredUsername && meteredCredential) {
    return [
      ...getMeteredIceServers(meteredUsername, meteredCredential),
      ...FREE_TURN_FALLBACK,
    ]
  }

  // Fallback to robust STUN + public TURN servers
  return FREE_TURN_FALLBACK
}

export function hasTurnServer() {
  return true // We always have TURN configured now
}
