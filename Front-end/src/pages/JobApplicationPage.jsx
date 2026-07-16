import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Briefcase, MapPin, Clock, CheckCircle2, User, Mail, Phone, Link as LinkIcon, FileText, ArrowRight, Wallet, Target, Building2, BookOpen, X } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    resume_url: '',
    linkedin_url: '',
    cover_letter: ''
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    
    try {
      await axios.post(`${API_BASE_URL}/api/public/jobs/${jobId}/apply`, formData);
      setSubmitted(true);
    } catch (err) {
      console.error("Application error:", err);
      setError(err.response?.data?.detail || 'Failed to submit application. Please try again.');
    } finally {
      setSubmitting(false);
    }
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
              onClick={() => navigate('/')}
              className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all"
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
                Thank you for applying to the <span className="font-bold text-slate-700">{job.title}</span> position. Our team will review your profile and get back to you soon.
              </p>
              <button 
                onClick={() => navigate('/')}
                className="inline-flex items-center gap-2 px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all shadow-xl shadow-slate-200 hover:-translate-y-0.5"
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
                </div>
              </div>
            </div>

            {/* Right Col: Application Form */}
            <div className="lg:col-span-7">
              <div className="bg-white rounded-[2rem] p-8 md:p-10 shadow-2xl shadow-slate-200/50 border border-slate-100">
                <div className="mb-8">
                  <h2 className="text-3xl font-black text-slate-800 tracking-tight">Apply for this position</h2>
                  <p className="text-slate-500 mt-2 font-medium">Please fill out the form below to submit your application.</p>
                </div>

                {error && (
                  <div className="mb-8 p-4 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-semibold text-sm flex items-start gap-3">
                    <X className="shrink-0 mt-0.5" size={16} /> {error}
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

                  {/* Phone */}
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

                  {/* Links */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Resume / CV Link</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <LinkIcon size={16} className="text-slate-400" />
                        </div>
                        <input
                          type="url" name="resume_url"
                          value={formData.resume_url} onChange={handleInputChange}
                          className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400"
                          placeholder="https://drive.google.com/..."
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

                  {/* Cover Letter */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Cover Letter (Optional)</label>
                    <textarea
                      name="cover_letter" rows="5"
                      value={formData.cover_letter} onChange={handleInputChange}
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50/50 focus:outline-none focus:bg-white focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-slate-800 font-medium placeholder:text-slate-400 resize-none"
                      placeholder="Tell us why you are a great fit for this role..."
                    />
                  </div>

                  {/* Submit */}
                  <div className="pt-4">
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
