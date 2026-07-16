const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
export const API_BASE_URL = isLocal ? "http://127.0.0.1:8000" : (import.meta.env.VITE_API_BASE_URL || "https://ai-adaptive-interview-1hsw.onrender.com");
export const API_BASE = API_BASE_URL;
