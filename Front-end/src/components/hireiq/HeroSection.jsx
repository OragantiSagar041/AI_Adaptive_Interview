import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Award, Crown, X } from "lucide-react";
import heroVideo from "../../assets/hireiq-hero.mp4";
const useAuth = () => ({ user: null });
const VIDEO_URL = heroVideo;
const NAV = ["Platform", "Interviews", "Analytics", "Pricing"];
export function HeroSection() {
    const [menuOpen, setMenuOpen] = useState(false);
    const { user } = useAuth();
    const dashPath = (user?.role || "").toLowerCase() === "master"
        ? "/master"
        : (user?.role || "").toLowerCase() === "super_admin"
            ? "/superadmin"
            : "/admin";
    return (<section className="relative h-screen w-full overflow-hidden bg-black">
      <video src={VIDEO_URL} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover opacity-70"/>
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/40 to-black"/>
      <div className="absolute inset-0 radial-glow"/>

      {/* Navbar */}
      <nav className="relative z-20 flex items-center justify-between px-6 sm:px-10 lg:px-16 py-5 lg:py-7">
        <div className="font-podium text-white text-2xl sm:text-3xl tracking-wider uppercase">
          HireIQ
        </div>
        <div className="hidden md:flex items-center gap-10">
          {NAV.map((n) => (<a key={n} href={`#${n.toLowerCase()}`} className="font-inter text-sm text-white/80 tracking-widest uppercase hover:text-white transition-colors">
              {n}
            </a>))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          {user ? (<Link to={dashPath} className="inline-flex items-center gap-2 border border-white/30 hover:border-white/60 px-6 py-3 text-xs tracking-widest uppercase text-white hover:bg-white/10 transition-colors">
              Dashboard <ArrowUpRight className="w-4 h-4"/>
            </Link>) : (<>
              <Link to="/login" className="px-4 py-3 text-xs tracking-widest uppercase text-white/80 hover:text-white transition-colors">
                Sign in
              </Link>
              <Link to="/register" className="inline-flex items-center gap-2 border border-white/30 hover:border-white/60 px-6 py-3 text-xs tracking-widest uppercase text-white hover:bg-white/10 transition-colors">
                Get Started <ArrowUpRight className="w-4 h-4"/>
              </Link>
            </>)}
        </div>
        <button onClick={() => setMenuOpen(true)} className="md:hidden flex flex-col space-y-1.5" aria-label="Open menu">
          <div className="w-6 h-0.5 bg-white"/>
          <div className="w-6 h-0.5 bg-white"/>
          <div className="w-4 h-0.5 bg-white"/>
        </button>
      </nav>

      {/* Mobile menu */}
      <div className={`md:hidden fixed inset-0 z-50 bg-black/95 backdrop-blur-sm transition-all duration-500 ${menuOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}>
        <div className="flex items-center justify-between px-6 py-5">
          <div className="font-podium text-white text-2xl tracking-wider uppercase">HireIQ</div>
          <button onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <X className="text-white w-7 h-7"/>
          </button>
        </div>
        <div className="flex flex-col items-center justify-center gap-6 mt-20">
          {NAV.map((n, i) => (<a key={n} href={`#${n.toLowerCase()}`} onClick={() => setMenuOpen(false)} className="font-podium text-4xl sm:text-5xl text-white uppercase transition-all duration-500" style={{
                transitionDelay: `${i * 80 + 100}ms`,
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? "translateY(0)" : "translateY(20px)",
            }}>
              {n}
            </a>))}
          {user ? (
            <Link to={dashPath} onClick={() => setMenuOpen(false)} className="mt-6 inline-flex items-center gap-2 border border-white/40 px-8 py-4 text-xs tracking-widest uppercase text-white transition-all duration-500" style={{
              transitionDelay: `${NAV.length * 80 + 100}ms`,
              opacity: menuOpen ? 1 : 0,
              transform: menuOpen ? "translateY(0)" : "translateY(20px)",
            }}>
              Dashboard <ArrowUpRight className="w-4 h-4"/>
            </Link>
          ) : (
            <div className="flex flex-col gap-4 mt-6 items-center">
              <Link to="/login" onClick={() => setMenuOpen(false)} className="px-8 py-2 text-xs tracking-widest uppercase text-white/80 hover:text-white transition-all duration-500" style={{
                transitionDelay: `${NAV.length * 80 + 100}ms`,
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? "translateY(0)" : "translateY(20px)",
              }}>
                Sign in
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} className="inline-flex items-center gap-2 border border-white/40 px-8 py-4 text-xs tracking-widest uppercase text-white transition-all duration-500 hover:bg-white/10" style={{
                transitionDelay: `${NAV.length * 80 + 200}ms`,
                opacity: menuOpen ? 1 : 0,
                transform: menuOpen ? "translateY(0)" : "translateY(20px)",
              }}>
                Get Started <ArrowUpRight className="w-4 h-4"/>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Hero content */}
      <div className="relative z-10 flex flex-col justify-center h-[calc(100vh-120px)] px-6 sm:px-10 lg:px-16 max-w-7xl">
        <div className="animate-fade-up flex items-center gap-3 mb-6 lg:mb-8">
          <Crown className="w-4 h-4 text-white/70"/>
          <span className="text-white/70 text-xs sm:text-sm font-inter tracking-[0.3em] uppercase">
            Enterprise AI Hiring Platform
          </span>
        </div>

        <h1 className="animate-fade-up-delay-1 font-podium text-white uppercase leading-[0.92] tracking-tight" style={{ fontSize: "clamp(2.8rem, 8vw, 7rem)" }}>
          <span className="block">Screen.</span>
          <span className="block">Interview.</span>
          <span className="block hero-heading">Shortlist.</span>
        </h1>

        <p className="animate-fade-up-delay-2 mt-6 lg:mt-8 text-white/70 text-sm sm:text-base font-inter leading-relaxed max-w-md">
          AI agents that call, interview, and evaluate candidates at scale —
          <br />
          so your team hires the top 1%,{" "}
          <span className="text-white font-semibold">10× faster.</span>
        </p>

        <div className="animate-fade-up-delay-3 mt-8 lg:mt-10 flex flex-wrap items-center gap-4 sm:gap-6">
          <button className="group bg-black hover:bg-neutral-900 border border-white/20 px-5 sm:px-7 py-3 sm:py-4 text-[11px] sm:text-xs tracking-widest uppercase text-white flex items-center gap-2">
            See the Platform
            <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"/>
          </button>
          <div className="hidden sm:flex items-center gap-3">
            <Award className="w-8 h-8 text-white/50"/>
            <div>
              <div className="text-white/60 text-xs tracking-wider uppercase">SOC 2 Type II</div>
              <div className="text-white/60 text-xs tracking-wider uppercase">GDPR Ready</div>
            </div>
          </div>
        </div>

        <div className="animate-fade-up-delay-4 mt-8 sm:mt-10 lg:mt-14 flex flex-wrap gap-6 sm:gap-12 lg:gap-16">
          {[
            ["2.4M+", "Interviews Conducted"],
            ["96%", "Candidate Match Accuracy"],
            ["10×", "Faster Time-to-Hire"],
        ].map(([v, l]) => (<div key={l}>
              <div className="font-inter text-white text-2xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                {v}
              </div>
              <div className="text-white/50 text-[9px] sm:text-xs tracking-widest uppercase mt-1">
                {l}
              </div>
            </div>))}
        </div>
      </div>
    </section>);
}
