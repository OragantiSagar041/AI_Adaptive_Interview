import React, { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loadSuperAdminDashboard, loadRecruitmentFunnel, loadPlatformAnalytics } from "@/store/slices/dashboardSlice";
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
import { handleOpenScorecard, handleDeleteSession } from "../../store/slices/interviewSlice";
import {
  Building2,
  Users,
  UserCog,
  Briefcase,
  Mic,
  Star,
  Target,
  Send,
  Activity,
  UserPlus,
  CreditCard,
  Gift,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  TrendingUp,
  Zap,
  Server,
  Database,
  Mail,
  HardDrive,
  Bell,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  LabelList,
  Tooltip as RTooltip
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

function formatNum(n) {
  if (!n && n !== 0) return "0";
  return Number(n).toLocaleString();
}

export default function SuperDashboardPage() {
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

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [adminsList, setAdminsList] = useState([]);

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
    dispatch(loadSuperAdminDashboard(selectedAdminFilter));
    dispatch(loadRecruitmentFunnel(selectedAdminFilter));
    dispatch(loadPlatformAnalytics(selectedAdminFilter));
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard(selectedAdminFilter));
      dispatch(loadRecruitmentFunnel(selectedAdminFilter));
      dispatch(loadPlatformAnalytics(selectedAdminFilter));
    }, 30000); // refresh every 30s
    return () => {
      clearInterval(interval);
      dispatch(setSelectedIds([]));
    }
  }, [dispatch, selectedAdminFilter]);

  const kpis = [
    { label: "Total AI Interviews", value: formatNum(dbStats?.total), delta: "", up: true, icon: Mic, tint: "from-violet-500/15 to-violet-500/0" },
    { label: "Active Today", value: formatNum(dbStats?.today), delta: "", up: true, icon: Activity, tint: "from-blue-500/15 to-blue-500/0" },
    { label: "Completed Interviews", value: formatNum(dbStats?.completed), delta: "", up: true, icon: CheckCircle2, tint: "from-emerald-500/15 to-emerald-500/0" },
    { label: "Pending Interviews", value: formatNum(dbStats?.pending), delta: "", up: true, icon: Clock, tint: "from-amber-500/15 to-amber-500/0" },
    { label: "Avg AI Score", value: `${dbStats?.avg_score || 0}%`, delta: "", up: true, icon: Star, tint: "from-fuchsia-500/15 to-fuchsia-500/0" },
    { label: "Candidates Hired", value: formatNum(dbStats?.selected), delta: "", up: true, icon: Target, tint: "from-teal-500/15 to-teal-500/0" },
    { label: "Candidates Rejected", value: formatNum(dbStats?.rejected), delta: "", up: false, icon: XCircle, tint: "from-rose-500/15 to-rose-500/0" },
    { label: "Expired Links", value: formatNum(dbStats?.expired), delta: "", up: false, icon: AlertTriangle, tint: "from-red-500/15 to-red-500/0" }
  ];

  const platformActivity = [
    { metric: "Live Monitored Sessions", value: ongoingMonitoredCount || 0 },
    { metric: "Online Candidates", value: ongoingLiveCount || 0 },
    { metric: "Completed Today", value: dbStats?.today || 0 },
    { metric: "Active Warnings", value: ongoingAlertCount || 0 },
    { metric: "Speaking Candidates", value: ongoingSpeakingCount || 0 },
    { metric: "Coding Sessions", value: ongoingCodingCount || 0 }
  ];

  const defaultFunnelTemplate = [
    { name: "Applications Received", value: 42000, fill: "#3b82f6" },
    { name: "AI Resume Screening", value: 28400, fill: "#0ea5e9" },
    { name: "AI Voice Screening", value: 19860, fill: "#0284c7" },
    { name: "AI Interviews", value: 12300, fill: "#0d9488" },
    { name: "Qualified Candidates", value: 7800, fill: "#10b981" },
    { name: "Recruiter Review", value: 4900, fill: "#22c55e" },
    { name: "Offers Released", value: 2184, fill: "#eab308" },
    { name: "Candidates Hired", value: 82, fill: "#f59e0b" }
  ];

  const isFunnelEmpty = !rawFunnelData || rawFunnelData.length === 0 || rawFunnelData.every(d => d.value === 0);
  const displayFunnelData = isFunnelEmpty
    ? defaultFunnelTemplate.map((d, i) => ({
        ...d,
        shapeValue: d.value,
        displayValue: rawFunnelData?.[i]?.value || 0
      }))
    : rawFunnelData.map(d => ({
        ...d,
        shapeValue: d.value,
        displayValue: d.value
      }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Monitor AI interviews, platform activity and system performance in real-time.
        </p>
      </div>

      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="relative overflow-hidden bg-white text-slate-900 border-slate-200 shadow-sm">
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${k.tint}`} />
              <CardContent className="relative p-4">
                <div className="flex items-start justify-between">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-900 border-slate-200 shadow-sm ring-1 ring-slate-200">
                    <Icon className="h-4 w-4 text-slate-900" />
                  </div>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight">{status === 'loading' && !dbStats?.total ? '...' : k.value}</div>
                <div className="text-xs text-slate-500">{k.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Platform activity */}
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Platform Activity</CardTitle>
          <CardDescription>Real-time candidate engagement across the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {platformActivity.map((a) => (
              <div key={a.metric} className="rounded-lg border bg-white text-slate-900 border-slate-200 p-3">
                <div className="text-xs text-slate-500">{a.metric}</div>
                <div className="mt-1 text-xl font-semibold">{formatNum(a.value)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Funnel & Analytics */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-white text-slate-900 border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Recruitment Funnel</CardTitle>
            <CardDescription>Stage-by-stage conversion across the platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[360px] relative">
              {isFunnelEmpty && status !== 'loading' && (
                <div className="absolute top-0 right-2 text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-200 z-10">
                  Demo Data (No active pipeline)
                </div>
              )}
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <RTooltip
                    formatter={(v, name, props) => formatNum(props.payload.displayValue)}
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 8,
                      fontSize: 12
                    }}
                  />
                  <Funnel dataKey="shapeValue" data={displayFunnelData} isAnimationActive>
                    <LabelList position="right" fill="#0f172a" stroke="none" dataKey="name" fontSize={12} />
                    <LabelList position="center" fill="#fff" stroke="none" dataKey="displayValue" fontSize={12} formatter={(v) => formatNum(v)} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* AI Platform Analytics */}
        <Card className="lg:col-span-1 bg-white text-slate-900 border-slate-200 shadow-sm flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Platform Analytics</CardTitle>
            <CardDescription>Key business metrics.</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              {analyticsData.length === 0 ? (
                <div className="text-center text-sm text-slate-400 py-4">Loading analytics…</div>
              ) : (
                analyticsData.map((item, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">{item.label}</span>
                      <span className="font-medium">{item.value}%</span>
                    </div>
                    <Progress value={item.value} className="h-1.5" />
                  </div>
                ))
              )}
            </div>
            <div className="mt-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
                <div className="flex items-center text-slate-500">
                  <Clock className="mr-2 h-4 w-4" />
                  <span className="text-sm">Average Time-to-Hire</span>
                </div>
                <div className="font-semibold">
                  {avgTimeToHire != null ? `${avgTimeToHire} days` : '—'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Sessions Table */}
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live Interview Sessions</CardTitle>
          <CardDescription>Active and recently monitored candidate sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-slate-500">Candidate</TableHead>
                <TableHead className="text-slate-500">Interview</TableHead>
                <TableHead className="text-right text-slate-500">Status</TableHead>
                <TableHead className="text-center text-slate-500">Progress</TableHead>
                <TableHead className="text-right text-slate-500">Alerts</TableHead>
                <TableHead className="text-right text-slate-500">Audio Level</TableHead>
                <TableHead className="text-right text-slate-500">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveSessions?.slice(0, 5).map((session, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{session.candidate_name || "Unknown"}</TableCell>
                  <TableCell className="text-slate-500">{session.interview_title || session.link_id}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={session.online ? "default" : "secondary"} className={session.online ? "bg-emerald-500/15 text-emerald-700" : ""}>
                      {session.online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center whitespace-nowrap">
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
                  <TableCell className="text-right tabular-nums">{session.proctoring_alerts || 0}</TableCell>
                  <TableCell className="text-right flex items-center justify-end">
                    <Progress value={(session.audio_level || 0) * 10} className="h-1.5 w-16 ml-2" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => handleOpenLiveStreamAction && handleOpenLiveStreamAction(session)}
                      className="h-8 text-xs font-semibold hover:bg-indigo-50 hover:text-indigo-600 border-indigo-100 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5 mr-1.5" /> Monitor
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(!liveSessions || liveSessions.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-6">No active sessions being monitored</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Candidates Table */}
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Candidates</CardTitle>
          <CardDescription>Latest candidates evaluated by the AI.</CardDescription>
        </CardHeader>
        <CardContent>
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
            handleExportExcel={() => dispatch(handleSuperAdminExportExcel(allCandidates))}
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
              if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return
              dispatch(handleDeleteSession(id))
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
        </CardContent>
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
 