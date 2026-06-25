import React, { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Lock, Building, Layers, Eye, EyeOff, Bolt, RefreshCw, CheckCircle2, Sparkles } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import axios from 'axios'

export default function CreateTenant() {
  const navigate = useNavigate()
  const token = useSelector(state => state.auth.token) || ''
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminId = sessionStorage.getItem('adminId') || ''

  // Form states
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [selectedPlan, setSelectedPlan] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Tracking last auto-suggest values to avoid overwriting user edits
  const [lastSuggestedUser, setLastSuggestedUser] = useState('')
  const [lastSuggestedEmail, setLastSuggestedEmail] = useState('')

  // Plans dropdown
  const [plans, setPlans] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  const fetchPlans = async () => {
    setLoadingPlans(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/master/plans?master_id=${encodeURIComponent(adminId)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.data && res.data.status === 'success') {
        const list = res.data.data || []
        setPlans(list)
        if (list.length > 0) {
          const trialPlan = list.find(p => p.plan_name.toLowerCase().includes('trial'))
          setSelectedPlan(trialPlan ? trialPlan.plan_name : list[0].plan_name)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingPlans(false)
    }
  }

  // Handle smart suggestions when typing Company Name
  const handleCompanyChange = (val) => {
    setCompanyName(val)
    
    // Suggest username & email if they are empty or match the previous suggestion
    const cleanCompany = val.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (cleanCompany) {
      const suggestedUser = `${cleanCompany}_admin`
      const suggestedEmail = `admin@${cleanCompany}.com`

      if (!username || username === lastSuggestedUser) {
        setUsername(suggestedUser)
        setLastSuggestedUser(suggestedUser)
      }
      if (!email || email === lastSuggestedEmail) {
        setEmail(suggestedEmail)
        setLastSuggestedEmail(suggestedEmail)
      }
    } else {
      if (username === lastSuggestedUser) {
        setUsername('')
        setLastSuggestedUser('')
      }
      if (email === lastSuggestedEmail) {
        setEmail('')
        setLastSuggestedEmail('')
      }
    }
  }

  // Calculate simple password strength
  const getPasswordStrength = () => {
    if (!password) return { text: '', color: 'bg-slate-200', width: 'w-0' }
    if (password.length < 6) return { text: 'Weak', color: 'bg-rose-500', width: 'w-1/3' }
    
    const hasNumbers = /\d/.test(password)
    const hasSpecial = /[^A-Za-z0-9]/.test(password)
    const hasMixed = /[a-z]/.test(password) && /[A-Z]/.test(password)

    if (password.length >= 8 && hasNumbers && (hasSpecial || hasMixed)) {
      return { text: 'Strong', color: 'bg-emerald-500', width: 'w-full' }
    }
    return { text: 'Medium', color: 'bg-amber-500', width: 'w-2/3' }
  }

  const strength = getPasswordStrength()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username || !email || !password || !companyName || !selectedPlan) {
      Swal.fire('Error', 'Please fill in all fields.', 'error')
      return
    }

    setLoading(true)
    try {
      const res = await axios.post(`${API_BASE_URL}/master/tenants?master_id=${encodeURIComponent(adminId)}`, {
        company_name: companyName,
        username,
        password,
        email,
        subscription_plan: selectedPlan,
        credits: 0
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      })

      if (res.data && res.data.status === 'success') {
        Swal.fire({
          title: 'Tenant Created',
          text: 'Provisioned tenant account successfully!',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        
        // Clear fields
        setUsername('')
        setEmail('')
        setPassword('')
        setCompanyName('')
        setLastSuggestedUser('')
        setLastSuggestedEmail('')
        
        // Redirect to subscribers list
        navigate('/master/subscribers')
      }
    } catch (e) {
      console.error(e)
      Swal.fire({
        title: 'Create Failed',
        text: e.response?.data?.detail || 'Could not provision new tenant.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchPlans()
    }
  }, [token])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Provision Tenant Account</h2>
          <p className="text-sm text-slate-500">Create new company workspaces and assign credentials on the platform.</p>
        </div>
        <div className="flex items-center gap-1 bg-indigo-50 text-indigo-600 text-xs font-semibold px-3 py-1.5 rounded-xl shrink-0">
          <Sparkles size={14} className="animate-pulse" /> Smart Provisioning
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Company & Admin Details */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="text-base font-bold text-slate-800 border-b border-slate-100 pb-3">
            1. Company & Admin Details
          </h3>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Company Name */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Company Name</label>
              <div className="relative">
                <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Building size={16} />
                </span>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => handleCompanyChange(e.target.value)}
                  placeholder="Acme Corp"
                  style={{ paddingLeft: '2.75rem' }}
                  className="w-full py-3 pr-4 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Admin Email Address</label>
              <div className="relative">
                <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Mail size={16} />
                </span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  style={{ paddingLeft: '2.75rem' }}
                  className="w-full py-3 pr-4 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {/* Username */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Admin Username</label>
              <div className="relative">
                <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <User size={16} />
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. company_admin"
                  style={{ paddingLeft: '2.75rem' }}
                  className="w-full py-3 pr-4 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 block uppercase tracking-wider">Access Password</label>
              <div className="relative">
                <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                  <Lock size={16} />
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Secure password"
                  style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                  className="w-full py-3 text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              
              {/* Password Strength Indicator */}
              {password && (
                <div className="space-y-1.5 pt-0.5">
                  <div className="flex justify-between items-center text-[10px] font-bold tracking-wider uppercase text-slate-400">
                    <span>Password Strength</span>
                    <span className="font-semibold">{strength.text}</span>
                  </div>
                  <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${strength.color} ${strength.width} transition-all duration-300`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Choose Subscription Plan */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 md:p-8 space-y-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-800">
              2. Assign Subscription Plan
            </h3>
            <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Select One Option</span>
          </div>

          {loadingPlans ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse border border-slate-100 rounded-2xl p-4 bg-slate-50/50 h-28 flex flex-col justify-between" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {plans.map(p => {
                const isSelected = selectedPlan === p.plan_name
                return (
                  <div
                    key={p.plan_name}
                    onClick={() => setSelectedPlan(p.plan_name)}
                    className={`cursor-pointer border-2 p-4 rounded-xl transition-all relative flex flex-col justify-between h-28 select-none ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/20 shadow-[0_4px_12px_rgba(99,102,241,0.08)]'
                        : 'border-slate-200/60 bg-white hover:bg-slate-50'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 text-indigo-600">
                        <CheckCircle2 size={16} fill="currentColor" className="text-white fill-indigo-600" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{p.plan_name}</h4>
                      <p className="text-[10px] text-slate-400 font-medium line-clamp-2 mt-1 leading-snug">
                        {p.summary || 'Custom plan configuration.'}
                      </p>
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-xs font-bold text-indigo-600">
                        {p.credits_granted} Credits
                      </span>
                      <span className="text-xs font-black text-slate-800">
                        {p.price === 0 ? 'Free' : `Rs. ${p.price.toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
          <button
            type="button"
            onClick={() => {
              setUsername('')
              setEmail('')
              setPassword('')
              setCompanyName('')
              setLastSuggestedUser('')
              setLastSuggestedEmail('')
            }}
            className="w-full sm:w-auto px-6 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-xl transition-colors cursor-pointer text-center"
          >
            Reset Form
          </button>
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Bolt size={16} />} 
            {loading ? 'Creating Tenant...' : 'Create Account Now'}
          </button>
        </div>
      </form>
    </div>
  )
}
