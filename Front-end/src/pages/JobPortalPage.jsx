import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { 
  Briefcase, MapPin, Clock, Search, Building2, AlertCircle, ChevronRight,
  Monitor, Coins
} from 'lucide-react';

import { API_BASE_URL } from "../apiConfig";

const WORK_MODE_STYLES = {
  Remote: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Hybrid: 'bg-blue-50 text-blue-700 border-blue-200',
  'On-site': 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function JobPortalPage() {
  const { companyId } = useParams();
  const [jobs, setJobs] = useState([]);
  const [companyName, setCompanyName] = useState('Unknown Company');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/api/public/jobs/company/${companyId}`);
        if (res.data && res.data.status === 'success') {
          setJobs(res.data.jobs || []);
          if (res.data.company_name) {
            setCompanyName(res.data.company_name);
          }
        } else {
          setError('Failed to load jobs.');
        }
      } catch (err) {
        console.error("Error fetching jobs:", err);
        setError('Failed to load jobs. The link might be invalid or the company might not exist.');
      } finally {
        setLoading(false);
      }
    };
    if (companyId) {
      fetchJobs();
    }
  }, [companyId]);

  const filteredJobs = jobs.filter(job => 
    job.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    job.location?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 font-sans">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
        <p className="text-slate-500 font-medium animate-pulse">Loading open positions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-sans p-6">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 text-center shadow-xl shadow-slate-200/50 border border-slate-100">
          <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} className="text-rose-500" />
          </div>
          <h2 className="text-2xl font-black text-slate-800 mb-3">Oops!</h2>
          <p className="text-slate-500 mb-8">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-indigo-100 selection:text-indigo-900 pb-20">
      
      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden bg-white border-b border-slate-200 pt-24 pb-16">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-indigo-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-emerald-50 rounded-full blur-3xl opacity-60 pointer-events-none"></div>
        
        <div className="relative max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-sm font-bold mb-6">
            <Building2 size={16} /> 
            <span>{companyName !== 'Unknown Company' ? companyName : 'Join Our Team'}</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-6">
            Discover Your Next <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">Career Move</span>
          </h1>
          <p className="text-lg text-slate-500 mb-10 max-w-2xl mx-auto">
            Browse open positions at <span className="font-semibold text-slate-700">{companyName !== 'Unknown Company' ? companyName : 'our company'}</span> and find the perfect role to showcase your skills.
          </p>

          {/* Search Bar */}
          <div className="max-w-xl mx-auto relative group">
            <div className="absolute inset-0 bg-indigo-500/10 rounded-2xl blur-xl group-focus-within:bg-indigo-500/20 transition-all duration-300"></div>
            <div className="relative flex items-center bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden focus-within:border-indigo-500 transition-colors">
              <div className="pl-5 text-slate-400">
                <Search size={20} />
              </div>
              <input 
                type="text" 
                placeholder="Search by job title or location..." 
                className="w-full py-4 px-4 outline-none text-slate-700 font-medium placeholder-slate-400 bg-transparent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── JOB LISTINGS ── */}
      <section className="max-w-5xl mx-auto px-6 mt-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold text-slate-800">
            Open Positions <span className="text-slate-400 font-medium text-lg ml-2">({filteredJobs.length})</span>
          </h2>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/60 shadow-sm">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Briefcase size={32} className="text-slate-300" />
            </div>
            <h3 className="text-xl font-bold text-slate-700 mb-2">No jobs found</h3>
            <p className="text-slate-500">
              {searchQuery ? "Try adjusting your search criteria." : "There are currently no open positions available."}
            </p>
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="mt-6 px-6 py-2 bg-indigo-50 text-indigo-600 font-bold rounded-xl hover:bg-indigo-100 transition-colors"
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-6">
            {filteredJobs.map((job) => {
              const modeStyle = WORK_MODE_STYLES[job.workMode] || 'bg-slate-50 text-slate-600 border-slate-200';
              let parsedSkills = [];
              if (typeof job.skills === 'string') {
                parsedSkills = job.skills.split(',').map(s => s.trim()).filter(Boolean);
              } else if (Array.isArray(job.skills)) {
                parsedSkills = job.skills;
              }

              return (
                <div key={job.job_id || job._id} className="group bg-white rounded-3xl border border-slate-200 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 overflow-hidden flex flex-col md:flex-row">
                  {/* Left content */}
                  <div className="flex-1 p-6 md:p-8">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors mb-2">
                          {job.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-500">
                          {job.location && (
                            <span className="flex items-center gap-1.5">
                              <MapPin size={16} className="text-slate-400" /> {job.location}
                            </span>
                          )}
                          {job.salary && (
                            <span className="flex items-center gap-1.5">
                              <Coins size={16} className="text-slate-400" /> {job.salary}
                            </span>
                          )}
                          {job.experience && (
                            <span className="flex items-center gap-1.5">
                              <Briefcase size={16} className="text-slate-400" /> {job.experience} yrs
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-xs font-bold rounded-full border whitespace-nowrap ${modeStyle}`}>
                        {job.workMode || 'Remote'}
                      </span>
                    </div>

                    <div className="mt-6 flex flex-wrap gap-2">
                      {parsedSkills.slice(0, 5).map((skill, idx) => (
                        <span key={idx} className="px-3 py-1 bg-slate-50 text-slate-600 border border-slate-100 rounded-lg text-xs font-semibold">
                          {skill}
                        </span>
                      ))}
                      {parsedSkills.length > 5 && (
                        <span className="px-3 py-1 bg-slate-50 text-slate-500 border border-slate-100 rounded-lg text-xs font-semibold">
                          +{parsedSkills.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right CTA */}
                  <div className="bg-slate-50/50 md:w-64 border-t md:border-t-0 md:border-l border-slate-100 p-6 flex flex-col justify-center shrink-0">
                    <Link 
                      to={`/apply/${job.job_id || job._id}`}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md shadow-indigo-200 group-hover:scale-[1.02]"
                    >
                      Apply Now <ChevronRight size={18} />
                    </Link>
                    <p className="text-xs text-center text-slate-400 mt-4 font-medium">
                      Takes 3 minutes to apply
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
