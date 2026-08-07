import React, { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('uiTheme')
      if (saved) return saved
    } catch (e) {}
    return 'light'
  })

  useEffect(() => {
    if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
    else document.documentElement.setAttribute('data-theme', 'light')
    try { localStorage.setItem('uiTheme', theme) } catch (e) {}
  }, [theme])

  return (
    <button
      onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      title="Toggle theme"
      className={`p-2 rounded-xl hover:bg-slate-100 transition-colors border border-slate-200 bg-white ${className}`}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  )
}
