import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { loadDashboardData } from "../../store/slices/dashboardSlice";
import CandidateDialog from '../../components/superadmin/CandidateDialog';

import {
  Search,
  Bell,
  Users,
  Briefcase,
  UserCheck,
  Target,
  Mic,
  Star,
  Clock,
  Send,
  Plus,
  FileUp,
  UserPlus,
  BarChart3,
  Calendar as CalendarIcon,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Activity,
  TrendingUp,
  MessageSquare,
  Award,
  Zap,
  PhoneCall,
  XCircle,
  Radio,
} from "lucide-react";

import Card from "../../components/Card";
import Button from "../../components/Button";
import Badge from "../../components/Badge";
import Input from "../../components/Input";

const Progress = ({ value, className = "", ...props }) => (
  <div className={`overflow-hidden rounded-full bg-slate-200 ${className}`} {...props}>
    <div className="h-full bg-indigo-600 transition-all" style={{ width: `${value || 0}%` }} />
  </div>
);

const Avatar = ({ className = "", children, ...props }) => (
  <div className={`relative flex shrink-0 overflow-hidden rounded-full ${className}`} {...props}>
    {children}
  </div>
);

const AvatarFallback = ({ className = "", children, ...props }) => (
  <div className={`flex h-full w-full items-center justify-center rounded-full bg-slate-100 ${className}`} {...props}>
    {children}
  </div>
);

const Separator = ({ className = "", orientation = "horizontal", ...props }) => (
  <div className={`shrink-0 bg-slate-200 ${orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]"} ${className}`} {...props} />
);

const quickActions = [
  { label: "Create AI Interview", icon: Plus, path: "/admin/create-interview" },
  { label: "Upload Job Description", icon: FileUp, path: "/admin/create-interview" },
  { label: "Invite Candidates", icon: UserPlus, path: "/admin/qualified-candidates" },
  { label: "View Analytics", icon: BarChart3, path: "/admin/dashboard" },
  { label: "Review Top Candidates", icon: Star, path: "/admin/qualified-candidates" },
  { label: "Schedule Interview", icon: CalendarIcon, path: "/admin/create-interview" },
];

const tintClasses = {
  primary: "bg-primary/10 text-primary",
  info: "bg-info/10 text-info",
  accent: "bg-accent text-accent-foreground",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
};

