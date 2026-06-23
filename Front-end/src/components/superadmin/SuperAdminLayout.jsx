import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useLocation, NavLink, Outlet } from 'react-router-dom'
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
} from 'lucide-react'
import { logout, loadSuperAdminProfile } from '../../store/slices/authSlice'
import { persistor } from '../../store/store'
import {
  UpgradePlansModal,
  CandidateScorecardModal,
  LiveResultsModal
} from '../admin/modals/AdminModals'
import LiveMonitorStreamModal from '../admin/modals/LiveMonitorStreamModal'
import axios from 'axios'
import { setSelectedCandidate, setLiveResultsModalOpen } from '../../store/slices/interviewSlice'
import { loadSuperAdminDashboard } from '../../store/slices/dashboardSlice'

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
  const [accentName, setAccentName] = useState('indigo')
  const [showUpgradePlansModal, setShowUpgradePlansModal] = useState(false)
  const [showCreditsModal, setShowCreditsModal] = useState(false)
  const [subscriptionPlans, setSubscriptionPlans] = useState([])
  const [processingPlanId, setProcessingPlanId] = useState(null)

  // Live Stream WebRTC State
  const [isLiveStreamOpen, setIsLiveStreamOpen] = useState(false)
  const [liveStreamSession, setLiveStreamSession] = useState(null)

  const handleOpenLiveStreamAction = (session) => {
    setLiveStreamSession(session)
    setIsLiveStreamOpen(true)
  }

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
  }, [accentName, currentAccent])

  // Polling for telemetry and profile updates
  useEffect(() => {
    if (!token) return
    dispatch(loadSuperAdminDashboard(selectedAdminFilter))
    dispatch(loadSuperAdminProfile())
    const pollInterval = setInterval(() => {
      dispatch(loadSuperAdminDashboard(selectedAdminFilter))
      dispatch(loadSuperAdminProfile())
    }, 12000)
    return () => clearInterval(pollInterval)
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
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
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
      // Dynamic key resolution: query registration order endpoint with randomized email to get actual key
      let dynamicKey = 'rzp_test_SgtZz5GYGtOM5F'; // fallback key from backend .env
      try {
        const keyRes = await axios.post(`${API_BASE_URL}/api/razorpay/create-order`, {
          plan_name: plan.name,
          signup_form: {
            name: 'Temp Key Fetcher',
            email: `temp_key_fetch_${Date.now()}_${Math.round(Math.random() * 100000)}@dummy.com`,
            password: 'TemporaryPassword123!',
            phone: '1234567890',
            company_name: 'Temp Company'
          }
        });
        if (keyRes.data && keyRes.data.key) {
          dynamicKey = keyRes.data.key;
        }
      } catch (keyError) {
        console.warn("Could not fetch Razorpay key dynamically, using local fallback:", keyError);
      }

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
      const isMock = !orderData.key_id && !orderData.key;

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
        key: orderData.key_id || orderData.key || dynamicKey,
        amount: plan.price,
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
            await axios.post(`${API_BASE_URL}/api/razorpay/verify-upgrade`, {
              plan_name: plan.name,
              admin_id: adminUser?.id || adminUser?._id || '',
              razorpay_order_id: response.razorpay_order_id || orderData.razorpay_order_id || '',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature || 'mock_signature'
            }, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            alert("Credits added successfully!")
            setShowUpgradePlansModal(false)
            window.location.reload()
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

      if (!isMock) {
        options.order_id = orderData.razorpay_order_id;
      }

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

  const navItems = [
    { id: 'super-dashboard', label: 'Super Admin Dashboard', icon: BarChart2, path: '/superadmin/super-dashboard' },
    { id: 'team', label: 'Team Management', icon: Users, path: '/superadmin/team' },
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard, path: '/superadmin/dashboard' },
    { id: 'qualified', label: 'Qualified Candidates', icon: CheckCircle, path: '/superadmin/qualified-candidates' },
    { id: 'rejected', label: 'Rejected Candidates', icon: XCircle, path: '/superadmin/rejected-candidates' },
    { id: 'create', label: 'Create Interview', icon: Plus, path: '/superadmin/create-interview' },
    { id: 'settings', label: 'Profile Settings', icon: Settings, path: '/superadmin/profile-settings' },
  ]

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[260px_1fr] min-h-screen text-[#0f172a]"
      style={{
        background: `
          radial-gradient(circle at 8% 0%, ${accentWashStrong} 0, transparent 34%),
          radial-gradient(circle at 92% 12%, ${accentWash} 0, transparent 30%),
          linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.08)} 0%, #ffffff 42%, ${hexToRgba(currentAccent.primary, 0.10)} 100%)
        `,
      }}
    >
      {/* Sidebar */}
      <aside
        className="text-white p-6 flex flex-col gap-8 sticky top-0 h-screen z-50 shadow-lg shrink-0 w-[260px] overflow-hidden"
        style={{
          background: `
            radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.12), transparent 24%),
            linear-gradient(180deg, rgba(20, 37, 91, 0.96) 0%, rgba(30, 58, 138, 0.94) 46%, rgba(37, 99, 235, 0.9) 100%)
          `,
          boxShadow: `0 20px 60px rgba(15, 23, 42, 0.12)`
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white text-[#4f46e5] text-sm font-extrabold shadow-sm">
            <Shield size={16} fill="currentColor" />
          </div>
          <strong className="text-xl font-bold tracking-tight text-white font-title">Hire IQ</strong>
        </div>

        <nav className="flex flex-col gap-2 flex-grow overflow-y-auto scrollbar-none">
          <div className="text-[0.62rem] font-bold text-white/50 uppercase tracking-widest px-3 mb-1">
            SuperAdmin Control ({role})
          </div>
          {navItems.map(({ id, label, icon: Icon, path }) => (
            <NavLink
              key={id}
              to={path}
              className={({ isActive }) =>
                `w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer no-underline ${isActive && !liveResultsModalOpen && !showCreditsModal
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <Icon size={16} /> {label}
            </NavLink>
          ))}

          <div className="border-t border-white/10 my-2" />
          <button
            onClick={() => {
              dispatch(setLiveResultsModalOpen(true))
              setShowCreditsModal(false)
            }}
            className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${liveResultsModalOpen && !showCreditsModal
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
          >
            <Radio size={16} /> Live Results
          </button>

          <button
            onClick={() => {
              dispatch(setLiveResultsModalOpen(false))
              setShowCreditsModal(true)
            }}
            className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${showCreditsModal
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
          >
            <Coins size={16} /> Available Credits
          </button>
        </nav>

        <button
          onClick={handleLogout}
          className="w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium text-sm border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all"
        >
          <LogOut size={16} /> Logout
        </button>
      </aside>

      {/* Main Panel */}
      <div className="flex flex-col min-w-0">
        {/* Navbar */}
        <header
          className="border-b px-8 py-4 flex justify-between items-center text-[#1e293b] shadow-sm backdrop-blur-md"
          style={{
            background: `linear-gradient(90deg, rgba(255,255,255,0.92), ${hexToRgba(currentAccent.primary, 0.14)})`,
            borderColor: hexToRgba(currentAccent.primary, 0.22),
          }}
        >
          <div>
            <h2 className="text-xl font-bold text-slate-800">SuperAdmin Console</h2>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-full p-1 border border-slate-200">
              {Object.keys(accentColors).map(color => (
                <button
                  key={color}
                  onClick={() => setAccentName(color)}
                  className="w-3.5 h-3.5 rounded-full border-2 border-white cursor-pointer p-0 transition-all"
                  style={{
                    background: accentColors[color].primary,
                    boxShadow: accentName === color ? `0 0 0 2px ${accentColors[color].primary}` : 'none',
                  }}
                  title={color}
                />
              ))}
            </div>

            {/* Active Subscription Plan Badge */}
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-full px-3.5 py-1 text-xs font-bold shadow-sm">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
              <span>Active Plan: {adminUser?.subscription_plan || 'Free Trial'}</span>
            </div>

            {/* Clickable Credits indicator */}
            <button
              onClick={() => {
                dispatch(setLiveResultsModalOpen(false))
                setShowCreditsModal(true)
              }}
              className="flex items-center gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-full px-4 py-1 text-sm font-bold shadow-sm transition-all cursor-pointer outline-none"
              title="View Available Credits & Subscription Status"
            >
              <Coins size={14} className="text-primary" />
              <span>{adminUser?.credits ?? 0} credits left</span>
            </button>

            <span className="text-sm text-slate-600">
              Welcome back, <strong className="text-slate-800">{adminUser?.name || 'SuperAdmin'}</strong>
            </span>

            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-transparent border border-slate-200 rounded-lg cursor-pointer text-slate-600 hover:text-slate-800 hover:bg-slate-50 flex items-center gap-1.5 text-xs font-semibold"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>

        <main
          className="p-8 flex-grow overflow-y-auto"
          style={{
            background: `
              radial-gradient(circle at 0% 0%, ${accentPageStrong} 0, transparent 28%),
              radial-gradient(circle at 100% 18%, ${accentPage} 0, transparent 30%),
              linear-gradient(180deg, ${hexToRgba(currentAccent.primary, 0.10)} 0%, rgba(255,255,255,0.66) 38%, ${hexToRgba(currentAccent.primary, 0.08)} 100%)
            `,
          }}
        >
          <Outlet />
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
        handleUpdateDecision={() => { }}
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
    </div>
  )
}
