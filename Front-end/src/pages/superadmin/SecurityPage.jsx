import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { ShieldCheck, ShieldAlert, Key, Users, AlertTriangle, X } from 'lucide-react';

const ToggleSwitch = ({ checked, onChange }) => (
  <div onClick={onChange} className={`w-11 h-6 rounded-full flex items-center p-1 cursor-pointer transition-colors ${checked ? 'bg-indigo-600' : 'bg-slate-300'}`}>
    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`}></div>
  </div>
);
import api, { dedupedGet } from '../../lib/api';
import { API_BASE_URL } from '../../apiConfig';

const COLORS = ['#6366f1', '#10b981', '#f43f5e'];

export default function SecurityPage() {
  const { token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [policies, setPolicies] = useState({
    require_2fa: true,
    strict_session_timeout: true,
    restrict_ip: false,
    allowed_ips: []
  });
  const [ipInput, setIpInput] = useState("");

  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    const fetchSecurityData = async () => {
      try {
        const queryParam = roleFilter === "all" ? "" : `?role_filter=${roleFilter}`;
        const [statsRes, policiesRes] = await Promise.all([
          dedupedGet(`/api/superadmin/security/stats${queryParam}`, {
            headers: { Authorization: `Bearer ${token}` }
          }),
          dedupedGet(`/api/superadmin/security/policies`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => ({ data: { policies: null } }))
        ]);
        
        setData(statsRes.data);
        if (policiesRes.data.policies) {
          setPolicies(policiesRes.data.policies);
          setIpInput((policiesRes.data.policies.allowed_ips || []).join(", "));
        }
      } catch (error) {
        console.error("Failed to fetch security data", error);
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchSecurityData();
  }, [token, roleFilter]);

  // Optimistic update — UI flips instantly, network call happens in background
  const handleTogglePolicy = (key) => {
    const prevPolicies = policies;
    const newPolicies = { ...policies, [key]: !policies[key] };
    setPolicies(newPolicies); // instant UI update — zero perceived latency
    
    // Fire-and-forget: save in background without blocking the UI
    api.put(`/api/superadmin/security/policies`, newPolicies, {
      headers: { Authorization: `Bearer ${token}` }
    }).catch((error) => {
      console.error("Failed to update policy", error);
      setPolicies(prevPolicies); // revert on failure
    });
  };

  const handleSaveIps = () => {
    const ips = ipInput.split(',').map(ip => ip.trim()).filter(ip => ip.length > 0);
    const newPolicies = { ...policies, allowed_ips: ips };
    setPolicies(newPolicies);
    
    api.put(`/api/superadmin/security/policies`, newPolicies, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(() => {
      // Re-fetch to confirm or just rely on state
      setIpInput(ips.join(", "));
    }).catch((error) => {
      console.error("Failed to update IPs", error);
      // Revert input on error
      setIpInput((policies.allowed_ips || []).join(", "));
    });
  };

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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-500" />
              <h2 className="text-lg font-semibold text-slate-800">Active Security Alerts</h2>
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 bg-white rounded-lg text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admins</option>
              <option value="tenant">Recruiters</option>
            </select>
          </div>
          
          <div className="space-y-4">
            {alerts.length > 0 ? (
              alerts.map((alert, idx) => {
                const isFailed = alert.type?.toLowerCase().includes("failed");
                const isSuccess = alert.type?.toLowerCase().includes("successful");
                const cardStyle = isFailed
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : isSuccess
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                  : "bg-indigo-50 border-indigo-200 text-indigo-800";
                const badgeStyle = isFailed
                  ? "text-rose-600"
                  : isSuccess
                  ? "text-emerald-600"
                  : "text-indigo-600";
                return (
                  <div key={idx} className={`p-4 rounded-xl border flex justify-between items-center ${cardStyle}`}>
                    <div>
                      <h4 className="font-semibold">{alert.type}</h4>
                      <p className="text-sm opacity-80">IP: {alert.ip}</p>
                    </div>
                    <span className={`text-xs font-medium bg-white px-2 py-1 rounded-md shadow-sm ${badgeStyle}`}>
                      {alert.time}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-50" />
                <p>No active security alerts.</p>
                <p className="text-sm mt-1">Your system is secure.</p>
              </div>
            )}
          </div>
          
          <button 
            onClick={() => setIsModalOpen(true)}
            className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold rounded-xl shadow-md hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 group transform hover:-translate-y-0.5"
          >
            <ShieldCheck className="w-5 h-5 text-indigo-200 group-hover:text-white transition-colors" />
            <span>Review Security Policies</span>
          </button>
        </div>
      </div>

      {/* Security Policies Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-6 border-b border-slate-100 bg-slate-50/80">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-indigo-600" />
                Global Security Policies
              </h2>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 p-2 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/30">
              <div className="space-y-6">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Authentication Requirements</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
                      <div>
                        <p className="font-semibold text-slate-800">Require Two-Factor Authentication</p>
                        <p className="text-sm text-slate-500 mt-1">Enforce 2FA for Super Admin account</p>
                      </div>
                      <ToggleSwitch checked={policies.require_2fa} onChange={() => handleTogglePolicy('require_2fa')} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors">
                      <div>
                        <p className="font-semibold text-slate-800">Strict Session Timeout</p>
                        <p className="text-sm text-slate-500 mt-1">Log out inactive users after 30 minutes of idle time</p>
                      </div>
                      <ToggleSwitch checked={policies.strict_session_timeout} onChange={() => handleTogglePolicy('strict_session_timeout')} />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Access Control</h3>
                  <div className="space-y-3">
                    <div className="flex flex-col p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-800">Restrict by IP Address</p>
                          <p className="text-sm text-slate-500 mt-1">Only allow dashboard logins from recognized corporate IP addresses</p>
                        </div>
                        <ToggleSwitch checked={policies.restrict_ip} onChange={() => handleTogglePolicy('restrict_ip')} />
                      </div>
                      {policies.restrict_ip && (
                        <div className="pt-3 border-t border-slate-100 flex gap-3">
                          <input
                            type="text"
                            value={ipInput}
                            onChange={(e) => setIpInput(e.target.value)}
                            placeholder="e.g., 192.168.1.1, 10.0.0.5"
                            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                          <button
                            onClick={handleSaveIps}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            Save IPs
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-slate-100 bg-white flex justify-between items-center">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> Policy changes take effect immediately.
              </span>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-medium transition-colors shadow-sm hover:shadow-md"
              >
                Close Settings
              </button>
            </div>
          </div>
        </div>
      )}
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
