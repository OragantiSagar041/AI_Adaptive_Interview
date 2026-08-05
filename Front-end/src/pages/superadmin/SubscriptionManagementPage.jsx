import { useState, useEffect, useCallback } from "react";
import {
  Loader2, RefreshCw, AlertCircle, Zap, TrendingUp, Building2,
  CheckCircle, XCircle, Clock, ChevronDown, ChevronUp,
  User, Mail, Calendar, CreditCard, Edit3, X, Check, BarChart2
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import api from "@/utils/api";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:  { label: "Active",  bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500", Icon: CheckCircle },
  trial:   { label: "Trial",   bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500",   Icon: Clock },
  expired: { label: "Expired", bg: "bg-rose-50",    text: "text-rose-700",    border: "border-rose-200",    dot: "bg-rose-500",    Icon: XCircle },
  blocked: { label: "Blocked", bg: "bg-slate-100",  text: "text-slate-600",   border: "border-slate-200",   dot: "bg-slate-400",   Icon: XCircle },
};

const PLAN_COLORS = {
  trial:   { bg: "bg-slate-100",  text: "text-slate-700"  },
  basic:   { bg: "bg-blue-50",    text: "text-blue-700"   },
  advance: { bg: "bg-violet-50",  text: "text-violet-700" },
  owner:   { bg: "bg-amber-50",   text: "text-amber-700"  },
};

function Avatar({ name }) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-base shadow-sm shrink-0">
      {initials}
    </div>
  );
}

