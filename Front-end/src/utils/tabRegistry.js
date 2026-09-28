/**
 * tabRegistry.js
 *
 * Domain-wide Tab Registry for Chrome/Browser environment isolation.
 * Automatically tracks every tab open on this domain in real-time.
 * Uses atomic per-tab keys in localStorage + BroadcastChannel to eliminate race conditions.
 */

const TAB_KEY_PREFIX = 'ai_tab_node_'
const BROADCAST_CHANNEL_NAME = 'ai_interview_tab_registry_bus'
const HEARTBEAT_INTERVAL_MS = 500
const STALE_TAB_TIMEOUT_MS = 3000

// Generate unique ID for this browser tab
export const CURRENT_TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

let heartbeatTimer = null
let broadcastChannel = null
const listeners = new Set()

/**
 * Get all currently active, non-stale tabs on this domain.
 */
export function getActiveTabs() {
  if (typeof window === 'undefined') return []
  try {
    const now = Date.now()
    const active = []
    const keysToRemove = []

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(TAB_KEY_PREFIX)) {
        try {
          const item = JSON.parse(localStorage.getItem(key))
          if (item && item.id) {
            if (now - (item.lastSeen || 0) <= STALE_TAB_TIMEOUT_MS) {
              active.push(item)
            } else {
              keysToRemove.push(key)
            }
          }
        } catch (_) {}
      }
    }

    keysToRemove.forEach((k) => localStorage.removeItem(k))
    return active
  } catch (e) {
    console.warn('Error reading active tabs:', e)
    return []
  }
}

/**
 * Write current tab heartbeat.
 */
function updateTabHeartbeat() {
  if (typeof window === 'undefined') return
  try {
    const payload = {
      id: CURRENT_TAB_ID,
      title: document.title || 'HireIQ Platform',
      url: window.location.pathname + window.location.search,
      lastSeen: Date.now(),
    }

    localStorage.setItem(TAB_KEY_PREFIX + CURRENT_TAB_ID, JSON.stringify(payload))
    notifyListeners()
  } catch (e) {
    console.warn('Error updating tab heartbeat:', e)
  }
}

/**
 * Remove this tab on close.
 */
function removeCurrentTab() {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(TAB_KEY_PREFIX + CURRENT_TAB_ID)
    broadcastChannel?.postMessage({ type: 'TAB_CLOSED', id: CURRENT_TAB_ID })
    notifyListeners()
  } catch (_) {}
}

function notifyListeners() {
  const tabs = getActiveTabs()
  listeners.forEach((callback) => {
    try {
      callback(tabs)
    } catch (e) {
      console.error('Error in tab change listener:', e)
    }
  })
}

/**
 * Initialize global tab tracking. Runs on all pages via App.jsx.
 */
export function initGlobalTabTracker() {
  if (typeof window === 'undefined') return

  try {
    if ('BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
      broadcastChannel.onmessage = (e) => {
        if (e.data?.type === 'TAB_PING') {
          updateTabHeartbeat()
          broadcastChannel.postMessage({ type: 'TAB_PONG', id: CURRENT_TAB_ID })
        } else {
          notifyListeners()
        }
      }
      broadcastChannel.postMessage({ type: 'TAB_PING', id: CURRENT_TAB_ID })
    }
  } catch (_) {}

  // Update immediately
  updateTabHeartbeat()

  // Heartbeat every 500ms
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      updateTabHeartbeat()
    }, HEARTBEAT_INTERVAL_MS)
  }

  // Cross-tab storage event
  const onStorage = (e) => {
    if (e.key && e.key.startsWith(TAB_KEY_PREFIX)) {
      notifyListeners()
    }
  }
  window.addEventListener('storage', onStorage)

  // Listen to visibility & focus to refresh heartbeat when tab is revisited
  window.addEventListener('focus', updateTabHeartbeat)
  window.addEventListener('visibilitychange', updateTabHeartbeat)

  // Clean up when tab or window closes
  window.addEventListener('beforeunload', removeCurrentTab)
  window.addEventListener('pagehide', removeCurrentTab)
}

/**
 * Subscribe to tab registry changes.
 */
export function subscribeToTabChanges(callback) {
  listeners.add(callback)
  callback(getActiveTabs())

  return () => {
    listeners.delete(callback)
  }
}
