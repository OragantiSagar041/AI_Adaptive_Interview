import React from "react";
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
  // Dummy data for charts
  const lineData = [
    { date: "07/09", interviews: 6 },
    { date: "07/10", interviews: 5 },
    { date: "07/11", interviews: 6 },
    { date: "07/12", interviews: 1 },
    { date: "07/13", interviews: 5 },
    { date: "07/14", interviews: 26 },
    { date: "07/15", interviews: 9 }
  ];

  const barData = [
    { name: "Sagar Oraganti", value: 45 },
    { name: "Test_123", value: 1 },
    { name: "Test_1", value: 4 },
    { name: "John Snow", value: 1 },
    { name: "Koteeswararao", value: 0 },
    { name: "Admin (admin)", value: 121 }
  ];

  const pieData = [
    { name: "Credits Available", value: 100134 },
    { name: "Credits Used", value: 5000 }
  ];

  const PIE_COLORS = ["#10b981", "#ef4444"]; // Green for available, Red for used

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50">
      
      {/* Top Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        
        <Card className="bg-white border-none shadow-sm flex flex-col justify-center h-28">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">AVAILABLE CREDITS</span>
              <span className="text-3xl font-bold text-emerald-500 tracking-tight">100134</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-sm flex flex-col justify-center h-28">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">TOTAL INTERVIEWS</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">181</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <Video className="w-5 h-5 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-sm flex flex-col justify-center h-28">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">COMPLETED</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">42</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-indigo-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-sm flex flex-col justify-center h-28">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">PENDING</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">6</span>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-sm flex flex-col justify-center h-28">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">RECRUITERS</span>
              <span className="text-3xl font-bold text-slate-800 tracking-tight">4</span>
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
