import React from 'react'

export default function Card({ children, className = '', hoverable = false, ...props }) {
  return (
    <div
      className={`border rounded-2xl p-6 transition-all duration-300 bg-card text-card-foreground border-border shadow-[var(--shadow-card)] ${
        hoverable ? 'hover:-translate-y-1 hover:shadow-lg' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
