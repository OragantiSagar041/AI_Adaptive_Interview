import React, { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function Input({
  label = '',
  error = '',
  type = 'text',
  className = '',
  wrapperClassName = '',
  required = false,
  ...props
}) {
  const [showPassword, setShowPassword] = useState(false)
  const isPassword = type === 'password'
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type

  return (
    <div className={`flex flex-col gap-1.5 w-full ${wrapperClassName}`}>
      {label && (
        <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {label} {required && <span className="text-danger">*</span>}
        </label>
      )}
      <div className="relative w-full">
        <input
          type={inputType}
          required={required}
          className={`w-full bg-slate-50/95 border border-slate-200 rounded-[5px] px-4 py-2.5 ${isPassword ? 'pr-10' : ''} text-slate-900 text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400 disabled:opacity-50 ${error ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.12)]' : ''} ${className}`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            onMouseDown={(e) => e.preventDefault()}
            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
      {error && <span className="text-xs text-danger font-medium mt-0.5">{error}</span>}
    </div>
  )
}
