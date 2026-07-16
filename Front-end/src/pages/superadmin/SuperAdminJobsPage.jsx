import React, { useState, useEffect, useCallback } from 'react';
import { Briefcase, Plus, MapPin, Clock, FileText, X, Target, Trash2, Pencil, Wallet, Users, LayoutGrid, LayoutList, ArrowRight, ChevronRight, Zap, Building2, BookOpen, CheckCircle2, Mail, Phone, ExternalLink, RefreshCw, ChevronDown } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import JobApplicationModal from '../../components/JobApplicationModal';
import { useSelector, useDispatch } from 'react-redux';
import { loadSuperAdminDashboard } from '../../store/slices/dashboardSlice';
import { getComputedStatus } from '../../utils/adminFormatters';

const WORK_MODE_STYLES = {
  Remote: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Hybrid: 'bg-blue-50 text-blue-700 border-blue-200',
  'On-site': 'bg-amber-50 text-amber-700 border-amber-200',
};

const GRADIENT_ACCENTS = [
  'from-indigo-500 via-purple-500 to-indigo-600',
  'from-teal-500 via-cyan-500 to-teal-600',
  'from-rose-500 via-pink-500 to-rose-600',
  'from-amber-500 via-orange-500 to-amber-600',
  'from-violet-500 via-purple-500 to-violet-600',
  'from-sky-500 via-blue-500 to-sky-600',
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function SuperAdminJobsPage() {
  const dispatch = useDispatch();
  // Read the JWT token from Redux state — exactly how every other page does it.
  // Login stores it in Redux (auth.token) + sessionStorage('adminToken').
  // localStorage is never written, so reading from there always returns null.
  const token = useSelector((state) => state.auth.token);
  const candidates = useSelector((state) => state.candidates?.candidates || []);

  // Builds the Authorization header from Redux token (not localStorage)
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    if (candidates.length === 0) {
      dispatch(loadSuperAdminDashboard());
    }
  }, [dispatch, candidates.length]);

  const [selectedJobForCandidates, setSelectedJobForCandidates] = useState(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [jobsLoading, setJobsLoading] = useState(true);

  // ── Application viewer state ──────────────────────────────────────────────
  const [applicationData, setApplicationData] = useState({
    open: false,
    job: null,
    list: [],
    loading: false,
  });

  const openApplications = useCallback(async (job) => {
    setApplicationData({ open: true, job, list: [], loading: true });
    try {
      const res = await fetch(`${API_BASE_URL}/api/jobs/${job.job_id}/applications`, {
        headers: { ...authHeaders },
      });
      if (res.ok) {
        const data = await res.json();
        setApplicationData(prev => ({ ...prev, list: data.applications || [], loading: false }));
      } else {
        console.error('Failed to fetch applications:', res.status);
        setApplicationData(prev => ({ ...prev, loading: false }));
      }
    } catch (err) {
      console.error('Error fetching applications:', err);
      setApplicationData(prev => ({ ...prev, loading: false }));
    }
  }, [authHeaders]);

  const closeApplications = () =>
    setApplicationData({ open: false, job: null, list: [], loading: false });

  const handleStatusChange = async (app, newStatus) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/jobs/${app.job_id}/applications/${app._id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (res.ok) {
        setApplicationData(prev => ({
          ...prev,
          list: prev.list.map(a =>
            a._id === app._id ? { ...a, status: newStatus } : a
          ),
        }));
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const [jobs, setJobs] = useState([]);

  // ── Fetch jobs from backend on mount ──────────────────────────────────────
  useEffect(() => {
    const fetchJobs = async () => {
      setJobsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/jobs`, {
          headers: { ...authHeaders }
        });
        if (res.ok) {
          const data = await res.json();
          setJobs(data.jobs || []);
        } else {
          console.error('Failed to fetch jobs:', res.status);
        }
      } catch (err) {
        console.error('Error fetching jobs:', err);
      } finally {
        setJobsLoading(false);
      }
    };
    fetchJobs();
  }, []);

  const [showModal, setShowModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    experience: '',
    skills: '',
    description: '',
    workMode: 'Remote',
    bond: '',
    location: '',
    salary: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormData({
      title: '', experience: '', skills: '', description: '',
      workMode: 'Remote', bond: '', location: '', salary: ''
    });
    setEditingJobId(null);
    setShowModal(false);
  };

  // ── Create or update a job via backend ────────────────────────────────────
  const handleCreateJob = async (e) => {
    e.preventDefault();
    try {
      if (editingJobId) {
        // editingJobId holds the backend job_id string e.g. "JOB-ABCDEF"
        const res = await fetch(`${API_BASE_URL}/api/jobs/${editingJobId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          setJobs(prev => prev.map(j => j.job_id === editingJobId ? { ...j, ...formData } : j));
        } else {
          console.error('Failed to update job:', await res.text());
        }
      } else {
        const res = await fetch(`${API_BASE_URL}/api/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify(formData),
        });
        if (res.ok) {
          const data = await res.json();
          setJobs(prev => [data.job, ...prev]);
        } else {
          console.error('Failed to create job:', await res.text());
        }
      }
    } catch (err) {
      console.error('Error saving job:', err);
    }
    resetForm();
  };

  const handleEditJob = (job) => {
    setFormData({
      title: job.title || '',
      experience: job.experience || '',
      skills: job.skills || '',
      description: job.description || '',
      workMode: job.workMode || 'Remote',
      bond: job.bond || '',
      location: job.location || '',
      salary: job.salary || '',
    });
    // Store the real MongoDB job_id for the PUT call
    setEditingJobId(job.job_id || job._id);
    setShowModal(true);
  };

  // ── Delete a job via backend ───────────────────────────────────────────────
  const removeJob = async (job_id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/jobs/${job_id}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
      });
      if (res.ok) {
        setJobs(prev => prev.filter(j => j.job_id !== job_id));
        if (selectedJobDetails?.job_id === job_id) setSelectedJobDetails(null);
      } else {
        console.error('Failed to delete job:', await res.text());
      }
    } catch (err) {
      console.error('Error deleting job:', err);
    }
  };

  const handleApplyJob = (job) => {
    setSelectedJobDetails(job);
  };

  return (
    <div className="w-full max-w-7xl text-slate-800">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-6 sm:p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 text-white shadow-[0_8px_20px_rgba(79,70,229,0.3)] border border-white/20 ring-4 ring-indigo-50 shrink-0">
              <Briefcase size={30} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-indigo-900 tracking-tight">
                Jobs Management
              </h1>
              <p className="text-slate-500 mt-0.5 text-sm font-semibold">
                {jobs.length} active posting{jobs.length !== 1 ? 's' : ''} · Create and manage job openings
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200/80">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid View"
                className={`p-2.5 rounded-lg transition-all border-none cursor-pointer ${viewMode === 'grid'
                  ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100'
                  : 'bg-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List View"
                className={`p-2.5 rounded-lg transition-all border-none cursor-pointer ${viewMode === 'list'
                  ? 'bg-white text-indigo-600 shadow-sm shadow-indigo-100'
                  : 'bg-transparent text-slate-400 hover:text-slate-600'
                  }`}
              >
                <LayoutList size={18} />
              </button>
            </div>

            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              className="group flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm cursor-pointer border-none shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <Plus size={18} className="group-hover:rotate-90 transition-transform duration-200" />
              Create Job
            </button>
          </div>
        </div>
      </div>

      {/* ── Loading / Empty State ───────────────────────── */}
      {jobsLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white/80 backdrop-blur-xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center justify-center py-24">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-6 shadow-inner">
            <Briefcase size={44} className="text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No job postings yet</h3>
          <p className="text-slate-400 text-sm max-w-sm text-center mb-8 leading-relaxed">
            You haven't created any job openings. Click the button below to post your first role.
          </p>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm border-none cursor-pointer shadow-lg shadow-indigo-500/25 transition-all hover:-translate-y-0.5"
          >
            <Plus size={18} /> Post First Job
          </button>
        </div>
      ) : viewMode === 'grid' ? (

        /* ── GRID VIEW ──────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {jobs.map((job, idx) => (
            <div
              key={job.job_id || job._id}
              className="group relative bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/60 transition-all duration-300 overflow-hidden flex flex-col cursor-pointer"
              onClick={() => setSelectedJobDetails(job)}
            >
              {/* Accent gradient bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${GRADIENT_ACCENTS[idx % GRADIENT_ACCENTS.length]}`} />

              <div className="p-6 flex flex-col gap-4 flex-1">
                {/* Top row: title + action icons */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br ${GRADIENT_ACCENTS[idx % GRADIENT_ACCENTS.length]} text-white shrink-0 shadow-md`}>
                      <Briefcase size={20} />
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-slate-800 text-base leading-tight truncate">{job.title}</h3>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">{job.custom_id || job.job_id || 'JOB'}</span>
                      </div>
                      <p className="text-xs text-slate-400 font-medium mt-0.5 flex items-center gap-1">
                        <Building2 size={11} /> {job.location}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); openApplications(job); }}
                      className="p-1.5 bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-lg border-none cursor-pointer transition-colors"
                      title="View Applications"
                    >
                      <Users size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditJob(job); }}
                      className="p-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg border-none cursor-pointer transition-colors"
                      title="Edit Job"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeJob(job.job_id || job._id); }}
                      className="p-1.5 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-lg border-none cursor-pointer transition-colors"
                      title="Delete Job"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Work mode + description */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border ${WORK_MODE_STYLES[job.workMode] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    <Clock size={11} /> {job.workMode}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 flex-1">{job.description}</p>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Target size={9} /> Exp</span>
                    <span className="text-xs font-black text-slate-800 truncate">{job.experience}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Wallet size={9} /> Salary</span>
                    <span className="text-xs font-black text-slate-800 truncate">{job.salary || '—'}</span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><BookOpen size={9} /> Bond</span>
                    <span className="text-xs font-black text-slate-800 truncate">{job.bond || 'None'}</span>
                  </div>
                </div>

                {/* Skills */}
                <div className="flex flex-wrap gap-1.5">
                  {job.skills.split(',').slice(0, 3).map((skill, i) => (
                    <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-[0.68rem] font-bold rounded-lg border border-indigo-100/60">
                      {skill.trim()}
                    </span>
                  ))}
                  {job.skills.split(',').length > 3 && (
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-500 text-[0.68rem] font-bold rounded-lg">
                      +{job.skills.split(',').length - 3}
                    </span>
                  )}
                </div>

                {/* Apply CTA */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleApplyJob(job); }}
                  className="w-full mt-auto flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm border-none cursor-pointer shadow-md shadow-indigo-400/25 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Zap size={15} /> Apply for Job <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (

        /* ── LIST VIEW ──────────────────────────────────── */
        <div className="bg-white/80 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto p-4 sm:p-6 bg-slate-50/30">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Job Title</th>
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Location</th>
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Mode</th>
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Experience</th>
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Salary</th>
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider">Skills</th>
                  <th className="p-4 text-[0.75rem] font-extrabold uppercase text-slate-400 tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.map((job, idx) => (
                  <tr
                    key={job.job_id || job._id}
                    className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                    onClick={() => setSelectedJobDetails(job)}
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-to-br ${GRADIENT_ACCENTS[idx % GRADIENT_ACCENTS.length]} text-white shrink-0 shadow-sm`}>
                          <Briefcase size={17} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black text-slate-800 text-sm">{job.title}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 px-1.5 py-0.5 rounded">{job.custom_id || job.job_id || 'JOB'}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 max-w-[200px]">{job.description}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 font-medium">
                        <MapPin size={13} className="text-indigo-400" /> {job.location}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.7rem] font-bold border ${WORK_MODE_STYLES[job.workMode] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        <Clock size={11} /> {job.workMode}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                        <Target size={13} className="text-amber-400" /> {job.experience}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-sm font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg w-fit">
                        <Wallet size={13} /> {job.salary || '—'}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {job.skills.split(',').slice(0, 2).map((s, i) => (
                          <span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[0.65rem] font-bold rounded-md border border-indigo-100/60">{s.trim()}</span>
                        ))}
                        {job.skills.split(',').length > 2 && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[0.65rem] font-bold rounded-md">+{job.skills.split(',').length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleApplyJob(job); }}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs border-none cursor-pointer shadow-md shadow-indigo-400/20 transition-all hover:-translate-y-0.5"
                        >
                          <Zap size={13} /> Apply
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); openApplications(job); }}
                          className="p-2 bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-xl border-none cursor-pointer transition-colors"
                          title="View Applications"
                        >
                          <Users size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditJob(job); }}
                          className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl border-none cursor-pointer transition-colors"
                          title="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeJob(job.job_id || job._id); }}
                          className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl border-none cursor-pointer transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Create / Edit Job Modal ─────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-white/60 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-28 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none rounded-t-[2rem]" />

            <div className="p-7 border-b border-indigo-100/50 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                  <Briefcase size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">{editingJobId ? 'Edit Job Posting' : 'Create New Job'}</h2>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">{editingJobId ? 'Update the job details below' : 'Fill in the details to post a new opening'}</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-none cursor-pointer transition-colors"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-7 overflow-y-auto relative z-10">
              <form id="createJobForm" onSubmit={handleCreateJob} className="space-y-5">
                <div>
                  <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Job Title</label>
                  <input
                    type="text" name="title" required
                    value={formData.title} onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                    placeholder="e.g. Senior Frontend Developer"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Experience Required</label>
                    <input
                      type="text" name="experience" required
                      value={formData.experience} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                      placeholder="e.g. 3-5 Years"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Work Mode</label>
                    <select
                      name="workMode" value={formData.workMode} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium"
                    >
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="On-site">On-site</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Location</label>
                    <input
                      type="text" name="location" required
                      value={formData.location} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                      placeholder="e.g. San Francisco"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Salary (LPA)</label>
                    <input
                      type="text" name="salary"
                      value={formData.salary} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                      placeholder="e.g. 15 LPA"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Bond / Contract</label>
                    <input
                      type="text" name="bond"
                      value={formData.bond} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                      placeholder="e.g. 1 Year"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Skills (comma separated)</label>
                  <input
                    type="text" name="skills" required
                    value={formData.skills} onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                    placeholder="e.g. React, Node.js, AWS"
                  />
                </div>

                <div>
                  <label className="block text-[0.7rem] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Job Description</label>
                  <textarea
                    name="description" required
                    value={formData.description} onChange={handleInputChange}
                    rows="4"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400 resize-none"
                    placeholder="Describe the role, responsibilities, and requirements..."
                  ></textarea>
                </div>
              </form>
            </div>

            <div className="p-7 border-t border-slate-100 flex justify-end gap-4 relative z-10">
              <button
                onClick={resetForm}
                className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm border-none cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit" form="createJobForm"
                className="flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm border-none cursor-pointer shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <CheckCircle2 size={16} />
                {editingJobId ? 'Save Changes' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Job Applications Modal ───────────────────────── */}
      {applicationData.open && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="bg-white rounded-[2rem] shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-slate-200/80 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-teal-50/60 to-cyan-50/60">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
                  <Users size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 tracking-tight">Job Applications</h2>
                  <p className="text-sm text-slate-500 font-semibold mt-0.5">
                    {applicationData.job?.title}
                    {!applicationData.loading && (
                      <span className="ml-2 px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-bold rounded-full">
                        {applicationData.list.length} applicant{applicationData.list.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openApplications(applicationData.job)}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-teal-50 text-slate-500 hover:text-teal-600 border-none cursor-pointer transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={closeApplications}
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-none cursor-pointer transition-colors"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {applicationData.loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-10 h-10 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
                </div>
              ) : applicationData.list.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center mb-5 shadow-inner">
                    <Users size={36} className="text-teal-400" />
                  </div>
                  <h3 className="text-lg font-black text-slate-700 mb-1">No applications yet</h3>
                  <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                    No one has applied for <span className="font-bold">{applicationData.job?.title}</span> yet.
                    Share the job link to start receiving applications.
                  </p>
                  <button 
                    onClick={() => {
                      const url = `${window.location.origin}/apply/${applicationData.job?.job_id}`;
                      navigator.clipboard.writeText(url);
                      alert('Job link copied to clipboard!');
                    }}
                    title="Click to copy link"
                    className="mt-6 px-4 py-3 bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 rounded-xl flex items-center gap-2.5 text-sm text-slate-600 font-mono transition-all cursor-pointer w-full max-w-md shadow-sm group"
                  >
                    <ExternalLink size={15} className="text-indigo-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                    <span className="truncate flex-1 text-left">{window.location.origin}/apply/{applicationData.job?.job_id}</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50/80">
                      <tr className="border-b border-slate-200">
                        <th className="py-3.5 px-5 text-[0.7rem] font-extrabold uppercase text-slate-400 tracking-wider">Candidate</th>
                        <th className="py-3.5 px-5 text-[0.7rem] font-extrabold uppercase text-slate-400 tracking-wider">Contact</th>
                        <th className="py-3.5 px-5 text-[0.7rem] font-extrabold uppercase text-slate-400 tracking-wider">Resume</th>
                        <th className="py-3.5 px-5 text-[0.7rem] font-extrabold uppercase text-slate-400 tracking-wider">Applied</th>
                        <th className="py-3.5 px-5 text-[0.7rem] font-extrabold uppercase text-slate-400 tracking-wider">Status</th>
                        <th className="py-3.5 px-5 text-[0.7rem] font-extrabold uppercase text-slate-400 tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {applicationData.list.map(app => {
                        const statusStyles = {
                          'Pending Review': 'bg-amber-50 text-amber-700 border-amber-200',
                          'Shortlisted': 'bg-indigo-50 text-indigo-700 border-indigo-200',
                          'Interview Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
                          'Rejected': 'bg-rose-50 text-rose-600 border-rose-200',
                          'Hired': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                        };
                        const st = app.status || 'Pending Review';
                        return (
                          <tr key={app._id} className="hover:bg-slate-50/60 transition-colors group">
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                                  {(app.name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 text-sm">{app.name || '—'}</p>
                                  {app.linkedin_url && (
                                    <a href={app.linkedin_url} target="_blank" rel="noreferrer"
                                      className="text-[0.68rem] text-indigo-500 hover:underline flex items-center gap-0.5">
                                      <ExternalLink size={9} /> LinkedIn
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex flex-col gap-1">
                                <span className="flex items-center gap-1.5 text-xs text-slate-600 font-medium">
                                  <Mail size={11} className="text-indigo-400 shrink-0" />{app.candidate_email || app.email || '—'}
                                </span>
                                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                                  <Phone size={11} className="text-teal-400 shrink-0" />{app.phone || '—'}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              {app.resume_url ? (
                                app.resume_url.startsWith('http') ? (
                                  <a href={app.resume_url} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-bold rounded-lg transition-colors">
                                    <FileText size={12} /> View
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 text-xs font-medium rounded-lg border border-slate-200">
                                    <FileText size={12} /> {app.resume_url}
                                  </span>
                                )
                              ) : (
                                <span className="text-xs text-slate-400">Not provided</span>
                              )}
                            </td>
                            <td className="py-4 px-5">
                              <span className="text-xs text-slate-500 font-medium">
                                {app.applied_at
                                  ? new Date(app.applied_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                  : '—'}
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[0.68rem] font-bold border ${statusStyles[st] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                {st}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-right">
                              <select
                                value={st}
                                onChange={e => handleStatusChange(app, e.target.value)}
                                className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all hover:border-indigo-300"
                              >
                                {['Pending Review', 'Shortlisted', 'Interview Scheduled', 'Rejected', 'Hired'].map(s => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/40">
              <p className="text-xs text-slate-400 font-medium">
                Job ID: <span className="font-mono font-bold text-slate-500">{applicationData.job?.job_id}</span>
              </p>
              <button
                onClick={closeApplications}
                className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm border-none cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Job Details / Apply Modal ───────────────────── */}
      {selectedJobDetails && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-white/60 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-28 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none rounded-t-[2rem]" />

            <div className="p-7 border-b border-indigo-100/50 flex items-start justify-between relative z-10">
              <div className="flex items-center gap-4 overflow-hidden pr-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shrink-0">
                  <Briefcase size={24} />
                </div>
                <div className="overflow-hidden">
                  <h2 className="text-xl font-black text-slate-800 tracking-tight truncate">{selectedJobDetails.title}</h2>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={11} /> {selectedJobDetails.location}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${WORK_MODE_STYLES[selectedJobDetails.workMode] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                      <Clock size={10} /> {selectedJobDetails.workMode}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedJobDetails(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 border-none cursor-pointer transition-colors shrink-0"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-7 overflow-y-auto space-y-6 relative z-10">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Experience', value: selectedJobDetails.experience, icon: Target, color: 'amber' },
                  { label: 'Salary', value: selectedJobDetails.salary || 'Not specified', icon: Wallet, color: 'emerald' },
                  { label: 'Bond', value: selectedJobDetails.bond || 'No Bond', icon: BookOpen, color: 'indigo' },
                ].map(({ label, value, icon: Icon, color }) => (
                  <div key={label} className={`bg-${color}-50 rounded-2xl p-4 border border-${color}-100/60`}>
                    <div className={`flex items-center gap-1.5 text-[0.65rem] font-bold text-${color}-500 uppercase tracking-wider mb-1.5`}>
                      <Icon size={11} /> {label}
                    </div>
                    <p className={`font-black text-${color}-800 text-sm`}>{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-3">
                  <FileText size={15} className="text-indigo-500" /> Job Description
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 rounded-xl p-4 border border-slate-100">
                  {selectedJobDetails.description}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-700 mb-3">Required Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedJobDetails.skills.split(',').map((skill, i) => (
                    <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold border border-indigo-100/60">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-7 border-t border-slate-100 flex gap-3 relative z-10">
              <button
                onClick={() => { setSelectedJobDetails(null); handleEditJob(selectedJobDetails); }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm border-none cursor-pointer transition-colors"
              >
                <Pencil size={15} /> Edit
              </button>
              <button
                onClick={() => setSelectedJobDetails(null)}
                className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm border-none cursor-pointer transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setShowApplyModal(true)}
                className="ml-auto flex items-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm border-none cursor-pointer shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <Zap size={16} /> Apply for this Job <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apply Modal ─────────────────────────────────── */}
      {showApplyModal && selectedJobDetails && (
        <JobApplicationModal
          job={selectedJobDetails}
          onClose={() => setShowApplyModal(false)}
        />
      )}
    </div>
  );
}