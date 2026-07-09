import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE_URL } from '../../apiConfig';
import { CheckCircle2 } from 'lucide-react';

export function PricingSection() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const planOrder = {
    "Free Trial": 0,
    "Basic": 1,
    "Advance": 2,
  };

  useEffect(() => {
    async function fetchPlans() {
      try {
        const res = await fetch(`${API_BASE_URL}/api/plans`);
        const data = await res.json();
        if (res.ok && data.status === "success") {
          const sortedPlans = (data.data || []).sort((a, b) => {
            const aOrder = planOrder[a.plan_name] ?? 999;
            const bOrder = planOrder[b.plan_name] ?? 999;
            return aOrder - bOrder;
          });
          setPlans(sortedPlans);
        }
      } catch (err) {
        console.error("Failed to fetch plans", err);
      } finally {
        setLoading(false);
      }
    }
    fetchPlans();
  }, []);

  const formatPrice = (price) => {
    const numeric = Number(price || 0);
    if (numeric === 0) return "Free";
    return `Rs. ${numeric.toLocaleString("en-IN")}`;
  };

  return (
    <section id="pricing" className="py-24 relative overflow-hidden bg-[#050505]">
      <div className="mx-auto max-w-6xl px-6 relative z-10">
        <div className="text-center mb-16 animate-fade-up">
          <h2 className="font-podium text-4xl md:text-5xl lg:text-6xl text-white uppercase tracking-tight">
            Simple <span className="hero-heading">Pricing.</span>
          </h2>
          <p className="mt-4 text-white/60 font-inter text-sm md:text-base max-w-xl mx-auto">
            Choose the plan that fits your hiring needs. No hidden fees.
          </p>
        </div>

        {loading ? (
          <div className="text-center text-white/50">Loading plans...</div>
        ) : (
          <div className="grid md:grid-cols-3 gap-8">
            {plans.map((plan, i) => (
              <div 
                key={plan.id || plan.plan_name} 
                className="animate-fade-up border border-white/10 bg-white/5 rounded-2xl p-8 flex flex-col hover:border-white/30 transition-colors relative overflow-hidden"
                style={{ animationDelay: `${i * 150}ms` }}
              >
                {/* Glow effect for popular plan */}
                {i === 1 && <div className="absolute top-0 right-0 w-32 h-32 bg-[#B600A8]/20 blur-[50px] -mr-16 -mt-16 rounded-full pointer-events-none" />}
                
                <h3 className="font-podium text-2xl text-white uppercase tracking-wide">{plan.plan_name}</h3>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="font-inter text-4xl font-bold text-white">{formatPrice(plan.price)}</span>
                  {plan.price > 0 && <span className="text-white/50 text-sm">/ month</span>}
                </div>
                <p className="mt-2 text-white/60 text-sm">
                  {plan.credits === 0 ? "Trial access" : `${plan.credits} candidate evaluations`}
                </p>

                <Link 
                  to={`/register?plan=${plan.plan_name}`} 
                  className={`mt-8 w-full block text-center py-3 text-xs tracking-widest uppercase transition-all ${
                    i === 1 ? 'gradient-cta text-white font-bold' : 'border border-white/30 text-white hover:bg-white/10'
                  }`}
                >
                  Get Started
                </Link>

                <div className="mt-8 space-y-4 flex-1">
                  {(plan.features || []).map((feat, idx) => (
                    <div key={idx} className="flex gap-3 text-sm text-white/80 items-start">
                      <CheckCircle2 className="w-5 h-5 text-[#B600A8] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
