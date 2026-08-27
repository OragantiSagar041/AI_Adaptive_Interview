import React, { useEffect, useMemo } from "react";
// Vite reload trigger comment - run clean poll
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { loadSuperAdminDashboard } from "@/store/slices/dashboardSlice";
import { setStatusFilter } from "@/store/slices/candidatesSlice";
import {
  Coins,
  Video,
  CheckCircle2,
  Clock,
  Users
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTheme } from "../../context/ThemeContext";

export default function NewSuperDashboardPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dbStats = useSelector((state) => state.dashboard.dbStats);
  const selectedAdminFilter = useSelector((state) => state.dashboard.selectedAdminFilter);

  // Initial load on mount
  useEffect(() => {
    dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter }));
  }, [dispatch, selectedAdminFilter]);

  // Separate polling interval — only restarts when filter changes, not on every render
  useEffect(() => {
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter }));
    }, 15000); // Poll every 15s for fresh backend data
    return () => clearInterval(interval);
  }, [dispatch, selectedAdminFilter]);

  // Construct chart data dynamically from backend stats — memoized cleanly
  const chartLabels = dbStats?.chart_labels;
  const chartData = dbStats?.chart_data;
  const lineData = useMemo(() => (
    chartLabels?.map((label, idx) => ({
      date: label,
      interviews: chartData?.[idx] || 0
    })) || []
  ), [chartLabels, chartData]);

  const adminLabels = dbStats?.admin_labels;
  const adminData = dbStats?.admin_data;
  const barData = useMemo(() => (
    adminLabels?.map((label, idx) => ({
      name: label,
      value: adminData?.[idx] || 0
    })) || []
  ), [adminLabels, adminData]);

  const creditsAvailable = Number(dbStats?.credits_available ?? dbStats?.credits ?? 0);
  const creditsUsed = Number(dbStats?.credits_used ?? 0);

  const pieData = useMemo(() => [
    { name: "Credits Available", value: creditsAvailable },
    { name: "Credits Used", value: creditsUsed }
  ], [creditsAvailable, creditsUsed]);

  const PIE_COLORS = ["#10b981", "#ef4444"]; // Green for available, Red for used

  return (
    <div className="p-8 h-full overflow-y-auto bg-background transition-colors duration-300">
      
      {/* Top Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        
        {/* Available Credits */}
        <Card
          className="bg-card border border-border shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-emerald-500/50"
          onClick={() => navigate('/superadmin/dashboard')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">AVAILABLE CREDITS</span>
              <span className="text-3xl font-extrabold text-emerald-500 dark:text-emerald-400 tracking-tight">
                {dbStats?.credits_available ?? dbStats?.credits ?? '--'}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Credits Left</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        {/* Total Interviews */}
        <Card
          className="bg-card border border-border shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-indigo-500/50"
          onClick={() => navigate('/superadmin/dashboard')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">TOTAL INTERVIEWS</span>
              <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight">
                {dbStats?.total ?? '--'}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">All Time</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            </div>
          </CardContent>
        </Card>

        {/* Completed */}
        <Card
          className="bg-card border border-border shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-blue-500/50"
          onClick={() => {
            dispatch(setStatusFilter('completed'));
            navigate('/superadmin/interviews');
          }}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">COMPLETED</span>
              <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">
                {dbStats?.completed ?? '--'}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Completed Interviews</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-blue-500 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        {/* Pending */}
        <Card
          className="bg-card border border-border shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-amber-500/50"
          onClick={() => navigate('/superadmin/dashboard')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">PENDING</span>
              <span className="text-3xl font-extrabold text-amber-500 dark:text-amber-400 tracking-tight">
                {dbStats?.pending ?? '--'}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Pending Interviews</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500 dark:text-amber-400" />
            </div>
          </CardContent>
        </Card>

        {/* Recruiters */}
        <Card
          className="bg-card border border-border shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-purple-500/50"
          onClick={() => navigate('/superadmin/team')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider mb-1">RECRUITERS</span>
              <span className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 tracking-tight">
                {dbStats?.recruiters_count ?? '--'}
              </span>
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Total Recruiters</span>
            </div>
            <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/20 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-purple-500 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Interviews Last 7 Days */}
        <Card className="bg-card border border-border shadow-sm h-[380px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              INTERVIEWS LAST 7 DAYS
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"} />
                <XAxis dataKey="date" tick={{fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b'}} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: isDark ? '#131d35' : '#ffffff',
                    borderColor: isDark ? '#223354' : '#e2e8f0',
                    borderRadius: '12px',
                    color: isDark ? '#ffffff' : '#0f172a',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="interviews" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: isDark ? '#111a2e' : '#fff', stroke: '#818cf8', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Interviews by Admin */}
        <Card className="bg-card border border-border shadow-sm h-[380px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              INTERVIEWS BY ADMIN
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 20, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? "rgba(255,255,255,0.06)" : "#f1f5f9"} />
                <XAxis 
                  dataKey="name" 
                  tick={{fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b'}} 
                  axisLine={false} 
                  tickLine={false} 
                  angle={-35}
                  textAnchor="end"
                  dx={-5}
                  dy={10}
                />
                <YAxis tick={{fontSize: 10, fill: isDark ? '#94a3b8' : '#64748b'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: isDark ? '#131d35' : '#ffffff',
                    borderColor: isDark ? '#223354' : '#e2e8f0',
                    borderRadius: '12px',
                    color: isDark ? '#ffffff' : '#0f172a',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
                  }}
                  cursor={{fill: isDark ? 'rgba(255,255,255,0.03)' : '#f8fafc'}}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Credits Used vs Available */}
        <Card className="bg-card border border-border shadow-sm h-[380px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wide">
              CREDITS USED VS AVAILABLE
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={65}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{
                    backgroundColor: isDark ? '#131d35' : '#ffffff',
                    borderColor: isDark ? '#223354' : '#e2e8f0',
                    borderRadius: '12px',
                    color: isDark ? '#ffffff' : '#0f172a',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Custom Legend */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-2.5 bg-[#ef4444] rounded-[1px]"></div>
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Credits Used ({creditsUsed})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-2.5 bg-[#10b981] rounded-[1px]"></div>
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">Credits Available ({creditsAvailable})</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
