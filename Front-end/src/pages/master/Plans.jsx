import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { RefreshCw, Edit, X } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import axios from 'axios'

export default function Plans() {
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminId = sessionStorage.getItem('adminId') || ''

  // Plans state
  const [plans, setPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  // Edit Modal state
  const [isEditPlanModalOpen, setIsEditPlanModalOpen] = useState(false)
  const [editPlanName, setEditPlanName] = useState('')
  const [editPlanCredits, setEditPlanCredits] = useState(250)
  const [editPlanPrice, setEditPlanPrice] = useState(0)
  const [editPlanFeatures, setEditPlanFeatures] = useState([])
  const [editPlanLoading, setEditPlanLoading] = useState(false)

  const fetchPlans = async () => {
    setLoadingPlans(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/master/plans?master_id=${encodeURIComponent(adminId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.data && res.data.status === 'success') {
        setPlans(res.data.data || [])
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to fetch pricing plans.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setLoadingPlans(false)
    }
  }

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
      const res = await axios.post(`${API_BASE_URL}/master/plans?master_id=${encodeURIComponent(adminId)}`, {
        plan_name: editPlanName,
        credits_granted: editPlanCredits,
        price: editPlanPrice,
        features: editPlanFeatures
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })
      if (res.data && res.data.status === 'success') {
        Swal.fire({
          title: 'Saved',
          text: 'Plan details updated successfully!',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        setIsEditPlanModalOpen(false)
        fetchPlans()
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Error',
        text: e.response?.data?.detail || 'Failed to save plan changes.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setEditPlanLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchPlans()
    }
  }, [token])

  const featureOptions = [
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
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Subscription Plans</h2>
          <p className="text-sm text-slate-500">Manage pricing, credits, and available features for all plans.</p>
        </div>
        <button
          onClick={fetchPlans}
          disabled={loadingPlans}
          className="w-full sm:w-auto px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
        >
          <RefreshCw size={14} className={loadingPlans ? 'animate-spin' : ''} /> Refresh Plans
        </button>
      </div>

      {loadingPlans ? (
        <div className="py-20 text-center text-slate-500">
          <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Loading pricing plans...
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(p => (
            <article key={p.plan_name} className="bg-white border border-slate-200/60 p-6 rounded-2xl flex flex-col justify-between h-[380px] relative shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              {p.is_unlimited && (
                <span className="absolute top-5 right-5 text-[0.62rem] font-bold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded">
                  Scale
                </span>
              )}
              <div>
                <h3 className="text-lg font-bold text-slate-800">{p.plan_name}</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">Granted: {p.credits_granted} interview credits</p>
                <p className="text-2xl font-black text-slate-900 tracking-tight mt-4">
                  {p.price === 0 ? 'Free' : `Rs. ${p.price.toLocaleString()}`}
                  {p.price > 0 && <span className="text-xs text-slate-500 font-semibold font-sans"> / once</span>}
                </p>
                <p className="text-slate-500 text-xs mt-3 leading-relaxed">
                  {p.summary || 'Custom plan credentials configured for evaluating candidates.'}
                </p>

                <div className="mt-4 max-h-[120px] overflow-y-auto pr-1">
                  <ul className="space-y-1 text-slate-500 text-xs">
                    {(p.features || []).map((f, i) => (
                      <li key={i} className="flex gap-1.5 items-center">
                        <span className="text-indigo-500 text-xs">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <button
                onClick={() => handleOpenEditPlanModal(p)}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
              >
                <Edit size={14} /> Edit Plan Details
              </button>
            </article>
          ))}
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
                className="text-slate-400 hover:text-slate-800 bg-transparent border-none cursor-pointer outline-none"
              >
                <X size={20} />
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Price (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editPlanPrice}
                    onChange={(e) => setEditPlanPrice(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-500 block">Select Available Features</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[160px] overflow-y-auto border border-slate-200 rounded-xl p-3.5 bg-slate-50">
                  {featureOptions.map(f => {
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

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsEditPlanModalOpen(false)}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={editPlanLoading}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold cursor-pointer disabled:opacity-50 transition-colors"
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
