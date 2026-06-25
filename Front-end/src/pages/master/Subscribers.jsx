import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Search, Calendar, Trash2, Power, PowerOff, X, RefreshCw } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import axios from 'axios'

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

  // Update Modal state
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false)
  const [updateTenantId, setUpdateTenantId] = useState('')
  const [updateTenantPlan, setUpdateTenantPlan] = useState('trial')
  const [updateTenantDays, setUpdateTenantDays] = useState(0)
  const [updateTenantCredits, setUpdateTenantCredits] = useState(0)
  const [updateLoading, setUpdateLoading] = useState(false)

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
    setUpdateTenantId(c.id || c.company_id)
    setUpdateTenantPlan(c.subscription_plan || 'trial')
    setUpdateTenantDays(0)
    setUpdateTenantCredits(0)
    setIsUpdateModalOpen(true)
  }

  const handleUpdateTenantSubmit = async (e) => {
    e.preventDefault()
    setUpdateLoading(true)
    try {
      const res = await axios.put(`${API_BASE_URL}/master/companies/${encodeURIComponent(updateTenantId)}?master_id=${encodeURIComponent(adminId)}`, {
        subscription_plan: updateTenantPlan,
        add_days: parseInt(updateTenantDays || 0),
        add_credits: parseInt(updateTenantCredits || 0)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.data && res.data.status === 'success') {
        Swal.fire({
          title: 'Success',
          text: 'Subscription successfully updated!',
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
        text: e.response?.data?.detail || 'Failed to update subscription parameters.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setUpdateLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchCompanies()
    }
  }, [token])

  // Filters logic
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
      (statusFilter === 'expired' && c.is_expired) ||
      (statusFilter === 'active' && !c.is_expired)

    return matchesSearch && matchesPlan && matchesStatus
  }).sort((a, b) => {
    if (sortBy === 'name') {
      return a.company_name?.localeCompare(b.company_name || '')
    } else {
      return new Date(b.created_at || 0) - new Date(a.created_at || 0)
    }
  })

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Filters bar */}
      <div className="bg-white border border-slate-200/60 p-4 sm:p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] grid grid-cols-2 sm:flex sm:flex-wrap gap-4 items-end">
        <div className="col-span-2 sm:flex-1 sm:min-w-[220px]">
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
              className="w-full pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Plan</label>
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="w-full sm:min-w-[140px] py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
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
            className="w-full sm:min-w-[140px] py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        <div className="col-span-2 sm:col-span-1 sm:w-auto">
          <label className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-widest block mb-2">Sort By</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="w-full sm:min-w-[140px] py-2.5 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 outline-none focus:border-indigo-500 cursor-pointer"
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
            setSortBy('name')
          }}
          className="col-span-2 sm:w-auto py-2.5 px-4 rounded-xl border border-rose-200 bg-rose-50/50 hover:bg-rose-100/70 text-rose-600 hover:text-rose-700 cursor-pointer font-semibold text-sm transition-all flex items-center justify-center gap-2"
          title="Reset Filters"
        >
          <X size={16} strokeWidth={2.5} />
          <span>Reset Filters</span>
        </button>
      </div>

      {/* Table view */}
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
              {loading ? (
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
                  return (
                    <tr key={c.id || c.company_id} className="hover:bg-slate-50/50">
                      <td className="p-4">
                        <div className="font-bold text-slate-800 text-sm">{c.company_name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{c.email || c.username}</div>
                      </td>
                      <td className="p-4 text-xs font-semibold text-indigo-600">
                        {c.subscription_plan_label || c.subscription_plan || 'Free Trial'}
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${
                          c.is_expired
                            ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                            : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        }`}>
                          {c.is_expired ? 'Expired' : 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        <div><strong>{c.total_sessions || 0}</strong> sessions</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{c.completed_sessions || 0} completed / {c.started_sessions || 0} live</div>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-4 text-xs font-extrabold text-slate-800">{c.credits || 0}</td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenUpdateModal(c)}
                            className="p-2 rounded-lg bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200 cursor-pointer transition-all"
                            title="Extend / Update Subscription"
                          >
                            <Calendar size={14} />
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
          <form onSubmit={handleUpdateTenantSubmit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800">
            <div className="flex justify-between items-center border-b border-slate-200 pb-3">
              <h3 className="font-bold text-slate-800">Update Tenant Subscription</h3>
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 bg-transparent border-none cursor-pointer outline-none"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Subscription Plan</label>
                <select
                  value={updateTenantPlan}
                  onChange={(e) => setUpdateTenantPlan(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none cursor-pointer"
                >
                  <option value="trial">15 Days Free Trial</option>
                  <option value="basic">Basic Plan</option>
                  <option value="advance">Advance Plan</option>
                </select>
              </div>

              <div className="grid gap-4 grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Extend Expiry (Days)</label>
                  <input
                    type="number"
                    min="0"
                    value={updateTenantDays}
                    onChange={(e) => setUpdateTenantDays(parseInt(e.target.value || 0))}
                    placeholder="Days to add"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Add Extra Credits</label>
                  <input
                    type="number"
                    min="0"
                    value={updateTenantCredits}
                    onChange={(e) => setUpdateTenantCredits(parseInt(e.target.value || 0))}
                    placeholder="Credits to add"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none"
                  />
                </div>
              </div>
              <span className="text-[10px] text-slate-400 block -mt-2">Leave as 0 to maintain current values.</span>
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsUpdateModalOpen(false)}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
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
    </div>
  )
}
