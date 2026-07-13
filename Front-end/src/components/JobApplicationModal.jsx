import React, { useState } from 'react';
import { User, Mail, Phone, Link as LinkIcon, FileText, CheckCircle2, X } from 'lucide-react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export default function JobApplicationModal({ job, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    linkedin_url: ''
  });
  const [resumeFile, setResumeFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  if (!job) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setResumeFile(file);
      
      // Trigger Parsing
      setIsParsing(true);
      setError('');
      try {
        const payload = new FormData();
        payload.append('resume', file);
        const res = await axios.post(`${API_BASE_URL}/api/public/jobs/parse-resume`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data?.status === 'success' && res.data?.data) {
          setFormData(prev => ({
            ...prev,
            name: res.data.data.name || prev.name,
            email: res.data.data.email || prev.email,
            phone: res.data.data.phone || prev.phone,
            linkedin_url: res.data.data.linkedin_url || prev.linkedin_url
          }));
        }
      } catch (err) {
        console.error("Error parsing resume:", err);
        // We do not block the user if parsing fails, just log it.
      } finally {
        setIsParsing(false);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!resumeFile) {
      setError('Please upload your resume.');
      return;
    }
    
    setSubmitting(true);
    setError('');

    try {
      // In a real scenario, job.job_id is from the backend. 
      // If the job only has an id from local storage, we pass that.
      const jobIdToUse = job.job_id || job.id; 
      
      const payload = new FormData();
      payload.append('name', formData.name);
      payload.append('email', formData.email);
      payload.append('phone', formData.phone);
      payload.append('linkedin_url', formData.linkedin_url);
      payload.append('resume', resumeFile);

      await axios.post(`${API_BASE_URL}/api/public/jobs/${jobIdToUse}/apply`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSubmitted(true);
    } catch (err) {
      console.error("Application error:", err);
      setError(err.response?.data?.detail || 'Failed to submit application. Ensure this job exists in the backend.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div 
        className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-800">Apply for {job.title}</h2>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Fill out the form below to submit your application.</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {submitted ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 mb-2">Application Submitted!</h3>
              <p className="text-slate-500 max-w-sm mb-8">
                Thank you for applying to the <span className="font-bold">{job.title}</span> position. We will review your profile shortly.
              </p>
              <button
                onClick={onClose}
                className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all"
              >
                Close Window
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-semibold flex items-start gap-2 border border-rose-100">
                  <X size={16} className="mt-0.5 shrink-0" /> {error}
                </div>
              )}

              {isParsing && (
                <div className="p-4 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-sm font-semibold flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin shrink-0"></div>
                  Extracting details from your resume...
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Full Name *</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="text" name="name" required
                      value={formData.name} onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Email *</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="email" name="email" required
                      value={formData.email} onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Phone Number *</label>
                <div className="relative">
                  <Phone size={15} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="tel" name="phone" required
                    value={formData.phone} onChange={handleInputChange}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">Resume Upload *</label>
                  <div className="relative">
                    <input
                      type="file" name="resume" required
                      accept=".pdf,.doc,.docx"
                      onChange={handleFileChange}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 ml-1">LinkedIn URL</label>
                  <div className="relative">
                    <LinkIcon size={15} className="absolute left-3.5 top-3 text-slate-400" />
                    <input
                      type="url" name="linkedin_url"
                      value={formData.linkedin_url} onChange={handleInputChange}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
                      placeholder="linkedin.com/in/..."
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || isParsing}
                  className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-0.5 disabled:opacity-70 flex items-center gap-2 cursor-pointer"
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
