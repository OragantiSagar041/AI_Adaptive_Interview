import React, { useState } from 'react';
import {
  Sparkles, Briefcase, MapPin, Clock, FileText, X, Target, Trash2, Pencil,
  Wallet, Users, ArrowRight, Zap, Building2, BookOpen, CheckCircle2,
  RefreshCw, Copy, Eye, EyeOff, ExternalLink, Wand2, Check, AlertCircle, Edit3,
  ChevronDown, ChevronUp, CheckCircle, ShieldCheck, GraduationCap, Code2, Award
} from 'lucide-react';
import axios from 'axios';
import Swal from 'sweetalert2';

const WORK_MODE_STYLES = {
  Remote: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  Hybrid: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  'On-site': 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
};

const SAMPLE_PROMPTS = [
  "I have this job requirement of software developer having 4-5 yrs exp and salary i offer 8 lpa and bond 2yr and skills roles and responsibilities and post a job",
  "Hiring Senior AWS Cloud Engineer with 5+ years experience, salary 18-22 LPA, Remote, skills in AWS, Terraform, Kubernetes, CI/CD",
  "Looking for Full Stack Developer with 3 years exp, 10-12 LPA salary, 1 year bond, skills React, Node.js, TypeScript, PostgreSQL",
  "Requirement for Python AI/ML Engineer with 2-4 years experience, salary 14 LPA, Hybrid Hyderabad, skills Python, PyTorch, LangChain, FastAPI"
];

