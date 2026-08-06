const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function getIceServers() {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  const turnUrls = String(env.VITE_TURN_URLS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (!turnUrls.length) return DEFAULT_STUN_SERVERS

  return [
    ...DEFAULT_STUN_SERVERS,
    {
      urls: turnUrls,
      username: env.VITE_TURN_USERNAME || '',
      credential: env.VITE_TURN_CREDENTIAL || '',
    },
  ]
}

export function hasTurnServer() {
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
  return String(env.VITE_TURN_URLS || '').trim().length > 0
}
