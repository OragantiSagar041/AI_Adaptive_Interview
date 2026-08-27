import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Plus, MapPin, Clock, FileText, X, Target, Trash2, Pencil,
  Wallet, Users, LayoutGrid, LayoutList, ArrowRight, ChevronRight, Zap,
  Building2, BookOpen, CheckCircle2, Mail, Phone, ExternalLink, RefreshCw,
  ChevronDown, Copy, Calendar, Eye, Download, FileCheck, Check, Sparkles,
  User, UserCheck, History, ShieldCheck, Share2
} from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import JobApplicationModal from '../../components/JobApplicationModal';
import { useSelector, useDispatch } from 'react-redux';
import { loadSuperAdminDashboard } from '../../store/slices/dashboardSlice';
import { getComputedStatus, formatPhoneNumber } from '../../utils/adminFormatters';
import axios from 'axios';
import { API_BASE_URL } from '../../apiConfig';
import Swal from 'sweetalert2';
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

export default function SuperAdminJobsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  // Read the JWT token from Redux state — exactly how every other page does it.
  // Login stores it in Redux (auth.token) + sessionStorage('adminToken').
  // sessionStorage is never written, so reading from there always returns null.
  const token = useSelector((state) => state.auth.token);
  const adminUser = useSelector((state) => state.auth.adminUser);
  const candidates = useSelector((state) => state.candidates?.candidates || []);

  // Builds the Authorization header — memoized so identity is stable across renders
  // and does NOT cause useCallback/useEffect to re-fire on every render.
  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  useEffect(() => {
    if (candidates.length === 0) {
      dispatch(loadSuperAdminDashboard());
    }
  }, [dispatch, candidates.length]);

  const [selectedJobForCandidates, setSelectedJobForCandidates] = useState(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);
  const [selectedResumeApp, setSelectedResumeApp] = useState(null);
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
        const data = await res.json().catch(() => ({}));
        const lastActionName = data.last_action_by_name || 'Admin';
        const lastActionRole = data.last_action_by_role || '';
        const lastActionAt = data.last_action_at || new Date().toISOString();

        const updatedAppMapper = (a) => {
          if (a._id !== app._id) return a;
          const newHistoryItem = {
            status: newStatus,
            action: `Status changed to ${newStatus}`,
            action_by_name: lastActionName,
            action_by_role: lastActionRole,
            timestamp: lastActionAt,
          };
          return {
            ...a,
            status: newStatus,
            last_action_by_name: lastActionName,
            last_action_by_role: lastActionRole,
            last_action_at: lastActionAt,
            action_history: [...(a.action_history || []), newHistoryItem],
          };
        };

        setApplicationData(prev => ({
          ...prev,
          list: prev.list.map(updatedAppMapper),
        }));

        setSelectedResumeApp(prev =>
          prev && prev._id === app._id ? updatedAppMapper(prev) : prev
        );

        Swal.fire({
          title: 'Status Updated',
          text: `Candidate marked as "${newStatus}" by ${lastActionName}`,
          icon: 'success',
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2200,
        });
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleScheduleInterview = async (app) => {
    if (app.status !== 'Interview Scheduled') {
      try {
        await handleStatusChange(app, 'Interview Scheduled');
      } catch (e) {
        console.error("Failed to update status before scheduling:", e);
      }
    }
    const isSuperAdmin = window.location.pathname.startsWith('/superadmin');
    const targetRoute = isSuperAdmin ? '/superadmin/create-interview' : '/admin/create-interview';
    navigate(targetRoute, {
      state: {
        fromJobApplication: true,
        candidateData: {
          name: app.name || '',
          email: app.candidate_email || app.email || '',
          phone: app.phone || '',
          resumeText: app.resume_text || '',
          resumeUrl: app.resume_url || '',
          resumeFilename: app.resume_filename || '',
          coverLetter: app.cover_letter || '',
          coverLetterUrl: app.cover_letter_url || '',
          jobDescription: applicationData.job?.description || '',
          jobTitle: applicationData.job?.title || '',
          jobSkills: applicationData.job?.skills || '',
          jobId: applicationData.job?.job_id || '',
          applicationId: app._id
        }
      }
    });
  };

  const [jobs, setJobs] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const limit = 20;

  // ── Shared fetch helper — used on mount, after create, and after delete ────
  const fetchJobs = useCallback(async (page = currentPage) => {
    setJobsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/jobs?page=${page}&limit=${limit}`, {
        headers: { ...authHeaders }
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
        if (data.pagination) {
          setTotalPages(data.pagination.total_pages || 1);
          setTotalJobs(data.pagination.total_jobs ?? 0);
        }
      } else {
        console.error('Failed to fetch jobs:', res.status);
      }
    } catch (err) {
      console.error('Error fetching jobs:', err);
    } finally {
      setJobsLoading(false);
    }
    // authHeaders is stable (memoized), currentPage is not needed here because
    // the caller always passes the page explicitly — keep deps minimal.
  }, [authHeaders]);

  // ── Fetch jobs from backend on mount / page change ────────────────────────
  // Only re-run when currentPage changes; fetchJobs is stable unless the token changes.
  useEffect(() => {
    fetchJobs(currentPage);
  }, [currentPage, fetchJobs]);

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

  const [jdParsing, setJdParsing] = useState(false);
  const handleParseJobFile = async (e) => {
    if (jdParsing) return;
    const file = e.target.files[0];
    if (!file) return;

    setJdParsing(true);
    const formDataObj = new FormData();
    formDataObj.append('file', file);
    formDataObj.append('source', 'jd');

    try {
      // Use the existing parse-resume endpoint since we reverted the other one
      const response = await axios.post(`${API_BASE_URL}/admin/parse-resume`, formDataObj, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': authHeaders.Authorization
        }
      });

      const { text, title, experience, skills, location, salary, bond, workMode, warning } = response.data;

      if (warning) {
        alert(warning);
      }

      setFormData(prev => ({
        ...prev,
        title: title || prev.title,
        experience: experience || prev.experience,
        skills: skills || prev.skills,
        location: location || prev.location,
        salary: salary || prev.salary,
        bond: bond || prev.bond,
        workMode: workMode || prev.workMode,
        description: text || prev.description
      }));
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.detail || err.message || "Error parsing job file");
    } finally {
      setJdParsing(false);
      e.target.value = null; // reset input
    }
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
          await fetchJobs(currentPage);
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
          // Refetch page 1 so total count and ordering are accurate
          setCurrentPage(1);
          await fetchJobs(1);
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
        if (selectedJobDetails?.job_id === job_id || selectedJobDetails?._id === job_id) {
          setSelectedJobDetails(null);
        }
        // Refetch: if this was the last job on the page, go back one page
        const newPage = jobs.length === 1 && currentPage > 1 ? currentPage - 1 : currentPage;
        setCurrentPage(newPage);
        await fetchJobs(newPage);
      } else {
        console.error('Failed to delete job:', await res.text());
      }
    } catch (err) {
      console.error('Error deleting job:', err);
    }
  };

  const confirmDeleteJob = (job, e) => {
    if (e) e.stopPropagation();
    const jobId = job.job_id || job._id;
    Swal.fire({
      title: 'Delete Job Opening?',
      text: `Are you sure you want to delete "${job.title}"? This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#64748b',
      confirmButtonText: 'Yes, Delete',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'rounded-3xl shadow-2xl',
        confirmButton: 'rounded-xl px-5 py-2.5 font-bold',
        cancelButton: 'rounded-xl px-5 py-2.5 font-bold'
      }
    }).then(async (result) => {
      if (result.isConfirmed) {
        await removeJob(jobId);
        Swal.fire({
          title: 'Deleted!',
          text: 'Job posting has been removed.',
          icon: 'success',
          timer: 1800,
          showConfirmButton: false,
        });
      }
    });
  };

  const handleCopyJobLink = (job, e) => {
    if (e) e.stopPropagation();
    const link = `${window.location.origin}/apply/${job.job_id || job._id}`;
    navigator.clipboard.writeText(link);
    Swal.fire({
      title: 'Link Copied!',
      text: 'Public job application link copied to clipboard.',
      icon: 'success',
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 2000,
    });
  };

  const handleApplyJob = (job) => {
    setSelectedJobDetails(job);
  };

  return (
    <div className="superadmin-jobs-page w-full text-slate-900 dark:text-white">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-card border border-border dark:border-slate-700/80 rounded-3xl shadow-sm p-6 sm:p-8 mb-8 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-32 bg-indigo-500/5 pointer-events-none" />
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-md border border-indigo-500/30 shrink-0" style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}>
              <Briefcase size={30} strokeWidth={2.5} className="text-white" style={{ color: '#ffffff', stroke: '#ffffff' }} />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                Jobs Management
              </h1>
              <p className="text-muted-foreground mt-0.5 text-sm font-semibold">
                {totalJobs} active posting{totalJobs !== 1 ? 's' : ''} · Create and manage job openings
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Toggle */}
            <div className="flex items-center bg-secondary rounded-xl p-1 gap-1 border border-border dark:border-slate-700/80">
              <button
                onClick={() => setViewMode('grid')}
                title="Grid View"
                className={`p-2.5 rounded-lg transition-all border-none cursor-pointer ${viewMode === 'grid'
                  ? 'bg-card text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                title="List View"
                className={`p-2.5 rounded-lg transition-all border-none cursor-pointer ${viewMode === 'list'
                  ? 'bg-card text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'bg-transparent text-muted-foreground hover:text-foreground'
                  }`}
              >
                <LayoutList size={18} />
              </button>
            </div>

            <button
              onClick={() => {
                const companyId = adminUser?.company_id || adminUser?.admin_id;
                if (!companyId) {
                  alert("Company ID not found.");
                  return;
                }
                const url = `${window.location.origin}/careers/${companyId}`;
                navigator.clipboard.writeText(url);
                alert(`Job portal link copied to clipboard:\n${url}`);
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-muted text-foreground font-bold text-sm cursor-pointer border border-border dark:border-slate-700 transition-all active:scale-95"
            >
              <Share2 size={18} />
              Share Job Portal
            </button>

            <button
              onClick={() => { resetForm(); setShowModal(true); }}
              style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
              className="group flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm cursor-pointer border border-indigo-600 shadow-md hover:opacity-90 transition-all"
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
        <div className="bg-white dark:bg-slate-800/60/80 backdrop-blur-xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center justify-center py-24">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center mb-6 shadow-inner">
            <Briefcase size={44} className="text-indigo-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">No job postings yet</h3>
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
              className="group relative bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm hover:shadow-2xl hover:shadow-indigo-100/60 transition-all duration-300 overflow-hidden flex flex-col cursor-pointer"
              onClick={() => setSelectedJobDetails(job)}
            >
              {/* Accent gradient bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${GRADIENT_ACCENTS[idx % GRADIENT_ACCENTS.length]}`} />

              <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
                {/* Top row: title + action icons */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br ${GRADIENT_ACCENTS[idx % GRADIENT_ACCENTS.length]} text-white shrink-0 shadow-md`}>
                      <Briefcase size={20} />
                    </div>
                    <div className="overflow-hidden flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-slate-800 dark:text-slate-100 text-base leading-tight truncate" title={job.title}>{job.title}</h3>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded shrink-0">{job.custom_id || job.job_id || 'JOB'}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-medium truncate">
                        <span className="flex items-center gap-1 shrink-0"><Building2 size={11} /> {job.location}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold truncate" title={`Created by ${job.created_by_name || job.created_by || 'Admin'} (${job.created_by_role || 'Admin'})`}>
                          <User size={11} className="text-indigo-500 shrink-0" /> {job.created_by_name || job.created_by || 'Admin'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top Action Icons - ALWAYS VISIBLE */}
                  <div className="flex items-center gap-1.5 shrink-0 ml-1">
                    <button
                      onClick={(e) => handleCopyJobLink(job, e)}
                      className="p-2 bg-slate-50 dark:bg-slate-900/50 hover:bg-indigo-50 text-slate-500 dark:text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-200 dark:border-slate-700/80 hover:border-indigo-200 cursor-pointer transition-all shadow-xs"
                      title="Copy Public Apply Link"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleEditJob(job); }}
                      className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl border border-indigo-100 cursor-pointer transition-all shadow-xs"
                      title="Edit Job Details"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => confirmDeleteJob(job, e)}
                      className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl border border-rose-100 cursor-pointer transition-all shadow-xs"
                      title="Delete Job Opening"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Work mode + description */}
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border ${WORK_MODE_STYLES[job.workMode] || 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                    <Clock size={11} /> {job.workMode}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 flex-1">{job.description}</p>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Target size={9} /> Exp</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{job.experience}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><Wallet size={9} /> Salary</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{job.salary || '—'}</span>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100 dark:border-slate-800">
                    <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><BookOpen size={9} /> Bond</span>
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">{job.bond || 'None'}</span>
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
                    <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[0.68rem] font-bold rounded-lg">
                      +{job.skills.split(',').length - 3}
                    </span>
                  )}
                </div>

                {/* Card Action Buttons (View Applications + Preview/Apply) */}
                <div className="mt-auto pt-2 flex flex-col gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); openApplications(job); }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold text-sm border-none cursor-pointer shadow-md shadow-teal-500/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <Users size={16} /> View Applications <ArrowRight size={14} />
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedJobDetails(job); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-200 dark:border-slate-700/60 cursor-pointer transition-colors"
                    >
                      <Eye size={13} /> Details
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApplyJob(job); }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs border border-indigo-100 cursor-pointer transition-colors"
                    >
                      <Zap size={13} /> Apply <ExternalLink size={11} className="opacity-70" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (

        /* ── LIST VIEW ──────────────────────────────────── */
        <div className="bg-white dark:bg-slate-800/60/80 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden">
          <div className="overflow-x-auto p-4 sm:p-6 bg-slate-50 dark:bg-slate-900/50/30">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-slate-200 dark:border-slate-700">
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
                            <p className="font-black text-slate-800 dark:text-slate-100 text-sm">{job.title}</p>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded">{job.custom_id || job.job_id || 'JOB'}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-slate-400 line-clamp-1 max-w-[180px]">{job.description}</p>
                            <span className="text-[0.65rem] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1 bg-slate-100 dark:bg-slate-800/50/80 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700/60" title={`Created by ${job.created_by_name || job.created_by || 'Admin'}`}>
                              <User size={10} className="text-indigo-500" /> {job.created_by_name || job.created_by || 'Admin'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400 font-medium">
                        <MapPin size={13} className="text-indigo-400" /> {job.location}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.7rem] font-bold border ${WORK_MODE_STYLES[job.workMode] || 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                        <Clock size={11} /> {job.workMode}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
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
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-[0.65rem] font-bold rounded-md">+{job.skills.split(',').length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); openApplications(job); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white rounded-xl border border-teal-200 font-bold text-xs cursor-pointer transition-all shadow-xs"
                          title="View Applications"
                        >
                          <Users size={14} />
                          <span>Applications</span>
                        </button>
                        <button
                          onClick={(e) => handleCopyJobLink(job, e)}
                          className="p-2 bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-xl border border-slate-200 dark:border-slate-700 cursor-pointer transition-all shadow-xs"
                          title="Copy Public Apply Link"
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditJob(job); }}
                          className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl border border-indigo-100 cursor-pointer transition-all shadow-xs"
                          title="Edit Job"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={(e) => confirmDeleteJob(job, e)}
                          className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-600 hover:text-white rounded-xl border border-rose-100 cursor-pointer transition-all shadow-xs"
                          title="Delete Job"
                        >
                          <Trash2 size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleApplyJob(job); }}
                          className="p-2 bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white rounded-xl border border-purple-100 cursor-pointer transition-all shadow-xs"
                          title="Apply / Preview"
                        >
                          <Zap size={14} />
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

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 bg-white dark:bg-slate-800/60/80 backdrop-blur-2xl border border-white/60 rounded-2xl shadow-[0_4px_20px_rgb(0,0,0,0.02)] p-4">
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Page <span className="text-indigo-600 font-bold">{currentPage}</span> of <span className="text-indigo-600 font-bold">{totalPages}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentPage === 1 ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:text-indigo-600 cursor-pointer shadow-sm'}`}
            >
              Previous
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${currentPage === totalPages ? 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed' : 'bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300 hover:text-indigo-600 cursor-pointer shadow-sm'}`}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Create / Edit Job Modal ─────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div
            className="bg-white dark:bg-slate-800/60/95 backdrop-blur-xl rounded-[2rem] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-white/60 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-28 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none rounded-t-[2rem]" />

            <div className="p-7 border-b border-indigo-100/50 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
                  <Briefcase size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">{editingJobId ? 'Edit Job Posting' : 'Create New Job'}</h2>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">{editingJobId ? 'Update the job details below' : 'Fill in the details to post a new opening'}</p>
                </div>
              </div>
              <button
                onClick={resetForm}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800/50 hover:bg-rose-100 text-slate-500 dark:text-slate-400 hover:text-rose-600 border-none cursor-pointer transition-colors"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-7 overflow-y-auto relative z-10">
              <form id="createJobForm" onSubmit={handleCreateJob} className="space-y-5">
                <div>
                  <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Job Title</label>
                  <input
                    type="text" name="title" required
                    value={formData.title} onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400"
                    placeholder="e.g. Senior Frontend Developer"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Experience Required</label>
                    <input
                      type="text" name="experience" required
                      value={formData.experience} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400"
                      placeholder="e.g. 3-5 Years"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Work Mode</label>
                    <select
                      name="workMode" value={formData.workMode} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium"
                    >
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="On-site">On-site</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Location</label>
                    <input
                      type="text" name="location" required
                      value={formData.location} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400"
                      placeholder="e.g. San Francisco"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Salary (LPA)</label>
                    <input
                      type="text" name="salary"
                      value={formData.salary} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400"
                      placeholder="e.g. 15 LPA"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Bond / Contract</label>
                    <input
                      type="text" name="bond"
                      value={formData.bond} onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400"
                      placeholder="e.g. 1 Year"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Skills (comma separated)</label>
                  <input
                    type="text" name="skills" required
                    value={formData.skills} onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400"
                    placeholder="e.g. React, Node.js, AWS"
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5 ml-1">
                    <label className="block text-[0.7rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Job Description</label>
                    <button
                      type="button"
                      onClick={() => document.getElementById('jdUploadInput').click()}
                      className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-1 cursor-pointer transition-all"
                    >
                      <FileText className="w-3 h-3" /> Upload file
                    </button>
                    <input
                      type="file"
                      id="jdUploadInput"
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={handleParseJobFile}
                    />
                  </div>
                  {jdParsing && <span className="text-xs text-amber-500 font-semibold mt-1 mb-2 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Parsing Job Description...</span>}
                  <textarea
                    name="description" required
                    value={formData.description} onChange={handleInputChange}
                    rows="4"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/50 focus:outline-none focus:bg-white dark:bg-slate-800/60 focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-100 font-medium placeholder:text-slate-400 resize-none"
                    placeholder="Describe the role, responsibilities, and requirements..."
                  ></textarea>
                </div>
              </form>
            </div>

            <div className="p-7 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-4 relative z-10">
              <button
                onClick={resetForm}
                className="px-6 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 text-slate-600 dark:text-slate-400 font-bold text-sm border-none cursor-pointer transition-colors"
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
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6" onClick={closeApplications}>
          <div
            className="bg-card border border-border rounded-[2rem] shadow-2xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col z-10"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-card shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/25">
                  <Users size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black text-foreground tracking-tight">{applicationData.job?.title}</h2>
                    {!applicationData.loading && (
                      <span className="px-2.5 py-0.5 bg-teal-500/20 text-teal-300 text-xs font-bold rounded-full border border-teal-500/30">
                        {applicationData.list.length} applicant{applicationData.list.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground font-medium flex-wrap">
                    <span className="flex items-center gap-1 text-muted-foreground font-semibold">
                      <Building2 size={13} className="text-teal-400" /> {applicationData.job?.location || 'Remote'}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1.5 bg-secondary text-foreground font-bold px-2.5 py-1 rounded-lg border border-border shadow-xs">
                      <User size={12} className="text-indigo-400" />
                      Created by: <span className="text-indigo-400 font-extrabold">{applicationData.job?.created_by_name || applicationData.job?.created_by || 'Admin'}</span>
                      {applicationData.job?.created_by_role && (
                        <span className="text-[0.62rem] text-muted-foreground uppercase font-bold">({applicationData.job?.created_by_role})</span>
                      )}
                    </span>
                    {applicationData.job?.created_at && (
                      <span className="text-muted-foreground font-medium flex items-center gap-1">
                        <Calendar size={12} className="text-muted-foreground" /> Posted {new Date(applicationData.job.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openApplications(applicationData.job)}
                  className="p-2.5 rounded-xl bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground border border-border cursor-pointer transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={closeApplications}
                  className="p-2.5 rounded-xl bg-secondary hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 border border-border cursor-pointer transition-colors"
                >
                  <X size={18} strokeWidth={2.5} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 bg-background">
              {applicationData.loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="w-10 h-10 rounded-full border-4 border-teal-200 border-t-teal-600 animate-spin" />
                </div>
              ) : applicationData.list.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-100 to-cyan-100 flex items-center justify-center mb-5 shadow-inner">
                    <Users size={36} className="text-teal-400" />
                  </div>
                  <h3 className="text-lg font-black text-slate-700 dark:text-slate-200 mb-1">No applications yet</h3>
                  <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
                    No one has applied for <span className="font-bold">{applicationData.job?.title}</span> yet.
                    Share the job link to start receiving applications.
                  </p>
                  <div className="mt-6 flex items-center justify-center gap-2">
                    <a
                      href={`${window.location.origin}/apply/${applicationData.job?.job_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 hover:bg-indigo-50 border border-slate-200 dark:border-slate-700 hover:border-indigo-200 rounded-xl flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-indigo-700 font-mono transition-colors cursor-pointer"
                    >
                      <ExternalLink size={14} className="text-indigo-400" />
                      {window.location.origin}/apply/{applicationData.job?.job_id}
                    </a>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/apply/${applicationData.job?.job_id}`);
                        Swal.fire({ title: 'Copied!', text: 'Job link copied to clipboard.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                      }}
                      className="p-2.5 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 hover:border-indigo-200 text-slate-500 dark:text-slate-400 hover:text-indigo-600 rounded-xl cursor-pointer transition-colors"
                      title="Copy Link"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/50/80">
                      <tr className="border-b border-slate-200 dark:border-slate-700">
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
                          <tr key={app._id} className="hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700/60 transition-colors group">
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center text-indigo-600 font-black text-sm shrink-0">
                                  {(app.name || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{app.name || '—'}</p>
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
                                <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-medium">
                                  <Mail size={11} className="text-indigo-400 shrink-0" />{app.candidate_email || app.email || '—'}
                                </span>
                                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                  <Phone size={11} className="text-teal-400 shrink-0" />{app.phone || '—'}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-5">
                              {app.resume_url || app.resume_text ? (
                                <button
                                  type="button"
                                  onClick={() => setSelectedResumeApp(app)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-100 transition-all cursor-pointer shadow-sm hover:scale-[1.02]"
                                  title="View Candidate Resume"
                                >
                                  <FileText size={13} className="text-indigo-600" /> View Resume
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 font-medium">Not provided</span>
                              )}
                            </td>
                            <td className="py-4 px-5">
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                                {app.applied_at
                                  ? new Date(app.applied_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                  : '—'}
                              </span>
                            </td>
                            <td className="py-4 px-5">
                              <div className="flex flex-col gap-1 items-start">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[0.68rem] font-bold border ${statusStyles[st] || 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                                  {st}
                                </span>
                                {app.last_action_by_name ? (
                                  <div className="flex flex-col text-[0.68rem] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50/80 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700/60 max-w-[170px]" title={`Action taken by ${app.last_action_by_name} (${app.last_action_by_role || 'Admin'})`}>
                                    <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1 truncate">
                                      <UserCheck size={11} className="text-indigo-600 shrink-0" />
                                      <span>by {app.last_action_by_name}</span>
                                      {app.last_action_by_role && (
                                        <span className="text-[0.6rem] text-slate-400 uppercase font-bold">({app.last_action_by_role})</span>
                                      )}
                                    </span>
                                    {app.last_action_at && (
                                      <span className="text-[0.6rem] text-slate-400 font-mono">
                                        {new Date(app.last_action_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[0.62rem] text-slate-400 italic">No action yet</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleScheduleInterview(app)}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-sm hover:shadow-indigo-500/25 transition-all cursor-pointer whitespace-nowrap active:scale-95"
                                  title="Schedule interview for candidate"
                                >
                                  <Calendar size={13} /> Schedule
                                </button>
                                <select
                                  value={st}
                                  onChange={e => {
                                    if (e.target.value === '__SCHEDULE__') {
                                      handleScheduleInterview(app);
                                    } else {
                                      handleStatusChange(app, e.target.value);
                                    }
                                  }}
                                  className="text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all hover:border-indigo-300"
                                >
                                  <option value="__SCHEDULE__">📅 Schedule Interview...</option>
                                  <option disabled>──────────</option>
                                  {['Pending Review', 'Shortlisted', 'Interview Scheduled', 'Rejected', 'Hired'].map(s => (
                                    <option key={s} value={s}>{s}</option>
                                  ))}
                                </select>
                              </div>
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
            <div className="px-8 py-5 border-t border-border flex items-center justify-between bg-card">
              <div className="flex items-center gap-4">
                <p className="text-xs text-muted-foreground font-medium">
                  Job ID: <span className="font-mono font-bold text-foreground">{applicationData.job?.job_id}</span>
                </p>
                <div className="h-4 w-px bg-border"></div>
                <a
                  href={`${window.location.origin}/apply/${applicationData.job?.job_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 font-mono font-medium transition-colors"
                >
                  <ExternalLink size={12} /> {window.location.origin}/apply/{applicationData.job?.job_id}
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/apply/${applicationData.job?.job_id}`);
                    Swal.fire({ title: 'Copied!', text: 'Job link copied to clipboard.', icon: 'success', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                  }}
                  className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors cursor-pointer"
                  title="Copy Link"
                >
                  <Copy size={14} />
                </button>
              </div>
              <button
                onClick={closeApplications}
                className="px-6 py-2.5 rounded-xl bg-secondary hover:bg-muted text-foreground font-bold text-sm border border-border cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Job Details / Apply Modal ───────────────────── */}
      {selectedJobDetails && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6" onClick={() => setSelectedJobDetails(null)}>
          <div
            className="bg-card border border-border rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col relative z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-28 bg-gradient-to-b from-indigo-50/80 to-transparent pointer-events-none rounded-t-[2rem]" />

            <div className="p-7 border-b border-indigo-100/50 flex items-start justify-between relative z-10">
              <div className="flex items-center gap-4 overflow-hidden pr-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shrink-0">
                  <Briefcase size={24} />
                </div>
                <div className="overflow-hidden">
                  <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight truncate">{selectedJobDetails.title}</h2>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><MapPin size={11} /> {selectedJobDetails.location}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[0.65rem] font-bold border ${WORK_MODE_STYLES[selectedJobDetails.workMode] || 'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                      <Clock size={10} /> {selectedJobDetails.workMode}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50/80 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                      <User size={11} className="text-indigo-500" />
                      Created by <strong className="text-slate-700 dark:text-slate-200">{selectedJobDetails.created_by_name || selectedJobDetails.created_by || 'Admin'}</strong>
                      {selectedJobDetails.created_by_role && <span className="text-[0.62rem] text-slate-400 uppercase">({selectedJobDetails.created_by_role})</span>}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedJobDetails(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800/50 hover:bg-rose-100 text-slate-500 dark:text-slate-400 hover:text-rose-600 border-none cursor-pointer transition-colors shrink-0"
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
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
                  <FileText size={15} className="text-indigo-500" /> Job Description
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-800">
                  {selectedJobDetails.description}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3">Required Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedJobDetails.skills.split(',').map((skill, i) => (
                    <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-sm font-bold border border-indigo-100/60">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-7 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 relative z-10">
              <button
                onClick={() => {
                  const job = selectedJobDetails;
                  setSelectedJobDetails(null);
                  openApplications(job);
                }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm border-none cursor-pointer shadow-md shadow-teal-500/25 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <Users size={16} /> View Applications
              </button>
              <button
                onClick={() => handleCopyJobLink(selectedJobDetails)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-indigo-50 text-slate-700 dark:text-slate-200 hover:text-indigo-600 font-bold text-sm border-none cursor-pointer transition-colors"
                title="Copy Public Apply Link"
              >
                <Copy size={15} /> Copy Link
              </button>
              <button
                onClick={() => {
                  const job = selectedJobDetails;
                  setSelectedJobDetails(null);
                  handleEditJob(job);
                }}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-sm border-none cursor-pointer transition-colors"
              >
                <Pencil size={15} /> Edit
              </button>
              <button
                onClick={(e) => {
                  const job = selectedJobDetails;
                  confirmDeleteJob(job, e);
                }}
                className="p-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-sm border-none cursor-pointer transition-colors"
                title="Delete Job"
              >
                <Trash2 size={16} />
              </button>

              <button
                onClick={() => setShowApplyModal(true)}
                className="ml-auto flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm border-none cursor-pointer shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                <Zap size={16} /> Apply for Job <ChevronRight size={15} />
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

      {/* ── Resume & Application Viewer Modal ────────────── */}
      {selectedResumeApp && (
        <ResumeViewerModal
          application={selectedResumeApp}
          job={applicationData.job}
          onClose={() => setSelectedResumeApp(null)}
          onStatusChange={(newStatus) => handleStatusChange(selectedResumeApp, newStatus)}
          onSchedule={() => {
            const app = selectedResumeApp;
            setSelectedResumeApp(null);
            handleScheduleInterview(app);
          }}
          API_BASE_URL={API_BASE_URL}
        />
      )}
    </div>
  );
}

// ─── Component: ResumeViewerModal ──────────────────────────────────────────
function ResumeViewerModal({ application, job, onClose, onSchedule, onStatusChange, API_BASE_URL }) {
  const [activeTab, setActiveTab] = useState(
    application.resume_url || application.resume_text ? 'resume' : 'coverLetter'
  );
  const [copied, setCopied] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [fileAvailable, setFileAvailable] = useState(true);

  const getFullUrl = (rawUrl, type = 'resume') => {
    if (!rawUrl) return '';

    // If it's a Cloudinary raw URL, wrap it in Google Docs Viewer so it renders inline instead of downloading
    if (rawUrl.includes('res.cloudinary.com') && rawUrl.includes('/raw/upload/')) {
      return `https://docs.google.com/viewer?url=${encodeURIComponent(rawUrl)}&embedded=true`;
    }

    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://') || rawUrl.startsWith('blob:')) {
      return rawUrl;
    }
    const cleanPath = rawUrl.replace(/^\/+/, '');
    if (!cleanPath.includes('/')) {
      return `${API_BASE_URL}/api/public/${type === 'resume' ? 'resumes' : 'cover_letters'}/${cleanPath}`;
    }
    return `${API_BASE_URL}/${cleanPath}`;
  };

  const resumeFullUrl = getFullUrl(application.resume_url, 'resume');
  const coverLetterFullUrl = getFullUrl(application.cover_letter_url, 'cover_letter');
  const isPdf = application.resume_url && (
    application.resume_url.toLowerCase().endsWith('.pdf') ||
    application.resume_filename?.toLowerCase().endsWith('.pdf')
  );

  const handleCopy = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusStyles = {
    'Pending Review': 'bg-amber-50 text-amber-700 border-amber-200',
    'Shortlisted': 'bg-indigo-50 text-indigo-700 border-indigo-200',
    'Interview Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
    'Rejected': 'bg-rose-50 text-rose-600 border-rose-200',
    'Hired': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };

  const historyList = application.action_history && application.action_history.length > 0
    ? application.action_history
    : application.last_action_by_name
      ? [{
        status: application.status || 'Updated',
        action: `Status changed to ${application.status || 'Updated'}`,
        action_by_name: application.last_action_by_name,
        action_by_role: application.last_action_by_role || 'Admin',
        timestamp: application.last_action_at,
      }]
      : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white dark:bg-slate-800/60 rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleUp">
        {/* Header */}
        <div className="px-7 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-indigo-500/20">
              {(application.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">{application.name || 'Candidate'}</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[0.7rem] font-bold border ${statusStyles[application.status] || 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                  {application.status || 'Pending Review'}
                </span>
                {application.last_action_by_name && (
                  <span className="inline-flex items-center gap-1 text-[0.68rem] bg-indigo-50/80 text-indigo-800 font-semibold px-2 py-0.5 rounded-md border border-indigo-100">
                    <UserCheck size={11} className="text-indigo-600" />
                    Last Action by <strong className="font-bold">{application.last_action_by_name}</strong>
                    {application.last_action_by_role && <span className="text-[0.6rem] uppercase text-indigo-500">({application.last_action_by_role})</span>}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400 font-medium flex-wrap">
                <span className="flex items-center gap-1"><Mail size={12} className="text-indigo-400" /> {application.candidate_email || application.email || '—'}</span>
                {application.phone && <span className="flex items-center gap-1"><Phone size={12} className="text-teal-400" /> {formatPhoneNumber(application.phone)}</span>}
                {job?.title && <span className="flex items-center gap-1 text-slate-400 font-semibold">• Applied for <span className="text-indigo-600">{job.title}</span></span>}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors cursor-pointer border-none"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher & Actions */}
        <div className="px-7 pt-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50/50 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {(application.resume_url || application.resume_text) && (
              <button
                type="button"
                onClick={() => setActiveTab('resume')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 ${activeTab === 'resume'
                  ? 'border-indigo-600 text-indigo-700 bg-white dark:bg-slate-800/60 shadow-sm'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100'
                  }`}
              >
                <FileText size={14} /> Resume Document
              </button>
            )}
            {application.resume_text && (
              <button
                type="button"
                onClick={() => setActiveTab('parsedText')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 ${activeTab === 'parsedText'
                  ? 'border-indigo-600 text-indigo-700 bg-white dark:bg-slate-800/60 shadow-sm'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100'
                  }`}
              >
                <FileCheck size={14} /> Extracted Text
              </button>
            )}
            {(application.cover_letter || application.cover_letter_url) && (
              <button
                type="button"
                onClick={() => setActiveTab('coverLetter')}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 ${activeTab === 'coverLetter'
                  ? 'border-indigo-600 text-indigo-700 bg-white dark:bg-slate-800/60 shadow-sm'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100'
                  }`}
              >
                <BookOpen size={14} /> Cover Letter
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer border-b-2 ${activeTab === 'history'
                ? 'border-indigo-600 text-indigo-700 bg-white dark:bg-slate-800/60 shadow-sm'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:text-slate-100'
                }`}
            >
              <History size={14} /> Action History
              {historyList.length > 0 && (
                <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded-full text-[0.62rem] font-bold">
                  {historyList.length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 pb-2">
            {activeTab === 'parsedText' && application.resume_text && (
              <button
                type="button"
                onClick={() => handleCopy(application.resume_text)}
                className="flex items-center gap-1 px-3 py-1.5 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy Text'}
              </button>
            )}
            {application.resume_url && (
              <button
                type="button"
                onClick={() => handleDownloadFile(resumeFullUrl, application.resume_filename)}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-all cursor-pointer border-none"
              >
                <Download size={12} /> Download Original
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-slate-900/50/30">
          {activeTab === 'resume' && (
            <div>
              {resumeFullUrl && isPdf ? (
                <div className="w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-inner bg-white dark:bg-slate-800/60">
                  <iframe
                    src={resumeFullUrl}
                    type="application/pdf"
                    className="w-full border-none"
                    style={{ height: '520px' }}
                    onError={() => setIframeError(true)}
                  />
                </div>
              ) : resumeFullUrl ? (
                <div className="p-8 text-center bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                    <FileText size={32} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-800 dark:text-slate-100 text-base">Resume File Attached</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">{application.resume_filename || application.resume_url}</p>
                  </div>
                  <div className="flex justify-center gap-3 pt-2">
                    <a
                      href={resumeFullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-2"
                    >
                      <ExternalLink size={14} /> Open in New Tab
                    </a>
                    <a
                      href={resumeFullUrl}
                      download
                      className="px-5 py-2.5 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-all flex items-center gap-2"
                    >
                      <Download size={14} /> Download Document
                    </a>
                  </div>
                  {
                    application.resume_text && (
                      <div className="mt-6 text-left border-t border-slate-100 dark:border-slate-800 pt-5">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                          <FileCheck size={13} className="text-indigo-500" /> Extracted Resume Content
                        </div>
                        <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 max-h-[250px] overflow-y-auto leading-relaxed">
                          {application.resume_text}
                        </pre>
                      </div>
                    )
                  }
                </div >
              ) : application.resume_text ? (
                <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <FileText size={14} className="text-indigo-500" /> Candidate Resume Content
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-800 max-h-[500px] overflow-y-auto leading-relaxed shadow-inner font-medium">
                    {application.resume_text}
                  </pre>
                </div>
              ) : (
                <div className="text-center py-16 text-slate-400 text-sm">
                  No resume file or text available for this candidate.
                </div>
              )
              }
            </div >
          )
          }

          {
            activeTab === 'parsedText' && (
              <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-500" /> AI Parsed Text
                  </span>
                  <span className="text-[0.7rem] text-slate-400 font-mono font-semibold">
                    {application.resume_text?.length || 0} characters
                  </span>
                </div>
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-800 max-h-[520px] overflow-y-auto leading-relaxed shadow-inner font-medium">
                  {application.resume_text}
                </pre>
              </div>
            )
          }

          {
            activeTab === 'coverLetter' && (
              <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-indigo-500" /> Cover Letter
                </div>
                {application.cover_letter ? (
                  <div className="text-sm text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-900/50 p-5 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed whitespace-pre-wrap">
                    {application.cover_letter}
                  </div>
                ) : coverLetterFullUrl ? (
                  <div className="p-6 text-center space-y-3">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cover letter file attached.</p>
                    <a
                      href={coverLetterFullUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl"
                    >
                      <Download size={14} /> Download Cover Letter
                    </a>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No cover letter provided.
                  </div>
                )}
              </div>
            )
          }

          {
            activeTab === 'history' && (
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-800/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-sm">
                  <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div>
                      <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <History size={16} className="text-indigo-600" />
                        Candidate Audit Trail & Action History
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Log of all actions (shortlisting, scheduling, hiring, rejection) performed on this candidate.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100">
                      {historyList.length} Action{historyList.length !== 1 ? 's' : ''} Logged
                    </span>
                  </div>

                  {historyList.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                      <UserCheck size={32} className="mx-auto text-slate-300 mb-2" />
                      <p className="text-xs font-semibold">No status changes or recruiter actions logged yet.</p>
                      <p className="text-[0.7rem] text-slate-400 mt-1">Actions taken via the buttons below will appear here automatically.</p>
                    </div>
                  ) : (
                    <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                      {historyList.map((item, idx) => (
                        <div key={idx} className="relative flex items-start gap-4">
                          <div className="absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white dark:bg-slate-800/60 border-2 border-indigo-600 flex items-center justify-center shadow-xs">
                            <div className="w-2 h-2 rounded-full bg-indigo-600" />
                          </div>
                          <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700/70">
                            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                              <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold border ${statusStyles[item.status] || 'bg-slate-100 dark:bg-slate-800/50 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'}`}>
                                {item.status || item.action || 'Action Taken'}
                              </span>
                              {item.timestamp && (
                                <span className="text-[0.7rem] font-mono text-slate-400">
                                  {new Date(item.timestamp).toLocaleDateString('en-IN', {
                                    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-400 mt-2 flex items-center gap-2 flex-wrap">
                              <span className="flex items-center gap-1 font-bold text-slate-700 dark:text-slate-200">
                                <UserCheck size={13} className="text-indigo-600" />
                                {item.action_by_name || 'Admin'}
                              </span>
                              {item.action_by_role && (
                                <span className="text-[0.65rem] bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-bold uppercase border border-indigo-100">
                                  {item.action_by_role}
                                </span>
                              )}
                              {item.action_by_email && (
                                <span className="text-[0.7rem] text-slate-400">({item.action_by_email})</span>
                              )}
                            </div>
                            {item.notes && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 italic bg-white dark:bg-slate-800/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                                Note: {item.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          }
        </div >

        {/* Footer with Quick Action Controls */}
        < div className="px-7 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-800/60 flex-wrap gap-3" >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Change Status:</span>
            {['Shortlisted', 'Hired', 'Rejected'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStatusChange && onStatusChange(s)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${application.status === s
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
                  }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer border-none"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onSchedule}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-extrabold shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer border-none"
            >
              <Calendar size={14} /> Schedule Interview for {application.name?.split(' ')[0] || 'Candidate'} <ArrowRight size={14} />
            </button>
          </div>
        </div >
      </div >
    </div >
  );
}

