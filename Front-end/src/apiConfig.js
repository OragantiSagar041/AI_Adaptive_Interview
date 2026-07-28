const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname)
const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
const productionDefault = 'https://kr-d21dfc264e90465499a72a823e039dee.ecs.us-east-1.on.aws'

export const API_BASE_URL = configuredBaseUrl || (isLocal ? 'http://localhost:8000' : productionDefault)
export const API_BASE = API_BASE_URL
