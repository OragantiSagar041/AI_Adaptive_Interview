import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import logo from '../assets/logo.png'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { RefreshCw } from 'lucide-react'
import SuperAdminSidebar from '../components/SuperAdminSidebar'
import AdminPage from './AdminPage'

export default function SuperAdminPage() {
  const navigate = useNavigate()

  // Authentication Context
  const token = sessionStorage.getItem('adminToken') || ''
  const adminId = sessionStorage.getItem('adminId') || ''
  const adminName = sessionStorage.getItem('adminName') || 'Admin'
  const adminRole = sessionStorage.getItem('adminRole') || 'tenant'

  // Verification: Redirect if not super_admin (or master override)
  useEffect(() => {
    if (adminRole !== 'super_admin' && adminRole !== 'master') {
      Swal.fire({
        title: 'Access Denied',
        text: 'You do not have permissions to access the Super Admin Console.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
      navigate('/login')
    }
  }, [adminRole, navigate])

  const [searchParams] = useSearchParams()
  // Derive activeTab from URL query param, default to 'super-dashboard'
  const activeTab = searchParams.get('tab') || 'super-dashboard'


  // Super Admin stats and data states
  const [credits, setCredits] = useState(0)
  const [totalSessions, setTotalSessions] = useState(0)
  const [completedSessions, setCompletedSessions] = useState(0)
  const [pendingSessions, setPendingSessions] = useState(0)

  // Team management admins list
  const [admins, setAdmins] = useState([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)

  // Pending credit requests list
  const [creditRequests, setCreditRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)

  // Chart Canvas references
  const saUsageChartRef = useRef(null)
  const saAdminPieChartRef = useRef(null)
  const saCreditsDoughnutChartRef = useRef(null)

  // Chart Instances
  const saUsageChartInstance = useRef(null)
  const saAdminPieChartInstance = useRef(null)
  const saCreditsDoughnutChartInstance = useRef(null)

  // Modals state
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false)
  const [newAdminForm, setNewAdminForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    credits: 0
  })
  const [addAdminLoading, setAddAdminLoading] = useState(false)

  // Setup accent colors
  const [accentColor, setAccentColor] = useState('indigo')
  const colors = {
    teal: { primary: '#0d9488', hover: '#0f766e' },
    indigo: { primary: '#6366f1', hover: '#4f46e5' },
    purple: { primary: '#9333ea', hover: '#7e22ce' },
    red: { primary: '#e11d48', hover: '#be123c' },
    green: { primary: '#16a34a', hover: '#15803d' },
    blue: { primary: '#2563eb', hover: '#1d4ed8' }
  }
  const currentAccent = colors[accentColor] || colors.indigo

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.style.setProperty('--accent-theme-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-color', currentAccent.primary)
    document.documentElement.style.setProperty('--primary-hover', currentAccent.hover)
  }, [accentColor, currentAccent])

  // Sync / Load data
  useEffect(() => {
    if (adminRole === 'super_admin' || adminRole === 'master') {
      loadStatsAndCharts()
      loadTeamManagement()
      loadCreditRequests()
    }
  }, [adminRole])

  // Chart rendering effect
  useEffect(() => {
    if (activeTab === 'super-dashboard' && window.Chart && totalSessions >= 0) {
      loadStatsAndCharts()
    }
    return () => {
      destroyCharts()
    }
  }, [activeTab])

  const destroyCharts = () => {
    if (saUsageChartInstance.current) {
      saUsageChartInstance.current.destroy()
      saUsageChartInstance.current = null
    }
    if (saAdminPieChartInstance.current) {
      saAdminPieChartInstance.current.destroy()
      saAdminPieChartInstance.current = null
    }
    if (saCreditsDoughnutChartInstance.current) {
      saCreditsDoughnutChartInstance.current.destroy()
      saCreditsDoughnutChartInstance.current = null
    }
  }

  const loadStatsAndCharts = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/super-admin/dashboard-stats`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setCredits(data.credits || 0)
        setTotalSessions(data.total_sessions || 0)
        setCompletedSessions(data.completed_sessions || 0)
        setPendingSessions(data.pending_sessions || 0)

        // Draw Charts
        destroyCharts()

        const ctxUsage = saUsageChartRef.current
        if (ctxUsage) {
          saUsageChartInstance.current = new window.Chart(ctxUsage, {
            type: 'line',
            data: {
              labels: data.chart_labels || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              datasets: [{
                label: 'Interviews Created',
                data: data.chart_data || [0, 0, 0, 0, 0, 0, 0],
                borderColor: currentAccent.primary,
                backgroundColor: `${currentAccent.primary}1A`,
                tension: 0.4,
                fill: true
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
          })
        }

        const ctxPie = saAdminPieChartRef.current
        if (ctxPie) {
          saAdminPieChartInstance.current = new window.Chart(ctxPie, {
            type: 'doughnut',
            data: {
              labels: data.admin_labels || ['No Admins'],
              datasets: [{
                data: data.admin_data || [1],
                backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' } }
            }
          })
        }

        const ctxCredits = saCreditsDoughnutChartRef.current
        if (ctxCredits) {
          saCreditsDoughnutChartInstance.current = new window.Chart(ctxCredits, {
            type: 'doughnut',
            data: {
              labels: ['Credits Used', 'Credits Available'],
              datasets: [{
                data: [data.total_sessions || 0, data.credits || 0],
                backgroundColor: ['#ef4444', '#10b981']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom' } }
            }
          })
        }
      }
    } catch (err) {
      console.error('Super admin dashboard stats load error', err)
    }
  }

  const loadTeamManagement = async () => {
    setLoadingAdmins(true)
    try {
      const res = await fetch(`${API_BASE_URL}/super-admin/admins`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAdmins(data.data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingAdmins(false)
    }
  }

  const loadCreditRequests = async () => {
    setLoadingRequests(true)
    try {
      const res = await fetch(`${API_BASE_URL}/super-admin/credit-requests`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setCreditRequests(data.data || [])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingRequests(false)
    }
  }

  // Add Sub-Admin Handler
  const handleAddAdminSubmit = async (e) => {
    e.preventDefault()
    setAddAdminLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/super-admin/admins`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newAdminForm.name,
          username: newAdminForm.username,
          email: newAdminForm.email,
          password: newAdminForm.password,
          credits: parseInt(newAdminForm.credits)
        })
      })
      if (res.ok) {
        Swal.fire('Admin Added', 'provisioned workspace user successfully!', 'success')
        setIsAddAdminOpen(false)
        setNewAdminForm({
          name: '',
          username: '',
          email: '',
          password: '',
          credits: 0
        })
        loadTeamManagement()
        loadStatsAndCharts()
      } else {
        const data = await res.json()
        throw new Error(data.detail || 'Failed to add admin')
      }
    } catch (e) {
      Swal.fire('Error', e.message, 'error')
    } finally {
      setAddAdminLoading(false)
    }
  }

  // Credit Request Decider
  const handleDecideCreditRequest = async (requestId, status) => {
    const confirm = await Swal.fire({
      title: `${status === 'approved' ? 'Approve' : 'Reject'} Request?`,
      text: `Are you sure you want to ${status === 'approved' ? 'approve' : 'reject'} this request?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes',
      background: '#161c2d',
      color: '#fff'
    })
    if (!confirm.isConfirmed) return

    try {
      const res = await fetch(`${API_BASE_URL}/super-admin/credit-requests/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: status })
      })
      if (res.ok) {
        Swal.fire('Success', `Credit request ${status} successfully!`, 'success')
        loadCreditRequests()
        loadStatsAndCharts()
      } else {
        throw new Error('Action rejected by server')
      }
    } catch (e) {
      Swal.fire('Action Failed', e.message, 'error')
    }
  }

  const handleLogout = () => {
    sessionStorage.clear()
    navigate('/login')
  }

  // Admin-style tabs are delegated to AdminPage with role="superadmin"
  const adminStyleTabs = ['dashboard', 'qualified', 'rejected', 'create', 'settings', 'live']
  if (adminStyleTabs.includes(activeTab)) {
    return <AdminPage role="superadmin" />
  }

  return (
    <div
      className="flex h-screen overflow-hidden text-slate-800 font-sans selection:bg-slate-200"
      style={{
        backgroundImage: `
          radial-gradient(circle at 0% 0%, rgba(99, 102, 241, 0.15) 0, transparent 28%),
          radial-gradient(circle at 100% 18%, rgba(99, 102, 241, 0.12) 0, transparent 30%),
          linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, rgba(255, 255, 255, 0.88) 38%, rgba(99, 102, 241, 0.06) 100%)
        `,
        backgroundColor: '#f4f7fc'
      }}
    >
      {/* LEFT SIDEBAR */}
      <SuperAdminSidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          navigate(`/super-admin?tab=${tab}`)
        }}
        onLogout={handleLogout}
        currentAccent={{
          primary: currentAccent.primary,
          hover: currentAccent.hover,
          glow: 'rgba(99, 102, 241, 0.15)'
        }}
      />

      {/* RIGHT CONTENT WRAPPER */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="mx-8 mt-6 px-6 py-3 rounded-[5px] bg-[#fcfcfca0] border border-[#11242714] shadow-[0_10px_40px_5px_rgba(194,194,194,0.18)] backdrop-blur-md flex justify-between items-center z-20 text-[#0f172a]">
          <h2 className="text-base font-bold text-[#111827] tracking-wide">
            {activeTab === 'super-dashboard' ? 'Super Admin Console' : activeTab === 'team' ? 'Team Management' : 'Super Admin Console'}
          </h2>

          <div className="flex items-center gap-4">
            {/* Color switcher dots */}
            <div className="flex gap-2">
              {Object.keys(colors).map(colorKey => (
                <button
                  key={colorKey}
                  onClick={() => setAccentColor(colorKey)}
                  className={`w-3.5 h-3.5 rounded-full border border-black/10 cursor-pointer transition-transform ${accentColor === colorKey ? 'scale-125 ring-2 ring-indigo-500' : ''
                    }`}
                  style={{ backgroundColor: colors[colorKey].primary }}
                  title={`Select ${colorKey}`}
                />
              ))}
            </div>

            {/* Badge for plan */}
            <div className="hidden sm:flex items-center gap-1.5 bg-indigo-500/10 text-indigo-700 border border-indigo-500/20 rounded-full px-3 py-1 text-xs font-bold whitespace-nowrap">
              <i className="fas fa-gem text-[10px]" /> {sessionStorage.getItem('subscriptionPlan') || 'Advance'} • {credits} credits left
            </div>

            <div className="text-xs text-slate-600 font-medium">
              Welcome back, <span className="text-[#111827] font-bold">{adminName}</span>
            </div>

            <button
              onClick={handleLogout}
              className="px-4 py-2 text-xs font-semibold text-[#0f172a] bg-white border border-[#11242714] rounded hover:bg-slate-50 shadow-sm flex items-center gap-1.5 cursor-pointer outline-none transition-colors"
            >
              <i className="fas fa-power-off text-slate-500" /> Logout
            </button>
          </div>
        </header>

        {/* Workspace views */}
        <main className="flex-1 overflow-y-auto p-8">
          {/* TAB VIEW: SUPER ADMIN DASHBOARD */}
          {activeTab === 'super-dashboard' && (
            <div className="space-y-8 max-w-6xl">
              {/* Stat Cards */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Available Credits</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-emerald-500">{credits}</h3>
                  </div>
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-coins" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Total Interviews</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-slate-900">{totalSessions}</h3>
                  </div>
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-video" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Completed</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-slate-900">{completedSessions}</h3>
                  </div>
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-check-circle" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Pending</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-slate-900">{pendingSessions}</h3>
                  </div>
                  <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-clock" />
                  </div>
                </div>
              </div>

              {/* Data Visualization Charts Area */}
              <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr_1fr]">
                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Interviews Last 7 Days</h3>
                  <div className="h-[280px] w-full relative">
                    <canvas ref={saUsageChartRef} id="saUsageChart" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Interviews by Admin</h3>
                  <div className="h-[280px] w-full relative">
                    <canvas ref={saAdminPieChartRef} id="saAdminPieChart" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Credits Used vs Available</h3>
                  <div className="h-[280px] w-full relative">
                    <canvas ref={saCreditsDoughnutChartRef} id="saCreditsDoughnutChart" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB VIEW: TEAM MANAGEMENT */}
          {activeTab === 'team' && (
            <div className="space-y-8 max-w-6xl text-slate-800">
              {/* Admins Table List Card */}
              <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Administrators Console</h3>
                    <p className="text-xs text-slate-500 mt-1">Manage sub-admins and their allocated credits</p>
                  </div>
                  <button
                    onClick={() => setIsAddAdminOpen(true)}
                    className="px-5 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs cursor-pointer border-none shadow-[0_4px_14px_rgba(99,102,241,0.25)] transition-all"
                  >
                    + Add Admin
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Name</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Email</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Role</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Credits</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingAdmins ? (
                        <tr>
                          <td colSpan="5" className="p-10 text-center text-slate-500">
                            <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Syncing team members...
                          </td>
                        </tr>
                      ) : admins.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="p-10 text-center text-slate-500">
                            No additional sub-admins provisioned. Click 'Add Admin' to invite team members.
                          </td>
                        </tr>
                      ) : (
                        admins.map(admin => (
                          <tr key={admin.id || admin.username} className="hover:bg-slate-50/50">
                            <td className="p-4 font-bold text-slate-850 text-sm">{admin.name || admin.username}</td>
                            <td className="p-4 text-xs text-slate-500">{admin.email}</td>
                            <td className="p-4 text-xs text-slate-500 capitalize">{admin.role || 'Admin'}</td>
                            <td className="p-4 text-xs text-slate-500">{admin.credits || 0}</td>
                            <td className="p-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${admin.login_enabled === false ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                }`}>
                                {admin.login_enabled === false ? 'Deactivated' : 'Active'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Credit Requests Card */}
              <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <div className="p-6 border-b border-slate-100">
                  <h3 className="text-base font-bold text-slate-800">Pending Credit Requests</h3>
                  <p className="text-xs text-slate-500 mt-1">Approve or reject credit request notifications from sub-admins</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Date</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Admin Username</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Amount Requested</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Reason</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Status</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingRequests ? (
                        <tr>
                          <td colSpan="6" className="p-10 text-center text-slate-500">
                            <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Syncing requests...
                          </td>
                        </tr>
                      ) : creditRequests.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="p-10 text-center text-slate-500">
                            No credit request notifications are pending.
                          </td>
                        </tr>
                      ) : (
                        creditRequests.map(r => (
                          <tr key={r.id || r._id} className="hover:bg-slate-50/50">
                            <td className="p-4 text-xs text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '-'}</td>
                            <td className="p-4 font-bold text-slate-850 text-sm">{r.admin_username}</td>
                            <td className="p-4 text-xs font-bold text-amber-500">{r.amount_requested} credits</td>
                            <td className="p-4 text-xs text-slate-500 max-w-xs truncate">{r.reason || '-'}</td>
                            <td className="p-4 capitalize">
                              <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : r.status === 'rejected' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                }`}>
                                {r.status || 'pending'}
                              </span>
                            </td>
                            <td className="p-4">
                              {r.status === 'pending' || !r.status ? (
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDecideCreditRequest(r.id || r._id, 'approved')}
                                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer border-none transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleDecideCreditRequest(r.id || r._id, 'rejected')}
                                    className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs cursor-pointer border-none transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Processed</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: ADD ADMIN */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleAddAdminSubmit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex justify-between items-center border-b border-slate-250 pb-3">
              <h3 className="font-bold text-slate-800">Add New Admin</h3>
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="text-slate-400 hover:text-slate-800 bg-transparent border-none cursor-pointer outline-none text-base"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Full Name</label>
                <input
                  type="text"
                  required
                  value={newAdminForm.name}
                  onChange={(e) => setNewAdminForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. John Doe"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-850 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Username</label>
                <input
                  type="text"
                  required
                  value={newAdminForm.username}
                  onChange={(e) => setNewAdminForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="e.g. john_d"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-850 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Email Address</label>
                <input
                  type="email"
                  required
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g. john@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-850 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Password</label>
                  <input
                    type="password"
                    required
                    value={newAdminForm.password}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Credits</label>
                  <input
                    type="number"
                    min="0"
                    value={newAdminForm.credits}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, credits: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-850 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addAdminLoading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {addAdminLoading ? 'Adding...' : 'Add Admin'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
