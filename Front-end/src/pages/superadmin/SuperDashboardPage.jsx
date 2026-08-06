import React, { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loadSuperAdminDashboard, loadRecruitmentFunnel, loadPlatformAnalytics, loadLiveSessions } from "@/store/slices/dashboardSlice";
import { CandidateTable, CandidateFilters } from "../../components/admin/AdminSubComponents";
import CandidateDialog from "../../components/superadmin/CandidateDialog";
import CallDetailsModal from "../admin/CallDetailsModal";
import { getComputedStatus } from "../../utils/adminFormatters";
import {
  setSelectedIds,
  setCurrentPage,
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setAdminFilter,
  setPipelineFilter,
  setPositionFilter,
  handleSuperAdminBulkDelete,
  handleSuperAdminExportExcel
} from "../../store/slices/candidatesSlice";
import { handleDeleteSession } from "../../store/slices/interviewSlice";
import {
  Mic,
  Star,
  Target,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  Users,
  ArrowRight,
  Eye
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip as RTooltip
} from "recharts";
import { getThemeColor } from "../../utils/themeUtils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

function formatNum(n) {
  if (!n && n !== 0) return "0";
  return Number(n).toLocaleString();
}

function renderTrend(trend, goodIsUp = true) {
  if (trend == null) return <div className="text-[10px] text-muted-foreground">Loading...</div>;
  const isPositive = trend > 0;
  const isZero = trend === 0;
  
  let color = "text-muted-foreground";
  let Icon = TrendingUp;
  
  if (!isZero) {
    if (isPositive) {
      color = goodIsUp ? "text-emerald-500" : "text-rose-400";
      Icon = TrendingUp;
    } else {
      color = goodIsUp ? "text-rose-400" : "text-emerald-500";
      Icon = TrendingDown;
    }
  }

  return (
    <div className={`flex items-center justify-end ${color} text-[10px] font-bold`}>
      <Icon className="w-3 h-3 mr-0.5" /> {isPositive ? "+" : ""}{trend}%
    </div>
  );
}

