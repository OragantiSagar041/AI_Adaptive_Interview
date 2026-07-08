/**
 * ScreenshotWatermark
 *
 * Renders a full-page semi-transparent watermark showing the candidate's
 * name and session ID.  This is the most effective practical countermeasure
 * against screenshots: even if we can't block the OS-level capture, every
 * screenshot is permanently stamped with the candidate's identity.
 *
 * The watermark is:
 *   - pointer-events: none  (doesn't block any UI interaction)
 *   - user-select: none     (can't be selected or copied)
 *   - position: fixed       (covers the full viewport at all times)
 *   - z-index: 9998         (below alerts/toasts but above all content)
 *
 * Usage:
 *   <ScreenshotWatermark name="John Doe" sessionId="abc-123" />
 */
import React from 'react'

export default function ScreenshotWatermark({ name, sessionId }) {
  if (!name && !sessionId) return null

  const label = [name, sessionId ? `ID: ${sessionId.slice(0, 8)}` : null]
    .filter(Boolean)
    .join('  ·  ')

  // Repeat the label in a diagonal grid to cover the full page
  const tiles = Array.from({ length: 30 })

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        pointerEvents: 'none',
        userSelect: 'none',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(10, 1fr)',
        gap: 0,
      }}
    >
      {tiles.map((_, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'rotate(-30deg)',
            opacity: 0.07,
            fontSize: '13px',
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: '0.05em',
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
          }}
        >
          🔒 {label}
        </div>
      ))}
    </div>
  )
}
