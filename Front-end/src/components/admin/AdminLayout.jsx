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
  ChevronDown,
  User
} from 'lucide-react'
import logoImage from '../../assets/logo.png'
import AdminCopilot from './copilot/AdminCopilot'
import ThemeToggle from '../ThemeToggle'
import { useTheme } from '../../context/ThemeContext'
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
  role,
  activeTab,
  adminUser,
  onLogout,
  onAddCredits,
  onTabChange,
  children
}) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const location = useLocation()

  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const userName = adminUser?.name || adminUser?.username || 'Admin'

  const [notifications, setNotifications] = useState([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const notifRef = useRef(null)
  const themeRef = useRef(null)
  const profileRef = useRef(null)

  // Close popovers and dropdowns on outside click
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
  ]
  const userFeatures = adminUser?.plan_features
  const filteredNavItems = (userFeatures && userFeatures.length > 0)
    ? baseNavItems.filter(item => item.id === 'dashboard' || item.id === 'settings' || userFeatures.includes(item.label))
    : baseNavItems
  const navItems = (!filteredNavItems || filteredNavItems.length === 0) ? baseNavItems : filteredNavItems

  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const layoutConfig = adminUser?.layout_config;

  return (
    <div className="h-screen text-slate-900 dark:text-slate-100 flex font-sans overflow-hidden relative bg-slate-50 dark:bg-slate-950">
      {/* Sidebar (Vertical Layout) */}
      {layoutConfig?.layout_type !== "navbar" && (
        <aside className="hidden w-64 shrink-0 border-r border-slate-200/80 dark:border-slate-800 md:flex flex-col h-screen relative z-10 transition-colors duration-300 overflow-hidden bg-white dark:bg-[#0b1120]">
          {/* Brand / Logo */}
          <div className="flex items-center gap-3 px-6 h-16 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
            <div
              className="flex items-center justify-center h-8 rounded-lg text-white shadow-sm overflow-hidden bg-indigo-600"
              style={{
                width: layoutConfig?.navbar_logo ? 'auto' : '2rem'
              }}
            >
              {layoutConfig?.navbar_logo ? (
                <img src={layoutConfig.navbar_logo} alt="Logo" className="h-full w-auto object-contain" />
              ) : layoutConfig?.favicon ? (
                <img src={layoutConfig.favicon} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Zap className="h-4 w-4 text-white" />
              )}
            </div>
            <div className="leading-tight truncate">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={adminUser?.company_name || 'HireIQ'}>
                {adminUser?.company_name || 'HireIQ'}
              </div>
              <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
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
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                    ? '!bg-indigo-600 !text-white font-semibold shadow-md shadow-indigo-500/20'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400'
                  }`
                }
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
          <div className="p-3 border-t space-y-0.5 shrink-0 transition-colors border-slate-200/80 dark:border-slate-800">
            <button
              onClick={() => dispatch(setLiveResultsModalOpen(true))}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400 border-none bg-transparent cursor-pointer text-left"
            >
              <Radio size={16} />
              Live Results
            </button>
            <button
              onClick={onAddCredits}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400 border-none bg-transparent cursor-pointer text-left"
            >
              <Coins size={16} />
              Request Credits
            </button>
          </div>
        </aside>
      )}

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen relative z-10">
        {/* Top Header Section */}
        <div className="sticky top-0 z-30 flex flex-col bg-white/70 dark:bg-slate-900/80 backdrop-blur-xl shadow-sm shrink-0 border-b border-slate-200/60 dark:border-slate-800">

          <header className="flex items-center justify-between px-6 h-16 w-full">
            {/* Left Side: Brand & Toggles */}
            <div className="flex items-center gap-6">

              {/* If Navbar mode, show logo in the top bar */}
              {layoutConfig?.layout_type === "navbar" && (
                <div className="flex items-center gap-3 border-r border-slate-200/60 dark:border-slate-800 pr-6 mr-2">
                  <div
                    className="flex items-center justify-center h-8 rounded-lg text-white shadow-sm transition-all duration-500 overflow-hidden bg-indigo-600"
                    style={{
                      width: layoutConfig?.navbar_logo ? 'auto' : '2rem',
                    }}
                  >
                    {layoutConfig?.navbar_logo ? (
                      <img src={layoutConfig.navbar_logo} alt="Logo" className="h-full w-auto object-contain" />
                    ) : layoutConfig?.favicon ? (
                      <img src={layoutConfig.favicon} alt="Logo" className="h-full w-full object-contain" />
                    ) : (
                      <Zap className="h-4 w-4 text-white" />
                    )}
                  </div>
                  <div className="leading-tight hidden sm:block truncate max-w-[150px]">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={adminUser?.company_name || 'HireIQ'}>
                      {adminUser?.company_name || 'HireIQ'}
                    </div>
                    <div className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">Recruiter</div>
                  </div>
                </div>
              )}

              <h2 className="text-[17px] font-bold text-slate-800 hidden md:block">Recruiter Management</h2>
            </div>

            {/* Right Side: Notifications & User Profile */}
            <div className="flex items-center gap-4">
              <ThemeToggle />
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
              </div>

              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 p-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800/80 rounded-xl shadow-sm transition-all cursor-pointer border border-slate-200/60 dark:border-slate-700/60 bg-white dark:bg-slate-900/50"
                >
                  <img
                    src={adminUser?.profile_image || adminUser?.avatar || "https://ui-avatars.com/api/?name=Recruiter&background=random"}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-slate-700"
                  />
                  <div className="text-left hidden sm:block">
                    <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-none">
                      {adminUser?.name || 'Recruiter'}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">Recruiter</span>
                  </div>
                  <ChevronDown size={14} className="text-slate-400 ml-1" />
                </button>

                {dropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDropdownOpen(false)} />
                    <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                      <NavLink
                        to="/admin/profile-settings"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 no-underline"
                      >
                        <User size={15} /> My Profile
                      </NavLink>

                      <hr className="border-slate-100 my-1" />
                      <button
                        onClick={() => {
                          setDropdownOpen(false);
                          if (onLogout) onLogout();
                        }}
                        className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 font-medium cursor-pointer border-none bg-transparent"
                      >
                        <LogOut size={15} /> Logout
                      </button>
                    </div>
                    )
  }
                  </div >
              </div >
            </div >
          </header >

          {/* Horizontal Navbar (Navbar Layout) */}
          {
            layoutConfig?.layout_type === "navbar" && (
              <div
                className="flex items-center gap-1 px-6 h-14 border-t border-slate-200/40 overflow-x-auto hide-scrollbar bg-white dark:bg-[#0b1120]"
              >
                {navItems.map((item) => (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${isActive
                        ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {item.icon && <item.icon size={15} className={`shrink-0 ${isActive ? '!text-white text-white' : ''}`} />}
                        <span>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
                <div className="ml-auto flex items-center gap-2 pl-4 border-l border-slate-200/50">
                  <button
                    onClick={() => dispatch(setLiveResultsModalOpen(true))}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Radio size={15} />
                    Live Results
                  </button>
                  <button
                    onClick={onAddCredits}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 whitespace-nowrap shrink-0"
                  >
                    <Coins size={15} />
                    Request Credits
                  </button>
                </div>
              </div>
            )
          }
        </div >

        {/* Main Content */}
        < main className="flex-1 overflow-y-auto bg-background/60 relative p-4 lg:p-8" >
          {children}
        </main >
      </div >

      {/* Global Admin Copilot */}
      < AdminCopilot />
    </div >
  )
}