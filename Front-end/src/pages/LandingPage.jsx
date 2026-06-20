import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import { ArrowRight, ArrowUpRight, Menu, RefreshCw, Zap, Eye, BarChart3, Users, Clock, Shield } from 'lucide-react'
import { motion, useScroll, useTransform, useInView, useSpring, AnimatePresence } from 'framer-motion'
import Button from '../components/Button'

import logo from '../assets/logo.png'
import aiDashboard from '../assets/ai_dashboard.png'
import onboardingFlow from '../assets/onboarding_flow.png'

const normalizePlan = (plan) => {
  const planName = plan.plan_name || plan.name || 'Plan'
  const priceInPaise = Boolean(plan.name && !plan.plan_name)
  const price = priceInPaise && plan.price > 0 ? plan.price / 100 : (plan.price ?? 0)
  return { ...plan, plan_name: planName, price, duration_days: plan.duration_days ?? 30 }
}

const getPlanName = (plan) => plan?.plan_name || plan?.name || 'Plan'

// ─── Shiny animated headline text ───────────────────────────────────────────
const ShinyText = ({ text }) => (
  <motion.span
    className="inline-block font-bold"
    style={{
      backgroundImage: "linear-gradient(100deg,#64CEFB 0%,#64CEFB 40%,#ffffff 50%,#64CEFB 60%,#64CEFB 100%)",
      backgroundSize: "200% auto",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      backgroundClip: "text",
      color: "transparent",
    }}
    animate={{ backgroundPosition: ["-200% center", "200% center"] }}
    transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
  >
    {text}
  </motion.span>
)

// ─── Fade + slide in on scroll ───────────────────────────────────────────────
const Reveal = ({ children, delay = 0, direction = 'up', className = '' }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px 0px' })
  const variants = {
    hidden: {
      opacity: 0,
      y: direction === 'up' ? 40 : direction === 'down' ? -40 : 0,
      x: direction === 'left' ? 40 : direction === 'right' ? -40 : 0,
    },
    visible: { opacity: 1, y: 0, x: 0 },
  }
  return (
    <motion.div
      ref={ref}
      className={className}
      variants={variants}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

// ─── Animated counter ────────────────────────────────────────────────────────
const Counter = ({ to, suffix = '' }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  const spring = useSpring(0, { stiffness: 60, damping: 20 })
  const [display, setDisplay] = useState(0)
  useEffect(() => { if (inView) spring.set(to) }, [inView, to, spring])
  useEffect(() => spring.on('change', v => setDisplay(Math.round(v))), [spring])
  return <span ref={ref}>{display}{suffix}</span>
}

// ─── Glowing orb background blobs ────────────────────────────────────────────
const Blobs = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    <motion.div
      className="absolute -top-40 -left-40 h-[600px] w-[600px] rounded-full"
      style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18) 0%, transparent 70%)' }}
      animate={{ scale: [1, 1.12, 1], x: [0, 30, 0], y: [0, -20, 0] }}
      transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
    />
    <motion.div
      className="absolute top-1/3 -right-60 h-[500px] w-[500px] rounded-full"
      style={{ background: 'radial-gradient(circle, rgba(100,206,251,0.14) 0%, transparent 70%)' }}
      animate={{ scale: [1, 1.08, 1], x: [0, -25, 0], y: [0, 30, 0] }}
      transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
    />
    <motion.div
      className="absolute bottom-0 left-1/3 h-[400px] w-[400px] rounded-full"
      style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.12) 0%, transparent 70%)' }}
      animate={{ scale: [1, 1.1, 1] }}
      transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 6 }}
    />
  </div>
)

// ─── Floating stat badge ─────────────────────────────────────────────────────
const StatBadge = ({ icon: Icon, label, value, delay, color }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true })
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.8, y: 20 }}
      animate={inView ? { opacity: 1, scale: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, scale: 1.03 }}
      className="relative flex items-center gap-3 rounded-2xl border border-white/60 bg-white/80 px-5 py-4 shadow-[0_8px_32px_rgba(17,24,39,0.10)] backdrop-blur-sm"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <div className="text-xl font-extrabold text-slate-900">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </motion.div>
  )
}