export default function SuperDashboardPage() {
  const navigate = useNavigate();
  const { handleOpenLiveStreamAction } = useOutletContext() || {};
  const dispatch = useDispatch();
  const {
    dbStats,
    ongoingMonitoredCount,
    ongoingLiveCount,
    ongoingAlertCount,
    ongoingSpeakingCount,
    ongoingCodingCount,
    liveSessions,
    status,
    funnelData: rawFunnelData,
    analyticsData,
    avgTimeToHire
  } = useSelector(state => state.dashboard);

  const { API_BASE_URL, token } = useSelector(state => state.auth);
  const selectedAdminFilter = useSelector(state => state.dashboard.selectedAdminFilter);

  const paginatedCandidates = useSelector(state => state.candidates.paginatedCandidates);
  const selectedIds = useSelector(state => state.candidates.selectedIds);
  const totalPages = useSelector(state => state.candidates.totalPages);
  const startIndex = useSelector(state => state.candidates.startIndex);
  const endIndex = useSelector(state => state.candidates.endIndex);
  const totalItems = useSelector(state => state.candidates.totalItems);
  const currentPage = useSelector(state => state.candidates.currentPage);

  const searchTerm = useSelector(state => state.candidates.searchTerm);
  const startDate = useSelector(state => state.candidates.startDate);
  const endDate = useSelector(state => state.candidates.endDate);
  const statusFilter = useSelector(state => state.candidates.statusFilter);
  const adminFilter = useSelector(state => state.candidates.adminFilter);
  const pipelineFilter = useSelector(state => state.candidates.pipelineFilter);
  const positionFilter = useSelector(state => state.candidates.positionFilter);
  const sortBy = useSelector(state => state.candidates.sortBy);

  const allCandidates = useSelector(state => state.candidates.candidates);
  const filteredCandidates = useSelector(state => state.candidates.filteredCandidates);

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [adminsList, setAdminsList] = useState([]);
  const [showLivePicker, setShowLivePicker] = useState(false);
  const [livePickerLoading, setLivePickerLoading] = useState(false);

  useEffect(() => {
    const fetchAdmins = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/super-admin/admins`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json && json.data) {
          setAdminsList(json.data);
        }
      } catch (e) {
        console.error('Failed to fetch admins:', e);
      }
    };
    if (token) {
      fetchAdmins();
    }
  }, [API_BASE_URL, token]);

  useEffect(() => {
    // Initial fetch without summaryOnly to populate the Candidates table
    dispatch(loadSuperAdminDashboard(selectedAdminFilter));
    dispatch(loadRecruitmentFunnel(selectedAdminFilter));
    dispatch(loadPlatformAnalytics(selectedAdminFilter));
    const interval = setInterval(() => {
      // Poll with summaryOnly to update stats without re-fetching all candidates
      dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter, summaryOnly: true }));
      dispatch(loadRecruitmentFunnel(selectedAdminFilter));
      dispatch(loadPlatformAnalytics(selectedAdminFilter));
    }, 30000); // refresh every 30s
    return () => {
      clearInterval(interval);
      dispatch(setSelectedIds([]));
    }
  }, [dispatch, selectedAdminFilter]);

  const kpis = [
    { label: "Total AI Interviews", value: formatNum(dbStats?.total), delta: "", up: true, icon: Mic, tint: "from-violet-500/15 to-violet-500/0", navPath: "/superadmin/dashboard" },
    { label: "Active Today", value: formatNum(dbStats?.today), delta: "", up: true, icon: Activity, tint: "from-blue-500/15 to-blue-500/0", navPath: "/superadmin/dashboard" },
    { label: "Completed Interviews", value: formatNum(dbStats?.completed), delta: "", up: true, icon: CheckCircle2, tint: "from-emerald-500/15 to-emerald-500/0", navPath: "/superadmin/qualified-candidates" },
    { label: "Pending Interviews", value: formatNum(dbStats?.pending), delta: "", up: true, icon: Clock, tint: "from-amber-500/15 to-amber-500/0", navPath: "/superadmin/dashboard" },
    { label: "Avg AI Score", value: `${dbStats?.avg_score || 0}%`, delta: "", up: true, icon: Star, tint: "from-fuchsia-500/15 to-fuchsia-500/0", navPath: "/superadmin/qualified-candidates" },
    { label: "Candidates Hired", value: formatNum(dbStats?.selected), delta: "", up: true, icon: Target, tint: "from-teal-500/15 to-teal-500/0", navPath: "/superadmin/qualified-candidates" },
    { label: "Candidates Rejected", value: formatNum(dbStats?.rejected), delta: "", up: false, icon: XCircle, tint: "from-rose-500/15 to-rose-500/0", navPath: "/superadmin/rejected-candidates" },
    { label: "Expired Links", value: formatNum(dbStats?.expired), delta: "", up: false, icon: AlertTriangle, tint: "from-red-500/15 to-red-500/0", navPath: "/superadmin/dashboard" }
  ];

  const platformActivity = [
    { metric: "Live Monitored Sessions", value: ongoingMonitoredCount || 0 },
    { metric: "Online Candidates", value: ongoingLiveCount || 0 },
    { metric: "Completed Today", value: dbStats?.today || 0 },
    { metric: "Active Warnings", value: ongoingAlertCount || 0 },
    { metric: "Speaking Candidates", value: ongoingSpeakingCount || 0 },
    { metric: "Coding Sessions", value: ongoingCodingCount || 0 }
  ];

  const funnelData = (rawFunnelData?.length ? [...rawFunnelData] : [
    { name: "Total Interviews", value: dbStats?.total || 0, fill: getThemeColor('--color-violet', '#8b5cf6') },
    { name: "Pending", value: dbStats?.pending || 0, fill: getThemeColor('--color-blue', '#3b82f6') },
    { name: "Completed", value: dbStats?.completed || 0, fill: getThemeColor('--color-emerald', '#10b981') },
    { name: "Hired", value: dbStats?.selected || 0, fill: getThemeColor('--color-amber', '#f59e0b') }
  ]).sort((a, b) => b.value - a.value);

  const maxFunnelValue = Math.max(...funnelData.map(d => Number(d.value) || 0));

  // Real 7-day sparkline from backend chart_data
  const sparklineData = Array.isArray(dbStats?.chart_data) && dbStats.chart_data.length > 0
    ? dbStats.chart_data.map((v, i) => ({ date: dbStats.chart_labels?.[i] || `D${i + 1}`, v: v || 0 }))
    : Array.from({ length: 7 }, (_, i) => ({ date: `D${i + 1}`, v: 0 }));

  // Expired bar — use the 7-day chart data or a single actual expired count bar
  const expiredBarData = Array.isArray(dbStats?.chart_data) && dbStats.chart_data.length > 0
    ? dbStats.chart_data.map((_, i) => ({ v: 0 })) // placeholder shape; replace if backend exposes daily expired counts
    : [{ v: dbStats?.expired || 0 }];

  const completionRate = dbStats?.total ? ((dbStats?.completed / dbStats?.total) * 100).toFixed(1) : 0;
  const rejectionRate = dbStats?.completed ? ((dbStats?.rejected / dbStats?.completed) * 100).toFixed(1) : 0;
  const hireRate = dbStats?.completed ? ((dbStats?.selected / dbStats?.completed) * 100).toFixed(1) : 0;
  // avg_score from backend is on 0–100 scale; display as x/5.0
  const avgScore = dbStats?.avg_score ?? 0;
  const starRating = avgScore / 20;

  return (
    <div className="space-y-6 superadmin-dashboard-page">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Monitor AI interviews, platform activity and system performance in real-time.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {/* 1 — Total AI Interviews */}
        <Card className="bg-card border border-border/80 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-violet-500" />
                </div>
                <span className="text-xs font-semibold text-foreground">Total AI Interviews</span>
              </div>
<MoreVertical className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-foreground tracking-tight">{formatNum(dbStats?.today) || "0"}</div>
              <div className="text-right">
                <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" /> Live
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">Last updated: 5s ago</div>
              </div>
            </div>
            <div className="mt-4 flex-1 flex items-center">
              <div className="w-full rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5 flex items-center gap-2 text-xs text-blue-400 font-medium">
                <Users className="w-4 h-4 shrink-0" /> {ongoingLiveCount || 0} candidates in active interviews
              </div>
            </div>
            {/* Live Sessions Picker */}
            <div className="mt-3 relative">
              <div className="flex items-center justify-end text-[11px]">
                <span
                  className="text-blue-400 font-medium cursor-pointer flex items-center hover:underline"
                  onClick={async () => {
                    if (showLivePicker) {
                      setShowLivePicker(false);
                      return;
                    }
                    setShowLivePicker(true);
                    setLivePickerLoading(true);
                    try {
                      await dispatch(loadLiveSessions(selectedAdminFilter));
                    } finally {
                      setLivePickerLoading(false);
                    }
                  }}
                >
                  View live <ArrowRight className="w-3 h-3 ml-0.5" />
                </span>
              </div>
              {showLivePicker && (
                <div className="absolute bottom-6 right-0 z-50 w-72 bg-card border border-border rounded-xl shadow-2xl overflow-hidden text-card-foreground">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">Live Sessions</span>
                    <button
                      className="text-muted-foreground hover:text-foreground text-xs cursor-pointer bg-transparent border-none"
                      onClick={() => setShowLivePicker(false)}
                    >✕</button>
                  </div>
                  {livePickerLoading ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
                      Fetching live sessions...
                    </div>
                  ) : (!liveSessions || liveSessions.length === 0) ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      <div className="text-2xl mb-1">📡</div>
                      No active live sessions right now.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-border">
                      {liveSessions.filter(session => session.online).map((session, i) => (
                        <button
                          key={session.link_id || i}
                          className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer flex items-center justify-between gap-2 bg-transparent border-none"
                          onClick={() => {
                            setShowLivePicker(false);
                            if (handleOpenLiveStreamAction) {
                              handleOpenLiveStreamAction(session);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${session.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-foreground truncate">
                                {session.candidate_name || 'Unknown Candidate'}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {session.interview_title || session.link_id}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(session.proctoring_alerts || 0) > 0 && (
                              <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {session.proctoring_alerts} ⚠️
                              </span>
                            )}
                            <span className={`text-[10px] font-semibold ${session.online ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                              {session.online ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3 — Completed Interviews */}
        <Card className="bg-card border border-border/80 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-xs font-semibold text-foreground">Completed Interviews</span>
              </div>
<MoreVertical className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-foreground tracking-tight">{formatNum(dbStats?.pending) || "0"}</div>
              <div className="text-right">
                {(!dbStats?.pending || dbStats?.pending === 0) ? (
                  <>
                    <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> No Pending
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Great job!</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-end text-amber-500 text-[10px] font-bold">
                      <Clock className="w-3 h-3 mr-1" /> Action Needed
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Review pending</div>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 flex-1 flex items-center">
              {(!dbStats?.pending || dbStats?.pending === 0) ? (
                <div className="w-full rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 flex items-center gap-2 text-xs text-emerald-400 font-medium">
                  🎉 All interviews are up to date!
                </div>
              ) : (
                <div className="w-full rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 flex items-center gap-2 text-xs text-amber-400 font-medium">
                  <Clock className="w-3 h-3 shrink-0" /> {dbStats.pending} pending to be completed
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px] min-h-[16px]">
            </div>
          </CardContent>
        </Card>

        {/* 5 — Avg AI Score */}
        <Card className="bg-card border border-border/80 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center">
                  <Star className="w-4 h-4 text-fuchsia-500" />
                </div>
                <span className="text-xs font-semibold text-foreground">Avg AI Score</span>
              </div>
<MoreVertical className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-foreground tracking-tight">{formatNum(dbStats?.selected) || "0"}</div>
              <div className="text-right">
                {renderTrend(dbStats?.selected_trend, true)}
                <div className="text-[10px] text-muted-foreground">vs yesterday</div>
              </div>
            </div>
            <div className="mt-3 flex-1 flex items-center gap-4">
              <div className="relative w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie data={[{ value: Number(hireRate) || 3.7 }, { value: 100 - (Number(hireRate) || 3.7) }]} innerRadius={18} outerRadius={24} dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                    <Cell fill={getThemeColor('--color-emerald', '#14b8a6')} />
                    <Cell fill={getThemeColor('--border', '#1e293b')} />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground">
                  {hireRate}%
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground mb-0.5">Hire Rate</div>
                <div className="text-[11px] font-semibold text-foreground">{formatNum(dbStats?.selected) || 0} / {formatNum(dbStats?.completed) || 0} completed</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="text-teal-400 font-medium cursor-pointer flex items-center hover:underline" onClick={() => navigate('/superadmin/qualified-candidates')}>
                View details <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 7 — Candidates Rejected */}
        <Card className="bg-card border border-border/80 shadow-sm rounded-2xl relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-rose-500" />
                </div>
                <span className="text-xs font-semibold text-foreground">Candidates Rejected</span>
              </div>
<MoreVertical className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground transition-colors" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-foreground tracking-tight">{formatNum(dbStats?.expired) || "0"}</div>
              <div className="text-right">
                {renderTrend(dbStats?.expired_trend, false)}
                <div className="text-[10px] text-muted-foreground">vs yesterday</div>
              </div>
            </div>
            <div className="mt-3 flex-1 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sparklineData} barSize={4} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="v" fill={getThemeColor('--color-rose', '#fca5a5')} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-end text-[11px]">
              <span className="text-rose-400 font-medium cursor-pointer flex items-center hover:underline" onClick={() => {
                dispatch(setStatusFilter('expired'));
                navigate('/superadmin/interviews');
              }}>
                Manage <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Platform Activity */}
      <Card className="bg-card text-foreground border-border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Platform Activity</CardTitle>
          <CardDescription>Real-time candidate engagement across the platform.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {platformActivity.map((a) => (
              <div key={a.metric} className="rounded-lg border bg-card text-foreground border-border p-3">
                <div className="text-xs text-muted-foreground">{a.metric}</div>
                <div className="mt-1 text-xl font-semibold">{formatNum(a.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel */}
        <Card className="lg:col-span-2 bg-card text-foreground border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Recruitment Funnel</CardTitle>
            <CardDescription>Stage-by-stage conversion tracking.</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            {maxFunnelValue > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
                {/* Visual Funnel Chart */}
                <div className="md:col-span-7 h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <FunnelChart>
                      <RTooltip
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 text-white border border-slate-700/80 px-3.5 py-2.5 rounded-xl shadow-2xl text-xs space-y-1">
                                <div className="font-extrabold text-slate-200">
                                  {data.name}
                                </div>
                                <div className="flex items-center gap-1.5 text-sky-400 font-bold text-sm">
                                  <span>{formatNum(data.value)}</span>
                                  <span className="text-[11px] font-medium text-slate-400">Candidates</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Funnel dataKey="value" data={funnelData} isAnimationActive>
                        <LabelList
                          position="center"
                          fill="#ffffff"
                          stroke="none"
                          dataKey="value"
                          fontSize={12}
                          fontWeight={800}
                          formatter={(v) => formatNum(v)}
                        />
                      </Funnel>
                    </FunnelChart>
                  </ResponsiveContainer>
                </div>

                {/* Stage Breakdown Legend */}
                <div className="md:col-span-5 flex flex-col gap-2.5 bg-slate-50 p-4 rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Stage Breakdown
                  </div>
                  {funnelData.map((item, idx) => {
                    const topValue = funnelData[0]?.value || 1;
                    const pct = Math.round((item.value / topValue) * 100);
                    return (
                      <div key={idx} className="flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3 h-3 rounded-md shrink-0 shadow-xs"
                            style={{ backgroundColor: item.fill || '#3b82f6' }}
                          />
                          <span className="font-bold text-slate-800 truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[11px] font-medium text-slate-500">
                            {pct}%
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-white text-slate-900 font-extrabold text-xs border border-slate-200 shadow-xs">
                            {formatNum(item.value)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-[300px] text-slate-400">
                <div className="text-3xl mb-2">📊</div>
                <div className="text-sm font-medium">No candidate data yet</div>
              </div>
            )}
          </div>
        </Card>

        {/* Platform Analytics */}
        {analyticsData && analyticsData.length > 0 && (
          <Card className="lg:col-span-1 bg-card text-foreground border-border shadow-sm flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">AI Platform Analytics</CardTitle>
                  <CardDescription>Key business metrics.</CardDescription>
                </div>
                {avgTimeToHire !== null && (
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                    <Clock className="w-3 h-3 mr-1" />
                    Avg Time to Hire: {avgTimeToHire} days
                  </Badge>
                )}
              </div>
            </CardHeader>
            <div className="px-6 pb-6 flex-1">
              <div className="flex flex-col gap-6">
                {analyticsData.map((item, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-500">{item.label}</span>
                      <span className="font-semibold text-slate-900">{item.value}%</span>
                    </div>
                    <Progress value={item.value} className="h-2 bg-blue-50 [&>div]:bg-blue-400" />
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>

      {/* Live Interview Sessions */}
      <Card className="bg-card text-foreground border-border shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">Live Interview Sessions</CardTitle>
              <CardDescription>Active and recently monitored candidate sessions.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <div className="px-6 pb-6 overflow-x-auto">
          {(!liveSessions || liveSessions.length === 0) ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No live interview sessions currently active.
            </div>
          ) : (
            (() => {
              const onlineLiveSessions = liveSessions.filter(session => session.online)
              return onlineLiveSessions.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No live interview sessions currently active.
                </div>
              ) : (
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-3 font-medium whitespace-nowrap">Candidate</th>
                      <th className="py-3 font-medium whitespace-nowrap">Interview</th>
                      <th className="py-3 font-medium text-center whitespace-nowrap">Status</th>
                      <th className="py-3 font-medium text-center whitespace-nowrap">Progress</th>
                      <th className="py-3 font-medium text-center whitespace-nowrap">Alerts</th>
                      <th className="py-3 font-medium text-center whitespace-nowrap">Audio Level</th>
                      <th className="py-3 font-medium text-right whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {onlineLiveSessions.map((session, i) => (
                      <tr key={session.link_id || i} className="border-b border-border last:border-0 hover:bg-muted/60">
                        <td className="py-3 font-medium text-foreground whitespace-nowrap">{session.candidate_name || 'Unknown Candidate'}</td>
                        <td className="py-3 text-muted-foreground whitespace-nowrap">{session.interview_title || session.link_id}</td>
                        <td className="py-3 text-center whitespace-nowrap">
                          <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-foreground text-background">
                            Online
                          </span>
                        </td>
                        <td className="py-3 text-center text-muted-foreground text-xs font-medium whitespace-nowrap">N/A</td>
                        <td className="py-3 text-center text-foreground font-medium whitespace-nowrap">{session.proctoring_alerts || 0}</td>
                        <td className="py-3 text-center whitespace-nowrap">
                          <div className="w-12 h-1.5 bg-muted rounded-full mx-auto overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (session.audio_level || 0) * 10)}%` }} />
                          </div>
                        </td>
                        <td className="py-3 text-right whitespace-nowrap">
                          <button 
                            onClick={() => handleOpenLiveStreamAction && handleOpenLiveStreamAction(session)}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-card border border-border rounded hover:bg-muted text-foreground cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> Monitor
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()
          )}
        </div>
      </Card>

      {/* Candidates Table */}
      <Card className="bg-card text-foreground border-border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Candidates</CardTitle>
          <CardDescription>Latest candidates evaluated by the AI.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <CandidateFilters
            searchTerm={searchTerm}
            setSearchTerm={(val) => dispatch(setSearchTerm(val))}
            startDate={startDate}
            setStartDate={(val) => dispatch(setStartDate(val))}
            endDate={endDate}
            setEndDate={(val) => dispatch(setEndDate(val))}
            statusFilter={statusFilter}
            setStatusFilter={(val) => dispatch(setStatusFilter(val))}
            adminFilter={adminFilter}
            setAdminFilter={(val) => dispatch(setAdminFilter(val))}
            pipelineFilter={pipelineFilter}
            setPipelineFilter={(val) => dispatch(setPipelineFilter(val))}
            positionFilter={positionFilter}
            setPositionFilter={(val) => dispatch(setPositionFilter(val))}
            sortBy={sortBy}
            setSortBy={(val) => dispatch(setSortBy(val))}
            handleExportExcel={() => dispatch(handleSuperAdminExportExcel(paginatedCandidates))}
            selectedIds={selectedIds}
            handleBulkDelete={() => dispatch(handleSuperAdminBulkDelete(selectedIds))}
            allCandidates={allCandidates}
            adminsList={adminsList}
          />
          <CandidateTable
            paginatedCandidates={paginatedCandidates}
            selectedIds={selectedIds}
            setSelectedIds={(ids) => dispatch(setSelectedIds(ids))}
            getComputedStatus={getComputedStatus}
            handleOpenScorecard={(c) => setSelectedCandidate(c)}
            handleDeleteSession={(id) => {
              if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return;
              dispatch(handleDeleteSession(id));
            }}
            loadDashboardData={() => dispatch(loadSuperAdminDashboard(selectedAdminFilter))}
            API_BASE_URL={API_BASE_URL}
            totalPages={totalPages}
            startIndex={startIndex}
            endIndex={endIndex}
            totalItems={totalItems}
            currentPage={currentPage}
            setCurrentPage={(page) => dispatch(setCurrentPage(page))}
          />
        </div>
      </Card>

      {selectedCandidate?.id?.startsWith('ai_call_omni_') ? (
        <CallDetailsModal
          isOpen={!!selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
          callId={selectedCandidate.id.replace('ai_call_omni_', '')}
          API_BASE_URL={API_BASE_URL}
          token={token}
        />
      ) : (
        <CandidateDialog
          candidate={selectedCandidate}
          open={!!selectedCandidate}
          onOpenChange={(v) => {
            if (!v) setSelectedCandidate(null);
          }}
          onStatusUpdate={() => {
            dispatch(loadSuperAdminDashboard(selectedAdminFilter));
          }}
        />
      )}
    </div>
  );
}