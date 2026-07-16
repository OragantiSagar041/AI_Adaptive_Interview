import { useEffect, useRef, useCallback } from 'react'

/**
 * useExamSecurity
 *
 * Browser-level exam security layer.
 * Plugs into the existing violation flow via onViolation({ type, message }).
 *
 * Features:
 *   1. Copy / Cut / Paste / Print / Save shortcut blocking
 *   2. DevTools detection  (window-size heuristic)
 *   3. Window blur detection  (sustained focus loss, not brief notifications)
 *   4. Multiple monitor warning  (window.screen.isExtended, Chrome 111+)
 *
 * Screenshot / PrintScreen detection is handled exclusively by
 * useScreenshotProtection to avoid duplicate keydown listeners and
 * double-counting violations.
 *
 * Violation types emitted:
 *   clipboard_attempt  — Ctrl+C / Ctrl+X / Ctrl+V (during active interview)
 *   print_attempt      — Ctrl+P
 *   save_attempt       — Ctrl+S
 *   screenshot_shortcut— Ctrl+Shift+S (browser Save-As)
 *   devtools_open      — docked DevTools detected via viewport size heuristic
 *   window_blur        — window lost focus for > BLUR_GRACE_MS
 *   multi_monitor      — window.screen.isExtended === true
 *
 * NOTE: clipboard_attempt, devtools_open, window_blur, and multi_monitor are
 * advisory violations — they are logged to the backend but do NOT count
 * toward the face-alert termination counter (they are not security-critical
 * enough to terminate an interview on their own).  The caller should route
 * them through recordAlertMetric / logProctoringAlert normally; the counter
 * logic inside those functions skips types that are not 'tab_switch' or
 * 'noise_alert' but the backend still records them for review.
 */

// DevTools: viewport shrinks by more than this → docked panel is open
const DEVTOOLS_THRESHOLD_PX = 160

// Per-type minimum gap between consecutive reports
const THROTTLE_MS = 8000

// Window-blur grace period — short OS notifications/tooltips last < 1.5 s
// Raise to 2 s so the candidate can briefly click a reference window without
// triggering a false positive.
const BLUR_GRACE_MS = 2000

export function useExamSecurity({ enabled = true, onViolation } = {}) {
  const onViolationRef  = useRef(onViolation)
  const lastFireRef     = useRef({})
  const blurTimerRef    = useRef(null)
  const devtoolsOpenRef = useRef(false)
  const multiMonChecked = useRef(false)

  useEffect(() => { onViolationRef.current = onViolation }, [onViolation])

  const report = useCallback((type, message) => {
    const now = Date.now()
    if (now - (lastFireRef.current[type] || 0) < THROTTLE_MS) return
    lastFireRef.current[type] = now
    onViolationRef.current?.({ type, message })
  }, [])

  // ─── 1. Keyboard shortcut blocking ────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    // DOM-level copy/cut/paste (right-click menu, programmatic API)
    const blockClipboard = (e) => {
      e.preventDefault()
      report('clipboard_attempt', 'Copying or pasting content is not allowed during the interview.')
    }

    const onKeyDown = (e) => {
      const ctrl  = e.ctrlKey || e.metaKey
      const shift = e.shiftKey
      if (!ctrl) return

      const key = e.key.toLowerCase()

      // Clipboard
      if (key === 'c' || key === 'x' || key === 'v') {
        e.preventDefault()
        report('clipboard_attempt', 'Copying or pasting content is not allowed during the interview.')
        return
      }

      // Print
      if (key === 'p' && !shift) {
        e.preventDefault()
        report('print_attempt', 'Printing is not allowed during the interview.')
        return
      }

      // Save page
      if (key === 's' && !shift) {
        e.preventDefault()
        report('save_attempt', 'Saving the page is not allowed during the interview.')
        return
      }

      // Ctrl+Shift+S (browser Save-As)
      // Note: plain PrintScreen / Ctrl+PrintScreen / Alt+PrintScreen are handled
      // exclusively by useScreenshotProtection — do NOT add them here.
      if (key === 's' && shift) {
        e.preventDefault()
        report('screenshot_shortcut', 'Screenshots are not allowed during this interview.')
        return
      }

      // Ctrl+A (select all — often precedes copy)
      if (key === 'a') {
        e.preventDefault()
        return
      }
    }

    document.addEventListener('copy',  blockClipboard)
    document.addEventListener('cut',   blockClipboard)
    document.addEventListener('paste', blockClipboard)
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('copy',  blockClipboard)
      document.removeEventListener('cut',   blockClipboard)
      document.removeEventListener('paste', blockClipboard)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [enabled, report])

  // ─── 2. DevTools detection ────────────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const checkDevTools = () => {
      const isOpen =
        window.outerWidth  - window.innerWidth  > DEVTOOLS_THRESHOLD_PX ||
        window.outerHeight - window.innerHeight > DEVTOOLS_THRESHOLD_PX

      if (isOpen && !devtoolsOpenRef.current) {
        devtoolsOpenRef.current = true
        report('devtools_open', 'Developer tools are not allowed during the interview.')
      } else if (!isOpen) {
        devtoolsOpenRef.current = false
      }
    }

    const interval = setInterval(checkDevTools, 1500)
    return () => clearInterval(interval)
  }, [enabled, report])

  // ─── 3. Window blur detection ─────────────────────────────────────────────
  // Fires only after BLUR_GRACE_MS of sustained focus loss to avoid false
  // positives from OS notifications, brief alt-tabs to reference material, etc.
  useEffect(() => {
    if (!enabled) return

    const onBlur = () => {
      blurTimerRef.current = setTimeout(() => {
        report('window_blur', 'Switching to another application is not allowed during the interview.')
      }, BLUR_GRACE_MS)
    }

    const onFocus = () => {
      if (blurTimerRef.current) {
        clearTimeout(blurTimerRef.current)
        blurTimerRef.current = null
      }
    }

    window.addEventListener('blur',  onBlur)
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('blur',  onBlur)
      window.removeEventListener('focus', onFocus)
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current)
    }
  }, [enabled, report])

  // ─── 4. Multiple monitor warning ──────────────────────────────────────────
  useEffect(() => {
    if (!enabled) return
    if (multiMonChecked.current) return
    multiMonChecked.current = true

    if (typeof window.screen?.isExtended === 'boolean' && window.screen.isExtended) {
      report('multi_monitor', 'Multiple monitors detected. Please use a single display during the interview.')
    }

    const onChange = () => {
      if (typeof window.screen?.isExtended === 'boolean' && window.screen.isExtended) {
        report('multi_monitor', 'Multiple monitors detected. Please use a single display during the interview.')
      }
    }

    window.screen?.addEventListener?.('change', onChange)
    return () => window.screen?.removeEventListener?.('change', onChange)
  }, [enabled, report])
}

export default useExamSecurity
