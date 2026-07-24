import React, { useEffect, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useNavigate, useOutletContext } from "react-router-dom";
import { loadDashboardData } from "../../store/slices/dashboardSlice";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../components/ui/table";
import CandidateDialog from '../../components/superadmin/CandidateDialog';
import CallDetailsModal from "./CallDetailsModal";
import { CandidateFilters } from "../../components/admin/AdminSubComponents";
import Modal from "../../components/Modal";

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
  Eye,
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
  { label: "Invite Candidates", icon: UserPlus, path: "/admin/interviews" },
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
  const [listModalOpen, setListModalOpen] = useState(false);
  const [listModalTitle, setListModalTitle] = useState("");
  const [listModalCandidates, setListModalCandidates] = useState([]);
  const [listModalFilterType, setListModalFilterType] = useState(null);
  const [loadingModalRecords, setLoadingModalRecords] = useState(false);

  // Keep these states so existing code (like activeFilter references) does not break
  const [activeActionFilter, setActiveActionFilter] = useState(null);
  const [activeRecFilter, setActiveRecFilter] = useState(null);
  const [activeActivityFilter, setActiveActivityFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pipelineFilter, setPipelineFilter] = useState("all");
  const [positionFilter, setPositionFilter] = useState("all");
  const [sortBy, setSortBy] = useState("score");

  const handleOpenRecordsModal = async (filterType, title) => {
    setListModalFilterType(filterType);
    setListModalTitle(title);
    setListModalOpen(true);
    setLoadingModalRecords(true);
    setListModalCandidates([]);

    try {
      const result = await dispatch(loadDashboardData()).unwrap();
      const allCandidates = result.candidates || [];

      let filtered = [];
      if (filterType === "pending") {
        filtered = allCandidates.filter(c => (c.status || "").toLowerCase() === "pending");
      } else if (filterType === "live") {
        filtered = allCandidates.filter(c => (c.status || "").toLowerCase() === "started" || c.online);
      } else if (filterType === "alerts") {
        filtered = allCandidates.filter(c => parseInt(c.proctoring_alerts || 0) > 0);
      } else if (filterType === "rejected") {
        filtered = allCandidates.filter(c => (c.decision || "").toLowerCase() === "rejected");
      } else if (filterType === "high_scores") {
        filtered = allCandidates.filter(c => parseFloat(c.score || c.avg_score || 0) >= 80);
      }
      setListModalCandidates(filtered);
    } catch (err) {
      console.error("Failed to fetch records:", err);
    } finally {
      setLoadingModalRecords(false);
    }
  };

  const handleViewCandidateFromModal = (candidate) => {
    setSelectedCandidate(candidate);
    setListModalOpen(false);
  };

  const { role: authRole, API_BASE_URL, token } = useSelector((state) => state.auth);
  const dbStats = useSelector((state) => state.dashboard.dbStats);
  const candidates = useSelector((state) => state.candidates.candidates);
  const ongoingLiveCount = useSelector((state) => state.dashboard.ongoingLiveCount);
  const ongoingAlertCount = useSelector((state) => state.dashboard.ongoingAlertCount);
  const dashboardStatus = useSelector((state) => state.dashboard.status);
  const liveSessions = useSelector((state) => state.dashboard.liveSessions);
  const { handleOpenLiveStreamAction } = useOutletContext() || {};

  useEffect(() => {
    dispatch(loadDashboardData());
  }, [dispatch]);

  const activeFilter = activeActionFilter || activeRecFilter || activeActivityFilter;

  const filteredTableCandidates = (candidates ? candidates.filter((c) => {
    let matchesSearch = true;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (c.candidate_name || c.name || "").toLowerCase().includes(q);
      const matchTitle = (c.interview_title || c.job_title || "").toLowerCase().includes(q);
      matchesSearch = matchName || matchTitle;
    }

    if (!activeFilter && !startDate && !endDate && statusFilter === "all" && pipelineFilter === "all" && positionFilter === "all") return matchesSearch;
    if (!matchesSearch) return false;

    // Additional filters
    if (statusFilter !== "all") {
      const computedStatus = (c.status || "").toLowerCase();
      const decision = (c.decision || "").toLowerCase();
      if (statusFilter === "completed" && computedStatus !== "completed") return false;
      if (statusFilter === "pending" && computedStatus !== "pending") return false;
      if (statusFilter === "started" && computedStatus !== "started") return false;
      if (statusFilter === "expired" && computedStatus !== "expired") return false;
    }

    if (pipelineFilter !== "all") {
      if ((c.pipeline_type || "hireiq").toLowerCase() !== pipelineFilter.toLowerCase()) return false;
    }

    if (positionFilter !== "all") {
      if (c.interview_title !== positionFilter && c.job_title !== positionFilter) return false;
    }

    if (startDate) {
      const cDate = new Date(c.created_at || c.updated_at);
      if (cDate < new Date(startDate)) return false;
    }

    if (endDate) {
      const cDate = new Date(c.created_at || c.updated_at);
      const endD = new Date(endDate);
      endD.setHours(23, 59, 59, 999);
      if (cDate > endD) return false;
    }

    const computedStatus = (c.status || "").toLowerCase();
    const decision = (c.decision || "").toLowerCase();
    const alerts = parseInt(c.proctoring_alerts || 0);

    if (activeFilter === "pending") {
      return computedStatus === "pending";
    }
    if (activeFilter === "live") {
      return computedStatus === "started" || c.online;
    }
    if (activeFilter === "started") {
      return computedStatus === "started";
    }
    if (activeFilter === "completed") {
      return computedStatus === "completed";
    }
    if (activeFilter === "expired") {
      return computedStatus === "expired";
    }
    if (activeFilter === "alerts") {
      return alerts > 0;
    }
    if (activeFilter === "rejected") {
      return decision === "rejected";
    }
    if (activeFilter === "high_scores") {
      return parseFloat(c.score || c.avg_score || 0) >= 80;
    }
    return true;
  }) : []).sort((a, b) => {
    if (sortBy === 'score') {
      const scoreA = parseFloat(a.score || a.avg_score || 0);
      const scoreB = parseFloat(b.score || b.avg_score || 0);
      return scoreB - scoreA;
    } else {
      const dateA = new Date(a.created_at || a.updated_at || 0);
      const dateB = new Date(b.created_at || b.updated_at || 0);
      return dateB - dateA;
    }
  });

  const kpis = [
    { label: "Total Candidates", value: dbStats?.total || "0", icon: Users, tint: "primary", delta: "", filterType: null, navPath: null },
    { label: "Candidates Selected", value: dbStats?.selected || "0", icon: Target, tint: "success", delta: "", filterType: null, navPath: "/admin/qualified-candidates" },
    { label: "AI Interviews Completed", value: dbStats?.completed || "0", icon: Mic, tint: "accent", delta: "", filterType: "completed", navPath: "/admin/interviews" },
    { label: "Average AI Score", value: `${dbStats?.avg_score || "0"}%`, icon: Star, tint: "warning", delta: "", filterType: "high_scores", navPath: null },
    { label: "Pending Reviews", value: dbStats?.pending || "0", icon: Clock, tint: "info", delta: "", filterType: "pending", navPath: null },
    { label: "Started", value: dbStats?.started || "0", icon: Activity, tint: "primary", delta: "", filterType: "live", navPath: null },
    { label: "Rejected Candidates", value: dbStats?.rejected || "0", icon: XCircle, tint: "destructive", delta: "", filterType: "rejected", navPath: "/admin/rejected-candidates" },
    { label: "Expired", value: dbStats?.expired || "0", icon: AlertCircle, tint: "warning", delta: "", filterType: "expired", navPath: null },
  ];

  const pipeline = [
    { stage: "Total Assigned", count: parseInt(dbStats?.total) || 0, color: "oklch(0.75 0.05 250)" },
    { stage: "Started", count: parseInt(dbStats?.started) || 0, color: "oklch(0.7 0.12 240)" },
    { stage: "Completed", count: parseInt(dbStats?.completed) || 0, color: "oklch(0.65 0.16 220)" },
    { stage: "Pending Review", count: parseInt(dbStats?.pending) || 0, color: "oklch(0.6 0.18 260)" },
    { stage: "Selected", count: parseInt(dbStats?.selected) || 0, color: "oklch(0.68 0.18 320)" },
    { stage: "Rejected", count: parseInt(dbStats?.rejected) || 0, color: "oklch(0.72 0.17 45)" },
  ];

  const topCandidates = candidates ? candidates.filter(c => parseFloat(c.score || c.avg_score || 0) >= 80) : [];

  const dashboardSummary = {
    pendingReviews: parseInt(dbStats?.pending) || 0,
    liveInterviews: ongoingLiveCount || 0,
    alertsCount: ongoingAlertCount || 0,
    rejectedCount: parseInt(dbStats?.rejected) || 0,
    startedCount: parseInt(dbStats?.started) || 0,
    completedCount: parseInt(dbStats?.completed) || 0,
    expiredCount: parseInt(dbStats?.expired) || 0,
    highScoreCount: topCandidates.length
  };

  const todaysTasks = [
    { label: "Candidates Awaiting Review", count: dashboardSummary.pendingReviews, icon: UserCheck, tone: "info" },
    { label: "Interviews In Progress", count: dashboardSummary.liveInterviews, icon: Activity, tone: "primary" },
    { label: "Alerts Requiring Attention", count: dashboardSummary.alertsCount, icon: AlertCircle, tone: "warning" },
    { label: "Rejected Candidates", count: dashboardSummary.rejectedCount, icon: XCircle, tone: "destructive" },
  ];

  const interviewStatus = [
    { label: "Live Interviews", count: dashboardSummary.liveInterviews, dot: "bg-success", pulse: true },
    { label: "Started", count: dashboardSummary.startedCount, dot: "bg-info", pulse: false },
    { label: "Completed", count: dashboardSummary.completedCount, dot: "bg-primary", pulse: false },
    { label: "Expired", count: dashboardSummary.expiredCount, dot: "bg-destructive", pulse: false },
  ];

  const recommendations = [
    { text: `${dashboardSummary.highScoreCount} candidates with high AI Scores (>= 80%)`, icon: Sparkles, priority: "High", type: "high_scores" },
    { text: `${dashboardSummary.pendingReviews} candidates awaiting recruiter approval`, icon: UserCheck, priority: "High", type: "pending" },
    { text: `${dashboardSummary.alertsCount} alerts from ongoing interviews`, icon: AlertCircle, priority: "Medium", type: "alerts" },
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
            const isClickable = k.navPath || k.filterType;
            return (
              <Card
                key={k.label}
                onClick={() => {
                  if (k.navPath) {
                    navigate(k.navPath);
                  } else if (k.filterType) {
                    handleOpenRecordsModal(k.filterType, k.label);
                  }
                }}
                className={`group relative overflow-hidden border-border/60 p-5 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-glow)] bg-white ${
                  isClickable ? "cursor-pointer hover:border-primary/40" : ""
                }`}
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
                    {isClickable && (
                      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        <ChevronRight className="h-3 w-3" />
                        <span>View details</span>
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

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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

        {/* Live Sessions Table */}
        <Card className="border-border/60 shadow-[var(--shadow-card)] bg-white mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
            <div>
              <h2 className="text-base font-semibold">Live Interview Sessions</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Active and recently monitored candidate sessions.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-y border-border/60 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <TableHead className="px-6 py-2.5 font-medium">Candidate</TableHead>
                  <TableHead className="px-3 py-2.5 font-medium">Interview</TableHead>
                  <TableHead className="px-3 py-2.5 font-medium">Status</TableHead>
                  <TableHead className="px-3 py-2.5 font-medium text-center">Progress</TableHead>
                  <TableHead className="px-3 py-2.5 font-medium text-right">Alerts</TableHead>
                  <TableHead className="px-3 py-2.5 font-medium text-right">Audio Level</TableHead>
                  <TableHead className="px-6 py-2.5 font-medium text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveSessions?.slice(0, 5).map((session, i) => (
                  <TableRow key={i} className="border-b border-border/50 last:border-0 hover:bg-slate-50">
                    <TableCell className="px-6 py-3 font-medium">{session.candidate_name || "Unknown"}</TableCell>
                    <TableCell className="px-3 py-3 text-muted-foreground">{session.interview_title || session.link_id}</TableCell>
                    <TableCell className="px-3 py-3">
                      <Badge variant={session.online ? "default" : "secondary"} className={session.online ? "bg-emerald-500/15 text-emerald-700 border-0" : "border-0"}>
                        {session.online ? "Online" : "Offline"}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center whitespace-nowrap">
                      {session.current_question ? (
                        <div className="flex flex-col items-center gap-1">
                          {session.round_type && (
                            <span className="text-[10px] uppercase font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                              {session.round_type}
                            </span>
                          )}
                          <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">
                            Q{session.current_question} / {session.total_questions || '-'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right tabular-nums text-xs">{session.proctoring_alerts || 0}</TableCell>
                    <TableCell className="px-3 py-3 flex items-center justify-end">
                      <Progress value={(session.audio_level || 0) * 10} className="h-1.5 w-16 ml-2" />
                    </TableCell>
                    <TableCell className="px-6 py-3 text-right">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => handleOpenLiveStreamAction && handleOpenLiveStreamAction(session)}
                        className="h-8 text-xs font-semibold hover:bg-indigo-50 hover:text-indigo-600 border-indigo-100 transition-colors bg-white shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> Monitor
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(!liveSessions || liveSessions.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-500 py-6">No active sessions being monitored</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Recruiter Table */}
        <Card className="border-border/60 shadow-[var(--shadow-card)] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 pb-4">
            <div>
              <h2 className="text-base font-semibold">
                {activeFilter ? `Action Item Records (${filteredTableCandidates.length})` : "Recruiter Performance"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeFilter ? `Displaying matching records for the active action card.` : "Leaderboard by AI-assisted output and hiring conversion."}
              </p>
            </div>
            <div className="w-full mt-4">
              <CandidateFilters
                searchTerm={searchQuery}
                setSearchTerm={setSearchQuery}
                startDate={startDate}
                setStartDate={setStartDate}
                endDate={endDate}
                setEndDate={setEndDate}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                pipelineFilter={pipelineFilter}
                setPipelineFilter={setPipelineFilter}
                positionFilter={positionFilter}
                setPositionFilter={setPositionFilter}
                sortBy={sortBy}
                setSortBy={setSortBy}
                allCandidates={candidates || []}
              />
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
                {filteredTableCandidates && filteredTableCandidates.slice(0, 10).map((c, i) => (
                  <tr key={c.id || i} onClick={() => setSelectedCandidate(c)} className="border-b border-border/50 last:border-0 hover:bg-slate-50 cursor-pointer">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-semibold">
                            {initials(c.candidate_name || c.name || "C")}
                          </AvatarFallback>
                        </Avatar>
                        <div className="font-medium">
                          {c.candidate_id && <span className="text-[0.65rem] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold mr-1">{c.candidate_id}</span>}
                          {c.candidate_name || c.name || "Candidate"}
                        </div>
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
                        onClick={(e) => { e.stopPropagation(); setSelectedCandidate(c); }}
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
                const filterType = t.label === "Candidates Awaiting Review" ? "pending" :
                  t.label === "Interviews In Progress" ? "live" :
                    t.label === "Alerts Requiring Attention" ? "alerts" :
                      t.label === "Rejected Candidates" ? "rejected" : null;

                return (
                  <li
                    key={t.label}
                    onClick={() => handleOpenRecordsModal(filterType, t.label)}
                    className="flex items-center justify-between rounded-lg border border-border/50 bg-white px-3 py-2.5 transition-colors cursor-pointer hover:border-primary/40 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-sm">{t.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tabular-nums">{t.count}</span>
                      <div className="p-1 hover:bg-slate-200/50 rounded-full transition-colors cursor-pointer">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
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
                    onClick={() => handleOpenRecordsModal(r.type, r.text)}
                    className="group flex items-start gap-3 rounded-lg border border-border/50 bg-white p-3 transition-all cursor-pointer hover:border-primary/40 hover:shadow-sm"
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
              {interviewStatus.map((s) => {
                return (
                  <div
                    key={s.label}
                    className="rounded-lg border border-border/50 bg-gradient-to-br from-white to-slate-50 p-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        {s.pulse && (
                          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${s.dot} opacity-75`} />
                        )}
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${s.dot}`} />
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground">{s.label}</span>
                    </div>
                    <div className="mt-1.5 text-2xl font-semibold tabular-nums">{s.count}</div>
                  </div>
                );
              })}
            </div>

            <Separator className="my-5" />

            <div>
              <div className="text-xs font-medium text-muted-foreground">Live Interview Load</div>
              <div className="mt-2 flex items-center gap-2">
                <Progress value={Math.min(Math.round((ongoingLiveCount / 5) * 100), 100)} className="h-2" />
                <span className="text-xs tabular-nums">
                  {ongoingLiveCount > 0 ? `${Math.min(Math.round((ongoingLiveCount / 5) * 100), 100)}%` : "Idle"}
                </span>
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

        <Modal
          isOpen={listModalOpen}
          onClose={() => {
            setListModalOpen(false);
            setListModalFilterType(null);
          }}
          title={listModalTitle}
          subtitle="Matching candidate and interview records"
          maxWidth="max-w-3xl"
        >
          {loadingModalRecords ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Loading records from server...</p>
            </div>
          ) : listModalCandidates.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-xs font-semibold uppercase tracking-wider bg-slate-50">
                    <th className="px-4 py-3">Candidate</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">AI Score</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listModalCandidates.map((c) => (
                    <tr key={c.id || c._id} className="hover:bg-slate-50">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-slate-800">
                          {c.candidate_id && <span className="text-[0.65rem] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold mr-1">{c.candidate_id}</span>}
                          {c.candidate_name || c.name || "Candidate"}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.candidate_email || c.email}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-600">{c.interview_title || c.job_title || "N/A"}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.round(c.score || c.avg_score || 0)} className="h-1.5 w-16" />
                          <span className="text-xs font-medium tabular-nums">{Math.round(c.score || c.avg_score || 0)}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
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
                      <td className="px-4 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => handleViewCandidateFromModal(c)}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-10 w-10 text-slate-300 animate-pulse" />
              <p className="mt-4 text-sm text-slate-500 font-medium">No matching records found.</p>
            </div>
          )}
        </Modal>
        {selectedCandidate?.id?.startsWith('ai_call_omni_') ? (
          <CallDetailsModal
            isOpen={!!selectedCandidate}
            onClose={() => {
              setSelectedCandidate(null);
              if (listModalFilterType) setListModalOpen(true);
            }}
            callId={selectedCandidate.id.replace('ai_call_omni_', '')}
            API_BASE_URL={API_BASE_URL}
            token={token || localStorage.getItem("token")}
          />
        ) : (
          <CandidateDialog
            candidate={selectedCandidate}
            open={!!selectedCandidate}
            onOpenChange={(v) => {
              if (!v) {
                setSelectedCandidate(null);
                if (listModalFilterType) {
                  setListModalOpen(true);
                }
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
