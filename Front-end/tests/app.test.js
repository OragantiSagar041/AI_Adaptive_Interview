import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Frontend Core Sanity & WebRTC Config Tests', () => {
  test('webrtcConfig returns default STUN servers when TURN not set', async () => {
    const { getIceServers, hasTurnServer } = await import('../src/utils/webrtcConfig.js');
    const servers = getIceServers();
    assert.ok(Array.isArray(servers), 'getIceServers should return an array');
    assert.ok(servers.length >= 1, 'Should have at least one ICE server');
    assert.ok(
      servers.some(s => typeof s.urls === 'string' ? s.urls.includes('stun') : Array.isArray(s.urls) && s.urls.some(u => u.includes('stun'))),
      'Should include STUN server'
    );
  });

  test('apiConfig exports API_BASE_URL properly', async () => {
    const { API_BASE_URL } = await import('../src/apiConfig.js');
    assert.ok(typeof API_BASE_URL === 'string', 'API_BASE_URL should be a string');
    // In CI or production without env var, it correctly falls back to an empty string for relative paths
    // In local environments, it uses http://127.0.0.1:8000
    assert.ok(API_BASE_URL === '' || API_BASE_URL.includes('127.0.0.1') || API_BASE_URL.includes('localhost'), 'API_BASE_URL should fall back to empty string or local origin');
  });
});
