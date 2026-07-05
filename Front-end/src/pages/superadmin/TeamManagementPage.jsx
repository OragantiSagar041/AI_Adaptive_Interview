 
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import axios from 'axios'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { RefreshCw } from 'lucide-react'

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
                <th className="p-4 text-[0.68rem] font-bold uppercase text-slate-500 text-right">Actions</th>
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
                      <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${admin.login_enabled === false ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                        {admin.login_enabled === false ? 'Deactivated' : 'Active'}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-3">
                      <button onClick={() => handleToggleStatus(admin)} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium cursor-pointer bg-transparent border-none">
                        {admin.login_enabled === false ? 'Activate' : 'Deactivate'}
                      </button>
                      <button onClick={() => handleAddCreditsToAdmin(admin.id)} className="text-xs text-emerald-600 hover:text-emerald-800 font-medium cursor-pointer bg-transparent border-none">
                        Add Credits
                      </button>
                      <button onClick={() => handleDeleteAdmin(admin.id)} className="text-xs text-red-600 hover:text-red-800 font-medium cursor-pointer bg-transparent border-none">
                        Remove
                      </button>
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
                    <td className="p-4 font-bold text-slate-850 text-sm">{r.admin_name || r.admin_username}</td>
                    <td className="p-4 text-xs font-bold text-amber-500">{r.amount || r.amount_requested} credits</td>
                    <td className="p-4 text-xs text-slate-500 max-w-xs truncate">{r.reason || '-'}</td>
                    <td className="p-4 capitalize">
                      <span className={`px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold uppercase tracking-wider ${r.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : r.status === 'rejected' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
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

      {/* MODAL: ADD ADMIN */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <form onSubmit={handleAddAdminSubmit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800 max-h-[90vh] overflow-y-auto">
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
