import React, { useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, TrendingUp, Users, Clock, ArrowRight, Zap, Shield, Target, Award } from 'lucide-react';
import interviewerImg from '../assets/ai-interviewer.png';
import dashboardImg from '../assets/hireiq-dashboard.png';
import mockInterviewImg from '../assets/ai-mock-interview.jpeg';
import interviewerDeskImg from '../assets/ai-interviewer-desk.png';

const CASE_STUDIES = {
  nexus: {
    name: "Nexus",
    title: "Scaling to 40,000 hires per year with AI.",
    subtitle: "Discover how Nexus reduced their time-to-hire by 78% and eliminated human bias by deploying HireIQ's autonomous AI recruiters.",
    stats: [
      { label: "Time-to-hire", value: "-78%", icon: Clock },
      { label: "Candidates Screened", value: "2.4M", icon: Users },
      { label: "Cost per hire", value: "-45%", icon: TrendingUp },
      { label: "Quality of hire", value: "+92%", icon: CheckCircle2 }
    ],
    challenge: [
      "Nexus was experiencing explosive growth, but their HR team was drowning in resumes. With over 100,000 applications monthly, recruiters were spending 80% of their time on initial screening calls that yielded low-quality results.",
      "They needed a solution that could scale infinitely without compromising the candidate experience or introducing human biases that were bottlenecking their engineering pipeline."
    ],
    solution: [
      "Deployed 50 concurrent AI agents to handle 100% of L1 technical screens.",
      "Integrated real-time code evaluation and behavioral analysis.",
      "Customized the AI's persona to reflect Nexus's employer brand and core values."
    ],
    images: {
      hero: interviewerImg,
      parallax: dashboardImg,
      solution: mockInterviewImg
    }
  },
  aura: {
    name: "Aura",
    title: "12× faster engineering hiring for hyper-growth.",
    subtitle: "See how Aura bypassed technical bottlenecks and recruited elite software engineers rapidly without overburdening their senior developers.",
    stats: [
      { label: "Engineering Hours Saved", value: "10k+", icon: Clock },
      { label: "Technical Screens", value: "15,000", icon: Zap },
      { label: "Offer Acceptance", value: "+40%", icon: TrendingUp },
      { label: "Diversity Hires", value: "+35%", icon: Shield }
    ],
    challenge: [
      "As a high-growth startup, Aura's senior engineers were spending up to 15 hours a week conducting technical interviews instead of shipping code.",
      "The manual interviewing process was inconsistent, leading to biased evaluations and high drop-off rates for top-tier candidates who were impatient with the slow pipeline."
    ],
    solution: [
      "Implemented HireIQ's deep-technical AI interviewer for all backend and frontend roles.",
      "Enabled adaptive questioning where the AI dynamically adjusts difficulty based on candidate responses.",
      "Generated detailed technical scorecards and video highlights for hiring managers."
    ],
    images: {
      hero: interviewerDeskImg,
      parallax: dashboardImg,
      solution: mockInterviewImg
    }
  },
  solaris: {
    name: "Solaris",
    title: "2.4M candidates screened globally with zero bias.",
    subtitle: "How a Global BPO transformed high-volume customer service hiring by standardizing communication and empathy assessments using Voice AI.",
    stats: [
      { label: "Global Reach", value: "15+ Countries", icon: Target },
      { label: "Screening Accuracy", value: "99.2%", icon: Award },
      { label: "Drop-off Rate", value: "-60%", icon: TrendingUp },
      { label: "Time-to-offer", value: "48 hours", icon: Clock }
    ],
    challenge: [
      "Solaris needed to hire thousands of customer support agents across 15 countries simultaneously. Their existing process required hundreds of recruiters just for basic language and empathy checks.",
      "Ensuring consistent quality and neutral evaluation across different regions and languages was practically impossible with human recruiters."
    ],
    solution: [
      "Rolled out multilingual AI voice recruiters to conduct 10-minute automated empathy and communication assessments.",
      "Analyzed voice tone, sentiment, and problem-solving skills in real-time.",
      "Automatically shortlisted candidates who met the exact cultural and linguistic benchmarks."
    ],
    images: {
      hero: mockInterviewImg,
      parallax: interviewerImg,
      solution: interviewerDeskImg
    }
  }
};

