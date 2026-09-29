import { useState, useEffect, useRef, useCallback } from 'react'
import Swal from 'sweetalert2'
import { subscribeToTabChanges, getActiveTabs, CURRENT_TAB_ID } from '../utils/tabRegistry'

const PROBE_DURATION_SECONDS = 5

// Matches third-party virtual audio/video drivers, recording tools, and mirroring software
const SUSPICIOUS_APP_DEVICE_REGEX = /(obs|virtual|manycam|droidcam|epoccam|xsplit|vmix|camo|ndi|cable|voicemeeter|vb-audio|blackhole|loopback|screen.*capture)/i

export function useEnvironmentIsolation({ enabled = true } = {}) {
  const [hasMultipleTabs, setHasMultipleTabs] = useState(false)
  const [multiTabError, setMultiTabError] = useState('')
  const [openTabsCount, setOpenTabsCount] = useState(1)
  const [notificationStatus, setNotificationStatus] = useState('default')
  const [isTesting, setIsTesting] = useState(false)
  const [countdown, setCountdown] = useState(PROBE_DURATION_SECONDS)
  const [isIsolated, setIsIsolated] = useState(false)
  const [failureReason, setFailureReason] = useState('')

  const isIsolatedRef = useRef(false)
  const isTestingRef = useRef(false)
  const probeIntervalRef = useRef(null)
  const hasFailedRef = useRef(false)

  // ── 1. Notification Permission Detection ──────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission)
    } else {
      setNotificationStatus('unsupported')
    }
  }, [])

  // ── 2. Revoke Isolation immediately if any condition is violated ──────────
  const revokeIsolation = useCallback((reason) => {
    if (!isIsolatedRef.current && !isTestingRef.current && hasFailedRef.current) return
    isIsolatedRef.current = false
    isTestingRef.current = false
    hasFailedRef.current = true

    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current)
      probeIntervalRef.current = null
    }

    setIsIsolated(false)
    setIsTesting(false)
    setFailureReason(reason)

    Swal.fire({
      icon: 'error',
      title: '⚠️ Security Alert: Isolation Broken',
      html: `
        <div style="text-align: left; font-size: 14px; line-height: 1.6; color: #cbd5e1;">
          <p style="margin-bottom: 12px; color: #f87171; font-weight: 700;">
            ${reason}
          </p>
          <div style="background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; color: #fca5a5;">
            <strong>Required Actions:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0; list-style: disc;">
              <li><strong>Close all background software:</strong> VS Code, WhatsApp, AnyDesk, Discord, Teams, Edge, etc.</li>
              <li><strong>Close all other Chrome tabs</strong> (only this exam tab is permitted).</li>
              <li><strong>Remain in Fullscreen:</strong> Do not exit full-screen mode or click outside this window.</li>
            </ul>
          </div>
          <p style="font-size: 12px; color: #94a3b8;">
            Please close your other applications and re-run the 5-second isolation test to unlock the interview.
          </p>
        </div>
      `,
      background: '#161c2d',
      color: '#fff',
      confirmButtonText: 'I Have Closed Them (Re-verify)',
      allowOutsideClick: false,
      allowEscapeKey: false,
      customClass: {
        popup: 'border border-red-500/40 rounded-2xl shadow-2xl z-[999999]',
        title: 'text-xl font-bold text-white',
        confirmButton: 'bg-primary hover:bg-primary-hover text-white rounded-full px-6 py-2.5 font-semibold text-sm cursor-pointer border-none outline-none',
      },
      buttonsStyling: false,
    })
  }, [])

  // ── 3. Real-Time Domain Tab Registry Monitor ──────────────────────────────
  const evaluateTabs = useCallback((tabs) => {
    const active = tabs || getActiveTabs()
    const otherTabs = active.filter((t) => t.id !== CURRENT_TAB_ID)
    setOpenTabsCount(active.length)

    if (otherTabs.length > 0) {
      setHasMultipleTabs(true)
      const tabNames = otherTabs
        .map((t) => `"${t.title || 'HireIQ'}"`)
        .slice(0, 2)
        .join(', ')
      setMultiTabError(
        `Another Chrome tab (${tabNames}) is currently open in the background.`
      )
      if (isIsolatedRef.current) {
        revokeIsolation(`Multiple Chrome tabs detected! Please close ${tabNames} to proceed.`)
      }
    } else {
      setHasMultipleTabs(false)
      setMultiTabError('')
    }
  }, [revokeIsolation])

  useEffect(() => {
    if (!enabled) return

    const unsubscribe = subscribeToTabChanges((tabs) => {
      evaluateTabs(tabs)
    })

    const interval = setInterval(() => {
      evaluateTabs(getActiveTabs())
    }, 400)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [enabled, evaluateTabs])

  // ── 4. Continuous Living Focus & Fullscreen Guard (Never stops!) ───────────
  useEffect(() => {
    if (!enabled) return

    const checkLivingConditions = () => {
      if (isIsolatedRef.current) {
        if (!document.fullscreenElement) {
          revokeIsolation('Fullscreen was exited! You must remain in full-screen mode at all times to prevent other applications from displaying.')
          return
        }
        if (document.hidden) {
          revokeIsolation('Tab switch detected! You navigated away from the exam tab.')
          return
        }
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) {
          revokeIsolation('Window focus lost! Another application (VS Code, WhatsApp, etc.) or external window gained focus.')
          return
        }
      }
    }

    // Keyboard Lock API & Tab Switching Blocker
    const blockTabSwitchShortcuts = (e) => {
      const isCtrl = e.ctrlKey || e.metaKey
      const isAlt = e.altKey
      const key = (e.key || '').toLowerCase()

      // Block Ctrl+Tab, Ctrl+Shift+Tab
      if (isCtrl && key === 'tab') {
        e.preventDefault()
        e.stopPropagation()
        if (isIsolatedRef.current) {
          revokeIsolation('Tab switching shortcut (Ctrl+Tab) was attempted and blocked.')
        }
        return
      }

      // Block Ctrl+T (New tab), Ctrl+N (New window), Ctrl+W (Close tab)
      if (isCtrl && ['t', 'n', 'w'].includes(key)) {
        e.preventDefault()
        e.stopPropagation()
        if (isIsolatedRef.current) {
          revokeIsolation(`Browser shortcut (Ctrl+${key.toUpperCase()}) was attempted and blocked.`)
        }
        return
      }

      // Block Ctrl+1 through Ctrl+9 (Tab jumping)
      if (isCtrl && ['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) {
        e.preventDefault()
        e.stopPropagation()
        if (isIsolatedRef.current) {
          revokeIsolation('Direct tab switching shortcut was attempted and blocked.')
        }
        return
      }

      // Block Alt+Tab, Alt+Esc (App switching)
      if (isAlt && ['tab', 'escape'].includes(key)) {
        e.preventDefault()
        e.stopPropagation()
        if (isIsolatedRef.current) {
          revokeIsolation('Application switching shortcut (Alt+Tab/Esc) was attempted and blocked.')
        }
        return
      }

      // Block F11 (Fullscreen toggle)
      if (key === 'f11') {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }

    window.addEventListener('blur', checkLivingConditions)
    window.addEventListener('focusout', checkLivingConditions)
    document.addEventListener('visibilitychange', checkLivingConditions)
    document.addEventListener('fullscreenchange', checkLivingConditions)
    window.addEventListener('keydown', blockTabSwitchShortcuts, true)

    const guardInterval = setInterval(checkLivingConditions, 400)

    return () => {
      window.removeEventListener('blur', checkLivingConditions)
      window.removeEventListener('focusout', checkLivingConditions)
      document.removeEventListener('visibilitychange', checkLivingConditions)
      document.removeEventListener('fullscreenchange', checkLivingConditions)
      window.removeEventListener('keydown', blockTabSwitchShortcuts, true)
      clearInterval(guardInterval)
    }
  }, [enabled, revokeIsolation])

  // ── 5. Run the 5-Second Isolation Test ─────────────────────────────────────
  const startIsolationTest = useCallback(async () => {
    // 1. Check multiple tabs
    const currentTabs = getActiveTabs()
    const otherTabs = currentTabs.filter((t) => t.id !== CURRENT_TAB_ID)
    if (otherTabs.length > 0) {
      revokeIsolation(`Multiple Chrome tabs are open. Please close all other tabs before starting the test.`)
      return false
    }

    // 2. Check virtual streaming/recording devices
    if (navigator.mediaDevices?.enumerateDevices) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const matchingDevice = devices.find((d) => {
          const label = (d.label || '').toLowerCase()
          return SUSPICIOUS_APP_DEVICE_REGEX.test(label)
        })
        if (matchingDevice) {
          revokeIsolation(`Third-party streaming/recording device detected: "${matchingDevice.label}". Close all background capture software.`)
          return false
        }
      } catch (_) {}
    }

    // 3. Request Fullscreen
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
      }
      // Engage Keyboard Lock if available in Chrome
      if ('keyboard' in navigator && navigator.keyboard?.lock) {
        try {
          await navigator.keyboard.lock()
        } catch (_) {}
      }
    } catch (err) {
      revokeIsolation('Fullscreen access was denied. Fullscreen mode is required to lock out background applications.')
      return false
    }

    hasFailedRef.current = false
    isTestingRef.current = true
    setIsTesting(true)
    setFailureReason('')
    setCountdown(PROBE_DURATION_SECONDS)

    let remaining = PROBE_DURATION_SECONDS

    if (probeIntervalRef.current) clearInterval(probeIntervalRef.current)

    probeIntervalRef.current = setInterval(() => {
      // During countdown, check if focus or fullscreen was broken
      if (!document.fullscreenElement) {
        revokeIsolation('Fullscreen was exited during the test! You must remain in full-screen mode.')
        return
      }
      if (document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus())) {
        revokeIsolation('Focus was lost during the test! An external application (VS Code, WhatsApp, etc.) or notification gained focus.')
        return
      }

      remaining -= 1
      setCountdown(remaining)

      if (remaining <= 0) {
        clearInterval(probeIntervalRef.current)
        probeIntervalRef.current = null

        if (!hasFailedRef.current && document.fullscreenElement && !document.hidden) {
          isTestingRef.current = false
          isIsolatedRef.current = true
          setIsTesting(false)
          setIsIsolated(true)
          setFailureReason('')

          Swal.fire({
            icon: 'success',
            title: 'All Applications Isolated ✓',
            text: 'Fullscreen focus verified. Please proceed directly to the interview without touching any other window.',
            timer: 2000,
            showConfirmButton: false,
            background: '#161c2d',
            color: '#fff',
            customClass: {
              popup: 'border border-emerald-500/40 rounded-2xl shadow-2xl z-[999999]',
              title: 'text-lg font-bold text-white',
            },
          })
        }
      }
    }, 1000)

    return true
  }, [revokeIsolation])

  const resetIsolationTest = useCallback(() => {
    if (probeIntervalRef.current) {
      clearInterval(probeIntervalRef.current)
      probeIntervalRef.current = null
    }
    isTestingRef.current = false
    isIsolatedRef.current = false
    hasFailedRef.current = false
    setIsTesting(false)
    setIsIsolated(false)
    setFailureReason('')
    setCountdown(PROBE_DURATION_SECONDS)
  }, [])

  return {
    hasMultipleTabs,
    multiTabError,
    openTabsCount,
    notificationStatus,
    isTesting,
    countdown,
    isIsolated,
    failureReason,
    startIsolationTest,
    resetIsolationTest,
    revokeIsolation,
  }
}

export default useEnvironmentIsolation
