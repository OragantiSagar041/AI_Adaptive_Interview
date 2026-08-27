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
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <textarea
        required={required}
        className={`w-full bg-slate-50 dark:bg-slate-900/90 border-2 border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-slate-900 dark:text-slate-100 text-[0.95rem] outline-none transition-all duration-200 focus:border-indigo-600 dark:focus:border-indigo-400 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.2)] placeholder:text-slate-400 dark:placeholder:text-slate-500 min-h-[80px] resize-vertical disabled:opacity-50 ${error ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-danger font-medium mt-0.5">{error}</span>}
    </div>
  )
}
