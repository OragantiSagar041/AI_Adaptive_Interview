import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ShieldAlert, Volume2, Eye } from 'lucide-react'

// ─── Styles injected once ────────────────────────────────────────────────────
const STYLE_ID = 'proctoring-alerts-styles'
if (!document.getElementById(STYLE_ID)) {
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    @keyframes alertSlideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes alertPulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.7; }
    }
    .proctoring-alert-pill {
      position: fixed;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 18px;
      border-radius: 999px;
      font-family: inherit;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
      pointer-events: none;
      animation: alertSlideDown 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
      letter-spacing: 0.01em;
    }
    .proctoring-alert-pill .alert-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .proctoring-alert-pill .alert-label {
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.75;
      margin-right: 2px;
    }
    .proctoring-alert-pill .alert-count {
      font-size: 11px;
      opacity: 0.65;
      margin-left: 6px;
      background: rgba(255,255,255,0.12);
      padding: 1px 7px;
      border-radius: 999px;
    }
    .proctoring-alert-pill.alert-red {
      background: rgba(22, 10, 10, 0.85);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(239, 68, 68, 0.35);
      color: #fca5a5;
    }
    .proctoring-alert-pill.alert-red .alert-icon {
      background: rgba(239, 68, 68, 0.2);
      color: #ef4444;
    }
    .proctoring-alert-pill.alert-amber {
      background: rgba(20, 14, 4, 0.85);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
      border: 1px solid rgba(245, 158, 11, 0.35);
      color: #fcd34d;
    }
    .proctoring-alert-pill.alert-amber .alert-icon {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
    }
    .proctoring-alert-pill.alert-pulse {
      animation: alertSlideDown 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
                 alertPulse 1.2s ease-in-out 0.25s infinite;
    }
  `
  document.head.appendChild(style)
}

// ─── Component ────────────────────────────────────────────────────────────────
/**
 * ProctoringAlerts
 *
 * Renders a stacked set of proctoring notification pills at the very top-center
 * of the viewport. Fully separate from Swal — no overlap possible.
 *
 * Props:
 *  faceAlertCount   {number}  — current face alert tally
 *  noiseAlertCount  {number}  — current noise alert tally
 *  showNoiseBanner  {boolean} — whether the noise banner should be visible
 *  securityMessage  {string}  — transient security/screenshot message (auto-hides)
 */
export default function ProctoringAlerts({
  faceAlertCount = 0,
  noiseAlertCount = 0,
  showNoiseBanner = false,
  securityMessage = '',
}) {
  const FACE_TOP    = 16
  const GAP         = 52 // px between stacked pills

  // Build the stack of active banners top-down
  const stack = []
  if (faceAlertCount > 0)   stack.push('face')
  if (showNoiseBanner)       stack.push('noise')
  if (securityMessage)       stack.push('security')

  return createPortal(
    <>
      {/* ── Face Alert Pill ─────────────────────────── */}
      {faceAlertCount > 0 && (
        <div
          className="proctoring-alert-pill alert-red alert-pulse"
          style={{ top: FACE_TOP }}
        >
          <span className="alert-icon">
            <Eye size={13} />
          </span>
          <span className="alert-label">Face Alert</span>
          Face not detected
          <span className="alert-count">{faceAlertCount}/20</span>
        </div>
      )}

      {/* ── Noise Alert Pill ─────────────────────────── */}
      {showNoiseBanner && (
        <div
          className="proctoring-alert-pill alert-amber"
          style={{ top: FACE_TOP + (faceAlertCount > 0 ? GAP : 0) }}
        >
          <span className="alert-icon">
            <Volume2 size={13} />
          </span>
          <span className="alert-label">Noise Alert</span>
          Background noise detected
          <span className="alert-count">{noiseAlertCount}/10</span>
        </div>
      )}

      {/* ── Security / Screenshot Alert Pill ─────────── */}
      {securityMessage && (
        <div
          className="proctoring-alert-pill alert-red"
          style={{
            top: FACE_TOP +
              (faceAlertCount > 0 ? GAP : 0) +
              (showNoiseBanner ? GAP : 0)
          }}
        >
          <span className="alert-icon">
            <ShieldAlert size={13} />
          </span>
          <span className="alert-label">Security</span>
          {securityMessage}
        </div>
      )}
    </>,
    document.body
  )
}
