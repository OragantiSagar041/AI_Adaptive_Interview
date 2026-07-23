import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Link } from "react-router-dom";
import { GhostButton } from "./primitives";
import interviewerImg from "../../assets/ai-interviewer.png";
import interviewerDeskImg from "../../assets/ai-interviewer-desk.png";
import hireiqInterviewImg from "../../assets/hireiq-interview.jpeg";
import dashboardImg from "../../assets/hireiq-dashboard.png";
const PROJECTS = [
    {
        id: "nexus",
        n: "01",
        category: "Enterprise SaaS",
        name: "Nexus — 40,000 hires / year",
        imgs: [interviewerImg, hireiqInterviewImg, dashboardImg],
    },
    {
        id: "aura",
        n: "02",
        category: "High-Growth Startup",
        name: "Aura — 12× faster engineering hiring",
        imgs: [interviewerDeskImg, dashboardImg, hireiqInterviewImg],
    },
    {
        id: "solaris",
        n: "03",
        category: "Global BPO",
        name: "Solaris — 2.4M candidates screened",
        imgs: [hireiqInterviewImg, interviewerImg, interviewerDeskImg],
    },
];
export function ProjectsSection() {
    const containerRef = useRef(null);
    return (<section ref={containerRef} className="relative z-10 -mt-10 sm:-mt-12 md:-mt-14 rounded-t-[40px] sm:rounded-t-[50px] md:rounded-t-[60px] px-5 sm:px-8 md:px-10 py-20 sm:py-24 md:py-32" style={{ backgroundColor: "#0C0C0C" }}>
      <h2 className="hero-heading font-podium uppercase text-center leading-none tracking-tight mb-16 sm:mb-20 md:mb-24" style={{ fontSize: "clamp(3rem, 12vw, 160px)" }}>
        Customers
      </h2>
      <div>
        {PROJECTS.map((p, i) => (<ProjectCard key={p.n} p={p} index={i} total={PROJECTS.length} container={containerRef}/>))}
      </div>
    </section>);
}
function ProjectCard({ p, index, total, container, }) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start end", "start start"],
        container: container,
    });
    const targetScale = 1 - (total - 1 - index) * 0.03;
    const scale = useTransform(scrollYProgress, [0, 1], [1, targetScale]);
    return (<div ref={ref} className="h-[85vh] sticky top-24 md:top-32" style={{ top: `${96 + index * 28}px` }}>
      <motion.article style={{ scale }} className="w-full h-full rounded-[40px] sm:rounded-[50px] md:rounded-[60px] border-2 p-4 sm:p-6 md:p-8 flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-6">
            <div className="font-podium text-white" style={{ fontSize: "clamp(3rem, 10vw, 140px)", lineHeight: 0.9 }}>
              {p.n}
            </div>
            <div className="pt-2 sm:pt-4">
              <div className="text-[#D7E2EA]/60 text-xs sm:text-sm uppercase tracking-widest">
                {p.category}
              </div>
              <div className="text-white font-medium uppercase mt-2" style={{ fontSize: "clamp(1rem, 2.2vw, 2rem)" }}>
                {p.name}
              </div>
            </div>
          </div>
          <div className="pt-2">
            <Link to={`/customer-story/${p.id}`}>
              <GhostButton label="Read Case Study"/>
            </Link>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 sm:grid-cols-5 gap-3 sm:gap-4 min-h-0">
          <div className="sm:col-span-2 flex flex-col gap-3 sm:gap-4">
            <img src={p.imgs[0]} alt="" loading="lazy" className="w-full rounded-[30px] sm:rounded-[40px] md:rounded-[50px] object-cover" style={{ height: "clamp(130px, 16vw, 230px)" }}/>
            <img src={p.imgs[1]} alt="" loading="lazy" className="w-full flex-1 min-h-0 rounded-[30px] sm:rounded-[40px] md:rounded-[50px] object-cover"/>
          </div>
          <div className="sm:col-span-3 min-h-0">
            <img src={p.imgs[2]} alt="" loading="lazy" className="w-full h-full rounded-[30px] sm:rounded-[40px] md:rounded-[50px] object-cover" style={{ minHeight: "100%" }}/>
          </div>
        </div>
      </motion.article>
      <style>{`article { border-color: #D7E2EA; background: #0C0C0C; }`}</style>
    </div>);
}
