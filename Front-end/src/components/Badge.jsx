import React from 'react'

export default function Badge({ variant = 'info', text = '', className = '', ...props }) {
  const baseStyle = 'px-2.5 py-1 rounded font-bold text-xs tracking-wider uppercase inline-block'
  
  const variants = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    danger: 'bg-danger/10 text-danger',
    warning: 'bg-warning/10 text-warning',
    info: 'bg-slate-100 text-slate-600',
    // Mappings for candidate list computed states
    pending: 'bg-warning/10 text-warning',
    started: 'bg-primary/10 text-primary',
    completed: 'bg-success/10 text-success',
    expired: 'bg-slate-500/10 text-slate-400'
  }

  return (
    <span
      className={`${baseStyle} ${variants[variant] || variants.info} ${className}`}
      {...props}
    >
      {props.children || text || variant}
    </span>
  )
}
