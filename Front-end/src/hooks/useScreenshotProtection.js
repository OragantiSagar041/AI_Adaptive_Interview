import { useEffect, useRef, useCallback } from 'react'

/**
 * useScreenshotProtection
 *
 * Detects screenshot keyboard shortcuts the browser can observe in Chrome,
 * fires onAttempt({ type: 'screenshot_shortcut', key }) for each, and calls
 * preventDefault() on the ones the browser can actually block.
 *
 * Covered shortcuts:
 *   PrintScreen                Chrome receives keydown before OS copies screen.
 *   Ctrl+PrintScreen           Same — full-screen OS capture.
 *   Alt+PrintScreen            Active-window capture.
 *   Ctrl+Shift+S               Browser Save-As; preventDefault() blocks it.
 *   Cmd+Shift+3/4/5/6 (macOS)  Reaches Chrome on some macOS/Chrome versions.
 *
 * NOT included: Win+Shift+S — fully OS-intercepted, browser gets nothing.
 * NOT changed:  existing tab-switch / visibilitychange detection elsewhere.
 */

const THROTTLE_MS = 3000  // ignore repeated same-key events within this window

export function useScreenshotProtection({ enabled = true, onAttempt } = {}) {
  const onAttemptRef = useRef(onAttempt)
  const lastFireRef  = useRef({})

  // Keep the ref current without restarting the effect
  useEffect(() => { onAttemptRef.current = onAttempt }, [onAttempt])

  const report = useCallback((key) => {
    const now = Date.now()
    const throttleKey = key  // throttle per distinct key string
    if (now - (lastFireRef.current[throttleKey] || 0) < THROTTLE_MS) return
    lastFireRef.current[throttleKey] = now
    onAttemptRef.current?.({ type: 'screenshot_shortcut', key })
  }, [])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e) => {
      const ctrl = e.ctrlKey
      const alt  = e.altKey
      const meta = e.metaKey
      const shift = e.shiftKey

      // Check modifier + PrintScreen combos BEFORE plain PrintScreen
      // so the right label is reported and the plain branch doesn't short-circuit.

      if (ctrl && e.key === 'PrintScreen') {
        // Cannot fully block OS-level copy, but we detect and alert.
        report('Ctrl+PrintScreen')
        return
      }

      if (alt && e.key === 'PrintScreen') {
        report('Alt+PrintScreen')
        return
      }

      if (e.key === 'PrintScreen') {
        report('PrintScreen')
        return
      }

      // Ctrl+Shift+S / Cmd+Shift+S — browser Save-As dialog.
      // preventDefault() prevents the dialog from opening.
      if ((ctrl || meta) && shift && e.key.toLowerCase() === 's') {
        e.preventDefault()
        report('Ctrl+Shift+S')
        return
      }

      // macOS Cmd+Shift+3/4/5/6 — OS normally intercepts these,
      // but Chrome on macOS does receive keydown in some configurations.
      if (meta && shift && ['3', '4', '5', '6'].includes(e.key)) {
        report(`Cmd+Shift+${e.key}`)
        return
      }
    }

    // Capture phase: we see the event before child elements,
    // which lets preventDefault() be effective.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [enabled, report])
}

export default useScreenshotProtection
