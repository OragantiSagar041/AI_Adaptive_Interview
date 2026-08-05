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
  ClipboardList,
  Palette,
  ChevronDown
} from 'lucide-react'
import logoImage from '../../assets/logo.png'
import AdminCopilot from './copilot/AdminCopilot'
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../utils/api'
import { setLiveResultsModalOpen } from '../../store/slices/interviewSlice'
import { updateAdminUser } from '../../store/slices/authSlice'

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const bigint = parseInt(h, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

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
  const [themeOpen, setThemeOpen] = useState(false)
  const notifRef = useRef(null)
  const themeRef = useRef(null)

  // Close theme popover on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeRef.current && !themeRef.current.contains(event.target)) {
        setThemeOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
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

  const baseNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/admin/dashboard' },
    { id: 'interviews', label: 'Interviews', icon: ClipboardList, path: '/admin/interviews' },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle, path: '/admin/qualified-candidates' },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle, path: '/admin/rejected-candidates' },
    { id: 'create', label: 'Create Interview', icon: Plus, path: '/admin/create-interview' },
    { id: 'ai-calling', label: 'AI Calling Agent', icon: Radio, path: '/admin/ai-calling' },

    { id: 'jobs', label: 'Jobs', icon: Briefcase, path: '/admin/jobs' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/admin/profile-settings' },
  ]
  const userFeatures = adminUser?.plan_features
  const filteredNavItems = (userFeatures && userFeatures.length > 0)
    ? baseNavItems.filter(item => userFeatures.includes(item.label))
    : baseNavItems
  const navItems = (!filteredNavItems || filteredNavItems.length === 0) ? baseNavItems : filteredNavItems

  const accentBg = hexToRgba(currentAccent.primary, 0.07)
  const accentBgEnd = hexToRgba(currentAccent.primary, 0.04)

  return (
    <div
      className="h-screen text-slate-900 flex font-sans overflow-hidden relative"
      style={{ background: '#f8fafc' }}
    >
      {/* Dynamic accent color wash — changes smoothly with theme selection */}
      <div
        className="absolute inset-0 z-0 pointer-events-none transition-all duration-700"
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(currentAccent.primary, 0.25)} 0%, transparent 50%, ${hexToRgba(currentAccent.primary, 0.15)} 100%)`
        }}
      />

      {/* Sidebar */}
      <aside
        className="hidden w-64 shrink-0 border-r border-slate-200/50 md:flex flex-col h-screen relative z-10 transition-all duration-700 overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.22)} 0%, white 30%, ${hexToRgba(currentAccent.primary, 0.12)} 100%)`
        }}
      >
        {/* Accent top strip */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5 transition-all duration-700"
          style={{ background: `linear-gradient(90deg, ${currentAccent.primary}, ${currentAccent.hover})` }}
        />

        {/* Brand / Logo */}
        <div
          className="flex items-center gap-3 px-6 h-16 border-b shrink-0 transition-all duration-700"
          style={{ borderColor: hexToRgba(currentAccent.primary, 0.25) }}
        >
          <div
            className="grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm transition-all duration-500"
            style={{ background: `linear-gradient(135deg, ${currentAccent.primary}, ${currentAccent.hover})` }}
          >
            <Zap className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-800">HireIQ</div>
            <div
              className="text-[11px] font-medium transition-colors duration-500"
              style={{ color: currentAccent.primary }}
            >
              Recruiter
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <div className="space-y-0.5 p-3 overflow-y-auto flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? `!text-white text-white font-semibold shadow-md`
                    : 'text-slate-600 hover:text-slate-900'
                }`
              }
              style={({ isActive }) => ({
                background: isActive
                  ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)`
                  : 'transparent',
                boxShadow: isActive ? `0 4px 14px ${hexToRgba(currentAccent.primary, 0.35)}` : 'none',
                color: isActive ? '#ffffff' : undefined,
              })}
              onMouseEnter={(e) => {
                if (!e.currentTarget.classList.contains('text-white') && !e.currentTarget.classList.contains('!text-white')) {
                  e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10)
                  e.currentTarget.style.color = currentAccent.primary
                } else {
                  e.currentTarget.style.color = '#ffffff'
                }
              }}
              onMouseLeave={(e) => {
                if (!e.currentTarget.classList.contains('text-white') && !e.currentTarget.classList.contains('!text-white')) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = ''
                } else {
                  e.currentTarget.style.color = '#ffffff'
                }
              }}
            >
              {({ isActive }) => (
                <>
                  {item.icon ? (
                    <item.icon size={16} className={`shrink-0 ${isActive ? '!text-white text-white' : ''}`} />
                  ) : (
                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-current opacity-60'} shrink-0`} />
                  )}
                  <span className={isActive ? '!text-white text-white font-semibold' : ''}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Bottom Sidebar Actions */}
        <div
          className="p-3 border-t space-y-0.5 shrink-0 transition-all duration-700"
          style={{ borderColor: hexToRgba(currentAccent.primary, 0.15) }}
        >
          <button
            onClick={() => dispatch(setLiveResultsModalOpen(true))}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-500 border-none bg-transparent cursor-pointer text-left"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10)
              e.currentTarget.style.color = currentAccent.primary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = ''
            }}
          >
            <Radio size={16} />
            Live Results
          </button>
          <button
            onClick={onAddCredits}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-500 border-none bg-transparent cursor-pointer text-left"
            onMouseEnter={(e) => {
              e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10)
              e.currentTarget.style.color = currentAccent.primary
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = ''
            }}
          >
            <Coins size={16} />
            Request Credits
          </button>
        </div>
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen relative z-10">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl flex items-center justify-between px-6 h-16 shadow-sm shrink-0">
          {/* Left Side: Brand & Toggles */}
          <div className="flex items-center gap-6">
            <h2 className="text-[17px] font-bold text-slate-800">Recruiter Management</h2>

            {/* Theme Toggle — single button that opens color picker */}
            <div ref={themeRef} className="relative">
              <button
                onClick={() => setThemeOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border cursor-pointer transition-all duration-200 text-sm font-semibold"
                style={{
                  background: hexToRgba(currentAccent.primary, 0.08),
                  borderColor: hexToRgba(currentAccent.primary, 0.25),
                  color: currentAccent.primary,
                }}
                title="Change theme color"
              >
                <span
                  className="w-3 h-3 rounded-full border-2 border-white shadow-sm flex-shrink-0 transition-all duration-500"
                  style={{ background: currentAccent.primary }}
                />
                <ChevronDown
                  size={13}
                  className="transition-transform duration-200"
                  style={{ transform: themeOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>

              {/* Color Picker Popover */}
              {themeOpen && (
                <div
                  className="absolute top-full left-0 mt-2 z-50 rounded-2xl shadow-xl border border-slate-200/60 p-3"
                  style={{
                    background: 'rgba(255,255,255,0.95)',
                    backdropFilter: 'blur(12px)',
                    minWidth: '160px',
                  }}
                >
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Theme Color</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(accentColors).map(([color, val]) => (
                      <button
                        key={color}
                        onClick={() => { onAccentChange(color); setThemeOpen(false); }}
                        className="group flex items-center gap-2 w-full px-2 py-1.5 rounded-xl cursor-pointer border-none text-left transition-all duration-150"
                        style={{
                          background: accentName === color ? hexToRgba(val.primary, 0.12) : 'transparent',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = hexToRgba(val.primary, 0.10)}
                        onMouseLeave={e => e.currentTarget.style.background = accentName === color ? hexToRgba(val.primary, 0.12) : 'transparent'}
                      >
                        <span
                          className="w-4 h-4 rounded-full border-2 border-white shadow flex-shrink-0 transition-transform duration-150 group-hover:scale-110"
                          style={{
                            background: `linear-gradient(135deg, ${val.primary}, ${val.hover})`,
                            boxShadow: accentName === color ? `0 0 0 2px ${val.primary}` : '0 1px 3px rgba(0,0,0,0.15)',
                          }}
                        />
                        <span
                          className="text-xs font-semibold capitalize"
                          style={{ color: accentName === color ? val.primary : '#64748b' }}
                        >
                          {color}
                        </span>
                        {accentName === color && (
                          <span className="ml-auto text-[10px] font-bold" style={{ color: val.primary }}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Credits Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1 bg-cyan-50 border border-cyan-100 text-cyan-600 rounded-full text-xs font-bold shadow-sm">
              <span className="text-[10px]">🔗</span>
              {adminUser?.credits ?? 0} credits left
            </div>
          </div>

          {/* Right Side: Notifications & User Profile */}
          <div className="flex items-center gap-5">
            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2 text-slate-400 hover:text-slate-600 bg-white border border-slate-100 hover:bg-slate-50 rounded-full transition-all cursor-pointer flex items-center justify-center shadow-sm"
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
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 font-sans">Recent Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer border-none bg-transparent"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
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
                          className={`p-3 text-left hover:bg-slate-50 cursor-pointer transition-colors flex gap-2.5 items-start ${!n.read ? 'bg-indigo-50/30' : ''}`}
                        >
                          <div className="p-1.5 rounded-lg bg-slate-50 flex-shrink-0 mt-0.5">
                            {getNotifIcon(n.type)}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 justify-between">
                              <span className={`text-xs font-bold truncate block ${!n.read ? 'text-slate-800' : 'text-slate-600'}`}>{n.title}</span>
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                            </div>
                            <p className="text-[11px] text-slate-500 leading-normal line-clamp-2 font-sans">{n.message}</p>
                            <span className="text-[9px] text-slate-400 block pt-0.5 font-sans">{formatRelativeTime(n.created_at)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="border-t border-slate-100 px-4 pt-2 pb-1 text-center">
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
            <div className="flex items-center gap-4 border-l border-slate-200 pl-5">
              <span className="text-sm text-slate-500 font-medium">
                Welcome back, <span className="font-bold text-slate-800">{userName}</span>
              </span>
              <button
                onClick={onLogout}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer bg-transparent border-none"
              >
                <LogOut size={15} /> Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 relative p-4 lg:p-8">
          {children}
        </main>
      </div>

      {/* Global Admin Copilot */}
      <AdminCopilot />
    </div>
  )
}
