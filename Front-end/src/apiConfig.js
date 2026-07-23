const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname)
const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
const productionDefault = 'https://ai-adaptive-interview-1hsw.onrender.com'

export const API_BASE_URL = configuredBaseUrl || (isLocal ? 'http://localhost:8000' : productionDefault)
export const API_BASE = API_BASE_URL
