const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

export function getIceServers() {
  const turnUrls = String(import.meta.env.VITE_TURN_URLS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  if (!turnUrls.length) return DEFAULT_STUN_SERVERS

  return [
    ...DEFAULT_STUN_SERVERS,
    {
      urls: turnUrls,
      username: import.meta.env.VITE_TURN_USERNAME || '',
      credential: import.meta.env.VITE_TURN_CREDENTIAL || '',
    },
  ]
}

export function hasTurnServer() {
  return String(import.meta.env.VITE_TURN_URLS || '').trim().length > 0
}
