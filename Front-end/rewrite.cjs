const fs = require('fs');

const code = `import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
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
  ArrowDownRight
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
  if (!n) return "0";
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
    candidates,
    status
  } = useSelector(state => state.dashboard);

  useEffect(() => {
    dispatch(loadSuperAdminDashboard());
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard());
    }, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [dispatch]);

  const kpis = [
    { label: "Total AI Interviews", value: formatNum(dbStats?.total), delta: "", up: true, icon: Mic, tint: "from-violet-500/15 to-violet-500/0" },
    { label: "Active Today", value: formatNum(dbStats?.today), delta: "", up: true, icon: Activity, tint: "from-blue-500/15 to-blue-500/0" },
    { label: "Completed Interviews", value: formatNum(dbStats?.completed), delta: "", up: true, icon: CheckCircle2, tint: "from-emerald-500/15 to-emerald-500/0" },
    { label: "Pending Interviews", value: formatNum(dbStats?.pending), delta: "", up: true, icon: Clock, tint: "from-amber-500/15 to-amber-500/0" },
    { label: "Avg AI Score", value: \`\${(dbStats?.avg_score || 0).toFixed(1)}%\`, delta: "", up: true, icon: Star, tint: "from-fuchsia-500/15 to-fuchsia-500/0" },
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
    { name: "Total Interviews", value: dbStats?.total || 0, fill: "oklch(0.62 0.18 265)" },
    { name: "Pending", value: dbStats?.pending || 0, fill: "oklch(0.58 0.16 232)" },
    { name: "Completed", value: dbStats?.completed || 0, fill: "oklch(0.62 0.15 175)" },
    { name: "Hired", value: dbStats?.selected || 0, fill: "oklch(0.72 0.18 70)" }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Super Admin Dashboard</h1>
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
              <div className={\`pointer-events-none absolute inset-0 bg-gradient-to-br \${k.tint}\`} />
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

      {/* Funnel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-3 bg-white text-slate-900 border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Recruitment Funnel</CardTitle>
            <CardDescription>Stage-by-stage conversion tracking.</CardDescription>
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
                  <TableCell className="text-right">
                    <Progress value={(session.audio_level || 0) * 10} className="h-1.5 w-16 ml-auto" />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates?.slice(0, 8).map((c, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{c.candidate_name || c.name || "Unknown"}</TableCell>
                  <TableCell className="text-slate-500">{c.candidate_email || c.email || "N/A"}</TableCell>
                  <TableCell className="text-slate-500">{c.interview_title || c.job_title || "General Interview"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(c.avg_score || c.score || 0).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={c.status === "completed" || c.decision === "selected" ? "default" : "secondary"}
                      className={c.status === "completed" || c.decision === "selected" ? "bg-emerald-500/15 text-emerald-700" : ""}
                    >
                      {c.decision === "selected" ? "Hired" : c.decision === "rejected" ? "Rejected" : c.status || "Pending"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!candidates || candidates.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 py-6">No recent candidates found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
`;

fs.writeFileSync('src/pages/superadmin/SuperDashboardPage.jsx', code);
