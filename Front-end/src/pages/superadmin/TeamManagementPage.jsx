import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import axios from 'axios'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { RefreshCw, Shield, Plus, Check, X, Users, Activity, Coins, UserPlus, CreditCard, Trash2, ShieldOff, ShieldCheck } from 'lucide-react'

export default function TeamManagementPage() {
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  // Team management admins list
  const [admins, setAdmins] = useState([])
  const [loadingAdmins, setLoadingAdmins] = useState(false)

  // Pending credit requests list
  const [creditRequests, setCreditRequests] = useState([])
  const [loadingRequests, setLoadingRequests] = useState(false)

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

  const loadTeamManagement = async () => {
    setLoadingAdmins(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/super-admin/admins`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      setAdmins(res.data.data || [])
    } catch (e) {
      console.error('Error loading team management admins:', e)
    } finally {
      setLoadingAdmins(false)
    }
  }

  const loadCreditRequests = async () => {
    setLoadingRequests(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/super-admin/credit-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setCreditRequests(res.data.data || [])
    } catch (err) {
      console.error("Failed to load credit requests:", err)
      Swal.fire('Error', 'Failed to load credit requests', 'error')
    } finally {
      setLoadingRequests(false)
    }
  }

  // Invite/Add Admin Handler
  const handleAddAdminSubmit = async (e) => {
    e.preventDefault()
    setAddAdminLoading(true)
    try {
      await axios.post(`${API_BASE_URL}/super-admin/admins`, {
        name: newAdminForm.name,
        username: newAdminForm.username,
        email: newAdminForm.email,
        password: newAdminForm.password,
        credits: parseInt(newAdminForm.credits)
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      Swal.fire({
        title: 'Admin Added',
        text: 'provisioned workspace user successfully!',
        icon: 'success',
        background: '#161c2d',
        color: '#fff'
      })
      setIsAddAdminOpen(false)
      setNewAdminForm({
        name: '',
        username: '',
        email: '',
        password: '',
        credits: 0
      })
      loadTeamManagement()
    } catch (err) {
      Swal.fire({
        title: 'Error',
        text: err.response?.data?.detail || err.message,
        icon: 'error',
        background: '#161c2d',
        color: '#fff'
      })
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
      await axios.put(`${API_BASE_URL}/super-admin/credit-requests/${requestId}`, { status: status }, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      Swal.fire({
        title: 'Success',
        text: `Credit request ${status} successfully!`,
        icon: 'success',
        background: '#161c2d',
        color: '#fff'
      })
      loadCreditRequests()
      loadTeamManagement()
      setTimeout(() => {
        window.location.reload()
      }, 500)
    } catch (err) {
      Swal.fire({
        title: 'Action Failed',
        text: err.response?.data?.detail || err.message,
        icon: 'error',
        background: '#161c2d',
        color: '#fff'
      })
    }
  }

  // Fetch data on mount
  useEffect(() => {
    if (token) {
      loadTeamManagement()
      loadCreditRequests()
    }

  }, [token])

  const handleToggleStatus = async (admin) => {
    try {
      // Optimistically update UI
      const newStatus = admin.login_enabled === false ? true : false;
      setAdmins(admins.map(a => a.id === admin.id ? { ...a, login_enabled: newStatus } : a));

      const res = await axios.post(`${API_BASE_URL}/super-admin/admins/${admin.id}/toggle-status`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (res.data.status === 'success') {
        Swal.fire({
          title: newStatus ? 'Activated!' : 'Deactivated!',
          text: `Admin access has been ${newStatus ? 'enabled' : 'disabled'}.`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000
        });
        loadTeamManagement() // Refresh background
      } else {
        // Revert on failure
        setAdmins(admins.map(a => a.id === admin.id ? { ...a, login_enabled: admin.login_enabled } : a));
        Swal.fire('Error', 'Failed to toggle status', 'error')
      }
    } catch (err) {
      // Revert on failure
      setAdmins(admins.map(a => a.id === admin.id ? { ...a, login_enabled: admin.login_enabled } : a));
      console.error(err)
      Swal.fire('Error', err.response?.data?.detail || 'Network error', 'error')
    }
  }

  const handleDeleteAdmin = async (adminId) => {
    const result = await Swal.fire({
      title: 'Remove Admin?',
      text: "They will lose access immediately.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, remove them'
    })

    if (result.isConfirmed) {
      try {
        const res = await fetch(`${API_BASE_URL}/super-admin/admins/${adminId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          Swal.fire('Removed!', 'Admin has been removed.', 'success')
          loadTeamManagement()
        } else {
          const error = await res.json()
          Swal.fire('Error', error.detail || 'Failed to remove', 'error')
        }
      } catch (err) {
        console.error(err)
        Swal.fire('Error', 'Network error', 'error')
      }
    }
  }

  const handleAddCreditsToAdmin = async (adminId) => {
    const { value: credits } = await Swal.fire({
      title: 'Add Credits',
      input: 'number',
      inputLabel: 'Amount of credits to add',
      inputPlaceholder: 'Enter number',
      showCancelButton: true,
      inputValidator: (value) => {
        if (!value || isNaN(value) || value <= 0) {
          return 'Please enter a valid positive number'
        }
      }
    })

    if (credits) {
      try {
        const res = await fetch(`${API_BASE_URL}/super-admin/admins/${adminId}/add-credits`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ credits: parseInt(credits, 10) })
        })
        if (res.ok) {
          Swal.fire('Added!', `${credits} credits added.`, 'success')
          loadTeamManagement()
        } else {
          const error = await res.json()
          Swal.fire('Error', error.detail || 'Failed to add credits', 'error')
        }
      } catch (err) {
        console.error(err)
        Swal.fire('Error', 'Network error', 'error')
      }
    }
  }

  return (
    <div className="space-y-8 w-full max-w-7xl text-slate-800 relative z-10">
      {/* Admins Table List Card */}
      <div className="bg-white/80 backdrop-blur-2xl border border-white/60 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none" />

        <div className="p-6 sm:p-8 border-b border-slate-100/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative z-10">
          <div className="flex gap-4 items-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white shadow-[0_8px_16px_rgba(79,70,229,0.25)] border border-white/20 ring-4 ring-indigo-50 shrink-0">
              <Users size={26} strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-indigo-900 tracking-tight leading-tight">
                Admin Management
              </h3>
              <p className="text-sm text-slate-500 font-semibold tracking-wide mt-0.5">
                Manage sub-admins and their allocated credits
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAddAdminOpen(true)}
            className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm cursor-pointer border-none shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            <UserPlus size={18} className="group-hover:scale-110 transition-transform" />
            Add Recruiter
          </button>
        </div>

        <div className="overflow-x-auto p-4 sm:p-6 bg-slate-50/30">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Profile</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Mail</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Role</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider text-center">Credits</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider text-center">Status</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingAdmins ? (
                <tr>
                  <td colSpan="6" className="p-16 text-center text-slate-500 font-semibold">
                    <RefreshCw className="animate-spin text-indigo-600 inline mr-2 w-6 h-6" /> Syncing team members...
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                        <Users size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium text-base">No additional sub-admins provisioned.</p>
                      <p className="text-slate-400 text-sm mt-1">Click 'Provision Admin' to invite team members.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                admins.map(admin => (
                  <tr key={admin.id || admin.username} className="hover:bg-indigo-50/30 transition-colors group">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-700 font-bold uppercase border border-indigo-200 shadow-sm shrink-0">
                          {(admin.name || admin.username || 'A')[0]}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-sm">{admin.name || admin.username}</span>
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{admin.custom_id || admin.id}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-500 font-medium">{admin.email}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-100 w-fit px-3 py-1 rounded-full border border-slate-200">
                        <Shield size={12} className="text-indigo-500" />
                        <span className="capitalize">{admin.role || 'Admin'}</span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full">
                        <Coins size={14} />
                        {admin.credits || 0}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${admin.login_enabled === false ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm shadow-rose-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm shadow-emerald-100'}`}>
                        {admin.login_enabled === false ? <ShieldOff size={12} /> : <ShieldCheck size={12} />}
                        {admin.login_enabled === false ? 'Deactivated' : 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleToggleStatus(admin)} title={admin.login_enabled === false ? 'Activate' : 'Deactivate'} className={`p-2 rounded-xl border-none cursor-pointer transition-all ${admin.login_enabled === false ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'}`}>
                          {admin.login_enabled === false ? <Check size={16} /> : <X size={16} />}
                        </button>
                        <button onClick={() => handleAddCreditsToAdmin(admin.id)} title="Add Credits" className="p-2 rounded-xl border-none cursor-pointer transition-all bg-indigo-100 text-indigo-700 hover:bg-indigo-200">
                          <Plus size={16} />
                        </button>
                        <button onClick={() => handleDeleteAdmin(admin.id)} title="Remove Admin" className="p-2 rounded-xl border-none cursor-pointer transition-all bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-rose-600">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Requests Card */}
      <div className="bg-white/80 backdrop-blur-2xl border border-white/60 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl overflow-hidden relative mt-10">
        <div className="p-6 sm:p-8 border-b border-slate-100/50 flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-[0_8px_16px_rgba(245,158,11,0.25)] border border-white/20 ring-4 ring-amber-50 shrink-0">
            <CreditCard size={26} strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-amber-900 tracking-tight leading-tight">
              Pending Credit Requests
            </h3>
            <p className="text-sm text-slate-500 font-semibold tracking-wide mt-0.5">
              Approve or reject credit request notifications from sub-admins
            </p>
          </div>
        </div>

        <div className="overflow-x-auto p-4 sm:p-6 bg-slate-50/30">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-slate-200">
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Date</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Admin</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Requested</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Reason</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider text-center">Status</th>
                <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingRequests ? (
                <tr>
                  <td colSpan="6" className="p-16 text-center text-slate-500 font-semibold">
                    <RefreshCw className="animate-spin text-amber-500 inline mr-2 w-6 h-6" /> Syncing requests...
                  </td>
                </tr>
              ) : creditRequests.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-16 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                        <Activity size={32} className="text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium text-base">No pending credit requests.</p>
                      <p className="text-slate-400 text-sm mt-1">You're all caught up!</p>
                    </div>
                  </td>
                </tr>
              ) : (
                creditRequests.map(r => (
                  <tr key={r.id || r._id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="p-4 text-sm text-slate-500 font-medium">
                      {r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold uppercase text-xs">
                          {(r.admin_name || r.admin_username || 'U')[0]}
                        </div>
                        <span className="font-bold text-slate-800 text-sm">{r.admin_name || r.admin_username}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="inline-flex items-center gap-1.5 text-sm font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-lg border border-amber-200/50">
                        <Coins size={14} />
                        {r.amount || r.amount_requested}
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600 max-w-xs truncate" title={r.reason}>
                      {r.reason || <span className="italic text-slate-400">No reason provided</span>}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.7rem] font-bold uppercase tracking-wider ${r.status === 'approved' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 shadow-sm shadow-emerald-100' : r.status === 'rejected' ? 'bg-rose-50 text-rose-600 border border-rose-200 shadow-sm shadow-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-200 shadow-sm shadow-amber-100'}`}>
                        {r.status || 'pending'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      {r.status === 'pending' || !r.status ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleDecideCreditRequest(r.id || r._id, 'approved')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer border-none shadow-md shadow-emerald-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                          >
                            <Check size={14} /> Approve
                          </button>
                          <button
                            onClick={() => handleDecideCreditRequest(r.id || r._id, 'rejected')}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-600 font-bold text-xs cursor-pointer border-none transition-all"
                          >
                            <X size={14} /> Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">Processed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD ADMIN */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <form onSubmit={handleAddAdminSubmit} className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-white/60 rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] space-y-6 text-slate-800 max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200">

            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none rounded-t-[2rem]" />

            <div className="flex justify-between items-start relative z-10 border-b border-indigo-100/50 pb-5">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 shrink-0">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Provision Recruiter</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Create a new recruiter account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-none cursor-pointer transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-5 relative z-10">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newAdminForm.name}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newAdminForm.username}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="e.g. john_d"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g. john@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                  <input
                    type="password"
                    required
                    value={newAdminForm.password}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Min 6 characters"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Initial Credits</label>
                  <div className="relative">
                    <Coins size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      min="0"
                      value={newAdminForm.credits}
                      onChange={(e) => setNewAdminForm(prev => ({ ...prev, credits: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-3 text-sm text-slate-800 font-bold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-6 mt-6 border-t border-slate-100 relative z-10">
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm cursor-pointer transition-colors border-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addAdminLoading}
                className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border-none text-white font-bold text-sm cursor-pointer disabled:opacity-50 shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                {addAdminLoading ? 'Provisioning...' : 'Add Recruiter'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
