import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_BASE_URL } from "../apiConfig";
import {
  Sparkles,
  ArrowRight,
  PlayCircle,
  Users,
  Gauge,
  Database,
  FileText,
  Award,
  BarChart3,
  Briefcase,
  CheckCircle2,
  TrendingUp,
  ChevronDown,
  Eye,
  Clock,
  Shield,
  ArrowUpRight,
  RefreshCw,
  Menu,
  X
} from "lucide-react";
import {
  motion,
  useMotionValue,
  useSpring,
  useScroll,
  useTransform,
  useInView,
  animate,
  AnimatePresence
} from "framer-motion";

// Import local assets
import logo from "../assets/logo.png";
import aiDashboard from "../assets/ai_dashboard.png";
import onboardingFlow from "../assets/onboarding_flow.png";
import heroVideo from "../assets/hero-page-bg.mp4";

// ==========================================
// 1. UTILS & TRANSITIONS HELPERS
// ==========================================

function cn(...inputs) {
  return inputs.filter(Boolean).join(" ");
}

const motionVariants = {
  up: { hidden: { opacity: 0, y: 28, filter: "blur(8px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)" } },
  left: { hidden: { opacity: 0, x: -40 }, show: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: 40 }, show: { opacity: 1, x: 0 } },
  scale: { hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } },
  blur: { hidden: { opacity: 0, filter: "blur(14px)" }, show: { opacity: 1, filter: "blur(0px)" } },
};

function Reveal({ children, variant = "up", delay = 0, className }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={motionVariants[variant]}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

// ==========================================
// 2. UI BASE COMPONENTS (NATIVE & RADIX-FREE)
// ==========================================

function Button({ children, className, variant = "default", size = "default", onClick, type = "button", disabled, ...props }) {
  const baseStyle = "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold cursor-pointer transition-all duration-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

  const variants = {
    default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
    outline: "border border-primary/20 bg-white/5 hover:bg-white/10 text-white",
    secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
    ghost: "hover:bg-white/5 hover:text-white text-muted-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };

  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(baseStyle, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

function Input({ className, type = "text", ...props }) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-white/10 bg-white/5 px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 text-white",
        className
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }) {
  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 text-white",
        className
      )}
      {...props}
    />
  );
}

// Native Accordion
function Accordion({ children, className }) {
  const [active, setActive] = useState(null);
  return (
    <div className={cn("divide-y divide-white/10", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return null;
        return React.cloneElement(child, {
          isOpen: active === child.props.value,
          onToggle: () => setActive(active === child.props.value ? null : child.props.value),
        });
      })}
    </div>
  );
}

function AccordionItem({ children, isOpen, onToggle, className }) {
  return (
    <div className={cn("border-b border-white/10", className)}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return null;
        return React.cloneElement(child, { isOpen, onToggle });
      })}
    </div>
  );
}

function AccordionTrigger({ children, isOpen, onToggle, className }) {
  return (
    <button
      onClick={onToggle}
      className={cn("flex w-full items-center justify-between py-4 font-semibold text-left text-white transition-all hover:underline cursor-pointer", className)}
    >
      {children}
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform duration-200", isOpen && "rotate-180")} />
    </button>
  );
}

