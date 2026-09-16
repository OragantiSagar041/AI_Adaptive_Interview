const isLocalHostname = (hostname) => {
  return ["localhost", "127.0.0.1"].includes(hostname) || 
         hostname.startsWith("192.168.") || 
         hostname.startsWith("10.") || 
         hostname.startsWith("172.");
};

const isLocal = typeof window !== "undefined" && isLocalHostname(window.location.hostname);
const configuredBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) ? import.meta.env.VITE_API_URL.trim().replace(/\/+$/, '') : '';

const LOCAL_URL = 'http://127.0.0.1:8000'
const PROD_URL = 'http://sb-lb-1304167006.us-east-1.elb.amazonaws.com'
export const API_BASE_URL = configuredBaseUrl || (isLocal ? LOCAL_URL : PROD_URL)
export const API_BASE = API_BASE_URL

