import { useEffect, useRef, useState } from "react";
import interviewerImg from "../../assets/ai-interviewer.png";
import interviewerDeskImg from "../../assets/ai-interviewer-desk.png";
import mockInterviewImg from "../../assets/ai-mock-interview.jpeg";
import dashboardImg from "../../assets/hireiq-dashboard.png";
const BASE = [
    dashboardImg,
    mockInterviewImg,
    interviewerImg,
    interviewerDeskImg,
    dashboardImg,
    mockInterviewImg,
    interviewerDeskImg,
];
const ROW1 = [...BASE, ...BASE, ...BASE];
const ROW2 = [...BASE.slice().reverse(), ...BASE.slice().reverse(), ...BASE.slice().reverse()];
export function MarqueeSection() {
    const sectionRef = useRef(null);
    const [offset, setOffset] = useState(0);
    useEffect(() => {
        const handle = () => {
            if (!sectionRef.current)
                return;
            const rect = sectionRef.current.getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const val = (window.scrollY - top + window.innerHeight) * 0.3;
            setOffset(val);
        };
        handle();
        window.addEventListener("scroll", handle, { passive: true });
        return () => window.removeEventListener("scroll", handle);
    }, []);
    return (<section ref={sectionRef} className="overflow-hidden pt-24 sm:pt-32 md:pt-40 pb-10" style={{ backgroundColor: "#0C0C0C" }}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-3" style={{ transform: `translateX(${offset - 200}px)`, willChange: "transform" }}>
          {ROW1.map((src, i) => (<img key={i} src={src} loading="lazy" alt="" className="rounded-2xl object-cover shrink-0" style={{ width: 420, height: 270 }}/>))}
        </div>
        <div className="flex gap-3" style={{ transform: `translateX(${-(offset - 200)}px)`, willChange: "transform" }}>
          {ROW2.map((src, i) => (<img key={i} src={src} loading="lazy" alt="" className="rounded-2xl object-cover shrink-0" style={{ width: 420, height: 270 }}/>))}
        </div>
      </div>
    </section>);
}
