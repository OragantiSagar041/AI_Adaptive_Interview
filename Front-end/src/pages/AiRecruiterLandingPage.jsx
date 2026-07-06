import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Mic,
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
  Upload,
  PhoneCall,
  MessagesSquare,
  CheckCircle2,
  Star,
  TrendingUp,
  ChevronDown,
  Eye,
  Clock,
  ArrowUpRight,
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
import robotAsset from "../assets/ai-interviewer.jpeg";
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
// 3. BRAND LAYOUTS (STATIC RECRUITER EDITION)
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
              AI Voice Recruiter
            </span>
          </Link>

          {/* Center Group: Navigation Links (Desktop Only) */}
          <nav className="desktop-only items-center gap-1.5 md:gap-3 text-xs md:text-sm text-muted-foreground mx-auto">
            <a href="#features" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">Features</a>
            <a href="#how" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">How it works</a>
            <a href="#dashboard" className="px-3 py-1.5 rounded-full hover:text-foreground hover:bg-white/5 transition no-underline">Dashboard</a>
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
                <a href="#features" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">Features</a>
                <a href="#how" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">How it works</a>
                <a href="#dashboard" onClick={() => setIsOpen(false)} className="px-3 py-2 rounded-xl hover:text-white hover:bg-white/5 transition no-underline">Dashboard</a>
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
              <Mic className="h-4 w-4 text-white" />
            </span>
            <div>
              <p className="font-semibold text-white">Hire IQ</p>
              <p className="text-xs text-muted-foreground font-semibold">
                AI Voice Recruiter
              </p>
            </div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground max-w-xs">
            Automate candidate screening with human-like AI voice interviews.
          </p>
        </div>
        {[
          { t: "Product", l: ["Features", "Dashboard", "Changelog"] },
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
              Hire IQ AI Voice Recruiter
            </p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              I'm ready to conduct candidate phone screenings 24/7. Shall we book a demo?
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
            <button
              className="px-6 py-2.5 rounded-full text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer border flex items-center gap-2 bg-gradient-to-r from-primary to-blue text-white border-primary/50 shadow-lg shadow-primary/25 scale-105"
            >
              🎤 AI Voice Recruiter
            </button>
            <Link to="/">
              <button
                className="px-6 py-2.5 rounded-full text-xs font-bold tracking-wider transition-all duration-300 cursor-pointer border flex items-center gap-2 bg-white/5 text-muted-foreground border-white/5 hover:text-white hover:bg-white/10"
              >
                💻 AI Powered Interview
              </button>
            </Link>
          </div>

          <span className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-xs text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            <Sparkles className="h-3.5 w-3.5 text-primary animate-spin-slow" />
            AI Voice Recruiter
          </span>
          <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold leading-[1.02] tracking-tight text-white">
            Automate screening. <br />
            <span className="text-gradient">Talk with 10,000+ candidates.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Automate candidate screening with human-like AI voice interviews.
            Interview candidates automatically with rubric scoring and ATS sync.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#contact">
              <Button size="lg" className="rounded-full bg-gradient-to-r from-primary to-blue text-white hover:opacity-95 glow-blue border-none">
                Book a consultation <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            <a href="#demo">
              <Button size="lg" variant="outline" className="rounded-full border-primary/40 bg-white/5 hover:bg-white/10">
                Listen to calls <PlayCircle className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto text-center">
            {[
              { v: "50,000+", l: "Interviews conducted" },
              { v: "95%", l: "Screening accuracy" },
              { v: "24/7", l: "AI availability" },
            ].map((s, i) => (
              <motion.div
                key={s.l}
                initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, delay: 0.7 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="glass rounded-2xl p-2.5 sm:p-4 border border-white/5"
              >
                <p className="text-lg sm:text-2xl font-semibold text-gradient">{s.v}</p>
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
  const voiceLogos = ["LinearAI", "Vapora", "NorthStar", "Synthwave", "Helix", "Quantum", "Nimbus", "Orbital", "Lumen", "Cipher"];

  return (
    <section className="relative py-16 border-y border-white/5 bg-card/30">
      <p className="text-center text-xs uppercase tracking-[0.3em] text-muted-foreground font-semibold">Trusted by hiring teams at</p>
      <div className="mt-8 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
        <div className="flex gap-16 animate-marquee whitespace-nowrap w-max">
          {[...voiceLogos, ...voiceLogos].map((l, i) => (
            <span key={i} className="text-xl font-display font-semibold text-muted-foreground/70 hover:text-white transition cursor-default">{l}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

// ==========================================
// 5. PRODUCT 1: AI VOICE RECRUITER SECTIONS
// ==========================================

function MagneticCard({ children, delay }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 8;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 8;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
    el.style.setProperty("--gx", `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty("--gy", `${((e.clientY - r.top) / r.height) * 100}%`);
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--mx", `0px`);
    el.style.setProperty("--my", `0px`);
  };
  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      initial={{ opacity: 0, y: 28, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className="group relative h-full card-premium hover:-translate-y-2 hover:scale-[1.02]"
      style={{ transform: "translate3d(var(--mx,0), var(--my,0), 0)" }}
    >
      {children}
    </motion.div>
  );
}

function Features() {
  const items = [
    { icon: Mic, t: "AI Voice Interviews", d: "Human-like conversation that adapts to every candidate, in real time." },
    { icon: Users, t: "Candidate Screening", d: "Filter at scale — every applicant gets a fair, structured first round." },
    { icon: Gauge, t: "Automated Scoring", d: "Rubric-based scoring with confidence intervals and bias controls." },
    { icon: Database, t: "Recording Storage", d: "Secure, searchable storage for every call with retention controls." },
    { icon: FileText, t: "Transcript Generation", d: "Speaker-diarized transcripts ready for highlights and quotes." },
    { icon: Award, t: "Hiring Recommendations", d: "Clear advance / hold / pass calls with reasoning your team can audit." },
    { icon: BarChart3, t: "Analytics Dashboard", d: "Funnel, pipeline, and conversion analytics in one cockpit." },
    { icon: Briefcase, t: "Candidate Management", d: "Lightweight ATS with bulk actions, CSV import, and team workflows." },
  ];

  return (
    <section id="features" className="relative py-28 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold">Capabilities</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-white">
              Everything your recruiting team <span className="text-gradient-purple font-bold">already wishes</span> they had.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Built for talent leaders who want speed without sacrificing rigor.
            </p>
          </div>
        </motion.div>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((it, i) => (
            <MagneticCard key={it.t} delay={i * 0.06}>
              <div className="relative h-full overflow-hidden rounded-2xl glass p-6 border border-white/10 transition-shadow duration-500 group-hover:shadow-[0_30px_80px_-30px_rgba(40,90,220,0.55)] group-hover:border-primary/35">
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: "radial-gradient(220px circle at var(--gx,50%) var(--gy,50%), rgba(56,130,255,0.18), transparent 60%)",
                  }}
                />
                <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <span className="grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary/30 to-violet/20 border border-primary/30 shadow-[0_0_30px_-8px_rgba(56,130,255,0.6)]">
                    <it.icon className="h-5 w-5 text-primary" />
                  </span>
                  <h3 className="mt-4 font-semibold text-white">{it.t}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{it.d}</p>
                </div>
              </div>
            </MagneticCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function StepCard({ step, icon: Icon, title, desc, progress, threshold }) {
  const scale = useTransform(progress, [threshold - 0.1, threshold + 0.05], [0.95, 1.04]);
  const glow = useTransform(
    progress,
    [threshold - 0.1, threshold + 0.05],
    ["0 0 0 0 rgba(56,130,255,0)", "0 0 60px -8px rgba(56,130,255,0.7)"]
  );
  return (
    <div className="glass rounded-2xl p-5 h-full text-center relative card-premium hover:-translate-y-2 hover:scale-[1.02] hover:border-primary/35 border border-white/5">
      <motion.span
        style={{ scale, boxShadow: glow }}
        className="grid place-items-center h-14 w-14 rounded-full bg-gradient-to-br from-primary to-blue mx-auto"
      >
        <Icon className="h-6 w-6 text-white" />
      </motion.span>
      <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Step {step}</p>
      <h3 className="mt-1 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function HowItWorks() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 70%", "end 30%"],
  });
  const lineWidth = useTransform(scrollYProgress, [0, 1], ["0%", "100%"]);

  const steps = [
    { icon: Upload, t: "Upload candidate list", d: "Bring CSVs, ATS exports, or paste rows. We dedupe and validate." },
    { icon: PhoneCall, t: "AI calls candidates", d: "Outbound at scale, with smart retry windows and timezone awareness." },
    { icon: MessagesSquare, t: "AI conducts interviews", d: "Structured competency questions with adaptive follow-ups." },
    { icon: Gauge, t: "AI generates score", d: "Rubric scoring with transcript citations and confidence." },
    { icon: CheckCircle2, t: "Recruiter reviews results", d: "Sort by score, listen back, advance or pass in one click." },
  ];

  return (
    <section id="how" className="relative py-28 border-y border-white/5">
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_50%,rgba(40,90,220,0.07),transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-6">
        <Reveal>
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-cyan font-bold">Pipeline</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold text-white">
              From upload to <span className="text-gradient">shortlist</span> — in hours, not weeks.
            </h2>
          </div>
        </Reveal>

        <div ref={ref} className="mt-16 relative">
          <div className="hidden md:block absolute top-10 left-[8%] right-[8%] h-px bg-white/5 overflow-hidden rounded-full">
            <motion.div
              style={{ width: lineWidth }}
              className="h-full bg-gradient-to-r from-primary via-cyan to-violet shadow-[0_0_18px_2px_rgba(56,130,255,0.55)]"
            />
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            {steps.map((s, i) => {
              const threshold = i / steps.length;
              return (
                <motion.div
                  key={s.t}
                  initial={{ opacity: 0, y: 30, filter: "blur(8px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.7, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                >
                  <StepCard step={i + 1} icon={s.icon} title={s.t} desc={s.d} progress={scrollYProgress} threshold={threshold} />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CountUp({ to, decimals = 0 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => controls.stop();
  }, [inView, to]);
  return (
    <span ref={ref}>
      {decimals > 0
        ? val.toFixed(decimals)
        : Math.round(val).toLocaleString()}
    </span>
  );
}

function DashboardPreview() {
  const ref = useRef(null);

  const kpis = [
    { icon: Users, l: "Candidates", v: 12481, suffix: "", d: "+842 this week", color: "text-primary" },
    { icon: PhoneCall, l: "Live calls", v: 37, suffix: "", d: "Real-time", color: "text-cyan" },
    { icon: CheckCircle2, l: "Completed", v: 9213, suffix: "", d: "92% completion", color: "text-emerald" },
    { icon: Star, l: "Avg score", v: 8.4, suffix: "", d: "out of 10", color: "text-pink" },
    { icon: TrendingUp, l: "Shortlisted", v: 1204, suffix: "", d: "Top 13%", color: "text-blue" },
  ];

  return (
    <section id="dashboard" className="relative py-28">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-xs uppercase tracking-[0.3em] text-primary font-bold">Interview Sync</p>
            <h2 className="mt-3 text-4xl md:text-5xl font-semibold text-white">
              From call to <span className="text-gradient-purple font-bold">candidate record</span> — instantly.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every completed interview is packaged and POSTed to your ATS the second it ends.
            </p>
          </div>
        </motion.div>

        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: 80, scale: 0.97, filter: "blur(12px)" }}
          whileInView={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 glass-strong rounded-3xl p-6 relative overflow-hidden border border-white/10"
          style={{ perspective: 1200 }}
        >
          <div className="pointer-events-none absolute -inset-8 bg-[radial-gradient(60%_80%_at_50%_0%,rgba(40,90,220,0.25),transparent_60%)]" />

          <div className="relative flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">arah.app/dashboard</span>
            </div>
            <span className="text-[11px] text-emerald inline-flex items-center gap-1.5 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" /> Live
            </span>
          </div>

          <div className="relative mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {kpis.map((k, i) => (
              <motion.div
                key={k.l}
                initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: 0.25 + i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                className="glass rounded-xl p-4 border border-white/5 card-premium hover:-translate-y-1 hover:border-primary/35"
              >
                <k.icon className={cn("h-4 w-4", k.color)} />
                <p className="mt-3 text-2xl font-semibold text-white tabular-nums">
                  <CountUp to={k.v} decimals={k.v % 1 !== 0 ? 1 : 0} />
                </p>
                <p className="text-xs text-muted-foreground font-medium">{k.l}</p>
                <p className="text-[10px] text-muted-foreground/70 mt-1">{k.d}</p>
              </motion.div>
            ))}
          </div>

          <div className="relative mt-5 grid lg:grid-cols-3 gap-3">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="lg:col-span-2 glass rounded-xl p-5 border border-white/5"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">Interview pipeline</p>
                <span className="text-[10px] text-muted-foreground font-mono">last 24h</span>
              </div>
              <ul className="mt-5 space-y-3.5">
                {[
                  ["✓", "Sarah Jenkins", "Role: Senior Backend Engineer", "Recommendation: Strong Advance", "Score: 9.2/10", "border-emerald/40 bg-emerald/5", "text-emerald"],
                  ["✓", "Alex River", "Role: React Developer", "Recommendation: Advance", "Score: 8.4/10", "border-emerald/30 bg-emerald/5", "text-emerald"],
                  ["✗", "David Vance", "Role: DevOps Engineer", "Recommendation: Pass", "Score: 4.1/10", "border-destructive/30 bg-destructive/5", "text-destructive"],
                ].map(([icon, name, role, rec, score, bg, text], i) => (
                  <motion.li
                    key={name}
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.75 + i * 0.08 }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-white/5 bg-white/5 hover:border-white/10 hover:bg-white/10 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn("h-7 w-7 grid place-items-center rounded-full border text-xs font-bold", bg, text)}>{icon}</span>
                      <div>
                        <p className="text-sm font-semibold text-white">{name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 font-medium">{role}</p>
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <p className="text-xs font-semibold text-white">{rec}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">{score}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.72, ease: [0.22, 1, 0.36, 1] }}
              className="glass rounded-xl p-5 border border-white/5 flex flex-col justify-between"
            >
              <div>
                <p className="text-sm font-semibold text-white">Live screening feed</p>
                <p className="text-[11px] text-muted-foreground mt-1">outbound pipeline status</p>
              </div>
              <ul className="mt-6 space-y-4 text-xs font-medium text-white">
                {[
                  ["⚡", "Sarah J.", "Speaking now (04:12)"],
                  ["✓", "Carlos R.", "Scored 7.8 — PM"],
                  ["…", "Mei T.", "Queued at 14:20"],
                ].map(([m, n, s], i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: 16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.9 + i * 0.08 }}
                    className="flex items-center gap-3"
                  >
                    <span className="h-7 w-7 grid place-items-center rounded-full bg-primary/20 text-primary text-xs font-semibold">{m}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{n}</p>
                      <p className="text-xs text-muted-foreground truncate">{s}</p>
                    </div>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function InterviewDemo() {
  const frameRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: frameRef,
    offset: ["start end", "end start"],
  });

  const sp = (v) => useSpring(v, { stiffness: 80, damping: 22, mass: 0.6 });

  const yImage = sp(useTransform(scrollYProgress, [0, 1], [80, -120]));
  const scaleImage = sp(useTransform(scrollYProgress, [0, 0.5, 1], [0.92, 1.04, 0.98]));
  const rotateImage = sp(useTransform(scrollYProgress, [0, 1], [4, -4]));
  const opacityImage = useTransform(scrollYProgress, [0, 0.15, 0.85, 1], [0, 1, 1, 0.55]);
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.25, 0.85, 0.35]);
  const glowScale = sp(useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 1.15, 0.95]));
  const glowHue = useTransform(scrollYProgress, [0, 1], [0, 40]);
  const glowFilter = useTransform(glowHue, (h) => `blur(60px) hue-rotate(${h}deg)`);
  const badgeY = sp(useTransform(scrollYProgress, [0, 1], [30, -30]));

  const turns = [
    { who: "AI", text: "Hi Sarah — thanks for picking up. Could you walk me through a project you led recently?" },
    { who: "Cand", text: "Sure. I led the migration of our analytics stack from Redshift to BigQuery..." },
    { who: "AI", text: "Nice. What was the trickiest tradeoff you made on cost vs. query latency?" },
    { who: "Cand", text: "We materialized hot aggregates daily, which dropped P95 by ~60%." },
  ];

  return (
    <section id="demo" className="relative py-28 bg-[#02040a]/60 border-y border-white/5 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#01030a] via-[#02050d] to-[#01030a] pointer-events-none" />

      <motion.div
        style={{ opacity: glowOpacity, scale: glowScale, filter: glowFilter }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[900px] w-[900px] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.22),transparent_60%)] pointer-events-none"
      />

      <div className="relative mx-auto max-w-6xl px-6 grid lg:grid-cols-2 gap-12 items-center">
        <Reveal>
          <div ref={frameRef} className="relative group [perspective:1200px]">
            <motion.div
              style={{ opacity: glowOpacity, scale: glowScale }}
              className="absolute -inset-14 rounded-[50%] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.42),transparent_60%)] blur-3xl pointer-events-none z-0"
            />
            <motion.div
              style={{ scale: glowScale, rotate: useTransform(scrollYProgress, [0, 1], [0, 25]) }}
              className="absolute -inset-8 rounded-[45%] bg-[radial-gradient(circle_at_40%_60%,rgba(34,211,238,0.28),transparent_55%)] blur-2xl pointer-events-none z-0"
            />

            <motion.div
              style={{
                y: yImage,
                scale: scaleImage,
                rotateZ: rotateImage,
                opacity: opacityImage,
              }}
              className="relative rounded-3xl overflow-hidden border border-primary/30 glass-strong z-10 will-change-transform shadow-[0_30px_120px_-20px_rgba(56,189,248,0.45)]"
            >
              <img
                src={robotAsset}
                alt="AI interviewer conducting screening"
                className="w-full h-auto object-cover [filter:contrast(1.25)_brightness(1.05)_saturate(1.2)_hue-rotate(-6deg)]"
                draggable={false}
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-[#020610]/55 via-transparent to-primary/10 pointer-events-none" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,transparent_40%,rgba(2,5,12,0.65)_100%)] pointer-events-none" />
              <div className="absolute inset-0 rounded-3xl shadow-[inset_0_0_120px_rgba(56,189,248,0.25)] pointer-events-none" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#01030a] to-transparent pointer-events-none" />
              <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#01030a] to-transparent pointer-events-none" />

              <motion.div
                aria-hidden
                initial={{ y: "-100%" }}
                animate={{ y: "120%" }}
                transition={{ duration: 4.2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-cyan/15 to-transparent pointer-events-none"
              />
            </motion.div>

            <motion.div
              style={{ y: badgeY }}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="absolute -bottom-4 left-6 z-30 glass rounded-full px-4 py-2 flex items-center gap-2 border border-cyan/30 text-white"
            >
              <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" />
              <span className="text-xs font-semibold">AI Interviewer active</span>
            </motion.div>
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <p className="text-xs uppercase tracking-[0.3em] text-cyan font-bold">Live demo</p>
          <h2 className="mt-3 text-4xl md:text-5xl font-semibold text-white">Hear what a <span className="text-gradient">10/10 first round</span> sounds like.</h2>
          <p className="mt-4 text-muted-foreground leading-relaxed">Adaptive follow-ups, citation-backed scoring, and a hiring recommendation in under 12 minutes.</p>

          <div className="mt-8 glass-strong rounded-3xl p-6 space-y-3 border border-white/10 text-white">
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.who === "AI" ? "justify-start" : "justify-end"}`}>
                <div className={cn("max-w-[80%] rounded-2xl px-4 py-3 text-sm", t.who === "AI" ? "bg-primary/15 border border-primary/30" : "bg-card border border-white/10")}>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 font-semibold">{t.who === "AI" ? "Arah AI" : "Candidate"}</p>
                  <p className="leading-relaxed">{t.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 glass rounded-2xl p-4 flex items-center gap-3 border border-white/5">
            <span className="grid place-items-center h-10 w-10 rounded-full bg-primary text-white animate-pulse-glow cursor-pointer font-bold">▶</span>
            <div className="flex-1">
              <div className="flex items-end gap-1 h-10">
                {Array.from({ length: 40 }).map((_, i) => (
                  <span key={i} className="block w-1 rounded-full bg-gradient-to-t from-primary to-cyan" style={{ height: "100%", animation: `voice-wave 1s ease-in-out ${i * 0.04}s infinite`, transformOrigin: "bottom" }} />
                ))}
              </div>
            </div>
            <span className="text-xs text-muted-foreground font-mono">02:13 / 11:48</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Testimonials() {
  const items = [
    { q: "We cut time-to-shortlist by 78%. Hire IQ handled 3,200 first rounds in our last hiring sprint.", a: "Priya N.", r: "Head of Talent, Helix" },
    { q: "Candidates tell us it's the most human screening they've had — and we get a full rubric for every one.", a: "Marcus L.", r: "VP People, Orbital" },
    { q: "Our recruiters now spend their time on humans who matter, not phone tag.", a: "Elena V.", r: "Talent Lead, Nimbus" },
  ];

  return (
    <section className="relative py-28 border-t border-white/5">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal>
          <h2 className="text-center text-4xl md:text-5xl font-semibold text-white">Loved by <span className="text-gradient-purple font-bold">recruiting teams</span>.</h2>
        </Reveal>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {items.map((it, i) => (
            <Reveal key={i} delay={i * 0.08}>
              <figure className="glass rounded-2xl p-6 h-full border border-white/5 flex flex-col justify-between">
                <blockquote className="text-lg leading-snug text-white">"{it.q}"</blockquote>
                <figcaption className="mt-6 text-sm text-white">
                  <p className="font-semibold">{it.a}</p>
                  <p className="text-muted-foreground text-xs">{it.r}</p>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecruiterFAQ() {
  const faqs = [
    ["How human does the AI sound?", "We use natural-prosody TTS with adaptive turn-taking. Candidates can't tell it's AI in ~88% of post-call surveys."],
    ["Does Arah integrate with our ATS?", "Yes — every completed interview is packaged and POSTed to your ATS as a candidate record. Greenhouse, Ashby, and Lever are supported natively."],
    ["What languages do you support?", "English, Spanish, Portuguese, German, French, Hindi, and Mandarin with localized scoring rubrics."],
    ["How do you prevent bias?", "Structured rubrics, blinded reviewer mode, demographic-parity dashboards, and a quarterly third-party audit."],
    ["Is candidate data secure?", "Yes — SOC 2 Type II, GDPR ready, configurable retention, and per-tenant encryption keys on Enterprise."],
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

function RecruiterContact() {
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
          <h2 className="text-center text-4xl md:text-5xl font-semibold text-white">Book a <span className="text-gradient-purple font-bold">live consultation</span>.</h2>
          <p className="text-center text-muted-foreground mt-3">Tell us about your hiring funnel — we'll run a tailored demo with your roles.</p>
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
                Send another request
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-10 glass-strong rounded-3xl p-6 grid gap-4 sm:grid-cols-2 border border-white/10">
              <Input required name="name" placeholder="Full name" className="bg-card/50" />
              <Input required type="email" name="email" placeholder="Work email" className="bg-card/50" />
              <Input name="company" placeholder="Company" className="sm:col-span-2 bg-card/50" />
              <Textarea name="message" placeholder="What roles are you hiring for?" className="sm:col-span-2 min-h-28 bg-card/50" />
              <Button type="submit" disabled={sending} className="sm:col-span-2 rounded-full bg-gradient-to-r from-primary to-violet text-white border-none">
                {sending ? "Sending..." : "Request demo"}
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

function AiRecruiterLandingPage() {
  useEffect(() => {
    document.title = "Hire IQ — AI Voice Recruiter that Never Sleeps";
    
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.name = "description";
      document.head.appendChild(metaDesc);
    }
    metaDesc.content = "Automate candidate screening with human-like AI voice interviews. Interview 10,000+ candidates automatically with rubric scoring and ATS sync.";
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#020204] text-foreground">
      <BackgroundFX />
      <SiteHeader />
      <main className="relative">
        <Hero />
        <TrustedBy />
        <Features />
        <HowItWorks />
        <DashboardPreview />
        <InterviewDemo />
        <Testimonials />
        <RecruiterFAQ />
        <RecruiterContact />
      </main>
      <SiteFooter />
      <RobotMascot />
    </div>
  );
}

export default AiRecruiterLandingPage;