function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.trial;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PlanBadge({ label, planKey }) {
  const clr = PLAN_COLORS[planKey] || PLAN_COLORS.basic;
  return (
    <span className={`px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide ${clr.bg} ${clr.text}`}>
      {label}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, sub, gradient }) {
  return (
    <div className={`rounded-2xl p-5 ${gradient} text-white shadow-lg flex items-start gap-4`}>
      <div className="p-2.5 bg-white/20 rounded-xl">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-sm font-medium opacity-90">{label}</p>
        {sub && <p className="text-xs opacity-75 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Expanded Detail Panel
// ─────────────────────────────────────────────────────────────────────────────
function DetailPanel({ companyId }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let m = true;
    api.get(`/superadmin/subscriptions/${companyId}`)
      .then(r => { if (m) setDetail(r.data); })
      .catch(() => {})
      .finally(() => { if (m) setLoading(false); });
    return () => { m = false; };
  }, [companyId]);

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  if (!detail) return null;

  return (
    <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Plan Features</p>
        <ul className="space-y-2">
          {(detail.plan_features || []).map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" /> {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Recharge History</p>
        {detail.recharge_history?.length ? (
          <ul className="space-y-2">
            {detail.recharge_history.map((r, i) => (
              <li key={i} className="flex justify-between items-center text-sm">
                <span className="text-slate-700 font-medium">{r.plan_name}</span>
                <div className="text-right">
                  <p className="font-semibold text-slate-800">₹{r.amount ?? 0}</p>
                  <p className="text-xs text-slate-400">{r.created_at?.slice(0, 10)}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No recharge history found.</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Static plan definitions (mirrors backend PLAN_DEFINITIONS)
// ─────────────────────────────────────────────────────────────────────────────
const PLANS = [
  {
    key: "basic",
    label: "Basic",
    price: 2500,
    credits: 250,
    summary: "Adds richer review and control workflows for growing hiring teams.",
    features: ["Everything in Free Trial", "Detailed Analytics", "Session Export", "Deactivated Candidate Control", "Email Notifications"],
    popular: true,
    gradient: "from-indigo-600 to-blue-700",
    accent: "#818cf8",
  },
  {
    key: "advance",
    label: "Advance",
    price: 3999,
    credits: 400,
    summary: "Unlocks the full hiring workflow including bulk send and live monitoring.",
    features: ["Everything in Basic", "Bulk Candidate Upload", "Live Monitoring", "Live Results Dashboard", "Priority Support"],
    popular: false,
    gradient: "from-violet-700 to-purple-800",
    accent: "#a78bfa",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Recharge Modal — Plan Picker + Form
// ─────────────────────────────────────────────────────────────────────────────
function RechargeModal({ company, onClose, onSuccess }) {
  const [step, setStep]             = useState("pick");   // "pick" | "form"
  const [selectedPlan, setSelectedPlan] = useState(
    PLANS.find(p => p.key === company.plan_key) || PLANS[2]
  );
  const [addCredits, setAddCredits] = useState(0);
  const [extendDays, setExtendDays] = useState(30);
  const [resetExpiry, setResetExpiry] = useState(false);
  const [saving, setSaving]         = useState(false);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    
    const intentPayload = {
      plan_name: selectedPlan.key,
      add_credits: Number(addCredits),
      extend_days: Number(extendDays),
      reset_expiry: resetExpiry,
    };

    if (selectedPlan.price > 0) {
      try {
        const scriptLoaded = await loadRazorpayScript();
        if (!scriptLoaded) {
          toast.error("Failed to load Razorpay SDK. Check your connection.");
          setSaving(false);
          return;
        }

        const orderRes = await api.post(`/superadmin/subscriptions/${company.company_id}/razorpay-order`, intentPayload);
        const { order_id, key_id, amount, currency } = orderRes.data;

        const options = {
          key: key_id,
          amount: amount,
          currency: currency,
          name: "Hire IQ Credits",
          description: `Recharge for ${company.company_name || company.owner_name}`,
          order_id: order_id,
          handler: async function (response) {
            try {
              await api.post(`/superadmin/subscriptions/${company.company_id}/razorpay-verify`, {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                ...intentPayload
              });
              toast.success("Payment successful! Subscription updated.");
              onSuccess();
              onClose();
            } catch (err) {
              toast.error(err?.response?.data?.detail || "Payment verification failed.");
              setSaving(false);
            }
          },
          prefill: {
            name: company.company_name || company.owner_name,
            email: company.primary_email,
          },
          theme: {
            color: "#6366f1"
          },
          modal: {
            ondismiss: function() {
              toast.error("Payment cancelled.");
              setSaving(false);
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response){
          toast.error(response.error.description || "Payment failed");
        });
        rzp.open();
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Failed to initiate payment.");
        setSaving(false);
      }
    } else {
      try {
        const res = await api.post(`/superadmin/subscriptions/${company.company_id}/recharge`, intentPayload);
        toast.success(res.data.message || "Subscription updated!");
        onSuccess();
        onClose();
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Failed to update subscription.");
        setSaving(false);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 mt-8 md:mt-12">
      <div className="bg-[#0f0f1a] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-y-auto relative">

        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center border-b border-white/10">
          <p className="text-slate-400 text-xs mb-1">Recharging for</p>
          <h2 className="text-white text-2xl font-bold">{company.company_name || company.owner_name}</h2>
          <p className="text-slate-400 text-sm mt-1">Currently on <span className="text-indigo-400 font-semibold">{company.plan_label}</span></p>

          {/* Step tabs */}
          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              onClick={() => setStep("pick")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${step === "pick" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
            >
              1. Choose Plan
            </button>
            <div className="w-8 h-px bg-slate-700" />
            <button
              onClick={() => step !== "pick" && setStep("form")}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${step === "form" ? "bg-indigo-600 text-white" : "text-slate-500"}`}
            >
              2. Recharge Details
            </button>
          </div>
        </div>

        {/* ── STEP 1: Plan cards ────────────────────────────────────────── */}
        {step === "pick" && (
          <div className="px-6 py-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-2xl mx-auto">
              {PLANS.map(plan => {
                const isSelected = selectedPlan.key === plan.key;
                const isCurrent  = company.plan_key === plan.key;
                return (
                  <button
                    key={plan.key}
                    onClick={() => setSelectedPlan(plan)}
                    className={`relative text-left rounded-2xl p-5 border-2 transition-all duration-200 cursor-pointer group
                      ${isSelected
                        ? "border-indigo-500 bg-gradient-to-b " + plan.gradient + " scale-[1.02] shadow-xl shadow-indigo-900/30"
                        : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8"
                      }`}
                  >
                    {/* Popular badge */}
                    {plan.popular && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-400 to-indigo-500 text-white text-[10px] font-bold px-3 py-0.5 rounded-full uppercase tracking-wider">
                        Most Popular
                      </span>
                    )}
                    {/* Current badge */}
                    {isCurrent && !isSelected && (
                      <span className="absolute top-3 right-3 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Current
                      </span>
                    )}
                    {isSelected && (
                      <span className="absolute top-3 right-3 bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        ✓ Selected
                      </span>
                    )}

                    {/* Plan name */}
                    <h3 className="text-white font-bold text-lg mt-2">{plan.label}</h3>
                    <p className="text-slate-300 text-xs leading-relaxed mt-1 mb-4">{plan.summary}</p>

                    {/* Price */}
                    <div className="mb-1">
                      {plan.price > 0 ? (
                        <>
                          <span className="text-white text-2xl font-bold">₹{plan.price.toLocaleString()}</span>
                          <span className="text-slate-400 text-xs ml-1">/mo</span>
                        </>
                      ) : (
                        <span className="text-white text-2xl font-bold">Free</span>
                      )}
                    </div>

                    {/* Credits */}
                    <p className="text-xs font-semibold mb-4" style={{ color: plan.accent }}>
                      Includes {plan.credits >= 1000000 ? "∞" : plan.credits.toLocaleString()} AI interview credits
                    </p>

                    {/* Features */}
                    <ul className="space-y-1.5">
                      {plan.features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-slate-300">
                          <Check className="w-3 h-3 shrink-0" style={{ color: plan.accent }} />
                          {f}
                        </li>
                      ))}
                    </ul>

                    {/* Select button */}
                    <div className={`mt-5 w-full py-2 rounded-xl text-center text-sm font-semibold transition-all
                      ${isSelected
                        ? "bg-white text-slate-900"
                        : "bg-white/10 text-white group-hover:bg-white/20"
                      }`}
                    >
                      {isSelected ? "Selected" : "Select Plan"}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Continue */}
            <div className="flex justify-center mt-8">
              <Button
                onClick={() => setStep("form")}
                className="px-10 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold text-sm border-0 hover:opacity-90"
              >
                Continue with {selectedPlan.label} →
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Recharge form ─────────────────────────────────────── */}
        {step === "form" && (
          <div className="px-8 py-8">
            {/* Selected plan summary */}
            <div className={`rounded-xl p-4 mb-6 bg-gradient-to-r ${selectedPlan.gradient} border border-white/10 flex items-center justify-between`}>
              <div>
                <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Selected Plan</p>
                <p className="text-white text-xl font-bold mt-0.5">{selectedPlan.label}</p>
                <p className="text-white/70 text-xs mt-1">{selectedPlan.credits >= 1000000 ? "∞" : selectedPlan.credits.toLocaleString()} credits included</p>
              </div>
              <div className="text-right">
                {selectedPlan.price > 0 ? (
                  <>
                    <p className="text-white text-2xl font-bold">₹{selectedPlan.price.toLocaleString()}</p>
                    <p className="text-white/60 text-xs">per month</p>
                  </>
                ) : (
                  <p className="text-white text-2xl font-bold">Free</p>
                )}
                <button type="button" onClick={() => setStep("pick")} className="text-white/60 hover:text-white text-xs mt-2 underline">Change plan</button>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Extra Credits (on top of plan)
                  </label>
                  <input
                    type="number" min={0} value={addCredits}
                    onChange={e => setAddCredits(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
                    placeholder="0"
                  />
                  <p className="text-slate-500 text-xs mt-1">Leave 0 to use plan's default ({selectedPlan.credits >= 1000000 ? "∞" : selectedPlan.credits})</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-300 mb-2">
                    Extend Subscription (days)
                  </label>
                  <input
                    type="number" min={0} value={extendDays}
                    onChange={e => setExtendDays(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="30"
                  />
                  <p className="text-slate-500 text-xs mt-1">Default: 30 days (1 month)</p>
                </div>
              </div>

              <label className="flex items-center gap-3 text-sm text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox" checked={resetExpiry}
                  onChange={e => setResetExpiry(e.target.checked)}
                  className="rounded accent-indigo-500 w-4 h-4"
                />
                Reset expiry from today (instead of extending from current expiry date)
              </label>

              {/* Summary box */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10 text-sm space-y-2">
                <p className="text-slate-400 font-semibold text-xs uppercase tracking-wider mb-3">Summary</p>
                <div className="flex justify-between text-slate-300">
                  <span>Plan</span><span className="font-semibold text-white">{selectedPlan.label}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Credits granted</span>
                  <span className="font-semibold text-white">
                    {selectedPlan.credits >= 1000000 ? "∞" : selectedPlan.credits.toLocaleString()}
                    {Number(addCredits) > 0 && <span className="text-emerald-400"> + {Number(addCredits).toLocaleString()} extra</span>}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Validity</span><span className="font-semibold text-white">{extendDays || "—"} days</span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="outline" className="flex-1 rounded-xl border-white/20 text-slate-300 hover:bg-white/10" onClick={() => setStep("pick")} disabled={saving}>
                  ← Back
                </Button>
                <Button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-0 font-semibold" disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                  {saving ? "Processing…" : "Confirm Recharge"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscription Card
// ─────────────────────────────────────────────────────────────────────────────
function SubscriptionCard({ s, onRecharge }) {
  const [expanded, setExpanded] = useState(false);

  const creditPct = s.total_credits > 0 ? Math.min(100, Math.max(0, Math.round((s.credits_available / s.total_credits) * 100))) : 0;
  const creditsUsed = Math.max(0, s.total_credits - s.credits_available);
  const creditBarColor = creditPct > 50 ? "bg-emerald-500" : creditPct > 20 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Top: owner info + status */}
      <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <Avatar name={s.company_name || s.owner_name} />
          <div className="min-w-0">
            <p className="text-lg font-bold text-slate-800 truncate leading-tight">
              {s.company_name || s.owner_name}
            </p>
            {s.primary_email && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500 truncate">{s.primary_email}</p>
              </div>
            )}
            <div className="mt-2">
              <PlanBadge label={s.plan_label} planKey={s.plan_key} />
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusPill status={s.status} />
          <Button
            size="sm" variant="outline"
            className="gap-1.5 text-xs h-7 rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50"
            onClick={() => onRecharge(s)}
          >
            <Edit3 className="w-3 h-3" />
            {s.status === "expired" ? "Renew" : "Recharge"}
          </Button>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-slate-100" />

      {/* Stats grid */}
      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Credits */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Credits</p>
          <p className="text-xl font-bold text-slate-800">{s.credits_available.toLocaleString()}</p>
          <p className="text-xs text-slate-400">of {s.total_credits.toLocaleString()} total</p>
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${creditBarColor}`} style={{ width: `${creditPct}%` }} />
          </div>
        </div>

        {/* Plan Price */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Plan Price</p>
          <p className="text-xl font-bold text-slate-800">
            {s.mrr > 0 ? `₹${s.mrr.toLocaleString()}` : "—"}
          </p>
          <p className="text-xs text-slate-400">per month</p>
        </div>

        {/* Renews */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Renews On</p>
          <p className="text-base font-bold text-slate-800">{s.renews_on ?? "—"}</p>
          {s.days_remaining !== null && s.days_remaining !== undefined && (
            <p className={`text-xs font-medium ${s.days_remaining <= 30 ? "text-rose-500" : "text-slate-400"}`}>
              {s.days_remaining}d remaining
            </p>
          )}
        </div>

        {/* Credits Used */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Credits Used</p>
          <p className="text-xl font-bold text-slate-800">{creditsUsed.toLocaleString()}</p>
          <p className="text-xs text-slate-400">{creditPct}% remaining</p>
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(p => !p)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors border-t border-slate-100"
      >
        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> Hide details</> : <><ChevronDown className="w-3.5 h-3.5" /> View plan features & history</>}
      </button>

      {/* Expanded */}
      {expanded && <DetailPanel companyId={s.company_id} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function SubscriptionManagementPage() {
  const [subs, setSubs]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rechargeTarget, setRechargeTarget] = useState(null);
  const [error, setError]       = useState(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [subsRes, statsRes] = await Promise.all([
        api.get("/superadmin/subscriptions"),
        api.get("/superadmin/subscriptions/stats"),
      ]);
      setSubs(subsRes.data?.data || []);
      setStats(statsRes.data);
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to load subscriptions.";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <AdminShell title="Subscription Management" description="Plans, renewals and billing for every organization.">
        <div className="flex h-64 items-center justify-center gap-3 text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading subscriptions…</span>
        </div>
      </AdminShell>
    );
  }

  if (error) {
    return (
      <AdminShell title="Subscription Management" description="Plans, renewals and billing for every organization.">
        <div className="flex flex-col h-64 items-center justify-center gap-4 text-slate-400">
          <AlertCircle className="h-10 w-10 text-rose-400" />
          <p className="text-sm">{error}</p>
          <Button size="sm" onClick={() => fetchData()}>Retry</Button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Subscription Management" description="Plans, renewals and billing for every organization.">

      {/* ── KPI Stats ─────────────────────────────────────────────────────── */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={Building2}   label="Total Orgs"      value={stats.total_organisations}  gradient="bg-gradient-to-br from-indigo-500 to-indigo-700" />
          <StatCard icon={CheckCircle} label="Active"          value={stats.active_subscriptions} gradient="bg-gradient-to-br from-emerald-500 to-emerald-700" />
          <StatCard icon={TrendingUp}  label="Total Revenue" value={`₹${(stats.total_mrr || 0).toLocaleString()}`} gradient="bg-gradient-to-br from-violet-500 to-violet-700" />
          <StatCard icon={Zap}         label="Credits Issued"  value={(stats.total_credits_issued || 0).toLocaleString()} sub={`${(stats.total_credits_consumed || 0).toLocaleString()} consumed`} gradient="bg-gradient-to-br from-amber-500 to-orange-600" />
        </div>
      )}

      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Active subscriptions</h2>
          <p className="text-xs text-slate-400">{subs.length} organisation{subs.length !== 1 ? "s" : ""}</p>
        </div>
        <Button size="sm" variant="ghost" className="gap-2 text-xs text-slate-500" onClick={() => fetchData(true)} disabled={refreshing}>
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      {subs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <BarChart2 className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">No subscriptions found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {subs.map(s => (
            <SubscriptionCard key={s.company_id} s={s} onRecharge={setRechargeTarget} />
          ))}
        </div>
      )}

      {/* ── Recharge Modal ─────────────────────────────────────────────────── */}
      {rechargeTarget && (
        <RechargeModal
          company={rechargeTarget}
          onClose={() => setRechargeTarget(null)}
          onSuccess={() => fetchData(true)}
        />
      )}
    </AdminShell>
  );
}