export default function AiJobPostModal({
  isOpen,
  onClose,
  onJobPosted,
  API_BASE_URL,
  authHeaders,
  adminUser
}) {
  const [prompt, setPrompt] = useState(
    "I have this job requirement of software developer having 4-5 yrs exp and salary i offer 8 lpa and bond 2yr and skills roles and responsibilities and post a job"
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [generatedJob, setGeneratedJob] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [previewDetailsOpen, setPreviewDetailsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleGenerate = async (overridePrompt) => {
    const textToUse = overridePrompt || prompt;
    if (!textToUse || !textToUse.trim()) {
      setErrorMsg('Please enter a job description prompt first.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg('');

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/jobs/generate-ai`,
        { prompt: textToUse.trim() },
        { headers: { ...authHeaders, 'Content-Type': 'application/json' } }
      );

      if (response.data && response.data.job) {
        setGeneratedJob(response.data.job);
        setIsEditing(false);
        setPreviewDetailsOpen(false);
      } else {
        throw new Error(response.data?.detail || 'Failed to generate job');
      }
    } catch (err) {
      console.error('AI Job Generation error:', err);
      setErrorMsg(err.response?.data?.detail || err.message || 'Error communicating with AI service. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePostJob = async () => {
    if (!generatedJob) return;

    setIsPosting(true);
    try {
      const payload = {
        title: generatedJob.title || 'Software Developer',
        experience: generatedJob.experience || '4 – 5 Years',
        skills: generatedJob.skills || 'Java, Spring Boot, Microservices, SQL',
        description: generatedJob.description || generatedJob.summary || '',
        workMode: generatedJob.workMode || 'Remote',
        bond: generatedJob.bond || 'None',
        location: generatedJob.location || 'Remote',
        salary: generatedJob.salary || 'Competitive',
        certifications: generatedJob.certifications || []
      };

      const res = await axios.post(`${API_BASE_URL}/api/jobs`, payload, {
        headers: { ...authHeaders, 'Content-Type': 'application/json' }
      });

      if (res.status === 200 || res.status === 201) {
        Swal.fire({
          title: 'Job Posted Successfully!',
          text: `"${payload.title}" is now live on your Jobs board.`,
          icon: 'success',
          confirmButtonColor: '#4f46e5',
          timer: 2500,
          timerProgressBar: true
        });

        if (onJobPosted) {
          await onJobPosted();
        }
        handleClose();
      } else {
        throw new Error('Failed to post job');
      }
    } catch (err) {
      console.error('Error posting job:', err);
      Swal.fire({
        title: 'Posting Failed',
        text: err.response?.data?.detail || err.message || 'Could not post the job opening.',
        icon: 'error',
        confirmButtonColor: '#ef4444'
      });
    } finally {
      setIsPosting(false);
    }
  };

  const handleClose = () => {
    setGeneratedJob(null);
    setIsEditing(false);
    setPreviewDetailsOpen(false);
    setErrorMsg('');
    onClose();
  };

  const handleFieldChange = (field, val) => {
    setGeneratedJob(prev => ({
      ...prev,
      [field]: val
    }));
  };

  const parseSkillsList = (skills) => {
    if (!skills) return [];
    if (Array.isArray(skills)) return skills.map(s => String(s).trim()).filter(Boolean);
    if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
    return [String(skills).trim()].filter(Boolean);
  };

  const parseCertificationsList = (certs) => {
    if (!certs) return [];
    if (Array.isArray(certs)) return certs.map(c => String(c).trim()).filter(Boolean);
    if (typeof certs === 'string') return certs.split(',').map(s => s.trim()).filter(Boolean);
    return [String(certs).trim()].filter(Boolean);
  };

  // Extract clean roles/responsibilities list
  // Extract clean roles and qualifications list with stack-aware fallbacks
  const titleLower = (generatedJob?.title || '').toLowerCase();
  const skillsLower = (generatedJob?.skills || '').toLowerCase();

  const getDefaultRoles = () => {
    if (titleLower.includes('ai') || titleLower.includes('ml') || titleLower.includes('machine learning')) {
      return [
        "Model Development & Architecture: Train, fine-tune, and optimize machine learning and deep learning models using PyTorch and TensorFlow.",
        "Generative AI & LLMs: Design and implement state-of-the-art Generative AI applications, prompt workflows, and NLP pipelines.",
        "Data Preprocessing & Pipelines: Engineer automated data transformation and feature pipelines with Pandas, NumPy, and SQL.",
        "Model Deployment & Microservices: Package and deploy models as scalable REST APIs using FastAPI, Flask, and Docker containers.",
        "Cloud & MLOps: Scale AI workloads and monitor model drift across cloud platforms (AWS / Azure)."
      ];
    }
    if (titleLower.includes('full stack') || titleLower.includes('fullstack')) {
      return [
        "Frontend Engineering: Build responsive, performant user interfaces using React, TypeScript, and modern CSS frameworks.",
        "Backend & API Development: Design, develop, and maintain secure, high-throughput RESTful APIs with Node.js, Express, or Python.",
        "Database Architecture: Model relational and NoSQL schemas, write optimized queries, and manage persistence with PostgreSQL and MongoDB.",
        "DevOps & Containers: Containerize applications with Docker, manage CI/CD pipelines, and deploy on modern cloud platforms.",
        "Testing & Reliability: Write comprehensive unit, integration, and end-to-end test suites across frontend and backend layers."
      ];
    }
    if (titleLower.includes('ui') || titleLower.includes('ux') || titleLower.includes('design')) {
      return [
        "User Experience Design: Conduct user research, define personas, and map intuitive end-to-end customer journey flows.",
        "Wireframing & Prototyping: Build interactive clickable prototypes, wireframes, and high-fidelity mockups in Figma.",
        "Design Systems: Create, maintain, and scale comprehensive design systems and component libraries.",
        "Engineering Collaboration: Partner with frontend developers to ensure design fidelity and pixel-perfect implementation.",
        "Usability Testing: Run usability evaluations and iteratively refine interfaces according to user feedback."
      ];
    }
    if (titleLower.includes('python') || skillsLower.includes('python')) {
      return [
        "Backend Development: Build and maintain high-performance, asynchronous RESTful APIs using Python, FastAPI, and Django.",
        "Database Architecture: Design and optimize relational schemas, indexes, and queries with PostgreSQL and SQLAlchemy.",
        "API & Task Queues: Implement secure API integrations and asynchronous background queues with Redis and Celery.",
        "Linux & Containers: Deploy and manage containerized services using Docker in Linux server environments.",
        "Testing & Reliability: Write comprehensive test suites using PyTest to guarantee code quality and security."
      ];
    }
    if (titleLower.includes('react') || titleLower.includes('frontend') || skillsLower.includes('react')) {
      return [
        "UI Engineering: Craft responsive, accessible, high-performance web interfaces with React, TypeScript, and Tailwind CSS.",
        "State Management: Structure predictable state and caching using Redux Toolkit and modern data-fetching hooks.",
        "API Integration: Connect frontend components with backend RESTful endpoints and real-time WebSocket feeds.",
        "Testing & Optimization: Write component tests with Vitest/Jest and optimize core web vitals and bundle sizes."
      ];
    }
    if (titleLower.includes('aws') || titleLower.includes('devops') || titleLower.includes('cloud')) {
      return [
        "Cloud Infrastructure: Architect and manage resilient AWS cloud infrastructure using Terraform and CloudFormation.",
        "Container Orchestration: Deploy, scale, and manage microservices using Docker and Kubernetes clusters.",
        "CI/CD Automation: Build and maintain automated build and deployment pipelines with GitHub Actions / GitLab CI.",
        "Observability & Security: Monitor infrastructure health using Prometheus, Grafana, and enforce IAM least privilege."
      ];
    }
    if (titleLower.includes('java')) {
      return [
        "Backend Development: Design, build, and maintain enterprise backend services using Java, Spring Boot, and Microservices.",
        "Database Architecture: Write and optimize complex SQL queries and ORM mappings with Hibernate / Spring Data JPA.",
        "API Integrations: Build secure, performant RESTful APIs across distributed enterprise architectures.",
        "Testing & Quality: Write unit and integration tests using JUnit and Mockito to ensure enterprise reliability."
      ];
    }
    return [
      "Software Development: Design, develop, and maintain clean, scalable, and reusable software components.",
      "Database Design: Manage relational and NoSQL databases, writing performant queries and schema definitions.",
      "API Engineering: Build secure, high-throughput REST APIs and integrate external third-party services.",
      "Testing & Quality: Write automated unit and integration tests to ensure code stability and maintainability."
    ];
  };

  const certificationsList = parseCertificationsList(generatedJob?.certifications);

  const rolesList = Array.isArray(generatedJob?.roles_and_responsibilities) && generatedJob.roles_and_responsibilities.length > 0
    ? generatedJob.roles_and_responsibilities
    : getDefaultRoles();

  const qualificationsList = Array.isArray(generatedJob?.qualifications) && generatedJob.qualifications.length > 0
    ? generatedJob.qualifications
    : [
        "Education: B.E. / B.Tech / M.C.A. / M.Tech in Computer Science, IT, or related field.",
        `Experience: Minimum ${generatedJob?.experience || '4 – 5 Years'} of verifiable professional software engineering experience.`,
        "Problem Solving: Strong analytical, algorithmic, and debugging skills.",
        "Communication: Clear oral and written technical communication skills."
      ];

  return (
    <div className="fixed inset-0 z-[120] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top subtle decorative gradient banner */}
        <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />

        {/* ── Modal Header ── */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 text-white shadow-md shadow-indigo-500/25">
              <Sparkles size={22} className="animate-pulse text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                  AI Job Description
                </h2>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-xs">
                  Intelligent Agent
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                Describe your requirements in natural language. AI will draft, structure, and preview the posting.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Modal Body (Scrollable) ── */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50 dark:bg-slate-900/50">

          {/* Step 1: Prompt Input Box */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700 shadow-xs">
            <label className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
              <span className="flex items-center gap-1.5">
                <Wand2 size={14} className="text-indigo-500" /> Recruiter Prompt / Job Requirements
              </span>
              {generatedJob && (
                <span className="text-emerald-600 dark:text-emerald-400 font-bold normal-case text-xs flex items-center gap-1">
                  <CheckCircle2 size={13} /> Job Generated
                </span>
              )}
            </label>
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. I have this job requirement of software developer having 4-5 yrs exp and salary i offer 8 lpa and bond 2yr and skills roles and responsibilities..."
                className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/60 p-3.5 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              />
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="absolute right-3 bottom-3 flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-indigo-500/25 transition-all cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" /> Generating...
                  </>
                ) : (
                  <>
                    <Sparkles size={13} className="text-amber-300" /> Generate with AI
                  </>
                )}
              </button>
            </div>

            {/* Quick Sample Chips */}
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-slate-400">Quick ideas:</span>
              {SAMPLE_PROMPTS.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPrompt(sample);
                    handleGenerate(sample);
                  }}
                  className="text-[11px] font-semibold bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-slate-700/60 dark:hover:bg-indigo-950/60 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 transition-colors truncate max-w-[280px]"
                  title={sample}
                >
                  {sample.slice(0, 38)}...
                </button>
              ))}
            </div>

            {errorMsg && (
              <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* Step 2: Generated Preview (Matches AWS Engineer Card Reference + Interactive Details) */}
          {generatedJob && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                    Live Job Post Preview (As will appear in Job Board)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <Edit3 size={13} /> {isEditing ? 'Hide Field Editor' : 'Edit Extracted Details'}
                </button>
              </div>

              {/* Exact Card UI Reference (AWS Engineer Card Layout) */}
              <div className="max-w-xl mx-auto group relative bg-white dark:bg-slate-800/90 rounded-2xl border-2 border-indigo-200 dark:border-indigo-500/40 shadow-xl overflow-hidden flex flex-col transition-all">
                {/* Accent gradient bar */}
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600" />

                <div className="p-5 sm:p-6 flex flex-col gap-4">
                  {/* Top row: title + action icons */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0">
                      <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-indigo-600 text-white shrink-0 shadow-md">
                        <Briefcase size={20} />
                      </div>
                      <div className="overflow-hidden flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-black text-slate-800 dark:text-slate-100 text-base leading-tight truncate">
                            {generatedJob.title || 'Software Developer'}
                          </h3>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-100 dark:bg-slate-800/50 px-1.5 py-0.5 rounded shrink-0">
                            JOB-AI
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-400 font-medium truncate">
                          <span className="flex items-center gap-1 shrink-0">
                            <Building2 size={11} /> {generatedJob.location || 'Hyderabad / Remote'}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-semibold truncate">
                            <Building2 size={11} className="text-indigo-500 shrink-0" /> {adminUser?.company_name || 'Arah Infotech'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Top Action Icons */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-1 opacity-70">
                      <div className="p-2 bg-slate-50 dark:bg-slate-900/50 text-slate-400 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs" title="Preview Only">
                        <Copy size={14} />
                      </div>
                      <div className="p-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-500/40 shadow-xs" title="Preview Only">
                        <Pencil size={14} />
                      </div>
                      <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-400 rounded-xl border border-rose-200 dark:border-rose-500/40 shadow-xs" title="Preview Only">
                        <Trash2 size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Work mode + relative time */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[0.68rem] font-bold border ${WORK_MODE_STYLES[generatedJob.workMode] || WORK_MODE_STYLES['Remote']}`}>
                      <Clock size={11} /> {generatedJob.workMode || 'Remote'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[0.72rem] font-bold text-slate-400 dark:text-slate-400">
                      <Clock size={11} className="text-indigo-500" /> Posted Just now
                    </span>
                  </div>

                  {/* Standard summary view OR Detailed View right inside live preview card */}
                  {!previewDetailsOpen ? (
                    <>
                      {/* Description snippet */}
                      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {generatedJob.summary || generatedJob.description?.split('\n\n')[1] || generatedJob.description || 'No description provided.'}
                      </p>

                      {/* Stats row (Exp, Salary, Bond) */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100 dark:border-slate-800">
                          <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Target size={9} /> Exp
                          </span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {generatedJob.experience || '4 – 5 Years'}
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100 dark:border-slate-800">
                          <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Wallet size={9} /> Salary
                          </span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {generatedJob.salary || '8 LPA'}
                          </span>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 flex flex-col gap-0.5 border border-slate-100 dark:border-slate-800">
                          <span className="text-[0.62rem] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <BookOpen size={9} /> Bond
                          </span>
                          <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate">
                            {generatedJob.bond || '2-Year Bond'}
                          </span>
                        </div>
                      </div>

                      {/* Certifications Badge if required */}
                      {certificationsList.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 text-xs font-bold">
                          <Award size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                          <span className="truncate">
                            {certificationsList.length} Mandatory Certification{certificationsList.length > 1 ? 's' : ''} Required
                          </span>
                        </div>
                      )}

                      {/* Skills Pills - Displays ALL skills mentioned in prompt */}
                      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                        {parseSkillsList(generatedJob.skills).map((skill, i) => (
                          <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 text-[0.68rem] font-bold rounded-lg border border-indigo-100/60 dark:border-indigo-800">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </>
                  ) : (
                    /* ── PROPER DETAILS VIEW INSIDE LIVE PREVIEW ── */
                    <div className="bg-slate-50/80 dark:bg-slate-900/60 rounded-xl p-4 border border-indigo-100 dark:border-slate-700 space-y-3.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
                        <div className="flex items-center gap-1.5 text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                          <FileText size={13} /> Job Specifications & Requirements
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                          Live Preview Only
                        </span>
                      </div>

                      {/* Role Summary (replaces duplicate Exp/Salary/Bond matrix) */}
                      {generatedJob.summary && (
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200/60 dark:border-slate-700">
                          <div className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Sparkles size={11} /> Role Summary
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                            {generatedJob.summary}
                          </p>
                        </div>
                      )}

                      {/* Key Responsibilities */}
                      <div>
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Target size={11} className="text-indigo-500" /> Key Responsibilities
                        </div>
                        <ul className="space-y-1 pl-1">
                          {rolesList.slice(0, 4).map((role, idx) => {
                            const [category, ...rest] = role.split(':');
                            const detail = rest.join(':');
                            return (
                              <li key={idx} className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug flex items-start gap-1.5">
                                <span className="text-indigo-500 font-bold">•</span>
                                <span>
                                  <strong className="text-slate-800 dark:text-slate-100 font-bold">{category}:</strong>
                                  {detail}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>

                      {/* Mandatory Certification Requirement if specified */}
                      {certificationsList.length > 0 && (
                        <div className="bg-amber-500/10 dark:bg-amber-500/15 p-3 rounded-xl border border-amber-200 dark:border-amber-800/60">
                          <div className="text-[10px] font-black text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                            <Award size={12} className="text-amber-600 dark:text-amber-400" /> Mandatory Certification Requirement
                          </div>
                          {generatedJob?.certification_intro && (
                            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-medium mb-1.5">
                              {generatedJob.certification_intro}
                            </p>
                          )}
                          <ul className="space-y-1 pl-1">
                            {certificationsList.map((cert, idx) => (
                              <li key={idx} className="text-[10px] text-slate-700 dark:text-slate-200 leading-snug flex items-start gap-1.5">
                                <span className="text-amber-500 font-bold">•</span>
                                <span>{cert}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Required Technical Skills */}
                      <div>
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <Code2 size={11} className="text-indigo-500" /> Required Technical Skills
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {parseSkillsList(generatedJob.skills).map((skill, idx) => (
                            <span key={idx} className="px-2 py-0.5 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded-md border border-indigo-100 dark:border-indigo-900">
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Qualifications */}
                      <div>
                        <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                          <GraduationCap size={11} className="text-indigo-500" /> Qualifications
                        </div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug space-y-0.5">
                          {qualificationsList.slice(0, 2).map((q, idx) => (
                            <p key={idx} className="truncate">• {q}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Card Action Buttons (View Applications + Details Toggle + Apply) */}
                  <div className="mt-auto pt-2 flex flex-col gap-2">
                    <div className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 text-white font-bold text-sm shadow-md shadow-teal-500/20 opacity-90 cursor-default">
                      <Users size={16} /> View Applications <ArrowRight size={14} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPreviewDetailsOpen(!previewDetailsOpen)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs border transition-all cursor-pointer ${
                          previewDetailsOpen
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-800/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
                        }`}
                        title={previewDetailsOpen ? "Collapse Details" : "Show Required Details in Live Preview"}
                      >
                        {previewDetailsOpen ? (
                          <>
                            <EyeOff size={13} /> Hide Details <ChevronUp size={13} />
                          </>
                        ) : (
                          <>
                            <Eye size={13} /> Details <ChevronDown size={13} />
                          </>
                        )}
                      </button>
                      <div className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-50 text-indigo-700 font-semibold text-xs border border-indigo-100 opacity-90 cursor-default">
                        <Zap size={13} /> Apply <ExternalLink size={11} className="opacity-70" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Optional Field Editor Accordion */}
              {isEditing && (
                <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in duration-150">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Edit Extracted Values
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Job Title</label>
                      <input
                        type="text"
                        value={generatedJob.title}
                        onChange={(e) => handleFieldChange('title', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Experience</label>
                      <input
                        type="text"
                        value={generatedJob.experience}
                        onChange={(e) => handleFieldChange('experience', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Salary</label>
                      <input
                        type="text"
                        value={generatedJob.salary}
                        onChange={(e) => handleFieldChange('salary', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Bond</label>
                      <input
                        type="text"
                        value={generatedJob.bond}
                        onChange={(e) => handleFieldChange('bond', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Work Mode</label>
                      <select
                        value={generatedJob.workMode}
                        onChange={(e) => handleFieldChange('workMode', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      >
                        <option value="Remote">Remote</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="On-site">On-site</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Location</label>
                      <input
                        type="text"
                        value={generatedJob.location}
                        onChange={(e) => handleFieldChange('location', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Skills (comma-separated)</label>
                      <input
                        type="text"
                        value={generatedJob.skills}
                        onChange={(e) => handleFieldChange('skills', e.target.value)}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Certifications (Optional / If Required)</label>
                      <input
                        type="text"
                        placeholder="e.g. AWS Certified SysOps, CKA, Terraform Associate"
                        value={Array.isArray(generatedJob.certifications) ? generatedJob.certifications.join(', ') : (generatedJob.certifications || '')}
                        onChange={(e) => handleFieldChange('certifications', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                        className="w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-[11px] font-bold text-slate-500 block mb-1">Full Description</label>
                      <textarea
                        rows={5}
                        value={generatedJob.description}
                        onChange={(e) => handleFieldChange('description', e.target.value)}
                        className="w-full text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 p-2 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Modal Footer: 3 Actions (OK Post It / Cancel / Regenerate) ── */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0 flex-wrap">
          <div>
            <button
              type="button"
              onClick={handleClose}
              disabled={isPosting}
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs cursor-pointer transition-colors border-none"
            >
              Cancel
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            {generatedJob && (
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating || isPosting}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-bold text-xs cursor-pointer border border-indigo-200 dark:border-slate-700 transition-all hover:scale-[1.02] active:scale-95"
              >
                <RefreshCw size={14} className={isGenerating ? "animate-spin" : ""} />
                Regenerate
              </button>
            )}

            {generatedJob ? (
              <button
                type="button"
                onClick={handlePostJob}
                disabled={isPosting}
                className="flex items-center gap-2 px-7 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-extrabold text-xs shadow-lg shadow-indigo-500/25 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
              >
                {isPosting ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Posting Job...
                  </>
                ) : (
                  <>
                    <Check size={15} strokeWidth={3} />
                    OK, Post It
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleGenerate()}
                disabled={isGenerating || !prompt.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-500/25 cursor-pointer transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    Generating Job...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} className="text-amber-300" />
                    Generate Job
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
