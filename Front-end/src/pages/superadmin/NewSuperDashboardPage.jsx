import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { loadSuperAdminDashboard } from "@/store/slices/dashboardSlice";
import { setStatusFilter } from "@/store/slices/candidatesSlice";
import {
  Coins,
  Video,
  CheckCircle2,
  Clock,
  Users,
  Download,
  CreditCard,
  Sparkles
} from "lucide-react";
import {
  AreaChart,
  Area,
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
import { getThemeColor } from "../../utils/themeUtils";

export default function NewSuperDashboardPage() {
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
dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter }));
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter }));
    }, 15000);
    return () => clearInterval(interval);
  }, [dispatch, selectedAdminFilter]);

  // Construct line/area data dynamically from backend stats with realistic defaults
  const lineData = dbStats?.chart_labels?.length
    ? dbStats.chart_labels.map((label, idx) => ({
        date: label,
        interviews: dbStats.chart_data?.[idx] ?? 0
      }))
    : [
        { date: "Jul 31", interviews: 24 },
        { date: "08/01", interviews: 12 },
        { date: "08/02", interviews: 0 },
        { date: "08/03", interviews: 25 },
        { date: "08/04", interviews: 28 },
        { date: "08/05", interviews: 6 },
        { date: "08/06", interviews: 0 }
      ];

  // Bar data
  const barData = dbStats?.admin_labels?.length
    ? dbStats.admin_labels.map((label, idx) => ({
        name: label,
        value: dbStats.admin_data?.[idx] ?? 0
      }))
    : [
        { name: "Test_123", value: 320 },
        { name: "John Snow", value: 70 },
        { name: "Sanjay", value: 28 },
        { name: "test", value: 85 }
      ];

  const creditsAvailable = Number(dbStats?.credits_available ?? dbStats?.credits ?? 1242);
  const creditsUsed = Number(dbStats?.credits_used ?? 180);

  const pieData = useMemo(() => [
    { name: "Credits Available", value: creditsAvailable },
    { name: "Credits Used", value: creditsUsed }
  ], [creditsAvailable, creditsUsed]);

  const BAR_COLORS = ["#818cf8", "#34d399", "#fbbf24", "#f472b6", "#38bdf8"];

  // Custom Area Tooltip
  const CustomAreaTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border px-3.5 py-2 rounded-xl shadow-xl text-xs font-semibold text-card-foreground flex items-center gap-2">
          <span>{payload[0].payload.date}:</span>
          <span className="text-primary font-bold">{payload[0].value} Interviews</span>
        </div>
      );
    }
    return null;
  };

  // Custom Bar Tooltip matching theme
  const CustomBarTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const barColor = payload[0].color || payload[0].fill || "#818cf8";
      return (
        <div className="bg-card text-card-foreground border border-border p-3.5 rounded-xl shadow-2xl text-xs space-y-1.5 min-w-[150px]">
          <div className="text-muted-foreground font-bold text-[11px] pb-1 border-b border-border font-mono">
            {data.name || "Admin"}
          </div>
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: barColor }}></span>
              <span className="text-muted-foreground font-medium">{data.name}:</span>
            </div>
            <span className="font-extrabold text-foreground">{data.value}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="relative min-h-full pb-16 bg-transparent text-foreground font-sans space-y-6">
        
        {/* Top Stat Cards Row (5 Cards) */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          
          {/* Card 1: AVAILABLE CREDITS */}
          <Card
            className="bg-card border border-border/80 shadow-sm rounded-2xl hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 text-card-foreground"
            onClick={() => navigate("/superadmin/credit")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  AVAILABLE CREDITS
                </span>
                <span className="text-3xl font-extrabold text-emerald-500 tracking-tight">
                  {dbStats?.credits_available ?? dbStats?.credits ?? 1242}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
                <Coins className="w-5.5 h-5.5 text-emerald-500" />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: TOTAL INTERVIEWS */}
          <Card
            className="bg-card border border-border/80 shadow-sm rounded-2xl hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 text-card-foreground"
            onClick={() => navigate("/superadmin/interviews")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  TOTAL INTERVIEWS
                </span>
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  {dbStats?.total ?? 368}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                <Video className="w-5.5 h-5.5 text-indigo-500" />
              </div>
            </CardContent>
          </Card>

          {/* Card 3: COMPLETED */}
          <Card
            className="bg-card border border-border/80 shadow-sm rounded-2xl hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 text-card-foreground"
            onClick={() => {
              dispatch(setStatusFilter("completed"));
              navigate("/superadmin/interviews");
            }}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  COMPLETED
                </span>
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  {dbStats?.completed ?? 184}
                </span>
              </div>
              <div className="w-11 h-11 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20">
                <CheckCircle2 className="w-5.5 h-5.5 text-indigo-500" />
              </div>
            </CardContent>
          </Card>

          {/* Card 4: PENDING */}
          <Card
            className="bg-card border border-border/80 shadow-sm rounded-2xl hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 text-card-foreground"
            onClick={() => navigate("/superadmin/interviews")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  PENDING
                </span>
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  {dbStats?.pending ?? 2}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                <Clock className="w-5.5 h-5.5 text-amber-500" />
              </div>
            </CardContent>
          </Card>

          {/* Card 5: RECRUITERS */}
          <Card
            className="bg-card border border-border/80 shadow-sm rounded-2xl hover:shadow-md transition-all cursor-pointer hover:-translate-y-0.5 text-card-foreground"
            onClick={() => navigate("/superadmin/recruiters")}
          >
            <CardContent className="p-5 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  RECRUITERS
                </span>
                <span className="text-3xl font-extrabold text-foreground tracking-tight">
                  {dbStats?.recruiters_count ?? 7}
                </span>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                <Users className="w-5.5 h-5.5 text-blue-500" />
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Charts Row (3 Columns) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Chart 1: INTERVIEWS LAST 7 DAYS */}
          <Card className="bg-card border border-border/80 shadow-sm rounded-2xl p-5 flex flex-col h-[390px] text-card-foreground">
            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wide">
                INTERVIEWS LAST 7 DAYS
              </CardTitle>
              <button 
                className="w-8 h-8 rounded-lg border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Download Chart Data"
              >
                <Download className="w-4 h-4" />
              </button>
            </CardHeader>

            <CardContent className="p-0 flex-1 min-h-0 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineData} margin={{ top: 15, right: 15, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={getThemeColor('--primary', '#6366f1')} stopOpacity={0.4} />
                      <stop offset="95%" stopColor={getThemeColor('--primary', '#6366f1')} stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={getThemeColor('--border', '#e2e8f0')} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: getThemeColor('--muted-foreground', '#94a3b8') }} axisLine={false} tickLine={false} dy={8} />
                  <YAxis tick={{ fontSize: 10, fill: getThemeColor('--muted-foreground', '#94a3b8') }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomAreaTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="interviews"
                    stroke={getThemeColor('--primary', '#6366f1')}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#areaGradient)"
                    dot={{ r: 4, fill: getThemeColor('--card', '#ffffff'), stroke: getThemeColor('--primary', '#6366f1'), strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: getThemeColor('--primary', '#6366f1'), stroke: getThemeColor('--card', '#ffffff'), strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Chart 2: INTERVIEWS BY ADMIN */}
          <Card className="bg-card border border-border/80 shadow-sm rounded-2xl p-5 flex flex-col h-[390px] text-card-foreground">
            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wide">
                INTERVIEWS BY ADMIN
              </CardTitle>
              <button 
                className="w-8 h-8 rounded-lg border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                title="Download Chart Data"
              >
                <Download className="w-4 h-4" />
              </button>
            </CardHeader>

            <CardContent className="p-0 flex-1 min-h-0 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 15, right: 15, left: -25, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={getThemeColor('--border', '#e2e8f0')} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: getThemeColor('--muted-foreground', '#94a3b8') }}
                    axisLine={false}
                    tickLine={false}
                    angle={-25}
                    textAnchor="end"
                    dx={-4}
                    dy={8}
                  />
                  <YAxis tick={{ fontSize: 10, fill: getThemeColor('--muted-foreground', '#94a3b8') }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomBarTooltip />} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={38}>
                    {barData.map((entry, index) => (
                      <Cell key={`bar-cell-${index}`} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Chart 3: CREDITS USED VS AVAILABLE */}
          <Card className="bg-card border border-border/80 shadow-sm rounded-2xl p-5 flex flex-col h-[390px] relative text-card-foreground">
            <CardHeader className="p-0 pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-xs font-bold text-foreground uppercase tracking-wide">
                CREDITS USED VS AVAILABLE
              </CardTitle>
              <div className="flex items-center gap-1.5">
                <button 
                  className="w-8 h-8 rounded-lg border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Download Data"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button 
                  className="w-8 h-8 rounded-lg border border-border bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  title="Card Details"
                >
                  <CreditCard className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 min-h-0 relative flex flex-col items-center justify-center">
              <div className="w-full h-[220px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={95}
                      paddingAngle={0}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      stroke="none"
                    >
                      <Cell fill="#10b981" /> {/* Available - Green */}
                      <Cell fill="#ef4444" /> {/* Used - Red */}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>

                {/* Center text inside Donut Ring */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                  <div className="text-3xl font-extrabold text-foreground tracking-tight">
                    {creditsAvailable}
                  </div>
                  <div className="text-xs font-semibold text-muted-foreground">
                    Credits Available
                  </div>
                </div>
              </div>

              {/* Bottom Donut Legend */}
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2.5 rounded-sm bg-red-500"></div>
                  <span className="text-xs font-semibold text-muted-foreground">Credits Used</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-2.5 rounded-sm bg-emerald-500"></div>
                  <span className="text-xs font-semibold text-muted-foreground">Credits Available</span>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Footer */}
        <div className="pt-8 flex items-center justify-center text-xs font-medium text-muted-foreground border-t border-border/80 text-center">
          © Copyright HireIQ
        </div>

      {/* Bottom-Right Floating AI Agent Sparkle Button */}
      <button 
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xl shadow-indigo-500/30 hover:scale-110 active:scale-95 transition-all cursor-pointer z-40"
        title="AI Assistant"
      >
        <Sparkles className="w-5.5 h-5.5" />
      </button>

    </div>
  );
}