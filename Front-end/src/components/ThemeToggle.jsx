import React, { useEffect, useState } from 'react'
import { Sun, Moon } from 'lucide-react'

export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('uiTheme')
      if (saved) return saved
    } catch (e) {}
    return document.documentElement.getAttribute('data-theme') || 'light'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.setAttribute('data-theme', 'light')
      document.documentElement.classList.remove('dark')
    }
    try {
      localStorage.setItem('uiTheme', theme)
    } catch (e) {}
  }, [theme])

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'))
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
      className={`p-2.5 rounded-2xl transition-all border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-slate-600 dark:text-amber-400 hover:bg-slate-50 dark:hover:bg-zinc-700 shadow-sm flex items-center justify-center cursor-pointer ${className}`}
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <Sun size={18} className="text-amber-400" />
      ) : (
        <Moon size={18} className="text-slate-600" />
      )}
    </button>
  )
}
