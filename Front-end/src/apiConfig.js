const isLocal = typeof window !== 'undefined' && window.location ? ["localhost", "127.0.0.1"].includes(window.location.hostname) : false
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
const configuredBaseUrl = String(env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')

const LOCAL_URL = 'http://127.0.0.1:8000'
const PROD_URL = 'http://sb-lb-1304167006.us-east-1.elb.amazonaws.com'
export const API_BASE_URL = configuredBaseUrl || (isLocal ? LOCAL_URL : PROD_URL)
export const API_BASE = API_BASE_URL
