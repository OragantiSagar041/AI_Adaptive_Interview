import React, { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { User, Building2, Mail, Phone, Lock, ShieldCheck, ArrowLeft } from 'lucide-react'
import Input from '../components/Input'
import Button from '../components/Button'
import Card from '../components/Card'
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

        const preferredPlanName = searchParams.get("plan")
        const match = sortedPlans.find(p => p.plan_name.toLowerCase() === (preferredPlanName || "").toLowerCase())
        setSelectedPlan(match || sortedPlans[0])
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
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(192,132,252,0.34),transparent_32%),radial-gradient(circle_at_80%_12%,rgba(147,197,253,0.24),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#ffffff_44%,#eef2f6_100%)] px-5 py-6 text-slate-900">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(17,24,39,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,24,39,0.04)_1px,transparent_1px)] bg-[size:88px_88px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.82),transparent_96%)]" />

      <div className="relative z-10 mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/75 px-4 py-4 shadow-[0_18px_40px_rgba(17,24,39,0.08)] backdrop-blur-[22px]">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src={logo} alt="Hire IQ Logo" className="h-12 w-auto object-contain mix-blend-multiply" />
            <span className="text-sm leading-snug text-slate-600">
              AI interview infrastructure<br />for modern hiring teams
            </span>
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft size={16} /> Back to platform
          </Link>
        </header>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-7">
            <div>
              <span className="inline-flex rounded-full border border-slate-900/10 bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
                Workspace registration
              </span>
              <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl">
                Set up your company workspace.
              </h1>
              <p className="mt-4 max-w-2xl leading-8 text-slate-600">
                Choose a plan, create the admin account, and activate the interview console for your hiring team.
              </p>
            </div>

            {status.message && (
              <div className={`rounded-[8px] border p-4 text-[0.95rem] font-medium ${
                status.type === 'error'
                  ? 'bg-danger/10 text-danger border-danger'
                  : status.type === 'success'
                  ? 'bg-success/10 text-success border-success'
                  : 'bg-warning/10 text-warning border-warning'
              }`}>
                {status.message}
              </div>
            )}

            {loadingPlans ? (
              <div className="text-slate-600">Loading subscription plans...</div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6 rounded-[30px] border border-white/80 bg-white/85 p-6 shadow-[0_28px_80px_rgba(17,24,39,0.1)] backdrop-blur-md">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label={<span className="flex items-center gap-1.5"><User size={14} /> Full Name</span>}
                    name="name"
                    value={form.name}
                    onChange={handleInputChange}
                    placeholder="e.g. John Doe"
                    required
                  />
                  <Input
                    label={<span className="flex items-center gap-1.5"><Building2 size={14} /> Company Name</span>}
                    name="company_name"
                    value={form.company_name}
                    onChange={handleInputChange}
                    placeholder="e.g. Acme Inc."
                  />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label={<span className="flex items-center gap-1.5"><Mail size={14} /> Work Email</span>}
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleInputChange}
                    placeholder="e.g. you@company.com"
                    required
                  />
                  <Input
                    label={
                      <span className="flex w-full items-center justify-between">
                        <span className="flex items-center gap-1.5"><Phone size={14} /> Phone Number</span>
                        {form.phone.length > 0 && (
                          <span className={`text-[0.75rem] font-semibold lowercase ${form.phone.length === 10 ? 'text-success' : 'text-slate-500'}`}>
                            {form.phone.length}/10 digits
                          </span>
                        )}
                      </span>
                    }
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleInputChange}
                    placeholder="e.g. 9876543210"
                  />
                </div>

                <Input
                  label={<span className="flex items-center gap-1.5"><Lock size={14} /> Password</span>}
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleInputChange}
                  placeholder="Create secure password"
                  required
                />

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Subscription Plan</label>
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
                              ? 'border-primary bg-indigo-50 shadow-[0_12px_26px_rgba(99,102,241,0.12)]'
                              : 'border-slate-200 bg-slate-50/80 hover:border-primary/30 hover:bg-white'
                          }`}
                        >
                          <div className="flex w-full items-center justify-between">
                            <strong className="font-bold text-slate-900">{p.plan_name}</strong>
                            {p.price > 0 && idx === 1 && (
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-primary">Popular</span>
                            )}
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

                <div className="text-center text-xs text-slate-500">
                  Secure checkout by Razorpay. Already have an admin account? <Link to="/admin" className="text-primary hover:underline">Sign in here</Link>
                </div>
              </form>
            )}
          </div>

          <div>
            {selectedPlan && (
              <Card className="sticky top-6 flex flex-col gap-5 rounded-[30px] border-white/80 p-7">
                <div className="border-b border-slate-200 pb-4">
                  <span className="mb-2 inline-block rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
                    {selectedPlan.price === 0 ? "Trial ready" : "Checkout enabled"}
                  </span>
                  <h3 className="text-xl font-bold text-slate-900">{selectedPlan.plan_name} workspace</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {selectedPlan.price === 0
                      ? "A frictionless way to explore your interview operations before committing."
                      : "Built for teams that want paid activation with real hiring workflow controls."}
                  </p>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Subscription Price</span>
                  <strong className="font-semibold text-slate-900">{formatPrice(selectedPlan.price)}</strong>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Credits Included</span>
                  <strong className="font-semibold text-slate-900">{selectedPlan.credits === 0 ? 'Trial' : selectedPlan.credits} credits</strong>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h4 className="mb-3 text-sm font-bold text-slate-900">Included features:</h4>
                  <div className="flex flex-col gap-4">
                    {(selectedPlan.features || []).map((feat, idx) => (
                      <div key={idx} className="flex gap-2.5 text-sm">
                        <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-success" />
                        <div>
                          <strong className="text-slate-900">{feat}</strong>
                          <p className="mt-0.5 text-[0.78rem] text-slate-500">Includes this capability inside your admin workspace.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export default RegisterPage
