import React, { useState, useEffect } from 'react'
import { useNavigate, Navigate, useSearchParams, useLocation, Outlet } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { RefreshCw } from 'lucide-react'
import axios from 'axios'
import AdminLayout from '../components/admin/AdminLayout'
import ProfileSettings from '../components/admin/ProfileSettings'
import { CandidateScorecardModal, LiveResultsModal, RequestCreditsModal, UpgradePlansModal } from '../components/admin/modals/AdminModals'
import { getComputedStatus } from '../utils/adminFormatters'

import OverviewDashboardPage from './admin/OverviewDashboardPage'
import QualifiedCandidatesPage from './admin/QualifiedCandidatesPage'
import RejectedCandidatesPage from './admin/RejectedCandidatesPage'
import CreateInterviewPage from './admin/CreateInterviewPage'

import { logout } from '../store/slices/authSlice'
import { persistor } from '../store/store'
import { loadDashboardData } from '../store/slices/dashboardSlice'
import {
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setSelectedIds,
  setCurrentPage,
  handleExportExcel,
  handleBulkDelete
} from '../store/slices/candidatesSlice'
import {
  setLiveResultsModalOpen,
  setSelectedCandidate,
  handleOpenScorecard,
  handleDeleteSession,
  handleUpdateDecision
} from '../store/slices/interviewSlice'
import { handleUpdateCreditRequest } from '../store/slices/creditsSlice'

