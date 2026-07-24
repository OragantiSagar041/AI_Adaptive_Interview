import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ShieldCheck, ShieldAlert, Key, Users, AlertTriangle } from 'lucide-react';
import axios from 'axios';

const COLORS = ['#6366f1', '#10b981', '#f43f5e'];

export default function SecurityPage() {
  const { API_BASE_URL, token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        
        
        const res = await axios.get(`${API_BASE_URL}/api/superadmin/security/stats`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Failed to fetch security stats", error);
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
  const authMethods = data?.auth_methods || [];
  const alerts = data?.recent_alerts || [];

  return (
    <div
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Security & Access</h1>
          <p className="text-slate-500 mt-1">Monitor authentication methods, sessions, and security alerts.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Global Security Score" 
          value={`${kpis.security_score}/100`} 
          icon={<ShieldCheck className="w-6 h-6 text-emerald-500" />} 
          delay={0.1}
          valueClass="text-emerald-500"
        />
        <KPICard 
          title="Active Sessions" 
          value={kpis.active_sessions} 
          icon={<Users className="w-6 h-6 text-indigo-500" />} 
          delay={0.2}
        />
        <KPICard 
          title="Failed Logins (24h)" 
          value={kpis.failed_logins_24h} 
          icon={<ShieldAlert className="w-6 h-6 text-rose-500" />} 
          delay={0.3}
          valueClass={kpis.failed_logins_24h > 10 ? "text-rose-500" : ""}
        />
        <KPICard 
          title="Users with 2FA" 
          value={kpis.users_with_2fa} 
          icon={<Key className="w-6 h-6 text-amber-500" />} 
          delay={0.4}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Auth Methods Chart */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <h2 className="text-lg font-semibold text-slate-800 mb-6">Authentication Methods</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={authMethods}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {authMethods.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(val) => [`${val}%`, 'Usage']}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Security Alerts */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <div className="flex items-center gap-3 mb-6">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
            <h2 className="text-lg font-semibold text-slate-800">Active Security Alerts</h2>
          </div>
          
          <div className="space-y-4">
            {alerts.length > 0 ? (
              alerts.map((alert, idx) => (
                <div key={idx} className="p-4 bg-rose-50 rounded-xl border border-rose-200 flex justify-between items-center">
                  <div>
                    <h4 className="font-semibold text-rose-800">{alert.type}</h4>
                    <p className="text-sm text-rose-600">IP: {alert.ip}</p>
                  </div>
                  <span className="text-xs font-medium text-rose-500 bg-white px-2 py-1 rounded-md shadow-sm">
                    {alert.time}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-50" />
                <p>No active security alerts.</p>
                <p className="text-sm mt-1">Your system is secure.</p>
              </div>
            )}
          </div>
          
          <button className="w-full mt-6 py-2 text-indigo-600 font-medium hover:bg-indigo-50:bg-indigo-900/20 rounded-lg transition-colors border border-indigo-100">
            Review Security Policies
          </button>
        </div>
      </div>
    </div>
  );
}

function KPICard({ title, value, icon, delay, valueClass = "" }) {
  return (
    <div
      className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow flex flex-col justify-between"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 rounded-xl bg-slate-50">
          {icon}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className={`text-3xl font-bold text-slate-900 ${valueClass}`}>{value}</h3>
      </div>
    </div>
  );
}