export default function HireIQCaseStudyPage() {
  const { id } = useParams();
  
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, 200]);

  const data = CASE_STUDIES[id];
  if (!data) return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-[#020204] text-white font-sans overflow-x-hidden selection:bg-purple-500/30">
      {/* Background effects */}
      <div className="fixed inset-0 bg-radial-purple opacity-40 pointer-events-none" />
      <div className="fixed inset-0 bg-grid-fine opacity-20 pointer-events-none" />
      
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5 py-4 px-6 md:px-12 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-2 group">
          <ArrowLeft className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
          <span className="text-sm font-medium tracking-widest uppercase text-slate-400 group-hover:text-white transition-colors">Back to HireIQ</span>
        </Link>
        <div className="text-xl font-podium tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60">
          HireIQ
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-6 md:px-12 max-w-7xl mx-auto z-10">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="max-w-4xl"
          key={data.name}
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass border border-purple-500/30 text-purple-300 text-xs font-bold uppercase tracking-widest mb-6">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            Customer Story: {data.name}
          </div>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-podium leading-[0.9] tracking-tighter mb-8">
            {data.title.split(data.title.match(/\d+[,.\dx]*|\d+/)?.[0] || "").map((part, i, arr) => (
              <React.Fragment key={i}>
                {part}
                {i < arr.length - 1 && <span className="text-gradient-purple">{data.title.match(/\d+[,.\dx]*|\d+/)[0]}</span>}
              </React.Fragment>
            ))}
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 max-w-2xl font-light leading-relaxed">
            {data.subtitle}
          </p>
        </motion.div>

        {/* Stats Grid */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16"
          key={data.name + 'stats'}
        >
          {data.stats.map((stat, i) => (
            <div key={i} className="glass rounded-[24px] p-6 border border-white/5 hover:border-purple-500/30 transition-colors group">
              <stat.icon className="w-6 h-6 text-purple-400 mb-4 group-hover:scale-110 transition-transform" />
              <div className="text-3xl md:text-4xl font-podium mb-1">{stat.value}</div>
              <div className="text-sm text-slate-400 uppercase tracking-widest font-medium">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </section>

      {/* Main Content */}
      <section className="relative z-10 px-6 md:px-12 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          
          <motion.div 
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <h2 className="text-3xl md:text-5xl font-podium tracking-tighter">The Challenge</h2>
            {data.challenge.map((p, i) => (
              <p key={i} className="text-lg text-slate-400 leading-relaxed">{p}</p>
            ))}
          </motion.div>

          <motion.div 
            style={{ y }}
            className="relative"
          >
            <div className="absolute inset-0 glow-purple opacity-30 rounded-full blur-[100px]" />
            <img src={data.images.hero} alt="AI Interviewer" className="relative z-10 w-full rounded-[40px] border border-white/10 shadow-2xl glass-strong animate-float object-cover aspect-[4/3]" />
          </motion.div>
        </div>
      </section>

      {/* Parallax Image Break */}
      <section className="relative h-[60vh] md:h-[80vh] w-full overflow-hidden my-20">
        <motion.div style={{ y }} className="absolute inset-0 w-full h-[120%] -top-[10%]">
          <div className="absolute inset-0 bg-black/40 z-10" />
          <img src={data.images.parallax} alt="Dashboard" className="w-full h-full object-cover" />
        </motion.div>
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <h2 className="text-4xl md:text-7xl font-podium tracking-tighter text-white drop-shadow-2xl">
            A New Standard for Hiring
          </h2>
        </div>
      </section>

      <section className="relative z-10 px-6 md:px-12 py-20 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="order-2 lg:order-1 relative"
          >
            <div className="absolute inset-0 glow-cyan opacity-20 rounded-full blur-[100px]" />
            <img src={data.images.solution} alt="HireIQ Interview" className="relative z-10 w-full rounded-[40px] border border-white/10 shadow-2xl glass object-cover aspect-[4/3]" />
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="order-1 lg:order-2 space-y-8"
          >
            <h2 className="text-3xl md:text-5xl font-podium tracking-tighter">The Solution</h2>
            <div className="space-y-6">
              {data.solution.map((text, i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="mt-1 w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 border border-cyan-500/30">
                    <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                  </div>
                  <p className="text-lg text-slate-300">{text}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 px-6 md:px-12 py-32 max-w-5xl mx-auto text-center">
        <div className="absolute inset-0 glow-purple opacity-40 rounded-[100px] blur-[120px]" />
        <div className="relative glass-strong rounded-[40px] md:rounded-[60px] p-10 md:p-20 border border-white/10 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />
          <h2 className="text-4xl md:text-6xl font-podium tracking-tighter mb-6 relative z-10">
            Ready to transform your hiring?
          </h2>
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto relative z-10">
            Join {data.name} and hundreds of other forward-thinking companies building the future of work.
          </p>
          <Link to="/register" className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white text-black font-bold uppercase tracking-widest text-sm hover:scale-105 transition-transform relative z-10">
            Book a Demo <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Footer minimal */}
      <footer className="border-t border-white/5 py-8 text-center text-slate-500 text-sm font-medium uppercase tracking-widest">
        © {new Date().getFullYear()} HireIQ. All rights reserved.
      </footer>
    </div>
  );
}