const getFilteredCandidates = (candidatesState) => {
  const { candidates, searchTerm, statusFilter, startDate, endDate, sortBy } = candidatesState
  const filtered = candidates.filter(c => {
    const name = (c.candidate_name || '').toLowerCase()
    const email = (c.candidate_email || '').toLowerCase()
    const position = (c.interview_title || '').toLowerCase()
    const query = searchTerm.toLowerCase()

    const matchesSearch = name.includes(query) || email.includes(query) || position.includes(query)
    if (!matchesSearch) return false

    const computedStatus = getComputedStatus(c)
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        if (computedStatus !== 'pending' && computedStatus !== 'started') return false
      } else if (computedStatus !== statusFilter) {
        return false
      }
    }

    const createdDate = new Date(c.created_at)
    if (startDate && createdDate < new Date(startDate)) return false
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      if (createdDate > endDateTime) return false
    }

    return true
  })

  return [...filtered].sort((a, b) => {
    if (sortBy === 'score') {
      return Number(b.score || 0) - Number(a.score || 0)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export default function AdminPage({ role: initialRole = 'admin' }) {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { pathname } = useLocation()

  // Auth selectors
  const token = useSelector(state => state.auth.token)
  const adminUser = useSelector(state => state.auth.adminUser)
  const role = useSelector(state => state.auth.role) || initialRole
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Dashboard selectors
  const dbStats = useSelector(state => state.dashboard.dbStats)
  const ongoingLiveCount = useSelector(state => state.dashboard.ongoingLiveCount)
  const ongoingAlertCount = useSelector(state => state.dashboard.ongoingAlertCount)
  const ongoingSpeakingCount = useSelector(state => state.dashboard.ongoingSpeakingCount)
  const ongoingCodingCount = useSelector(state => state.dashboard.ongoingCodingCount)
  const ongoingMonitoredCount = useSelector(state => state.dashboard.ongoingMonitoredCount)
  const liveSessions = useSelector(state => state.dashboard.liveSessions)
  const dashboardStatus = useSelector(state => state.dashboard.status)
  const loadingData = dashboardStatus === 'loading'

  // Candidates selectors
  const candidates = useSelector(state => state.candidates.candidates)
  const paginatedCandidates = useSelector(state => state.candidates.paginatedCandidates)
  const selectedIds = useSelector(state => state.candidates.selectedIds)
  const searchTerm = useSelector(state => state.candidates.searchTerm)
  const startDate = useSelector(state => state.candidates.startDate)
  const endDate = useSelector(state => state.candidates.endDate)
  const statusFilter = useSelector(state => state.candidates.statusFilter)
  const sortBy = useSelector(state => state.candidates.sortBy)
  const totalPages = useSelector(state => state.candidates.totalPages)
  const startIndex = useSelector(state => state.candidates.startIndex)
  const endIndex = useSelector(state => state.candidates.endIndex)
  const totalItems = useSelector(state => state.candidates.totalItems)
  const currentPage = useSelector(state => state.candidates.currentPage)

  // Interview selectors
  const liveResultsModalOpen = useSelector(state => state.interview.liveResultsModalOpen)
  const selectedCandidate = useSelector(state => state.interview.selectedCandidate)
  const candidateDetail = useSelector(state => state.interview.candidateDetail)
  const loadingDetail = useSelector(state => state.interview.loadingDetail)

  // Credits selectors
  const creditRequests = useSelector(state => state.credits.creditRequests)

  // Sub-admins and dropdown filter states (Local component states are fine)
  const [subAdmins, setSubAdmins] = useState([])
  const [selectedAdminId, setSelectedAdminId] = useState('')

  useEffect(() => {
    if (role === 'superadmin') {
      const fetchSubAdmins = async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}/super-admin/admins`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
          setSubAdmins(res.data.data || [])
        } catch (err) {
          console.error("Error fetching sub-admins:", err)
        }
      }
      fetchSubAdmins()
    }
  }, [role, token, API_BASE_URL])

  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  
  // Derive activeTab from path or search params
  let activeTab = 'dashboard'
  if (role === 'superadmin') {
    activeTab = tabParam || 'dashboard'
  } else {
    if (pathname.includes('qualified-candidates')) {
      activeTab = 'qualified'
    } else if (pathname.includes('rejected-candidates')) {
      activeTab = 'rejected'
    } else if (pathname.includes('create-interview')) {
      activeTab = 'create'
    } else if (pathname.includes('profile-settings')) {
      activeTab = 'settings'
    }
  }

  // Keep liveResultsModal sync with searchParam
  useEffect(() => {
    if (tabParam === 'live') {
      dispatch(setLiveResultsModalOpen(true))
    }
  }, [tabParam, dispatch])

  // Accent color state
  const [accentName, setAccentName] = useState('indigo')

  // Credit / Razorpay states
  const [showRequestCreditsModal, setShowRequestCreditsModal] = useState(false)
  const [creditsToRequest, setCreditsToRequest] = useState(100)
  const [isRequesting, setIsRequesting] = useState(false)
  const [showUpgradePlansModal, setShowUpgradePlansModal] = useState(false)
  const [isProcessingUpgrade, setIsProcessingUpgrade] = useState(false)

  const accentColors = {
    teal: { primary: '#0d9488', hover: '#0f766e', glow: 'rgba(13, 148, 136, 0.15)' },
    indigo: { primary: '#6366f1', hover: '#4f46e5', glow: 'rgba(99, 102, 241, 0.15)' },
    purple: { primary: '#9333ea', hover: '#7e22ce', glow: 'rgba(147, 51, 234, 0.15)' },
    red: { primary: '#e11d48', hover: '#be123c', glow: 'rgba(225, 29, 72, 0.15)' },
    green: { primary: '#16a34a', hover: '#15803d', glow: 'rgba(22, 163, 74, 0.15)' },
    blue: { primary: '#2563eb', hover: '#1d4ed8', glow: 'rgba(37, 99, 237, 0.15)' }
  }

  const currentAccent = accentColors[accentName] || accentColors.indigo
  
  // Inject CSS override variables
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
    document.documentElement.style.setProperty('--primary-glow', currentAccent.glow)
  }, [accentName, currentAccent])

  // Polling Effect for dashboard stats and ongoing interviews
  useEffect(() => {
    if (!token) return

    dispatch(loadDashboardData(selectedAdminId))
    const statsInterval = setInterval(() => {
      dispatch(loadDashboardData(selectedAdminId))
    }, 12000)

    return () => clearInterval(statsInterval)
  }, [dispatch, token, selectedAdminId])

  const loadDashboardDataAction = () => {
    dispatch(loadDashboardData(selectedAdminId))
  }

  const handleAddCreditsClick = () => {
    if (adminUser?.role === 'superadmin' || role === 'superadmin') {
      setShowUpgradePlansModal(true)
    } else {
      setShowRequestCreditsModal(true)
    }
  }

  const handleRequestCredits = async () => {
    if (!creditsToRequest || creditsToRequest < 10) return;
    setIsRequesting(true);
    try {
      await axios.post(`${API_BASE_URL}/admin/credit-requests`, {
        requested_amount: parseInt(creditsToRequest)
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      alert("Credit request sent successfully!");
      setShowRequestCreditsModal(false);
    } catch (e) {
      console.error(e);
      alert("Failed to send credit request.");
    } finally {
      setIsRequesting(false);
    }
  }

  const handleUpdateCreditRequestAction = (requestId, status) => {
    dispatch(handleUpdateCreditRequest({ requestId, status }))
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
          } catch(e){
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

  const handleLogout = () => {
    sessionStorage.removeItem('adminToken')
    sessionStorage.removeItem('adminUser')
    dispatch(logout())
    persistor.purge()
    navigate('/login')
  }

  const handleDeleteSessionAction = (linkId) => {
    if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return
    dispatch(handleDeleteSession(linkId))
  }

  const handleBulkDeleteAction = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected sessions? This cannot be undone.`)) return
    dispatch(handleBulkDelete(selectedIds))
  }

  const handleOpenScorecardAction = (candidate) => {
    dispatch(handleOpenScorecard(candidate))
  }

  const handleUpdateDecisionAction = (linkId, decision) => {
    if (!confirm(`Are you sure you want to mark this candidate as ${decision.toUpperCase()}? Official email will be sent.`)) return
    dispatch(handleUpdateDecision({ linkId, decision }))
  }

  const handleExportExcelAction = () => {
    const filtered = getFilteredCandidates({ candidates, searchTerm, statusFilter, startDate, endDate, sortBy })
    if (filtered.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleExportExcel(filtered.map(c => ({
      ...c,
      status: getComputedStatus(c)
    }))))
  }

  if (!token) {
    return <Navigate to="/login" replace />
  }

  const renderAdminSelector = () => {
    if (role !== 'superadmin') return null
    return (
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-semibold text-slate-500">Filter by Tenant Admin:</span>
        <select
          value={selectedAdminId}
          onChange={(e) => setSelectedAdminId(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500 transition-all font-semibold shadow-sm cursor-pointer"
        >
          <option value="">All Admins (Aggregated)</option>
          {subAdmins.map(adm => (
            <option key={adm.id || adm._id} value={adm.id || adm._id}>
              {adm.name || adm.username}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // To preserve sub-components backwards-compatibility, we can pass down sharedContext
  const sharedContext = {
    role,
    token,
    adminUser,
    candidates,
    loadingData,
    loadDashboardData: loadDashboardDataAction,
    handleExportExcel: handleExportExcelAction,
    handleDeleteSession: handleDeleteSessionAction,
    handleBulkDelete: handleBulkDeleteAction,
    handleUpdateDecision: handleUpdateDecisionAction,
    handleUpdateCreditRequest: handleUpdateCreditRequestAction,
    handleOpenScorecard: handleOpenScorecardAction,
    selectedCandidate,
    setSelectedCandidate: (c) => dispatch(setSelectedCandidate(c)),
    candidateDetail,
    loadingDetail,
    dbStats,
    ongoingLiveCount,
    ongoingAlertCount,
    ongoingSpeakingCount,
    ongoingCodingCount,
    ongoingMonitoredCount,
    setLiveResultsModalOpen: (isOpen) => dispatch(setLiveResultsModalOpen(isOpen)),
    searchTerm,
    setSearchTerm: (term) => dispatch(setSearchTerm(term)),
    startDate,
    setStartDate: (date) => dispatch(setStartDate(date)),
    endDate,
    setEndDate: (date) => dispatch(setEndDate(date)),
    statusFilter,
    setStatusFilter: (filter) => dispatch(setStatusFilter(filter)),
    sortBy,
    setSortBy: (sort) => dispatch(setSortBy(sort)),
    selectedIds,
    setSelectedIds: (ids) => dispatch(setSelectedIds(ids)),
    currentPage,
    setCurrentPage: (page) => dispatch(setCurrentPage(page)),
    creditRequests,
    API_BASE_URL,
    totalPages,
    startIndex,
    endIndex,
    totalItems,
    paginatedCandidates,
    getComputedStatus
  }

  const renderContent = () => {
    if (role === 'superadmin') {
      switch (activeTab) {
        case 'dashboard':
          return <OverviewDashboardPage {...sharedContext} />
        case 'qualified':
          return <QualifiedCandidatesPage {...sharedContext} />
        case 'rejected':
          return <RejectedCandidatesPage {...sharedContext} />
        case 'create':
          return <CreateInterviewPage {...sharedContext} />
        case 'settings':
          return <ProfileSettings {...sharedContext} />
        default:
          return <OverviewDashboardPage {...sharedContext} />
      }
    }
    return <Outlet context={sharedContext} />
  }

  return (
    <>
      <AdminLayout
        role={role}
        activeTab={liveResultsModalOpen ? 'live' : activeTab}
        accentColors={accentColors}
        accentName={accentName}
        currentAccent={currentAccent}
        adminUser={adminUser}
        onAccentChange={setAccentName}
        onLogout={handleLogout}
        onAddCredits={handleAddCreditsClick}
        onTabChange={(tab) => {
          if (tab === 'live') {
            dispatch(setLiveResultsModalOpen(true))
          } else {
            if (role === 'superadmin') {
              navigate(`/super-admin?tab=${tab}`)
            } else {
              const tabToPath = {
                dashboard: '/admin/dashboard',
                qualified: '/admin/qualified-candidates',
                rejected: '/admin/rejected-candidates',
                create: '/admin/create-interview',
                settings: '/admin/profile-settings'
              }
              navigate(tabToPath[tab] || '/admin/dashboard')
            }
          }
        }}
      >
        {loadingData && candidates.length === 0 ? (
          <div className="flex items-center gap-2.5 text-slate-500">
            <RefreshCw size={18} className="animate-spin" />
            <span>Refreshing console workspace...</span>
          </div>
        ) : (
          <>
            {renderAdminSelector()}
            {renderContent()}
          </>
        )}
      </AdminLayout>

      <RequestCreditsModal
        isOpen={showRequestCreditsModal}
        onClose={() => setShowRequestCreditsModal(false)}
        creditsToRequest={creditsToRequest}
        setCreditsToRequest={setCreditsToRequest}
        handleRequestCredits={handleRequestCredits}
        isRequesting={isRequesting}
      />

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
        handleOpenScorecard={handleOpenScorecardAction}
      />
    </>
  )
}
