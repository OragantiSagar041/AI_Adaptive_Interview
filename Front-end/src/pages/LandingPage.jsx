import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from '../apiConfig';
import {
  Phone, Video, FileSearch, BarChart3, Users, Sparkles, ShieldCheck,
  ArrowRight, Play, Check, Zap, Brain, Target, TrendingUp, Clock,
  Scale, LineChart, Layers, ChevronDown, PhoneCall, Mic, CircleCheck,
  FileText, FileCheck, Star, UserCheck, PartyPopper
} from "lucide-react";
import { Link } from "react-router-dom";
import logoImg from "../assets/logo.png";
import "../snake.css";

function useCountUp(target, start, duration = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, duration]);
  return v;
}

function useInView() {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setSeen(true)),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans overflow-x-hidden">
      <Nav />
      <Hero />
      <LogoStrip />
      <Problem />
      <Platform />
      <HowItWorks />
      <WhyChoose />
      <AiThinks />
      <Reports />
      <Industries />
      <Results />
      <Testimonial />
      <PricingSection />
      <ConnectWithUs />
      <FAQ />
      {/* <FinalCTA /> */}
      <Footer />
      <StickyDemo />
      <DemoModal />
    </div>
  );
}

/* ---------------- NAV ---------------- */
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "backdrop-blur-xl bg-background/70 border-b border-border" : ""
        }`}
    >
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <Logo />
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#platform" className="hover:text-foreground transition">Platform</a>
          <a href="#how" className="hover:text-foreground transition">How it works</a>
          <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
          <a href="#about" className="hover:text-foreground transition">About</a>
          <a href="#faq" className="hover:text-foreground transition">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="hidden sm:inline-flex text-sm px-4 py-2 rounded-full glass hover:bg-white/10 transition"
          >
            Sign in
          </Link>
          <a
            href="#demo"
            onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('openDemoModal')); }}
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-br from-primary to-purple-500 text-primary-foreground shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:opacity-95 transition"
          >
            Book Demo <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <img src={logoImg} alt="Logo" className="h-30 w-auto object-contain" />
  );
}

/* ---------------- HERO ---------------- */
function Hero() {
  return (
    <section id="top" className="relative pt-32 pb-24 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background">
      {/* grid + noise */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at top, black 40%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 40%, transparent 75%)"
        }}
      />
      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse-glow" />
            AI Recruitment Intelligence Platform
          </div>
          <h1 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tighter leading-[1.02]">
            The Future of Hiring
            <br />
            Starts with <span className="text-gradient">AI</span>.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl leading-relaxed">
            AI agents that call, interview and identify your best candidates—automatically.
            HireIQ automates outreach, resume screening, interviews and evaluation so hiring
            teams make faster decisions and hire top talent with confidence.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#demo"
              onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('openDemoModal')); }}
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:opacity-95 transition"
            >
              Book a Live Demo <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#tour"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full glass-strong font-semibold hover:bg-white/10 transition"
            >
              <Play className="h-4 w-4" /> Watch Product Tour
            </a>
          </div>

          <div className="mt-10 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: Zap, label: "10× Faster Hiring" },
              { icon: FileSearch, label: "80% Less Screening" },
              { icon: PhoneCall, label: "AI Voice + Video" },
              { icon: Brain, label: "Predictive Scoring" },
              { icon: ShieldCheck, label: "Enterprise Security" },
            ].map((o) => (
              <div key={o.label} className="glass rounded-2xl p-3 flex items-center gap-2">
                <o.icon className="h-4 w-4 text-cyan-400 shrink-0" />
                <span className="text-xs font-medium">{o.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5">
          <HeroDashboard />
        </div>
      </div>
    </section>
  );
}

function HeroDashboard() {
  return (
    <div className="relative">
      {/* halo */}
      <div className="absolute -inset-8 bg-gradient-to-br from-primary to-purple-500 opacity-20 blur-3xl rounded-full" />
      <div className="relative glass-strong rounded-3xl p-5 shadow-2xl animate-float">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-purple-500 grid place-items-center shadow-[0_0_15px_rgba(124,58,237,0.5)]">
              <Mic className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI Voice Interview</div>
              <div className="text-[11px] text-muted-foreground">Live · Senior Frontend Engineer</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full glass">
            <span className="h-1.5 w-1.5 bg-emerald-400 rounded-full animate-pulse" /> Recording
          </div>
        </div>

        {/* Waveform */}
        <div className="mt-5 flex items-end gap-1 h-16">
          {Array.from({ length: 42 }).map((_, i) => {
            const h = 20 + Math.abs(Math.sin(i * 0.7)) * 70 + (i % 5) * 4;
            return (
              <div
                key={i}
                className="w-1.5 rounded-full bg-gradient-to-t from-electric to-violet"
                style={{ height: `${Math.min(100, h)}%`, opacity: 0.5 + (i % 3) * 0.2 }}
              />
            );
          })}
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          {[
            { k: "Communication", v: 92 },
            { k: "Technical", v: 88 },
            { k: "Confidence", v: 84 },
          ].map((m) => (
            <div key={m.k} className="glass rounded-xl p-3">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.k}</div>
              <div className="mt-1 text-xl font-bold">{m.v}</div>
              <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-br from-primary to-purple-500"
                  style={{ width: `${m.v}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 glass rounded-xl p-3">
          <div className="text-[11px] text-muted-foreground">AI Recommendation</div>
          <div className="mt-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-semibold">Strong Hire — Top 8% match</span>
            </div>
            <span className="text-xs text-cyan-400">View report →</span>
          </div>
        </div>
      </div>

      {/* Floating chip */}
      <div className="absolute -left-6 -bottom-6 glass-strong rounded-2xl p-3 flex items-center gap-2 shadow-2xl hidden sm:flex">
        <PhoneCall className="h-4 w-4 text-cyan-400 animate-pulse-glow" />
        <div>
          <div className="text-xs font-semibold">Calling 1,240 candidates</div>
          <div className="text-[10px] text-muted-foreground">In parallel · 4 languages</div>
        </div>
      </div>
      <div className="absolute -right-4 -top-6 glass-strong rounded-2xl p-3 hidden sm:block">
        <div className="text-[10px] text-muted-foreground">Time to shortlist</div>
        <div className="text-lg font-bold">
          <span className="text-gradient">18 min</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- LOGO STRIP ---------------- */
