import axios from 'axios';

const isLocalHostname = (hostname) => {
  return ["localhost", "127.0.0.1"].includes(hostname) || 
         hostname.startsWith("192.168.") || 
         hostname.startsWith("10.") || 
         hostname.startsWith("172.");
};

const isLocal = typeof window !== "undefined" && isLocalHostname(window.location.hostname);
const configuredBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL)) 
  ? (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL).trim().replace(/\/+$/, '') 
  : '';

const LOCAL_URL = 'http://127.0.0.1:8000';
const PROD_URL = 'https://hireiq.co.in/api';
export const API_BASE_URL = configuredBaseUrl || (isLocal ? LOCAL_URL : PROD_URL);
export const API_BASE = API_BASE_URL;

// Normalize duplicate /api/api/ occurrences across all Axios and fetch calls
const cleanDuplicateApi = (url) => {
  if (typeof url === 'string' && url.includes('/api/api/')) {
    return url.replace(/\/api\/api\//g, '/api/');
  }
  return url;
};

// Global interceptor for default Axios instance used across Redux slices
axios.interceptors.request.use((config) => {
  if (config.url) {
    config.url = cleanDuplicateApi(config.url);
  }
  return config;
});

// Interceptor for window.fetch calls
if (typeof window !== 'undefined' && window.fetch) {
  const originalFetch = window.fetch;
  window.fetch = function (resource, init) {
    if (typeof resource === 'string') {
      resource = cleanDuplicateApi(resource);
    } else if (resource instanceof Request && resource.url && resource.url.includes('/api/api/')) {
      resource = new Request(cleanDuplicateApi(resource.url), resource);
    }
    return originalFetch.call(this, resource, init);
  };
}


