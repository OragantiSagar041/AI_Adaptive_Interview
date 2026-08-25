import React from 'react'
import { useTheme } from '../context/ThemeContext'

export default function Card({ children, className = '', hoverable = false, ...props }) {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <div
      className={`backdrop-blur-3xl border rounded-2xl p-6 transition-all duration-300 ${
        isDark
          ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.3)]'
          : 'border-white/30 shadow-[0_8px_40px_0_rgba(31,38,135,0.25)]'
      } ${hoverable ? 'hover:-translate-y-1 hover:shadow-lg' : ''} ${className}`}
      style={!isDark ? {
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.75) 30%, rgba(248, 250, 255, 0.7) 50%, rgba(240, 248, 255, 0.65) 70%, rgba(255, 255, 255, 0.75) 100%)',
        backdropFilter: 'blur(16px) brightness(1.05)',
        WebkitBackdropFilter: 'blur(16px) brightness(1.05)',
        border: '1px solid rgba(255, 255, 255, 0.4)',
      } : {
        background: '#131b2e',
        border: '1px solid #26334d'
      }}
      {...props}
    >
      {children}
    </div>
  )
}
