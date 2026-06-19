import React from 'react'

export default function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled = false,
  loading = false,
  icon = null,
  className = '',
  ...props
}) {
  const baseStyle = 'inline-flex items-center justify-center gap-2 px-6 py-3 rounded-[5px] font-semibold text-sm cursor-pointer transition-all duration-200 outline-none select-none disabled:opacity-45 disabled:cursor-not-allowed disabled:transform-none'
  
  const variants = {
    primary: 'bg-primary hover:bg-primary-hover text-white shadow-[0_18px_40px_rgba(99,102,241,0.18)] hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(99,102,241,0.22)]',
    secondary: 'bg-white/75 hover:bg-white text-slate-900 border border-slate-200 shadow-[0_10px_28px_rgba(15,23,42,0.06)] hover:-translate-y-0.5',
    danger: 'bg-danger hover:bg-red-600 text-white shadow-[0_4px_14px_rgba(239,68,68,0.15)] hover:-translate-y-0.5',
    warning: 'bg-warning hover:bg-amber-600 text-white shadow-[0_4px_14px_rgba(245,158,11,0.15)] hover:-translate-y-0.5',
    ghost: 'bg-transparent hover:bg-slate-900/5 text-slate-700 border border-transparent hover:-translate-y-0.5'
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseStyle} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!loading && icon}
      {children}
    </button>
  )
}
