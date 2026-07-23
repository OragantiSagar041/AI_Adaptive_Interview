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
  MoreVertical,
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

function formatNum(n) {
  if (!n && n !== 0) return "0";
  return Number(n).toLocaleString();
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
    dispatch(loadSuperAdminDashboard(selectedAdminFilter));
    dispatch(loadRecruitmentFunnel());
    dispatch(loadPlatformAnalytics());
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard(selectedAdminFilter));
    }, 30000);
    return () => clearInterval(interval);
  }, [dispatch, token, API_BASE_URL, selectedAdminFilter]);

  const platformActivity = [
    { metric: "Live Monitored Sessions", value: ongoingMonitoredCount || 0 },
    { metric: "Online Candidates", value: ongoingLiveCount || 0 },
    { metric: "Completed Today", value: dbStats?.today || 0 },
    { metric: "Active Warnings", value: ongoingAlertCount || 0 },
    { metric: "Speaking Candidates", value: ongoingSpeakingCount || 0 },
    { metric: "Coding Sessions", value: ongoingCodingCount || 0 }
  ];

  const funnelData = (rawFunnelData?.length ? [...rawFunnelData] : [
    { name: "Total Interviews", value: dbStats?.total || 0, fill: "oklch(0.62 0.18 265)" },
    { name: "Pending", value: dbStats?.pending || 0, fill: "oklch(0.58 0.16 232)" },
    { name: "Completed", value: dbStats?.completed || 0, fill: "oklch(0.62 0.15 175)" },
    { name: "Hired", value: dbStats?.selected || 0, fill: "oklch(0.72 0.18 70)" }
  ]).sort((a, b) => b.value - a.value);

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Monitor AI interviews, platform activity and system performance in real-time.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {/* 1 — Total AI Interviews */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-violet-50 flex items-center justify-center">
                  <Mic className="w-4 h-4 text-violet-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Total AI Interviews</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.total) || "0"}</div>
              <div className="text-right">
                {dbStats?.this_week != null && dbStats?.total ? (
                  <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                    <TrendingUp className="w-3 h-3 mr-0.5" /> {dbStats.this_week} this week
                  </div>
                ) : (
                  <div className="text-[10px] text-slate-400">Loading…</div>
                )}
                <div className="text-[10px] text-slate-400">last 7 days</div>
              </div>
            </div>
            <div className="h-12 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparklineData}>
                  <Line type="monotone" dataKey="v" stroke="#8b5cf6" strokeWidth={2} dot={true} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="text-indigo-500 font-medium cursor-pointer flex items-center hover:underline" onClick={() => navigate('/superadmin/interviews')}>
                View trend <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 2 — Active Today */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-blue-50 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-blue-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Active Today</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.today) || "0"}</div>
              <div className="text-right">
                <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" /> Live
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Last updated: 5s ago</div>
              </div>
            </div>
            <div className="mt-4 flex-1 flex items-center">
              <div className="w-full rounded-md bg-blue-50 p-2.5 flex items-center gap-2 text-xs text-blue-600 font-medium">
                <Users className="w-4 h-4" /> {ongoingLiveCount || 0} candidates in active interviews
              </div>
            </div>
            {/* Live Sessions Picker */}
            <div className="mt-3 relative">
              <div className="flex items-center justify-end text-[11px]">
                <span
                  className="text-blue-500 font-medium cursor-pointer flex items-center hover:underline"
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
                <div className="absolute bottom-6 right-0 z-50 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Live Sessions</span>
                    <button
                      className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer bg-transparent border-none"
                      onClick={() => setShowLivePicker(false)}
                    >✕</button>
                  </div>
                  {livePickerLoading ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                      <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2" />
                      Fetching live sessions...
                    </div>
                  ) : (!liveSessions || liveSessions.length === 0) ? (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                      <div className="text-2xl mb-1">📡</div>
                      No active live sessions right now.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto divide-y divide-slate-50">
                      {liveSessions.map((session, i) => (
                        <button
                          key={session.link_id || i}
                          className="w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors cursor-pointer flex items-center justify-between gap-2 bg-transparent border-none"
                          onClick={() => {
                            setShowLivePicker(false);
                            if (handleOpenLiveStreamAction) {
                              handleOpenLiveStreamAction(session.link_id || session.id);
                            }
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${session.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-800 truncate">
                                {session.candidate_name || 'Unknown Candidate'}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {session.interview_title || session.link_id}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {(session.proctoring_alerts || 0) > 0 && (
                              <span className="bg-rose-100 text-rose-600 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                {session.proctoring_alerts} ⚠️
                              </span>
                            )}
                            <span className={`text-[10px] font-semibold ${session.online ? 'text-emerald-600' : 'text-slate-400'}`}>
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
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Completed Interviews</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.completed) || "0"}</div>
              <div className="text-right">
                <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> 12.1%
                </div>
                <div className="text-[10px] text-slate-400">vs yesterday</div>
              </div>
            </div>
            <div className="mt-3 flex-1">
              <div className="text-[10px] font-semibold text-slate-500 mb-1.5">Completion Rate</div>
              <Progress value={Number(completionRate)} className="h-2 bg-slate-100" />
              <div className="text-[10px] text-slate-400 mt-1.5">{formatNum(dbStats?.completed) || 0} / {formatNum(dbStats?.total) || 0} completed</div>
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="text-emerald-500 font-medium cursor-pointer flex items-center hover:underline" onClick={() => navigate('/superadmin/qualified-candidates')}>
                View details <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 4 — Pending Interviews (dynamic) */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-amber-50 flex items-center justify-center">
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Pending Interviews</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.pending) || "0"}</div>
              <div className="text-right">
                {(!dbStats?.pending || dbStats?.pending === 0) ? (
                  <>
                    <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> No Pending
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Great job!</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-end text-amber-500 text-[10px] font-bold">
                      <Clock className="w-3 h-3 mr-1" /> Action Needed
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Review pending</div>
                  </>
                )}
              </div>
            </div>
            <div className="mt-4 flex-1 flex items-center">
              {(!dbStats?.pending || dbStats?.pending === 0) ? (
                <div className="w-full rounded-md bg-emerald-50/50 border border-emerald-100/50 p-2.5 flex items-center gap-2 text-xs text-emerald-600 font-medium">
                  🎉 All interviews are up to date!
                </div>
              ) : (
                <div className="w-full rounded-md bg-amber-50/50 border border-amber-100/50 p-2.5 flex items-center gap-2 text-xs text-amber-600 font-medium">
                  <Clock className="w-3 h-3" /> {dbStats.pending} pending to be completed
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px] min-h-[16px]">
            </div>
          </CardContent>
        </Card>

        {/* 5 — Avg AI Score */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-fuchsia-50 flex items-center justify-center">
                  <Star className="w-4 h-4 text-fuchsia-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Avg AI Score</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="flex items-baseline gap-1">
                <div className="text-3xl font-bold text-slate-900">{avgScore > 0 ? starRating.toFixed(1) : '--'}</div>
                <div className="text-sm font-medium text-slate-400">/ 5.0</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400">
                  {avgScore > 0 ? `${avgScore.toFixed(1)} / 100` : 'No scored sessions'}
                </div>
                <div className="text-[10px] text-slate-400">raw score</div>
              </div>
            </div>
            <div className="mt-3 flex-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star key={i} className={`w-5 h-5 ${i <= Math.floor(starRating) ? 'fill-indigo-500 text-indigo-500' : (i - 0.5 <= starRating ? 'fill-indigo-300 text-indigo-300' : 'text-slate-200')}`} />
                ))}
              </div>
              {avgScore > 0 && (
                <div className="text-[10px] font-semibold text-indigo-500 mt-2">
                  {avgScore >= 70 ? 'Good Performance' : avgScore >= 50 ? 'Average Performance' : 'Needs Improvement'}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[10px]">
              <div className="bg-slate-50 px-2 py-1 rounded text-slate-500 font-medium flex-1 text-center">Avg Score: {avgScore > 0 ? `${avgScore.toFixed(1)}/100` : '--'}</div>
              <div className="bg-slate-50 px-2 py-1 rounded text-slate-500 font-medium flex-1 text-center">Total Rated: {formatNum(dbStats?.completed) || 0}</div>
            </div>
          </CardContent>
        </Card>

        {/* 6 — Candidates Hired */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-teal-50 flex items-center justify-center">
                  <Target className="w-4 h-4 text-teal-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Candidates Hired</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.selected) || "0"}</div>
              <div className="text-right">
                <div className="flex items-center justify-end text-emerald-500 text-[10px] font-bold">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> 33.3%
                </div>
                <div className="text-[10px] text-slate-400">vs yesterday</div>
              </div>
            </div>
            <div className="mt-3 flex-1 flex items-center gap-4">
              <div className="relative w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie data={[{ value: Number(hireRate) || 3.7 }, { value: 100 - (Number(hireRate) || 3.7) }]} innerRadius={18} outerRadius={24} dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                    <Cell fill="#14b8a6" />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
                  {hireRate}%
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500 mb-0.5">Hire Rate</div>
                <div className="text-[11px] font-semibold text-slate-700">{formatNum(dbStats?.selected) || 0} / {formatNum(dbStats?.completed) || 0} completed</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="text-teal-500 font-medium cursor-pointer flex items-center hover:underline" onClick={() => navigate('/superadmin/qualified-candidates')}>
                View details <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 7 — Candidates Rejected */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-rose-50 flex items-center justify-center">
                  <XCircle className="w-4 h-4 text-rose-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Candidates Rejected</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.rejected) || "0"}</div>
              <div className="text-right">
                <div className="flex items-center justify-end text-rose-400 text-[10px] font-bold">
                  <TrendingDown className="w-3 h-3 mr-0.5" /> 0.2%
                </div>
                <div className="text-[10px] text-slate-400">vs yesterday</div>
              </div>
            </div>
            <div className="mt-3 flex-1 flex items-center gap-4">
              <div className="relative w-12 h-12">
                <PieChart width={48} height={48}>
                  <Pie data={[{ value: Number(rejectionRate) || 0.9 }, { value: 100 - (Number(rejectionRate) || 0.9) }]} innerRadius={18} outerRadius={24} dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                    <Cell fill="#f43f5e" />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
                  {rejectionRate}%
                </div>
              </div>
              <div>
                <div className="text-[10px] font-medium text-slate-500 mb-0.5">Rejection Rate</div>
                <div className="text-[11px] font-semibold text-slate-700">{formatNum(dbStats?.rejected) || 0} / {formatNum(dbStats?.completed) || 0} completed</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-end text-[11px]">
              <span className="text-rose-500 font-medium cursor-pointer flex items-center hover:underline" onClick={() => navigate('/superadmin/rejected-candidates')}>
                View details <ArrowRight className="w-3 h-3 ml-0.5" />
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 8 — Expired Links */}
        <Card className="bg-white border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.04)] rounded-xl relative overflow-hidden flex flex-col justify-between">
          <CardContent className="p-4 flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                </div>
                <span className="text-xs font-semibold text-slate-700">Expired Links</span>
              </div>
              <MoreVertical className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>
            <div className="mt-4 flex items-end justify-between">
              <div className="text-3xl font-bold text-slate-900">{formatNum(dbStats?.expired) || "0"}</div>
              <div className="text-right">
                <div className="flex items-center justify-end text-rose-400 text-[10px] font-bold">
                  <TrendingUp className="w-3 h-3 mr-0.5" /> 8.5%
                </div>
                <div className="text-[10px] text-slate-400">vs yesterday</div>
              </div>
            </div>
            <div className="mt-3 flex-1 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sparklineData} barSize={4} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <Bar dataKey="v" fill="#fca5a5" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex items-center justify-end text-[11px]">
              <span className="text-rose-500 font-medium cursor-pointer flex items-center hover:underline" onClick={() => {
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
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Platform Activity</CardTitle>
          <CardDescription>Real-time candidate engagement across the platform.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {platformActivity.map((a) => (
              <div key={a.metric} className="rounded-lg border bg-white text-slate-900 border-slate-200 p-3">
                <div className="text-xs text-slate-500">{a.metric}</div>
                <div className="mt-1 text-xl font-semibold">{formatNum(a.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Funnel */}
        <Card className="lg:col-span-2 bg-white text-slate-900 border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Recruitment Funnel</CardTitle>
            <CardDescription>Stage-by-stage conversion tracking.</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <RTooltip
                    formatter={(v) => formatNum(v)}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                  />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive>
                    <LabelList position="right" fill="#0f172a" stroke="none" dataKey="name" fontSize={12} />
                    <LabelList position="center" fill="#fff" stroke="none" fontSize={12} formatter={(v) => formatNum(v)} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Card>

        {/* Platform Analytics */}
        {analyticsData && analyticsData.length > 0 && (
          <Card className="lg:col-span-1 bg-white text-slate-900 border-slate-200 shadow-sm flex flex-col">
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
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live Interview Sessions</CardTitle>
          <CardDescription>Active and recently monitored candidate sessions.</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6 overflow-x-auto">
          {(!liveSessions || liveSessions.length === 0) ? (
            <div className="text-center py-8 text-sm text-slate-500">
              No live interview sessions currently active.
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
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
                {liveSessions.map((session, i) => (
                  <tr key={session.link_id || i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="py-3 font-medium text-slate-900 whitespace-nowrap">{session.candidate_name || 'Unknown Candidate'}</td>
                    <td className="py-3 text-slate-500 whitespace-nowrap">{session.interview_title || session.link_id}</td>
                    <td className="py-3 text-center whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${session.online ? 'bg-slate-900 text-white' : 'bg-slate-900 text-white'}`}>
                        {session.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3 text-center text-slate-400 text-xs font-medium whitespace-nowrap">N/A</td>
                    <td className="py-3 text-center text-slate-700 font-medium whitespace-nowrap">{session.proctoring_alerts || 0}</td>
                    <td className="py-3 text-center whitespace-nowrap">
                      <div className="w-12 h-1.5 bg-blue-50 rounded-full mx-auto overflow-hidden">
                        <div className="h-full bg-blue-300 rounded-full" style={{ width: `${Math.min(100, (session.audio_level || 0) * 10)}%` }} />
                      </div>
                    </td>
                    <td className="py-3 text-right whitespace-nowrap">
                      <button 
                        onClick={() => handleOpenLiveStreamAction && handleOpenLiveStreamAction(session.link_id || session.id)}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded hover:bg-slate-50 text-slate-700 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> Monitor
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Candidates Table */}
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
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
