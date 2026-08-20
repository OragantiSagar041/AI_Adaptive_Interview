// Free public STUN servers
const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
]

// Free public TURN servers (openrelay.metered.ca) used as fallback when no
// custom VITE_TURN_URLS are provided. TURN is required when STUN fails
// (i.e. both peers are behind strict NAT — common in production).
const FREE_TURN_SERVERS = [
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
]

export function getIceServers() {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const turnUrls = String(env.VITE_TURN_URLS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  // If custom TURN credentials are provided in .env, use them
  if (turnUrls.length) {
    return [
      ...DEFAULT_STUN_SERVERS,
      {
        urls: turnUrls,
        username: env.VITE_TURN_USERNAME || '',
        credential: env.VITE_TURN_CREDENTIAL || '',
      },
    ]
  }

  // Otherwise fall back to free public TURN servers so video works across different networks
  return [
    ...DEFAULT_STUN_SERVERS,
    ...FREE_TURN_SERVERS,
  ]
}

export function hasTurnServer() {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return String(env.VITE_TURN_URLS || '').trim().length > 0
}
