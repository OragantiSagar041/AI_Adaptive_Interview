const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const dockerDefault = `${window.location.protocol}//${window.location.hostname}:8000`;
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isLocal ? "http://localhost:8000" : dockerDefault);
export const API_BASE = API_BASE_URL;
