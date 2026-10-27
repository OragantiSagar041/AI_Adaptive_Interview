import React, { useState, useRef } from 'react'
import Swal from 'sweetalert2'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Input from '../../components/Input'
import Textarea from '../../components/Textarea'
import Select from '../../components/Select'
import { CustomToggleSwitch, FeatureLockOverlay } from './CreateInterviewShared'

export default function CreateInterviewSingleTab({
  singleCandidate,
  setSingleCandidate,
  handleSingleChange,
  handleSingleHrChange,
  callLogs = [],
  resumeParsing,
  setResumeParsing,
  jdParsing,
  setJdParsing,
  customQuestionsParsing,
  setCustomQuestionsParsing,
  aiInstructionsParsing,
  setAiInstructionsParsing,
  atsCalculating,
  atsScoreData,
  handleCalculateAts,
  handleCheckCandidate,
  handleViewPreviousInterviews,
  handleParseFile,
  handleGenerateInterviewLink,
  handlePreviewEmail,
  inviting,
  availableVoices = [],
  hasCustomScreening,
  hasCustomAIInstructions,
  hasIndustry,
  singleCreatedLinks = [],
  propNewSingleQuestion,
  setPropNewSingleQuestion,
  propNewSingleInstruction,
  setPropNewSingleInstruction,
  ignoredCandidateEmail = '',
  candidateStatusInfo = null,
  projectParsing = false,
  setProjectParsing,
  singleProjectQuestionsAdded = false,
  setSingleProjectQuestionsAdded,
  newProjectQuestion = '',
  setNewProjectQuestion,
  handleGenerateProjectQuestions,
  addSingleProjectQuestion: propAddSingleProjectQuestion,
  deleteSingleProjectQuestion: propDeleteSingleProjectQuestion,
  parseMultiLineItems,
  addSingleInstruction: propAddSingleInstruction,
  deleteSingleInstruction: propDeleteSingleInstruction,
  addSingleQuestion: propAddSingleQuestion,
  deleteSingleQuestion: propDeleteSingleQuestion,
}) {
  const [localSingleQuestion, setLocalSingleQuestion] = useState('')
  const [localSingleInstruction, setLocalSingleInstruction] = useState('')
  const newSingleQuestion = propNewSingleQuestion !== undefined ? propNewSingleQuestion : localSingleQuestion
  const setNewSingleQuestion = setPropNewSingleQuestion || setLocalSingleQuestion
  const newSingleInstruction = propNewSingleInstruction !== undefined ? propNewSingleInstruction : localSingleInstruction
  const setNewSingleInstruction = setPropNewSingleInstruction || setLocalSingleInstruction

  const [editingSingleQuestionIndex, setEditingSingleQuestionIndex] = useState(null)
  const [editingSingleQuestionText, setEditingSingleQuestionText] = useState('')
  const [editingSingleInstructionIndex, setEditingSingleInstructionIndex] = useState(null)
  const [editingSingleInstructionText, setEditingSingleInstructionText] = useState('')

  const emailDebounceRef = useRef(null)

  const addSingleQuestion = (itemsToAdd = null) => {
    if (propAddSingleQuestion) {
      propAddSingleQuestion(itemsToAdd);
      return;
    }
    const items = Array.isArray(itemsToAdd) ? itemsToAdd : (parseMultiLineItems ? parseMultiLineItems(newSingleQuestion) : (newSingleQuestion.trim() ? [newSingleQuestion.trim()] : []));
    if (!items || items.length === 0) return;
    handleSingleChange('customQuestions', [...(singleCandidate.customQuestions || []), ...items]);
    setNewSingleQuestion('');
  };
  const deleteSingleQuestion = propDeleteSingleQuestion || ((index) => {
    handleSingleChange('customQuestions', (singleCandidate.customQuestions || []).filter((_, i) => i !== index));
  });

  const addSingleInstruction = (itemsToAdd = null) => {
    if (propAddSingleInstruction) {
      propAddSingleInstruction(itemsToAdd);
      return;
    }
    const items = Array.isArray(itemsToAdd) ? itemsToAdd : (parseMultiLineItems ? parseMultiLineItems(newSingleInstruction) : (newSingleInstruction.trim() ? [newSingleInstruction.trim()] : []));
    if (!items || items.length === 0) return;
    handleSingleChange('aiInstructions', [...(singleCandidate.aiInstructions || []), ...items]);
    setNewSingleInstruction('');
  };
  const deleteSingleInstruction = propDeleteSingleInstruction || ((index) => {
    handleSingleChange('aiInstructions', (singleCandidate.aiInstructions || []).filter((_, i) => i !== index));
  });

  const addSingleProjectQuestion = (itemsToAdd = null) => {
    if (propAddSingleProjectQuestion) {
      propAddSingleProjectQuestion(itemsToAdd);
      return;
    }
    const items = Array.isArray(itemsToAdd) ? itemsToAdd : (parseMultiLineItems ? parseMultiLineItems(newProjectQuestion) : (newProjectQuestion.trim() ? [newProjectQuestion.trim()] : []));
    if (!items || items.length === 0) return;
    const current = singleCandidate.projectQuestions || [];
    const newItems = items.filter(it => !current.includes(it));
    if (newItems.length > 0) {
      handleSingleChange('projectQuestions', [...current, ...newItems]);
    }
    if (setNewProjectQuestion) setNewProjectQuestion('');
  };
  const deleteSingleProjectQuestion = propDeleteSingleProjectQuestion || ((index) => {
    const current = singleCandidate.projectQuestions || [];
    const updated = current.filter((_, i) => i !== index);
    handleSingleChange('projectQuestions', updated);
    if (updated.length === 0 && setSingleProjectQuestionsAdded) {
      setSingleProjectQuestionsAdded(false);
    }
  });

  return (
    <>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Candidate & Material Details (Col Span 6) */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Card 1: Candidate Basic Info */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-border pb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-user-tie text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Candidate Information</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Provide basic contact and login credentials</p>
                  </div>
                </div>

                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex flex-col gap-2">
                  <label className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Select Approved Candidate (From AI Calls)</label>
                  <select
                    className="w-full px-4 py-2.5 bg-white dark:bg-slate-800/60 border border-indigo-200 rounded-lg text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer shadow-sm disabled:bg-slate-50 dark:bg-slate-900/50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    disabled={callLogs.length === 0}
                    value={singleCandidate.applicationId || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) {
                        setSingleCandidate(prev => ({
                          ...prev,
                          name: '',
                          email: '',
                          phone: '',
                          resumeText: '',
                          resumeFileName: '',
                          applicationId: '',
                          jobId: '',
                          jobTitle: '',
                          experience: '',
                          location: '',
                          current_ctc: '',
                          expected_ctc: ''
                        }));
                        const resumeInputEl = document.getElementById('singleResumeInput');
                        if (resumeInputEl) resumeInputEl.value = '';
                        return;
                      }
                      const log = callLogs.find(l => (l._id || l.id) === selectedId);
                      if (log) {
                        const hasResume = Boolean((log.resume_text || log.resume_url) && (log.resume_text || log.resume_url).trim().length > 10);
                        setSingleCandidate(prev => ({
                          ...prev,
                          name: log.name || prev.name,
                          email: log.email || prev.email,
                          phone: log.phone || prev.phone,
                          resumeText: log.resume_text || log.resume_url || prev.resumeText,
                          resumeFileName: hasResume ? 'Candidate profile resume loaded' : prev.resumeFileName,
                          applicationId: log._id || log.id || ''
                        }));
                        // Automatically trigger ATS calculation if we have both
                        const resText = log.resume_text || log.resume_url || singleCandidate.resumeText;
                        if (resText && singleCandidate.jobDescription) {
                          handleCalculateAts(resText, singleCandidate.jobDescription);
                        }
                      }
                    }}
                  >
                    {callLogs.length === 0 ? (
                      <option value="">No approved candidates found from AI Calls</option>
                    ) : (
                      <>
                        <option value="">-- Select an Approved Candidate --</option>
                        {callLogs.map(log => (
                          <option key={log._id || log.id} value={log._id || log.id}>
                            {log.name} ({log.email || log.phone}) - {log.job_title || 'Approved Candidate'}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                  <p className="text-[0.65rem] text-indigo-500 font-medium mt-1">
                    {callLogs.length === 0
                      ? "Approve candidates in the AI Calling Agent Approval Queue to see them here."
                      : "Selecting an approved candidate will automatically fill their name, email, phone, resume, and job description!"}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Candidate Name"
                    placeholder="e.g. John Doe"
                    value={singleCandidate.name}
                    onChange={(e) => handleSingleChange('name', e.target.value.replace(/[0-9]/g, ''))}
                  />
                                                                                                                                        
                  <div>
                    <Input
                      label="Candidate Email"
                      type="email"
                      placeholder="e.g. john@example.com"
                      value={singleCandidate.email}
                      onChange={(e) => {
                        const val = e.target.value
                        handleSingleChange('email', val)
                        if (val && /\S+@\S+\.\S+/.test(val.trim())) {
                          if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current)
                          emailDebounceRef.current = setTimeout(() => {
                            handleCheckCandidate(val.trim())
                          }, 600)
                        }
                      }}
                      onBlur={() => handleCheckCandidate(singleCandidate.email, true)}
                    />
                    {singleCandidate.email && singleCandidate.email.includes('@') && (
                      <div className="flex items-center justify-between mt-1.5 px-0.5">
                        <button
                          type="button"
                          onClick={() => handleViewPreviousInterviews && handleViewPreviousInterviews(singleCandidate.email)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1.5 transition-colors cursor-pointer bg-transparent border-0 p-0"
                          title="View historical interview details and AI scores for this candidate"
                        >
                          <i className="fas fa-history text-[11px]"></i>
                          View Previous Interview Details
                        </button>
                        {candidateStatusInfo && singleCandidate.email && candidateStatusInfo.email === singleCandidate.email.trim().toLowerCase() ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded border shadow-xs ${
                            candidateStatusInfo.status === 'selected'
                              ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/60'
                              : candidateStatusInfo.status === 'rejected'
                              ? 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
                              : candidateStatusInfo.status === 'completed'
                              ? 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900/60'
                              : candidateStatusInfo.status === 'ignored'
                              ? 'text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-900/60'
                              : 'text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-900/60'
                          }`}>
                            <i className={`text-[10px] ${
                              candidateStatusInfo.status === 'selected'
                                ? 'fas fa-check-circle text-emerald-600'
                                : candidateStatusInfo.status === 'rejected'
                                ? 'fas fa-times-circle text-rose-600'
                                : candidateStatusInfo.status === 'completed'
                                ? 'fas fa-check-double text-indigo-600'
                                : candidateStatusInfo.status === 'ignored'
                                ? 'fas fa-ban text-rose-600'
                                : 'fas fa-clock text-amber-600'
                            }`}></i>
                            Status: {candidateStatusInfo.label}
                          </span>
                        ) : ignoredCandidateEmail && ignoredCandidateEmail === singleCandidate.email?.trim().toLowerCase() ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-400 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900/60 shadow-xs">
                            <i className="fas fa-ban text-[10px]"></i> Status: Ignored
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Card 2: Resume & Job Requirements */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-border pb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-file-invoice text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Resume & Job Profile</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Input documents for automated AI assessment</p>
                  </div>
                </div>

                {/* Upload Resume */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Upload Resume (PDF / DOCX / TXT)</label>
                    {singleCandidate.resumeText && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <i className="fas fa-check"></i> {singleCandidate.resumeFileName || 'Resume Attached'}
                      </span>
                    )}
                  </div>
                  <div
                    className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center gap-2.5 group relative overflow-hidden ${singleCandidate.resumeText
                      ? 'border-emerald-200 bg-emerald-50/20 hover:bg-emerald-50/40 shadow-sm shadow-emerald-500/5'
                      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50/40 hover:bg-white dark:bg-slate-800/60 hover:border-primary/80 hover:shadow-md hover:shadow-indigo-500/5 hover:-translate-y-0.5'
                      }`}
                    onClick={() => document.getElementById('singleResumeInput').click()}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 ${singleCandidate.resumeText
                      ? 'bg-emerald-100 text-emerald-650 animate-[pulse_2s_infinite]'
                      : 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100 group-hover:scale-110'
                      }`}>
                      <i className={`text-xl ${singleCandidate.resumeText ? 'fas fa-file-circle-check' : 'fas fa-file-arrow-up'}`}></i>
                    </div>
                    <div>
                      <p className="font-bold text-slate-700 dark:text-slate-200 text-sm">
                        {singleCandidate.resumeText ? "Resume Loaded & Ready" : "Click to upload or drag & drop"}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">
                        {singleCandidate.resumeText ? (singleCandidate.resumeFileName || "Candidate profile resume loaded") : "PDF, DOCX, TXT - Max 5MB"}
                      </p>
                    </div>
                  </div>
                  <input
                    type="file"
                    id="singleResumeInput"
                    accept=".pdf,.docx,.doc,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files[0]
                      if (!file) return
                      handleParseFile(file, (err, data) => {
                        if (err) {
                          Swal.fire({
                            title: 'Parsing Failed',
                            text: err,
                            icon: 'error',
                            confirmButtonColor: '#6366f1'
                          })
                          setResumeParsing(false)
                        } else {
                          setSingleCandidate(prev => ({
                            ...prev,
                            name: data.name || prev.name,
                            email: data.email || prev.email,
                            resumeText: data.text || '',
                            resumeFileName: file.name,
                            resumeFileUrl: data.file_url || '',
                            phone: data.phone || prev.phone,
                            experience: data.experience || prev.experience,
                            location: data.location || prev.location,
                            current_ctc: data.current_ctc || prev.current_ctc,
                            expected_ctc: data.expected_ctc || prev.expected_ctc,
                            current_company: data.current_company || prev.current_company,
                            notice_period: data.notice_period || prev.notice_period
                          }))
                          if (data.email) {
                            handleCheckCandidate(data.email, true)
                          }
                        }
                      }, setResumeParsing, 'resume', true)
                    }}
                  />
                  {resumeParsing && <span className="text-xs text-warning font-semibold mt-1"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing resume...</span>}
                  {singleCandidate.resumeText && !resumeParsing && (
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-success font-semibold flex items-center gap-1">
                        <i className="fas fa-check-circle"></i> {singleCandidate.resumeFileName || 'Resume ready for AI questions'}
                      </span>
                      <button
                        type="button"
                        className="bg-transparent border-none text-rose-500 text-xs font-semibold cursor-pointer hover:underline flex items-center gap-1"
                        onClick={() => {
                          handleSingleChange('resumeText', '')
                          handleSingleChange('resumeFileName', '')
                        }}
                      >
                        <i className="fas fa-trash"></i> Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Job Description */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 m-0">Job Description</label>
                    <button
                      type="button"
                      onClick={() => document.getElementById('singleJdInput').click()}
                      className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-3 py-1 cursor-pointer transition-all"
                    >
                      <i className="fas fa-paperclip"></i> Upload file
                    </button>
                    <input
                      type="file"
                      id="singleJdInput"
                      accept=".pdf,.docx,.doc,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files[0]
                        if (!file) return
                        handleParseFile(file, (err, data) => {
                          if (err) {
                            Swal.fire({
                              title: 'Parsing Failed',
                              text: err,
                              icon: 'error',
                              confirmButtonColor: '#6366f1'
                            })
                            setJdParsing(false)
                          } else {
                            if (data.text) {
                              handleSingleChange('jobDescription', data.text)
                            }
                            if (data.file_url) {
                              handleSingleChange('jdFileUrl', data.file_url)
                            }
                          }
                        }, setJdParsing, 'jd', true)
                      }}
                    />
                  </div>
                  {jdParsing && <span className="text-xs text-warning font-semibold mt-1"><i className="fas fa-spinner fa-spin mr-1"></i> Parsing Job Description...</span>}
                  <Textarea
                    placeholder="Paste the job description details here, or use the file upload selector above..."
                    value={singleCandidate.jobDescription}
                    onChange={(e) => handleSingleChange('jobDescription', e.target.value)}
                  />
                </div>

                {/* ATS Match Score */}
                {atsScoreData && (
                  <div className="bg-indigo-50/30 border border-indigo-100/80 rounded-2xl p-5 mt-2 flex flex-col gap-4">
                    {/* Header */}
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        <i className="fas fa-chart-line text-primary"></i> ATS Resume Match Score
                      </h4>
                      <Button
                        onClick={() => handleCalculateAts(singleCandidate.resumeText, singleCandidate.jobDescription)}
                        disabled={atsCalculating}
                        variant="secondary"
                        className="px-3.5 py-1 text-xs h-[30px] rounded-lg bg-white dark:bg-slate-800/60"
                      >
                        {atsCalculating ? "Analyzing..." : <><i className="fas fa-sync-alt mr-1"></i> Recalculate</>}
                      </Button>
                    </div>

                    {/* Score ring + summary */}
                    <div className="flex gap-5 items-center">
                      <div className="flex-shrink-0 text-center">
                        <div className="relative w-20 h-20 flex items-center justify-center">
                          <svg className="w-20 h-20 transform -rotate-90">
                            <defs>
                              <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="100%" stopColor="#4f46e5" />
                              </linearGradient>
                            </defs>
                            <circle cx="40" cy="40" r="34" stroke="#e2e8f0" strokeWidth="6" fill="transparent" />
                            <circle
                              cx="40" cy="40" r="34"
                              stroke={atsScoreData.score >= 75 ? '#10b981' : atsScoreData.score >= 50 ? '#f59e0b' : '#ef4444'}
                              strokeWidth="6" fill="transparent"
                              strokeDasharray={213.6}
                              strokeDashoffset={213.6 - (213.6 * atsScoreData.score) / 100}
                              strokeLinecap="round"
                              className="transition-all duration-1000 ease-out"
                            />
                          </svg>
                          <span className="absolute text-lg font-extrabold text-slate-800 dark:text-slate-100">{atsScoreData.score}%</span>
                        </div>
                        <div className="text-[0.62rem] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider mt-1.5">Overall Match</div>
                      </div>
                      <p className="flex-grow text-xs font-medium text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800/60/60 p-3 rounded-xl border border-slate-100 dark:border-slate-800 leading-relaxed">{atsScoreData.summary}</p>
                    </div>

                    {/* Weighted Category Breakdown */}
                    {atsScoreData.breakdown && atsScoreData.breakdown.length > 0 && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[0.65rem] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                          <i className="fas fa-sliders-h text-primary/70"></i> Score Breakdown by Category
                        </span>
                        <div className="flex flex-col gap-1.5">
                          {atsScoreData.breakdown.map((item, idx) => {
                            const barColor = item.score >= 75 ? 'bg-emerald-500' : item.score >= 50 ? 'bg-amber-400' : 'bg-rose-500'
                            const textColor = item.score >= 75 ? 'text-emerald-600' : item.score >= 50 ? 'text-amber-600' : 'text-rose-600'
                            return (
                              <div key={idx} className="bg-white dark:bg-slate-800/60/70 border border-slate-100 dark:border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center gap-3">
                                <div className="w-[140px] shrink-0">
                                  <div className="text-[0.68rem] font-bold text-slate-700 dark:text-slate-200 leading-tight">{item.category}</div>
                                  <div className="text-[0.6rem] text-slate-400 font-medium mt-0.5">Weight: {item.weight}%</div>
                                </div>
                                <div className="flex-grow">
                                  <div className="h-2 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                                      style={{ width: `${item.score}%` }}
                                    />
                                  </div>
                                  {item.note && <p className="text-[0.6rem] text-slate-400 mt-1 leading-tight truncate">{item.note}</p>}
                                </div>
                                <div className={`text-sm font-extrabold w-10 text-right shrink-0 ${textColor}`}>{item.score}%</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matched / Missing skills chips */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="bg-emerald-500/5 p-3 rounded-xl border border-emerald-500/10">
                        <strong className="text-emerald-600 block mb-1.5 text-[0.7rem] uppercase tracking-wide"><i className="fas fa-check mr-1"></i> Matched Skills</strong>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {atsScoreData.matched_skills.map((skill, idx) => (
                            <span key={idx} className="bg-emerald-50 border border-emerald-100 text-emerald-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold">{skill}</span>
                          ))}
                          {atsScoreData.matched_skills.length === 0 && <span className="text-slate-400 text-xs">None identified</span>}
                        </div>
                      </div>
                      <div className="bg-rose-500/5 p-3 rounded-xl border border-rose-500/10">
                        <strong className="text-rose-600 block mb-1.5 text-[0.7rem] uppercase tracking-wide"><i className="fas fa-triangle-exclamation mr-1"></i> Missing Skills</strong>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {atsScoreData.missing_skills.map((skill, idx) => (
                            <span key={idx} className="bg-rose-50 border border-rose-100 text-rose-700 px-2.5 py-0.5 rounded-full text-[0.65rem] font-bold">{skill}</span>
                          ))}
                          {atsScoreData.missing_skills.length === 0 && <span className="text-slate-400 text-xs">None identified</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {atsCalculating && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-xl text-center text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <i className="fas fa-spinner fa-spin mr-2"></i> Analyzing ATS match score...
                  </div>
                )}
              </Card>

              {/* Card 3: Advanced AI Customizations (Accordions) */}
              <div className="flex flex-col gap-4">
                {/* Custom Questions Section */}
                <FeatureLockOverlay isLocked={!hasCustomScreening} featureName="Custom Screening Questions">
<div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/60/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-question-circle text-primary"></i> Custom Screening Questions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white dark:bg-slate-800/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">Provide pre-defined questions that the AI will ask first</span>
                      <button
                        type="button"
                        onClick={() => document.getElementById('singleCustomInput').click()}
                        className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-2.5 py-1 cursor-pointer transition-all"
                      >
                        <i className="fas fa-paperclip"></i> Upload questions
                      </button>
                      <input
                        type="file"
                        id="singleCustomInput"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0]
                          if (!file) return
                          handleParseFile(file, (err, data) => {
                            if (err) {
                              Swal.fire({
                                title: 'Parsing Failed',
                                text: err,
                                icon: 'error',
                                confirmButtonColor: '#6366f1'
                              })
                              setCustomQuestionsParsing(false)
                            } else {
                              const lines = parseMultiLineItems ? parseMultiLineItems(data.text || '') : (data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
                              handleSingleChange('customQuestions', [...(singleCandidate.customQuestions || []), ...lines])
                            }
                          }, setCustomQuestionsParsing)
                        }}
                      />
                    </div>
                    {customQuestionsParsing && (
                      <span className="text-xs text-warning font-semibold mt-1 block">
                        <i className="fas fa-spinner fa-spin mr-1"></i> Parsing questions file...
                      </span>
                    )}
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        placeholder="Add a custom screening question..."
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-4 py-2.5 text-slate-900 dark:text-white text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white dark:bg-slate-800/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400"
                        value={newSingleQuestion}
                        onChange={(e) => setNewSingleQuestion(e.target.value)}
                        onPaste={(e) => {
                          const pasteData = e.clipboardData.getData('text');
                          if (pasteData && (pasteData.includes('\n') || pasteData.includes('\r'))) {
                            e.preventDefault();
                            const items = parseMultiLineItems ? parseMultiLineItems(pasteData) : pasteData.split('\n').map(l => l.trim()).filter(Boolean);
                            if (items.length > 0) {
                              addSingleQuestion(items);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSingleQuestion();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={addSingleQuestion}
                        className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-[5px] transition-colors cursor-pointer"
                        style={{ backgroundColor: '#6366f1' }}
                      >
                        Add
                      </button>
                    </div>
                    {singleCandidate.customQuestions && singleCandidate.customQuestions.length > 0 && (
                      <ol className="list-decimal pl-5 flex flex-col gap-2 mt-2 max-h-60 overflow-y-auto">
                        {singleCandidate.customQuestions.map((q, idx) => (
                          <li key={idx} className="text-sm text-slate-700 dark:text-slate-200 font-medium">
                            {editingSingleQuestionIndex === idx ? (
                              <div className="flex gap-2 items-center w-full">
                                <input
                                  type="text"
                                  className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-3 py-1.5 text-slate-900 dark:text-white text-sm outline-none focus:border-primary focus:bg-white dark:bg-slate-800/60"
                                  value={editingSingleQuestionText}
                                  onChange={(e) => setEditingSingleQuestionText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      if (editingSingleQuestionText.trim()) {
                                        const updated = [...singleCandidate.customQuestions];
                                        updated[idx] = editingSingleQuestionText.trim();
                                        handleSingleChange('customQuestions', updated);
                                      }
                                      setEditingSingleQuestionIndex(null);
                                    } else if (e.key === 'Escape') {
                                      setEditingSingleQuestionIndex(null);
                                    }
                                  }}
                                  autoFocus
                                  onBlur={() => setEditingSingleQuestionIndex(null)}
                                />
                              </div>
                            ) : (
                              <div className="flex justify-between items-start gap-4 group" onDoubleClick={() => { setEditingSingleQuestionIndex(idx); setEditingSingleQuestionText(singleCandidate.customQuestions[idx]); }}>
                                <span className="break-all">{q}</span>
                                <button
                                  type="button"
                                  onClick={() => deleteSingleQuestion(idx)}
                                  className="text-rose-500 hover:text-rose-700 transition-colors p-1 cursor-pointer flex-shrink-0 bg-transparent border-none"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
</FeatureLockOverlay>{/* AI Instructions Section */}
                <FeatureLockOverlay isLocked={!hasCustomAIInstructions} featureName="Custom AI Interviewer Instructions">
<div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/60/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-robot text-primary"></i> Custom AI Interviewer Instructions (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-3 bg-white dark:bg-slate-800/60">
                    <div className="flex justify-between items-center">
                      <span className="text-[0.7rem] text-slate-500 dark:text-slate-400">Provide behavioral rules or focus topics to guide the AI</span>
                      <button
                        type="button"
                        onClick={() => document.getElementById('singleAiInstructionsInput').click()}
                        className="inline-flex items-center gap-1 text-[0.7rem] font-extrabold text-primary bg-indigo-50 hover:bg-indigo-100 border border-primary/15 rounded-lg px-2.5 py-1 cursor-pointer transition-all"
                      >
                        <i className="fas fa-paperclip"></i> Upload instructions
                      </button>
                      <input
                        type="file"
                        id="singleAiInstructionsInput"
                        accept=".pdf,.docx,.doc,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files[0]
                          if (!file) return
                          handleParseFile(file, (err, data) => {
                            if (err) {
                              Swal.fire({
                                title: 'Parsing Failed',
                                text: err,
                                icon: 'error',
                                confirmButtonColor: '#6366f1'
                              })
                              setAiInstructionsParsing(false)
                            } else {
                              const lines = parseMultiLineItems ? parseMultiLineItems(data.text || '') : (data.text || '').split('\n').map(l => l.trim()).filter(Boolean);
                              handleSingleChange('aiInstructions', [...(singleCandidate.aiInstructions || []), ...lines])
                            }
                          }, setAiInstructionsParsing)
                        }}
                      />
                    </div>
                    {aiInstructionsParsing && (
                      <span className="text-xs text-warning font-semibold mt-1 block">
                        <i className="fas fa-spinner fa-spin mr-1"></i> Parsing instructions file...
                      </span>
                    )}
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        placeholder="Add a custom interviewer instruction..."
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-4 py-2.5 text-slate-900 dark:text-white text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white dark:bg-slate-800/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400"
                        value={newSingleInstruction}
                        onChange={(e) => setNewSingleInstruction(e.target.value)}
                        onPaste={(e) => {
                          const pasteData = e.clipboardData.getData('text');
                          if (pasteData && (pasteData.includes('\n') || pasteData.includes('\r'))) {
                            e.preventDefault();
                            const items = parseMultiLineItems ? parseMultiLineItems(pasteData) : pasteData.split('\n').map(l => l.trim()).filter(Boolean);
                            if (items.length > 0) {
                              addSingleInstruction(items);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSingleInstruction();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={addSingleInstruction}
                        className="bg-indigo-650 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-[5px] transition-colors cursor-pointer"
                        style={{ backgroundColor: '#6366f1' }}
                      >
                        Add
                      </button>
                    </div>
                    {singleCandidate.aiInstructions && singleCandidate.aiInstructions.length > 0 && (
                      <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
                        {singleCandidate.aiInstructions.map((inst, idx) => (
                          <div key={idx} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 font-medium">
                            <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400 w-7 text-right">{idx + 1}.</span>
                            <div className="flex-1">
                              {editingSingleInstructionIndex === idx ? (
                                <div className="flex gap-2 items-center w-full">
                                  <input
                                    type="text"
                                    className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-3 py-1.5 text-slate-900 dark:text-white text-sm outline-none focus:border-primary focus:bg-white dark:bg-slate-800/60"
                                    value={editingSingleInstructionText}
                                    onChange={(e) => setEditingSingleInstructionText(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (editingSingleInstructionText.trim()) {
                                          const updated = [...singleCandidate.aiInstructions];
                                          updated[idx] = editingSingleInstructionText.trim();
                                          handleSingleChange('aiInstructions', updated);
                                        }
                                        setEditingSingleInstructionIndex(null);
                                      } else if (e.key === 'Escape') {
                                        setEditingSingleInstructionIndex(null);
                                      }
                                    }}
                                    autoFocus
                                    onBlur={() => setEditingSingleInstructionIndex(null)}
                                  />
                                </div>
                              ) : (
                                <div className="flex justify-between items-start gap-4 group" onDoubleClick={() => { setEditingSingleInstructionIndex(idx); setEditingSingleInstructionText(singleCandidate.aiInstructions[idx]); }}>
                                  <span className="break-all">{inst}</span>
                                  <button
                                    type="button"
                                    onClick={() => deleteSingleInstruction(idx)}
                                    className="text-rose-500 hover:text-rose-700 transition-colors p-1 cursor-pointer flex-shrink-0 bg-transparent border-none"
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
</FeatureLockOverlay>

                {/* Project (Optional) Section */}
                <div className="border border-slate-200 dark:border-slate-700/80 rounded-2xl overflow-hidden bg-white dark:bg-slate-800/60/82 backdrop-blur-md shadow-sm transition-all duration-200 hover:border-slate-300">
                  <div className="w-full px-5 py-4 bg-slate-50 dark:bg-slate-900/50/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <i className="fas fa-project-diagram text-primary"></i> Project (Optional)
                    </span>
                  </div>
                  <div className="p-5 flex flex-col gap-4 bg-white dark:bg-slate-800/60">
                    {/* Subbar: Count + Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                        Generated {singleCandidate.projectQuestions?.length || 0} project questions
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGenerateProjectQuestions && handleGenerateProjectQuestions(false)}
                          disabled={projectParsing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-lg cursor-pointer transition-all shadow-sm disabled:opacity-50"
                        >
                          <i className={`fas fa-arrows-rotate ${projectParsing ? 'fa-spin' : ''}`}></i>
                          {singleCandidate.projectQuestions?.length > 0 ? 'Regenerate questions' : 'Generate questions'}
                        </button>
                        <button
                          type="button"
                          onClick={() => document.getElementById('singleProjectFileInput').click()}
                          disabled={projectParsing}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg cursor-pointer transition-all shadow-sm"
                        >
                          <i className="fas fa-paperclip"></i>
                          Upload project
                        </button>
                        <input
                          type="file"
                          id="singleProjectFileInput"
                          accept=".pdf,.docx,.doc,.txt"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            handleParseFile(file, (err, data) => {
                              if (err) {
                                Swal.fire({ title: 'Parsing Failed', text: err, icon: 'error' });
                                if (setProjectParsing) setProjectParsing(false);
                                return;
                              }
                              const extractedText = data.text || '';
                              setSingleCandidate(prev => ({
                                ...prev,
                                projectText: extractedText,
                                projectFileName: file.name,
                                projectResumeDismissed: false
                              }));
                              if (handleGenerateProjectQuestions) {
                                handleGenerateProjectQuestions(false, null, extractedText, file.name);
                              }
                            }, setProjectParsing);
                          }}
                        />
                      </div>
                    </div>

                    {projectParsing && (
                      <span className="text-xs text-warning font-semibold flex items-center gap-1">
                        <i className="fas fa-spinner fa-spin"></i> Processing project data & generating questions...
                      </span>
                    )}

                    {/* Difficulty Selection */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                        <i className="fas fa-chart-simple text-indigo-500"></i>
                        <span>Difficulty Level:</span>
                        <span className="text-slate-400 font-normal">
                          ({((singleCandidate.projectDifficulty || 'hard').charAt(0).toUpperCase() + (singleCandidate.projectDifficulty || 'hard').slice(1))})
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {[
                          { key: 'easy', label: 'Easy', icon: 'fa-seedling' },
                          { key: 'medium', label: 'Medium', icon: 'fa-scale-balanced' },
                          { key: 'hard', label: 'Hard', icon: 'fa-fire' }
                        ].map(d => {
                          const isActive = (singleCandidate.projectDifficulty || 'hard') === d.key;
                          return (
                            <button
                              key={d.key}
                              type="button"
                              onClick={() => {
                                setSingleCandidate(prev => ({
                                  ...prev,
                                  projectDifficulty: d.key,
                                  projectResumeDismissed: false
                                }));
                                if (handleGenerateProjectQuestions) {
                                  handleGenerateProjectQuestions(false, d.key);
                                }
                              }}
                              className={`inline-flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                                isActive
                                  ? d.key === 'hard'
                                    ? 'bg-rose-600 text-white shadow-sm'
                                    : d.key === 'medium'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                              }`}
                            >
                              <i className={`fas ${d.icon}`}></i>
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Uploaded File Banner */}
                    {(singleCandidate.projectFileName || (singleCandidate.resumeText && !singleCandidate.projectResumeDismissed)) && (
                      <div className="flex items-center justify-between px-3 py-2 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 font-medium">
                        <div className="flex items-center gap-2 truncate">
                          <i className="fas fa-file-lines text-indigo-600 dark:text-indigo-400"></i>
                          <span>Uploaded:</span>
                          <span className="font-bold truncate">
                            {singleCandidate.projectFileName || 'Existing candidate resume profile'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSingleCandidate(prev => ({
                              ...prev,
                              projectText: '',
                              projectFileName: '',
                              projectQuestions: [],
                              projectResumeDismissed: true
                            }));
                            if (setSingleProjectQuestionsAdded) setSingleProjectQuestionsAdded(false);
                            const fileInput = document.getElementById('singleProjectFileInput');
                            if (fileInput) fileInput.value = '';
                          }}
                          className="text-slate-400 hover:text-rose-500 transition-colors p-1"
                          title="Clear uploaded project"
                        >
                          <i className="fas fa-xmark"></i>
                        </button>
                      </div>
                    )}

                    {/* Manual Question Input */}
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        placeholder="Add a project-related question or requirement..."
                        className="flex-1 bg-slate-50 dark:bg-slate-900/50/95 border border-slate-200 dark:border-slate-700 rounded-[5px] px-4 py-2.5 text-slate-900 dark:text-white text-[0.95rem] outline-none transition-all duration-200 focus:border-primary focus:bg-white dark:bg-slate-800/60 focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)] placeholder:text-slate-400"
                        value={newProjectQuestion}
                        onChange={(e) => setNewProjectQuestion && setNewProjectQuestion(e.target.value)}
                        onPaste={(e) => {
                          const pasteData = e.clipboardData.getData('text');
                          if (pasteData && (pasteData.includes('\n') || pasteData.includes('\r'))) {
                            e.preventDefault();
                            const items = parseMultiLineItems ? parseMultiLineItems(pasteData) : pasteData.split('\n').map(l => l.trim()).filter(Boolean);
                            if (items.length > 0) {
                              addSingleProjectQuestion(items);
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addSingleProjectQuestion();
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => addSingleProjectQuestion()}
                        className="text-white text-xs font-bold px-4 py-2.5 rounded-[5px] transition-colors cursor-pointer"
                        style={{ backgroundColor: '#6366f1' }}
                      >
                        Add
                      </button>
                    </div>

                    {/* Generated Questions List with [ Clear all ] and [ + Add all ] */}
                    {singleCandidate.projectQuestions && singleCandidate.projectQuestions.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                            <i className="fas fa-list-check text-primary"></i>
                            Generated Questions ({singleCandidate.projectQuestions.length})
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                handleSingleChange('projectQuestions', []);
                                if (setSingleProjectQuestionsAdded) setSingleProjectQuestionsAdded(false);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer transition-all shadow-sm"
                            >
                              <i className="fas fa-trash-alt text-[0.7rem]"></i> Clear all
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (setSingleProjectQuestionsAdded) {
                                  setSingleProjectQuestionsAdded(!singleProjectQuestionsAdded);
                                }
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-lg cursor-pointer transition-all shadow-sm ${
                                singleProjectQuestionsAdded
                                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600'
                                  : 'bg-primary hover:bg-primary/90 text-white border border-primary'
                              }`}
                            >
                              <i className={`fas ${singleProjectQuestionsAdded ? 'fa-check' : 'fa-plus'}`}></i>
                              {singleProjectQuestionsAdded ? 'Added' : 'Add all'}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 max-h-72 overflow-y-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                          {singleCandidate.projectQuestions.map((q, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200 font-medium">
                              <span className="shrink-0 font-semibold text-slate-500 dark:text-slate-400 w-7 text-right leading-relaxed">{idx + 1}.</span>
                              <div className="flex justify-between items-start gap-3 group flex-1">
                                <span className="break-words leading-relaxed">{q}</span>
                                <button
                                  type="button"
                                  onClick={() => deleteSingleProjectQuestion(idx)}
                                  className="text-rose-500 hover:text-rose-700 transition-colors p-1 cursor-pointer flex-shrink-0 bg-transparent border-none"
                                  title="Delete question"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Right Column: Settings, Customization & Actions (Col Span 6) */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              {/* Card 1: Configuration Parameters */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-5">
                <div className="flex gap-3.5 items-center border-b border-border pb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-sliders text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Interview Settings</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Configure parameters, timing, and languages</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Interview Format"
                    value={singleCandidate.interviewFormat}
                    onChange={(e) => handleSingleChange('interviewFormat', e.target.value)}
                    options={[
                      { value: 'Standard', label: 'Standard (Text/Form Based)' },
                      { value: 'Voice', label: 'Voice AI (Real-time Speech)' }
                    ]}
                  />

                  <Select
                    label="Interview Type"
                    value={singleCandidate.interviewType}
                    onChange={(e) => {
                      const type = e.target.value
                      handleSingleChange('interviewType', type)
                      if (type === 'Technical' && singleCandidate.language !== 'English') {
                        Swal.fire({
                          title: 'Language Limitation',
                          text: 'Coding round is currently restricted to English language interviews. Switching language to English.',
                          icon: 'info',
                          confirmButtonColor: '#6366f1'
                        })
                        handleSingleChange('language', 'English')
                      }
                    }}
                    options={[
                      { value: 'Technical', label: 'Technical (+ Coding)' },
                      { value: 'Normal', label: 'Normal (Standard AI)' },
                      { value: 'Non-Technical', label: 'Non-Tech (Case Studies)' }
                    ]}
                  />

                  <Select
                    label="Language"
                    value={singleCandidate.language}
                    onChange={(e) => {
                      const lang = e.target.value
                      handleSingleChange('language', lang)
                      if (lang !== 'English' && singleCandidate.interviewType === 'Technical') {
                        Swal.fire({
                          title: 'Interview Type Adjusted',
                          text: 'Coding round is currently restricted to English language interviews. Switching to Normal interview type.',
                          icon: 'info',
                          confirmButtonColor: '#6366f1'
                        })
                        handleSingleChange('interviewType', 'Normal')
                      }
                    }}
                    options={['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam', 'Kannada']}
                  />

                  <Input
                    label="Duration (Minutes)"
                    type="number"
                    min="5"
                    max="120"
                    value={singleCandidate.duration}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val !== '') {
                        val = parseInt(val);
                        if (val > 120) val = 120;
                      }
                      handleSingleChange('duration', val)
                    }}
                  />

                  <FeatureLockOverlay isLocked={!hasIndustry} featureName="Industry Type">
<div className="sm:col-span-2">
                    <Select
                      label="Industry Type"
                      value={singleCandidate.industry}
                      onChange={(e) => handleSingleChange('industry', e.target.value)}
                      options={[
                        { value: 'General', label: 'General (No Specific)' },
                        { value: 'Agriculture & Food Processing', label: 'Agriculture & Food Processing' },
                        { value: 'Automotive', label: 'Automotive' },
                        { value: 'Aviation', label: 'Aviation' },
                        { value: 'Banking', label: 'Banking' },
                        { value: 'Construction', label: 'Construction' },
                        { value: 'E-commerce', label: 'E-commerce' },
                        { value: 'Education', label: 'Education' },
                        { value: 'Energy & Utilities', label: 'Energy & Utilities' },
                        { value: 'Financial Services', label: 'Financial Services' },
                        { value: 'FinTech', label: 'FinTech' },
                        { value: 'Government & Public Sector', label: 'Government & Public Sector' },
                        { value: 'Healthcare', label: 'Healthcare' },
                        { value: 'Hospitality', label: 'Hospitality' },
                        { value: 'Human Resources & Staffing', label: 'Human Resources & Staffing' },
                        { value: 'Information Technology', label: 'Information Technology' },
                        { value: 'Insurance', label: 'Insurance' },
                        { value: 'Legal Services', label: 'Legal Services' },
                        { value: 'Logistics & Supply Chain', label: 'Logistics & Supply Chain' },
                        { value: 'Manufacturing', label: 'Manufacturing' },
                        { value: 'Marketing & Advertising', label: 'Marketing & Advertising' },
                        { value: 'Media & Entertainment', label: 'Media & Entertainment' },
                        { value: 'Non-Profit Organizations', label: 'Non-Profit Organizations' },
                        { value: 'Oil & Gas', label: 'Oil & Gas' },
                        { value: 'Pharmaceuticals', label: 'Pharmaceuticals' },
                        { value: 'Real Estate', label: 'Real Estate' },
                        { value: 'Retail', label: 'Retail' },
                        { value: 'Software & SaaS', label: 'Software & SaaS' },
                        { value: 'Telecommunications', label: 'Telecommunications' },
                        { value: 'Tourism', label: 'Tourism' },
                        { value: 'Transportation', label: 'Transportation' }
                      ]}
                    />
                  </div>
</FeatureLockOverlay>

                  {singleCandidate.interviewType === 'Non-Technical' && (
                    <div className="sm:col-span-2">
                      <Select
                        label="Number of Case Study Questions (Round 2)"
                        value={singleCandidate.caseStudyCount}
                        onChange={(e) => handleSingleChange('caseStudyCount', parseInt(e.target.value))}
                        options={[
                          { value: '1', label: '1 Question' },
                          { value: '2', label: '2 Questions' },
                          { value: '3', label: '3 Questions' }
                        ]}
                      />
                    </div>
                  )}
                </div>
              </Card>

              {/* Card 2: Scheduling Options */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-border pb-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-calendar-check text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">Interview Schedule</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Enable time restrictions (Optional)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Start Date & Time"
                    type="datetime-local"
                    value={singleCandidate.scheduledStart}
                    max={singleCandidate.scheduledEnd || undefined}
                    onChange={(e) => handleSingleChange('scheduledStart', e.target.value)}
                  />
                  <Input
                    label="End Date & Time"
                    type="datetime-local"
                    value={singleCandidate.scheduledEnd}
                    min={singleCandidate.scheduledStart || undefined}
                    onChange={(e) => handleSingleChange('scheduledEnd', e.target.value)}
                  />
                </div>
                <div className="flex gap-2.5 items-start bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-2xl border border-slate-150 mt-1">
                  <i className="fas fa-circle-info text-indigo-500 text-xs mt-0.5"></i>
                  <p className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-normal font-medium">
                    Leave dates empty for immediate access (24h default expiry). If configured, candidates can only access the assessment within the specified window.
                  </p>
                </div>
              </Card>

              {/* Card 3: Camera Video Config */}
              <div className="bg-card border border-border rounded-2xl p-5 text-foreground flex justify-between items-center shadow-sm hover:border-slate-300 transition-all duration-200">
                <div className="flex items-center gap-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-video text-sm text-white"></i>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <label htmlFor="singleRecordVideo" className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 cursor-pointer">
                      Record Interview Video
                    </label>
                    <span className="text-[0.7rem] text-slate-400 font-medium">Record candidate video via webcam during assessment</span>
                  </div>
                </div>
                <CustomToggleSwitch
                  checked={singleCandidate.recordVideo}
                  onChange={(val) => handleSingleChange('recordVideo', val)}
                />
              </div>

              {/* Card 3b: Voice Cloning */}
              <div className="bg-white dark:bg-slate-800/60/82 backdrop-blur-md border border-[#e5edf7] rounded-2xl p-5 text-slate-800 dark:text-slate-100 flex flex-col gap-4 shadow-[0_18px_40px_rgba(17,24,39,0.06)] hover:border-slate-300 transition-all duration-200">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-transparent border-none overflow-hidden shrink-0">
                      <img src="/voice-cloning-logo.svg" alt="Voice Cloning Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label htmlFor="singleVoiceCloning" className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-200 cursor-pointer">
                        Voice Cloning
                      </label>
                      <span className="text-[0.7rem] text-slate-400 font-medium">AI will speak in a custom Cartesia voice</span>
                    </div>
                  </div>
                  <CustomToggleSwitch
                    checked={singleCandidate.voiceCloning}
                    onChange={(val) => handleSingleChange('voiceCloning', val)}
                  />
                </div>

                {singleCandidate.voiceCloning && (
                  <div className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2 block">Select Voice</label>
                    <Select
                      options={[
                        { value: '', label: 'Default Cartesia Voice' },
                        ...availableVoices.map(v => ({ value: v.id, label: v.name }))
                      ]}
                      value={singleCandidate.customVoiceId || ''}
                      onChange={(e) => handleSingleChange('customVoiceId', e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Card 4: HR Screening Parameters (Toggles) */}
              <Card className="bg-card border border-border text-foreground flex flex-col gap-4">
                <div className="flex gap-3.5 items-center border-b border-border pb-3.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                    style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
                  >
                    <i className="fas fa-clipboard-question text-base text-white"></i>
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground tracking-tight">HR Screening Questions</h3>
                    <p className="text-[0.7rem] text-muted-foreground font-medium">Collect candidate preferences (Optional)</p>
                  </div>
                </div>

                <p className="text-[0.7rem] text-slate-500 dark:text-slate-400 leading-normal mb-1 font-medium">
                  AI will dynamically query and extract candidate responses for the configured attributes at the end of the interview.
                </p>

                <div className="flex flex-col gap-3">
                  {/* Work Mode Screening */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="singleAskWorkMode" className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-building text-slate-400 text-xs"></i> Work Mode Preference
                      </label>
                      <CustomToggleSwitch
                        checked={singleCandidate.hrScreening.askWorkMode}
                        onChange={(val) => handleSingleHrChange('askWorkMode', val)}
                      />
                    </div>
                    {singleCandidate.hrScreening.askWorkMode && (
                      <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 flex-wrap">
                        {['On-site', 'Remote', 'Hybrid'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => handleSingleHrChange('workModeType', mode)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${singleCandidate.hrScreening.workModeType === mode
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
                              }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Location Screening */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50/50 flex flex-col gap-2.5">
                    <div className="flex justify-between items-center">
                      <label htmlFor="singleAskLocation" className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
                        <i className="fas fa-map-location-dot text-slate-400 text-xs"></i> Location Check
                      </label>
                      <CustomToggleSwitch
                        checked={singleCandidate.hrScreening.askLocation}
                        onChange={(val) => handleSingleHrChange('askLocation', val)}
                      />
                    </div>
                    {singleCandidate.hrScreening.askLocation && (
                      <div className="flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-2.5 flex-wrap">
                        {['Current', 'Preferred'].map(loc => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handleSingleHrChange('locationType', loc)}
                            className={`px-3 py-1 rounded-full text-[0.7rem] font-bold transition-all cursor-pointer ${singleCandidate.hrScreening.locationType === loc
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-white dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:bg-slate-900/50 dark:hover:bg-slate-700'
                              }`}
                          >
                            {loc === 'Current' ? 'Current Location' : 'Preferred Location'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Bond Screening */}
                  <div className="border border-slate-150 rounded-xl p-3 bg-slate-50 dark:bg-slate-900/50/50 flex justify-between items-center">
                    <label htmlFor="singleAskBond" className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer">
                      <i className="fas fa-file-signature text-slate-400 text-xs"></i> Bond / Notice Period Info
                    </label>
                    <CustomToggleSwitch
                      checked={singleCandidate.hrScreening.askBond}
                      onChange={(val) => handleSingleHrChange('askBond', val)}
                    />
                  </div>
                </div>
              </Card>

              {/* Form Action Controls */}
              <div className="flex gap-3.5 flex-col sm:flex-row mt-2">
                <Button
                  variant="primary"
                  className="flex-1 shadow-lg bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 rounded-xl"
                  onClick={handleGenerateInterviewLink}
                  disabled={inviting}
                  icon={<i className="fas fa-bolt" />}
                >
                  Generate Link
                </Button>
                <Button
                  variant="warning"
                  className="flex-1 rounded-xl"
                  onClick={() => handlePreviewEmail('single')}
                  icon={<i className="fas fa-eye" />}
                >
                  Preview Email
                </Button>
              </div>

              
            </div>
          </div>


          <Card className="bg-card border border-border text-foreground flex flex-col gap-4 mt-2">
            <div className="flex gap-3.5 items-center border-b border-border pb-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md border border-indigo-400/30"
                style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' }}
              >
                <i className="fas fa-link text-base text-white"></i>
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground tracking-tight">Generated Links</h3>
                <p className="text-[0.7rem] text-muted-foreground font-medium">Share these with candidates to start interviews</p>
              </div>
            </div>

            {singleCreatedLinks.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-2 bg-slate-50 dark:bg-slate-900/50/20">
                <i className="fas fa-link-slash text-2xl opacity-60"></i>
                <p>No interview links generated yet in this session.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {singleCreatedLinks.map((link, idx) => (
                  <div key={idx} className="flex justify-between items-center flex-wrap gap-3 p-3 bg-slate-50 dark:bg-slate-900/50/70 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-slate-350 transition-all shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs font-bold">
                        <i className="fas fa-link"></i>
                      </div>
                      <div>
                        <strong className="text-xs text-slate-800 dark:text-slate-100 block font-bold">{link.name}</strong>
                        <span className="text-[0.7rem] text-slate-500 dark:text-slate-400 font-medium">{link.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        style={{ backgroundColor: '#f1f5f9', color: '#1e293b', border: '1px solid #cbd5e1' }}
                        className="px-3.5 py-2 text-xs font-bold rounded-lg hover:bg-slate-200 shadow-xs cursor-pointer transition-all flex items-center gap-1.5"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/interview?session_id=${link.id}`)
                          Swal.fire({
                            title: 'Link Copied',
                            text: 'Copied link to clipboard!',
                            icon: 'success',
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 2000
                          })
                        }}
                      >
                        <i className="far fa-copy text-xs"></i> Copy Link
                      </button>
                      <a
                        href={`/interview?session_id=${link.id}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ backgroundColor: '#4f46e5', color: '#ffffff', border: '1.5px solid #818cf8' }}
                        className="px-4 py-2 text-xs font-extrabold rounded-lg shadow-sm hover:bg-indigo-700 hover:-translate-y-0.5 transition-all text-center flex items-center justify-center no-underline cursor-pointer gap-1.5 ring-1 ring-indigo-400/50"
                      >
                        <i className="fas fa-play text-[10px] text-white"></i> Start Interview
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

    </>
  )
}
