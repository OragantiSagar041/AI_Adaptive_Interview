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
  User
} from 'lucide-react'
import { logout, loadSuperAdminProfile } from '../../store/slices/authSlice'
import { persistor } from '../../store/store'
import AdminCopilot from '../admin/copilot/AdminCopilot'
import { getMasterNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../utils/api'

export default function MasterLayout() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const location = useLocation()

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

  // Local theme states
  const [accentName, setAccentName] = useState('indigo')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const notifRef = useRef(null)

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

  const accentColors = {
    teal: { primary: '#0d9488', hover: '#0f766e', glow: 'rgba(13, 148, 136, 0.15)' },
    indigo: { primary: '#6366f1', hover: '#4f46e5', glow: 'rgba(99, 102, 241, 0.15)' },
    purple: { primary: '#9333ea', hover: '#7e22ce', glow: 'rgba(147, 51, 234, 0.15)' },
    red: { primary: '#e11d48', hover: '#be123c', glow: 'rgba(225, 29, 72, 0.15)' },
    green: { primary: '#16a34a', hover: '#15803d', glow: 'rgba(22, 163, 74, 0.15)' },
    blue: { primary: '#2563eb', hover: '#1d4ed8', glow: 'rgba(37, 99, 237, 0.15)' }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo

  useEffect(() => {
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
    { id: 'plans', label: 'Plans', icon: Tags, path: '/master/plans' },
    { id: 'subscribers', label: 'Subscribers', icon: Users, path: '/master/subscribers' },
    { id: 'create-tenant', label: 'Create Tenant', icon: UserPlus, path: '/master/create-tenant' },
    { id: 'demo-requests', label: 'Demo Requests', icon: Mail, path: '/master/demo-requests' },
  ]

  const getPageTitle = () => {
    const path = location.pathname
    if (path.includes('dashboard')) return 'Subscription Monitor'
    if (path.includes('plans')) return 'Product Pricing & Plans'
    if (path.includes('subscribers')) return 'Subscribed Companies'
    if (path.includes('create-tenant')) return 'Provision Tenant Account'
    if (path.includes('demo-requests')) return 'Demo Requests'
    return 'Master Console'
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white md:flex flex-col h-screen">
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
      <div className="flex-1 flex flex-col min-w-0 h-screen">
        {/* Top bar */}
        <header
          className="relative z-30 border-b px-4 sm:px-8 py-4 flex justify-between items-center text-[#1e293b] shadow-sm backdrop-blur-md shrink-0"
          style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0.92), ${currentAccent ? `rgba(${parseInt(currentAccent.primary.slice(1,3),16)}, ${parseInt(currentAccent.primary.slice(3,5),16)}, ${parseInt(currentAccent.primary.slice(5,7),16)}, 0.14)` : 'rgba(99,102,241,0.14)'})`,
            borderColor: currentAccent ? `rgba(${parseInt(currentAccent.primary.slice(1,3),16)}, ${parseInt(currentAccent.primary.slice(3,5),16)}, ${parseInt(currentAccent.primary.slice(5,7),16)}, 0.22)` : 'rgba(99,102,241,0.22)'
          }}
        >
          {/* Left Side: Brand & Toggles */}
          <div className="flex items-center gap-6">
            <h2 className="text-[17px] font-bold text-slate-800">{getPageTitle()}</h2>
          </div>

          {/* Right Side: Toggles, Notifications & User Profile */}
          <div className="flex items-center gap-5">
            {/* Theme Toggle Dots */}
            <div className="flex items-center gap-1.5 bg-white rounded-full px-2 py-1 shadow-sm border border-slate-100">
              {Object.keys(accentColors).map(color => (
                <button
                  key={color}
                  onClick={() => setAccentName(color)}
                  className="w-4 h-4 rounded-full border border-white/50 cursor-pointer p-0 transition-all hover:scale-110"
                  style={{
                    background: accentColors[color].primary,
                    boxShadow: accentName === color ? `0 0 0 2px white, 0 0 0 4px ${accentColors[color].primary}` : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>

            <span className="text-sm text-slate-600 max-lg:hidden block ml-2">
              Welcome back, <strong className="text-slate-800">{userName}</strong>
            </span>

            {/* Notification Bell */}
            <div ref={notifRef} className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative p-2.5 text-slate-500 hover:text-slate-700 hover:bg-slate-50 bg-white rounded-xl shadow-sm border border-slate-100 transition-all cursor-pointer flex items-center justify-center"
                title="Notifications"
              >
                <Bell size={18} />
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
                            if (n.type === 'tenant_created' || n.type === 'payment') navigate('/master/subscribers')
                            else navigate('/master/dashboard')
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
            <div className="relative">
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
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
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
                </>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 p-4 lg:p-8 relative">
          <Outlet />
        </main>
      </div>
      
      {/* Global Copilot */}
      <AdminCopilot />
    </div>
  )
}
