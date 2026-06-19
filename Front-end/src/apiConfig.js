export const API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `${window.location.protocol}//localhost:8000`
    : (window.location.origin.includes('vercel.app') ? "https://ai-adaptive-interview-1hsw.onrender.com" : `${window.location.origin}/api`);

export const API_BASE = API_BASE_URL;
