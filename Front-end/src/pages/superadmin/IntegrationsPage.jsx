import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Network, Activity, Plug, AlertCircle, CheckCircle2 } from 'lucide-react';
import axios from 'axios';

export default function IntegrationsPage() {
  const { API_BASE_URL, token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        
        
        const res = await axios.get(`${API_BASE_URL}/api/superadmin/integrations/status`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setData(res.data);
      } catch (error) {
        console.error("Failed to fetch integration stats", error);
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

  const integrations = data?.integrations || [];
  const apiTraffic = data?.api_traffic || [];

  return (
    <div
      className="p-8 max-w-7xl mx-auto space-y-8"
    >
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Integrations & API</h1>
          <p className="text-slate-500 mt-1">Monitor connected apps, webhooks, and API health.</p>
        </div>
        <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200 font-medium">
          Manage API Keys
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Connected Apps Grid */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {integrations.map((app, idx) => (
            <div
              key={app.id}
              className={`p-6 rounded-2xl border ${
                app.status === 'Connected' ? 'border-emerald-200 bg-emerald-50' :
                app.status === 'Warning' ? 'border-amber-200 bg-amber-50' :
                'border-slate-200 bg-white'
              } shadow-sm relative overflow-hidden`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-sm border border-slate-100">
                    <Plug className="w-6 h-6 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{app.name}</h3>
                    <p className="text-xs text-slate-500">{app.syncs} syncs today</p>
                  </div>
                </div>
                
                {/* Toggle Switch UI (Visual Only) */}
                <div className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${app.status !== 'Disconnected' ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${app.status !== 'Disconnected' ? 'translate-x-6' : 'translate-x-0'}`}></div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sm mt-6 pt-4 border-t border-slate-200/60">
                {app.status === 'Connected' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                {app.status === 'Warning' && <AlertCircle className="w-4 h-4 text-amber-500" />}
                {app.status === 'Disconnected' && <Network className="w-4 h-4 text-slate-400" />}
                <span className={`font-medium ${
                  app.status === 'Connected' ? 'text-emerald-700' :
                  app.status === 'Warning' ? 'text-amber-700' :
                  'text-slate-500'
                }`}>
                  {app.status} (Health: {app.health}%)
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* API Traffic Chart */}
        <div
          className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
        >
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-6 h-6 text-indigo-500" />
            <h2 className="text-lg font-semibold text-slate-800">Global API Traffic</h2>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={apiTraffic}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={10} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="calls" stroke="#6366f1" fillOpacity={1} fill="url(#colorCalls)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          
          <div className="mt-6 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">2xx Success</span>
              <span className="font-semibold text-emerald-600">99.8%</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">4xx Errors</span>
              <span className="font-semibold text-amber-600">0.15%</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">5xx Errors</span>
              <span className="font-semibold text-rose-600">0.05%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
