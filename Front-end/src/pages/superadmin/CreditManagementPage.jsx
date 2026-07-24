import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Coins, Zap, Clock, ArrowUpRight } from 'lucide-react';
import axios from 'axios';

export default function CreditManagementPage() {
  const { API_BASE_URL, token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        
        
        const res = await axios.get(`${API_BASE_URL}/api/superadmin/credits/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Failed to fetch credit stats", error);
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
  const usageChart = data?.usage_chart || [];
  const history = data?.history || [];

  return (
    <div
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Credit Management</h1>
          <p className="text-slate-500 mt-1">Track platform-wide AI credit consumption and billing.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard 
          title="Total Credits System" 
          value={kpis.total_credits_system?.toLocaleString()} 
          icon={<Coins className="w-6 h-6 text-amber-500" />} 
          delay={0.1}
        />
        <KPICard 
          title="Consumed This Month" 
          value={kpis.credits_consumed_month?.toLocaleString()} 
          icon={<Zap className="w-6 h-6 text-rose-500" />} 
          delay={0.2}
        />
        <KPICard 
          title="Active Top-ups" 
          value={kpis.active_topups} 
          icon={<Clock className="w-6 h-6 text-emerald-500" />} 
          delay={0.3}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Usage Chart */}
        <div
          className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-slate-800">7-Day Credit Usage</h2>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-rose-500"></span> Used</div>
              <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Purchased</div>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={usageChart}>
                <defs>
                  <linearGradient id="colorUsed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPurchased" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="used" stroke="#f43f5e" fillOpacity={1} fill="url(#colorUsed)" />
                <Area type="monotone" dataKey="purchased" stroke="#10b981" fillOpacity={1} fill="url(#colorPurchased)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Recent Top-ups</h2>
          <div className="space-y-4">
            {history.map((txn, idx) => (
              <div key={txn.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-500/30 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800">{txn.org}</p>
                    <p className="text-xs text-slate-500">{new Date(txn.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">+{txn.amount}</p>
                  <p className="text-xs text-slate-500">Credits</p>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-6 py-2 text-indigo-600 font-medium hover:bg-indigo-50:bg-indigo-900/20 rounded-lg transition-colors">
            View All Transactions
          </button>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, delay }) {
  return (
    <div
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex items-center justify-between"
    >
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-3xl font-bold text-slate-900">{value}</h3>
      </div>
      <div className="p-4 rounded-2xl bg-slate-50">
        {icon}
      </div>
    </div>
  );
}
