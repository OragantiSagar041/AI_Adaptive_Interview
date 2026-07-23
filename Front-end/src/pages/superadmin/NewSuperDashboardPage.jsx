import React, { useEffect } from "react";
// Vite reload trigger comment - run clean poll
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { loadSuperAdminDashboard } from "@/store/slices/dashboardSlice";
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

export default function NewSuperDashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const dbStats = useSelector((state) => state.dashboard.dbStats);
  const selectedAdminFilter = useSelector((state) => state.dashboard.selectedAdminFilter);

  useEffect(() => {
    dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter,  }));
    const interval = setInterval(() => {
      dispatch(loadSuperAdminDashboard({ adminFilter: selectedAdminFilter,  }));
    }, 15000); // Poll every 15s for fresh backend data
    return () => clearInterval(interval);
  }, [dispatch, selectedAdminFilter]);

  // Construct chart data dynamically from backend stats
  const lineData = dbStats?.chart_labels?.map((label, idx) => ({
    date: label,
    interviews: dbStats.chart_data?.[idx] || 0
  })) || [];

  const barData = dbStats?.admin_labels?.map((label, idx) => ({
    name: label,
    value: dbStats.admin_data?.[idx] || 0
  })) || [];

  const creditsAvailable = Number(dbStats?.credits_available ?? dbStats?.credits ?? 0);
  const creditsUsed = Number(dbStats?.credits_used ?? 0);

  const pieData = [
    { name: "Credits Available", value: creditsAvailable },
    { name: "Credits Used", value: creditsUsed }
  ];

  const PIE_COLORS = ["#10b981", "#ef4444"]; // Green for available, Red for used

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50">
      
      {/* Top Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        
        <Card
          className="bg-white border-none shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border hover:border-emerald-200"
          onClick={() => navigate('/superadmin/dashboard')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">AVAILABLE CREDITS</span>
              <span className="text-3xl font-bold text-emerald-500 tracking-tight">
                {dbStats?.credits_available ?? dbStats?.credits ?? '--'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="bg-white border-none shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border hover:border-indigo-200"
          onClick={() => navigate('/superadmin/dashboard')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">TOTAL INTERVIEWS</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">
                {dbStats?.total ?? '--'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="bg-white border-none shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border hover:border-indigo-200"
          onClick={() => navigate('/superadmin/qualified-candidates')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">COMPLETED</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">
                {dbStats?.completed ?? '--'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="bg-white border-none shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border hover:border-amber-200"
          onClick={() => navigate('/superadmin/dashboard')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">PENDING</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">
                {dbStats?.pending ?? '--'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card
          className="bg-white border-none shadow-sm flex flex-col justify-center h-28 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md hover:border hover:border-blue-200"
          onClick={() => navigate('/superadmin/team')}
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">RECRUITERS</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">
                {dbStats?.recruiters_count ?? '--'}
              </span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Interviews Last 7 Days */}
        <Card className="bg-white border-none shadow-sm h-[380px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
              INTERVIEWS LAST 7 DAYS
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Line 
                  type="monotone" 
                  dataKey="interviews" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#fff', stroke: '#6366f1', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Interviews by Admin */}
        <Card className="bg-white border-none shadow-sm h-[380px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
              INTERVIEWS BY ADMIN
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 5, right: 20, left: -20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  tick={{fontSize: 10, fill: '#64748b'}} 
                  axisLine={false} 
                  tickLine={false} 
                  angle={-35}
                  textAnchor="end"
                  dx={-5}
                  dy={10}
                />
                <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                  cursor={{fill: '#f8fafc'}}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Credits Used vs Available */}
        <Card className="bg-white border-none shadow-sm h-[380px] flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
              CREDITS USED VS AVAILABLE
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
              </PieChart>
            </ResponsiveContainer>
            
            {/* Custom Legend */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-8 h-2.5 bg-[#ef4444] rounded-[1px]"></div>
                <span className="text-xs text-slate-600 font-medium">Credits Used</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-2.5 bg-[#10b981] rounded-[1px]"></div>
                <span className="text-xs text-slate-600 font-medium">Credits Available</span>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