function AccordionContent({ children, isOpen, className }) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className={cn("overflow-hidden text-sm text-muted-foreground pb-4", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ==========================================
// 3. BRAND LAYOUTS (STATIC PLATFORM EDITION)
// ==========================================

function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[#020204]" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(40,90,220,0.18),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_85%_110%,rgba(56,189,248,0.10),transparent_60%)]" />
      <div className="absolute -inset-40 bg-grid opacity-35 [mask-image:radial-gradient(70%_55%_at_50%_40%,black_45%,transparent_85%)]" />

      <div
        aria-hidden
        className="absolute -top-40 -left-40 h-[60vw] w-[60vw] rounded-full blur-[120px] opacity-60"
        style={{ background: "radial-gradient(circle, rgba(40,90,220,0.22), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-40 -right-40 h-[55vw] w-[55vw] rounded-full blur-[120px] opacity-55"
        style={{ background: "radial-gradient(circle, rgba(56,189,248,0.15), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="absolute top-1/3 left-1/2 h-[40vw] w-[40vw] -translate-x-1/2 rounded-full blur-[140px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.10), transparent 70%)" }}
      />

      <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_50%,transparent_55%,rgba(2,2,4,0.9)_100%)]" />
    </div>
  );
}

function SiteHeader() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="fixed top-4 inset-x-0 z-50 flex justify-center px-4">
      <div className="relative w-full max-w-6xl">
        <div className="glass-strong w-full rounded-full px-3 py-2 flex items-center justify-between gap-3 relative z-50">
          {/* Left Group: Logo */}
          <Link to="/" className="flex flex-col items-start pl-2 no-underline" onClick={() => setIsOpen(false)}>
            <img src={logo} alt="Hire IQ Logo" className="h-7 w-auto object-contain" />
            <span className="text-[8px] pt-1 pl-2 uppercase tracking-[0.18em] text-muted-foreground font-semibold mt-0.5 leading-none">
              AI Powered Interview
            </span>
          </Link>

          {/* Center Group: Navigation Links (Desktop Only) */}
          <nav className="desktop-only items-center gap-1.5 md:gap-3 text-xs md:text-sm text-muted-foreground mx-auto">
            <a href="#platform" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">Platform</a>
            <a href="#workflow" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">Workflow</a>
            <a href="#pricing" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">Pricing</a>
            <a href="#faq" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">FAQ</a>
          </nav>

          {/* Right Group: Action buttons (Desktop Only) */}
          <div className="desktop-only items-center gap-2">
            <Link to="/login"><Button variant="ghost" size="sm" className="rounded-full">Sign in</Button></Link>
            <a href="#contact"><Button size="sm" className="rounded-full bg-gradient-to-r from-primary to-violet text-white hover:opacity-90">Book demo</Button></a>
          </div>

          {/* Hamburger toggle button (Mobile Only) */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="mobile-only p-2 text-muted-foreground hover:text-white transition-colors cursor-pointer"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile Navigation Dropdown Menu */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="absolute top-full left-0 right-0 mt-2 glass-strong border border-white/10 rounded-2xl p-5 flex flex-col gap-4 z-40 mobile-only"
            >
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground font-semibold">
                <a href="#platform" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">Platform</a>
                <a href="#workflow" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">Workflow</a>
                <a href="#pricing" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">Pricing</a>
                <a href="#faq" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">FAQ</a>
              </nav>
              <div className="h-px bg-white/10 w-full" />
              <div className="flex flex-col gap-2.5">
                <Link to="/login" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full rounded-xl py-2">Sign in</Button>
                </Link>
                <a href="#contact" onClick={() => setIsOpen(false)}>
                  <Button className="w-full rounded-xl bg-gradient-to-r from-primary to-violet text-white hover:opacity-90 py-2">Book demo</Button>
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="relative mt-32 border-t border-border/50">
      <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="mx-auto max-w-6xl px-6 py-14 grid gap-10 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid place-items-center h-9 w-9 rounded-full bg-gradient-to-br from-primary to-violet shadow-[0_0_20px_rgba(168,85,247,0.55)]">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <div>
              <p className="font-semibold text-white">Hire IQ</p>
              <p className="text-xs text-muted-foreground font-semibold">
                AI Powered Interview
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-xs">
            AI interview infrastructure for modern engineering & talent teams.
          </p>
        </div>
        {[
          { t: "Product", l: ["Platform", "Workflow", "Pricing"] },
          { t: "Company", l: ["About", "Careers", "Blog", "Contact"] },
          { t: "Legal", l: ["Privacy", "Terms", "Security"] },
        ].map((c) => (
          <div key={c.t}>
            <p className="text-sm font-semibold mb-3 text-white">{c.t}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {c.l.map((x) => <li key={x}><a href="#" className="hover:text-foreground no-underline text-muted-foreground">{x}</a></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} Hire IQ. All rights reserved.</p>
          <p className="font-mono">v1.0 — built for the future of hiring.</p>
        </div>
      </div>
    </footer>
  );
}

function RobotMascot() {
  const ref = useRef(null);
  const [eyes, setEyes] = useState({ x: 0, y: 0 });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = (e) => {
      if (!ref.current) return;
      const r = ref.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / 60;
      const dy = (e.clientY - cy) / 60;
      setEyes({ x: Math.max(-3, Math.min(3, dx)), y: Math.max(-3, Math.min(3, dy)) });
    };
    window.addEventListener("mousemove", handle);
    return () => window.removeEventListener("mousemove", handle);
  }, []);

  return (
    <motion.div
      ref={ref}
      onClick={() => setOpen((v) => !v)}
      className="fixed bottom-6 right-6 z-[60] cursor-pointer select-none"
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      <div className="relative h-20 w-20">
        <div className="absolute inset-0 rounded-2xl blur-2xl bg-primary/40 animate-pulse-glow" />
        <div className="absolute left-1/2 -top-3 -translate-x-1/2 h-3 w-[3px] bg-primary rounded-full" />
        <div className="absolute left-1/2 -top-5 -translate-x-1/2 h-2 w-2 rounded-full bg-cyan shadow-[0_0_10px_var(--cyan)] animate-breathe" />
        <div className="relative z-10 h-[68px] w-[68px] mx-auto rounded-2xl glass-strong border border-primary/40 flex items-center justify-center gap-2 animate-breathe">
          <span
            className="block h-3 w-3 rounded-full bg-cyan shadow-[0_0_10px_var(--cyan)] transition-transform"
            style={{ transform: `translate(${eyes.x}px, ${eyes.y}px)` }}
          />
          <span
            className="block h-3 w-3 rounded-full bg-cyan shadow-[0_0_10px_var(--cyan)] transition-transform"
            style={{ transform: `translate(${eyes.x}px, ${eyes.y}px)` }}
          />
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-end gap-[2px] h-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="block w-[2px] bg-primary rounded-full"
                style={{
                  height: `100%`,
                  animation: `voice-wave 0.9s ease-in-out ${i * 0.12}s infinite`,
                  transformOrigin: "bottom",
                }}
              />
            ))}
          </div>
        </div>
        {open && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="absolute bottom-[110%] right-0 w-60 rounded-2xl glass-strong p-3 text-xs border border-white/10 text-white">
            <p className="font-semibold text-gradient-purple">
              Hire IQ AI Powered Interview Bot
            </p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              I can run live coding rounds, analyze test cases, and sync with your ATS automatically. Shall we begin?
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ==========================================
// 4. SECTION COMPONENTS (SHARED)
// ==========================================

function Hero() {
  const sectionRef = useRef(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 18 });
  const sy = useSpring(my, { stiffness: 50, damping: 18 });

  useEffect(() => {
    const h = (e) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 28);
      my.set((e.clientY / window.innerHeight - 0.5) * 28);
    };
    window.addEventListener("mousemove", h);
    return () => window.removeEventListener("mousemove", h);
  }, [mx, my]);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const textY = useTransform(scrollYProgress, [0, 1], [0, 160]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  const textBlur = useTransform(scrollYProgress, [0, 0.7], ["blur(0px)", "blur(8px)"]);
  const haloScale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);

  return (
    <section ref={sectionRef} className="relative min-h-screen pt-36 pb-24 overflow-hidden flex items-center">
      <div className="absolute inset-0 -z-0 overflow-hidden">
        <video
          src={heroVideo}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,2,4,0.7)_55%,#020204_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#020204]/85 via-[#020204]/40 to-[#020204]" />
      </div>

      <motion.div
        style={{ scale: haloScale }}
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[760px] w-[760px]"
        aria-hidden
      >
        <div className="absolute inset-0 rounded-full border border-primary/15 animate-spin-slow" />
        <div className="absolute inset-10 rounded-full border border-cyan/15 animate-spin-rev" />
        <div className="absolute inset-24 rounded-full border border-violet/10 animate-spin-slow" style={{ animationDuration: "44s" }} />
        <div className="absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 h-24 w-24 rounded-full bg-primary/10 animate-pulse-glow" />
      </motion.div>

      <div className="relative mx-auto max-w-5xl px-6 text-center z-10">
        <motion.div style={{ y: textY, opacity: textOpacity, filter: textBlur }} className="will-change-transform">

          {/* Dual Toggle Buttons in Hero */}
          <div className="flex items-center justify-center gap-3 mb-10">
            <Link to="/voice-recruiter">
              <button
                className="px-6 py-2.5 rounded-full text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer border flex items-center gap-2 bg-white/5 text-muted-foreground border-white/5 hover:text-white hover:bg-white/10"
              >
                🎤 AI Voice Recruiter
              </button>
            </Link>
            <button
              className="px-6 py-2.5 rounded-full text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer border flex items-center gap-2 bg-gradient-to-r from-violet to-cyan text-white border-violet/50 shadow-lg shadow-violet/25 scale-105"
            >
              💻 AI Powered Interview
            </button>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-violet animate-pulse" />
            <Sparkles className="h-3.5 w-3.5 text-cyan" />
            AI Coding &amp; Case Studies
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.02] tracking-tight text-white">
            Scale With <br />
            <span className="text-gradient-purple">AI Adaptive Interviews.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Create scheduled interview links, evaluate candidates with AI-generated adaptive coding challenges,
            and monitor WebRTC session snapshots from one workspace.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register">
              <Button size="lg" className="rounded-full bg-gradient-to-r from-violet to-cyan text-white hover:opacity-95 glow-blue border-none">
                Create Workspace <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#platform">
              <Button size="lg" variant="outline" className="rounded-full border-violet/40 bg-white/5 hover:bg-white/10">
                Explore Platform <PlayCircle className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto text-center">
            {[
              { v: "840+", l: "Teams onboarded" },
              { v: "98k+", l: "AI evaluations run" },
              { v: "4h", l: "Time-to-shortlist" },
            ].map((s, i) => (
              <motion.div
                key={s.l}
                initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, delay: 0.7 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="glass rounded-2xl p-2.5 sm:p-4 border border-white/5"
              >
                <p className="text-lg sm:text-2xl font-semibold text-gradient-purple">{s.v}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-1 font-medium">{s.l}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function TrustedBy() {
  const hireIqLogos = ["AI Interview Engine", "Live Session Monitoring", "WebRTC Capture", "Candidate Scoring", "Auto-Shortlisting", "Resume Parsing", "Razorpay Checkout", "Email Scheduling", "Workspace Management"];

  return (
    <section className="relative py-16 border-y border-white/5 bg-card/30">
      <p className="text-center text-xs uppercase tracking-[0.3em] text-muted-foreground font-semibold">Powering hiring infrastructure including</p>
      <div className="mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
        <div className="flex gap-16 animate-marquee whitespace-nowrap w-max">
          {[...hireIqLogos, ...hireIqLogos].map((l, i) => (
            <span key={i} className="text-xl font-display font-semibold text-muted-foreground/70 hover:text-white transition cursor-default">{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 5. PRODUCT 2: HIREIQ PLATFORM SECTIONS
// ==========================================

function HireIQMetrics() {
  return (
    <section className="relative py-20 bg-card/20 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        {[
          { icon: Users, label: "Teams onboarded", value: "840+", color: "text-primary bg-primary/10 border-primary/20" },
          { icon: Eye, label: "Live sessions", value: "12,400+", color: "text-cyan bg-cyan/10 border-cyan/20" },
          { icon: BarChart3, label: "AI evaluations", value: "98k+", color: "text-violet bg-violet/10 border-violet/20" },
          { icon: Clock, label: "Avg. shortlist time", value: "4h", color: "text-pink-500 bg-pink-500/10 border-pink-500/20" },
        ].map((s, i) => (
          <Reveal key={i} delay={i * 0.08}>
            <div className="glass rounded-2xl p-5 border border-white/5 flex items-center gap-4 card-premium hover:-translate-y-1 hover:border-white/20">
              <span className={cn("grid place-items-center h-10 w-10 rounded-xl border", s.color)}>
                <s.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-semibold tracking-tight text-gradient">{s.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5 font-medium">{s.label}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function HireIQFeatures() {
  return (
    <section id="platform" className="relative py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 grid lg:grid-cols-2 gap-8 items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan font-bold">Platform</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight text-white">
              Built for the real <br />
              <span className="text-gradient">recruiting workflow.</span>
            </h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg">
            From tenant signup through candidate reporting — subscription, dashboard, email invites, interview runtime, and results all stay connected inside one coherent system.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-center">
          <Reveal>
            <div className="relative group rounded-2xl border border-white/15 bg-white/5 p-2 shadow-2xl overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 via-transparent to-cyan/10 pointer-events-none" />
              <img
                src={aiDashboard}
                alt="AI Hiring Dashboard"
                className="w-full h-auto object-cover rounded-xl"
              />
              <div className="absolute -top-3 -right-3 glass-strong rounded-xl border border-emerald/30 px-3 py-2 text-[11px] font-semibold text-emerald shadow-lg animate-bounce" style={{ animationDuration: "3s" }}>
                ✓ AI Scored · 94%
              </div>
              <div className="absolute -bottom-3 -left-3 glass-strong rounded-xl border border-cyan/30 px-3 py-2 text-[11px] font-semibold text-cyan shadow-lg animate-bounce" style={{ animationDuration: "4s" }}>
                ↗ 12 Live Sessions
              </div>
            </div>
          </Reveal>

          <div className="space-y-6">
            <Reveal delay={0.1}>
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#060a12]/80 to-[#100f24]/80 p-6 shadow-xl text-white">
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center h-9 w-9 rounded-xl bg-violet/10 border border-violet/30 text-violet">
                    <Database className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="font-semibold text-sm">Tenant database isolation</h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Each subscription initializes a clean tenant database workspace. Candidate data, interview schedules, and test answers are completely partitioned for compliance.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#060a12]/80 to-[#100f24]/80 p-6 shadow-xl text-white">
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center h-9 w-9 rounded-xl bg-cyan/10 border border-cyan/30 text-cyan">
                    <Shield className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="font-semibold text-sm">Full WebRTC Monitoring</h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Our interview window records candidate screens, handles real-time video snapshots, tracks tab focus switches, and logs copy-paste events to ensure exam integrity.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.25}>
              <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-[#060a12]/80 to-[#100f24]/80 p-6 shadow-xl text-white">
                <div className="flex items-center gap-3">
                  <span className="grid place-items-center h-9 w-9 rounded-xl bg-emerald/10 border border-emerald/30 text-emerald">
                    <RefreshCw className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="font-semibold text-sm">Automated scoring & sync</h3>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  AI executes compilation tests, checks case output constraints, scores descriptive items based on customizable weight rubrics, and pushes records directly to your ATS webhooks.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function HireIQThreePillars() {
  const cards = [
    {
      step: "01",
      badge: "Pre-Assessment",
      title: "Invite and schedule with automated triggers",
      desc: "Upload candidates to your job boards or import them from ATS. The system fires customizable email sequences containing unique WebRTC tokens.",
      metrics: ["Razorpay integration", "Plan-enforced caps", "Automatic reminders"]
    },
    {
      step: "02",
      badge: "Interview Runtime",
      title: "Multi-language editor & cheating detection",
      desc: "Candidates write code inside our sandbox terminal. The framework monitors camera/microphone feed snapshots and locks down standard clipboard hotkeys.",
      metrics: ["WebRTC snapshots", "Anti-cheat metrics", "Sandbox compilation"]
    },
    {
      step: "03",
      badge: "Post-Assessment",
      title: "Score matching matrices & reviewer dashboard",
      desc: "Our reviewer cockpit details every evaluation, logs cheat violations, allows manual grade overrides, and triggers webhooks to sync status.",
      metrics: ["Rubric parsing", "Webhook triggers", "Score reports"]
    }
  ];

  return (
    <section className="relative py-24 bg-card/10">
      <div className="mx-auto max-w-6xl px-6">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <p className="text-xs uppercase tracking-[0.3em] text-violet font-bold">Architecture</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold text-white">
            The three pillars of <span className="text-gradient-purple font-bold">interview operations</span>.
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <Reveal key={c.step} delay={Number(c.step) * 0.08}>
              <div className="glass rounded-3xl p-6 border border-white/5 h-full flex flex-col justify-between hover:border-violet/40 card-premium">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-mono text-violet font-bold">{c.badge}</span>
                    <span className="text-3xl font-extrabold text-white/10 font-mono">{c.step}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-white leading-tight">{c.title}</h3>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{c.desc}</p>
                </div>
                <div className="mt-6">
                  <div className="h-px bg-white/10 w-full mt-6" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function HireIQWorkflow() {
  return (
    <section id="workflow" className="relative py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 grid lg:grid-cols-2 gap-8 items-end">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan font-bold">Workflow</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight text-white">
              A cleaner onboarding path <br />
              <span className="text-gradient font-bold">for growing companies.</span>
            </h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg">
            The subscription journey ends in a proper workspace registration screen with Razorpay checkout for paid tiers.
          </p>
        </div>

        <Reveal>
          <div className="relative group rounded-3xl border border-white/15 bg-white/5 p-4 shadow-2xl overflow-hidden max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 rounded-3xl pointer-events-none" />
            <img
              src={onboardingFlow}
              alt="Workspace Onboarding Flow"
              className="w-full h-auto object-cover rounded-2xl max-w-3xl mx-auto"
            />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const fallbackPlans = [
  {
    plan_name: "Free Trial",
    price: 0,
    credits: 5,
    duration_days: 7,
    features: [
      "1 Recruiter Seat",
      "5 Candidate Interviews",
      "WebRTC recording",
      "Standard scoring rubric",
      "Email support"
    ]
  },
  {
    plan_name: "Basic",
    price: 9999,
    credits: 100,
    duration_days: 30,
    features: [
      "3 Recruiter Seats",
      "100 Candidate Interviews",
      "Live session monitoring",
      "Custom evaluation criteria",
      "Greenhouse / Lever ATS sync",
      "Priority email support"
    ]
  },
  {
    plan_name: "Premium",
    price: 24999,
    credits: 300,
    duration_days: 30,
    features: [
      "8 Recruiter Seats",
      "300 Candidate Interviews",
      "Full WebRTC snapshot audits",
      "Anti-cheating webhook logs",
      "Dedicated account manager",
      "24/7 Slack & Phone support"
    ]
  }
];

const planOrder = {
  "Free Trial": 0,
  "Basic": 1,
  "Premium": 2
};

function HireIQPricing() {
  const [plans, setPlans] = useState(fallbackPlans);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPlans() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/tenants/plans/`);
        if (!response.ok) throw new Error("API error status: " + response.status);
        const data = await response.json();

        const normalizePlan = (p) => ({
          plan_name: p.name || p.plan_name,
          price: p.price,
          credits: p.credits,
          duration_days: p.duration_days,
          features: Array.isArray(p.features) ? p.features : (p.features ? p.features.split(",") : [])
        });

        const sortedPlans = (data.plans || data)
          .map(normalizePlan)
          .sort((a, b) => (planOrder[a.plan_name] ?? 999) - (planOrder[b.plan_name] ?? 999));

        if (sortedPlans.length > 0) {
          setPlans(sortedPlans);
        } else {
          setPlans(fallbackPlans);
        }
      } catch (err) {
        console.warn("Could not fetch plans from API, falling back to mock plans:", err);
        setPlans(fallbackPlans);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  const formatPrice = (price) => {
    const n = Number(price || 0);
    return n === 0 ? "Free" : `Rs. ${n.toLocaleString("en-IN")}`;
  };

  return (
    <section id="pricing" className="relative py-24 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 grid lg:grid-cols-2 gap-8 items-end text-left">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold">Pricing</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight text-white">
              Plans that match your <br />
              <span className="text-gradient-purple font-bold">interview operations.</span>
            </h2>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-lg">
            Every plan is wired into the same admin dashboard. The difference is how much you automate from day one.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
            <span className="h-4 w-4 rounded-full border-2 border-slate-500 border-t-transparent animate-spin" /> Loading plans...
          </div>
        )}

        {!loading && (
          <div className="grid md:grid-cols-3 gap-6 items-stretch">
            {plans.map((p) => {
              const isFeatured = p.plan_name.toLowerCase().includes("basic") || p.plan_name.toLowerCase().includes("premium") && plans.length > 1;
              return (
                <Reveal key={p.plan_name}>
                  <div className={cn(
                    "glass rounded-3xl p-6 h-full flex flex-col justify-between border relative overflow-hidden transition-all duration-300 hover:-translate-y-1.5",
                    isFeatured ? "border-primary/50 shadow-[0_20px_50px_-12px_rgba(168,85,247,0.22)] bg-gradient-to-br from-[#0c0a1a]/95 to-[#06050e]/95" : "border-white/5 hover:border-white/10"
                  )}>
                    {isFeatured && (
                      <span className="absolute top-3 right-3 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 tracking-wider uppercase">
                        Most Popular
                      </span>
                    )}

                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-bold text-white tracking-tight">{p.plan_name}</h3>
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{p.duration_days} Days Validity</span>
                        </div>
                        <span className={cn(
                          "rounded-full px-2.5 py-0.5 text-[10px] font-bold border tracking-wider",
                          isFeatured ? "bg-violet/10 border-violet/20 text-violet" : "bg-white/5 border-white/10 text-muted-foreground"
                        )}>
                          ⚡ {p.credits} Credits
                        </span>
                      </div>

                      <div className="mt-5 flex items-baseline">
                        <span className="text-3xl font-extrabold tracking-tight text-gradient">{formatPrice(p.price)}</span>
                        {p.price > 0 && <span className="text-xs text-muted-foreground ml-1">/sub</span>}
                      </div>

                      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                        {p.price === 0
                          ? "Try the full platform free. No credit card needed."
                          : `Scale your hiring with our high-throughput ${p.plan_name.toLowerCase()} capabilities.`}
                      </p>

                      <div className="h-px bg-white/10 w-full my-5" />

                      <ul className="space-y-2 text-xs text-muted-foreground font-medium">
                        {(p.features || []).map((f, i) => (
                          <li key={i} className="flex items-center gap-2">
                            <span className="text-emerald text-sm">✓</span>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-8 pt-4 border-t border-white/5">
                      <Link to={`/register?plan=${encodeURIComponent(p.plan_name)}`} className="block w-full">
                        <Button className={cn("w-full rounded-xl cursor-pointer", isFeatured ? "bg-gradient-to-r from-primary to-blue text-white hover:opacity-95 border-none shadow-md" : "bg-white/10 hover:bg-white/15 text-white border-none")}>
                          {p.price === 0 ? "Start Free Trial" : "Choose This Plan"}
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}

        {/* CTA Banner */}
        <Reveal delay={0.2}>
          <div className="mt-12 relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-[#0c0b1e]/90 to-[#100f24]/90 p-8 text-white shadow-2xl">
            <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.15),transparent_60%)] pointer-events-none animate-fog" />
            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
              <div>
                <h3 className="text-2xl font-extrabold tracking-tight leading-none">
                  Ready for a faster <br />
                  <span className="text-gradient">path to deployment?</span>
                </h3>
                <p className="mt-3 max-w-[520px] text-xs leading-relaxed text-muted-foreground">
                  Register your workspace, pick a plan, and activate your interview dashboard — no separate billing handoff required.
                </p>
              </div>
              <Link to="/register" className="flex-shrink-0">
                <Button className="rounded-2xl bg-white text-black hover:bg-slate-50 font-bold px-6 py-5 flex items-center gap-2 cursor-pointer shadow-lg shadow-white/10 border-none">
                  Open Workspace <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FAQ() {
  const faqs = [
    ["How does the anti-cheating system work?", "We record video snapshots and tabs status via WebRTC in real time, and flag suspicious actions like tab switching or copying pasting using our adaptive detection engine."],
    ["Can candidates write and execute code?", "Yes! Our platform supports multiple languages (Python, JavaScript, Java, C++, Go) with a fully integrated code editor and automatic test case execution."],
    ["What are the credits used for?", "Each candidate session (either coding round, case study, or standard technical interview) consumes 1 credit point."],
    ["Can we define custom rubrics?", "Absolutely. You can define specific weights, skills, and coding rubrics for each workspace/job role."],
    ["How do you score case study rounds?", "We parse the text response, draft layout, and coding structure, and compare them using specialized LLM scoring pipelines trained on senior developer rubrics."]
  ];

  return (
    <section id="faq" className="relative py-28 border-t border-white/5">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <h2 className="text-center text-4xl md:text-5xl font-semibold text-white">Frequently asked.</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <Accordion className="mt-10 glass rounded-2xl px-2 border border-white/5">
            {faqs.map(([q, a], i) => (
              <AccordionItem key={i} value={`f${i}`} className="border-white/10 text-white">
                <AccordionTrigger className="px-4 text-left text-white hover:text-primary">{q}</AccordionTrigger>
                <AccordionContent className="px-4">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

function Contact() {
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    await new Promise((r) => setTimeout(r, 650));
    setSending(false);
    setSubmitted(true);
    e.target.reset();
  };

  return (
    <section id="contact" className="relative py-28 bg-card/30 border-y border-white/5">
      <div className="mx-auto max-w-3xl px-6">
        <Reveal>
          <h2 className="text-center text-4xl md:text-5xl font-semibold text-white">Request a <span className="text-gradient-purple font-bold">Demo</span>.</h2>
          <p className="text-center text-muted-foreground mt-3">See how to schedule, host, and grade technical coding interviews automatically.</p>
        </Reveal>
        <Reveal delay={0.1}>
          {submitted ? (
            <div className="mt-10 glass-strong rounded-3xl p-8 border border-emerald/20 text-center">
              <span className="text-4xl">🎉</span>
              <h3 className="text-xl font-bold mt-3 text-emerald">Thank you!</h3>
              <p className="text-muted-foreground text-sm mt-2 leading-relaxed">
                Thanks — our team will reach out within one business day.
              </p>
              <Button onClick={() => setSubmitted(false)} className="mt-6 rounded-full bg-white/10 hover:bg-white/15 text-white border-none">
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-10 glass-strong rounded-3xl p-6 grid gap-4 sm:grid-cols-2 border border-white/10">
              <Input required name="name" placeholder="Full name" className="bg-card/50" />
              <Input required type="email" name="email" placeholder="Work email" className="bg-card/50" />
              <Input name="company" placeholder="Company" className="sm:col-span-2 bg-card/50" />
              <Textarea name="message" placeholder="What technical roles do you hire for?" className="sm:col-span-2 min-h-28 bg-card/50" />
              <Button type="submit" disabled={sending} className="sm:col-span-2 rounded-full bg-gradient-to-r from-primary to-violet text-white border-none">
                {sending ? "Sending..." : "Request trial access"}
              </Button>
            </form>
          )}
        </Reveal>
      </div>
    </section>
  );
}

// ==========================================
// 6. MAIN PAGE COORDINATOR
// ==========================================

function LandingPage() {
  useEffect(() => {
    document.title = "Hire IQ — AI Powered Interview";

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = "AI Powered Interview platform for modern teams. Schedule coding & case study rounds, automatically execute and score tests with WebRTC monitoring.";
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020204] text-foreground">
      <BackgroundFX />
      <SiteHeader />
      <main className="relative">
        <Hero />
        <TrustedBy />
        <HireIQMetrics />
        <HireIQFeatures />
        <HireIQThreePillars />
        <HireIQWorkflow />
        <HireIQPricing />
        <FAQ />
        <Contact />
      </main>
      <SiteFooter />
      <RobotMascot />
    </div>
  );
}

export default LandingPage;