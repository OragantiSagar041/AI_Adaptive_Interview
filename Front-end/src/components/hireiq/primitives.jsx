import { motion, useScroll, useTransform } from "framer-motion";
import React, { useRef, useEffect, useState } from "react";
export function FadeIn({ children, delay = 0, duration = 0.7, x = 0, y = 30, as = "div", className, }) {
    const Comp = React.useMemo(() => motion.create(as), [as]);
    return (<Comp initial={{ opacity: 0, x, y }} whileInView={{ opacity: 1, x: 0, y: 0 }} viewport={{ once: true, margin: "50px", amount: 0 }} transition={{ delay, duration, ease: [0.25, 0.1, 0.25, 1] }} className={className}>
      {children}
    </Comp>);
}
export function ContactButton({ label = "Book a Demo", className = "" }) {
    return (<button className={`gradient-cta rounded-full text-white font-medium uppercase tracking-widest px-8 py-3 sm:px-10 sm:py-3.5 md:px-12 md:py-4 text-xs sm:text-sm md:text-base hover:scale-[1.03] transition-transform ${className}`}>
      {label}
    </button>);
}
export function GhostButton({ label = "View Case Study" }) {
    return (<button className="rounded-full border-2 border-[#D7E2EA] text-[#D7E2EA] font-medium uppercase tracking-widest px-8 py-3 sm:px-10 sm:py-3.5 text-sm sm:text-base hover:bg-[#D7E2EA]/10 transition-colors">
      {label}
    </button>);
}
export function Magnet({ children, padding = 150, strength = 3, }) {
    const ref = useRef(null);
    const [active, setActive] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    useEffect(() => {
        const handle = (e) => {
            const el = ref.current;
            if (!el)
                return;
            const r = el.getBoundingClientRect();
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            const dx = e.clientX - cx;
            const dy = e.clientY - cy;
            const within = Math.abs(dx) < r.width / 2 + padding && Math.abs(dy) < r.height / 2 + padding;
            setActive(within);
            if (within)
                setPos({ x: dx / strength, y: dy / strength });
            else
                setPos({ x: 0, y: 0 });
        };
        window.addEventListener("mousemove", handle);
        return () => window.removeEventListener("mousemove", handle);
    }, [padding, strength]);
    return (<div ref={ref} style={{
            transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
            transition: active ? "transform 0.3s ease-out" : "transform 0.6s ease-in-out",
            willChange: "transform",
        }}>
      {children}
    </div>);
}
export function AnimatedText({ text, className }) {
    const ref = useRef(null);
    const { scrollYProgress } = useScroll({
        target: ref,
        offset: ["start 0.8", "end 0.2"],
    });
    const chars = text.split("");
    return (<p ref={ref} className={className}>
      {chars.map((c, i) => (<Char key={i} char={c} progress={scrollYProgress} range={[i / chars.length, (i + 1) / chars.length]}/>))}
    </p>);
}
function Char({ char, progress, range }) {
    const opacity = useTransform(progress, range, [0.2, 1]);
    return (<span className="relative inline">
      <span className="opacity-20">{char}</span>
      <motion.span style={{ opacity }} className="absolute left-0 top-0">
        {char}
      </motion.span>
    </span>);
}
