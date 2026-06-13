window.API_BASE_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? (window.location.port === "80" ? "/api" : `${window.location.protocol}//localhost:8000`)
    : (window.location.origin.includes('vercel.app') ? "https://ai-adaptive-interview-1hsw.onrender.com" : "/api");

window.API_BASE = window.API_BASE_URL;
