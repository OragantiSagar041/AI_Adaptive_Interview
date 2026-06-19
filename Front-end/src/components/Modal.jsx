import React, { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  isOpen = false,
  onClose,
  title = '',
  subtitle = '',
  children,
  footer = null,
  maxWidth = 'max-w-2xl',
  className = '',
  ...props
}) {
  // Prevent scrolling on body when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-slate-950/45 z-[99999] flex justify-center items-center p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxWidth} bg-white border border-slate-200 rounded-[8px] flex flex-col max-h-[90vh] overflow-hidden shadow-[0_24px_70px_rgba(15,23,42,0.18)] transition-all duration-300 ${className}`}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 bg-slate-50/80">
          <div>
            {title && <h3 className="text-lg font-bold text-slate-900 leading-none">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-200 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
