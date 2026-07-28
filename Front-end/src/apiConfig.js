const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname)
const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
const productionDefault = 'https://kr-088a4cf6c7ba48c48290be99a8acf5eb.ecs.us-east-1.on.aws'

export const API_BASE_URL = configuredBaseUrl || (isLocal ? 'http://localhost:8000' : productionDefault)
export const API_BASE = API_BASE_URL
