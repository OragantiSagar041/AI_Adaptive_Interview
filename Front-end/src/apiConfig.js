const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname)
const configuredBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
const productionDefault = 'http://ecs-express-gateway-alb-56fd9253-1587714726.us-east-1.elb.amazonaws.com'

export const API_BASE_URL = configuredBaseUrl || (isLocal ? 'http://127.0.0.1:8000' : productionDefault)
export const API_BASE = API_BASE_URL
