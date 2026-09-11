 
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Search, Calendar, Trash2, Power, PowerOff, X, RefreshCw, Settings } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import axios from 'axios'

const FEATURE_GROUPS = [
  { category: "Super Admin Dashboard", main: "Super Admin Dashboard", sub: [] },
  { category: "Dashboard", main: "Dashboard", sub: [] },
  { category: "Interviews", main: "Interviews", sub: [] },
  { category: "Qualified Candidates", main: "Qualified Candidates", sub: ["Export CSV"] },
  { category: "Rejected Candidates", main: "Rejected Candidates", sub: ["Talent Pool Management"] },
  {
    category: "Create Interview", main: "Create Interview",
    sub: [
      "Single Candidate", "Bulk Send", "Select Candidate from AI Calls",
      "Resume Parsing", "ATS Score", "Email Preview",
      "Custom Screening Questions", "Custom AI Interviewer Instructions",
      "Language", "Industry Type", "Interview Schedule", "Record Interview Video",
      "Voice Cloning", "HR Screening Questions", "Standard (Text/Form Based)",
      "Voice AI (Real-time Speech)", "Technical (+ Coding)", "Normal (Standard AI)",
      "Non-Tech (Case Studies)"
    ]
  },
  { category: "AI Calling Agent", main: "AI Calling Agent", sub: [] },
  { category: "Jobs", main: "Jobs", sub: [] },
  { category: "Recruiters", main: "Recruiters", sub: [] },
  { category: "Credit Management", main: "Credit Management", sub: [] },
  { category: "Subscription Management", main: "Subscription Management", sub: [] },
  { category: "Security", main: "Security", sub: ["Active Security Alerts"] },
  { category: "Notifications", main: "Notifications", sub: [] },
  { category: "Live Results", main: "Live Results", sub: [] },
]

