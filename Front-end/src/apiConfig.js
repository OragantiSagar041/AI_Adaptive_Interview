const isLocalHostname = (hostname) => {
  return ["localhost", "127.0.0.1"].includes(hostname) || 
         hostname.startsWith("192.168.") || 
         hostname.startsWith("10.") || 
         hostname.startsWith("172.");
};

const isLocal = typeof window !== 'undefined' && window.location ? isLocalHostname(window.location.hostname) : false;
const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};
let configuredBaseUrl = String(env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

// Magic fix for mobile/network testing: If the .env file says 'localhost' but we are
// accessing the app from a network IP (like 192.168.1.8), replace localhost with the IP.
if (typeof window !== 'undefined' && window.location && isLocal && configuredBaseUrl) {
    configuredBaseUrl = configuredBaseUrl.replace('localhost', window.location.hostname).replace('127.0.0.1', window.location.hostname);
}

const LOCAL_URL = typeof window !== 'undefined' && window.location ? `http://${window.location.hostname}:8000` : 'http://127.0.0.1:8000';
//const PROD_URL = 'https://si-833f8dc5b3744730a6d03e74c2be9486.ecs.us-east-1.on.aws' 
const PROD_URL = 'https://ai-adaptive-interview-1hsw.onrender.com';
export const API_BASE_URL = configuredBaseUrl || (isLocal ? LOCAL_URL : PROD_URL);
export const API_BASE = API_BASE_URL;