function initials(name) {
  if (!name) return "NA";
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

export default function OverviewDashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  const authRole = useSelector((state) => state.auth.role);
  const dbStats = useSelector((state) => state.dashboard.dbStats);
  const candidates = useSelector((state) => state.candidates.candidates);
  const ongoingLiveCount = useSelector((state) => state.dashboard.ongoingLiveCount);
  const ongoingAlertCount = useSelector((state) => state.dashboard.ongoingAlertCount);
  const dashboardStatus = useSelector((state) => state.dashboard.status);

  useEffect(() => {
    dispatch(loadDashboardData());
  }, [dispatch]);

  const kpis = [
    { label: "Total Candidates", value: dbStats?.total || "0", icon: Users, tint: "primary", delta: "" },
    { label: "Candidates Selected", value: dbStats?.selected || "0", icon: Target, tint: "success", delta: "" },
    { label: "AI Interviews Completed", value: dbStats?.completed || "0", icon: Mic, tint: "accent", delta: "" },
    { label: "Average AI Score", value: `${dbStats?.avg_score || "0"}%`, icon: Star, tint: "warning", delta: "" },
    { label: "Pending Reviews", value: dbStats?.pending || "0", icon: Clock, tint: "info", delta: "" },
    { label: "Started", value: dbStats?.started || "0", icon: Activity, tint: "primary", delta: "" },
    { label: "Rejected Candidates", value: dbStats?.rejected || "0", icon: XCircle, tint: "destructive", delta: "" },
    { label: "Expired", value: dbStats?.expired || "0", icon: AlertCircle, tint: "warning", delta: "" },
  ];

  const pipeline = [
    { stage: "Applied", count: parseInt(dbStats?.total) || 0, color: "#9CA3AF" },
    { stage: "AI Resume Screening", count: parseInt(dbStats?.total) || 0, color: "#38BDF8" },
    { stage: "AI Voice Interview", count: parseInt(dbStats?.started) || 0, color: "#06B6D4" },
    { stage: "AI Evaluation", count: parseInt(dbStats?.completed) || 0, color: "#3B82F6" },
    { stage: "Recruiter Review", count: parseInt(dbStats?.pending) || 0, color: "#8B5CF6" },
    { stage: "Shortlisted", count: parseInt(dbStats?.selected) || 0, color: "#D946EF" },
    { stage: "Offer", count: 0, color: "#F97316" },
    { stage: "Hired", count: 0, color: "#10B981" },
  ];

  const todaysTasks = [
    { label: "Candidates Awaiting Review", count: dbStats?.pending || 0, icon: UserCheck, tone: "info" },
    { label: "Interviews In Progress", count: ongoingLiveCount || 0, icon: Activity, tone: "primary" },
    { label: "Alerts Requiring Attention", count: ongoingAlertCount || 0, icon: AlertCircle, tone: "warning" },
    { label: "Rejected Candidates", count: dbStats?.rejected || 0, icon: XCircle, tone: "destructive" },
  ];

  const interviewStatus = [
    { label: "Live Interviews", count: ongoingLiveCount || 0, dot: "bg-success", pulse: true },
    { label: "Started", count: dbStats?.started || 0, dot: "bg-info", pulse: false },
    { label: "Completed", count: dbStats?.completed || 0, dot: "bg-primary", pulse: false },
    { label: "Expired", count: dbStats?.expired || 0, dot: "bg-destructive", pulse: false },
  ];

  const topCandidates = candidates ? candidates.filter(c => parseFloat(c.score || c.avg_score || 0) >= 80) : [];

  const recommendations = [
    { text: `${topCandidates.length} candidates with high AI Scores (>= 80%)`, icon: Sparkles, priority: "High" },
    { text: `${dbStats?.pending || 0} candidates awaiting recruiter approval`, icon: UserCheck, priority: "High" },
    { text: `${ongoingAlertCount || 0} alerts from ongoing interviews`, icon: AlertCircle, priority: "Medium" },
  ];

  const analyticsKpis = [
    { label: "Candidates Screened", value: dbStats?.total || "0", trend: "" },
    { label: "AI Interviews Completed", value: dbStats?.completed || "0", trend: "" },
    { label: "Candidates Selected", value: dbStats?.selected || "0", trend: "" },
    { label: "Candidates Rejected", value: dbStats?.rejected || "0", trend: "" },
  ];

  const sortedCandidates = candidates ? [...candidates].sort((a, b) => new Date(b.created_at || b.updated_at) - new Date(a.created_at || a.updated_at)).slice(0, 6) : [];
  const activity = sortedCandidates.map(c => ({
    icon: c.decision === "selected" ? Award : (c.decision === "rejected" ? XCircle : CheckCircle2),
    text: `${c.candidate_name || "Candidate"} - ${c.interview_title || "Role"} (${c.status || "Assigned"})`,
    time: new Date(c.created_at || c.updated_at || new Date()).toLocaleDateString(),
    tone: c.decision === "selected" ? "success" : (c.decision === "rejected" ? "destructive" : "info")
  }));


  const maxPipeline = Math.max(...pipeline.map((p) => p.count), 1);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-slate-50/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-9 w-9 place-items-center rounded-lg text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <Sparkles className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Recruiter Console</div>
              <div className="text-[11px] text-muted-foreground">AI-Powered Recruitment Workspace</div>
            </div>
          </div>

          <div className="relative ml-6 hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search candidates, jobs, recruiters…"
              className="h-9 pl-9 bg-slate-50 border-transparent focus-visible:bg-slate-50"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4.5 w-4.5" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
            </Button>
            <Separator orientation="vertical" className="mx-1 h-6" />
            <div className="flex items-center gap-2.5 pr-1">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                  {initials("Current Admin")}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-right leading-tight sm:block">
                <div className="text-[13px] font-medium">Current Admin</div>
                <div className="text-[11px] text-muted-foreground">Lead Recruiter</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-6 px-6 py-6">
        {/* Greeting */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-time snapshot across jobs, candidates and AI-driven interviews.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 py-1.5 px-2.5">
              <Radio className="h-3 w-3 text-success animate-pulse" />
              <span className="text-xs">Live · {dashboardStatus === "loading" ? "syncing..." : "synced"}</span>
            </Badge>
          </div>
        </section>

        {/* KPI Cards */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-4">
          {kpis.map((k) => {
            const Icon = k.icon;
            return (
              <Card
                key={k.label}
                className="group relative overflow-hidden border-border/60 p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)] bg-white"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">{k.label}</div>
                    <div className="mt-2 text-[28px] font-semibold leading-none tracking-tight">
                      {k.value}
                    </div>
                    {k.delta && (
                      <div className="mt-2 flex items-center gap-1 text-[11px] text-success">
                        <TrendingUp className="h-3 w-3" />
                        {k.delta}
                      </div>
                    )}
                  </div>
                  <div
                    className={`grid h-10 w-10 place-items-center rounded-lg ${tintClasses[k.tint]}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                </div>
              </Card>
            );
          })}
        </section>

        {/* Pipeline */}
        <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Candidate Pipeline</h2>
              <p className="text-xs text-muted-foreground">
                Volume flowing through every stage of the AI hiring funnel.
              </p>
            </div>
            <Badge variant="outline" className="text-xs">All Time</Badge>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-4">
            {pipeline.map((p, i) => (
              <div key={p.stage} className="relative">
                <div
                  className="rounded-lg p-3.5 text-white"
                  style={{ background: p.color }}
                >
                  <div className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                    Stage {i + 1}
                  </div>
                  <div className="mt-1 text-xl font-semibold">{p.count.toLocaleString()}</div>
                  <div className="mt-0.5 text-[11px] opacity-90">{p.stage}</div>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(p.count / maxPipeline) * 100}%`, background: p.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recruiter Table */}
        <Card className="border-border/60 shadow-[var(--shadow-card)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
            <div>
              <h2 className="text-base font-semibold">Recruiter Performance</h2>
              <p className="text-xs text-muted-foreground">
                Leaderboard by AI-assisted output and hiring conversion.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-border/60 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-6 py-2.5 font-medium">Candidate</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>

                  <th className="px-3 py-2.5 font-medium">AI Score</th>
                  <th className="px-6 py-2.5 font-medium">Status</th>
                  <th className="px-6 py-2.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {candidates && candidates.filter(c => c.decision !== "selected" && c.decision !== "rejected").slice(0, 10).map((c, i) => (
                  <tr key={c.id || i} className="border-b border-border/50 last:border-0 hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                            {initials(c.candidate_name || c.name || "C")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">{c.candidate_name || c.name || "Candidate"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{c.interview_title || c.job_title || "N/A"}</td>

                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.round(c.score || c.avg_score || 0)} className="h-1.5 w-24" />
                        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(c.score || c.avg_score || 0)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge
                        variant="outline"
                        className={
                          (c.decision === "selected" || c.decision === "hired")
                            ? "border-success/30 bg-success/10 text-success"
                            : c.decision === "rejected"
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : "border-warning/30 bg-warning/10 text-warning-foreground"
                        }
                      >
                        <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${(c.decision === "selected" || c.decision === "hired") ? "bg-success" : c.decision === "rejected" ? "bg-destructive" : "bg-warning"}`} />
                        {c.decision ? (c.decision.charAt(0).toUpperCase() + c.decision.slice(1)) : (c.status ? c.status.charAt(0).toUpperCase() + c.status.slice(1) : "Pending")}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-xs"
                        onClick={() => setSelectedCandidate(c)}
                      >
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Tasks / Recommendations / Live */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Action Items</h3>
                <p className="text-xs text-muted-foreground">Your work queue</p>
              </div>
              <Badge variant="secondary" className="text-xs">{todaysTasks.length} items</Badge>
            </div>
            <ul className="mt-4 space-y-2">
              {todaysTasks.map((t) => {
                const Icon = t.icon;
                return (
                  <li
                    key={t.label}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-white px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`grid h-8 w-8 place-items-center rounded-md ${tintClasses[t.tone]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tabular-nums">{t.count}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] bg-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="grid h-7 w-7 place-items-center rounded-md text-primary-foreground"
                  style={{ background: "var(--gradient-primary)" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-base font-semibold">AI Recommendations</h3>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5">
              {recommendations.map((r, i) => {
                const Icon = r.icon;
                return (
                  <li
                    key={i}
                    className="group flex items-start gap-3 rounded-lg border border-border/50 p-3 transition-all hover:border-primary/40 hover:shadow-sm"
                  >
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{r.text}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Priority: {r.priority} · Suggested by AI
                      </div>
                    </div>
                  </li>
                );
              })}
              {recommendations.length === 0 && (
                <div className="text-sm text-slate-500 py-4 text-center">No new recommendations</div>
              )}
            </ul>
          </Card>

          <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">AI Interview Activity</h3>
                <p className="text-xs text-muted-foreground">Real-time interview status</p>
              </div>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {interviewStatus.map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border/50 bg-gradient-to-br from-white to-slate-50 p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <span className={`relative flex h-2 w-2`}>
                      {s.pulse && (
                        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${s.dot} opacity-75`} />
                      )}
                      <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
                  </div>
                  <div className="mt-1.5 text-2xl font-semibold tabular-nums">{s.count}</div>
                </div>
              ))}
            </div>

            <Separator className="my-5" />

            <div>
              <div className="text-xs font-medium text-muted-foreground">Live Interview Load</div>
              <div className="mt-2 flex items-center gap-2">
                <Progress value={ongoingLiveCount > 0 ? 100 : 0} className="h-2" />
                <span className="text-xs tabular-nums">{ongoingLiveCount > 0 ? "Active" : "Idle"}</span>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {ongoingLiveCount} concurrent AI voice sessions active
              </p>
            </div>
          </Card>
        </section>

        {/* Recruiter Analytics */}
        <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Recruiter Analytics</h2>
              <p className="text-xs text-muted-foreground">Key performance indicators across the team</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 bg-slate-50 p-0.5 text-xs">
              {["All Time"].map((t, i) => (
                <button
                  key={t}
                  className={`rounded px-2.5 py-1 ${i === 0 ? "bg-slate-50 shadow-sm font-medium" : "text-muted-foreground"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            {analyticsKpis.map((a) => (
              <div
                key={a.label}
                className="rounded-lg border border-border/50 bg-gradient-to-br from-white to-slate-50 p-4"
              >
                <div className="text-[11px] font-medium text-muted-foreground">{a.label}</div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-xl font-semibold tabular-nums">{a.value}</span>
                  {a.trend && <span className="text-[11px] font-medium text-success">{a.trend}</span>}
                </div>
                <div className="mt-3 flex h-6 items-end gap-0.5">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-sm bg-primary/70"
                      style={{ height: `${20 + ((i * 13 + String(a.value).length * 7) % 80)}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Activity + Quick Actions */}
        <section className="grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] lg:col-span-2 bg-white">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold">Recent Activity</h3>
                <p className="text-xs text-muted-foreground">Notifications & timeline</p>
              </div>
            </div>
            <ol className="mt-4 space-y-3">
              {activity.length > 0 ? activity.map((a, i) => {
                const Icon = a.icon;
                return (
                  <li key={i} className="relative flex gap-3">
                    <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tintClasses[a.tone]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 border-b border-border/50 pb-3 last:border-0">
                      <div className="text-sm">{a.text}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{a.time}</div>
                    </div>
                  </li>
                );
              }) : (
                <div className="text-sm text-slate-500 py-4 text-center">No recent activity</div>
              )}
            </ol>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/60 p-6 shadow-[var(--shadow-card)] bg-white">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">Quick Actions</h3>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {quickActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button
                      key={a.label}
                      onClick={() => navigate(a.path)}
                      className="group flex flex-col items-start gap-2 rounded-lg border border-border/60 bg-white p-3 text-left transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-sm"
                    >
                      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-[12.5px] font-medium leading-tight">{a.label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card
              className="relative overflow-hidden border-0 p-6 text-primary-foreground shadow-[var(--shadow-glow)]"
              style={{ background: "var(--gradient-primary)" }}
            >
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
              <AlertCircle className="h-5 w-5 opacity-90" />
              <h3 className="mt-3 text-base font-semibold">AI Hiring Insight</h3>
              <p className="mt-1.5 text-sm opacity-90">
                You have {topCandidates.length} high-scoring candidates waiting. Review them to speed up your conversion rates.
              </p>
              <Button size="sm" variant="secondary" className="mt-4 bg-white text-primary hover:bg-white/90">
                Explore cohort
              </Button>
            </Card>
          </div>
        </section>

        <footer className="pb-2 pt-4 text-center text-xs text-muted-foreground">
          Enterprise · Role-Based Permissions · Multi-Department Hiring · Audit Trail · AI Hiring Insights
        </footer>

        <CandidateDialog
          candidate={selectedCandidate}
          open={!!selectedCandidate}
          onOpenChange={(v) => !v && setSelectedCandidate(null)}
        />
      </main>
    </div>
  );
}
