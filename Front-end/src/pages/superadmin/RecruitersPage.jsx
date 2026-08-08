import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  Users, UserCheck, Video, MoreHorizontal, Search, Edit, Mail, Trash2, 
  X, UserPlus, Coins, Download, Eye, EyeOff, Filter, Plus, Shield, Calendar, Clock, Sparkles
} from 'lucide-react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import axios from 'axios';
import api from '@/lib/api';

import { API_BASE_URL } from '@/apiConfig';

export default function RecruitersPage() {
  const { token } = useSelector(state => state.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openDropdownId, setOpenDropdownId] = useState(null);
  
  // Modals state
  const [editingRecruiter, setEditingRecruiter] = useState(null);
  const [messagingRecruiter, setMessagingRecruiter] = useState(null);
  const [deactivatingRecruiter, setDeactivatingRecruiter] = useState(null);
  const [messageForm, setMessageForm] = useState({ subject: '', body: '' });

  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [newAdminForm, setNewAdminForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    credits: 0,
    description: 'Welcome to HireIQ! You can now log in and manage your AI interviews. Please change your password upon your first login.'
  });
  const [addAdminLoading, setAddAdminLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [addingCreditsRecruiter, setAddingCreditsRecruiter] = useState(null);
  const [addCreditsAmount, setAddCreditsAmount] = useState(0);
  
  const fetchStats = async () => {
    try {
      const res = await api.get('/api/superadmin/recruiters/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (error) {
      console.error("Failed to fetch recruiter stats", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchStats();
  }, [token]);

  const handleAddAdminSubmit = async (e) => {
    e.preventDefault();
    setAddAdminLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/super-admin/admins`, {
        name: newAdminForm.name,
        username: newAdminForm.username,
        email: newAdminForm.email,
        password: newAdminForm.password,
        credits: parseInt(newAdminForm.credits),
        description: newAdminForm.description
      }, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      Swal.fire({
        title: 'Recruiter Added',
        text: 'Provisioned recruiter successfully!',
        icon: 'success',
        background: '#161c2d',
        color: '#fff'
      });
      setIsAddAdminOpen(false);
      setNewAdminForm({
        name: '',
        username: '',
        email: '',
        password: '',
        credits: 0,
        description: 'Welcome to HireIQ! You can now log in and manage your AI interviews. Please change your password upon your first login.'
      });
      setShowPassword(false);
      fetchStats();
    } catch (err) {
      Swal.fire({
        title: 'Error',
        text: err.response?.data?.detail || err.message,
        icon: 'error',
        background: '#161c2d',
        color: '#fff'
      });
    } finally {
      setAddAdminLoading(false);
    }
  };

  const handleAddCreditsSubmit = async (e) => {
    e.preventDefault();
    const amountNum = parseInt(addCreditsAmount);
    if (!amountNum || amountNum <= 0) {
      Swal.fire({
        title: 'Invalid Amount',
        text: 'Please enter a valid credit amount greater than 0.',
        icon: 'warning',
        background: '#161c2d',
        color: '#fff'
      });
      return;
    }
    try {
      await api.post(`/api/superadmin/recruiters/${addingCreditsRecruiter.id}/add-credits`, {
        credits: amountNum,
        amount: amountNum
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      Swal.fire({
        title: 'Credits Added',
        text: `Successfully added ${amountNum} credits to ${addingCreditsRecruiter.name}!`,
        icon: 'success',
        background: '#161c2d',
        color: '#fff'
      });
      setAddingCreditsRecruiter(null);
      setAddCreditsAmount(0);
      await fetchStats();
    } catch (err) {
      console.error(err);
      Swal.fire({
        title: 'Error',
        text: err.response?.data?.detail || err.message || 'Failed to add credits',
        icon: 'error',
        background: '#161c2d',
        color: '#fff'
      });
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/api/superadmin/recruiters/${editingRecruiter.id}`, editingRecruiter, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEditingRecruiter(null);
      fetchStats(); // refresh data
    } catch (err) {
      console.error(err);
      alert('Failed to update recruiter');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/superadmin/recruiters/${messagingRecruiter.id}/message`, messageForm, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessagingRecruiter(null);
      setMessageForm({ subject: '', body: '' });
      alert('Message sent successfully!');
    } catch (err) {
      console.error(err);
      alert('Failed to send message');
    }
  };

  const handleDeactivate = async () => {
    try {
      await api.put(`/api/superadmin/recruiters/${deactivatingRecruiter.id}/toggle-status`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeactivatingRecruiter(null);
      fetchStats(); // refresh data
    } catch (err) {
      console.error(err);
      alert('Failed to toggle status');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const recruiters = data?.recruiters || [];
  const weeklyActivity = data?.weekly_activity || [];

  const filteredRecruiters = recruiters.filter(r => {
    const matchesSearch = !searchTerm || 
      r.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.username?.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesRole = roleFilter === 'all' || r.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleDownloadCSV = () => {
    if (!filteredRecruiters || filteredRecruiters.length === 0) return;
    
    const headers = ['Recruiter Name', 'Email', 'Role', 'Status', 'Interviews', 'Credits', 'Last Active'];
    const csvContent = [
      headers.join(','),
      ...filteredRecruiters.map(r => [
        `"${r.name || ''}"`,
        `"${r.email || ''}"`,
        `"${r.role || ''}"`,
        `"${r.status || ''}"`,
        r.interviews_conducted || 0,
        r.credits || 0,
        `"${r.last_active ? new Date(r.last_active).toLocaleDateString() : 'N/A'}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'recruiters_data.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-xs border border-slate-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 shadow-xs">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 tracking-tight">Recruiters Management</h1>
              <p className="text-sm font-medium text-slate-500 mt-0.5">Manage platform recruiters, allocate interview credits, and monitor activity.</p>
            </div>
          </div>
        </div>
        <button 
          onClick={() => setIsAddAdminOpen(true)} 
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all hover:shadow-indigo-500/20 active:translate-y-0"
        >
          <UserPlus className="w-4 h-4" />
          Add Recruiter
        </button>
      </div>

      {/* ── Top Analytics Grid (KPIs & Activity Chart) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* KPI Cards (5 columns) */}
        <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 gap-4">
          <KPICard 
            title="Total Recruiters" 
            value={kpis.total_recruiters ?? recruiters.length} 
            subtitle="Registered platform accounts"
            icon={<Users className="w-5 h-5 text-indigo-600" />} 
            badge="Platform Total"
            badgeColor="bg-indigo-50 text-indigo-700 border-indigo-100"
          />
          <KPICard 
            title="Active Now" 
            value={kpis.active_now ?? recruiters.filter(r => r.status === 'Active').length} 
            subtitle="Enabled recruiter accounts"
            icon={<UserCheck className="w-5 h-5 text-emerald-600" />} 
            badge="Active"
            badgeColor="bg-emerald-50 text-emerald-700 border-emerald-100"
          />
          <KPICard 
            title="Avg Interviews / Recruiter" 
            value={kpis.avg_interviews ?? 0} 
            subtitle="Platform interview throughput"
            icon={<Video className="w-5 h-5 text-amber-600" />} 
            badge="Throughput"
            badgeColor="bg-amber-50 text-amber-700 border-amber-100"
          />
        </div>

        {/* Weekly Activity Chart (7 columns) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl shadow-xs border border-slate-100 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800">Weekly Activity (Interviews)</h2>
              <p className="text-xs text-slate-400 font-medium">Interview sessions completed across recent weeks</p>
            </div>
            <span className="px-2.5 py-1 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-semibold text-slate-600">
              Last 8 Weeks
            </span>
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 500 }} dy={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} allowDecimals={false} />
                <Tooltip 
                  cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.08)' }}
                  formatter={(val) => [`${val} Interviews`, 'Conducted']}
                />
                <Bar dataKey="interviews" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Recruiters Directory: 100% Full Width & Spacious ── */}
      <div className="w-full bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
        {/* Controls Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800">Recruiters Directory</h2>
            <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
              {filteredRecruiters.length} {filteredRecruiters.length === 1 ? 'Recruiter' : 'Recruiters'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="Search by name, email..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium placeholder:text-slate-400"
              />
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>

            {/* Export CSV */}
            <button 
              onClick={handleDownloadCSV}
              className="flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-xs transition-colors text-sm"
              title="Export recruiters list to CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Export
            </button>
          </div>
        </div>
        
        {/* Table Container with Horizontal Scroll support */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/70 text-slate-500 text-xs uppercase tracking-wider font-semibold border-b border-slate-100">
                <th className="px-6 py-4">Recruiter</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">Interviews Conducted</th>
                <th className="px-6 py-4 text-center">Credits Balance</th>
                <th className="px-6 py-4 text-center">Last Active</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredRecruiters.map((recruiter) => {
                const isSuperAdmin = recruiter.role === 'super_admin';
                return (
                  <tr
                    key={recruiter.id} 
                    className="hover:bg-indigo-50/30 transition-colors group"
                  >
                    {/* Recruiter Avatar & Info */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm shadow-xs ${
                          isSuperAdmin 
                            ? 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white' 
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {recruiter.name ? recruiter.name.charAt(0).toUpperCase() : 'R'}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">{recruiter.name}</p>
                          <p className="text-xs text-slate-500 font-medium">{recruiter.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                        isSuperAdmin 
                          ? 'bg-purple-50 text-purple-700 border border-purple-200' 
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {isSuperAdmin && <Shield className="w-3 h-3" />}
                        {isSuperAdmin ? 'Super Admin' : 'Admin'}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        recruiter.status === 'Active' 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${recruiter.status === 'Active' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></span>
                        {recruiter.status}
                      </span>
                    </td>

                    {/* Interviews */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-800 bg-slate-100/70 px-3 py-1 rounded-lg">
                        <Video className="w-3.5 h-3.5 text-slate-400" />
                        {recruiter.interviews_conducted || 0}
                      </span>
                    </td>

                    {/* Credits */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-black text-indigo-600 text-base tabular-nums">
                          {recruiter.credits || 0}
                        </span>
                        <button
                          onClick={() => setAddingCreditsRecruiter(recruiter)}
                          className="p-1 rounded-md text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Add Credits"
                        >
                          <Coins className="w-4 h-4" />
                        </button>
                      </div>
                    </td>

                    {/* Last Active */}
                    <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-medium text-slate-500">
                      {recruiter.last_active ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {new Date(recruiter.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Never</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-right relative">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setAddingCreditsRecruiter(recruiter)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Add Credits"
                        >
                          <Coins className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setMessagingRecruiter(recruiter); setMessageForm({ subject: '', body: '' }); }}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Send Message"
                        >
                          <Mail className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingRecruiter(recruiter)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit Recruiter"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => setOpenDropdownId(openDropdownId === recruiter.id ? null : recruiter.id)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="More Actions"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                      
                      {openDropdownId === recruiter.id && (
                        <>
                          <div 
                            className="fixed inset-0 z-10" 
                            onClick={() => setOpenDropdownId(null)}
                          ></div>
                          <div className="absolute right-6 top-12 w-48 bg-white rounded-xl shadow-lg border border-slate-100 py-1.5 z-20 animate-in fade-in slide-in-from-top-2 duration-150 text-left">
                            <button 
                              onClick={() => { setEditingRecruiter(recruiter); setOpenDropdownId(null); }}
                              className="w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2.5 transition-colors font-medium"
                            >
                              <Edit className="w-4 h-4 text-slate-400" /> Edit Recruiter
                            </button>
                            <button 
                              onClick={() => { setAddingCreditsRecruiter(recruiter); setOpenDropdownId(null); }}
                              className="w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2.5 transition-colors font-medium"
                            >
                              <Coins className="w-4 h-4 text-amber-500" /> Add Credits
                            </button>
                            <button 
                              onClick={() => { setMessagingRecruiter(recruiter); setOpenDropdownId(null); }}
                              className="w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-indigo-600 flex items-center gap-2.5 transition-colors font-medium"
                            >
                              <Mail className="w-4 h-4 text-indigo-500" /> Send Message
                            </button>
                            <div className="h-px bg-slate-100 my-1"></div>
                            <button 
                              onClick={() => { setDeactivatingRecruiter(recruiter); setOpenDropdownId(null); }}
                              className={`w-full px-4 py-2 text-sm ${recruiter.status === 'Active' ? 'text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'} flex items-center gap-2.5 transition-colors font-medium`}
                            >
                              <Trash2 className="w-4 h-4" /> {recruiter.status === 'Active' ? 'Deactivate Account' : 'Activate Account'}
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredRecruiters.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-6 py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center max-w-xs mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                        <Users className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-slate-700">No recruiters found</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {searchTerm ? `No results match "${searchTerm}"` : 'No recruiters match the selected filter criteria'}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD ADMIN */}
      {isAddAdminOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <form onSubmit={handleAddAdminSubmit} className="w-full max-w-lg bg-white/95 backdrop-blur-xl border border-white/60 rounded-[2rem] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.15)] space-y-6 text-slate-800 max-h-[90vh] overflow-y-auto relative animate-in zoom-in-95 duration-200">

            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none rounded-t-[2rem]" />

            <div className="flex justify-between items-start relative z-10 border-b border-indigo-100/50 pb-5">
              <div className="flex gap-4 items-center">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 shrink-0">
                  <UserPlus size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Provision Recruiter</h3>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">Create a new recruiter account</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-none cursor-pointer transition-colors"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            <div className="space-y-5 relative z-10">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={newAdminForm.name}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, name: e.target.value.replace(/[0-9]/g, '') }))}
                    placeholder="e.g. John Doe"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Username</label>
                  <input
                    type="text"
                    required
                    value={newAdminForm.username}
                    onChange={(e) => setNewAdminForm(prev => ({ ...prev, username: e.target.value }))}
                    placeholder="e.g. john_d"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={newAdminForm.email}
                  onChange={(e) => setNewAdminForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="e.g. john@example.com"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Description (Included in Email)</label>
                <textarea
                  value={newAdminForm.description}
                  onChange={(e) => setNewAdminForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. You can now log in and manage your AI interviews..."
                  rows="3"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={newAdminForm.password}
                      onChange={(e) => setNewAdminForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 pr-10 text-sm text-slate-800 font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider ml-1">Initial Credits</label>
                  <div className="relative">
                    <Coins size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="number"
                      min="0"
                      value={newAdminForm.credits}
                      onChange={(e) => setNewAdminForm(prev => ({ ...prev, credits: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-3 text-sm text-slate-800 font-bold outline-none focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-4 pt-6 mt-6 border-t border-slate-100 relative z-10">
              <button
                type="button"
                onClick={() => setIsAddAdminOpen(false)}
                className="flex-1 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm cursor-pointer transition-colors border-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addAdminLoading}
                className="flex-[2] py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 border-none text-white font-bold text-sm cursor-pointer disabled:opacity-50 shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                {addAdminLoading ? 'Provisioning...' : 'Add Recruiter'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: ADD CREDITS */}
      {addingCreditsRecruiter && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[9999] p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Add Credits</h3>
              <button onClick={() => setAddingCreditsRecruiter(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddCreditsSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Recruiter</label>
                <input type="text" disabled value={addingCreditsRecruiter.name} className="w-full px-4 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount to Add</label>
                <div className="relative">
                  <Coins className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="number" min="1" required value={addCreditsAmount} onChange={e => setAddCreditsAmount(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setAddingCreditsRecruiter(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium">Add Credits</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Recruiter Modal */}
      {editingRecruiter && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-slate-800 text-lg">Edit Recruiter</h3>
              <button onClick={() => setEditingRecruiter(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input required type="text" value={editingRecruiter.name} onChange={(e) => setEditingRecruiter({...editingRecruiter, name: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input required type="email" value={editingRecruiter.email} onChange={(e) => setEditingRecruiter({...editingRecruiter, email: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <select value={editingRecruiter.role} onChange={(e) => setEditingRecruiter({...editingRecruiter, role: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none">
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setEditingRecruiter(null)} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-colors">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Message Recruiter Modal */}
      {messagingRecruiter && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-semibold text-slate-800 text-lg">Send Message to {messagingRecruiter.name}</h3>
              <button onClick={() => setMessagingRecruiter(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSendMessage} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input required type="text" value={messageForm.subject} onChange={(e) => setMessageForm({...messageForm, subject: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Important Update" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message</label>
                <textarea required rows={4} value={messageForm.body} onChange={(e) => setMessageForm({...messageForm, body: e.target.value})} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none" placeholder="Type your message here..."></textarea>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setMessagingRecruiter(null)} className="px-5 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium shadow-sm transition-colors flex items-center gap-2">
                  <Mail className="w-4 h-4" /> Send Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate/Activate Recruiter Modal */}
      {deactivatingRecruiter && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-center p-6">
            <div className={`w-16 h-16 rounded-full ${deactivatingRecruiter.status === 'Active' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'} flex items-center justify-center mx-auto mb-4`}>
              <UserCheck className="w-8 h-8" />
            </div>
            <h3 className="font-bold text-slate-800 text-xl mb-2">
              {deactivatingRecruiter.status === 'Active' ? 'Deactivate' : 'Activate'} {deactivatingRecruiter.name}?
            </h3>
            <p className="text-slate-500 mb-6 text-sm">
              {deactivatingRecruiter.status === 'Active' 
                ? "This recruiter will immediately lose access to their account and dashboard."
                : "This recruiter will regain full access to their account and dashboard."}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeactivatingRecruiter(null)} className="flex-1 py-3 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl font-medium transition-colors">
                Cancel
              </button>
              <button onClick={handleDeactivate} className={`flex-1 py-3 text-white ${deactivatingRecruiter.status === 'Active' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'} rounded-xl font-medium shadow-sm transition-colors`}>
                Yes, {deactivatingRecruiter.status === 'Active' ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, badge, badgeColor }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-xs border border-slate-100 hover:shadow-sm transition-all flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight mt-0.5">{value ?? 0}</h3>
          {subtitle && <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {badge && (
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 hidden sm:inline-block ${badgeColor || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
          {badge}
        </span>
      )}
    </div>
  );
}
