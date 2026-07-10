import { FadeIn } from "./primitives";
const SERVICES = [
    {
        n: "01",
        name: "AI Voice Screening",
        d: "Autonomous voice agents call and screen thousands of candidates in parallel — qualifying, scoring, and scheduling in one pass.",
    },
    {
        n: "02",
        name: "Live AI Interviews",
        d: "Structured video interviews with real-time sentiment, skill signal extraction, and anti-cheat monitoring for every candidate.",
    },
    {
        n: "03",
        name: "Predictive Scoring",
        d: "Role-tuned models rank candidates on technical fit, communication, problem solving and culture — with full evidence trails.",
    },
    {
        n: "04",
        name: "ATS & Workflow",
        d: "A unified pipeline that plugs into Greenhouse, Workday and Ashby. One dashboard, one source of truth, zero double entry.",
    },
    {
        n: "05",
        name: "Analytics & Compliance",
        d: "Funnel, quality-of-hire and DEI dashboards. Bias audits, SOC 2, GDPR and EEOC-aligned reporting out of the box.",
    },
];
export function ServicesSection() {
    return (<section id="platform" className="rounded-t-[40px] sm:rounded-t-[50px] md:rounded-t-[60px] px-5 sm:px-8 md:px-10 py-20 sm:py-24 md:py-32" style={{ backgroundColor: "#FFFFFF" }}>
      <FadeIn>
        <h2 className="font-podium uppercase text-center mb-16 sm:mb-20 md:mb-28" style={{ color: "#0C0C0C", fontSize: "clamp(3rem, 12vw, 160px)", lineHeight: 0.9 }}>
          Capabilities
        </h2>
      </FadeIn>
      <div className="max-w-5xl mx-auto">
        {SERVICES.map((s, i) => (<FadeIn key={s.n} delay={i * 0.1}>
            <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-10 py-8 sm:py-10 md:py-12" style={{ borderTop: i === 0 ? "1px solid rgba(12,12,12,0.15)" : "none", borderBottom: "1px solid rgba(12,12,12,0.15)" }}>
              <div className="font-podium shrink-0" style={{ color: "#0C0C0C", fontSize: "clamp(3rem, 10vw, 140px)", lineHeight: 0.9 }}>
                {s.n}
              </div>
              <div className="flex-1 md:pt-4">
                <div className="font-medium uppercase mb-3" style={{ color: "#0C0C0C", fontSize: "clamp(1rem, 2.2vw, 2.1rem)", lineHeight: 1.1 }}>
                  {s.name}
                </div>
                <div className="font-light leading-relaxed max-w-2xl" style={{ color: "#0C0C0C", opacity: 0.6, fontSize: "clamp(0.85rem, 1.6vw, 1.25rem)" }}>
                  {s.d}
                </div>
              </div>
            </div>
          </FadeIn>))}
      </div>
    </section>);
}
