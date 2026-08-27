import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Briefcase, MapPin, Clock, CheckCircle2, User, Mail, Phone, 
  Link as LinkIcon, FileText, ArrowRight, Wallet, Target, Building2, 
  BookOpen, X, UploadCloud, Paperclip, Trash2, FileCheck, Check, AlertCircle
} from 'lucide-react';

import { API_BASE_URL } from "../apiConfig";

const WORK_MODE_STYLES = {
  Remote: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Hybrid: 'bg-blue-50 text-blue-700 border-blue-200',
  'On-site': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function JobApplicationPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Resume state
  const [resumeMode, setResumeMode] = useState('upload'); // 'upload' | 'link'
  const [resumeFile, setResumeFile] = useState(null);
  const [isDraggingResume, setIsDraggingResume] = useState(false);
  const resumeInputRef = useRef(null);

  // Cover Letter state
  const [coverLetterMode, setCoverLetterMode] = useState('text'); // 'text' | 'upload'
  const [coverLetterFile, setCoverLetterFile] = useState(null);
  const coverLetterInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    resume_url: '',
    linkedin_url: '',
    cover_letter: ''
  });

  // Force Light Theme on Public Job Application Page
  useEffect(() => {
    const originalTheme = document.documentElement.getAttribute('data-theme');
    const hadDarkClass = document.documentElement.classList.contains('dark');

    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');

    return () => {
      if (originalTheme) {
        document.documentElement.setAttribute('data-theme', originalTheme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      if (hadDarkClass) {
        document.documentElement.classList.add('dark');
      }
    };
  }, []);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/public/jobs/${jobId}`);
        if (res.data && res.data.job) {
          setJob(res.data.job);
        } else {
          setError('Job not found.');
        }
      } catch (err) {
        console.error("Error fetching job details:", err);
        setError('Failed to load job details. The job might not exist.');
      } finally {
        setLoading(false);
      }
    };
    fetchJob();
  }, [jobId]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Parsing state
  const [parsingResume, setParsingResume] = useState(false);
  const [parsedSkills, setParsedSkills] = useState([]);
  const [parseSuccessMsg, setParseSuccessMsg] = useState('');

  const handleResumeFileSelect = async (file) => {
    if (!file) return;
    const allowed = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!allowed.includes(ext)) {
      setError('Please upload a valid PDF, DOCX, or DOC file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Resume file size must be less than 10MB.');
      return;
    }
    setError('');
    setResumeFile(file);
    setParseSuccessMsg('');

    try {
      setParsingResume(true);
      const parseData = new FormData();
      parseData.append('resume', file);
      const res = await axios.post(`${API_BASE_URL}/api/public/jobs/parse-resume`, parseData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data && res.data.status === 'success' && res.data.data) {
        const info = res.data.data;

        let cleanName = (info.name || '').replace(/[^A-Za-z\s]/g, '').trim();
        let cleanPhone = (info.phone || '').replace(/\D/g, '');

        setFormData(prev => ({
          ...prev,
          name: cleanName || prev.name,
          email: info.email || prev.email,
          phone: cleanPhone || prev.phone,
          linkedin_url: info.linkedin_url || prev.linkedin_url,
        }));

        if (Array.isArray(info.skills) && info.skills.length > 0) {
          setParsedSkills(info.skills);
        }
        setParseSuccessMsg('Resume parsed successfully! Details populated below.');
      }
    } catch (parseErr) {
      console.warn("Resume auto-parse skipped or failed:", parseErr);
    } finally {
      setParsingResume(false);
    }
  };

  const handleCoverLetterFileSelect = (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Cover letter file size must be less than 10MB.');
      return;
    }
    setError('');
    setCoverLetterFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (resumeMode === 'upload' && !resumeFile && !formData.resume_url) {
      setError('Please upload your resume file or provide a resume link.');
      return;
    }
    if (resumeMode === 'link' && !formData.resume_url) {
      setError('Please provide a valid resume link.');
      return;
    }

    setSubmitting(true);
    setError('');
    
    try {
      const data = new FormData();
      data.append('name', formData.name);
      data.append('email', formData.email);
      data.append('phone', formData.phone || '');
      data.append('linkedin_url', formData.linkedin_url || '');
      data.append('resume_url', formData.resume_url || '');
      data.append('cover_letter', formData.cover_letter || '');

      if (resumeMode === 'upload' && resumeFile) {
        data.append('resume_file', resumeFile);
      }
      if (coverLetterMode === 'upload' && coverLetterFile) {
        data.append('cover_letter_file', coverLetterFile);
      }

      await axios.post(`${API_BASE_URL}/api/public/jobs/${jobId}/apply`, data, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Application error:", err);
      setError(err.response?.data?.detail || 'Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></div>
            <p className="text-slate-500 font-semibold animate-pulse">Loading Job Details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 max-w-md w-full text-center border border-slate-100">
            <div className="w-20 h-20 rounded-full bg-rose-50 flex items-center justify-center mx-auto mb-6">
              <Briefcase className="text-rose-500" size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Job Not Found</h2>
            <p className="text-slate-500 mb-8">{error}</p>
            <button 
              onClick={() => { window.location.href = 'https://www.google.com'; }}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all cursor-pointer"
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-12 md:py-16">
        {submitted ? (
          <div className="max-w-2xl mx-auto bg-white p-10 rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-emerald-50 to-transparent pointer-events-none" />
            
            <div className="relative z-10">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-200">
                <CheckCircle2 size={48} className="text-white" />
              </div>
              <h2 className="text-4xl font-black text-slate-800 mb-4 tracking-tight">Application Submitted!</h2>
              <p className="text-lg text-slate-500 mb-8 leading-relaxed max-w-lg mx-auto">
                Thank you for applying to the <span className="font-bold text-slate-700">{job.title}</span> position. Our recruiting team will review your resume and contact you soon.
              </p>
              <button 
                onClick={() => { window.location.href = 'https://www.google.com'; }}
                className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-xl shadow-slate-200 hover:-translate-y-0.5 cursor-pointer"
              >
                Return to Home <ArrowRight size={18} />
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left Col: Job Details */}
            <div className="lg:col-span-5 flex flex-col gap-6 sticky top-8">
              <div className="bg-white rounded-[2rem] p-8 shadow-xl shadow-slate-200/40 border border-slate-100 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />
                
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-lg shadow-indigo-200 shrink-0">
                    <Briefcase size={28} />
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-tight">{job.title}</h1>
                    <div className="flex items-center gap-3 mt-1.5 text-sm font-semibold text-slate-500">
                      <span className="flex items-center gap-1.5"><Building2 size={14} className="text-indigo-400" /> {job.location}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-8 pb-8 border-b border-slate-100">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${WORK_MODE_STYLES[job.workMode] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                    <Clock size={12} /> {job.workMode}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <Target size={12} /> {job.experience}
                  </span>
                  {job.salary && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Wallet size={12} /> {job.salary}
                    </span>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-3">
                      <FileText size={16} className="text-indigo-500" /> About the Role
                    </h3>
                    <p className="text-slate-600 leading-relaxed text-sm whitespace-pre-wrap">{job.description}</p>
                  </div>

                  {job.bond && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2 mb-2">
                        <BookOpen size={16} className="text-indigo-500" /> Contract Details
                      </h3>
                      <p className="text-slate-600 font-medium text-sm">{job.bond}</p>
                    </div>
                  )}

                  {job.skills && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Required Skills</h3>
                      <div className="flex flex-wrap gap-2">
                        {job.skills?.split(',').map((skill, i) => (
                          <span key={i} className="px-3 py-1.5 bg-slate-50 text-slate-600 text-xs font-bold rounded-lg border border-slate-200">
                            {skill.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Col: Application Form */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-[2rem] p-8 md:p-10 shadow-2xl shadow-slate-200/50 border border-slate-100">
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Apply for this position</h2>
                  <p className="text-slate-500 mt-2 font-medium">Please upload your resume and details to submit your application.</p>
                </div>

                {error && (
                  <div className="mb-8 p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-semibold text-sm flex items-start gap-3">
                    <AlertCircle className="shrink-0 mt-0.5 text-rose-500" size={16} /> {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Name & Email */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Full Name *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <User size={16} className="text-slate-400" />
                        </div>
                        <input
                          type="text" name="name" required
                          value={formData.name} onChange={handleInputChange}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                          placeholder="John Doe"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Email Address *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Mail size={16} className="text-slate-400" />
                        </div>
                        <input
                          type="email" name="email" required
                          value={formData.email} onChange={handleInputChange}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                          placeholder="john@example.com"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Phone & LinkedIn */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Phone Number *</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Phone size={16} className="text-slate-400" />
                        </div>
                        <input
                          type="tel" name="phone" required
                          value={formData.phone} onChange={handleInputChange}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                          placeholder="+1 (555) 000-0000"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">LinkedIn Profile</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <LinkIcon size={16} className="text-slate-400" />
                        </div>
                        <input
                          type="url" name="linkedin_url"
                          value={formData.linkedin_url} onChange={handleInputChange}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                          placeholder="https://linkedin.com/in/..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Resume Section with File Upload & Link Switcher */}
                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText size={15} className="text-indigo-600" /> Resume / CV *
                      </label>
                      <div className="inline-flex p-0.5 bg-slate-200/70 rounded-lg text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setResumeMode('upload')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            resumeMode === 'upload' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Upload File
                        </button>
                        <button
                          type="button"
                          onClick={() => setResumeMode('link')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            resumeMode === 'link' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Paste Link
                        </button>
                      </div>
                    </div>

                    {resumeMode === 'upload' ? (
                      <div>
                        <input
                          ref={resumeInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt"
                          className="hidden"
                          onChange={(e) => handleResumeFileSelect(e.target.files?.[0])}
                        />

                        {resumeFile ? (
                          <div className="flex items-center justify-between p-4 bg-white border-2 border-indigo-100 rounded-xl shadow-sm">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                                <FileCheck size={20} />
                              </div>
                              <div className="truncate">
                                <p className="text-sm font-bold text-slate-800 truncate">{resumeFile.name}</p>
                                <p className="text-xs font-semibold text-slate-400">{formatFileSize(resumeFile.size)} • Ready to upload</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => resumeInputRef.current?.click()}
                                className="px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                onClick={() => setResumeFile(null)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onDragOver={(e) => { e.preventDefault(); setIsDraggingResume(true); }}
                            onDragLeave={() => setIsDraggingResume(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIsDraggingResume(false);
                              handleResumeFileSelect(e.dataTransfer.files?.[0]);
                            }}
                            onClick={() => resumeInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all bg-white ${
                              isDraggingResume
                                ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
                                : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/20'
                            }`}
                          >
                            <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                              <UploadCloud size={24} />
                            </div>
                            <p className="text-sm font-bold text-slate-700 mb-1">
                              Click to upload or drag & drop your resume
                            </p>
                            <p className="text-xs font-medium text-slate-400">
                              Supports PDF, DOCX, DOC (Max 10MB)
                            </p>
                          </div>
                        )}

                        {parsingResume && (
                          <div className="mt-3 p-3 bg-indigo-50/80 border border-indigo-100 rounded-xl flex items-center gap-2.5 text-xs text-indigo-700 font-semibold animate-pulse">
                            <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin shrink-0" />
                            Parsing resume & auto-populating applicant details...
                          </div>
                        )}
                        {!parsingResume && parseSuccessMsg && (
                          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-700 font-bold">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                              <span>{parseSuccessMsg}</span>
                            </div>
                          </div>
                        )}
                        {parsedSkills.length > 0 && (
                          <div className="mt-3 pt-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Extracted Skills:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {parsedSkills.map((skill, idx) => (
                                <span key={idx} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200/60 rounded-md text-xs font-semibold">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <LinkIcon size={16} className="text-slate-400" />
                        </div>
                        <input
                          type="url" name="resume_url"
                          value={formData.resume_url} onChange={handleInputChange}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                          placeholder="https://drive.google.com/file/d/..."
                        />
                      </div>
                    )}
                  </div>

                  {/* Cover Letter Section with Text & Document Upload Switcher */}
                  <div className="bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Paperclip size={15} className="text-indigo-600" /> Cover Letter (Optional)
                      </label>
                      <div className="inline-flex p-0.5 bg-slate-200/70 rounded-lg text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setCoverLetterMode('text')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            coverLetterMode === 'text' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Write Text
                        </button>
                        <button
                          type="button"
                          onClick={() => setCoverLetterMode('upload')}
                          className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                            coverLetterMode === 'upload' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          Upload Doc
                        </button>
                      </div>
                    </div>

                    {coverLetterMode === 'text' ? (
                      <textarea
                        name="cover_letter" rows="4"
                        value={formData.cover_letter} onChange={handleInputChange}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400 resize-none text-sm leading-relaxed"
                        placeholder="Tell us about yourself, your accomplishments, and why you are a great fit for this role..."
                      />
                    ) : (
                      <div>
                        <input
                          ref={coverLetterInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,.txt"
                          className="hidden"
                          onChange={(e) => handleCoverLetterFileSelect(e.target.files?.[0])}
                        />

                        {coverLetterFile ? (
                          <div className="flex items-center justify-between p-4 bg-white border border-indigo-100 rounded-xl shadow-sm">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 border border-indigo-100">
                                <FileCheck size={20} />
                              </div>
                              <div className="truncate">
                                <p className="text-sm font-bold text-slate-800 truncate">{coverLetterFile.name}</p>
                                <p className="text-xs font-semibold text-slate-400">{formatFileSize(coverLetterFile.size)} • Ready to upload</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => coverLetterInputRef.current?.click()}
                                className="px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                onClick={() => setCoverLetterFile(null)}
                                className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div
                            onClick={() => coverLetterInputRef.current?.click()}
                            className="border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/20 rounded-xl p-5 text-center cursor-pointer transition-all bg-white"
                          >
                            <Paperclip size={22} className="mx-auto text-indigo-500 mb-2" />
                            <p className="text-sm font-bold text-slate-700 mb-0.5">Upload Cover Letter Document</p>
                            <p className="text-xs text-slate-400">PDF, DOCX, DOC, or TXT (Max 10MB)</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-70 disabled:cursor-not-allowed text-white font-bold text-lg rounded-xl shadow-xl shadow-indigo-500/25 transition-all hover:-translate-y-0.5 active:translate-y-0 border-none cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...
                        </>
                      ) : (
                        <>Submit Application <CheckCircle2 size={20} /></>
                      )}
                    </button>
                    <p className="text-center text-xs text-slate-400 font-medium mt-4">
                      By submitting this application, you agree to our Terms of Service and Privacy Policy.
                    </p>
                  </div>
                </form>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
