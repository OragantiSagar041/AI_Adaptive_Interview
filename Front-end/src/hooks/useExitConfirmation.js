/**
 * useExitConfirmation.js
 *
 * Shows a custom SweetAlert2 "Are you sure you want to leave?" dialog
 * when the candidate tries to close/refresh the tab during an active interview.
 *
 * Strategy:
 *  1. On `beforeunload` — set e.returnValue = '' to trigger the browser's
 *     native "Leave site?" prompt (required by browsers as a security measure).
 *  2. On `visibilitychange` (tab hidden) + pointer/keyboard close gestures —
 *     show a custom Swal dialog BEFORE the browser unload actually fires,
 *     giving the candidate a chance to cancel.
 *
 * Usage:
 *   useExitConfirmation({ active: true, onConfirmExit, message })
 *
 *   active       – boolean: only block when interview is in progress
 *   onConfirmExit – optional async fn to call when candidate confirms exit
 *   message      – optional custom body text
 */

import { useEffect, useRef, useCallback } from 'react'
import Swal from 'sweetalert2'

const DEFAULT_MESSAGE = `
  Your interview is still in progress.<br/><br/>
  If you leave now, your session will be marked as <strong>incomplete</strong>
  and you may not be able to re-enter.<br/><br/>
  Are you sure you want to exit?
`

export function useExitConfirmation({
  active = true,
  onConfirmExit = null,
  message = DEFAULT_MESSAGE,
} = {}) {
  const activeRef = useRef(active)
  const dialogOpenRef = useRef(false)

  // Keep ref in sync so event handlers always see latest value
  useEffect(() => {
    activeRef.current = active
  }, [active])

  // ── 1. Native browser guard (beforeunload) ─────────────────────────────────
  // Browsers require e.returnValue = '' to show their built-in dialog.
  // We cannot replace it with a custom modal here, but we show Swal BEFORE
  // the unload fires via a pointer/keyboard heuristic (see below).
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!activeRef.current) return
      // Standard cross-browser way to show the native "Leave site?" dialog
      e.preventDefault()
      e.returnValue = 'Your interview is in progress. Are you sure you want to leave?'
      return e.returnValue
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // ── 2. Custom Swal dialog on Alt+F4 / Ctrl+W / Cmd+W ─────────────────────
  const showExitDialog = useCallback(async (e) => {
    if (!activeRef.current) return
    if (dialogOpenRef.current) return // prevent stacking dialogs

    // Intercept known close shortcuts
    const isCloseShortcut =
      (e.key === 'F4' && e.altKey) ||
      ((e.ctrlKey || e.metaKey) && e.key === 'w') ||
      ((e.ctrlKey || e.metaKey) && e.key === 'W')

    if (!isCloseShortcut) return

    e.preventDefault()
    dialogOpenRef.current = true

    const result = await Swal.fire({
      title: '⚠️ Leave Interview?',
      html: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, exit interview',
      cancelButtonText: 'No, stay',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6366f1',
      allowOutsideClick: false,
      allowEscapeKey: false,
      background: '#1e1b4b',
      color: '#e2e8f0',
      customClass: {
        popup: 'exit-confirm-popup',
        title: 'exit-confirm-title',
        htmlContainer: 'exit-confirm-body',
        confirmButton: 'exit-confirm-btn',
        cancelButton: 'exit-stay-btn',
      },
    })

    dialogOpenRef.current = false

    if (result.isConfirmed) {
      if (onConfirmExit) await onConfirmExit()
      // Temporarily remove the beforeunload guard so the page can close
      window.onbeforeunload = null
      window.close()
    }
  }, [message, onConfirmExit])

  useEffect(() => {
    window.addEventListener('keydown', showExitDialog, { capture: true })
    return () => window.removeEventListener('keydown', showExitDialog, { capture: true })
  }, [showExitDialog])

  // ── 3. Intercept X-button click via mouse position heuristic ──────────────
  // When the mouse leaves the viewport through the TOP edge, it's very likely
  // heading for the browser's close button or tab bar.
  const leaveTimer = useRef(null)

  useEffect(() => {
    const handleMouseLeave = (e) => {
      if (!activeRef.current) return
      if (dialogOpenRef.current) return

      // Only trigger when leaving through the top of the window
      if (e.clientY <= 0) {
        // Small delay — avoid false positives from quick mouse movements
        leaveTimer.current = setTimeout(async () => {
          if (!activeRef.current || dialogOpenRef.current) return
          dialogOpenRef.current = true

          const result = await Swal.fire({
            title: '⚠️ Leave Interview?',
            html: message,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Yes, exit interview',
            cancelButtonText: 'No, stay',
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6366f1',
            allowOutsideClick: false,
            allowEscapeKey: false,
            background: '#1e1b4b',
            color: '#e2e8f0',
            customClass: {
              popup: 'exit-confirm-popup',
            },
          })

          dialogOpenRef.current = false

          if (result.isConfirmed) {
            if (onConfirmExit) await onConfirmExit()
            window.onbeforeunload = null
            window.close()
          }
        }, 200)
      }
    }

    const handleMouseEnter = () => {
      if (leaveTimer.current) {
        clearTimeout(leaveTimer.current)
        leaveTimer.current = null
      }
    }

    document.addEventListener('mouseleave', handleMouseLeave)
    document.addEventListener('mouseenter', handleMouseEnter)
    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave)
      document.removeEventListener('mouseenter', handleMouseEnter)
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
    }
  }, [message, onConfirmExit])
}
