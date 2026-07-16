import React from 'react'

export default function Card({ children, className = '', hoverable = false, ...props }) {
  return (
    <div
      className={`backdrop-blur-3xl border border-white/30 rounded-2xl p-6 shadow-[0_8px_40px_0_rgba(31,38,135,0.25)] transition-all duration-300 ${hoverable ? 'hover:border-white/50 hover:-translate-y-1 hover:shadow-[0_16px_56px_0_rgba(31,38,135,0.35)]' : ''} ${className}`}
      style={{
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.75) 30%, rgba(248, 250, 255, 0.7) 50%, rgba(240, 248, 255, 0.65) 70%, rgba(255, 255, 255, 0.75) 100%)',
        backdropFilter: 'blur(16px) brightness(1.05)',
        WebkitBackdropFilter: 'blur(16px) brightness(1.05)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
      }}
      {...props}
    >
      {children}
    </div>
  )
}
