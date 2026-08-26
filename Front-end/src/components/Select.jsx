import React from 'react'

export default function Select({
  label = '',
  value = '',
  onChange,
  options = [],
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
      <select
        value={value}
        onChange={onChange}
        required={required}
        className={`w-full bg-slate-50 dark:bg-slate-900/90 border-2 border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-slate-900 dark:text-slate-100 text-[0.95rem] outline-none transition-all duration-200 focus:border-indigo-600 dark:focus:border-indigo-400 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.2)] disabled:opacity-50 cursor-pointer ${className}`}
        {...props}
      >
        {options.map((opt, idx) => {
          const val = typeof opt === 'object' ? opt.value : opt
          const labelText = typeof opt === 'object' ? opt.label : opt
          return (
            <option key={idx} value={val} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100">
              {labelText}
            </option>
          )
        })}
      </select>
    </div>
  )
}
