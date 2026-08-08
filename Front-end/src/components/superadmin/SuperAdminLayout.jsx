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
  ClipboardList
} from 'lucide-react'
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
import { logout, loadSuperAdminProfile } from '../../store/slices/authSlice'
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
  { id: 'integrations', label: 'Integrations', icon: Link, path: '/superadmin/integrations' },
  // { id: 'audit', label: 'Audit Logs', path: '/superadmin/audit' },
  { id: 'security', label: 'Security', icon: Shield, path: '/superadmin/security' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/superadmin/profile-settings' },
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
    } catch (e) {
      console.error(e)
    }
  }

  const [notifications, setNotifications] = useState([])
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const notifRef = useRef(null)
  const themeRef = useRef(null)

  // Close theme popover when clicking outside
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

  const handleOpenLiveStreamAction = (sessionId) => {
    setLiveStreamSession(sessionId)
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

  const accentColors = {
    teal: { primary: '#0d9488', hover: '#0f766e', glow: 'rgba(13, 148, 136, 0.15)' },
    indigo: { primary: '#6366f1', hover: '#4f46e5', glow: 'rgba(99, 102, 241, 0.15)' },
    purple: { primary: '#9333ea', hover: '#7e22ce', glow: 'rgba(147, 51, 234, 0.15)' },
    red: { primary: '#e11d48', hover: '#be123c', glow: 'rgba(225, 29, 72, 0.15)' },
    green: { primary: '#16a34a', hover: '#15803d', glow: 'rgba(22, 163, 74, 0.15)' },
    blue: { primary: '#2563eb', hover: '#1d4ed8', glow: 'rgba(37, 99, 237, 0.15)' }
  }

  const layoutConfig = adminUser?.layout_config;

  const currentAccent = layoutConfig?.primary_color 
    ? { primary: layoutConfig.primary_color, hover: layoutConfig.primary_color, glow: 'rgba(0, 0, 0, 0.15)' } 
    : (accentColors[accentName] || accentColors.indigo);

  const sidebarBg = layoutConfig?.sidebar_bg_color 
    ? layoutConfig.sidebar_bg_color 
    : `linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.22)} 0%, white 30%, ${hexToRgba(currentAccent.primary, 0.12)} 100%)`;

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
    document.documentElement.style.setProperty('--primary-glow', currentAccent.glow)

    if (layoutConfig?.favicon) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = layoutConfig.favicon;
    }
  }, [accentName, layoutConfig])

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

  const accentWash = hexToRgba(currentAccent.primary, 0.16)
  const accentWashStrong = hexToRgba(currentAccent.primary, 0.26)
  const accentPage = hexToRgba(currentAccent.primary, 0.12)
  const accentPageStrong = hexToRgba(currentAccent.primary, 0.20)

  const userRole = (role || adminUser?.role || '').toLowerCase()
  const isMaster = userRole === 'master'
  const userFeatures = adminUser?.plan_features || []
  const filteredNavItems = (userFeatures && userFeatures.length > 0 && !isMaster)
    ? superAdminNavItems.filter(item => userFeatures.includes(item.label))
    : superAdminNavItems
  const navItems = isMaster ? superAdminNavItems : (filteredNavItems.length > 0 ? filteredNavItems : superAdminNavItems)

  return (
    <SidebarProvider>
      <div className="superadmin-theme h-screen bg-slate-50 text-slate-900 flex font-sans w-full overflow-hidden relative">
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

        {/* NEW SHADCN SIDEBAR */}
        {layoutConfig?.layout_type !== "navbar" && (
          <Sidebar
            className="border-r border-slate-200/50 z-20 overflow-hidden"
            style={{
              background: sidebarBg
            }}
            collapsible="icon"
          >
          {/* Accent top strip */}
          <div
            className="absolute top-0 left-0 right-0 h-0.5 z-10 transition-all duration-700"
            style={{ background: `linear-gradient(90deg, ${currentAccent.primary}, ${currentAccent.hover})` }}
          />

          <SidebarHeader
            className="h-16 px-6 py-0 flex items-center justify-center shrink-0 border-b transition-all duration-700"
            style={{ borderColor: hexToRgba(currentAccent.primary, 0.25) }}
          >
            <div className="flex items-center gap-3 w-full overflow-hidden">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm transition-all duration-500"
                style={{ background: `linear-gradient(135deg, ${currentAccent.primary}, ${currentAccent.hover})` }}
              >
                <Zap className="h-4 w-4" />
              </div>
              <div className="leading-tight group-data-[collapsible=icon]:hidden truncate">
                <div className="text-sm font-semibold truncate">HireIQ</div>
                <div
                  className="text-[11px] font-medium truncate transition-colors duration-500"
                  style={{ color: currentAccent.primary }}
                >
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
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${isActive
                              ? '!text-white text-white font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                            }`}
                          style={{
                            background: isActive ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)` : 'transparent',
                            boxShadow: isActive ? `0 4px 14px ${hexToRgba(currentAccent.primary, 0.35)}` : 'none',
                            color: isActive ? '#ffffff' : undefined,
                            height: 'auto'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10);
                              e.currentTarget.style.color = currentAccent.primary;
                            } else {
                              e.currentTarget.style.color = '#ffffff';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) {
                              e.currentTarget.style.background = 'transparent';
                              e.currentTarget.style.color = '';
                            } else {
                              e.currentTarget.style.color = '#ffffff';
                            }
                          }}
                        >
                          <NavLink
                            to={item.path}
                            className={`flex items-center w-full min-w-0 ${isActive ? '!text-white' : ''}`}
                            style={{ color: isActive ? '#ffffff' : undefined }}
                          >
                            {item.icon ? (
                              <item.icon size={16} className={`shrink-0 group-data-[collapsible=icon]:mr-0 mr-3 ${isActive ? '!text-white text-white' : ''}`} />
                            ) : (
                              <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-white' : 'bg-current opacity-60'} shrink-0 group-data-[collapsible=icon]:mr-0 mr-3`} />
                            )}
                            <span className={`truncate group-data-[collapsible=icon]:hidden ${isActive ? '!text-white text-white font-semibold' : ''}`}>{item.label}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter
            className="p-3 border-t space-y-0.5 shrink-0 transition-all duration-700"
            style={{ borderColor: hexToRgba(currentAccent.primary, 0.15) }}
          >
            <button
              onClick={() => dispatch(setLiveResultsModalOpen(true))}
              className="flex items-center justify-center md:justify-start gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-500 border-none bg-transparent cursor-pointer text-left overflow-hidden"
              title="Live Results"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10)
                e.currentTarget.style.color = currentAccent.primary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = ''
              }}
            >
              <Radio size={16} className="shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden truncate">Live Results</span>
            </button>
            <button
              onClick={() => setShowCreditsModal(true)}
              className="flex items-center justify-center md:justify-start gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 text-slate-500 border-none bg-transparent cursor-pointer text-left overflow-hidden"
              title="Available Credits"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10)
                e.currentTarget.style.color = currentAccent.primary
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = ''
              }}
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
          <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/60 backdrop-blur-xl flex items-center justify-between px-6 h-16 shadow-sm shrink-0">
            {/* Left Side: Brand & Toggles */}
            <div className="flex items-center gap-6">
              {layoutConfig?.layout_type !== "navbar" && (
                <SidebarTrigger className="-ml-2 md:mr-2 text-slate-500 hover:text-slate-800 transition-colors" />
              )}
              
              {layoutConfig?.layout_type === "navbar" && (
                <div className="flex items-center gap-3 border-r border-slate-200/60 pr-6 mr-2">
                  <div
                    className="grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm transition-all duration-500"
                    style={{ background: `linear-gradient(135deg, ${currentAccent.primary}, ${currentAccent.hover})` }}
                  >
                    <Zap className="h-4 w-4" />
                  </div>
                  <div className="leading-tight hidden sm:block">
                    <div className="text-sm font-semibold text-slate-800">HireIQ</div>
                    <div className="text-[11px] font-medium" style={{ color: currentAccent.primary }}>Super Admin</div>
                  </div>
                </div>
              )}

              <h2 className="text-[17px] font-bold text-slate-800 hidden sm:block">SuperAdmin Management</h2>

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

              {/* Active Plan Badge */}
              {adminUser?.subscription_plan && (
                <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50/50 border border-indigo-200/60 text-indigo-700 rounded-full text-xs font-bold shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
                  Active Plan: {adminUser.subscription_plan}
                </div>
              )}

              {/* Credits Badge */}
              <div className="flex items-center gap-1.5 px-3 py-1 bg-cyan-50 border border-cyan-100 text-cyan-600 rounded-full text-xs font-bold shadow-sm">
                <span className="text-[10px]">🔗</span>
                {adminUser?.credits ?? 0} credits left
              </div>
            </div>

            {/* Right Side: Notifications & User Profile */}
            <div className="flex items-center gap-5">
              {/* Notification Bell */}
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

              {/* User Profile */}
              <div className="flex items-center gap-4 border-l border-slate-200 pl-5">
                <span className="text-sm text-slate-500 font-medium hidden sm:block">
                  Welcome back, <span className="font-bold text-slate-800">{userName}</span>
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer bg-transparent border-none"
                >
                  <LogOut size={15} /> Logout
                </button>
              </div>
            </div>
          </header>

          {/* Horizontal Navbar (Navbar Layout) */}
          {layoutConfig?.layout_type === "navbar" && (
            <div 
              className="flex items-center gap-1 px-6 h-14 border-t border-slate-200/40 overflow-x-auto hide-scrollbar z-30 sticky top-[64px]" 
              style={{ background: sidebarBg }}
            >
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <NavLink
                    key={item.id}
                    to={item.path}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${
                      isActive
                        ? '!text-white text-white font-semibold shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                    style={{
                      background: isActive
                        ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)`
                        : 'transparent',
                      boxShadow: isActive ? `0 4px 14px ${hexToRgba(currentAccent.primary, 0.35)}` : 'none',
                      color: isActive ? '#ffffff' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = hexToRgba(currentAccent.primary, 0.10)
                        e.currentTarget.style.color = currentAccent.primary
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'transparent'
                        e.currentTarget.style.color = ''
                      }
                    }}
                  >
                    {item.icon && <item.icon size={15} className={`shrink-0 ${isActive ? '!text-white text-white' : ''}`} />}
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
              {notifDropdownOpen && (
                <div className="absolute right-4 top-4 w-80 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50">
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
                            if (n.type === 'credits') navigate('/superadmin/team')
                            else if (n.type === 'activity') navigate('/superadmin/new-dashboard')
                            else navigate('/superadmin/new-dashboard')
                          }}
                          className={`p-3 text-left hover:bg-slate-50 cursor-pointer transition-colors flex gap-2.5 items-start ${!n.read ? 'bg-indigo-50/30' : ''
                            }`}
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
                      to="/superadmin/notifications"
                      onClick={() => setNotifDropdownOpen(false)}
                      className="text-[11px] font-bold text-indigo-600 hover:underline no-underline block py-1 font-sans"
                    >
                      View All Notifications
                    </NavLink>
                  </div>
                </div>
              )}

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
