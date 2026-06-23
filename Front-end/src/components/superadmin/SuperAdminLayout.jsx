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
} from 'lucide-react'
import { logout } from '../../store/slices/authSlice'
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

  // Local theme states
  const [accentName, setAccentName] = useState('indigo')
  const [showUpgradePlansModal, setShowUpgradePlansModal] = useState(false)
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false)

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

  // Polling for telemetry
  useEffect(() => {
    if (!token) return
    dispatch(loadSuperAdminDashboard(selectedAdminFilter))
    const pollInterval = setInterval(() => {
      dispatch(loadSuperAdminDashboard(selectedAdminFilter))
    }, 12000)
    return () => clearInterval(pollInterval)
  }, [dispatch, token, selectedAdminFilter])

  const handleLogout = () => {
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    dispatch(logout())
    persistor.purge()
    navigate('/login')
  }

  const handleSelectPlan = async (plan) => {
    setIsProcessingUpgrade(true)
    try {
      const orderRes = await axios.post(`${API_BASE_URL}/api/razorpay/create-upgrade-order`, {
        plan_name: plan.name,
        amount_inr: plan.price / 100,
        credits: plan.credits
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const orderData = orderRes.data

      const options = {
        key: 'rzp_test_YourKeyHere',
        amount: plan.price,
        currency: 'INR',
        name: 'Hire IQ Credits',
        description: `Purchase ${plan.credits} Credits`,
        order_id: orderData.razorpay_order_id,
        handler: async function (response) {
          try {
            await axios.post(`${API_BASE_URL}/api/razorpay/verify-upgrade`, {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
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
        theme: { color: '#6366f1' }
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      alert(e.message)
    } finally {
      setIsProcessingUpgrade(false)
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

        <nav className="flex flex-col gap-2 flex-grow overflow-y-auto">
          <div className="text-[0.62rem] font-bold text-white/50 uppercase tracking-widest px-3 mb-1">
            SuperAdmin Control ({role})
          </div>
          {navItems.map(({ id, label, icon: Icon, path }) => (
            <NavLink
              key={id}
              to={path}
              className={({ isActive }) =>
                `w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer no-underline ${
                  isActive && !liveResultsModalOpen
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
            onClick={() => dispatch(setLiveResultsModalOpen(true))}
            className={`w-full text-left flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all border-none outline-none cursor-pointer ${
              liveResultsModalOpen
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Radio size={16} /> Live Results
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

            <div className="flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full pl-4 pr-1.5 py-1 text-sm font-bold shadow-sm">
              <i className="fas fa-layer-group text-[10px]"></i>
              {adminUser?.subscription_plan || 'Advance'} • {adminUser?.credits ?? 0} credits left
              <button
                onClick={() => setShowUpgradePlansModal(true)}
                className="ml-1 w-5 h-5 flex items-center justify-center bg-primary text-white rounded-full hover:bg-primary-hover shadow-md transition-colors"
                title="Buy Credits"
              >
                <i className="fas fa-plus text-[10px]"></i>
              </button>
            </div>

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
        isProcessing={isProcessingUpgrade}
      />

      <CandidateScorecardModal
        isOpen={!!selectedCandidate}
        onClose={() => dispatch(setSelectedCandidate(null))}
        selectedCandidate={selectedCandidate}
        loadingDetail={loadingDetail}
        candidateDetail={candidateDetail}
        handleUpdateDecision={() => {}}
      />

      <LiveResultsModal
        isOpen={liveResultsModalOpen}
        onClose={() => dispatch(setLiveResultsModalOpen(false))}
        ongoingLiveCount={ongoingLiveCount}
        ongoingAlertCount={ongoingAlertCount}
        ongoingSpeakingCount={ongoingSpeakingCount}
        ongoingCodingCount={ongoingCodingCount}
        liveSessions={liveSessions}
        handleOpenScorecard={() => {}}
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
