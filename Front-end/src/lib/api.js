/**
 * lib/api.js — Singleton axios instance optimised for low latency.
 *
 * Key optimisations:
 *  1. HTTP/1.1 keep-alive  → reuses TCP connections, eliminates TCP handshake overhead.
 *  2. In-flight deduplication → identical GET requests share one network round-trip.
 *  3. Tight timeouts → fail fast instead of hanging.
 */

import axios from 'axios';
import { API_BASE_URL } from '@/apiConfig';

// ─── Singleton axios instance ────────────────────────────────────────────────
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 8000,
  headers: {
    'Content-Type': 'application/json',
    // Tell the browser / Node.js to reuse the TCP connection
    'Connection': 'keep-alive',
  },
});

// ─── In-flight deduplication for GET requests ────────────────────────────────
// Prevents two simultaneous GET calls to the same URL from each making a
// separate network request.  The second caller gets the same promise.
const _inflight = new Map();

export const dedupedGet = (url, config = {}) => {
  const key = url + JSON.stringify(config.params || {});
  if (_inflight.has(key)) return _inflight.get(key);

  const req = api.get(url, config).finally(() => _inflight.delete(key));
  _inflight.set(key, req);
  return req;
};

// ─── Auth-header interceptor ──────────────────────────────────────────────────
// Attach the JWT automatically so every call site doesn't have to.
// Call setAuthToken(token) once after login.
let _authToken = null;
export const setAuthToken = (token) => { _authToken = token; };

api.interceptors.request.use((config) => {
  if (_authToken && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${_authToken}`;
  }
  return config;
});

export default api;
