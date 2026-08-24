import React, { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard,
  Tags,
  Users,
  UserPlus,
  LogOut,
  Bell,
  Shield,
  CreditCard,
  AlertCircle,
  Mail,
  Zap,
  ChevronDown,
  User,
  TrendingUp,
  Check,
  Sliders
} from 'lucide-react'
import { logout, loadSuperAdminProfile } from '../../store/slices/authSlice'
import { persistor } from '../../store/store'
import AdminCopilot from '../admin/copilot/AdminCopilot'
import { getMasterNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../utils/api'

export default function MasterLayout() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const location = useLocation()

  // Enforce Light Theme for Master
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.classList.remove('dark')
  }, [])

  // Selectors
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const adminUser = useSelector(state => state.auth.adminUser)
  const userName = adminUser?.name || adminUser?.username || 'Master Admin'

  useEffect(() => {
    if (token) {
      dispatch(loadSuperAdminProfile())
    }
  }, [dispatch, token])

  useEffect(() => {
    document.documentElement.classList.add('admin-layout')
    return () => {
      document.documentElement.classList.remove('admin-layout')
    }
  }, [])

  // Local theme states
  const [accentName, setAccentNameState] = useState(() => {
    try {
      return localStorage.getItem('theme_accent') || 'indigo'
    } catch {
      return 'indigo'
    }
  })

  const setAccentName = (color) => {
    setAccentNameState(color)
    try {
      localStorage.setItem('theme_accent', color)
      window.dispatchEvent(new CustomEvent('accent_changed', { detail: color }))
    } catch (e) {
      console.error(e)
    }
  }
  const [themeOpen, setThemeOpen] = useState(false)
  const themeRef = useRef(null)
  const profileRef = useRef(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const notifRef = useRef(null)
  
  // Close theme popover, notifications, and profile dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (themeRef.current && !themeRef.current.contains(event.target)) {
        setThemeOpen(false)
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifDropdownOpen(false)
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const hexToRgba = (hex, alpha = 1) => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  const fetchNotifications = async () => {
    try {
      const res = await getMasterNotifications()
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
      case 'tenant_created':
        return <Shield size={12} className="text-indigo-500" />
      case 'payment':
        return <CreditCard size={12} className="text-emerald-500" />
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

  const accentColors = {
teal: { primary: '#2dd4bf', hover: '#14b8a6', glow: 'rgba(45, 212, 191, 0.30)' },
    indigo: { primary: '#818cf8', hover: '#6366f1', glow: 'rgba(129, 140, 248, 0.30)' },
    purple: { primary: '#c084fc', hover: '#a855f7', glow: 'rgba(192, 132, 252, 0.30)' },
    red: { primary: '#fb7185', hover: '#f43f5e', glow: 'rgba(251, 113, 133, 0.30)' },
    green: { primary: '#86efac', hover: '#4ade80', glow: 'rgba(134, 239, 172, 0.30)' },
    blue: { primary: '#60a5fa', hover: '#3b82f6', glow: 'rgba(96, 165, 250, 0.30)' }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo

  useEffect(() => {
    // Hijack Tailwind v4's native indigo CSS variables so all hardcoded classes magically update!
    document.documentElement.style.setProperty('--color-indigo-50', currentAccent.c50)
    document.documentElement.style.setProperty('--color-indigo-100', currentAccent.c100)
    document.documentElement.style.setProperty('--color-indigo-200', currentAccent.c200)
    document.documentElement.style.setProperty('--color-indigo-400', currentAccent.c500) // map 400 closely if used
    document.documentElement.style.setProperty('--color-indigo-500', currentAccent.c500)
    document.documentElement.style.setProperty('--color-indigo-600', currentAccent.primary)
    document.documentElement.style.setProperty('--color-indigo-700', currentAccent.hover)
    
    // Legacy variables just in case
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
    document.documentElement.style.setProperty('--primary-glow', currentAccent.glow)
  }, [accentName])

  const handleLogout = () => {
    sessionStorage.clear()
    dispatch(logout())
    persistor.purge()
    navigate('/login')
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/master/dashboard' },
    { id: 'company-revenue', label: 'Company Revenue', icon: TrendingUp, path: '/master/company-revenue' },
    { id: 'plans', label: 'Plans', icon: Tags, path: '/master/plans' },
    { id: 'subscribers', label: 'Subscribers', icon: Users, path: '/master/subscribers' },
    { id: 'create-tenant', label: 'Create Tenant', icon: UserPlus, path: '/master/create-tenant' },
    { id: 'customize', label: 'Customize', icon: Sliders, path: '/master/customize' },
    { id: 'demo-requests', label: 'Demo Requests', icon: Mail, path: '/master/demo-requests' },
  ]

  const getPageTitle = () => {
    const path = location.pathname
    if (path.includes('dashboard')) return 'Subscription Monitor'
    if (path.includes('company-revenue')) return 'Company-Wise Revenue Analytics'
    if (path.includes('plans')) return 'Product Pricing & Plans'
    if (path.includes('subscribers')) return 'Subscribed Companies'
    if (path.includes('create-tenant')) return 'Provision Tenant Account'
    if (path.includes('demo-requests')) return 'Demo Requests'
    return 'Master Console'
  }

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex font-sans w-full overflow-hidden relative">
      {/* Global Premium Background Grid & Dynamic Accent Gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Full-page soft color wash that changes with the theme */}
        <div
          className="absolute inset-0 transition-colors duration-700"
          style={{
            background: `linear-gradient(135deg, ${currentAccent.primary}38 0%, transparent 50%, ${currentAccent.primary}28 100%)`
          }}
        />
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-grid-fine opacity-60" />
      </div>

      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white/80 backdrop-blur-md md:flex flex-col h-screen relative z-10">
        {/* Brand / Logo */}
        <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-200 shrink-0">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <Zap className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">HireIQ</div>
            <div className="text-[11px] text-slate-500">Master Admin</div>
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
                    ? 'text-white'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)` : 'transparent'
              })}
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Bottom Sidebar Actions */}
    
      </aside>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen relative z-10">
        {/* Top bar */}
        <header className="relative z-30 border-b border-slate-200 bg-white px-4 sm:px-8 py-4 flex justify-between items-center text-foreground shadow-sm backdrop-blur-md shrink-0">
          {/* Left Side: Brand & Toggles */}
          <div className="flex items-center gap-8">
            <h2 className="text-[17px] font-bold text-slate-800">{getPageTitle()}</h2>
          </div>

          {/* Right Side: Toggles, Notifications & User Profile */}
          <div className="flex items-center gap-6">
              {/* Theme Toggle — single button + popover */}
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
                      background: 'rgba(255,255,255,0.97)',
                      backdropFilter: 'blur(12px)',
                      minWidth: '160px',
                    }}
                  >
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Theme Color</p>
                    <div className="flex flex-col gap-0.5">
                      {Object.entries(accentColors).map(([color, val]) => (
                        <button
                          key={color}
                          onClick={() => { setAccentName(color); setThemeOpen(false); }}
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

            <span className="text-sm text-slate-600 max-lg:hidden block ml-2">
              Welcome back, <strong className="text-slate-800">{userName}</strong>
            </span>

            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2.5 text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-full transition-all cursor-pointer flex items-center justify-center shadow-xs"
                title="Notifications"
              >
                <Bell size={18} className="text-slate-600" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-sky-500 text-white font-extrabold text-[9px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center shadow-sm border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </button>

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
                            navigate('/master/notifications')
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
                      to="/master/notifications"
                      onClick={() => setNotifDropdownOpen(false)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline no-underline block py-1 font-sans"
                    >
                      View All Notifications
                    </NavLink>
                  </div>
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div ref={profileRef} className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1.5 px-2 hover:bg-slate-50 rounded-xl shadow-sm transition-all cursor-pointer border border-slate-100 bg-white"
              >
                <img
                  src={adminUser?.profile_image || adminUser?.avatar || "https://ui-avatars.com/api/?name=Master&background=random"}
                  alt="Avatar"
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
                <div className="text-left hidden sm:block">
                  <div className="text-[13px] font-semibold text-slate-800 leading-none">{userName}</div>
                  <span className="text-[10px] text-slate-400 font-medium">Master Control</span>
                </div>
                <ChevronDown size={14} className="text-slate-400 ml-1" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                    <NavLink
                      to="/master/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 no-underline"
                    >
                      <User size={15} /> My Profile
                    </NavLink>

                    <hr className="border-slate-100 my-1" />
                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        handleLogout();
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-medium cursor-pointer border-none bg-transparent"
                    >
                      <LogOut size={15} /> Logout
                    </button>
                  </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-transparent p-4 lg:p-8 relative">
          <Outlet />
        </main>
      </div>
      
      {/* Global Copilot */}
      <AdminCopilot />
    </div>
  )
}