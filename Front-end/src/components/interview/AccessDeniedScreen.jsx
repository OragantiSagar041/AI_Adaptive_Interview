import React, { useState, useEffect } from 'react'
import { AlertTriangle, RefreshCw, LogOut, Clock, CheckCircle } from 'lucide-react'

export default function AccessDeniedScreen({ error, scheduledStart }) {
  const [currentTime, setCurrentTime] = useState(Date.now())

  // Determine target scheduled timestamp
  const targetTimestamp = React.useMemo(() => {
    if (scheduledStart) {
      const normalized = scheduledStart.endsWith('Z') || scheduledStart.includes('+')
        ? scheduledStart
        : scheduledStart + 'Z'
      const parsed = new Date(normalized).getTime()
      if (!isNaN(parsed)) return parsed
    }
    return null
  }, [scheduledStart])

  // Update current time every second if target timestamp is in the future
  useEffect(() => {
    if (!targetTimestamp) return
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    return () => clearInterval(interval)
  }, [targetTimestamp])

  const isExpiredOrDeactivated = React.useMemo(() => {
    if (!error) return false
    const lower = error.toLowerCase()
    return lower.includes('expired') || lower.includes('deactivated') || lower.includes('already been completed')
  }, [error])

  const isScheduleError = !!targetTimestamp
  const isTimeReached = targetTimestamp ? currentTime >= targetTimestamp : !isExpiredOrDeactivated
  const diffMs = targetTimestamp ? Math.max(0, targetTimestamp - currentTime) : 0

  const formatCountdown = (ms) => {
    const totalSeconds = Math.floor(ms / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`
    }
    return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
  }

  const handleExit = () => {
    window.location.replace('https://www.google.com')
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="flex justify-center items-center h-screen flex-col p-6 text-center bg-slate-50">
      <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 text-amber-500 shadow-sm border border-amber-100">
        <AlertTriangle size={36} />
      </div>
      
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Access Denied</h2>
      
      <p className="text-slate-600 mt-2 max-w-md text-sm leading-relaxed">
        {error || "Unable to access this interview session."}
      </p>

      {/* Countdown Timer if scheduled for future */}
      {isScheduleError && !isTimeReached && (
        <div className="inline-flex items-center gap-2 px-4 py-2 mt-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold shadow-sm">
          <Clock size={14} className="animate-pulse text-amber-600" />
          <span>Starts in: {formatCountdown(diffMs)}</span>
        </div>
      )}

      {isScheduleError && isTimeReached && (
        <div className="inline-flex items-center gap-2 px-4 py-2 mt-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-sm">
          <CheckCircle size={14} className="text-emerald-600" />
          <span>Scheduled time has arrived! You can now start the interview.</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-3 mt-6">
        {/* If time is reached, show Refresh / Try Again button */}
        {isTimeReached ? (
          <button
            onClick={handleRefresh}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-primary hover:bg-primary-hover text-white transition-all shadow-[0_4px_14px_rgba(99,102,241,0.15)] border-0 cursor-pointer active:scale-95"
          >
            <RefreshCw size={16} />
            <span>Try Again & Refresh</span>
          </button>
        ) : (
          /* Rest of time (before scheduled time), show ONLY Exit button */
          <button
            onClick={handleExit}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full font-semibold text-sm bg-slate-800 hover:bg-slate-900 text-white transition-all shadow-[0_4px_14px_rgba(15,23,42,0.15)] border-0 cursor-pointer active:scale-95"
          >
            <LogOut size={16} />
            <span>Exit</span>
          </button>
        )}
      </div>
    </div>
  )
}
