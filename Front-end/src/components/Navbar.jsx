
import React, { useState, useEffect, useRef } from 'react'
import { useSelector } from 'react-redux'
import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, Bell, CreditCard, AlertCircle, UserCheck } from 'lucide-react'
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../utils/api'

import ThemeToggle from './ThemeToggle'

export default function Navbar({
  adminUser,
  onLogout,
  onAddCredits,
}) {
  const token = useSelector(state => state.auth.token)
  const [notifications, setNotifications] = useState([])
  const navigate = useNavigate()
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }

  }, [])

  const fetchNotifications = async () => {
    try {
      const res = await getNotifications()
      if (res && res.status === 'success') {
        setNotifications(res.data || [])
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (token) {
      fetchNotifications()
      const interval = setInterval(fetchNotifications, 30000)
      return () => clearInterval(interval)
    }

  }, [token])

  const handleMarkRead = async (id) => {
    try {
      const res = await markNotificationAsRead(id)
      if (res && res.status === 'success') {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, read: true } : n)
        )
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      const res = await markAllNotificationsAsRead()
      if (res && res.status === 'success') {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length

  const getNotifIcon = (type) => {
    switch (type) {
      case 'credits':
        return <CreditCard size={12} className="text-emerald-500" />
      case 'candidate':
        return <UserCheck size={12} className="text-indigo-500" />
      case 'system':
      default:
        return <AlertCircle size={12} className="text-amber-500" />
    }
  }

  const formatRelativeTime = (isoString) => {
    if (!isoString) return 'Just now'
    try {
      const date = new Date(isoString)
      const now = new Date()
      const diffMs = now - date
      const diffMins = Math.floor(diffMs / 60000)
      const diffHours = Math.floor(diffMins / 60)
      const diffDays = Math.floor(diffHours / 24)

      if (diffMins < 1) return 'Just now'
      if (diffMins < 60) return `${diffMins}m ago`
      if (diffHours < 24) return `${diffHours}h ago`
      if (diffDays === 1) return 'Yesterday'
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch (e) {
      return isoString
    }
  }

  return (
    <header
      className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#131b2e] flex items-center justify-between px-6 h-16 shadow-sm shrink-0 transition-colors"
    >
      <div>
        <h2 className="text-[17px] font-bold text-slate-800 dark:text-slate-100">Recruiter Management</h2>
      </div>

      <div className="flex items-center gap-6">

        <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full pl-4 pr-1.5 py-1 text-sm font-bold shadow-sm">
          <i className="fas fa-layer-group text-[10px]"></i>
          {adminUser?.subscription_plan || 'Advance'} • {adminUser?.credits ?? 0} credits left
          <button
            onClick={onAddCredits}
            className="ml-1 w-5 h-5 flex items-center justify-center bg-indigo-600 text-white rounded-full hover:bg-indigo-700 shadow-md transition-colors border-none cursor-pointer"
            title={adminUser?.role === 'superadmin' ? 'Buy Credits' : 'Request Credits'}
          >
            <i className="fas fa-plus text-[10px]"></i>
          </button>
        </div>

        <ThemeToggle />

        {/* Notification Bell */}
        <div ref={notifRef} className="relative flex items-center">
          <button
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1120] flex items-center justify-center"
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-indigo-600 text-white font-extrabold text-[9px] min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>
          {notifDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifDropdownOpen(false)} />
              <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#131b2e] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl py-2 z-50">
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-sans">Recent Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer border-none bg-transparent"
                    >
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-sans">No notifications</div>
                  ) : (
                    notifications.slice(0, 5).map(n => (
                      <div
                        key={n.id}
                        onClick={() => {
                          if (!n.read) handleMarkRead(n.id)
                          setNotifDropdownOpen(false)
                          if (n.type === 'candidate') navigate('/admin/dashboard')
                          else if (n.type === 'credits') navigate('/admin/profile-settings')
                          else navigate('/admin/dashboard')
                        }}
                        className={`p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors flex gap-2.5 items-start ${!n.read ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''
                          }`}
                      >
                        <div className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 flex-shrink-0 mt-0.5 animate-none">
                          {getNotifIcon(n.type)}
                        </div>
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex items-center gap-1.5 justify-between">
                            <span className={`text-xs font-bold truncate block ${!n.read ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}>{n.title}</span>
                            {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal line-clamp-2 font-sans">{n.message}</p>
                          <span className="text-[9px] text-slate-400 block pt-0.5 font-sans">{formatRelativeTime(n.created_at)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 px-4 pt-2 pb-1 text-center">
                  <NavLink
                    to="/admin/notifications"
                    onClick={() => setNotifDropdownOpen(false)}
                    className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline no-underline block py-1 font-sans"
                  >
                    View All Notifications
                  </NavLink>
                </div>
              </div>
            </>
          )}
        </div>

        <span className="text-sm text-slate-600 dark:text-slate-300">
          Welcome back, <strong className="text-slate-800 dark:text-white">{adminUser?.name || 'admin'}</strong>
        </span>

        <button
          onClick={onLogout}
          className="px-3 py-1.5 bg-transparent border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 text-xs font-semibold"
        >
          <LogOut size={14} /> Logout
        </button>
      </div>
    </header>
  )
}
