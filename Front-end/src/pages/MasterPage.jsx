import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import logo from '../assets/logo.png'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { RefreshCw } from 'lucide-react'
import DemoRequests from './DemoRequests'



export default function MasterPage() {
  const navigate = useNavigate()

  // Session user context
  const adminId = sessionStorage.getItem('adminId') || ''
  const adminName = sessionStorage.getItem('adminName') || 'Master Admin'
  const adminRole = sessionStorage.getItem('adminRole') || 'tenant'

  // Verification: Redirect if not master
  useEffect(() => {
    if (adminRole !== 'master') {
      Swal.fire({
        title: 'Access Denied',
        text: 'You do not have permissions to access the Master Control Panel.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
      navigate('/login')
    }
  }, [adminRole, navigate])

  // Active view tab state: 'dashboard', 'plans', 'subscribers', 'create-tenant'
  const [activeTab, setActiveTab] = useState('dashboard')

  // Subscribers / Companies list state
  const [companies, setCompanies] = useState([])
  const [loadingCompanies, setLoadingCompanies] = useState(false)
  const [subscriberSearch, setSubscriberSearch] = useState('')
  const [subscriberPlanFilter, setSubscriberPlanFilter] = useState('all')
  const [subscriberStatusFilter, setSubscriberStatusFilter] = useState('all')
  const [subscriberSort, setSubscriberSort] = useState('name')

  // Subscription plans state
  const [plans, setPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  // Modals state
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateTenantId, setUpdateTenantId] = useState('')
  const [updateTenantPlan, setUpdateTenantPlan] = useState('trial')
  const [updateTenantDays, setUpdateTenantDays] = useState(0)
  const [updateLoading, setUpdateLoading] = useState(false)

  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false)
  const [editPlanName, setEditPlanName] = useState('')
  const [editPlanCredits, setEditPlanCredits] = useState(250)
  const [editPlanPrice, setEditPlanPrice] = useState(0)
  const [editPlanFeatures, setEditPlanFeatures] = useState([])
  const [editPlanLoading, setEditPlanLoading] = useState(false)

  // Create tenant form state
  const [createTenantForm, setCreateTenantForm] = useState({
    username: '',
    email: '',
    password: '',
    company_name: '',
    plan_name: 'trial'
  })
  const [createTenantLoading, setCreateTenantLoading] = useState(false)

  // Chart refs & instances
  const mrrChartRef = useRef(null)
  const planDistChartRef = useRef(null)
  const mrrChartInstance = useRef(null)
  const planDistChartInstance = useRef(null)

  // Accent color switcher
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
    if (adminRole === 'master') {
      fetchCompanies()
      fetchPlans()
    }
  }, [adminRole])

  // Chart rendering effect
  useEffect(() => {
    if (activeTab === 'dashboard' && companies.length > 0 && window.Chart) {
      renderCharts()
    }
    return () => {
      destroyCharts()
    }
  }, [activeTab, companies])

  async function fetchCompanies() {
    setLoadingCompanies(true)
    try {
      const res = await fetch(`${API_BASE_URL}/master/companies?master_id=${encodeURIComponent(adminId)}`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}` }
      })
      const data = await res.json()
      if (res.ok && data.status === 'success') {
        setCompanies(data.data || [])
      } else {
        throw new Error(data.message || 'Failed to fetch companies')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingCompanies(false)
    }
  }

  async function fetchPlans() {
    setLoadingPlans(true)
    try {
      const res = await fetch(`${API_BASE_URL}/api/plans`)
      const data = await res.json()
      if (res.ok && data.status === 'success') {
        setPlans(data.data || [])
      } else {
        throw new Error(data.message || 'Failed to fetch plans')
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingPlans(false)
    }
  }

  // Chart.js helper methods
  const destroyCharts = () => {
    if (mrrChartInstance.current) {
      mrrChartInstance.current.destroy()
      mrrChartInstance.current = null
    }
    if (planDistChartInstance.current) {
      planDistChartInstance.current.destroy()
      planDistChartInstance.current = null
    }
  }

  const renderCharts = () => {
    destroyCharts()

    // Aggregate plan counts
    const planCounts = {}
    companies.forEach(c => {
      const p = c.plan_name || 'Free Trial'
      planCounts[p] = (planCounts[p] || 0) + 1
    })

    const ctxMrr = mrrChartRef.current
    if (ctxMrr) {
      mrrChartInstance.current = new window.Chart(ctxMrr, {
        type: 'line',
        data: {
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          datasets: [{
            label: 'MRR ($)',
            data: [5000, 6500, 8200, 9500, 11000, companies.length * 150],
            borderColor: currentAccent.primary,
            backgroundColor: `${currentAccent.primary}33`,
            borderWidth: 3,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
            x: { grid: { display: false } }
          }
        }
      })
    }

    const ctxPlan = planDistChartRef.current
    if (ctxPlan) {
      const labels = Object.keys(planCounts).length ? Object.keys(planCounts) : ['Free Trial', 'Basic', 'Advance']
      const dataVals = Object.keys(planCounts).length ? Object.values(planCounts) : [10, 5, 2]
      planDistChartInstance.current = new window.Chart(ctxPlan, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: dataVals,
            backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'],
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '75%',
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } }
          }
        }
      })
    }
  }

  // Impersonate / Log into subscriber portal
  const handleImpersonateLogin = async (tenantId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/master/companies/${tenantId}/login?master_id=${encodeURIComponent(adminId)}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}` }
      })
      if (res.ok) {
        const data = await res.json()
        
        sessionStorage.setItem('adminToken', data.token)
        sessionStorage.setItem('adminId', data.admin_id)
        sessionStorage.setItem('adminEmail', data.email || '')
        sessionStorage.setItem('adminName', data.username || '')
        sessionStorage.setItem('adminRole', data.role || 'tenant')
        sessionStorage.setItem('subscriptionPlan', data.subscription_plan || 'Free Trial')
        sessionStorage.setItem('subscriptionPlanKey', data.subscription_plan_key || 'trial')
        sessionStorage.setItem('planCapabilities', JSON.stringify(data.plan_capabilities || {}))
        sessionStorage.setItem('subscriptionExpiry', data.subscription_expiry || '')
        sessionStorage.setItem('subscriptionCredits', data.credits ?? '')
        sessionStorage.setItem('adminCompany', data.company_name || '')

        Swal.fire({
          title: 'Impersonation Successful',
          text: `Switching to dashboard for ${data.company_name || 'Tenant'}`,
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          background: '#161c2d',
          color: '#fff',
        }).then(() => {
          navigate('/admin')
        })
      } else {
        const data = await res.json()
        throw new Error(data.detail || 'Impersonation failed')
      }
    } catch (e) {
      Swal.fire('Impersonation Failed', e.message, 'error')
    }
  }

  // Delete Tenant
  const handleDeleteTenant = async (tenantId) => {
    const confirm = await Swal.fire({
      title: 'Are you sure?',
      text: 'This will permanently delete the tenant account, configurations, and candidates.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
      background: '#161c2d',
      color: '#fff',
    })

    if (!confirm.isConfirmed) return

    try {
      const res = await fetch(`${API_BASE_URL}/master/companies/${encodeURIComponent(tenantId)}?master_id=${encodeURIComponent(adminId)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}` }
      })
      if (res.ok) {
        Swal.fire('Deleted!', 'Tenant has been removed.', 'success')
        fetchCompanies()
      } else {
        throw new Error('Deletion rejected by server')
      }
    } catch (e) {
      Swal.fire('Delete Failed', e.message, 'error')
    }
  }

  // Update Plan Modal Handlers
  const handleOpenUpdateModal = (c) => {
    setUpdateTenantId(c.company_id || c.id)
    setUpdateTenantPlan(c.plan_name === 'Free Trial' ? 'trial' : c.plan_name.toLowerCase())
    setUpdateTenantDays(0)
    setIsUpdateModalOpen(true)
  }

  const handleUpdateTenantSubmit = async (e) => {
    e.preventDefault()
    setUpdateLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/master/companies/${encodeURIComponent(updateTenantId)}?master_id=${encodeURIComponent(adminId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          plan_name: updateTenantPlan,
          extend_days: parseInt(updateTenantDays)
        })
      })
      if (res.ok) {
        Swal.fire('Updated', 'Subscription successfully updated!', 'success')
        setIsUpdateModalOpen(false)
        fetchCompanies()
      } else {
        throw new Error('Failed to update subscription')
      }
    } catch (e) {
      Swal.fire('Error', e.message, 'error')
    } finally {
      setUpdateLoading(false)
    }
  }

  // Edit Plan Details Modal Handlers
  const handleOpenEditPlanModal = (p) => {
    setEditPlanName(p.plan_name)
    setEditPlanCredits(p.credits_granted || 250)
    setEditPlanPrice(p.price || 0)
    setEditPlanFeatures(p.features || [])
    setIsEditPlanModalOpen(true)
  }

  const handleEditPlanSubmit = async (e) => {
    e.preventDefault()
    setEditPlanLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/master/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          plan_name: editPlanName,
          credits_granted: editPlanCredits,
          price: editPlanPrice,
          features: editPlanFeatures
        })
      })
      if (res.ok) {
        Swal.fire('Saved', 'Plan details updated successfully!', 'success')
        setIsEditPlanModalOpen(false)
        fetchPlans()
      } else {
        throw new Error('Failed to save plan changes')
      }
    } catch (e) {
      Swal.fire('Error', e.message, 'error')
    } finally {
      setEditPlanLoading(false)
    }
  }

  // Tenant Creation Handler
  const handleCreateTenant = async (e) => {
    e.preventDefault()
    setCreateTenantLoading(true)
    try {
      const res = await fetch(`${API_BASE_URL}/master/tenants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          username: createTenantForm.username,
          email: createTenantForm.email,
          password: createTenantForm.password,
          company_name: createTenantForm.company_name,
          plan_name: createTenantForm.plan_name
        })
      })
      if (res.ok) {
        Swal.fire('Tenant Created', 'Provisioned tenant account successfully!', 'success')
        setCreateTenantForm({
          username: '',
          email: '',
          password: '',
          company_name: '',
          plan_name: 'trial'
        })
        fetchCompanies()
        setActiveTab('dashboard')
      } else {
        const data = await res.json()
        throw new Error(data.detail || 'Could not provision new tenant')
      }
    } catch (e) {
      Swal.fire('Create Failed', e.message, 'error')
    } finally {
      setCreateTenantLoading(false)
    }
  }

  // Logout Handler
  const handleLogout = () => {
    sessionStorage.clear()
    navigate('/login')
  }

  // Filtration logic for subscriber list
  const filteredCompanies = companies.filter(c => {
    const query = subscriberSearch.toLowerCase()
    const matchesSearch =
      c.company_name?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.username?.toLowerCase().includes(query)

    const matchesPlan =
      subscriberPlanFilter === 'all' ||
      c.plan_name?.toLowerCase() === subscriberPlanFilter

    const isExpired = c.subscription_expiry && new Date(c.subscription_expiry) < new Date()
    const matchesStatus =
      subscriberStatusFilter === 'all' ||
      (subscriberStatusFilter === 'expired' && isExpired) ||
      (subscriberStatusFilter === 'active' && !isExpired)

    return matchesSearch && matchesPlan && matchesStatus
  }).sort((a, b) => {
    if (subscriberSort === 'name') {
      return a.company_name?.localeCompare(b.company_name || '')
    } else {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
  })

  // Calculate Metrics
  const activePlanCount = companies.filter(c => !c.subscription_expiry || new Date(c.subscription_expiry) >= new Date()).length
  const expiredPlanCount = companies.length - activePlanCount
  const totalCreditsLeft = companies.reduce((acc, c) => acc + (c.credits || 0), 0)

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
      {/* LEFT FIXED SIDEBAR */}
      <aside
        className="w-64 flex flex-col justify-between z-30 text-white relative overflow-hidden shrink-0 shadow-[20px_0_60px_rgba(15, 23, 42, 0.12)] border-r border-white/10"
        style={{
          background: `
            radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.12), transparent 24%),
            linear-gradient(180deg, rgba(20, 37, 91, 0.96) 0%, rgba(30, 58, 138, 0.94) 46%, rgba(37, 99, 235, 0.9) 100%)
          `
        }}
      >
        <div>
          <div className="p-6 border-b border-white/10 flex justify-center">
            <img src={logo} alt="Hire IQ Logo" className="h-10 w-auto object-contain" />
          </div>

          <nav className="p-4 space-y-1.5">
            <div className="text-[0.62rem] font-bold text-white/50 uppercase tracking-widest px-3 mb-2">
              Master Control
            </div>
            
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-colors border-none outline-none cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fas fa-gauge-high" /> Dashboard
            </button>

            <button
              onClick={() => setActiveTab('plans')}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-colors border-none outline-none cursor-pointer ${
                activeTab === 'plans'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fas fa-tags" /> Plans
            </button>

            <button
              onClick={() => setActiveTab('subscribers')}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-colors border-none outline-none cursor-pointer ${
                activeTab === 'subscribers'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fas fa-building-user" /> Subscribers
            </button>

            <button
              onClick={() => setActiveTab('create-tenant')}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-colors border-none outline-none cursor-pointer ${
                activeTab === 'create-tenant'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fas fa-user-plus" /> Create Tenant
            </button>

            <button
              onClick={() => setActiveTab('demo-requests')}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-3 transition-colors border-none outline-none cursor-pointer ${
                activeTab === 'demo-requests'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'bg-transparent text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <i className="fas fa-envelope-open-text" /> Demo Requests
            </button>
          </nav>
        </div>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full text-left flex items-center justify-center gap-3 px-3.5 py-2.5 rounded-lg font-medium text-sm border border-white/20 hover:bg-white/10 text-white outline-none cursor-pointer transition-all"
          >
            <i className="fas fa-sign-out-alt" /> Logout
          </button>
        </div>
      </aside>

      {/* RIGHT WORKSPACE WRAPPER */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="mx-8 mt-6 px-6 py-3 rounded-[5px] bg-[#fcfcfca0] border border-[#11242714] shadow-[0_10px_40px_5px_rgba(194,194,194,0.18)] backdrop-blur-md flex justify-between items-center z-20 text-[#0f172a]">
          <h2 className="text-base font-bold text-[#111827] tracking-wide">
            {activeTab === 'dashboard' && 'Subscription Monitor'}
            {activeTab === 'plans' && 'Product Pricing & Plans'}
            {activeTab === 'subscribers' && 'Subscribed Companies'}
            {activeTab === 'create-tenant' && 'Provision Tenant Account'}
            {activeTab === 'demo-requests' && 'Demo Requests'}
          </h2>

          <div className="flex items-center gap-4">
            {/* Color dot Accent Selectors */}
            <div className="flex gap-2">
              {Object.keys(colors).map(colorKey => (
                <button
                  key={colorKey}
                  onClick={() => setAccentColor(colorKey)}
                  className={`w-3.5 h-3.5 rounded-full border border-black/10 cursor-pointer transition-transform ${
                    accentColor === colorKey ? 'scale-125 ring-2 ring-indigo-500' : ''
                  }`}
                  style={{ backgroundColor: colors[colorKey].primary }}
                  title={`Select ${colorKey}`}
                />
              ))}
            </div>

            <div className="text-xs text-slate-600 font-medium">
              Welcome back, <span className="text-[#111827] font-bold">{adminName}</span>
            </div>
          </div>
        </header>

        {/* Scrollable Workspace Panels */}
        <main className="flex-1 overflow-y-auto p-8">
          {/* TAB VIEW: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-8 max-w-6xl">
              {/* Stat Cards */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Total Companies</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-slate-900">{companies.length}</h3>
                  </div>
                  <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-building" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Active Plans</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-emerald-500">{activePlanCount}</h3>
                  </div>
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-check-circle" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Expired Plans</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-red-500">{expiredPlanCount}</h3>
                  </div>
                  <div className="w-12 h-12 bg-red-50 text-red-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-circle-xmark" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex justify-between items-center">
                  <div>
                    <span className="text-[0.68rem] font-bold text-slate-400 uppercase tracking-widest">Total Credits Remaining</span>
                    <h3 className="text-3xl font-extrabold mt-1 text-amber-500">{totalCreditsLeft}</h3>
                  </div>
                  <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-xl flex items-center justify-center text-xl">
                    <i className="fas fa-coins" />
                  </div>
                </div>
              </div>

              {/* Charts Panel */}
              <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Revenue Growth (Estimated MRR)</h3>
                  <div className="h-[280px] w-full relative">
                    <canvas ref={mrrChartRef} id="mrrChart" />
                  </div>
                </div>

                <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Plan Distribution</h3>
                  <div className="h-[280px] w-full relative">
                    <canvas ref={planDistChartRef} id="planDistChart" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB VIEW: PLANS */}
          {activeTab === 'plans' && (
            <div className="space-y-6 max-w-6xl">
              {loadingPlans ? (
                <div className="py-20 text-center text-slate-500">
                  <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Loading pricing plans...
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {plans.map(p => (
                    <article key={p.plan_name} className="bg-white border border-slate-200/60 p-6 rounded-2xl flex flex-col justify-between h-[360px] relative shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                      {p.is_unlimited && (
                        <span className="absolute top-5 right-5 text-[0.62rem] font-bold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded">
                          Scale
                        </span>
                      )}
                      <div>
                        <h3 className="text-lg font-bold text-slate-850">{p.plan_name}</h3>
                        <p className="text-xs text-indigo-600 font-semibold mt-1">Granted: {p.credits_granted} interview credits</p>
                        <p className="text-2xl font-black text-slate-900 tracking-tight mt-4">
                          {p.price === 0 ? 'Free' : `Rs. ${p.price.toLocaleString()}`}
                          {p.price > 0 && <span className="text-xs text-slate-500 font-semibold font-sans"> / once</span>}
                        </p>
                        <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                          {p.summary || 'Custom plan credentials configured for evaluating candidates.'}
                        </p>

                        <ul className="mt-4 space-y-1 text-slate-500 text-xs">
                          {(p.features || []).map((f, i) => (
                            <li key={i} className="flex gap-1.5 items-center">
                              <span className="text-indigo-500 text-xs">✓</span> {f}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        onClick={() => handleOpenEditPlanModal(p)}
                        className="w-full mt-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                      >
                        <i className="fas fa-edit" /> Edit Plan Details
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB VIEW: SUBSCRIBERS */}
          {activeTab === 'subscribers' && (
            <div className="space-y-6 max-w-6xl">
              {/* Filtration Actions Bar */}
              <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Search Subscribers</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <i className="fas fa-search" />
                    </span>
                    <input
                      type="text"
                      value={subscriberSearch}
                      onChange={(e) => setSubscriberSearch(e.target.value)}
                      placeholder="Search company or email..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Plan</label>
                  <select
                    value={subscriberPlanFilter}
                    onChange={(e) => setSubscriberPlanFilter(e.target.value)}
                    className="py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-indigo-500 cursor-pointer min-w-[140px]"
                  >
                    <option value="all">All Plans</option>
                    <option value="trial">Free Trial</option>
                    <option value="basic">Basic Plan</option>
                    <option value="advance">Advance Plan</option>
                  </select>
                </div>

                <div>
                  <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Status</label>
                  <select
                    value={subscriberStatusFilter}
                    onChange={(e) => setSubscriberStatusFilter(e.target.value)}
                    className="py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-indigo-500 cursor-pointer min-w-[140px]"
                  >
                    <option value="all">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>

                <div>
                  <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Sort By</label>
                  <select
                    value={subscriberSort}
                    onChange={(e) => setSubscriberSort(e.target.value)}
                    className="py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-indigo-500 cursor-pointer min-w-[140px]"
                  >
                    <option value="name">Company Name</option>
                    <option value="date">Date Provisioned</option>
                  </select>
                </div>

                <button
                  onClick={() => {
                    setSubscriberSearch('')
                    setSubscriberPlanFilter('all')
                    setSubscriberStatusFilter('all')
                    setSubscriberSort('name')
                  }}
                  className="py-2.5 px-3.5 rounded-xl border border-red-500/20 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white cursor-pointer transition-colors"
                  title="Reset Filters"
                >
                  <i className="fas fa-times" />
                </button>
              </div>

              {/* Table List */}
              <div className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50">
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Company / Admin</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Plan</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Status</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Usage</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Date Registered</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Credits Remaining</th>
                        <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-400">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingCompanies ? (
                        <tr>
                          <td colSpan="7" className="p-10 text-center text-slate-500">
                            <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Syncing subscribers...
                          </td>
                        </tr>
                      ) : filteredCompanies.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-10 text-center text-slate-500">
                            No subscriber accounts match the active filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredCompanies.map(c => {
                          const isExpired = c.subscription_expiry && new Date(c.subscription_expiry) < new Date()
                          return (
                            <tr key={c.company_id || c.id} className="hover:bg-slate-50/50">
                              <td className="p-4">
                                <div className="font-bold text-slate-850 text-sm">{c.company_name}</div>
                                <div className="text-xs text-slate-500 mt-0.5">{c.email || c.username}</div>
                              </td>
                              <td className="p-4 text-xs font-semibold text-indigo-600">{c.plan_name || 'Free Trial'}</td>
                              <td className="p-4">
                                <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                                  isExpired ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                }`}>
                                  {isExpired ? 'Expired' : 'Active'}
                                </span>
                              </td>
                              <td className="p-4 text-xs text-slate-500">{c.usage || 0} sessions</td>
                              <td className="p-4 text-xs text-slate-500">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                              <td className="p-4 text-xs font-extrabold text-slate-850">{c.credits || 0}</td>
                              <td className="p-4">
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleImpersonateLogin(c.company_id || c.id)}
                                    className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white border-none cursor-pointer transition-all"
                                    title="Impersonate Dashboard"
                                  >
                                    <i className="fas fa-sign-in-alt" />
                                  </button>
                                  <button
                                    onClick={() => handleOpenUpdateModal(c)}
                                    className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-all"
                                    title="Extend / Update Subscription"
                                  >
                                    <i className="fas fa-calendar-plus" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTenant(c.company_id || c.id)}
                                    className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-600 hover:text-white border-none cursor-pointer transition-all"
                                    title="Remove Tenant Account"
                                  >
                                    <i className="fas fa-trash-alt" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB VIEW: CREATE TENANT */}
          {activeTab === 'create-tenant' && (
            <div className="max-w-xl">
              <form onSubmit={handleCreateTenant} className="bg-white border border-slate-200/60 rounded-2xl p-6 space-y-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Company Name</label>
                  <input
                    type="text"
                    required
                    value={createTenantForm.company_name}
                    onChange={(e) => setCreateTenantForm(prev => ({ ...prev, company_name: e.target.value }))}
                    placeholder="Acme Corp"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-850 outline-none focus:border-indigo-500 placeholder:text-slate-400"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Username</label>
                    <input
                      type="text"
                      required
                      value={createTenantForm.username}
                      onChange={(e) => setCreateTenantForm(prev => ({ ...prev, username: e.target.value }))}
                      placeholder="e.g. company_admin"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-850 outline-none focus:border-indigo-500 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Email Address</label>
                    <input
                      type="email"
                      required
                      value={createTenantForm.email}
                      onChange={(e) => setCreateTenantForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="admin@company.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-850 outline-none focus:border-indigo-500 placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Password</label>
                    <input
                      type="password"
                      required
                      value={createTenantForm.password}
                      onChange={(e) => setCreateTenantForm(prev => ({ ...prev, password: e.target.value }))}
                      placeholder="Secure password"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-850 outline-none focus:border-indigo-500 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Subscription Plan</label>
                    <select
                      value={createTenantForm.plan_name}
                      onChange={(e) => setCreateTenantForm(prev => ({ ...prev, plan_name: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-850 outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="trial">15 Days Free Trial</option>
                      <option value="basic">Basic Plan</option>
                      <option value="advance">Advance Plan</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={createTenantLoading}
                  className="w-full py-3.5 rounded-full font-bold text-sm bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer border-none shadow-[0_4px_14px_rgba(99,102,241,0.25)] transition-all mt-4 disabled:opacity-50"
                >
                  {createTenantLoading ? 'Creating Account...' : 'Create Account Now'}
                </button>
              </form>
            </div>
          )}
          {/* TAB VIEW: DEMO REQUESTS */}
          {activeTab === 'demo-requests' && (
            <DemoRequests />
          )}

        </main>
      </div>

      {/* MODAL: UPDATE SUBSCRIPTION */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleUpdateTenantSubmit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-800">Update Tenant Subscription</h3>
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="text-slate-400 hover:text-slate-850 bg-transparent border-none cursor-pointer outline-none text-base"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Subscription Plan</label>
                <select
                  value={updateTenantPlan}
                  onChange={(e) => setUpdateTenantPlan(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-850 outline-none cursor-pointer"
                >
                  <option value="trial">15 Days Free Trial</option>
                  <option value="basic">Basic Plan</option>
                  <option value="advance">Advance Plan</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Extend Expiry (Days)</label>
                <input
                  type="number"
                  min="0"
                  value={updateTenantDays}
                  onChange={(e) => setUpdateTenantDays(e.target.value)}
                  placeholder="Add days to subscription"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-850 outline-none"
                />
                <span className="text-[0.68rem] text-slate-400 block mt-1">Leave as 0 to maintain current expiry.</span>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateLoading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {updateLoading ? 'Saving...' : 'Update Plan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: EDIT PLAN DETAILS */}
      {isEditPlanModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleEditPlanSubmit} className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-800">Edit {editPlanName} Plan</h3>
              <button
                type="button"
                onClick={() => setIsEditPlanModalOpen(false)}
                className="text-slate-400 hover:text-slate-850 bg-transparent border-none cursor-pointer outline-none text-base"
              >
                <i className="fas fa-times" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Credits Granted</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editPlanCredits}
                    onChange={(e) => setEditPlanCredits(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-850 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Price ($)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editPlanPrice}
                    onChange={(e) => setEditPlanPrice(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-850 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 block">Select Available Features</label>
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                  {[
                    'Overview Dashboard',
                    'Create Interview',
                    'Qualified Candidates',
                    'Rejected Candidates',
                    'Deactivated Candidates',
                    'Profile Settings',
                    'Live Monitor',
                    'Analytics & Reports',
                    'Bulk Email Invites',
                    'Resume Parsing',
                    'Custom Branding',
                    'Priority Support',
                    'API Access',
                    'Export Data',
                    'User Management',
                    'Role-Based Access',
                    'Integration Webhooks',
                    'Industry Type',
                    'ATS Score',
                    'Interview Type'
                  ].map(f => {
                    const isChecked = editPlanFeatures.includes(f)
                    return (
                      <label key={f} className="flex items-center gap-2.5 text-xs text-slate-600 hover:text-slate-800 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditPlanFeatures([...editPlanFeatures, f])
                            } else {
                              setEditPlanFeatures(editPlanFeatures.filter(x => x !== f))
                            }
                          }}
                          className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                        />
                        <span>{f}</span>
                      </label>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditPlanModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editPlanLoading}
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {editPlanLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
