const isLocal = typeof window !== 'undefined' && window.location ? ["localhost", "127.0.0.1"].includes(window.location.hostname) : false
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
const configuredBaseUrl = String(env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

export const API_BASE_URL = configuredBaseUrl || (isLocal ? 'http://127.0.0.1:8000' : '')
export const API_BASE = API_BASE_URL
