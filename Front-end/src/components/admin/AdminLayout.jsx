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
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../utils/api'
import { setLiveResultsModalOpen } from '../../store/slices/interviewSlice'
import { updateAdminUser } from '../../store/slices/authSlice'

import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger
} from '../ui/sidebar'

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

  return (
    <SidebarProvider>
      <div className="superadmin-theme h-screen bg-slate-50 text-slate-900 flex font-sans w-full overflow-hidden relative">
        {/* SHADCN SIDEBAR */}
        <Sidebar className="border-r border-slate-200 bg-white z-20" collapsible="icon">
          <SidebarHeader className="h-16 border-b border-slate-200 px-6 py-0 flex items-center justify-center shrink-0">
            <div className="flex items-center gap-3 w-full overflow-hidden">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-white shadow-sm">
                <Zap className="h-4 w-4" />
              </div>
              <div className="leading-tight group-data-[collapsible=icon]:hidden truncate">
                <div className="text-sm font-semibold truncate">HireIQ</div>
                <div className="text-[11px] text-slate-500 truncate">Recruiter</div>
              </div>
            </div>
          </SidebarHeader>

          <SidebarContent className="p-3">
            <SidebarGroup className="p-0">
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => {
                    const isActive = location.pathname.startsWith(item.path);
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive
                              ? 'text-white'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                          style={{
                            background: isActive ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)` : 'transparent',
                            height: 'auto'
                          }}
                        >
                          <NavLink to={item.path} className="flex items-center w-full min-w-0">
                            {item.icon ? (
                              <item.icon size={16} className="shrink-0 group-data-[collapsible=icon]:mr-0 mr-3" />
                            ) : (
                              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60 shrink-0 group-data-[collapsible=icon]:mr-0 mr-3" />
                            )}
                            <span className="truncate group-data-[collapsible=icon]:hidden">{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-slate-200 space-y-1 shrink-0">
            <button
              onClick={() => dispatch(setLiveResultsModalOpen(true))}
              className="flex items-center justify-center md:justify-start gap-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900 border-none bg-transparent cursor-pointer text-left overflow-hidden"
              title="Live Results"
            >
              <Radio size={16} className="shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden truncate">Live Results</span>
            </button>
            <button
              onClick={onAddCredits}
              className="flex items-center justify-center md:justify-start gap-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors text-slate-500 hover:bg-slate-100 hover:text-slate-900 border-none bg-transparent cursor-pointer text-left overflow-hidden"
              title="Request Credits"
            >
              <Coins size={16} className="shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden truncate">Request Credits</span>
            </button>
          </SidebarFooter>
        </Sidebar>

        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white flex items-center justify-between px-6 h-16 shadow-sm shrink-0">
            {/* Left Side: Brand & Toggles */}
            <div className="flex items-center gap-6">
              <SidebarTrigger className="-ml-2 md:mr-2 text-slate-500 hover:text-slate-800 transition-colors" />
              <h2 className="text-[17px] font-bold text-slate-800 hidden sm:block">Recruiter Management</h2>

              {/* Theme Toggle Dots */}
              <div className="flex items-center gap-2 bg-slate-100 rounded-full px-2.5 py-1.5 border border-slate-200">
                {Object.keys(accentColors).map(color => (
                  <button
                    key={color}
                    onClick={() => onAccentChange(color)}
                    className="w-3.5 h-3.5 rounded-full border-2 border-white cursor-pointer p-0 transition-all hover:scale-110"
                    style={{
                      background: accentColors[color].primary,
                      boxShadow: accentName === color ? `0 0 0 2px ${accentColors[color].primary}` : 'none',
                    }}
                    title={color}
                  />
                ))}
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
    </SidebarProvider>
  )
}
