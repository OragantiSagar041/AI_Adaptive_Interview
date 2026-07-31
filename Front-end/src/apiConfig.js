const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname)
const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
const productionDefault = 'https://si-68eeab6b1a7a4a6792ec2d7c9841002a.ecs.us-east-1.on.aws'

export const API_BASE_URL = configuredBaseUrl || (isLocal ? 'http://127.0.0.1:8000' : productionDefault)
export const API_BASE = API_BASE_URL
