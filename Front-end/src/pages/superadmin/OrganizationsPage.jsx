import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Building2, TrendingUp, Users, Activity } from 'lucide-react';
import axios from 'axios';

const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b'];

export default function OrganizationsPage() {
  const { API_BASE_URL, token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        
        
        const res = await axios.get(`${API_BASE_URL}/api/superadmin/organizations/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Failed to fetch organization stats", error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [API_BASE_URL, token]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const growthChart = data?.growth_chart || [];
  const plansChart = data?.plans_chart || [];

  return (
    <div
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Organizations</h1>
          <p className="text-slate-500 mt-1">Manage and monitor tenant organizations.</p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 font-medium">
          + Add Organization
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Total Organizations" 
          value={kpis.total_organizations} 
          icon={<Building2 className="w-6 h-6 text-indigo-500" />} 
          trend="+12% this month"
          delay={0.1}
        />
        <KPICard 
          title="Active Organizations" 
          value={kpis.active_organizations} 
          icon={<Activity className="w-6 h-6 text-emerald-500" />} 
          trend="+5% this month"
          delay={0.2}
        />
        <KPICard 
          title="Churned (30d)" 
          value={kpis.churned_organizations} 
          icon={<Users className="w-6 h-6 text-rose-500" />} 
          trend="-2% this month"
          delay={0.3}
        />
        <KPICard 
          title="Monthly Revenue" 
          value={kpis.revenue} 
          icon={<TrendingUp className="w-6 h-6 text-amber-500" />} 
          trend="+18% this month"
          delay={0.4}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Growth Chart */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Organization Growth (6 Months)</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={growthChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#0f172a', fontWeight: 600 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="signups" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, fill: '#6366f1' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plan Distribution */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Plan Distribution</h2>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={plansChart}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {plansChart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, trend, delay }) {
  return (
    <div
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 rounded-xl bg-slate-50">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
        {trend && (
          <p className="text-xs font-medium text-emerald-500 mt-2 flex items-center">
            {trend}
          </p>
        )}
      </div>
    </div>
  );
}
