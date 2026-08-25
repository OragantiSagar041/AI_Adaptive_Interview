import React, { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, NavLink, Outlet } from 'react-router-dom'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import {
  LayoutDashboard,
  CheckCircle,
  XCircle,
  Plus,
  Settings,
  LogOut,
  Shield,
  Radio,
  BarChart2,
  Users,
  Coins,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Menu,
  X,
  Bell,
  Activity,
  AlertCircle,
  PhoneCall,
  Briefcase,
  MessageSquare,
  Zap,
  Building,
  UserCheck,
  CreditCard,
  Link,
  ClipboardList,
  User
} from 'lucide-react'
import ThemeToggle from '../ThemeToggle'
import { useTheme } from '../../context/ThemeContext'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger
} from '../ui/sidebar'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import logoImage from '../../assets/logo.png'
import finalLogo from '../../assets/final.png'
import { logout, loadSuperAdminProfile, updateAdminUser } from '../../store/slices/authSlice'
import { persistor } from '../../store/store'
import AdminCopilot from '../admin/copilot/AdminCopilot'
import {
  UpgradePlansModal,
  CandidateScorecardModal,
  LiveResultsModal
} from '../admin/modals/AdminModals'
import LiveMonitorStreamModal from '../admin/modals/LiveMonitorStreamModal'
import axios from 'axios'
import { getNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../../utils/api'

export const superAdminNavItems = [
  { id: 'super-dashboard', label: 'Super Admin Dashboard', icon: BarChart2, path: '/superadmin/new-dashboard' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/superadmin/dashboard' },
  { id: 'interviews', label: 'Interviews', icon: ClipboardList, path: '/superadmin/interviews' },
  { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle, path: '/superadmin/qualified-candidates' },
  { id: 'rejected', label: 'Rejected Candidates', icon: XCircle, path: '/superadmin/rejected-candidates' },
  { id: 'create', label: 'Create Interview', icon: Plus, path: '/superadmin/create-interview' },
  { id: 'ai-calling', label: 'AI Calling Agent', icon: Radio, path: '/superadmin/ai-calling' },
  { id: 'jobs', label: 'Jobs', icon: Briefcase, path: '/superadmin/jobs' },
  { id: 'recruiters', label: 'Recruiters', icon: UserCheck, path: '/superadmin/recruiters' },
  { id: 'credit', label: 'Credit Management', icon: Coins, path: '/superadmin/credit' },
  { id: 'subscription', label: 'Subscription Management', icon: CreditCard, path: '/superadmin/subscription' },
  // { id: 'integrations', label: 'Integrations', icon: Link, path: '/superadmin/integrations' },
  // { id: 'audit', label: 'Audit Logs', path: '/superadmin/audit' },
  { id: 'security', label: 'Security', icon: Shield, path: '/superadmin/security' },
]

import { setSelectedCandidate, setLiveResultsModalOpen, handleUpdateDecision } from '../../store/slices/interviewSlice'
import { loadSuperAdminDashboard, setSelectedAdminFilter, updateLiveSnapshot } from '../../store/slices/dashboardSlice'

function hexToRgba(hex, alpha) {
  const cleanHex = hex.replace('#', '')
  const value = parseInt(cleanHex, 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export default function SuperAdminLayout() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const location = useLocation()

  // Selectors
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const adminUser = useSelector(state => state.auth.adminUser)
  const userName = adminUser?.name || adminUser?.username || 'Super Admin'
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Dashboard & Modal selectors
  const ongoingLiveCount = useSelector(state => state.dashboard.ongoingLiveCount)
  const ongoingAlertCount = useSelector(state => state.dashboard.ongoingAlertCount)
  const ongoingSpeakingCount = useSelector(state => state.dashboard.ongoingSpeakingCount)
  const ongoingCodingCount = useSelector(state => state.dashboard.ongoingCodingCount)
  const liveSessions = useSelector(state => state.dashboard.liveSessions)
  const liveResultsModalOpen = useSelector(state => state.interview.liveResultsModalOpen)
  const selectedCandidate = useSelector(state => state.interview.selectedCandidate)
  const candidateDetail = useSelector(state => state.interview.candidateDetail)
  const loadingDetail = useSelector(state => state.interview.loadingDetail)
  const selectedAdminFilter = useSelector(state => state.dashboard.selectedAdminFilter)
  const superAdminStats = useSelector(state => state.dashboard.superAdminStats)

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

  const [notifications, setNotifications] = useState([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const notifRef = useRef(null)
  const themeRef = useRef(null)
  const profileRef = useRef(null)

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
      dispatch(loadSuperAdminProfile())
      fetchNotifications()
      const interval = setInterval(fetchNotifications, 30000)
      return () => clearInterval(interval)
    }
  }, [token, dispatch])



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
        return <Coins size={12} className="text-emerald-500" />
      case 'activity':
        return <Activity size={12} className="text-indigo-500" />
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
  const [showUpgradePlansModal, setShowUpgradePlansModal] = useState(false)
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [subscriptionPlans, setSubscriptionPlans] = useState([])
  const [processingPlanId, setProcessingPlanId] = useState(null)

  // Live Stream WebRTC State
  const [isLiveStreamOpen, setIsLiveStreamOpen] = useState(false)
  const [liveStreamSession, setLiveStreamSession] = useState(null)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      if (!mobile) {
        setSidebarOpen(false)
      }
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (isMobile && sidebarOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobile, sidebarOpen])

  const handleOpenLiveStreamAction = (sessionData) => {
    if (!sessionData) return
    let resolvedSession = sessionData
    if (typeof sessionData === 'string') {
      const found = liveSessions?.find(s => s.link_id === sessionData || s.session_id === sessionData || s.id === sessionData || s._id === sessionData)
      resolvedSession = found || {
        link_id: sessionData,
        session_id: sessionData,
        candidate_name: 'Live Candidate',
        candidate_email: 'Active Session'
      }
    }
    setLiveStreamSession(resolvedSession)
    setIsLiveStreamOpen(true)
  }

  const handleUpdateDecisionAction = (linkId, decision) => {
    Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to mark this candidate as ${decision.toUpperCase()}? Official email will be sent.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: decision === 'selected' ? '#10b981' : '#f43f5e',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Yes, confirm!'
    }).then((result) => {
      if (result.isConfirmed) {
        dispatch(handleUpdateDecision({ linkId, decision })).then(() => {
          if (token) dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter, }))
        })
      }
    })
  }

  const layoutConfig = adminUser?.layout_config;

  const { theme } = useTheme()
  const isDark = theme === 'dark'

  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }

    if (layoutConfig?.favicon) {
      link.href = layoutConfig.favicon;
    } else {
      link.href = '/hireiq.png';
    }
  }, [layoutConfig])

  // Initial load and WebSocket setup
  useEffect(() => {
    if (!token) return
    dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter, }))
    dispatch(loadSuperAdminProfile())

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/ws/dashboard?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(wsUrl)

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'live_snapshot') {
          dispatch(updateLiveSnapshot(data))
        } else if (data.type === 'profile_update') {
          window.dispatchEvent(new CustomEvent('admin_profile_updated', { detail: data }))
        }
      } catch (err) {
        console.error('Error parsing dashboard ws message:', err)
      }
    }

    return () => {
      ws.close()
    }
  }, [dispatch, token, selectedAdminFilter])

  // Fetch subscription plans on mount
  useEffect(() => {
    if (!token) return
    const fetchSubscriptionPlans = async () => {
      try {
        const plansRes = await fetch(`${API_BASE_URL}/api/plans`)
        if (plansRes.ok) {
          const plansData = await plansRes.json()
          const normalizedPlans = (plansData.data || []).map(p => ({
            id: p.id,
            name: p.plan_name,
            price: p.price * 100, // convert Rupees to Paise since UpgradePlansModal divides it by 100!
            credits: p.credits ?? p.credits_granted ?? 0,
            summary: p.summary || `Upgrade to ${p.plan_name} to get ${p.credits ?? p.credits_granted ?? 0} credits.`,
            features: p.features || []
          }))
          setSubscriptionPlans(normalizedPlans)
        }
      } catch (e) {
        console.error('Error fetching plans:', e)
      }
    }
    fetchSubscriptionPlans()
  }, [token, API_BASE_URL])

  const handleLogout = () => {
    sessionStorage.clear()
    dispatch(logout())
    persistor.purge()
    navigate('/login')
  }

  const handleSelectPlan = async (plan) => {
    if (processingPlanId) return;

    if (!window.Razorpay) {
      alert("Razorpay Checkout could not be loaded. Please check your internet connection and try again.");
      return;
    }

    setProcessingPlanId(plan.id)
    try {
      // Call endpoint to create upgrade/buy credits order
      const orderRes = await axios.post(`${API_BASE_URL}/api/razorpay/create-upgrade-order`, {
        plan_name: plan.name,
        admin_id: adminUser?.id || adminUser?._id || '',
        amount_inr: plan.price / 100,
        credits: plan.credits
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const orderData = orderRes.data;
      const storedUser = (() => {
        try {
          return JSON.parse(sessionStorage.getItem('adminUser')) || {};
        } catch {
          return {};
        }
      })();

      const userEmail = adminUser?.email || storedUser?.email || '';
      const userName = adminUser?.name || storedUser?.name || 'Super Admin';
      const userPhone = adminUser?.phone || storedUser?.phone || '';

      const options = {
        key: orderData.key_id || orderData.key,
        amount: orderData.amount,
        currency: 'INR',
        name: 'Hire IQ Credits',
        description: `Purchase ${plan.credits} Credits`,
        prefill: {
          name: userName,
          email: userEmail,
          contact: userPhone
        },
        theme: { color: '#6366f1' },
        handler: async function (response) {
          try {
            const verifyRes = await axios.post(`${API_BASE_URL}/api/razorpay/verify-upgrade`, {
              plan_name: plan.name,
              admin_id: adminUser?.id || adminUser?._id || '',
              razorpay_order_id: response.razorpay_order_id || orderData.razorpay_order_id || '',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            }, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            alert("Credits added successfully!")
            setShowUpgradePlansModal(false)
            if (dispatch) {
              if (verifyRes.data?.credits_added) {
                dispatch({ type: 'auth/updateCredits', payload: (adminUser?.credits || 0) + verifyRes.data.credits_added })
              }
              dispatch(loadSuperAdminProfile())
              dispatch(loadSuperAdminDashboard({}))
            }
          } catch (e) {
            alert("Payment verification failed")
          }
        },
        modal: {
          ondismiss: function () {
            setProcessingPlanId(null)
          }
        }
      };

      options.order_id = orderData.razorpay_order_id;

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert(e.message)
    } finally {
      setProcessingPlanId(null)
    }
  }

  const userRole = (role || adminUser?.role || '').toLowerCase()
  const isMaster = userRole === 'master'
  const userFeatures = adminUser?.plan_features || []
  const filteredNavItems = (userFeatures && userFeatures.length > 0 && !isMaster)
    ? superAdminNavItems.filter(item => userFeatures.includes(item.label))
    : superAdminNavItems
  const navItems = isMaster ? superAdminNavItems : (filteredNavItems.length > 0 ? filteredNavItems : superAdminNavItems)

  return (
    <SidebarProvider>
      <div className="h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex font-sans w-full overflow-hidden relative">
        {/* Grid overlay */}
        <div className="absolute inset-0 bg-grid-fine opacity-60 pointer-events-none" />

        {/* NEW SHADCN SIDEBAR */}
        {layoutConfig?.layout_type !== "navbar" && (
          <Sidebar
            className="border-r border-border z-20 overflow-hidden bg-sidebar"
            collapsible="icon"
          >
            <SidebarHeader className="h-16 px-6 py-0 flex items-center justify-center shrink-0 border-b border-border transition-colors">
              <div className="flex items-center gap-3 w-full overflow-hidden">
                <div
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white p-1 cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
                  }}
                >
                  <Zap className="h-5 w-5 text-white fill-white/20" />
                </div>
                <div className="leading-tight group-data-[collapsible=icon]:hidden truncate">
                  <div className="text-base font-extrabold tracking-tight truncate text-foreground">HireIQ</div>
                  <div className="text-[11px] font-semibold truncate text-primary">
                    Super Admin
                  </div>
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
                          <NavLink
                            to={item.path}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                              ? '!bg-indigo-600 !text-white font-semibold shadow-md shadow-indigo-500/20'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white !bg-transparent dark:!bg-transparent !border-none !shadow-none'
                              }`}
                          >
                            {item.icon ? (
                              <item.icon size={16} className={`shrink-0 group-data-[collapsible=icon]:mr-0 mr-1 ${isActive ? '!text-white text-white' : ''}`} />
                            ) : (
                              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-current opacity-60'} shrink-0 group-data-[collapsible=icon]:mr-0 mr-1`} />
                            )}
                            <span className={`truncate group-data-[collapsible=icon]:hidden ${isActive ? '!text-white text-white font-semibold' : ''}`}>{item.label}</span>
                          </NavLink>
                        </SidebarMenuItem>
                      );
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="p-3 border-t border-border space-y-0.5 shrink-0 transition-colors">
              <button
                onClick={() => dispatch(setLiveResultsModalOpen(true))}
                className="flex items-center justify-center md:justify-start gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white !bg-transparent dark:!bg-transparent !border-none !shadow-none cursor-pointer text-left overflow-hidden"
              >
                <Radio size={16} className="shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden truncate">Live Results</span>
              </button>
              <button
                onClick={() => setShowCreditsModal(true)}
                className="flex items-center justify-center md:justify-start gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white !bg-transparent dark:!bg-transparent !border-none !shadow-none cursor-pointer text-left overflow-hidden"
              >
                <Coins size={16} className="shrink-0" />
                <span className="group-data-[collapsible=icon]:hidden truncate">Available Credits</span>
              </button>
            </SidebarFooter>
          </Sidebar>
        )}

        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10">
          {/* Top bar */}
          <header className="sticky top-0 z-30 border-b border-slate-200/60 dark:border-slate-800 bg-white/60 dark:bg-slate-900/80 backdrop-blur-xl flex items-center justify-between px-6 h-16 shadow-sm shrink-0">
            {/* Left Side: Brand & Toggles */}
            <div className="flex items-center gap-6">
              {layoutConfig?.layout_type !== "navbar" && (
                <SidebarTrigger className="-ml-2 md:mr-2 p-2 rounded-xl text-foreground hover:text-indigo-500 bg-secondary border border-border transition-colors cursor-pointer shrink-0" />
              )}

              {layoutConfig?.layout_type === "navbar" && (
                <div className="flex items-center gap-3 border-r border-border pr-6 mr-2">
                  <div
                    className="grid h-9 w-9 place-items-center rounded-xl text-white p-1 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)'
                    }}
                  >
                    <Zap className="h-5 w-5 text-white fill-white/20" />
                  </div>
                  <div className="leading-tight hidden sm:block">
                    <div className="text-base font-extrabold text-foreground">HireIQ</div>
                    <div className="text-[11px] font-semibold text-primary">Super Admin</div>
                  </div>
                </div>
              )}

              <h2 className="text-[17px] font-bold text-foreground hidden sm:block">SuperAdmin Management</h2>

              {/* Active Plan Badge */}
              {adminUser?.subscription_plan && (
                <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-300 dark:border-indigo-500/60 text-indigo-800 dark:text-indigo-200 rounded-full text-xs font-black shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse"></span>
                  Active Plan: <span className="capitalize">{adminUser.subscription_plan}</span>
                </div>
              )}

              {/* Credits Badge */}
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-cyan-100 dark:bg-cyan-950/80 border border-cyan-300 dark:border-cyan-500/60 text-cyan-900 dark:text-cyan-200 rounded-full text-xs font-black shadow-xs">
                <span className="text-[10px]">🔗</span>
                {adminUser?.credits ?? 0} credits left
              </div>
            </div>

            {/* Right Side: Notifications & User Profile */}
            <div className="flex items-center gap-5">
              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  className="relative p-2.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-full transition-all cursor-pointer flex items-center justify-center shadow-xs"
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
                  <div className="absolute right-0 mt-3 w-80 bg-popover border border-border rounded-2xl shadow-xl py-2 z-50">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100 font-sans">Recent Notifications</span>
                      {unreadCount > 0 && (
                        <button
                          onClick={handleMarkAllRead}
                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer border-none bg-transparent"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700/50">
                      {notifications.length === 0 ? (
                        <div className="py-8 text-center text-xs text-slate-400 font-sans">No notifications</div>
                      ) : (
                        notifications.slice(0, 5).map(n => (
                          <div
                            key={n.id}
                            onClick={() => {
                              if (!n.read) handleMarkRead(n.id)
                              setNotifDropdownOpen(false)
                              navigate('/superadmin/notifications')
                            }}
                            className={`p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition-colors flex gap-2.5 items-start ${!n.read ? 'bg-indigo-50/30 dark:bg-indigo-900/20' : ''}`}
                          >
                            <div className="p-1.5 rounded-lg bg-slate-50 flex-shrink-0 mt-0.5">
                              {getNotifIcon(n.type)}
                            </div>
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center gap-1.5 justify-between">
                                <span className={`text-xs font-bold truncate block ${!n.read ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}>{n.title}</span>
                                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                              </div>
                              <p className="text-[11px] text-slate-500 leading-normal line-clamp-2 font-sans">{n.message}</p>
                              <span className="text-[9px] text-slate-400 block pt-0.5 font-sans">{formatRelativeTime(n.created_at)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-700 px-4 pt-2 pb-1 text-center">
                      <NavLink
                        to="/superadmin/notifications"
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
              <ThemeToggle />
              <div ref={profileRef} className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 p-1.5 px-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl shadow-sm transition-all cursor-pointer border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                >
                  <img
                    src={adminUser?.profile_image || adminUser?.avatar || "https://ui-avatars.com/api/?name=Super+Admin&background=random"}
                    alt="Avatar"
                    className="w-8 h-8 rounded-full object-cover border border-slate-200"
                  />
                  <div className="text-left hidden sm:block">
                    <div className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-none">{userName}</div>
                    <span className="text-[10px] text-slate-400 font-medium">Super Admin</span>
                  </div>
                  <ChevronDown size={14} className="text-slate-400 ml-1" />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-popover border border-border rounded-xl shadow-lg py-1.5 z-50">
                    <NavLink
                      to="/superadmin/profile-settings"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60 no-underline"
                    >
                      <User size={15} /> My Profile
                    </NavLink>

                    <hr className="border-slate-100 dark:border-slate-700 my-1" />
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

          {/* Horizontal Navbar (Navbar Layout) */}
          {layoutConfig?.layout_type === "navbar" && (
            <div
              className="flex items-center gap-1 px-6 h-14 border-t border-border overflow-x-auto hide-scrollbar z-30 sticky top-[64px] bg-background"
            >
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${isActive
                      ? 'bg-indigo-600 text-white font-semibold shadow-md shadow-indigo-500/20'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-slate-800/80 hover:text-indigo-600 dark:hover:text-indigo-400'
                      }`}
                  >
                    {item.icon && <item.icon size={15} className={`shrink-0 ${isActive ? 'text-white' : ''}`} />}
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
              <div className="ml-auto flex items-center gap-2 pl-4 border-l border-slate-200/50">
                <button
                  onClick={() => dispatch(setLiveResultsModalOpen(true))}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 whitespace-nowrap shrink-0"
                >
                  <Radio size={15} />
                  Live Results
                </button>
                <button
                  onClick={() => setShowCreditsModal(true)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 whitespace-nowrap shrink-0"
                >
                  <Coins size={15} />
                  Available Credits
                </button>
              </div>
            </div>
          )}

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto bg-transparent relative">

            <div className="relative z-10">

              <div className="p-4 lg:p-8">
                <Outlet context={{ handleOpenLiveStreamAction }} />
              </div>
            </div>
          </main>
        </div>

        <UpgradePlansModal
          isOpen={showUpgradePlansModal}
          onClose={() => setShowUpgradePlansModal(false)}
          handleSelectPlan={handleSelectPlan}
          isProcessing={processingPlanId}
          plans={subscriptionPlans}
        />

        {/* MODAL: AVAILABLE CREDITS & SUBSCRIPTION DETAILS */}
        {showCreditsModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-white border border-slate-100 rounded-3xl p-8 shadow-2xl relative overflow-hidden text-slate-800 animate-in fade-in zoom-in duration-200">
              {/* Design accents */}
              <div className="absolute -right-16 -top-16 h-36 w-36 rounded-full bg-indigo-500/10 pointer-events-none" />
              <div className="absolute -left-16 -bottom-16 h-36 w-36 rounded-full bg-primary/10 pointer-events-none" />

              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                    <Coins className="text-primary w-5 h-5" /> Subscription &amp; Credits
                  </h3>
                  <p className="text-slate-500 text-xs mt-1">Real-time status of your workspace subscription.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreditsModal(false)}
                  className="text-slate-400 hover:text-slate-700 bg-transparent border-none cursor-pointer outline-none p-1 rounded-lg hover:bg-slate-50"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <div className="space-y-4 relative z-10">
                {/* Active Plan Card */}
                <div className="bg-gradient-to-br from-indigo-900 to-indigo-800 text-white rounded-2xl p-5 shadow-md">
                  <span className="text-[0.62rem] font-bold text-indigo-200 uppercase tracking-widest block">Current Active Plan</span>
                  <span className="text-2xl font-black block mt-1 tracking-tight">
                    {adminUser?.subscription_plan || 'Free Trial'}
                  </span>
                  <div className="mt-3 flex items-center gap-1.5 text-xs text-indigo-100">
                    <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" />
                    Active Status
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-4">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider block">Available Credits</span>
                    <span className="text-2xl font-black text-slate-800 block mt-1">
                      {adminUser?.credits ?? 0}
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-150 rounded-xl p-4">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider block">Total Credits Used</span>
                    <span className="text-2xl font-black text-slate-800 block mt-1">
                      {superAdminStats?.total !== '--' && superAdminStats?.total !== undefined ? superAdminStats.total : 0}
                    </span>
                  </div>
                </div>

                {/* Expiry Date */}
                <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider block">Plan Expiry Date</span>
                    <span className="text-sm font-bold text-slate-800 mt-1 block">
                      {adminUser?.subscription_expiry
                        ? new Date(adminUser.subscription_expiry).toLocaleDateString('en-US', {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric'
                        })
                        : 'Lifetime Access / No Expiry'}
                    </span>
                  </div>
                  <span className="text-slate-400 text-lg">📅</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 mt-8 border-t border-slate-100 pt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreditsModal(false)
                    setShowUpgradePlansModal(true)
                  }}
                  className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold text-sm cursor-pointer shadow-md shadow-indigo-100 hover:shadow-lg transition-all text-center"
                >
                  Upgrade or Manage Plan
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreditsModal(false)}
                  className="w-full py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 font-semibold text-xs cursor-pointer transition-all"
                >
                  Close Details
                </button>
              </div>
            </div>
          </div>
        )}

        <CandidateScorecardModal
          isOpen={!!selectedCandidate}
          onClose={() => dispatch(setSelectedCandidate(null))}
          selectedCandidate={selectedCandidate}
          loadingDetail={loadingDetail}
          candidateDetail={candidateDetail}
          handleUpdateDecision={handleUpdateDecisionAction}
        />

        <LiveResultsModal
          isOpen={liveResultsModalOpen}
          onClose={() => dispatch(setLiveResultsModalOpen(false))}
          ongoingLiveCount={ongoingLiveCount}
          ongoingAlertCount={ongoingAlertCount}
          ongoingSpeakingCount={ongoingSpeakingCount}
          ongoingCodingCount={ongoingCodingCount}
          liveSessions={liveSessions}
          handleOpenScorecard={() => { }}
          handleOpenLiveStream={handleOpenLiveStreamAction}
        />

        <LiveMonitorStreamModal
          isOpen={isLiveStreamOpen}
          onClose={() => {
            setIsLiveStreamOpen(false)
            setLiveStreamSession(null)
          }}
          session={liveStreamSession}
        />

        {/* Global Copilot */}
        <AdminCopilot />
      </div>
    </SidebarProvider>
  )
}
