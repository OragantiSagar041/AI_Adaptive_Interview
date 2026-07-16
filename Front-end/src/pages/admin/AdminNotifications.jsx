import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Bell, Trash2, CheckCircle, RefreshCw, AlertCircle, Calendar, CreditCard, UserCheck, CheckCheck, Loader2 } from 'lucide-react'
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../../utils/api'

export default function AdminNotifications() {
  const token = useSelector(state => state.auth.token)
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(null)
  const [filter, setFilter] = useState('all')

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await getNotifications()
      if (res && res.status === 'success') {
        setNotifications(res.data || [])
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchNotifications()
    }
  }, [token])

  const handleMarkAsRead = async (id) => {
    setActionLoading(id)
    try {
      const res = await markNotificationAsRead(id)
      if (res && res.status === 'success') {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, read: true } : n)
        )
      }
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (id) => {
    setActionLoading(id)
    try {
      const res = await deleteNotification(id)
      if (res && res.status === 'success') {
        setNotifications(prev => prev.filter(n => n.id !== id))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkAllRead = async () => {
    setLoading(true)
    try {
      const res = await markAllNotificationsAsRead()
      if (res && res.status === 'success') {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'credits':
        return <CreditCard className="h-5 w-5 text-emerald-500" />
      case 'candidate':
        return <UserCheck className="h-5 w-5 text-indigo-500" />
      case 'system':
      default:
        return <AlertCircle className="h-5 w-5 text-amber-500" />
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
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch (e) {
      return isoString
    }
  }

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    return true
  })

  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-3xl border border-slate-200/60 shadow-[0_4px_25px_rgba(0,0,0,0.02)] gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 font-sans flex items-center gap-2">
            <Bell className="text-indigo-600 h-6 w-6" /> Notifications
          </h2>
          <p className="text-sm text-slate-500 mt-1">View interviewer updates, credit allocations, and completed session alerts.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchNotifications}
            disabled={loading}
            className="px-4 py-2 bg-white border border-slate-200/80 hover:bg-slate-50 hover:text-indigo-600 text-slate-700 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-indigo-600' : 'text-slate-400'} /> Refresh
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50 border-none"
            >
              <CheckCheck size={14} /> Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="bg-white border border-slate-200/60 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Tabs / Filters Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                filter === 'all'
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'bg-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              All Notifications ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border-none cursor-pointer ${
                filter === 'unread'
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'bg-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
        </div>

        {/* List of Notifications */}
        {loading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
            <Loader2 className="animate-spin text-indigo-600 h-8 w-8" />
            <p className="text-sm font-medium">Loading notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <Bell className="h-8 w-8 text-slate-300" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-bold text-slate-700">All caught up!</p>
              <p className="text-xs text-slate-400">No {filter === 'unread' ? 'unread ' : ''}notifications at the moment.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredNotifications.map((n) => (
              <div
                key={n.id}
                className={`flex items-start justify-between p-6 gap-4 transition-all hover:bg-slate-50/50 ${
                  !n.read ? 'bg-slate-50/20' : ''
                }`}
              >
                <div className="flex gap-4">
                  {/* Icon Indicator */}
                  <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex-shrink-0 self-start shadow-xs">
                    {getNotificationIcon(n.type)}
                  </div>
                  {/* Title and Message */}
                  <div className="space-y-1 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className={`text-sm font-bold ${!n.read ? 'text-slate-800' : 'text-slate-600'}`}>
                        {n.title}
                      </h4>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse" title="Unread" />
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-2xl">{n.message}</p>
                    <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-slate-400 font-medium pt-1">
                      <Calendar size={12} />
                      <span>{formatRelativeTime(n.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  {!n.read && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      disabled={actionLoading === n.id}
                      className="p-2 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl cursor-pointer border-none bg-transparent transition-all"
                      title="Mark as Read"
                    >
                      <CheckCircle size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={actionLoading === n.id}
                    className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-xl cursor-pointer border-none bg-transparent transition-all"
                    title="Delete Notification"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
