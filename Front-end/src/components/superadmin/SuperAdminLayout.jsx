import React, { useState, useEffect, useRef } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, NavLink, Outlet } from 'react-router-dom'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import ThemeToggle from '../ThemeToggle'
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
import { loadSuperAdminDashboard, loadLiveSessions, setSelectedAdminFilter, updateLiveSnapshot } from '../../store/slices/dashboardSlice'

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
const [hoveredPath, setHoveredPath] = useState(null)
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

  const handleOpenLiveStreamAction = (session) => {
    setLiveStreamSession(session)
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
    teal: {
      primary: '#2dd4bf',
      hover: '#14b8a6',
      glow: 'rgba(45, 212, 191, 0.30)',
      gradient: 'linear-gradient(135deg, #5eead4 0%, #14b8a6 100%)'
    },
    indigo: {
      primary: '#818cf8',
      hover: '#6366f1',
      glow: 'rgba(129, 140, 248, 0.30)',
      gradient: 'linear-gradient(135deg, #a5b4fc 0%, #6366f1 100%)'
    },
    purple: {
      primary: '#c084fc',
      hover: '#a855f7',
      glow: 'rgba(192, 132, 252, 0.30)',
      gradient: 'linear-gradient(135deg, #d8b4fe 0%, #a855f7 100%)'
    },
    red: {
      primary: '#fb7185',
      hover: '#f43f5e',
      glow: 'rgba(251, 113, 133, 0.30)',
      gradient: 'linear-gradient(135deg, #fda4af 0%, #f43f5e 100%)'
    },
    green: {
      primary: '#86efac',
      hover: '#4ade80',
      glow: 'rgba(134, 239, 172, 0.30)',
      gradient: 'linear-gradient(135deg, #a7f3d0 0%, #4ade80 100%)'
    },
    blue: {
      primary: '#60a5fa',
      hover: '#3b82f6',
      glow: 'rgba(96, 165, 250, 0.30)',
      gradient: 'linear-gradient(135deg, #93c5fd 0%, #3b82f6 100%)'
    }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo

  useEffect(() => {
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
    document.documentElement.style.setProperty('--primary-glow', currentAccent.glow)
  }, [accentName])

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

  useEffect(() => {
    if (liveResultsModalOpen && token) {
      dispatch(loadLiveSessions(selectedAdminFilter))
    }
  }, [dispatch, liveResultsModalOpen, selectedAdminFilter, token])

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
      <div className="superadmin-theme h-screen bg-background text-foreground flex font-sans w-full overflow-hidden relative">
        {/* Global Premium Background Grid & Dynamic Accent Gradient */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          {/* Full-page soft color wash that changes with the theme */}
          <div
            className="absolute inset-0 transition-colors duration-700"
            style={{
background: `linear-gradient(135deg, ${currentAccent.primary}15 0%, transparent 50%, ${currentAccent.primary}10 100%)`
            }}
          />
          {/* Grid overlay */}
          <div className="absolute inset-0 bg-grid-fine opacity-60" />
        </div>

        {/* NEW SHADCN SIDEBAR */}
<Sidebar className="border-r border-border/70 bg-[rgba(7,18,37,0.85)] backdrop-blur-xl z-20" collapsible="icon">
          <SidebarHeader className="h-16 border-b border-border/70 px-6 py-0 flex items-center justify-center shrink-0">
            <div className="flex items-center gap-3 w-full overflow-hidden">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-sm transition-all duration-500"
                style={{ background: `linear-gradient(135deg, ${currentAccent.primary}, ${currentAccent.hover})` }}
              >
                <Zap className="h-4 w-4" />
              </div>
              <div className="leading-tight group-data-[collapsible=icon]:hidden truncate">
<div className="text-sm font-semibold truncate text-foreground">HireIQ</div>
                <div className="text-[11px] text-muted-foreground truncate">Super Admin</div>
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
className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ${isActive
                              ? 'text-white shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                            } ${isActive ? 'border border-white/20' : 'border border-transparent hover:border-sidebar-accent/40'}`}
                          style={{
                            background: isActive
                              ? `linear-gradient(135deg, ${currentAccent.primary} 0%, ${currentAccent.hover} 100%)`
                              : hoveredPath === item.path
                                ? `linear-gradient(135deg, ${hexToRgba(currentAccent.primary, 0.18)} 0%, ${hexToRgba(currentAccent.hover, 0.18)} 100%)`
                                : 'transparent',
                            height: 'auto'
                          }}
                          onMouseEnter={() => setHoveredPath(item.path)}
                          onMouseLeave={() => setHoveredPath(null)}
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

<SidebarFooter className="p-3 border-t border-border space-y-1 shrink-0">
            <button
              onClick={() => dispatch(setLiveResultsModalOpen(true))}
              className="flex items-center justify-center md:justify-start gap-3 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors text-muted-foreground hover:bg-muted hover:text-foreground border-none bg-transparent cursor-pointer text-left overflow-hidden"
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

        {/* Main Content Wrapper */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative z-10">
          {/* Top bar */}
<header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl flex items-center justify-between gap-4 px-6 h-16 shadow-sm shrink-0">
            {/* Left Side: Brand & Toggles */}
            <div className="flex items-center gap-4 lg:gap-6">
              <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground transition-colors" />
              <h2 className="text-[16px] font-bold text-foreground hidden sm:block">SuperAdmin Management</h2>

              {/* Theme Toggle Dots */}
              <div className="flex items-center gap-2 bg-card rounded-full px-3 py-1.5 border border-border shadow-xs">
                {Object.keys(accentColors).map(color => (
                  <button
                    key={color}
                    onClick={() => setAccentName(color)}
                    className="accent-selector-button w-3.5 h-3.5 rounded-full border-2 border-white/50 cursor-pointer p-0 transition-all hover:scale-110 shadow-xs"
                    style={{
                      background: accentColors[color].primary,
                      borderColor: accentName === color ? 'white' : 'rgba(255,255,255,0.65)',
                      boxShadow: accentName === color ? '0 0 0 2px rgba(255,255,255,0.9)' : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Single Stacked Active Plan & Credits Badge */}
              <div className="flex flex-col justify-center px-4 py-1.5 bg-muted/80 border border-border text-foreground rounded-2xl text-xs shadow-xs shrink-0 leading-tight">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400"></span>
                  <span>Active Plan: <span className="capitalize">{adminUser?.subscription_plan || 'Advance'}</span></span>
                </div>
                <div className="text-[11px] text-muted-foreground font-medium pl-3 pt-0.5">
                  {adminUser?.credits ?? 1224} credits left
                </div>
              </div>
            </div>

            {/* Right Side: Theme Toggle, Notifications & User Profile */}
            <div className="flex items-center gap-3 sm:gap-4">
              <ThemeToggle className="w-9 h-9 p-0 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted shadow-xs flex items-center justify-center cursor-pointer transition-all shrink-0" />

              {/* Notification Bell */}
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                className="relative w-9 h-9 text-muted-foreground hover:text-foreground bg-card border border-border hover:bg-muted rounded-full transition-all cursor-pointer flex items-center justify-center shadow-xs"
                title="Notifications"
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-sky-500 text-white font-extrabold text-[9px] min-w-[17px] h-[17px] px-1 rounded-full flex items-center justify-center shadow-xs border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* User Profile */}
<div className="flex items-center gap-3 border-l border-border/70 pl-4">
                <span className="text-xs text-muted-foreground font-medium hidden sm:block leading-tight text-right">
                  Welcome back,<br />
                  <span className="font-bold text-foreground text-sm">{userName}</span>
                </span>

                {/* Avatar with online dot */}
                <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-extrabold text-sm flex items-center justify-center relative shadow-xs shrink-0">
                  {userName.charAt(0).toUpperCase()}
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white absolute bottom-0 right-0" />
                </div>

                {/* Circular Logout Button */}
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="w-9 h-9 rounded-full border border-border bg-card text-muted-foreground hover:text-rose-600 hover:border-rose-300 dark:hover:border-rose-500/40 transition-colors cursor-pointer flex items-center justify-center shadow-xs shrink-0"
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto bg-transparent relative">

            <div className="relative z-10">
              {notifDropdownOpen && (
<div className="absolute right-4 top-4 w-80 bg-card border border-border rounded-2xl shadow-xl py-2 z-50">
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
                            if (n.type === 'credits') navigate('/superadmin/team')
                            else if (n.type === 'activity') navigate('/superadmin/new-dashboard')
                            else navigate('/superadmin/new-dashboard')
                          }}
className={`p-3 text-left hover:bg-muted cursor-pointer transition-colors flex gap-2.5 items-start ${!n.read ? 'bg-primary/10' : ''
                            }`}
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