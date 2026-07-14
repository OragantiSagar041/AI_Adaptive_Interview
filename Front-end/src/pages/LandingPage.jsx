import { useEffect, useRef, useState } from "react";
import {
  Phone, Video, FileSearch, BarChart3, Users, Sparkles, ShieldCheck,
  ArrowRight, Play, Check, Zap, Brain, Target, TrendingUp, Clock,
  Scale, LineChart, Layers, ChevronDown, PhoneCall, Mic, CircleCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import logoImg from "../assets/logo.png";

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
      <FAQ />
      <FinalCTA />
      <Footer />
      <StickyDemo />
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
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled ? "backdrop-blur-xl bg-background/70 border-b border-border" : ""
      }`}
    >
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <a href="#top" className="flex items-center gap-2">
          <Logo />
        </a>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#platform" className="hover:text-foreground transition">Platform</a>
          <a href="#how" className="hover:text-foreground transition">How it works</a>
          <a href="#about" className="hover:text-foreground transition">About</a>
          <a href="#blog" className="hover:text-foreground transition">Blog</a>
          <a href="#contact" className="hover:text-foreground transition">Contact</a>
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
    "Create or upload your job description",
    "AI screens every resume",
    "AI calls qualified candidates",
    "AI conducts structured interviews",
    "AI evaluates every response",
    "Predictive candidate scores generated",
    "Recruiters review top talent",
    "Hire faster with confidence",
  ];
  return (
    <section id="how" className="py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <SectionEyebrow>How it works</SectionEyebrow>
          <h2 className="mt-3 text-4xl sm:text-5xl font-extrabold tracking-tighter leading-tight">
            A smarter hiring workflow <br />
            <span className="text-gradient">in 8 simple steps.</span>
          </h2>
        </div>

        <div className="mt-14 relative">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-electric/60 to-transparent hidden md:block" />
          <ol className="space-y-6 md:space-y-10">
            {steps.map((s, i) => {
              const right = i % 2 === 1;
              return (
                <li key={s} className={`md:grid md:grid-cols-2 md:gap-10 items-center`}>
                  <div className={`${right ? "md:order-2" : ""} ${right ? "md:text-left" : "md:text-right"}`}>
                    <div className="glass rounded-2xl p-5 inline-block">
                      <div className="text-xs text-cyan-400 font-mono">STEP {String(i + 1).padStart(2, "0")}</div>
                      <div className="mt-1 text-lg font-semibold">{s}</div>
                    </div>
                  </div>
                  <div className={`${right ? "md:order-1" : ""} hidden md:flex items-center ${right ? "justify-end" : "justify-start"}`}>
                    <div className="relative h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-500 grid place-items-center shadow-[0_0_15px_rgba(124,58,237,0.5)]">
                      <span className="font-bold text-primary-foreground">{i + 1}</span>
                      <span className="absolute inset-0 rounded-full animate-pulse-glow" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
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
                className={`grid transition-all duration-300 ${
                  open === i ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
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

/* ---------------- FINAL CTA ---------------- */
function FinalCTA() {
  return (
    <section id="demo" className="py-28 relative">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl glass-strong p-10 md:p-16 text-center">
          <div className="absolute inset-0 opacity-40"
               style={{ background: "radial-gradient(600px 300px at 50% 0%, oklch(0.68 0.19 260 / 0.4), transparent 60%), radial-gradient(600px 300px at 50% 100%, oklch(0.66 0.22 300 / 0.35), transparent 60%)" }} />
          <div className="relative">
            <SectionEyebrow center>Ready to hire smarter</SectionEyebrow>
            <h2 className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tighter leading-tight">
              Build a <span className="text-gradient">smarter hiring process.</span>
            </h2>
            <p className="mt-5 text-muted-foreground text-lg max-w-2xl mx-auto">
              Stop spending valuable recruiter time on repetitive tasks. Let HireIQ screen,
              interview, evaluate and identify your best candidates—automatically.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <a
                href="#"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold shadow-[0_0_15px_rgba(124,58,237,0.5)] hover:opacity-95 transition"
              >
                Book a Personalized Demo <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="#tour"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full glass font-semibold hover:bg-white/10 transition"
              >
                <Play className="h-4 w-4" /> See HireIQ in Action
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FOOTER ---------------- */
function Footer() {
  return (
    <footer className="border-t border-border py-14">
      <div className="mx-auto max-w-7xl px-6 grid md:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2">
            <Logo />
          </div>
          <p className="mt-3 text-sm text-muted-foreground max-w-xs">
            AI Recruitment Intelligence Platform for modern hiring teams.
          </p>
        </div>
        {[
          { t: "Platform", l: ["Resume Intelligence", "Voice Screening", "Video Interviews", "Analytics"] },
          { t: "Company", l: ["About", "Customers", "Security", "Careers"] },
          { t: "Resources", l: ["Docs", "Blog", "Guides", "Contact"] },
        ].map((c) => (
          <div key={c.t}>
            <div className="text-sm font-semibold">{c.t}</div>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              {c.l.map((i) => (
                <li key={i}><a href="#" className="hover:text-foreground transition">{i}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-7xl px-6 mt-10 pt-6 border-t border-border/60 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div>© {new Date().getFullYear()} HireIQ. All rights reserved.</div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> SOC 2 · GDPR</span>
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Terms</a>
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
      className={`fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-gradient-to-br from-primary to-purple-500 text-primary-foreground font-semibold shadow-[0_0_15px_rgba(124,58,237,0.5)] transition-all duration-300 md:hidden ${
        show ? "translate-y-0 opacity-100" : "translate-y-16 opacity-0"
      }`}
    >
      Book Demo <ArrowRight className="h-4 w-4" />
    </a>
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
