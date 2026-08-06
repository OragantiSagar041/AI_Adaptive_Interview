import React, { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  LogOut,
  Radio,
  Briefcase,
  MessageSquare,
  Zap,
  Bell,
  Coins,
  CreditCard,
  UserCheck,
  AlertCircle,
  ClipboardList
} from 'lucide-react'
import logoImage from '../../assets/logo.png'
import AdminCopilot from './copilot/AdminCopilot'
import ThemeToggle from '../ThemeToggle'
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../utils/api'
import { setLiveResultsModalOpen } from '../../store/slices/interviewSlice'
import { updateAdminUser } from '../../store/slices/authSlice'

export default function AdminLayout({
  children,
  activeTab,
  accentColors,
  accentName,
  currentAccent,
  adminUser,
  onAccentChange,
  onLogout,
  onTabChange,
  onAddCredits,
  role,
}) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const location = useLocation()
  
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const userName = adminUser?.name || adminUser?.username || 'Admin'

  const [notifications, setNotifications] = useState([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const notifRef = useRef(null)

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

  // Real-time WebSocket synchronization
  useEffect(() => {
    if (!token || !API_BASE_URL) return

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws/dashboard?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'profile_update') {
          const currentAdminId = adminUser?.admin_id || adminUser?.id || adminUser?._id
          if (data.admin_id === currentAdminId) {
            const { admin_id, company_id, type, ...fieldsToUpdate } = data
            dispatch(updateAdminUser(fieldsToUpdate))
          }
          // Dispatch custom event so any active admin components can update
          window.dispatchEvent(new CustomEvent('admin_profile_updated', { detail: data }))
        }
      } catch (err) {
        console.error('Error parsing admin ws message:', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [dispatch, token, API_BASE_URL, adminUser])

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

  // Lock document-level scroll so only the inner <main> scrolls, not the page
  useEffect(() => {
    document.documentElement.classList.add('admin-layout')
    return () => {
      document.documentElement.classList.remove('admin-layout')
    }
  }, [])

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

  const navItems = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { id: 'interviews', label: 'Interviews', icon: ClipboardList, path: '/admin/interviews' },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle, path: '/admin/qualified-candidates' },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle, path: '/admin/rejected-candidates' },
    { id: 'create', label: 'Create Interview', icon: Plus, path: '/admin/create-interview' },
    { id: 'ai-calling', label: 'AI Calling Agent', icon: Radio, path: '/admin/ai-calling' },

    { id: 'jobs', label: 'Jobs', icon: Briefcase, path: '/admin/jobs' },
    { id: 'settings', label: 'Profile Settings', icon: Settings, path: '/admin/profile-settings' },
  ]

  return (
    <div className="h-screen bg-background text-foreground flex font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-white/95 md:flex flex-col h-screen">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-border shrink-0">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <Zap className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-foreground">HireIQ</div>
            <div className="text-[11px] text-muted-foreground">Recruiter</div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="space-y-1 p-3 overflow-y-auto flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? `text-white`
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)` : 'transparent'
              })}
            >
              {({ isActive }) => (
                <>
                  {item.icon ? (
                    <item.icon size={16} className="shrink-0" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 shrink-0" />
                  )}
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
        
        {/* Bottom Sidebar Actions */}
        <div className="p-3 border-t border-border space-y-1 shrink-0">
          <button
            onClick={() => dispatch(setLiveResultsModalOpen(true))}
            className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900 border-none bg-transparent cursor-pointer text-left"
          >
            <Radio size={16} />
            Live Results
          </button>
          <button
            onClick={onAddCredits}
            className="flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900 border-none bg-transparent cursor-pointer text-left"
          >
            <Coins size={16} />
            Available Credits
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-white flex items-center justify-between gap-10 px-6 h-16 shadow-sm shrink-0">
          {/* Left Side: Brand & Toggles */}
          <div className="flex items-center gap-6">
            <h2 className="text-[17px] font-bold text-foreground">Recruiter Management</h2>

            {/* Theme Toggle Dots */}
            <div className="flex items-center gap-2 bg-muted/70 rounded-full px-2.5 py-1.5 border border-border">
              {Object.keys(accentColors).map(color => (
                <button
                  key={color}
                  onClick={() => onAccentChange(color)}
                  className="w-3.5 h-3.5 rounded-full border-2 border-white/50 cursor-pointer p-0 transition-all hover:scale-110"
                  style={{
                    background: accentColors[color].primary,
                    borderColor: accentName === color ? 'white' : 'rgba(255,255,255,0.65)',
                    boxShadow: accentName === color ? '0 0 0 2px rgba(255,255,255,0.9)' : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>

            {/* Stacked Active Plan & Credits Badge */}
            <div className="flex flex-col justify-center px-3.5 py-1 bg-muted/80 border border-border text-foreground rounded-xl text-xs font-semibold shadow-xs shrink-0 leading-tight">
              <div className="flex items-center gap-1.5 font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                <span>Active Plan: <span className="capitalize">{adminUser?.subscription_plan || 'advance'}</span></span>
              </div>
              <div className="text-[11px] text-muted-foreground font-medium pl-3 pt-0.5">
                {adminUser?.credits ?? 0} credits left
              </div>
            </div>
          </div>

          {/* Right Side: Notifications, Theme Toggle & User Profile */}
          <div className="flex items-center gap-6">
            <ThemeToggle className="bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-sm" />
            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2 text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-muted rounded-full transition-all cursor-pointer flex items-center justify-center shadow-sm"
                title="Notifications"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-sky-500 text-white font-extrabold text-[9px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {notifDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-2xl shadow-xl py-2 z-50">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                    <span className="text-xs font-bold text-foreground font-sans">Recent Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer border-none bg-transparent"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-border">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground font-sans">No notifications</div>
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
                          className={`p-3 text-left hover:bg-muted cursor-pointer transition-colors flex gap-2.5 items-start ${!n.read ? 'bg-primary/10' : ''}`}
                        >
                          <div className="p-1.5 rounded-lg bg-muted flex-shrink-0 mt-0.5">
                            {getNotifIcon(n.type)}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className={`text-xs font-bold truncate block ${!n.read ? 'text-foreground' : 'text-muted-foreground'}`}>{n.title}</span>
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-normal line-clamp-2 font-sans">{n.message}</p>
                            <span className="text-[9px] text-muted-foreground/80 block pt-0.5 font-sans">{formatRelativeTime(n.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-border px-4 pt-2 pb-1 text-center">
                    <NavLink
                      to="/admin/notifications"
                      onClick={() => setNotifDropdownOpen(false)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline no-underline block py-1 font-sans"
                    >
                      View All Notifications
                    </NavLink>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-4 border-l border-border pl-5">
              <span className="text-sm text-muted-foreground font-medium">
                Welcome back, <span className="font-bold text-foreground">{userName}</span>
              </span>
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer bg-transparent border-none"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-background/60 relative p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* Global Admin Copilot */}
      <AdminCopilot />
    </div>
  )
}
