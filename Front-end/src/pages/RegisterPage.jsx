import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { User, Building2, Mail, Phone, Lock, ShieldCheck, ArrowLeft } from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import Button from '../components/Button'
import logo from '../assets/logo.png'

function RegisterPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [plans, setPlans] = useState([])
  const [selectedPlan, setSelectedPlan] = useState(null)
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState({ message: '', type: '' })

  const [form, setForm] = useState({
    name: '',
    company_name: '',
    email: '',
    phone: '',
    password: ''
  })

  const planOrder = {
    "Free Trial": 0,
    "Basic": 1,
    "Advance": 2,
  }



  useEffect(() => {
    async function loadPlans() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/plans`)
        const payload = await response.json()
        if (!response.ok || payload.status !== "success") {
          throw new Error(payload.detail || payload.message || "Unable to load plans")
        }

        const sortedPlans = (payload.data || []).sort((a, b) => {
          const aOrder = planOrder[a.plan_name] ?? 999
          const bOrder = planOrder[b.plan_name] ?? 999
          return aOrder - bOrder
        })
        setPlans(sortedPlans)

        const preferredPlanName = searchParams.get("plan") || ""
        const match = sortedPlans.find(p => p.plan_name.toLowerCase() === preferredPlanName.toLowerCase())
        
        if (match) {
          setSelectedPlan(match)
        } else {
          // Fallback to the trial plan, or the first plan if no trial plan is found
          const trialPlan = sortedPlans.find(p => p.plan_name.toLowerCase().includes("trial"))
          setSelectedPlan(trialPlan || sortedPlans[0])
        }
      } catch (err) {
        setStatus({ message: err.message || "Failed to load plans.", type: 'error' })
      } finally {
        setLoadingPlans(false)
      }
    }
    loadPlans()
  }, [searchParams])

  const formatPrice = (price) => {
    const numeric = Number(price || 0)
    if (numeric === 0) return "Free"
    return `Rs. ${numeric.toLocaleString("en-IN")}`
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    if (name === 'phone') {
      const cleaned = value.replace(/\D/g, '').slice(0, 10)
      setForm(prev => ({ ...prev, [name]: cleaned }))
    } else if (name === 'name') {
      // Prevent numbers in full name
      const cleaned = value.replace(/[\d]/g, '')
      setForm(prev => ({ ...prev, [name]: cleaned }))
    } else {
      setForm(prev => ({ ...prev, [name]: value }))
    }
  }

  const validateForm = () => {
    if (!form.name || !form.email || !form.password) {
      setStatus({ message: "Full name, work email, and password are required.", type: 'error' })
      return false
    }
    if (form.phone && form.phone.length !== 10) {
      setStatus({ message: "Phone number must be exactly 10 digits.", type: 'error' })
      return false
    }
    if (!selectedPlan) {
      setStatus({ message: "Please choose a subscription plan.", type: 'error' })
      return false
    }
    return true
  }

  const registerFreePlan = async () => {
    const response = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        company_name: form.company_name,
        email: form.email,
        phone: form.phone,
        password: form.password,
        plan: selectedPlan.plan_name,
      }),
    })

    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.detail || payload.message || "Unable to create your workspace.")
    }

    setStatus({ message: "Workspace created successfully. Redirecting you to the admin login...", type: 'success' })
    setTimeout(() => navigate('/admin'), 1800)
  }

  const startPaidCheckout = async () => {
    if (!window.Razorpay) {
      throw new Error("Razorpay Checkout could not be loaded. Please refresh and try again.")
    }

    const orderResponse = await fetch(`${API_BASE_URL}/api/razorpay/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan_name: selectedPlan.plan_name,
        signup_form: form,
      }),
    })

    const orderPayload = await orderResponse.json()
    if (!orderResponse.ok) {
      throw new Error(orderPayload.detail || orderPayload.message || "Unable to start payment.")
    }

    const options = {
      key: orderPayload.key,
      order_id: orderPayload.order.id,
      amount: orderPayload.order.amount,
      currency: orderPayload.order.currency,
      name: orderPayload.company_name || "Hire IQ",
      description: orderPayload.description || `${selectedPlan.plan_name} subscription`,
      prefill: orderPayload.prefill || {},
      theme: { color: "#6366f1" },
      handler: async function (response) {
        try {
          setStatus({ message: "Payment received. Verifying and activating your workspace...", type: 'info' })
          setSubmitting(true)
          const verifyResponse = await fetch(`${API_BASE_URL}/api/razorpay/verify-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              plan_name: selectedPlan.plan_name,
              signup_form: form,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            }),
          })

          const verifyPayload = await verifyResponse.json()
          if (!verifyResponse.ok) {
            throw new Error(verifyPayload.detail || verifyPayload.message || "Payment verification failed.")
          }

          setStatus({ message: "Payment verified and workspace activated. Redirecting to admin login...", type: 'success' })
          setTimeout(() => navigate('/admin'), 2200)
        } catch (error) {
          setStatus({ message: error.message || "Payment completed but activation failed. Please contact support.", type: 'error' })
        } finally {
          setSubmitting(false)
        }
      },
      modal: {
        ondismiss: function () {
          setSubmitting(false)
          setStatus({ message: "Payment window closed. You can continue whenever you're ready.", type: 'info' })
        }
      }
    }

    const razorpay = new window.Razorpay(options)
    razorpay.open()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus({ message: '', type: '' })
    if (!validateForm()) return

    setSubmitting(true)
    try {
      if (selectedPlan.price === 0) {
        await registerFreePlan()
      } else {
        await startPaidCheckout()
      }
    } catch (err) {
      setStatus({ message: err.message || "Unable to continue with registration.", type: 'error' })
      setSubmitting(false)
    }
  }

  return (
    <main className="relative min-h-screen bg-slate-50 dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 font-sans overflow-x-hidden px-4 py-8 md:px-8 transition-colors duration-300">
      {/* Background Soft Glows */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-[500px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/15 via-purple-500/10 to-transparent blur-[100px]" 
      />
      {/* Soft Dot Grid Pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.12] dark:opacity-[0.12] opacity-[0.06]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "28px 28px"
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl">
        {/* Top Navigation Header */}
        <header className="mb-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-[#1e293b]/70 px-6 py-4 shadow-lg backdrop-blur-xl">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src={logo} alt="Hire IQ Logo" className="h-10 w-auto object-contain brand-logo-img" />
            <span className="text-xs leading-snug text-slate-500 dark:text-slate-400 hidden sm:inline-block">
              AI interview infrastructure<br />for modern hiring teams
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-4 py-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-xs"
            >
              <ArrowLeft size={14} /> Back to platform
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-7">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/15 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                <ShieldCheck size={14} /> Workspace Registration
              </span>
              <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-5xl">
                Set up your <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-500 dark:from-slate-100 dark:via-indigo-200 dark:to-purple-300 bg-clip-text text-transparent">company workspace.</span>
              </h1>
              <p className="mt-3 max-w-2xl text-sm md:text-base text-slate-600 dark:text-slate-400 leading-relaxed">
                Choose a plan, create your admin account, and activate the interview console for your hiring team.
              </p>
            </div>

            {status.message && (
              <div className={`rounded-[8px] border p-4 text-[0.95rem] font-medium ${
                status.type === 'error'
                  ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                  : status.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                  : 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
              }`}>
                {status.message}
              </div>
            )}

            {loadingPlans ? (
              <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm">Loading subscription plans...</div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/90 dark:bg-[#1e293b]/70 p-7 md:p-8 shadow-xl backdrop-blur-xl transition-colors">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <User size={14} className="text-indigo-600 dark:text-indigo-400" /> Full Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleInputChange}
                      placeholder="e.g. John Doe"
                      required
                      className="w-full bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Building2 size={14} className="text-indigo-600 dark:text-indigo-400" /> Company Name
                    </label>
                    <input
                      type="text"
                      name="company_name"
                      value={form.company_name}
                      onChange={handleInputChange}
                      placeholder="e.g. Acme Inc."
                      className="w-full bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Mail size={14} className="text-indigo-600 dark:text-indigo-400" /> Work Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={form.email}
                      onChange={handleInputChange}
                      placeholder="e.g. you@company.com"
                      required
                      className="w-full bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-between justify-between">
                      <span className="flex items-center gap-2"><Phone size={14} className="text-indigo-600 dark:text-indigo-400" /> Phone Number</span>
                      {form.phone.length > 0 && (
                        <span className={`text-[0.75rem] font-semibold lowercase ${form.phone.length === 10 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                          {form.phone.length}/10 digits
                        </span>
                      )}
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={form.phone}
                      onChange={handleInputChange}
                      placeholder="e.g. 9876543210"
                      className="w-full bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                    <Lock size={14} className="text-indigo-600 dark:text-indigo-400" /> Password <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={handleInputChange}
                    placeholder="e.g. John Doe"
                    required
                    className="w-full bg-slate-50 dark:bg-[#0f172a]/70 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-100 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:bg-white dark:focus:bg-[#0f172a] focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                {/* Plan Selection Buttons */}
                <div className="flex flex-col gap-3 pt-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Select Subscription Plan</label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {plans.map((p, idx) => {
                      const isSelected = selectedPlan?.id === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPlan(p)}
                          className={`flex cursor-pointer flex-col gap-1.5 rounded-[8px] border p-4 text-left transition-all ${
                            isSelected
                              ? 'border-2 border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 shadow-[0_0_20px_rgba(99,102,241,0.2)] ring-1 ring-indigo-500'
                              : 'border-slate-200 dark:border-slate-700/60 bg-slate-50/50 dark:bg-[#0f172a]/40 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-100 dark:hover:bg-[#0f172a]/70'
                          }`}
                        >
                          {isSelected && (
                            <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/15 blur-[20px] -mr-8 -mt-8 rounded-full pointer-events-none" />
                          )}
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <strong className="font-bold text-slate-900 dark:text-slate-100 text-sm uppercase tracking-wide">{p.plan_name}</strong>
                              {p.price > 0 && idx === 1 && (
                                <span className="rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 px-2 py-0.5 text-[0.6rem] font-extrabold uppercase tracking-wider text-white">Popular</span>
                              )}
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{p.credits === 0 ? 'Trial access' : `${p.credits} credits`}</span>
                          </div>
                          <div className="mt-3">
                            <strong className="text-xl font-bold text-slate-900 dark:text-slate-100">{formatPrice(p.price)}</strong>
                            {p.price > 0 && <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">/mo</span>}
                          </div>
                          <span className="text-[0.75rem] text-slate-500">{p.credits === 0 ? 'Trial' : p.credits} credits</span>
                          <strong className="mt-1 text-lg text-slate-900">{formatPrice(p.price)}</strong>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <Button type="submit" variant="primary" className="mt-2 w-full py-3.5" disabled={submitting}>
                  {submitting ? "Processing..." : selectedPlan?.price === 0 ? "Start Free Trial Workspace" : `Pay ${formatPrice(selectedPlan?.price)} with Razorpay`}
                </Button>

                <div className="text-center text-xs text-slate-500 dark:text-slate-400 pt-1">
                  Secure checkout powered by Razorpay. Already have an admin account?{' '}
                  <Link to="/admin" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-semibold underline underline-offset-4">
                    Sign in here
                  </Link>
                </div>
              </form>
            )}
          </div>

          <div>
            {selectedPlan && (
              <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/60 bg-white/90 dark:bg-[#1e293b]/70 p-7 md:p-8 shadow-xl backdrop-blur-xl flex flex-col gap-6 transition-colors">
                <div className="absolute top-0 right-0 w-36 h-36 bg-indigo-500/10 blur-[50px] -mr-16 -mt-16 rounded-full pointer-events-none" />

                <div className="border-b border-slate-200 dark:border-slate-700/60 pb-5">
                  <span className="mb-3 inline-block rounded-full border border-indigo-500/30 bg-indigo-500/15 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-300">
                    {selectedPlan.price === 0 ? "Free Trial Selected" : "Selected Subscription"}
                  </span>
                  <h3 className="text-2xl font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">{selectedPlan.plan_name} Workspace</h3>
                  <p className="mt-2 text-xs md:text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {selectedPlan.price === 0
                      ? "A frictionless way to explore your interview operations before committing."
                      : "Built for teams that want paid activation with real hiring workflow controls."}
                  </p>
                </div>

                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Subscription Price</span>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatPrice(selectedPlan.price)}</span>
                    {selectedPlan.price > 0 && <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">/ month</span>}
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm border-t border-slate-200 dark:border-slate-700/40 pt-4">
                  <span className="text-slate-500 dark:text-slate-400">Candidate Evaluation Credits</span>
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1 rounded-full border border-indigo-200 dark:border-indigo-500/20 text-xs">
                    {selectedPlan.credits === 0 ? 'Trial Credits' : `${selectedPlan.credits} Candidates`}
                  </span>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-700/60 pt-5">
                  <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Included Workspace Features</h4>
                  <div className="flex flex-col gap-3.5">
                    {(selectedPlan.features || []).map((feat, idx) => (
                      <div key={idx} className="flex gap-3 text-xs md:text-sm text-slate-600 dark:text-slate-300 items-start">
                        <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default RegisterPage