// ─── Feature card with hover glow ────────────────────────────────────────────
const FeatureCard = ({ pill, title, copy, index }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-60px 0px' })
  const colors = [
    'from-indigo-500/10 to-violet-500/10 border-indigo-200/60',
    'from-cyan-500/10 to-blue-500/10 border-cyan-200/60',
    'from-purple-500/10 to-pink-500/10 border-purple-200/60',
  ]
  const pillColors = [
    'bg-indigo-500/10 text-indigo-700',
    'bg-cyan-500/10 text-cyan-700',
    'bg-purple-500/10 text-purple-700',
  ]
  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 50 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6, boxShadow: '0 32px 64px rgba(99,102,241,0.15)' }}
      className={`relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-[28px] border bg-gradient-to-br p-7 ${colors[index]} transition-all duration-300`}
    >
      {/* animated corner accent */}
      <motion.div
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20"
        style={{ background: index === 0 ? '#6366f1' : index === 1 ? '#06b6d4' : '#a855f7' }}
        animate={{ scale: [1, 1.3, 1] }}
        transition={{ duration: 4 + index, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${pillColors[index]}`}>{pill}</span>
      <div>
        <h3 className="mt-5 text-xl font-extrabold tracking-tight text-slate-900">{title}</h3>
        <p className="mt-3 leading-7 text-slate-600 text-sm">{copy}</p>
      </div>
    </motion.article>
  )
}

// ─── Pricing card ────────────────────────────────────────────────────────────
const PricingCard = ({ plan, index, isFeatured, badge, formatPrice }) => {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-40px 0px' })
  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 60, scale: 0.96 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ delay: index * 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      whileHover={isFeatured ? { scale: 1.02 } : { y: -5 }}
      className={`relative flex min-h-[420px] flex-col rounded-[28px] border p-7 overflow-hidden transition-all duration-300 ${isFeatured
          ? 'border-indigo-900/10 bg-gradient-to-b from-indigo-950 to-indigo-800 text-white shadow-[0_32px_80px_rgba(99,102,241,0.35)]'
          : 'border-slate-200/80 bg-white text-slate-900 shadow-[0_8px_40px_rgba(17,24,39,0.08)]'
        }`}
    >
      {isFeatured && (
        <motion.div
          className="absolute inset-0 rounded-[28px]"
          style={{ background: 'radial-gradient(circle at 30% 20%, rgba(100,206,251,0.15), transparent 60%)' }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}
      <div className="relative z-10 flex flex-col h-full">
        <span className={`absolute right-0 top-0 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide ${isFeatured ? 'bg-white/15 text-white/90' : 'bg-indigo-500/10 text-indigo-700'
          }`}>{badge}</span>
        <h3 className="pr-16 text-xl font-extrabold tracking-tight">{getPlanName(plan)}</h3>
        <div className={`mt-1 text-sm ${isFeatured ? 'text-white/60' : 'text-slate-400'}`}>{plan.duration_days ?? 30} days access</div>
        <div className="mt-5 text-4xl font-extrabold tracking-tight">
          {formatPrice(plan.price)}
          {plan.price > 0 && <span className={`text-sm font-semibold ${isFeatured ? 'text-white/60' : 'text-slate-400'}`}> /sub</span>}
        </div>
        <p className={`mt-4 text-sm leading-7 ${isFeatured ? 'text-white/70' : 'text-slate-500'}`}>
          {plan.price === 0
            ? "Try the full platform free. No card needed."
            : `Scale your hiring with ${getPlanName(plan).toLowerCase()} tier capabilities.`}
        </p>
        <ul className={`mt-5 grid gap-2.5 text-sm ${isFeatured ? 'text-white/75' : 'text-slate-600'}`}>
          {(plan.features || []).map((f, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: index * 0.1 + i * 0.06 + 0.3 }}
              className="flex items-start gap-2"
            >
              <span className={`mt-0.5 flex-shrink-0 ${isFeatured ? 'text-cyan-300' : 'text-indigo-500'}`}>✓</span>
              <span>{f}</span>
            </motion.li>
          ))}
        </ul>
        <Link to={`/register?plan=${encodeURIComponent(getPlanName(plan))}`} className="mt-auto pt-7 no-underline">
          <motion.div whileTap={{ scale: 0.97 }}>
            <Button variant={isFeatured ? 'secondary' : 'primary'} className="w-full">
              {plan.price === 0 ? "Start Free Trial" : "Choose This Plan"}
            </Button>
          </motion.div>
        </Link>
      </div>
    </motion.article>
  )
}

// ─── Horizontal scroll marquee ───────────────────────────────────────────────
const Marquee = ({ items }) => (
  <div className="relative flex overflow-hidden py-3">
    <div className="pointer-events-none absolute left-0 top-0 z-10 h-full w-24 bg-gradient-to-r from-slate-50 to-transparent" />
    <div className="pointer-events-none absolute right-0 top-0 z-10 h-full w-24 bg-gradient-to-l from-slate-50 to-transparent" />
    <motion.div
      className="flex gap-6 whitespace-nowrap"
      animate={{ x: ['0%', '-50%'] }}
      transition={{ duration: 28, ease: 'linear', repeat: Infinity }}
    >
      {[...items, ...items].map((item, i) => (
        <span key={i} className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          {item}
        </span>
      ))}
    </motion.div>
  </div>
)

// ─── Dashboard mockup with floating elements ─────────────────────────────────
const DashboardShowcase = ({ src }) => {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const y = useTransform(scrollYProgress, [0, 1], [30, -30])

  return (
    <div ref={ref} className="relative">
      <motion.div style={{ y }} className="relative">
        <motion.img
          src={src}
          alt="AI Hiring Dashboard"
          className="block w-full rounded-[24px] shadow-[0_32px_80px_rgba(17,24,39,0.18)]"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* floating badges */}
        <motion.div
          className="absolute -top-5 -right-5 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          animate={{ y: [0, -6, 0] }}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">✓</span>
            AI Scored · 94%
          </div>
        </motion.div>
        <motion.div
          className="absolute -bottom-5 -left-5 rounded-2xl border border-white/80 bg-white px-4 py-3 shadow-xl"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.7 }}
          animate={{ y: [0, 6, 0] }}
        >
          <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs">↗</span>
            12 Live Sessions
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
function LandingPage() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const planOrder = { "Free Trial": 0, "Basic": 1, "Advance": 2 }

  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/plans`)
        const payload = await response.json()
        if (!response.ok || payload.status !== "success") throw new Error(payload.detail || payload.message || "Unable to load plans")
        const sortedPlans = (payload.data || [])
          .map(normalizePlan)
          .sort((a, b) => (planOrder[a.plan_name] ?? 999) - (planOrder[b.plan_name] ?? 999))
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
    const n = Number(price || 0)
    return n === 0 ? "Free" : `Rs. ${n.toLocaleString("en-IN")}`
  }

  const getPlanBadge = (plan, index) => {
    if (plan.price === 0) return "Trial"
    if (index === 1) return "Popular"
    if (getPlanName(plan).toLowerCase() === "advance") return "Scale"
    return "Plan"
  }

  const marqueeItems = [
    "AI Interview Engine", "Live Session Monitoring", "WebRTC Capture",
    "Candidate Scoring", "Auto-Shortlisting", "Resume Parsing",
    "Razorpay Checkout", "Email Scheduling", "Workspace Management",
  ]

  const navLinks = [
    { label: 'Platform', href: '#platform' },
    { label: 'Workflow', href: '#workflow' },
    { label: 'Pricing', href: '#pricing' },
  ]

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <main className="font-sans">
      {/* ── STICKY NAV ─────────────────────────────────────────────────────── */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-3 no-underline">
            <img src={logo} alt="Hire IQ Logo" className="h-8 w-auto object-contain brightness-0 invert" />
            <span className="text-lg font-semibold tracking-wide text-white">Hire IQ</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map(({ label, href }) => (
              <a
                key={label}
                href={href}
                className="rounded-full px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <Link to="/login" className="no-underline">
              <Button variant="secondary" className="!rounded-full !px-5 !py-2.5 !text-sm !shadow-none">
                Admin Login
              </Button>
            </Link>
            <Link to="/register" className="no-underline">
              <Button className="!rounded-full !px-5 !py-2.5 !text-sm">
                Start Subscription
              </Button>
            </Link>
          </div>

          <button
            type="button"
            className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden border-t border-white/10 bg-black/90 lg:hidden"
            >
              <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:px-6">
                {navLinks.map(({ label, href }) => (
                  <a
                    key={label}
                    href={href}
                    onClick={closeMobileMenu}
                    className="rounded-xl px-4 py-3 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {label}
                  </a>
                ))}
                <Link to="/login" onClick={closeMobileMenu} className="no-underline">
                  <Button variant="secondary" className="mt-2 w-full !rounded-xl">
                    Admin Login
                  </Button>
                </Link>
                <Link to="/register" onClick={closeMobileMenu} className="no-underline">
                  <Button className="w-full !rounded-xl">
                    Start Subscription
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <div className="relative h-screen w-full bg-black overflow-hidden text-white">
        <video
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_105406_16f4600d-7a92-4292-b96e-b19156c7830a.mp4"
          autoPlay loop muted playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col px-4 pt-24 sm:px-6 lg:px-8">
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-8">
            <p className="max-w-md text-sm text-white/80 sm:text-base">Create scheduled interview links, evaluate candidates with AI-generated questions, and monitor sessions live from one workspace.</p>
            <div className="flex lg:justify-end">
              <p className="max-w-sm text-sm text-white/80 sm:text-base lg:text-right">Hiring operations, rebuilt.</p>
            </div>
          </div>
          <div className="flex flex-grow flex-col items-center justify-center pb-20 text-center">
            <p className="mb-6 text-xs font-medium uppercase tracking-[0.2em] text-white/80 sm:text-sm">AI interview infrastructure for modern teams</p>
            <h1 className="flex flex-col items-center leading-[0.85] tracking-tighter text-5xl sm:text-6xl md:text-7xl lg:text-8xl xl:text-9xl">
              <span className="font-medium text-white">Scale With</span>
              <ShinyText text="AI Interviews." />
            </h1>
            <Link to="/register" className="no-underline">
              <button className="group mt-12 flex items-center gap-3 rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition-all hover:bg-gray-900 md:mt-16 md:px-8 md:py-4 md:text-base">
                Create Company Workspace
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1.5 md:h-5 md:w-5" />
              </button>
            </Link>
            <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="#pricing"
                className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-medium text-white transition-all hover:bg-white/15 md:px-8 md:py-4 md:text-base"
              >
                View Subscription Plans
              </a>
              <Link to="/login" className="no-underline">
                <button className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-medium text-white/90 transition-all hover:border-white/40 hover:text-white md:px-8 md:py-4 md:text-base">
                  Admin Login
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          LOWER SECTIONS — FULLY REDESIGNED
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden bg-slate-50 text-slate-900">
        <Blobs />

        {/* dot-grid overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(17,24,39,0.06)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:linear-gradient(180deg,rgba(0,0,0,0.6),transparent_80%)]" />

        <div className="relative z-10 mx-auto max-w-[1340px] px-5 py-16 sm:px-6 lg:px-8">

          {/* ── METRICS STRIP ──────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { icon: Users, label: "Teams onboarded", value: <><Counter to={840} />+</>, delay: 0, color: 'bg-indigo-500' },
              { icon: Eye, label: "Live sessions monitored", value: <><Counter to={12400} />+</>, delay: 0.1, color: 'bg-cyan-500' },
              { icon: BarChart3, label: "AI evaluations run", value: <><Counter to={98} />k+</>, delay: 0.2, color: 'bg-violet-500' },
              { icon: Clock, label: "Avg. time-to-shortlist", value: <><Counter to={4} />h</>, delay: 0.3, color: 'bg-pink-500' },
            ].map((s, i) => (
              <StatBadge key={i} icon={s.icon} label={s.label} value={s.value} delay={s.delay} color={s.color} />
            ))}
          </div>

          {/* ── MARQUEE ────────────────────────────────────────────────────── */}
          <div className="mt-10">
            <Marquee items={marqueeItems} />
          </div>

          {/* ── PLATFORM SECTION ───────────────────────────────────────────── */}
          <section id="platform" className="mt-20">
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-600 mb-6">
                <Zap className="h-3.5 w-3.5" /> Platform
              </div>
            </Reveal>
            <div className="mb-12 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
              <Reveal className="max-w-[650px]">
                <h2 className="text-4xl font-extrabold leading-none tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                  Built for the real
                  <br />
                  <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">recruiting workflow.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.15} direction="left" className="max-w-[460px]">
                <p className="leading-8 text-slate-500 text-base">
                  From tenant signup through candidate reporting — subscription, dashboard, email invites, interview runtime, and results all stay connected inside one coherent system.
                </p>
              </Reveal>
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-2 items-center">
              <DashboardShowcase src={aiDashboard} />

              <div className="grid gap-5">
                {/* live command center card */}
                <Reveal delay={0.1}>
                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-800 p-7 text-white shadow-[0_24px_60px_rgba(99,102,241,0.30)]"
                  >
                    <motion.div
                      className="absolute inset-0 opacity-30"
                      style={{ background: 'radial-gradient(ellipse at 80% 10%, rgba(100,206,251,0.4), transparent 55%)' }}
                      animate={{ opacity: [0.2, 0.4, 0.2] }}
                      transition={{ duration: 4, repeat: Infinity }}
                    />
                    <div className="relative z-10">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-2">Live hiring command center</div>
                          <h3 className="text-2xl font-extrabold tracking-tight">One console for interviews,<br />scheduling &amp; evaluation.</h3>
                        </div>
                        <motion.div
                          className="flex-shrink-0 rounded-full bg-green-400/20 px-3 py-1.5 text-xs font-bold text-green-300 ring-1 ring-green-400/30"
                          animate={{ opacity: [1, 0.6, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          ● Realtime
                        </motion.div>
                      </div>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {[
                          { label: 'Ongoing interviews', value: '12', note: 'Live sessions with AI prompts' },
                          { label: 'Shortlisted today', value: '07', note: 'Candidates cleared for next round' },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                            <div className="text-xs text-white/50">{item.label}</div>
                            <strong className="mt-2 block text-3xl tracking-tight">{item.value}</strong>
                            <p className="mt-1.5 text-xs text-white/50">{item.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                </Reveal>

                {/* 4-cell feature grid */}
                <Reveal delay={0.2}>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Interview creation", value: "Schedule + send", icon: "📅" },
                      { label: "Live monitoring", value: "WebRTC + snapshots", icon: "🎥" },
                      { label: "AI evaluation", value: "Transcript & scoring", icon: "🧠" },
                      { label: "Admin workflow", value: "Select, reject, archive", icon: "✅" },
                    ].map(({ label, value, icon }, i) => (
                      <motion.div
                        key={label}
                        whileHover={{ scale: 1.03, boxShadow: '0 12px 32px rgba(99,102,241,0.14)' }}
                        className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm transition-all duration-200"
                      >
                        <div className="mb-3 text-xl">{icon}</div>
                        <span className="block text-xs text-slate-400">{label}</span>
                        <strong className="mt-1 block text-sm font-bold tracking-tight text-slate-800">{value}</strong>
                      </motion.div>
                    ))}
                  </div>
                </Reveal>
              </div>
            </div>
          </section>

          {/* ── THREE PILLARS ───────────────────────────────────────────────── */}
          <section className="mt-24">
            <Reveal className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-violet-600">
                <Shield className="h-3.5 w-3.5" /> Architecture
              </div>
            </Reveal>
            <div className="mb-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
              <Reveal className="max-w-[580px]">
                <h2 className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                  Three layers working
                  <br />
                  <span className="bg-gradient-to-r from-violet-600 to-purple-400 bg-clip-text text-transparent">inside one system.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.15} direction="left" className="max-w-[420px]">
                <p className="leading-8 text-slate-500">Admin workspace, candidate experience, and monitoring controls connected so teams can scale without stitching tools together.</p>
              </Reveal>
            </div>
            <div className="grid gap-5 lg:grid-cols-3">
              {[
                ["Admin workflow", "Workspace-driven interview orchestration", "Create interviews, upload resumes, define scheduling windows, control email content, and manage candidate progression from a single admin console."],
                ["Candidate runtime", "Guided experience with timing & anti-cheating", "Candidates enter only through session links, start windows are respected, combining video, transcripts, coding, and AI-led prompts."],
                ["Recruiter insight", "Evaluation, live results & recording-backed review", "Watch live progress, inspect AI insights, score reports, shortlisted candidates, and recordings tied to each session."],
              ].map(([pill, title, copy], i) => (
                <FeatureCard key={pill} pill={pill} title={title} copy={copy} index={i} />
              ))}
            </div>
          </section>

          {/* ── WORKFLOW SECTION ────────────────────────────────────────────── */}
          <section id="workflow" className="mt-24">
            <Reveal className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-cyan-600">
                <ArrowRight className="h-3.5 w-3.5" /> Workflow
              </div>
            </Reveal>
            <div className="mb-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
              <Reveal className="max-w-[600px]">
                <h2 className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                  A cleaner onboarding path
                  <br />
                  <span className="bg-gradient-to-r from-cyan-600 to-blue-500 bg-clip-text text-transparent">for growing companies.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.15} direction="left" className="max-w-[400px]">
                <p className="leading-8 text-slate-500">The subscription journey ends in a proper workspace registration screen with Razorpay checkout for paid tiers.</p>
              </Reveal>
            </div>
            <Reveal>
              <motion.div
                whileHover={{ scale: 1.005 }}
                className="relative overflow-hidden rounded-[32px] border border-slate-200/60 bg-white p-2 shadow-[0_24px_80px_rgba(17,24,39,0.10)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/60 via-transparent to-cyan-50/40 rounded-[32px] pointer-events-none" />
                <img src={onboardingFlow} alt="Onboarding Flow" className="relative z-10 mx-auto block w-full max-w-[800px] rounded-2xl" />
              </motion.div>
            </Reveal>
          </section>

          {/* ── PRICING ─────────────────────────────────────────────────────── */}
          <section id="pricing" className="mt-24">
            <Reveal className="mb-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-indigo-600">
                💳 Pricing
              </div>
            </Reveal>
            <div className="mb-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
              <Reveal className="max-w-[640px]">
                <h2 className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
                  Plans that match your
                  <br />
                  <span className="bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent">interview operations.</span>
                </h2>
              </Reveal>
              <Reveal delay={0.15} direction="left" className="max-w-[420px]">
                <p className="leading-8 text-slate-500">Every plan is wired into the same admin dashboard. The difference is how much you automate from day one.</p>
              </Reveal>
            </div>

            {loading && (
              <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <RefreshCw size={24} className="text-indigo-500" />
                </motion.div>
                <span className="font-medium">Loading plans…</span>
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-red-100 bg-red-50 py-12 text-center font-medium text-red-500">{error}</div>
            )}

            {!loading && !error && (
              <div className="grid gap-5 lg:grid-cols-3">
                {plans.map((plan, index) => {
                  const isFeatured = plan.price > 0 && index === 1
                  return (
                    <PricingCard
                      key={getPlanName(plan)}
                      plan={plan}
                      index={index}
                      isFeatured={isFeatured}
                      badge={getPlanBadge(plan, index)}
                      formatPrice={formatPrice}
                    />
                  )
                })}
              </div>
            )}

            {/* CTA Banner */}
            <Reveal className="mt-8">
              <motion.div
                whileHover={{ scale: 1.008 }}
                className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 p-8 text-white shadow-[0_32px_80px_rgba(99,102,241,0.30)] sm:p-10"
              >
                <motion.div
                  className="absolute -right-20 -top-20 h-72 w-72 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(100,206,251,0.20), transparent 60%)' }}
                  animate={{ scale: [1, 1.2, 1], rotate: [0, 15, 0] }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                  className="absolute bottom-0 left-1/4 h-48 w-48 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.2), transparent 60%)' }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
                />
                <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
                      Ready for a faster
                      <br />path to deployment?
                    </h3>
                    <p className="mt-3 max-w-[520px] leading-7 text-white/65 text-sm">
                      Register your workspace, pick a plan, and activate your interview dashboard — no separate billing handoff required.
                    </p>
                  </div>
                  <Link to="/register" className="no-underline flex-shrink-0">
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 rounded-2xl bg-white px-7 py-4 text-sm font-bold text-slate-900 shadow-lg hover:bg-slate-50 transition-colors"
                    >
                      Open Subscription Page <ArrowRight className="h-4 w-4" />
                    </motion.button>
                  </Link>
                </div>
              </motion.div>
            </Reveal>
          </section>

          {/* ── FOOTER ──────────────────────────────────────────────────────── */}
          <footer className="mt-16 flex flex-col justify-between gap-4 border-t border-slate-900/8 pt-7 text-sm text-slate-400 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Hire IQ" className="h-5 w-auto opacity-50" />
              <span>Hire IQ — AI-powered recruiting infrastructure.</span>
            </div>
            <div className="flex flex-wrap items-center gap-5 font-medium">
              <Link to="/register" className="hover:text-slate-700 transition-colors">Subscription</Link>
              <Link to="/login" className="hover:text-slate-700 transition-colors">Admin Login</Link>
            </div>
          </footer>

        </div>
      </div>
    </main>
  )
}

export default LandingPage