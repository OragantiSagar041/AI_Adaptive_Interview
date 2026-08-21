function getMeteredIceServers(username, credential) {
  return [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
    { urls: 'turn:global.relay.metered.ca:443', username, credential },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential },
  ]
}

// Free public TURN servers as last-resort fallback
const FREE_TURN_FALLBACK = [
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

  // Fallback to free public TURN servers only
  return FREE_TURN_FALLBACK
}

export function hasTurnServer() {
  return true // We always have TURN configured now
}

