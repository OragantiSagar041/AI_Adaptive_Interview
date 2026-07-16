import React from 'react'

export default function Card({ children, className = '', hoverable = false, ...props }) {
  return (
    <div
      className={`bg-white/85 backdrop-blur-md border border-slate-900/8 rounded-[8px] p-6 shadow-[0_18px_40px_rgba(17,24,39,0.06)] transition-all duration-200 ${hoverable ? 'hover:border-primary/25 hover:-translate-y-0.5' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
