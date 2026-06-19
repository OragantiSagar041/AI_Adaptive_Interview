import React from 'react'

export default function Textarea({
  label = '',
  error = '',
  className = '',
  wrapperClassName = '',
  required = false,
  ...props
}) {
  return (
    <div className={`flex flex-col gap-1.5 w-full ${wrapperClassName}`}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <textarea
        required={required}
        className={`w-full bg-slate-50/95 border border-slate-200 rounded-[5px] px-4 py-2.5 text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400 min-h-[80px] resize-vertical disabled:opacity-50 ${error ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-danger font-medium mt-0.5">{error}</span>}
    </div>
  )
}
