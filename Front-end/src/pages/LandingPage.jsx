import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { ArrowRight, RefreshCw } from 'lucide-react'
import Button from '../components/Button'
import logo from '../assets/logo.png'
import heroDashboard from '../assets/hero_dashboard.png'
import aiDashboard from '../assets/ai_dashboard.png'
import onboardingFlow from '../assets/onboarding_flow.png'

function LandingPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const planOrder = {
    "Free Trial": 0,
    "Basic": 1,
    "Advance": 2,
  }

  useEffect(() => {
    async function fetchPlans() {
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
      } catch (err) {
        setError(err.message || "Unable to load pricing plans right now.")
      } finally {
        setLoading(false)
      }
    }
    fetchPlans()
  }, [])

  const formatPrice = (price) => {
    const numeric = Number(price || 0)
    if (numeric === 0) return "Free"
    return `Rs. ${numeric.toLocaleString("en-IN")}`
  }

  const getPlanBadge = (plan, index) => {
    if (plan.price === 0) return "Trial"
    if (index === 1) return "Popular"
    if (plan.plan_name.toLowerCase() === "advance") return "Scale"
    return "Plan"
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(192,132,252,0.38),transparent_32%),radial-gradient(circle_at_80%_12%,rgba(147,197,253,0.28),transparent_28%),linear-gradient(180deg,#f8fafc_0%,#ffffff_42%,#eef2f6_100%)] text-slate-900 font-sans">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(rgba(17,24,39,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(17,24,39,0.04)_1px,transparent_1px)] bg-[size:88px_88px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.85),transparent_96%)]" />

      <div className="relative z-10 mx-auto max-w-[1340px] px-5 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-white/70 bg-white/75 px-4 py-4 shadow-[0_18px_40px_rgba(17,24,39,0.08)] backdrop-blur-[22px]">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src={logo} alt="Hire IQ Logo" className="h-12 w-auto object-contain mix-blend-multiply" />
            <span className="text-sm leading-snug text-slate-600">
              AI interview infrastructure<br />for modern hiring teams
            </span>
          </Link>

          <nav className="order-3 flex w-full items-center justify-between gap-5 text-sm font-medium text-slate-600 sm:order-none sm:w-auto sm:justify-center">
            <a href="#platform" className="transition-colors hover:text-slate-900">Platform</a>
            <a href="#workflow" className="transition-colors hover:text-slate-900">Workflow</a>
            <a href="#pricing" className="transition-colors hover:text-slate-900">Pricing</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login"><Button variant="secondary" className="px-5 py-2.5">Login</Button></Link>
            <Link to="/register"><Button variant="primary" className="px-5 py-2.5">Start Subscription</Button></Link>
          </div>
        </header>

        <section className="grid items-center gap-8 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-900/10 bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
              Hiring operations, rebuilt
            </div>
            <h1 className="mt-5 max-w-[720px] text-[3rem] font-extrabold leading-[0.94] tracking-tight text-slate-900 sm:text-[4.2rem] lg:text-[5.7rem]">
              Run AI interviews, live proctoring, and recruiter decisions from one workspace.
            </h1>
            <p className="mt-6 max-w-[620px] text-base leading-8 text-slate-600 sm:text-lg">
              Hire IQ helps companies create scheduled interview links, evaluate candidates with AI-generated questions, monitor sessions live, and move shortlisted talent forward without juggling fragmented tools.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3.5">
              <Link to="/register">
                <Button variant="primary" className="px-5 py-3.5">
                  Create Company Workspace <ArrowRight size={18} />
                </Button>
              </Link>
              <a href="#pricing"><Button variant="secondary" className="px-5 py-3.5">View Subscription Plans</Button></a>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-slate-600">
              {["Schedule-aware interview access", "AI question generation and scoring", "Live result monitoring and recordings"].map((item) => (
                <div key={item} className="inline-flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-gradient-to-br from-indigo-300 to-indigo-500 shadow-[0_0_0_8px_rgba(99,102,241,0.08)]" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center">
            <img src={heroDashboard} alt="Hero Dashboard" className="block w-full rounded-[24px]" />
          </div>
        </section>

        <section id="platform" className="mt-10">
          <div className="mb-8 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
            <h2 className="max-w-[650px] text-3xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl">
              Built for the real recruiting workflow, not just one interview screen.
            </h2>
            <p className="max-w-[520px] leading-8 text-slate-600">
              From tenant signup through candidate reporting, the platform already understands the full admin lifecycle. That means your subscription page, dashboard, email invites, interview runtime, and results all stay connected.
            </p>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="flex items-center justify-center">
              <img src={aiDashboard} alt="AI Hiring Dashboard" className="block w-full rounded-[24px] shadow-[0_18px_40px_rgba(17,24,39,0.12)]" />
            </div>

            <div className="grid gap-4">
              <div className="rounded-[30px] bg-gradient-to-b from-indigo-950 to-indigo-800 p-6 text-white shadow-[0_18px_40px_rgba(17,24,39,0.06)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm text-white/70">Live hiring command center</div>
                    <h3 className="mt-2.5 text-3xl font-extrabold tracking-tight">One console for interviews, scheduling, and evaluation.</h3>
                  </div>
                  <div className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white/85">Realtime</div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[22px] bg-white/10 p-4">
                    <h4 className="text-sm text-white/70">Ongoing interviews</h4>
                    <strong className="mt-2.5 block text-3xl tracking-tight">12</strong>
                    <p className="mt-2.5 text-sm text-white/70">Live candidate sessions with active AI prompts and timer windows.</p>
                  </div>
                  <div className="rounded-[22px] bg-white/10 p-4">
                    <h4 className="text-sm text-white/70">Shortlisted today</h4>
                    <strong className="mt-2.5 block text-3xl tracking-tight">07</strong>
                    <p className="mt-2.5 text-sm text-white/70">Candidates cleared for next round with reports ready.</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Interview creation", "Schedule + send"],
                  ["Live monitoring", "WebRTC + snapshots"],
                  ["AI evaluation", "Transcript and scoring"],
                  ["Admin workflow", "Selected, rejected, archived"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-[22px] border border-slate-900/8 bg-white/85 p-5 shadow-[0_18px_40px_rgba(17,24,39,0.06)]">
                    <span className="block text-sm text-slate-600">{label}</span>
                    <strong className="mt-3 block text-xl tracking-tight text-slate-900">{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-6 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
            <h2 className="max-w-[620px] text-3xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl">
              Three layers working together inside one AI interview system.
            </h2>
            <p className="max-w-[520px] leading-8 text-slate-600">
              The product connects your company admin workspace, candidate experience, and monitoring controls so teams can scale hiring without manually stitching tools together.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["Admin workflow", "Workspace-driven interview orchestration", "Create interviews, upload resumes, define scheduling windows, control email content, and manage candidate progression from a single admin console."],
              ["Candidate runtime", "Guided interview experience with timing and anti-cheating", "Candidates enter only through session links, start windows are respected, and the experience combines video, transcripts, coding, and AI-led prompts."],
              ["Recruiter insight", "Evaluation, live results, and recording-backed review", "Hiring teams can watch live progress, inspect AI insights, score reports, shortlisted candidates, and historical recordings tied to each interview session."],
            ].map(([pill, title, copy]) => (
              <article key={pill} className="flex min-h-[260px] flex-col justify-between rounded-[30px] border border-slate-900/8 bg-white/85 p-6 shadow-[0_18px_40px_rgba(17,24,39,0.06)]">
                <span className="w-fit rounded-full bg-indigo-500/10 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700">{pill}</span>
                <div>
                  <h3 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">{title}</h3>
                  <p className="mt-3 leading-7 text-slate-600">{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="mt-14">
          <div className="mb-8 flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
            <h2 className="max-w-[640px] text-3xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl">
              A cleaner onboarding path for companies adopting the platform.
            </h2>
            <p className="max-w-[520px] leading-8 text-slate-600">
              The subscription journey ends in a proper workspace registration screen with Razorpay checkout for paid tiers.
            </p>
          </div>
          <div className="rounded-[30px] border border-slate-900/6 bg-white/60 p-6 text-center">
            <img src={onboardingFlow} alt="Onboarding Flow" className="mx-auto block w-full max-w-[800px] rounded-xl" />
          </div>
        </section>

        <section id="pricing" className="mt-14">
          <div className="rounded-[40px] border border-white/80 bg-gradient-to-b from-white/90 to-slate-50/95 p-6 shadow-[0_28px_80px_rgba(17,24,39,0.1)] sm:p-8">
            <div className="flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-end">
              <h2 className="max-w-[660px] text-3xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl">
                Choose a subscription plan that matches your interview operations.
              </h2>
              <p className="max-w-[520px] leading-8 text-slate-600">
                Every plan is wired into the same admin dashboard. The difference is how much of the hiring operation you want to automate from day one.
              </p>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-3 py-12 text-slate-600">
                <RefreshCw className="animate-spin text-primary" size={28} />
                <span>Loading subscription plans...</span>
              </div>
            )}

            {error && <div className="py-12 text-center font-medium text-danger">{error}</div>}

            {!loading && !error && (
              <div className="mt-7 grid gap-4 lg:grid-cols-3">
                {plans.map((plan, index) => {
                  const isFeatured = plan.price > 0 && index === 1
                  return (
                    <article
                      key={plan.plan_name}
                      className={`relative flex min-h-[370px] flex-col rounded-[30px] border p-6 shadow-[0_18px_40px_rgba(17,24,39,0.06)] ${
                        isFeatured
                          ? 'border-indigo-900/10 bg-gradient-to-b from-indigo-950 to-indigo-800 text-white shadow-[0_28px_56px_rgba(99,102,241,0.18)]'
                          : 'border-slate-900/8 bg-white/90 text-slate-900'
                      }`}
                    >
                      <span className={`absolute right-5 top-5 rounded-full px-3 py-2 text-xs font-extrabold uppercase tracking-wide ${
                        isFeatured ? 'bg-white/10 text-white/90' : 'bg-indigo-500/10 text-indigo-700'
                      }`}>
                        {getPlanBadge(plan, index)}
                      </span>
                      <h3 className="pr-24 text-xl font-extrabold tracking-tight">{plan.plan_name}</h3>
                      <div className={`mt-2 text-sm ${isFeatured ? 'text-white/70' : 'text-slate-500'}`}>{plan.duration_days} days of workspace access</div>
                      <div className="mt-5 text-4xl font-extrabold tracking-tight">
                        {formatPrice(plan.price)}
                        {plan.price > 0 && <span className={`text-sm font-semibold ${isFeatured ? 'text-white/70' : 'text-slate-500'}`}> / subscription</span>}
                      </div>
                      <p className={`mt-4 leading-7 ${isFeatured ? 'text-white/75' : 'text-slate-600'}`}>
                        {plan.price === 0
                          ? "Best for first-time teams who want to test the platform before moving into a paid workspace."
                          : `Built for companies ready to operationalize interviews with ${plan.plan_name.toLowerCase()} tier access.`}
                      </p>
                      <ul className={`mt-5 grid gap-3 text-sm ${isFeatured ? 'text-white/75' : 'text-slate-600'}`}>
                        {(plan.features || []).map((feature, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className={isFeatured ? 'text-indigo-300' : 'text-indigo-600'}>✓</span>
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                      <Link to={`/register?plan=${encodeURIComponent(plan.plan_name)}`} className="mt-auto pt-7 no-underline">
                        <Button variant={isFeatured ? 'secondary' : 'primary'} className="w-full">
                          {plan.price === 0 ? "Start Free Trial" : "Choose This Plan"}
                        </Button>
                      </Link>
                    </article>
                  )
                })}
              </div>
            )}

            <div className="mt-7 flex flex-col items-start justify-between gap-5 rounded-[30px] bg-gradient-to-br from-indigo-900 to-indigo-700 p-7 text-white shadow-[0_24px_50px_rgba(99,102,241,0.22)] sm:flex-row sm:items-center">
              <div>
                <h3 className="text-3xl font-extrabold leading-none tracking-tight">Need a faster path to deployment?</h3>
                <p className="mt-3 max-w-[580px] leading-7 text-white/75">Use the new workspace registration page to create your company account, choose a plan, and activate your interview dashboard without waiting on a separate billing handoff.</p>
              </div>
              <Link to="/register"><Button variant="secondary" className="bg-white text-slate-900">Open Subscription Page</Button></Link>
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-col justify-between gap-4 border-t border-slate-900/8 pt-6 text-sm text-slate-600 sm:flex-row sm:items-center">
          <div>Hire IQ, built for AI-powered recruiting operations.</div>
          <div className="flex flex-wrap items-center gap-4 font-medium">
            <Link to="/register" className="hover:text-slate-900">Subscription</Link>
            <Link to="/login" className="hover:text-slate-900">Admin Login</Link>
          </div>
        </footer>
      </div>
    </main>
  )
}

export default LandingPage
