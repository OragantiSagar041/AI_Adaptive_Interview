import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import axios from "axios";
import CandidateDialog from "../../components/superadmin/CandidateDialog";
import { loadSuperAdminDashboard } from "@/store/slices/dashboardSlice";
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
  Eye
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
  const dispatch = useDispatch();
  const { 
    dbStats, 
    ongoingMonitoredCount, 
    ongoingLiveCount, 
    ongoingAlertCount, 
    ongoingSpeakingCount, 
    ongoingCodingCount,
    liveSessions,
    status
  } = useSelector(state => state.dashboard);
  
  const { token, API_BASE_URL } = useSelector(state => state.auth);
  const [recentCandidates, setRecentCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  useEffect(() => {
    dispatch(loadSuperAdminDashboard());
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard());
    }, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [dispatch]);

  useEffect(() => {
    const fetchRecentCandidates = async () => {
      try {
        const [qualifiedRes, rejectedRes] = await Promise.all([
          axios.get(`${API_BASE_URL}/superadmin/candidates/qualified`, { headers: { Authorization: `Bearer ${token}` } }),
          axios.get(`${API_BASE_URL}/superadmin/candidates/rejected`, { headers: { Authorization: `Bearer ${token}` } })
        ]);
        
        const qualified = qualifiedRes.data || [];
        const rejected = rejectedRes.data || [];
        
        const combined = [...qualified, ...rejected].sort((a, b) => {
          const dateA = new Date(a.created_at || a.applied_at || a.updated_at || 0);
          const dateB = new Date(b.created_at || b.applied_at || b.updated_at || 0);
          return dateB - dateA;
        });
        
        setRecentCandidates(combined.slice(0, 8));
      } catch (err) {
        console.error("Error fetching recent candidates:", err);
      }
    };
    
    if (token && API_BASE_URL) {
      fetchRecentCandidates();
    }
  }, [token, API_BASE_URL]);

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

  const funnelData = [
    { name: "Applications Received", value: 42000, fill: "#3b82f6" },
    { name: "AI Resume Screening", value: 28400, fill: "#0ea5e9" },
    { name: "AI Voice Screening", value: 19860, fill: "#0284c7" },
    { name: "AI Interviews", value: 12300, fill: "#0d9488" },
    { name: "Qualified Candidates", value: 7800, fill: "#10b981" },
    { name: "Recruiter Review", value: 4900, fill: "#22c55e" },
    { name: "Offers Released", value: 2184, fill: "#eab308" },
    { name: "Candidates Hired", value: 82, fill: "#f59e0b" }
  ];

  const analytics = [
    { label: "AI Resume Screening Success Rate", value: 82 },
    { label: "Interview Completion Rate", value: 91 },
    { label: "Average AI Match Score", value: 89 },
    { label: "Offer Acceptance Rate", value: 76 },
    { label: "Candidate Conversion Rate", value: 34 },
    { label: "Recruiter Productivity", value: 93 },
    { label: "AI Recommendation Accuracy", value: 88 }
  ];

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
            <div className="h-[360px]">
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
              {analytics.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{item.label}</span>
                    <span className="font-medium">{item.value}%</span>
                  </div>
                  <Progress value={item.value} className="h-1.5" />
                </div>
              ))}
            </div>
            <div className="mt-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
                <div className="flex items-center text-slate-500">
                  <Clock className="mr-2 h-4 w-4" />
                  <span className="text-sm">Average Time-to-Hire</span>
                </div>
                <div className="font-semibold">22 days</div>
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
                <TableHead className="text-right text-slate-500">Alerts</TableHead>
                <TableHead className="text-right text-slate-500">Audio Level</TableHead>
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
                  <TableCell className="text-right tabular-nums">{session.proctoring_alerts || 0}</TableCell>
                  <TableCell className="text-right flex items-center justify-end">
                    <Progress value={(session.audio_level || 0) * 10} className="h-1.5 w-16 ml-2" />
                  </TableCell>
                </TableRow>
              ))}
              {(!liveSessions || liveSessions.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 py-6">No active sessions being monitored</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Candidates Table */}
      <Card className="bg-white text-slate-900 border-slate-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recent Candidates</CardTitle>
          <CardDescription>Latest candidates evaluated by the AI.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-slate-500">Candidate Name</TableHead>
                <TableHead className="text-slate-500">Email</TableHead>
                <TableHead className="text-slate-500">Applied For</TableHead>
                <TableHead className="text-right text-slate-500">Score</TableHead>
                <TableHead className="text-right text-slate-500">Status</TableHead>
                <TableHead className="text-right text-slate-500">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentCandidates?.map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{c.candidate_name || c.name || "Unknown"}</TableCell>
                  <TableCell className="text-slate-500">{c.candidate_email || c.email || "N/A"}</TableCell>
                  <TableCell className="text-slate-500">{c.interview_title || c.job_title || "General Interview"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(c.avg_score || c.score || 0).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={c.decision === "selected" ? "default" : c.decision === "pending" ? "outline" : "secondary"}
                      className={
                        c.decision === "selected" ? "bg-emerald-500/15 text-emerald-700" :
                        c.decision === "pending" ? "bg-amber-500/15 text-amber-700 border-amber-200" :
                        c.decision === "rejected" ? "bg-rose-500/15 text-rose-700" : ""
                      }
                    >
                      {c.decision === "selected" ? "Hired" : c.decision === "rejected" ? "Rejected" : c.decision === "pending" ? "Pending" : c.status || "Pending"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => setSelectedCandidate(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all cursor-pointer"
                    >
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {(!recentCandidates || recentCandidates.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-slate-500 py-6">No recent candidates found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CandidateDialog
        candidate={selectedCandidate}
        open={!!selectedCandidate}
        onOpenChange={(v) => !v && setSelectedCandidate(null)}
        onStatusUpdate={(newDecision) => {
          setRecentCandidates(prev => prev.map(c => 
            (c.id === selectedCandidate.id || c.link_id === selectedCandidate.link_id || c._id === selectedCandidate._id)
              ? { ...c, decision: newDecision, status: newDecision === 'pending' ? 'pending' : 'completed' }
              : c
          ));
        }}
      />
    </div>
  );
}
