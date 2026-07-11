import React, { useState, useEffect } from 'react';
import { Briefcase, Plus, MapPin, Clock, FileText, X, DollarSign, Target, Trash2, Pencil, Wallet, Users } from 'lucide-react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { useSelector, useDispatch } from 'react-redux';
import { loadSuperAdminDashboard } from '../../store/slices/dashboardSlice';
import { getComputedStatus } from '../../utils/adminFormatters';

export default function SuperAdminJobsPage() {
  const dispatch = useDispatch();
  const candidates = useSelector((state) => state.candidates?.candidates || []);

  useEffect(() => {
    if (candidates.length === 0) {
      dispatch(loadSuperAdminDashboard());
    }
  }, [dispatch, candidates.length]);

  const [selectedJobForCandidates, setSelectedJobForCandidates] = useState(null);
  const [selectedJobDetails, setSelectedJobDetails] = useState(null);

  const [jobs, setJobs] = useState(() => {
    const savedJobs = localStorage.getItem('superadmin_jobs_data');
    if (savedJobs) {
      try {
        return JSON.parse(savedJobs);
      } catch (e) {
        console.error("Failed to parse jobs from localStorage");
      }
    }
    return [
      {
        id: 1,
        title: 'Senior Frontend Developer',
        experience: '5+ Years',
        skills: 'React, Tailwind, Redux',
        description: 'We are looking for an experienced frontend developer to lead our UI architecture.',
        workMode: 'Remote',
        bond: '1 Year',
        location: 'San Francisco, CA',
        salary: '25 LPA'
      },
      {
        id: 2,
        title: 'Backend Engineer',
        experience: '3-5 Years',
        skills: 'Python, FastAPI, MongoDB',
        description: 'Join our core backend team to build scalable microservices and APIs.',
        workMode: 'Hybrid',
        bond: 'No Bond',
        location: 'New York, NY',
        salary: '20 LPA'
      }
    ];
  });

  useEffect(() => {
    localStorage.setItem('superadmin_jobs_data', JSON.stringify(jobs));
  }, [jobs]);

  const [showModal, setShowModal] = useState(false);
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

  const handleCreateJob = (e) => {
    e.preventDefault();
    if (editingJobId) {
      setJobs(jobs.map(job => job.id === editingJobId ? { ...formData, id: editingJobId } : job));
    } else {
      setJobs(prev => [{ ...formData, id: Date.now() }, ...prev]);
    }
    resetForm();
  };

  const handleEditJob = (job) => {
    setFormData(job);
    setEditingJobId(job.id);
    setShowModal(true);
  };

  const removeJob = (id) => {
    setJobs(jobs.filter(job => job.id !== id));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            <Briefcase className="text-indigo-600" size={32} />
            Jobs Management
          </h1>
          <p className="text-slate-500 mt-2 text-sm">
            Create and manage job postings for your organization.
          </p>
        </div>
        <Button 
          onClick={() => { resetForm(); setShowModal(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-200"
        >
          <Plus size={18} />
          Create Job
        </Button>
      </div>

      {jobs.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 bg-white/50 border-dashed border-2 border-slate-300">
          <Briefcase size={48} className="text-slate-300 mb-4" />
          <h3 className="text-lg font-semibold text-slate-700">No jobs posted yet</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm text-center">
            You haven't created any job postings yet. Click the "Create Job" button to add your first opening.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <Card 
              key={job.id} 
              className="p-6 flex flex-col hover:shadow-xl hover:shadow-indigo-100/50 transition-all border-slate-100 hover:border-indigo-100 relative group cursor-pointer"
              onClick={() => setSelectedJobDetails(job)}
            >
              <div className="absolute top-4 right-4 flex items-center gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); setSelectedJobForCandidates(job); }}
                  className="p-1.5 text-slate-400 hover:bg-teal-50 hover:text-teal-600 rounded-md transition-colors"
                  title="View Candidates"
                >
                  <Users size={16} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); handleEditJob(job); }}
                  className="p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600 rounded-md transition-colors"
                  title="Edit Job"
                >
                  <Pencil size={16} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); removeJob(job.id); }}
                  className="p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-md transition-colors"
                  title="Delete Job"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              
              <h3 className="text-xl font-bold text-slate-800 mb-1 pr-16">{job.title}</h3>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-medium text-slate-500 mb-4">
                <span className="flex items-center gap-1"><MapPin size={14} className="text-indigo-400"/> {job.location}</span>
                <span className="flex items-center gap-1"><Clock size={14} className="text-teal-400"/> {job.workMode}</span>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-2 flex-1 flex flex-col justify-center">
                <div className="grid grid-cols-3 gap-2 text-xs text-slate-700">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-slate-500"><Target size={12}/> Exp</div>
                    <span className="font-semibold text-slate-900 truncate">{job.experience}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-slate-500"><Wallet size={12}/> Salary</div>
                    <span className="font-semibold text-slate-900 truncate">{job.salary || 'Not specified'}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-slate-500"><DollarSign size={12}/> Bond</div>
                    <span className="font-semibold text-slate-900 truncate">{job.bond || 'No Bond'}</span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Job Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Briefcase className="text-indigo-600" size={24} />
                {editingJobId ? 'Edit Job' : 'Create New Job'}
              </h2>
              <button 
                onClick={resetForm}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              <form id="createJobForm" onSubmit={handleCreateJob} className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Job Title</label>
                  <input 
                    type="text" 
                    name="title" 
                    required
                    value={formData.title} 
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
                    placeholder="e.g. Senior Frontend Developer"
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Experience Required</label>
                    <input 
                      type="text" 
                      name="experience" 
                      required
                      value={formData.experience} 
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
                      placeholder="e.g. 3-5 Years"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Work Mode</label>
                    <select 
                      name="workMode" 
                      value={formData.workMode} 
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 bg-white"
                    >
                      <option value="Remote">Remote</option>
                      <option value="Hybrid">Hybrid</option>
                      <option value="On-site">On-site</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Location</label>
                    <input 
                      type="text" 
                      name="location" 
                      required
                      value={formData.location} 
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
                      placeholder="e.g. San Francisco, CA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Salary (LPA)</label>
                    <input 
                      type="text" 
                      name="salary" 
                      value={formData.salary} 
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
                      placeholder="e.g. 15 LPA"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Bond / Contract</label>
                    <input 
                      type="text" 
                      name="bond" 
                      value={formData.bond} 
                      onChange={handleInputChange}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
                      placeholder="e.g. 1 Year or 'None'"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Skills (comma separated)</label>
                  <input 
                    type="text" 
                    name="skills" 
                    required
                    value={formData.skills} 
                    onChange={handleInputChange}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400"
                    placeholder="e.g. React, Node.js, AWS"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Job Description</label>
                  <textarea 
                    name="description" 
                    required
                    value={formData.description} 
                    onChange={handleInputChange}
                    rows="4"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-700 placeholder:text-slate-400 resize-none"
                    placeholder="Describe the role, responsibilities, and requirements..."
                  ></textarea>
                </div>
              </form>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <Button 
                onClick={resetForm}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                form="createJobForm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {editingJobId ? 'Save Changes' : 'Create Job'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* View Candidates Modal */}
      {selectedJobForCandidates && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-teal-600" size={24} />
                Candidates for {selectedJobForCandidates.title}
              </h2>
              <button 
                onClick={() => setSelectedJobForCandidates(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto">
              {(() => {
                const jobCandidates = candidates.filter(c => 
                  c.interview_title && c.interview_title.toLowerCase() === selectedJobForCandidates.title.toLowerCase()
                );
                
                if (jobCandidates.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                      <Users size={48} className="text-slate-300 mb-4" />
                      <p>No candidates have been scheduled or completed interviews for this job yet.</p>
                    </div>
                  );
                }

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">Candidate Name</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">Status</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">Score</th>
                          <th className="py-3 px-4 font-semibold text-sm text-slate-600">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobCandidates.map(c => (
                          <tr key={c.id || c.link_id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-4 text-sm font-medium text-slate-800">{c.candidate_name || 'N/A'}</td>
                            <td className="py-3 px-4 text-sm">
                              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                getComputedStatus(c) === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                                getComputedStatus(c) === 'Pending' ? 'bg-amber-100 text-amber-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {getComputedStatus(c) || c.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-sm font-semibold text-slate-700">
                              {c.score ? `${Number(c.score).toFixed(1)}/100` : '--'}
                            </td>
                            <td className="py-3 px-4 text-sm text-slate-500">
                              {c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <Button 
                onClick={() => setSelectedJobForCandidates(null)}
                variant="secondary"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {selectedJobDetails && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2 pr-4">
                <Briefcase className="text-indigo-600" size={24} />
                {selectedJobDetails.title}
              </h2>
              <button 
                onClick={() => setSelectedJobDetails(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors flex-shrink-0"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-600">
                <span className="flex items-center gap-1.5"><MapPin size={16} className="text-indigo-400"/> {selectedJobDetails.location}</span>
                <span className="flex items-center gap-1.5"><Clock size={16} className="text-teal-400"/> {selectedJobDetails.workMode}</span>
              </div>

              <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-700">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-slate-500 font-medium"><Target size={14}/> Experience</div>
                    <span className="font-bold text-slate-900">{selectedJobDetails.experience}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-slate-500 font-medium"><Wallet size={14}/> Salary</div>
                    <span className="font-bold text-slate-900">{selectedJobDetails.salary || 'Not specified'}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5 text-slate-500 font-medium"><DollarSign size={14}/> Bond / Contract</div>
                    <span className="font-bold text-slate-900">{selectedJobDetails.bond || 'No Bond'}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3">
                  <FileText size={16} className="text-indigo-500"/>
                  Job Description
                </h4>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                  {selectedJobDetails.description}
                </p>
              </div>
              
              <div>
                <h4 className="text-sm font-bold text-slate-800 mb-3">Required Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedJobDetails.skills.split(',').map((skill, i) => (
                    <span key={i} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-medium border border-indigo-100/50">
                      {skill.trim()}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <Button 
                onClick={() => {
                  setSelectedJobDetails(null);
                  handleEditJob(selectedJobDetails);
                }}
                className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border-none shadow-none"
              >
                <Pencil size={16} className="mr-2 inline" /> Edit Job
              </Button>
              <Button 
                onClick={() => setSelectedJobDetails(null)}
                variant="secondary"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
