 
import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { RefreshCw, Edit, X } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import axios from 'axios'
import { superAdminNavItems } from '../../components/superadmin/SuperAdminLayout'

const FEATURE_GROUPS = [
  { category: "Super Admin Dashboard", main: "Super Admin Dashboard", sub: [] },
  { category: "Dashboard", main: "Dashboard", sub: [] },
  { category: "Interviews", main: "Interviews", sub: [] },
  { 
    category: "Qualified Candidates", 
    main: "Qualified Candidates", 
    sub: ["Export CSV"] 
  },
  { 
    category: "Rejected Candidates", 
    main: "Rejected Candidates", 
    sub: ["Talent Pool Management"] 
  },
  { 
    category: "Create Interview", 
    main: "Create Interview", 
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
  { category: "Live Results", main: "Live Results", sub: [] }
];

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
  const [activeFeatures, setActiveFeatures] = useState([])
  const [editPlanCredits, setEditPlanCredits] = useState(250)
  const [editPlanPrice, setEditPlanPrice] = useState(0)
  const [editPlanFeatures, setEditPlanFeatures] = useState([])
  const [selectedModule, setSelectedModule] = useState(null)
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
    setSelectedModule(null)
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
      fetchFeatures()
    }
   
  }, [token])

  const fetchFeatures = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/platform/features`)
      if (res.data && res.data.features) {
        setActiveFeatures(res.data.features)
      }
    } catch (error) {
      console.error("Error fetching features:", error)
    }
  }

  // Exact authentic features present across this project

  const featureOptions = Array.from(new Set([
    ...activeFeatures,
    ...(editPlanFeatures || [])
  ]))

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Subscription Plans</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage pricing, credits, and available features for all plans.</p>
        </div>
        <button
          onClick={fetchPlans}
          disabled={loadingPlans}
          className="w-full sm:w-auto px-4 py-2 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
        >
          <RefreshCw size={14} className={loadingPlans ? 'animate-spin' : ''} /> Refresh Plans
        </button>
      </div>

      {loadingPlans ? (
        <div className="py-20 text-center text-slate-500 dark:text-slate-400">
          <RefreshCw className="animate-spin text-indigo-600 inline mr-2" /> Loading pricing plans...
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map(p => (
            <article key={p.plan_name} className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 p-6 rounded-2xl flex flex-col justify-between h-full relative shadow-[0_4px_20px_rgba(0,0,0,0.04)] dark:shadow-none">
              {p.is_unlimited && (
                <span className="absolute top-5 right-5 text-[0.62rem] font-bold tracking-widest text-emerald-600 uppercase bg-emerald-50 px-2 py-0.5 rounded">
                  Scale
                </span>
              )}
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{p.plan_name}</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-1">Granted: {p.credits_granted} interview credits</p>
                <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-4">
                  {p.price === 0 ? 'Free' : `Rs. ${p.price.toLocaleString()}`}
                  {p.price > 0 && <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold font-sans"> / once</span>}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-3 leading-relaxed">
                  {p.summary || 'Custom plan credentials configured for evaluating candidates.'}
                </p>

                <div className="mt-4 mb-4 pr-1">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Active Features ({p.features?.length || 0})
                  </div>
                  <ul className="space-y-1.5 text-slate-600 dark:text-slate-400 text-xs">
                    {(p.features && p.features.length > 0) ? (
                      p.features.map((f, i) => (
                        <li key={i} className="flex gap-1.5 items-center">
                          <span className="text-indigo-500 text-xs font-bold">✓</span> {f}
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-400 italic">No features configured</li>
                    )}
                  </ul>
                </div>
              </div>

              <button
                onClick={() => handleOpenEditPlanModal(p)}
                className="w-full mt-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
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
          <form onSubmit={handleEditPlanSubmit} className="w-full max-w-3xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4 text-slate-800 dark:text-slate-100">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-3">
              <h3 className="font-bold text-slate-800 dark:text-slate-100">Edit {editPlanName} Plan</h3>
              <button
                type="button"
                onClick={() => setIsEditPlanModalOpen(false)}
                className="text-slate-400 hover:text-slate-800 dark:text-slate-100 bg-transparent border-none cursor-pointer outline-none"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Credits Granted</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={editPlanCredits}
                    onChange={(e) => setEditPlanCredits(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">Price (Rs.)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editPlanPrice}
                    onChange={(e) => setEditPlanPrice(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 px-4 py-3 text-sm text-slate-800 dark:text-slate-100 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {selectedModule === null ? (
                  // MAIN MODULE LIST VIEW
                  <>
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Configure Plan Modules ({editPlanFeatures.length} total features selected)
                      </label>
                      {editPlanFeatures.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setEditPlanFeatures([])}
                          className="text-[11px] text-rose-500 hover:underline"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900/50 divide-y divide-slate-200 dark:divide-slate-700">
                      {FEATURE_GROUPS.map((group, idx) => {
                        const isMainChecked = editPlanFeatures.includes(group.main);
                        return (
                          <div key={idx} className="p-4 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            <label className="flex items-center gap-3 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={isMainChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditPlanFeatures([...editPlanFeatures, group.main]);
                                  } else {
                                    setEditPlanFeatures(editPlanFeatures.filter(f => f !== group.main && !group.sub.includes(f)));
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
                                onClick={() => setSelectedModule(group)}
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
                      onClick={() => setSelectedModule(null)}
                      className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <i className="fas fa-arrow-left" /> Back to Modules
                    </button>
                    
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                      <h4 className="text-sm font-bold text-indigo-700 dark:text-indigo-400 mb-1">{selectedModule.category} Settings</h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">Select the specific features available within this module.</p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4">
                        {selectedModule.sub.map(subFeat => {
                          const isSubChecked = editPlanFeatures.includes(subFeat);
                          return (
                            <label 
                              key={subFeat} 
                              className="flex items-center gap-2.5 text-xs select-none cursor-pointer text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                            >
                              <input
                                type="checkbox"
                                checked={isSubChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditPlanFeatures([...editPlanFeatures, subFeat]);
                                  } else {
                                    setEditPlanFeatures(editPlanFeatures.filter(x => x !== subFeat));
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
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsEditPlanModalOpen(false)}
                className="w-full sm:flex-1 py-2.5 rounded-xl bg-transparent border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 cursor-pointer transition-colors"
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
