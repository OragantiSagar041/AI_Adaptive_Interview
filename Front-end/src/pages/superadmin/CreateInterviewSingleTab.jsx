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
  handleParseFile,
  handleGenerateInterviewLink,
  handlePreviewEmail,
  inviting,
  availableVoices = [],
  hasCustomScreening,
  hasCustomAIInstructions,
  hasIndustry,
  singleCreatedLinks = [],
}) {
  const [newSingleQuestion, setNewSingleQuestion] = useState('')
  const [newSingleInstruction, setNewSingleInstruction] = useState('')

  const [editingSingleQuestionIndex, setEditingSingleQuestionIndex] = useState(null)
  const [editingSingleQuestionText, setEditingSingleQuestionText] = useState('')
  const [editingSingleInstructionIndex, setEditingSingleInstructionIndex] = useState(null)
  const [editingSingleInstructionText, setEditingSingleInstructionText] = useState('')

  const emailDebounceRef = useRef(null)

  const addSingleQuestion = () => {
    if (!newSingleQuestion.trim()) return
    handleSingleChange('customQuestions', [...(singleCandidate.customQuestions || []), newSingleQuestion.trim()])
    setNewSingleQuestion('')
  }
  const deleteSingleQuestion = (index) => {
    handleSingleChange('customQuestions', (singleCandidate.customQuestions || []).filter((_, i) => i !== index))
  }

  const addSingleInstruction = () => {
    if (!newSingleInstruction.trim()) return
    handleSingleChange('aiInstructions', [...(singleCandidate.aiInstructions || []), newSingleInstruction.trim()])
    setNewSingleInstruction('')
  }
  const deleteSingleInstruction = (index) => {
    handleSingleChange('aiInstructions', (singleCandidate.aiInstructions || []).filter((_, i) => i !== index))
  }

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
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId) return;
                      const log = callLogs.find(l => (l._id || l.id) === selectedId);
                      if (log) {
                        setSingleCandidate(prev => ({
                          ...prev,
                          name: log.name || prev.name,
                          email: log.email || prev.email,
                          phone: log.phone || prev.phone,
                          resumeText: log.resume_text || log.resume_url || prev.resumeText,
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
                              const lines = (data.text || '')
                                .split('\n')
                                .map(line => line.trim())
                                .filter(Boolean);
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
</FeatureLockOverlay>

                {/* AI Instructions Section */}
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
                              const lines = (data.text || '')
                                .split('\n')
                                .map(line => line.trim())
                                .filter(Boolean);
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
                      <ol className="list-decimal pl-5 flex flex-col gap-2 mt-2 max-h-60 overflow-y-auto">
                        {singleCandidate.aiInstructions.map((inst, idx) => (
                          <li key={idx} className="text-sm text-slate-700 dark:text-slate-200 font-medium">
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
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                </div>
</FeatureLockOverlay>
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
                    options={['English', 'Hindi', 'Telugu', 'Tamil', 'Malayalam']}
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
                        { value: 'Information Technology', label: 'Information Technology' },
                        { value: 'Software & SaaS', label: 'Software & SaaS' },
                        { value: 'Healthcare', label: 'Healthcare' },
                        { value: 'Pharmaceuticals', label: 'Pharmaceuticals' },
                        { value: 'Banking', label: 'Banking' },
                        { value: 'Financial Services', label: 'Financial Services' },
                        { value: 'Insurance', label: 'Insurance' },
                        { value: 'FinTech', label: 'FinTech' },
                        { value: 'Education', label: 'Education' },
                        { value: 'Manufacturing', label: 'Manufacturing' },
                        { value: 'Automotive', label: 'Automotive' },
                        { value: 'Telecommunications', label: 'Telecommunications' },
                        { value: 'Retail', label: 'Retail' },
                        { value: 'E-commerce', label: 'E-commerce' },
                        { value: 'Logistics & Supply Chain', label: 'Logistics & Supply Chain' },
                        { value: 'Transportation', label: 'Transportation' },
                        { value: 'Aviation', label: 'Aviation' },
                        { value: 'Hospitality', label: 'Hospitality' },
                        { value: 'Tourism', label: 'Tourism' },
                        { value: 'Real Estate', label: 'Real Estate' },
                        { value: 'Construction', label: 'Construction' },
                        { value: 'Energy & Utilities', label: 'Energy & Utilities' },
                        { value: 'Oil & Gas', label: 'Oil & Gas' },
                        { value: 'Media & Entertainment', label: 'Media & Entertainment' },
                        { value: 'Marketing & Advertising', label: 'Marketing & Advertising' },
                        { value: 'Legal Services', label: 'Legal Services' },
                        { value: 'Government & Public Sector', label: 'Government & Public Sector' },
                        { value: 'Non-Profit Organizations', label: 'Non-Profit Organizations' },
                        { value: 'Agriculture & Food Processing', label: 'Agriculture & Food Processing' },
                        { value: 'Human Resources & Staffing', label: 'Human Resources & Staffing' }
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
