import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DollarSign, ShieldCheck, Repeat, TrendingDown } from 'lucide-react';
import axios from 'axios';

const COLORS = ['#64748b', '#3b82f6', '#6366f1', '#8b5cf6'];

export default function SubscriptionManagementPage() {
  const { API_BASE_URL, token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        
        
        const res = await axios.get(`${API_BASE_URL}/api/superadmin/subscriptions/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Failed to fetch subscription stats", error);
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
  const mrrChart = data?.mrr_chart || [];
  const tiers = data?.tiers || [];

  return (
    <div
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Subscription Management</h1>
          <p className="text-slate-500 mt-1">Monitor MRR, active plans, and churn rates.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Monthly Recurring Rev" 
          value={kpis.mrr} 
          icon={<DollarSign className="w-6 h-6 text-emerald-500" />} 
          delay={0.1}
        />
        <KPICard 
          title="Annual Run Rate" 
          value={kpis.arr} 
          icon={<TrendingDown className="w-6 h-6 text-indigo-500" />} 
          delay={0.2}
        />
        <KPICard 
          title="Active Subscribers" 
          value={kpis.active_subs} 
          icon={<ShieldCheck className="w-6 h-6 text-blue-500" />} 
          delay={0.3}
        />
        <KPICard 
          title="Churn Rate" 
          value={kpis.churn_rate} 
          icon={<Repeat className="w-6 h-6 text-rose-500" />} 
          delay={0.4}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* MRR Chart */}
        <div
          className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-6">MRR Growth (6 Months)</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mrrChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  formatter={(val) => [`$${val}`, 'MRR']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  itemStyle={{ color: '#0f172a', fontWeight: 600 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="mrr" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff' }}
                  activeDot={{ r: 6, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tier Distribution */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Subscriber Tiers</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tiers}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {tiers.map((entry, index) => (
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

function KPICard({ title, value, icon, delay }) {
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
      </div>
    </div>
  );
}