export default function Subscribers() {
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminId = sessionStorage.getItem('adminId') || ''

  // Subscribers state
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)

  // Filters state
  const [search, setSearch] = useState('')
  const [planFilter, setPlanFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Update Modal state
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateTenantId, setUpdateTenantId] = useState('')
  const [updateTenantPlan, setUpdateTenantPlan] = useState('trial')
  const [updateTenantDays, setUpdateTenantDays] = useState(0)
  const [updateTenantCredits, setUpdateTenantCredits] = useState(0)
  const [updateLoading, setUpdateLoading] = useState(false)

  // Custom Features Modal state
  const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false)
  const [featModalCompany, setFeatModalCompany] = useState(null)
  const [featModalSelected, setFeatModalSelected] = useState([])
  const [featModalLoading, setFeatModalLoading] = useState(false)
  const [platformFeatures, setPlatformFeatures] = useState([])
  const [selectedSubModule, setSelectedSubModule] = useState(null)
  const [allPlans, setAllPlans] = useState([])

  const fetchCompanies = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/master/companies?master_id=${encodeURIComponent(adminId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.data && res.data.status === 'success') {
        setCompanies(res.data.data || [])
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to sync subscribers list.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleLogin = async (companyId, currentEnabled) => {
    const action = currentEnabled ? 'deactivate' : 'reactivate'
    const confirm = await Swal.fire({
      title: 'Are you sure?',
      text: `Do you want to ${action} login access for this admin account?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Yes, ${action} it`,
      cancelButtonText: 'Cancel',
      background: '#161c2d',
      color: '#fff',
    })

    if (!confirm.isConfirmed) return

    try {
      const res = await axios.post(`${API_BASE_URL}/master/companies/${encodeURIComponent(companyId)}/login?master_id=${encodeURIComponent(adminId)}`, {
        login_enabled: !currentEnabled
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.data && res.data.status === 'success') {
        Swal.fire({
          title: 'Success',
          text: `Admin account has been ${!currentEnabled ? 'enabled' : 'disabled'}.`,
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        fetchCompanies()
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to update login status.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    }
  }

  const handleDeleteTenant = async (companyId, companyName) => {
    const confirm = await Swal.fire({
      title: 'Are you sure?',
      text: `This will permanently delete the company "${companyName}" and all related data. This cannot be undone!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete company',
      cancelButtonText: 'Cancel',
      background: '#161c2d',
      color: '#fff',
    })

    if (!confirm.isConfirmed) return

    try {
      const res = await axios.delete(`${API_BASE_URL}/master/companies/${encodeURIComponent(companyId)}?master_id=${encodeURIComponent(adminId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.data && res.data.status === 'success') {
        Swal.fire({
          title: 'Deleted!',
          text: 'Company account deleted successfully.',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        fetchCompanies()
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to delete company account.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    }
  }

  const handleOpenUpdateModal = (c) => {
    setUpdateTenantId(c.id)
    setUpdateTenantPlan(c.subscription_plan || 'trial')
    setUpdateTenantDays(c.days_remaining || 0)
    setUpdateTenantCredits(c.credits || 0)
    setIsUpdateModalOpen(true)
  }

  const handleSaveSubscriptionUpdate = async () => {
    setUpdateLoading(true)
    try {
      const payload = {
        plan_key: updateTenantPlan,
        days_to_add: parseInt(updateTenantDays) || 0,
        credits: parseInt(updateTenantCredits) || 0
      }
      const res = await axios.patch(
        `${API_BASE_URL}/master/companies/${encodeURIComponent(updateTenantId)}/subscription?master_id=${encodeURIComponent(adminId)}`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      )
      if (res.data && res.data.status === 'success') {
        Swal.fire({
          title: 'Updated!',
          text: 'Tenant subscription modified successfully.',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        setIsUpdateModalOpen(false)
        fetchCompanies()
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to update subscription.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setUpdateLoading(false)
    }
  }

  const handleOpenFeaturesModal = (c) => {
    setFeatModalCompany(c)

    if (c.features != null) {
      // Company already has a custom override — pre-load those
      setFeatModalSelected([...c.features])
    } else {
      // No custom override yet — pre-load from the company's current plan so checkboxes aren't empty
      const companyPlanKey = (c.subscription_plan || 'trial').toLowerCase()
      const matchedPlan = allPlans.find(p =>
        p.plan_name && p.plan_name.toLowerCase().includes(companyPlanKey)
      )
      setFeatModalSelected(matchedPlan?.features ? [...matchedPlan.features] : [])
    }

    setSelectedSubModule(null)
    setIsFeaturesModalOpen(true)
  }

  const handleSaveCustomFeatures = async () => {
    if (!featModalCompany) return
    setFeatModalLoading(true)
    try {
      await axios.put(
        `${API_BASE_URL}/master/companies/${encodeURIComponent(featModalCompany.id)}?master_id=${encodeURIComponent(adminId)}`,
        { features: featModalSelected },
        { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
      )
      Swal.fire({
        title: 'Saved!',
        text: `Custom features updated for ${featModalCompany.company_name}.`,
        icon: 'success',
        background: '#161c2d',
        color: '#fff',
      })
      setIsFeaturesModalOpen(false)
      fetchCompanies()
    } catch (e) {
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to update features.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setFeatModalLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchCompanies()
      // Fetch all platform features for the checklist
      axios.get(`${API_BASE_URL}/api/platform/features`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        if (res.data && res.data.features) setPlatformFeatures(res.data.features)
      }).catch(() => {})
      // Fetch all plan definitions so we can pre-check the company's current plan features
      axios.get(`${API_BASE_URL}/master/plans?master_id=${encodeURIComponent(adminId)}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        if (res.data && res.data.status === 'success') setAllPlans(res.data.data || [])
      }).catch(() => {})
    }
  }, [token])

  const filteredCompanies = companies.filter(c => {
    const query = search.toLowerCase()
    const matchesSearch =
      c.company_name?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.username?.toLowerCase().includes(query)

    const matchesPlan =
      planFilter === 'all' ||
      c.subscription_plan?.toLowerCase() === planFilter.toLowerCase()

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'expired' && c.status === 'expired') ||
      (statusFilter === 'active' && c.status === 'active') ||
      (statusFilter === 'blocked' && c.status === 'blocked')

    let matchesDate = true
    const cDateStr = c.created_at || c.subscription_start
    if (startDate || endDate) {
      if (cDateStr) {
        const cDate = cDateStr.substring(0, 10)
        if (startDate && cDate < startDate) matchesDate = false
        if (endDate && cDate > endDate) matchesDate = false
      }
    }

    return matchesSearch && matchesPlan && matchesStatus && matchesDate
  }).sort((a, b) => {
    if (sortBy === 'name') {
      return a.company_name?.localeCompare(b.company_name || '')
    } else {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
  })

  return (
    <div className="space-y-6 w-full">
      {/* Filters bar */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-4 sm:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none grid grid-cols-2 sm:flex sm:flex-wrap gap-4 items-end">
        <div className="col-span-2 sm:flex-1 sm:min-w-[200px]">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Search Subscribers</label>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or email..."
              style={{ paddingLeft: '2.75rem' }}
              className="w-full pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Plan</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className=" w-full sm:min-w-[130px] py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Plans</option>
            <option value="trial">Free Trial</option>
            <option value="basic">Basic Plan</option>
            <option value="advance">Advance Plan</option>
          </select>
        </div>

        <div className="col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:min-w-[130px] py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="blocked">Deactivated</option>
          </select>
        </div>

        {/* Date Filter Inputs */}
        <div className="col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">From Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full sm:w-auto py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
          />
        </div>

        <div className="col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">To Date</label>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full sm:w-auto py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 cursor-pointer"
          />
        </div>

        <div className="col-span-2 sm:col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full sm:min-w-[130px] py-2.5 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="name">Company Name</option>
            <option value="date">Date Registered</option>
          </select>
        </div>

        <button
          onClick={() => {
            setSearch('')
            setPlanFilter('all')
            setStatusFilter('all')
            setStartDate('')
            setEndDate('')
            setSortBy('name')
          }}
          className="col-span-2 sm:w-auto py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100/70 text-rose-600 hover:text-rose-700 cursor-pointer font-semibold text-sm transition-all flex items-center justify-center gap-2"
          title="Reset Filters"
        >
          <X size={16} strokeWidth={2.5} />
          <span>Reset</span>
        </button>
      </div>

      {/* Table view */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
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
              {loading ? (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500 dark:text-slate-400">
                    <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Syncing subscribers...
                  </td>
                </tr>
              ) : filteredCompanies.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-10 text-center text-slate-500 dark:text-slate-400">
                    No subscriber accounts match the active filter criteria.
                  </td>
                </tr>
              ) : (
                filteredCompanies.map(c => {
                  return (
                    <tr key={c.id || c.company_id} className="hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700/50">
                      <td className="p-4">
                        <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">{c.company_name}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.email || c.username}</div>
                      </td>
                      <td className="p-4 text-xs font-semibold text-indigo-600">
                        {c.subscription_plan_label || c.subscription_plan || 'Free Trial'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                          c.status === 'blocked'
                            ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                            : c.status === 'expired'
                              ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        }`}>
                          {c.status === 'blocked' ? 'Deactivated' : c.status === 'expired' ? 'Expired' : 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        <div><strong>{c.total_sessions || 0}</strong> sessions</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{c.completed_sessions || 0} completed / {c.started_sessions || 0} live</div>
                      </td>
                      <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-4 text-xs font-extrabold text-slate-800 dark:text-slate-100">{c.credits || 0}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenUpdateModal(c)}
                            className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 cursor-pointer transition-all"
                            title="Extend / Update Subscription"
                          >
                            <Calendar size={14} />
                          </button>
                          <button
                            onClick={() => handleOpenFeaturesModal(c)}
                            className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 hover:bg-indigo-600 hover:text-white border border-indigo-200 dark:border-indigo-700/50 cursor-pointer transition-all"
                            title="Edit Custom Features for this account"
                          >
                            <Settings size={14} />
                          </button>
                          <button
                            onClick={() => handleToggleLogin(c.id || c.company_id, c.login_enabled)}
                            className={`p-2 rounded-lg cursor-pointer transition-all border-none ${
                              c.login_enabled
                                ? 'bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white'
                            }`}
                            title={c.login_enabled ? 'Deactivate Login' : 'Reactivate Login'}
                          >
                            {c.login_enabled ? <PowerOff size={14} /> : <Power size={14} />}
                          </button>
                          <button
                            onClick={() => handleDeleteTenant(c.id || c.company_id, c.company_name)}
                            className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-600 hover:text-white border-none cursor-pointer transition-all"
                            title="Remove Tenant Account"
                          >
                            <Trash2 size={14} />
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

      {/* MODAL: UPDATE SUBSCRIPTION */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={(e) => { e.preventDefault(); handleSaveSubscriptionUpdate(); }} className="w-full max-w-md bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800 dark:text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Update Tenant Subscription</h3>
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 dark:text-slate-100 bg-transparent border-none cursor-pointer outline-none"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Subscription Plan</label>
                <select
                  value={updateTenantPlan}
                  onChange={(e) => setUpdateTenantPlan(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
                >
                  <option value="trial">15 Days Free Trial</option>
                  <option value="basic">Basic Plan</option>
                  <option value="advance">Advance Plan</option>
                </select>
              </div>

              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Extend Expiry (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={updateTenantDays}
                    onChange={(e) => setUpdateTenantDays(parseInt(e.target.value || 0))}
                    placeholder="Days to add"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Add Extra Credits</label>
                  <input
                    type="number"
                    min="0"
                    value={updateTenantCredits}
                    onChange={(e) => setUpdateTenantCredits(parseInt(e.target.value || 0))}
                    placeholder="Credits to add"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>
              <span className="text-[10px] text-slate-400 block -mt-2">Leave as 0 to maintain current values.</span>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={updateLoading}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {updateLoading ? 'Saving...' : 'Update Plan'}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* MODAL: CUSTOM FEATURES — same format as Plans edit modal */}
      {isFeaturesModalOpen && featModalCompany && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSaveCustomFeatures(); }}
            className="w-full max-w-3xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800 dark:text-slate-100"
          >
            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100">
                  Edit Features — {featModalCompany.company_name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Plan: <span className="font-semibold text-indigo-500">{featModalCompany.subscription_plan_label || featModalCompany.subscription_plan || 'Trial'}</span>
                  &nbsp;·&nbsp; Changes here only affect <strong>this account</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFeaturesModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 bg-transparent border-none cursor-pointer outline-none"
              >
                <X size={20} />
              </button>
            </div>

            {/* Feature Module Selector — same logic as Plans.jsx */}
            <div className="space-y-2">
              {selectedSubModule === null ? (
                <>
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Configure Plan Modules ({featModalSelected.length} total features selected)
                    </label>
                    {featModalSelected.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFeatModalSelected([])}
                        className="text-[11px] text-rose-500 hover:underline bg-transparent border-none cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 divide-y divide-slate-200 dark:divide-slate-700">
                    {FEATURE_GROUPS.map((group, idx) => {
                      const isMainChecked = featModalSelected.includes(group.main)
                      return (
                        <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                          <label className="flex items-center gap-3 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={isMainChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFeatModalSelected(prev => [...prev, group.main])
                                } else {
                                  setFeatModalSelected(prev => prev.filter(f => f !== group.main && !group.sub.includes(f)))
                                }
                              }}
                              className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                            />
                            <span className={`font-bold text-sm ${isMainChecked ? 'text-indigo-700 dark:text-indigo-400' : 'text-slate-700 dark:text-slate-200'}`}>
                              {group.category} <span className="text-xs text-slate-400 font-normal ml-2">({group.main})</span>
                            </span>
                          </label>
                          {group.sub.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setSelectedSubModule(group)}
                              disabled={!isMainChecked}
                              className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 transition-all ${isMainChecked ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 cursor-pointer' : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed opacity-60'}`}
                            >
                              Sub-Features <i className="fas fa-chevron-right text-[10px]" />
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : (
                // SUB-FEATURES VIEW
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-4">
                  <button
                    type="button"
                    onClick={() => setSelectedSubModule(null)}
                    className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 font-semibold flex items-center gap-2 cursor-pointer transition-colors bg-transparent border-none"
                  >
                    <i className="fas fa-arrow-left" /> Back to Modules
                  </button>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                    <h4 className="text-sm font-bold text-indigo-700 dark:text-indigo-400 mb-1">{selectedSubModule.category} Settings</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">Select the specific features available within this module.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                      {selectedSubModule.sub.map(subFeat => {
                        const isSubChecked = featModalSelected.includes(subFeat)
                        return (
                          <label key={subFeat} className="flex items-center gap-2.5 text-xs select-none cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100">
                            <input
                              type="checkbox"
                              checked={isSubChecked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFeatModalSelected(prev => [...prev, subFeat])
                                } else {
                                  setFeatModalSelected(prev => prev.filter(x => x !== subFeat))
                                }
                              }}
                              className="w-4 h-4 rounded accent-indigo-500 cursor-pointer"
                            />
                            <span>{subFeat}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsFeaturesModalOpen(false)}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={featModalLoading}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {featModalLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