function LogoStrip() {
  const logos = ["NORTHWIND", "ACME CORP", "VERTEX", "LUMEN", "OCTAVE", "HELIOS", "QUANTA", "AXIOM"];
  // return (
  //   <section className="py-14 border-y border-border/60">
  //     <div className="mx-auto max-w-7xl px-6">
  //       <p className="text-center text-xs uppercase tracking-[0.2em] text-muted-foreground">
  //         Trusted by modern recruiting teams
  //       </p>
  //       <div className="mt-6 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,black_15%,black_85%,transparent)]">
  //         <div className="flex gap-14 animate-marquee whitespace-nowrap">
  //           {[...logos, ...logos].map((l, i) => (
  //             <span
  //               key={i}
  //               className="text-lg font-bold tracking-[0.25em] text-muted-foreground/70"
  //             >
  //               {l}
  //             </span>
  //           ))}
  //         </div>
  //       </div>
  //     </div>
  //   </section>
  // );
}

/* ---------------- PROBLEM ---------------- */
function Problem() {
  return (
    <section className="py-28">
      <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <SectionEyebrow>The problem</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            Recruitment is broken. <span className="text-gradient">HireIQ fixes it.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg leading-relaxed">
            Hiring shouldn't depend on endless phone calls, manual resume reviews, or inconsistent
            interviews. Recruiters spend most of their time on repetitive tasks instead of engaging
            top talent—leading to delayed decisions, inconsistent evaluations, and higher costs.
          </p>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
            HireIQ automates the entire recruitment journey. From application to offer, AI works
            alongside your recruiters to screen, interview, evaluate, and recommend the best
            candidates—at scale.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { t: "Hours screening", v: "82%", sub: "of recruiter time wasted" },
            { t: "Time-to-hire", v: "42d", sub: "average industry cycle" },
            { t: "Ghosted candidates", v: "1 in 3", sub: "never get a callback" },
            { t: "Bad hires", v: "$14K+", sub: "avg cost per role" },
          ].map((s) => (
            <div key={s.t} className="glass rounded-2xl p-5">
              <div className="text-xs text-muted-foreground">{s.t}</div>
              <div className="mt-2 text-3xl font-extrabold text-gradient">{s.v}</div>
              <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- PLATFORM ---------------- */
function Platform() {
  const items = [
    {
      icon: FileSearch,
      title: "AI Resume Intelligence",
      body: "Instantly analyze resumes and rank candidates on skills, experience, education, certifications and job fit.",
    },
    {
      icon: Phone,
      title: "AI Voice Screening",
      body: "AI voice agents call every candidate, ask role-specific questions, capture responses and update profiles.",
    },
    {
      icon: Video,
      title: "AI Video Interviews",
      body: "Structured live or AI-assisted interviews with standardized evaluation criteria for every applicant.",
    },
    {
      icon: Brain,
      title: "Predictive Candidate Scoring",
      body: "Measure communication, technical ability, confidence, behavior and role compatibility with AI scoring.",
    },
    {
      icon: Users,
      title: "Smart Candidate Comparison",
      body: "Compare shortlisted candidates using structured scorecards and hiring insights—not manual notes.",
    },
    {
      icon: BarChart3,
      title: "Recruitment Analytics",
      body: "Track funnels, recruiter productivity, interview performance and time-to-hire in real-time dashboards.",
    },
  ];
  return (
    <section id="platform" className="py-28 relative">
      <BgGlow />
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <SectionEyebrow>The platform</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            One AI platform. <br />
            <span className="text-gradient">Complete hiring automation.</span>
          </h2>
        </div>
        <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => (
            <div
              key={it.title}
              className="group relative glass rounded-2xl p-6 hover:bg-white/[0.08] transition"
            >
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-purple-500 grid place-items-center shadow-[0_0_15px_rgba(124,58,237,0.5)]">
                <it.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="mt-5 text-lg font-bold">{it.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{it.body}</p>
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition pointer-events-none"
                style={{ boxShadow: "0 0 0 1px oklch(0.68 0.19 260 / 0.4), 0 20px 60px -20px oklch(0.68 0.19 260 / 0.5)" }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- HOW IT WORKS ---------------- */
function HowItWorks() {
  const steps = [
    {
      title: "Upload Job Description",
      desc: "Add your job details and requirements.",
      icon: FileText,
      color: "text-blue-400",
      bg: "bg-blue-400/10",
      border: "border-blue-400/30",
    },
    {
      title: "AI Resume Screening",
      desc: "AI scans and shortlists the most qualified candidates.",
      icon: FileCheck,
      color: "text-green-400",
      bg: "bg-green-400/10",
      border: "border-green-400/30",
    },
    {
      title: "AI Voice Call",
      desc: "AI calls candidates and conducts initial screening.",
      icon: Phone,
      color: "text-orange-400",
      bg: "bg-orange-400/10",
      border: "border-orange-400/30",
    },
    {
      title: "AI Interview",
      desc: "AI conducts structured interviews.",
      icon: Video,
      color: "text-purple-400",
      bg: "bg-purple-400/10",
      border: "border-purple-400/30",
    },
    {
      title: "AI Evaluation",
      desc: "AI evaluates answers and analyzes candidate suitability.",
      icon: Brain,
      color: "text-cyan-400",
      bg: "bg-cyan-400/10",
      border: "border-cyan-400/30",
    },
    {
      title: "Candidate Score",
      desc: "Candidates are scored based on skills and fit.",
      icon: Star,
      color: "text-pink-400",
      bg: "bg-pink-400/10",
      border: "border-pink-400/30",
    },
    {
      title: "Recruiter Review",
      desc: "Recruiters review AI insights and top candidates.",
      icon: UserCheck,
      color: "text-emerald-400",
      bg: "bg-emerald-400/10",
      border: "border-emerald-400/30",
    },
    {
      title: "Hire with Confidence",
      desc: "Make the best hiring decision and extend offers faster.",
      icon: PartyPopper,
      color: "text-yellow-400",
      bg: "bg-yellow-400/10",
      border: "border-yellow-400/30",
    },
  ];

  return (
    <section id="how" className="py-28 overflow-hidden">
      <div className="mx-auto max-w-[1400px] px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <SectionEyebrow center>How it works</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            A smarter hiring workflow <br />
            <span className="text-gradient">in 8 simple steps.</span>
          </h2>
        </div>

        {/* Container for Steps */}
        <div className="relative">
          <div className="flex flex-wrap justify-center pb-10 items-start gap-y-16 gap-x-4 md:gap-x-0">
            {steps.map((step, i) => (
              <div
                key={step.title}
                className="relative flex-none w-[280px] px-4"
              >
                {/* Arrow to next step (hidden on last item and end of row) */}
                {i < steps.length - 1 && i !== 4 && (
                  <div className="hidden md:block absolute top-[52px] -right-4 w-full z-0">
                    <ArrowRight
                      className={`snake-arrow w-8 h-8 mx-auto ${step.color}`}
                      style={{ animationDelay: `${(i * 0.85) + 0.4}s` }}
                    />
                  </div>
                )}

                <div className="flex flex-col items-center text-center relative z-10">
                  {/* Circle Icon */}
                  <div
                    className={`snake-circle w-28 h-28 rounded-full flex items-center justify-center border-2 ${step.border} ${step.bg} ${step.color} mb-6 relative group hover:scale-105 transition-transform duration-300 shadow-lg`}
                    style={{ animationDelay: `${i * 0.85}s` }}
                  >
                    <step.icon className={`w-12 h-12 ${step.color}`} strokeWidth={1.5} />
                    {/* Number Badge */}
                    <div className={`absolute -bottom-3 w-8 h-8 rounded-full bg-background border-2 ${step.border} flex items-center justify-center text-sm font-bold ${step.color}`}>
                      {i + 1}
                    </div>
                  </div>

                  {/* Text Content */}
                  <h3 className="text-lg font-bold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- WHY CHOOSE ---------------- */
function WhyChoose() {
  const items = [
    { icon: Zap, t: "Hire 10× Faster", b: "Reduce recruitment cycles from weeks to days through intelligent automation." },
    { icon: Clock, t: "Eliminate Repetitive Work", b: "Spend less time screening resumes, scheduling interviews and initial calls." },
    { icon: Scale, t: "Fair & Consistent Hiring", b: "Every candidate experiences the same structured evaluation—reducing bias." },
    { icon: Target, t: "Better Hiring Decisions", b: "AI-generated insights identify high-potential candidates with confidence." },
    { icon: TrendingUp, t: "Scale Without Growing", b: "Interview thousands of candidates in parallel without more recruiters." },
    { icon: Layers, t: "One Unified Platform", b: "Sourcing, screening, interviews, evaluations, analytics—one place." },
  ];
  return (
    <section id="why" className="py-28 relative">
      <BgGlow variant="right" />
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <SectionEyebrow>Why HireIQ</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            Why leading companies <br />
            <span className="text-gradient">choose HireIQ.</span>
          </h2>
        </div>
        <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((it) => (
            <div key={it.t} className="glass rounded-2xl p-6">
              <it.icon className="h-6 w-6 text-cyan-400" />
              <h3 className="mt-4 text-lg font-bold">{it.t}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{it.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- AI THINKS ---------------- */
function AiThinks() {
  const signals = [
    "Resume Quality", "Communication Skills", "Technical Knowledge",
    "Behavioural Responses", "Cultural Alignment", "Experience Match",
    "Confidence Level", "Overall Hiring Readiness",
  ];
  return (
    <section className="py-28">
      <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-14 items-center">
        <div>
          <SectionEyebrow>How the AI thinks</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            AI that thinks like <br /> <span className="text-gradient">your best recruiter.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg leading-relaxed">
            HireIQ combines conversational AI, machine learning and recruitment intelligence to
            evaluate every candidate using structured data—not assumptions.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3">
            {signals.map((s) => (
              <div key={s} className="glass rounded-xl px-4 py-3 flex items-center gap-2">
                <Check className="h-4 w-4 text-cyan-400" />
                <span className="text-sm">{s}</span>
              </div>
            ))}
          </div>
        </div>

        <ScoreCard />
      </div>
    </section>
  );
}

function ScoreCard() {
  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-gradient-to-br from-primary to-purple-500 opacity-10 blur-3xl rounded-full" />
      <div className="relative glass-strong rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Candidate Assessment</div>
            <div className="text-lg font-bold mt-0.5">Priya Sharma · Sr. Backend Engineer</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Overall</div>
            <div className="text-3xl font-extrabold text-gradient">91</div>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {[
            { k: "Communication", v: 94 },
            { k: "Technical", v: 90 },
            { k: "Behavioral", v: 88 },
            { k: "Cultural Fit", v: 92 },
            { k: "Confidence", v: 86 },
          ].map((r) => (
            <div key={r.k}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">{r.k}</span>
                <span className="font-semibold">{r.v}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-br from-primary to-purple-500" style={{ width: `${r.v}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="glass rounded-xl p-3">
            <div className="text-[10px] text-emerald-400 uppercase tracking-wider">Strengths</div>
            <div className="text-xs mt-1 text-muted-foreground">System design, distributed systems, mentoring</div>
          </div>
          <div className="glass rounded-xl p-3">
            <div className="text-[10px] text-purple-500 uppercase tracking-wider">Develop</div>
            <div className="text-xs mt-1 text-muted-foreground">Front-end fluency, public speaking</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- REPORTS ---------------- */
function Reports() {
  const rows = [
    "Overall Candidate Score",
    "Communication Analysis",
    "Technical Assessment",
    "Behavioral Insights",
    "Confidence Evaluation",
    "Strengths & Development Areas",
    "AI Hiring Recommendation",
  ];
  return (
    <section className="py-28 relative">
      <BgGlow />
      <div className="mx-auto max-w-7xl px-6 max-w-4xl text-center">
        <SectionEyebrow center>Reports</SectionEyebrow>
        <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
          Interview reports <span className="text-gradient">recruiters actually love.</span>
        </h2>
        <p className="mt-5 text-muted-foreground text-lg">
          Every interview automatically generates a comprehensive AI assessment. No spreadsheets.
          No manual scoring. No guesswork.
        </p>
        <div className="mt-10 grid sm:grid-cols-2 gap-3 text-left">
          {rows.map((r) => (
            <div key={r} className="glass rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-purple-500 grid place-items-center">
                <Check className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span className="text-sm">{r}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- INDUSTRIES ---------------- */
function Industries() {
  const inds = [
    "IT & Software", "Healthcare", "Banking & Financial Services",
    "Manufacturing", "Retail", "Telecom", "Logistics", "Education",
    "BPO & Customer Support", "Enterprise Shared Services",
  ];
  return (
    <section id="industries" className="py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <SectionEyebrow>Industries</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            Built for <span className="text-gradient">every hiring team.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Whether you're hiring 20 candidates or 20,000, HireIQ scales effortlessly with your
            recruitment needs.
          </p>
        </div>
        <div className="mt-10 flex flex-wrap gap-2.5">
          {inds.map((i) => (
            <span
              key={i}
              className="glass rounded-full px-4 py-2 text-sm hover:bg-white/10 transition"
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- RESULTS (counters) ---------------- */
function Results() {
  const { ref, seen } = useInView();
  const a = useCountUp(80, seen);
  const b = useCountUp(10, seen);
  const c = useCountUp(3, seen);
  const d = useCountUp(97, seen);
  return (
    <section className="py-28 relative">
      <BgGlow variant="right" />
      <div ref={ref} className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <SectionEyebrow>Results that matter</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            Outcomes, <span className="text-gradient">not just automation.</span>
          </h2>
        </div>
        <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { v: `${a}%`, t: "Less screening effort" },
            { v: `${b}×`, t: "Shorter hiring cycles" },
            { v: `${c}×`, t: "Recruiter productivity" },
            { v: `${d}%`, t: "Interview consistency" },
          ].map((s) => (
            <div key={s.t} className="glass rounded-2xl p-6">
              <div className="text-4xl sm:text-5xl font-extrabold text-gradient">{s.v}</div>
              <div className="mt-2 text-sm text-muted-foreground">{s.t}</div>
            </div>
          ))}
        </div>
        <ul className="mt-10 grid md:grid-cols-3 gap-3 text-sm text-muted-foreground">
          {["Better candidate experiences", "Faster, data-driven decisions", "Higher recruiter productivity"].map((r) => (
            <li key={r} className="flex items-center gap-2">
              <LineChart className="h-4 w-4 text-cyan-400" /> {r}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- TESTIMONIAL ---------------- */
function Testimonial() {
  return (
    <section className="py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="glass-strong rounded-3xl p-10 md:p-14 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-gradient-to-br from-primary to-purple-500 opacity-20 blur-3xl" />
          <div className="text-6xl leading-none text-cyan-400/60 font-serif">"</div>
          <p className="mt-2 text-2xl md:text-3xl font-semibold leading-snug tracking-tight">
            HireIQ transformed the way we recruit. AI now handles our initial screening, interviews
            and candidate evaluations—allowing our recruiters to focus only on the best talent.
          </p>
          <div className="mt-8 flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-purple-500 grid place-items-center font-bold text-primary-foreground">
              HR
            </div>
            <div>
              <div className="font-semibold">HR Director</div>
              <div className="text-xs text-muted-foreground">Enterprise SaaS · 8,000+ employees</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
function FAQ() {
  const faqs = [
    {
      q: "How does HireIQ's AI voice screening work?",
      a: "Our AI voice agents call every qualified candidate, ask structured, role-specific questions, capture and transcribe responses, and update the candidate profile in real time. Recruiters review only the top scoring shortlists.",
    },
    {
      q: "Will HireIQ integrate with our existing ATS?",
      a: "Yes. HireIQ integrates with leading ATS and HRIS platforms via secure APIs, so screening, interview data and scores flow directly into your existing hiring workflow.",
    },
    {
      q: "How does HireIQ ensure fair and unbiased evaluation?",
      a: "Every candidate goes through the same structured interview and scoring rubric. Evaluation is based on measurable signals—communication, technical accuracy, behavioral responses—not subjective notes.",
    },
    {
      q: "Is HireIQ secure and enterprise-ready?",
      a: "HireIQ is built with enterprise-grade security: encryption in transit and at rest, SSO, role-based access, audit logs, and support for regional data residency.",
    },
    {
      q: "How quickly can we get started?",
      a: "Most teams go live within days. We help you configure job templates, evaluation rubrics and integrations during onboarding, with dedicated support throughout.",
    },
    {
      q: "Can HireIQ handle high-volume hiring?",
      a: "Yes. HireIQ can screen and interview thousands of candidates in parallel, making it ideal for BPO, retail, campus, and enterprise-scale hiring.",
    },
  ];
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="py-28">
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <SectionEyebrow center>FAQ</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            Frequently asked <span className="text-gradient">questions.</span>
          </h2>
        </div>
        <div className="mt-12 space-y-3">
          {faqs.map((f, i) => (
            <div key={f.q} className="glass rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-semibold">{f.q}</span>
                <ChevronDown
                  className={`h-5 w-5 text-cyan-400 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              <div
                className={`grid transition-all duration-300 ${open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- CONNECT WITH US ---------------- */
function ConnectWithUs() {
  return (
    <section id="about" className="py-24 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-8 bg-gradient-to-br from-zinc-800/90 to-zinc-900/90 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 lg:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
          {/* Left Side */}
          <div>
            <SectionEyebrow>Connect</SectionEyebrow>
            <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold tracking-tighter text-foreground">
              Connect with Us
            </h2>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed max-w-md">
              Ready to streamline your recruitment process? Our experts are here to help you
              leverage AI for smarter hiring.
            </p>
            <div className="mt-10 space-y-6">
              <div>
                <h4 className="text-sm font-semibold tracking-wider uppercase text-cyan-500">Email</h4>
                <p className="mt-1 text-foreground">hello@hireiq.ai</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-wider uppercase text-cyan-500">Phone</h4>
                <p className="mt-1 text-foreground">+1 (555) 012-3456</p>
              </div>
              <div>
                <h4 className="text-sm font-semibold tracking-wider uppercase text-cyan-500">Location</h4>
                <p className="mt-1 text-foreground">San Francisco, CA</p>
              </div>
            </div>
          </div>

          {/* Right Side - Form */}
          <div className="bg-background rounded-2xl p-6 lg:p-8 border border-border">
            <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">First Name *</label>
                  <input
                    type="text"
                    placeholder="Enter your first name"
                    className="w-full bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Last Name *</label>
                  <input
                    type="text"
                    placeholder="Enter your last name"
                    className="w-full bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Email *</label>
                <input
                  type="email"
                  placeholder="email@company.com"
                  className="w-full bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company Name *</label>
                <input
                  type="text"
                  placeholder="Enter your company name"
                  className="w-full bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <textarea
                  rows={4}
                  placeholder="How can we help you?"
                  className="w-full bg-muted/50 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none"
                />
              </div>
              <button
                type="submit"
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3.5 rounded-lg transition-colors duration-200 mt-4"
              >
                Send Message
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- PRICING SECTION ---------------- */
function PricingSection() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/plans`)
      .then(res => res.json())
      .then(data => {
        setPlans(data?.data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching plans:", err);
        setLoading(false);
      });
  }, []);

  return (
    <section id="pricing" className="py-24 relative overflow-hidden">
      <BgGlow variant="right" />
      <div className="mx-auto max-w-7xl px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <SectionEyebrow center>Pricing</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            Simple, transparent <span className="text-gradient">pricing.</span>
          </h2>
          <p className="mt-5 text-muted-foreground text-lg">
            Choose the plan that fits your hiring needs. Upgrade, downgrade, or cancel anytime.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {plans.map((plan, i) => {
              const isPopular = plan.plan_name?.toLowerCase() === "basic" || plan.plan_name?.toLowerCase() === "pro";
              return (
                <div key={plan.id} className="relative group">
                  <div className={`h-full bg-zinc-800/80 backdrop-blur-xl border ${isPopular ? "border-primary/50 shadow-[0_0_30px_rgba(124,58,237,0.3)]" : "border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.5)]"} rounded-3xl p-8 flex flex-col hover:border-primary/50 transition-colors duration-300`}>
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary to-purple-500 rounded-full text-xs font-bold uppercase tracking-widest shadow-lg">
                        Most Popular
                      </div>
                    )}
                    <h3 className="text-2xl font-bold">{plan.plan_name}</h3>
                    <p className="text-muted-foreground mt-2 text-sm h-10">{plan.summary || "All the essential features you need to get started."}</p>

                    <div className="mt-6 mb-8 flex items-baseline gap-1">
                      <span className="text-4xl font-extrabold">₹{plan.price || 0}</span>
                      <span className="text-muted-foreground">/mo</span>
                    </div>

                    <div className="mb-8 flex-1">
                      <p className="text-sm font-semibold text-primary mb-4 border-b border-white/10 pb-4">Includes {plan.credits || 0} AI interview credits</p>
                      <ul className="space-y-3">
                        {(plan.features && plan.features.length > 0 ? plan.features : ["AI Resume Screening", "Automated Voice Calls", "Comprehensive Evaluation Reports"]).map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-sm text-muted-foreground">
                            <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-auto pt-6">
                      <Link to="/register" className={`flex items-center justify-center w-full py-3 rounded-full transition font-medium ${isPopular ? "bg-gradient-to-r from-primary to-purple-600 hover:opacity-90 shadow-lg" : "bg-white/5 hover:bg-white/10 border border-white/10"}`}>
                        Get Started
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------- FINAL CTA ---------------- */
// function FinalCTA()
//  {
//   return (
//     <section id="demo" className="py-28 relative">
//       <div className="mx-auto max-w-6xl px-6">
//         <div className="relative overflow-hidden rounded-3xl glass-strong p-10 md:p-16 text-center">
//           <div className="absolute inset-0 opacity-40"
//             style={{ background: "radial-gradient(600px 300px at 50% 0%, oklch(0.68 0.19 260 / 0.4), transparent 60%), radial-gradient(600px 300px at 50% 100%, oklch(0.66 0.22 300 / 0.35), transparent 60%)" }} />
//           <div className="relative">
//             <SectionEyebrow center>Ready to hire smarter</SectionEyebrow>
//             <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tighter leading-tight">
//               Build a <span className="text-gradient">smarter hiring process.</span>
//             </h2>
//             <p className="mt-5 text-muted-foreground text-lg max-w-2xl mx-auto">
//               Stop spending valuable recruiter time on repetitive tasks. Let HireIQ screen,
//               interview, evaluate and identify your best candidates—automatically.
//             </p>
//             <div className="mt-8 flex flex-wrap gap-3 justify-center">
//               <a
//                 href="#"
//                 onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('openDemoModal')); }}
//                 className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:opacity-95 transition"
//               >
//                 Book a Personalized Demo <ArrowRight className="h-4 w-4" />
//               </a>
//               <a
//                 href="#tour"
//                 className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full glass font-semibold hover:bg-white/10 transition"
//               >
//                 <Play className="h-4 w-4" /> See HireIQ in Action
//               </a>
//             </div>
//           </div>
//         </div>
//       </div>
//     </section>
//   );
// }

/* ---------------- FOOTER ---------------- */
function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto max-w-7xl px-6 flex flex-col items-center text-center">
        <div className="mb-6">
          <Logo />
        </div>
        <div className="flex items-center gap-4 mb-6">
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-full bg-[#1877F2] text-white hover:opacity-80 transition-opacity">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
          </a>
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 text-white hover:opacity-80 transition-opacity">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
          </a>
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FF0000] text-white hover:opacity-80 transition-opacity">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
          </a>
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white hover:opacity-80 transition-opacity">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a href="#" className="flex items-center justify-center w-8 h-8 rounded-full bg-[#0A66C2] text-white hover:opacity-80 transition-opacity">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
          </a>
          {/* <a href="#" className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white hover:opacity-80 transition-opacity">
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 15.68a6.34 6.34 0 006.32 6.32 6.33 6.33 0 006.33-6.32v-6.94a8.21 8.21 0 003.94 1.15V6.44a5.04 5.04 0 01-2-1z" />
            </svg>
          </a> */}
        </div>
        <div className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} HireIQ. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

/* ---------------- STICKY DEMO ---------------- */
function StickyDemo() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(window.scrollY > 600);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <a
      href="#demo"
      onClick={(e) => { e.preventDefault(); window.dispatchEvent(new Event('openDemoModal')); }}
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold shadow-[0_0_15px_rgba(124,58,237,0.5)] transition-all duration-300 md:hidden ${show ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"
        }`}
    >
      Book Demo <ArrowRight className="h-4 w-4" />
    </a>
  );
}

/* ---------------- DEMO MODAL ---------------- */
function DemoModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    work_email: '',
    mobile_number: '',
    company_name: '',
    help_text: ''
  });

  useEffect(() => {
    const handleOpen = (e) => {
      e.preventDefault();
      setIsOpen(true);
      setSubmitted(false);
      setFormData({
        first_name: '',
        last_name: '',
        work_email: '',
        mobile_number: '',
        company_name: '',
        help_text: ''
      });
    };
    window.addEventListener("openDemoModal", handleOpen);
    return () => window.removeEventListener("openDemoModal", handleOpen);
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/demo-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setSubmitted(true);
      } else {
        alert("Failed to submit request. Please try again.");
      }
    } catch (err) {
      alert("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 backdrop-blur-md bg-black/60 animate-in fade-in duration-300">
      <div className="bg-zinc-900/90 w-full max-w-lg rounded-3xl border border-white/10 p-8 shadow-2xl relative animate-in zoom-in-95 duration-300">
        <button
          onClick={() => setIsOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        {submitted ? (
          <div className="text-center py-10">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Request Received!</h3>
            <p className="text-muted-foreground">Thank you for your interest. Our team will reach out to schedule your personalized demo shortly.</p>
            <button
              onClick={() => setIsOpen(false)}
              className="mt-8 px-6 py-3 rounded-full glass font-semibold hover:bg-white/10 transition w-full"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <SectionEyebrow center={false}>Book Demo</SectionEyebrow>
            <h3 className="text-3xl font-extrabold text-white mt-4 mb-2">See HireIQ in Action</h3>
            <p className="text-muted-foreground mb-8">Fill out the form below and we'll be in touch to schedule a personalized walkthrough.</p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">First Name</label>
                  <input required name="first_name" value={formData.first_name} onChange={handleChange} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition" placeholder="John" />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Last Name</label>
                  <input required name="last_name" value={formData.last_name} onChange={handleChange} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition" placeholder="Doe" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Work Email</label>
                  <input required name="work_email" value={formData.work_email} onChange={handleChange} type="email" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition" placeholder="john@company.com" />
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mobile Number</label>
                  <input required name="mobile_number" value={formData.mobile_number} onChange={handleChange} type="tel" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition" placeholder="+1 (555) 000-0000" />
                </div>
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Company Name</label>
                <input required name="company_name" value={formData.company_name} onChange={handleChange} type="text" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition" placeholder="Acme Corp" />
              </div>

              <div className="space-y-1.5 text-left">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">How can we help?</label>
                <textarea required name="help_text" value={formData.help_text} onChange={handleChange} rows="3" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 transition resize-none" placeholder="Tell us about your hiring needs..."></textarea>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-white font-bold shadow-[0_0_20px_rgba(124,58,237,0.3)] hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? "Submitting..." : "Request Demo"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- primitives ---------------- */
function SectionEyebrow({ children, center }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full glass px-3 py-1 text-xs uppercase tracking-[0.18em] text-muted-foreground ${center ? "" : ""}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-br from-primary to-purple-500" />
      {children}
    </div>
  );
}

function BgGlow({ variant = "left" }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className={`absolute ${variant === "left" ? "-left-40 top-20" : "-right-40 top-40"} h-[500px] w-[500px] rounded-full blur-3xl opacity-20`}
        style={{ background: "var(--gradient-primary)" }}
      />
    </div>
  );
}
