import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import axios from 'axios'
import { handleUpdateDecision } from '../../store/slices/interviewSlice'
import ScheduleModal from '../../pages/ScheduleModal'
import {
  Mail, Phone, MapPin, Building2, IndianRupee, Clock, Download,
  Play, FileText, Sparkles, Star, Check, X, Calendar, Send,
  MessageSquare, Video, Scale, Loader2, AlertCircle, Monitor,
  Mic, ShieldAlert, Eye, ChevronRight
} from "lucide-react"

// ── Score Ring ──────────────────────────────────────────────────────────────
function ScoreRing({ value, size = 140, strokeWidth = 12, label, tone }) {
  const num = Number(value) || 0
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (num / 100) * circumference

  let colorClass = tone === "success" ? "text-emerald-500"
    : tone === "warning" ? "text-amber-500"
    : tone === "danger" ? "text-rose-500"
    : num >= 80 ? "text-emerald-500"
    : num >= 60 ? "text-amber-500"
    : "text-rose-500"

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90 w-full h-full" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-slate-100" />
        <circle cx={size/2} cy={size/2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent"
          strokeDasharray={circumference} strokeDashoffset={offset}
          className={`${colorClass} transition-all duration-1000 ease-out`} strokeLinecap="round" />
      </svg>
      <div className="absolute flex flex-col items-center justify-center text-center">
        <span className={`font-black text-slate-800 ${size >= 120 ? 'text-2xl' : 'text-base'}`}>{num.toFixed(0)}%</span>
      </div>
      {label && <div className="absolute -bottom-6 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap text-center">{label}</div>}
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
        <div className="text-sm font-semibold text-slate-700 break-all">{value || 'N/A'}</div>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-lg font-black text-slate-800 mt-1">{value ?? 'N/A'}</div>
    </div>
  )
}

// ── Main Dialog ──────────────────────────────────────────────────────────────
export default function CandidateDialog({ candidate, open, onOpenChange, onStatusUpdate }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("overview")
  const [detail, setDetail] = useState(null)
  const [atsData, setAtsData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [atsLoading, setAtsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [showResumeModal, setShowResumeModal] = useState(false)
  const [showRecordingModal, setShowRecordingModal] = useState(false)
  const [showTranscriptModal, setShowTranscriptModal] = useState(false)
  const [showNotesPanel, setShowNotesPanel] = useState(false)
  const [notesHistory, setNotesHistory] = useState([])
  const [notes, setNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  useEffect(() => {
    if (detail?.notes_history && Array.isArray(detail.notes_history)) {
      setNotesHistory(detail.notes_history);
    } else if (candidate?.notes_history && Array.isArray(candidate.notes_history)) {
      setNotesHistory(candidate.notes_history);
    } else {
      setNotesHistory([]);
    }
  }, [detail, candidate]);

  // Fetch full candidate details when dialog opens
  useEffect(() => {
    if (!open || !candidate) return
    setActiveTab("overview")
    setDetail(null)
    setAtsData(null)
    setError(null)

    const linkId = candidate.link_id || candidate.id || candidate._id
    if (!linkId || linkId.startsWith("ai_call_")) {
      // AI Calling candidates don't have a session - use candidate data as-is
      setDetail({ ...candidate })
      return
    }

    const fetchDetails = async () => {
      setLoading(true)
      try {
        const res = await axios.get(`${API_BASE_URL}/admin/interview/${linkId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setDetail(res.data)
      } catch (e) {
        console.error("Error fetching candidate detail:", e)
        setError("Could not load full details. Showing basic info.")
        setDetail({ ...candidate })
      } finally {
        setLoading(false)
      }
    }
    fetchDetails()
  }, [open, candidate, API_BASE_URL, token])

  // Fetch ATS data when Resume tab is active
  useEffect(() => {
    if (activeTab !== 'resume' || !detail || atsData) return

    // Try all possible field names from the backend
    const profileText = detail.profile_text || detail.resume_text || ''
    const jdText = detail.job_description || detail.job_description_text || detail.interview_title || detail.job_applied || ''

    if (!profileText || !jdText) return

    const fetchAts = async () => {
      setAtsLoading(true)
      try {
        const res = await axios.post(`${API_BASE_URL}/admin/ats-score`, {
          resume_text: profileText,
          jd_text: jdText
        }, { headers: { Authorization: `Bearer ${token}` } })
        setAtsData(res.data)
      } catch (e) {
        console.error("ATS score error:", e)
      } finally {
        setAtsLoading(false)
      }
    }
    fetchAts()
  }, [activeTab, detail, atsData, API_BASE_URL, token])

  if (!open || !candidate) return null

  // Merge candidate + detail for display
  const c = detail || candidate
  const name = c.candidate_name || candidate.candidate_name || "Unknown Candidate"
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()
  // interview_title: try every possible field name
  const jobTitle = c.interview_title || candidate.interview_title || c.job_applied || candidate.job_applied || "Position"
  const email = c.candidate_email || c.email || candidate.candidate_email || candidate.email || "No email provided"
  const phone = c.candidate_phone || c.phone || candidate.candidate_phone || "N/A"
  const aiScore = Number(c.avg_score || c.score || candidate.score || 0)
  const isQualified = (c.decision || candidate.decision) === 'selected'
  const status = c.status || candidate.status || ''
  // Resume/profile text from any field available
  const resumeText = c.profile_text || c.resume_text || ''
  const jdText = c.job_description || c.job_description_text || jobTitle || ''

  const scoreItems = [
    ["Communication", c.communication_score],
    ["Technical Skills", c.skills_score],
    ["Competencies", c.competencies_score],
    ["Personality", c.personality_score],
    ["Culture Fit", c.culture_fit_score],
    ["Job Success", c.job_success_score],
  ].filter(([, v]) => v !== undefined && v !== null && v !== 0)

  const timeline = [
    { label: "Application Received", done: true },
    { label: "AI Interview Assigned", done: true },
    { label: "Interview Completed", done: status === 'completed' || !!c.answers?.length },
    { label: isQualified ? "Selected ✓" : "Rejected ✗", done: !!(c.decision || candidate.decision), bad: !isQualified }
  ]

  const recordingUrl = c.recording_url
  const screenRecordingUrl = c.screen_recording_url

  const handleDecision = async (newDecision) => {
    if (!candidate) return;
    const linkId = candidate.link_id || candidate.id || candidate._id;
    if (!linkId) return;

    try {
      await dispatch(handleUpdateDecision({ linkId, decision: newDecision })).unwrap()
      Swal.fire('Success', `Candidate marked as ${newDecision.toUpperCase()}`, 'success')
      if (onStatusUpdate) onStatusUpdate(newDecision)
      onOpenChange(false)
    } catch (err) {
      Swal.fire('Error', 'Failed to update decision', 'error')
    }
  }

  const handleNotes = () => {
    setShowNotesPanel(true);
  }

  const handleSaveNotes = async () => {
    if (!notes.trim()) return;
    setSavingNotes(true);
    try {
      const linkId = candidate.link_id || candidate.id || candidate._id;
      const response = await axios.put(`${API_BASE_URL}/admin/interview/${linkId}/notes`, { notes }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.note) {
        setNotesHistory(prev => [...prev, response.data.note]);
        if (detail) {
          setDetail(prev => ({ ...prev, notes_history: [...(prev.notes_history || []), response.data.note] }));
        }
      }
      setNotes("");
    } catch (err) {
      Swal.fire('Error', 'Failed to save note.', 'error');
    }
    setSavingNotes(false);
  }

  const handleSchedule = () => {
    setIsScheduleModalOpen(true);
  }

  const handleOffer = () => {
    Swal.fire({
      title: 'Send Offer',
      text: "Are you sure you want to send an offer to this candidate?",
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      confirmButtonText: 'Yes, Send Offer'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire('Offer Sent!', 'The candidate has been notified.', 'success')
      }
    })
  }

  const handleViewProfile = () => {
    const linkId = c.link_id || c.id || c._id;
    onOpenChange(false);
    const prefix = window.location.pathname.startsWith('/superadmin') ? '/superadmin' : '/admin';
    navigate(`${prefix}/candidate/profile/${linkId}`, { state: { candidate: c } });
  }

  const tabs = ["overview", "resume", "interview", "evaluation", "timeline"]

  return (
    <>
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onOpenChange(false) }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="relative p-6 pb-4 border-b border-slate-100 bg-gradient-to-br from-indigo-50/60 to-white shrink-0">
          <button onClick={() => onOpenChange(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <X size={20} />
          </button>

          {loading ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <span className="text-slate-500 font-medium">Loading candidate details…</span>
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-white text-xl font-bold shrink-0 shadow-sm">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-black text-slate-800 truncate">{name}</h2>
                <p className="text-sm font-medium text-slate-500 mt-0.5">{jobTitle}</p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isQualified ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {isQualified ? 'Hire' : 'Rejected'}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {isQualified ? 'Qualified' : 'Rejected'}
                  </span>
                  <span className="text-xs font-medium text-slate-400">ID: {candidate.link_id || candidate.id}</span>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-center justify-center mr-8">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">AI Score</div>
                <div className={`text-4xl font-black tabular-nums tracking-tighter mt-1 ${aiScore >= 75 ? 'text-emerald-600' : aiScore >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{aiScore.toFixed(0)}%</div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-4 px-6 border-b border-slate-100 bg-white overflow-x-auto shrink-0">
          {tabs.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={`capitalize whitespace-nowrap px-1 py-4 text-sm font-bold border-b-2 transition-colors ${activeTab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">

          {/* ─ Overview Tab ─ */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 mb-4">Candidate Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
                  <InfoRow icon={Mail} label="Email" value={email} />
                  <InfoRow icon={Phone} label="Mobile" value={phone} />
                  <InfoRow icon={Clock} label="Experience" value={c.experience} />
                  <InfoRow icon={Building2} label="Current Company" value={c.current_company} />
                  <InfoRow icon={IndianRupee} label="Current CTC" value={c.current_ctc} />
                  <InfoRow icon={IndianRupee} label="Expected CTC" value={c.expected_ctc} />
                  <InfoRow icon={Clock} label="Notice Period" value={c.notice_period} />
                  <InfoRow icon={MapPin} label="Location" value={c.location} />
                </div>
              </section>

              <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-600" /> AI Recommendation
                </h3>
                <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-indigo-50/40 to-white p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${isQualified ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {c.overall_recommendation || (isQualified ? 'Hire' : 'Reject')}
                    </span>
                    <span className="text-sm font-medium text-slate-500">
                      {isQualified ? 'Ready for Technical Round / Hiring' : 'Does not meet required threshold'}
                    </span>
                  </div>
                  {c.strengths_summary && (
                    <div className="mb-3">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Strengths</div>
                      <p className="text-sm font-medium text-slate-700 bg-emerald-50/60 rounded-lg p-3 border border-emerald-100">{c.strengths_summary}</p>
                    </div>
                  )}
                  {c.weaknesses_summary && (
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Areas to Improve</div>
                      <p className="text-sm font-medium text-slate-700 bg-rose-50/60 rounded-lg p-3 border border-rose-100">{c.weaknesses_summary}</p>
                    </div>
                  )}
                  {!c.strengths_summary && !c.weaknesses_summary && (
                    <p className="text-sm text-slate-500">No AI summary available for this candidate yet.</p>
                  )}
                </div>
              </section>

              {/* Integrity */}
              {c.integrity && (
                <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <h3 className="text-sm font-black text-slate-800 mb-4 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-amber-500" /> Interview Integrity
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard label="Tab Switches" value={c.integrity.total_tab_switches} />
                    <StatCard label="Face Alerts" value={c.integrity.total_face_alerts} />
                    <StatCard label="Noise Alerts" value={c.integrity.total_noise_alerts} />
                    <StatCard label="Total Duration" value={`${c.integrity.total_time_minutes} min`} />
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ─ Resume Tab ─ */}
          {activeTab === 'resume' && (
            <div className="space-y-6">
              {/* Resume Button */}
              {resumeText && (
                <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Resume / Profile Text</h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Candidate's submitted resume</p>
                    </div>
                    <button
                      onClick={() => setShowResumeModal(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm"
                    >
                      <FileText size={16} /> Resume <ChevronRight size={14} />
                    </button>
                  </div>
                </section>
              )}

              {/* ATS Score */}
              <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-black text-slate-800">ATS Resume Match Score</h3>
                  {atsLoading ? (
                    <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium">
                      <Loader2 size={14} className="animate-spin" /> Analyzing…
                    </div>
                  ) : atsData ? (
                    <span className="text-lg font-black text-indigo-600">{atsData.score}%</span>
                  ) : null}
                </div>

                {atsData ? (
                  <>
                    <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                      <div className="h-full bg-indigo-600 rounded-full transition-all duration-700" style={{ width: `${atsData.score}%` }} />
                    </div>
                    {atsData.summary && (
                      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border mb-4">{atsData.summary}</p>
                    )}
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <Check size={14} className="text-emerald-500" /> Matched Skills ({atsData.matched_skills?.length || 0})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {(atsData.matched_skills || []).map(s => (
                            <span key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                              <Check size={12} strokeWidth={3} /> {s}
                            </span>
                          ))}
                          {!atsData.matched_skills?.length && <p className="text-xs text-slate-400">None found</p>}
                        </div>
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                          <X size={14} className="text-rose-500" /> Missing Skills ({atsData.missing_skills?.length || 0})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {(atsData.missing_skills || []).map(s => (
                            <span key={s} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700">
                              <X size={12} strokeWidth={3} /> {s}
                            </span>
                          ))}
                          {!atsData.missing_skills?.length && <p className="text-xs text-slate-400">None found</p>}
                        </div>
                      </div>
                    </div>
                  </>
                ) : !atsLoading && (
                  <div className="text-xs text-slate-400 text-center py-4">
                    {resumeText && !jdText
                      ? "ATS analysis not available — job description missing."
                      : !resumeText && jdText
                      ? "No resume text found for this candidate. ATS analysis requires a resume."
                      : loading
                      ? "Loading resume data..."
                      : "No resume or job description data found for this candidate."}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* ─ Interview Tab ─ */}
          {activeTab === 'interview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Status" value={c.status || "Completed"} />
                <StatCard label="Duration" value={c.integrity ? `${c.integrity.total_time_minutes} min` : "N/A"} />
                <StatCard label="Questions Answered" value={c.answers?.length ?? "N/A"} />
              </div>

              {/* Recordings Button */}
              <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-800">Recordings</h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      {recordingUrl || screenRecordingUrl ? 'Camera & screen recording available' : 'No recordings available'}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowRecordingModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm"
                  >
                    <Video size={16} /> Recording <ChevronRight size={14} />
                  </button>
                </div>
              </section>

              {/* Transcript Button */}
              {c.answers && c.answers.length > 0 && (
                <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-800">Interview Q&A</h3>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">{c.answers.length} questions answered</p>
                    </div>
                    <button
                      onClick={() => setShowTranscriptModal(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-xl hover:bg-violet-100 transition-colors shadow-sm"
                    >
                      <MessageSquare size={16} /> Transcript <ChevronRight size={14} />
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ─ Evaluation Tab ─ */}
          {activeTab === 'evaluation' && (
            <div className="space-y-10">
              <div className="flex justify-center mt-6">
                <ScoreRing value={aiScore} size={160} strokeWidth={14} />
              </div>

              {scoreItems.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 px-4">
                  {scoreItems.map(([label, val]) => (
                    <div key={label} className="bg-white rounded-2xl border border-slate-200/60 p-6 flex flex-col items-center shadow-sm">
                      <ScoreRing value={Number(val || 0)} size={90} strokeWidth={9}
                        tone={Number(val) >= 80 ? "success" : Number(val) >= 60 ? "" : "danger"} />
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-6 text-center">{label}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400 text-sm font-medium">
                  Evaluation scores not available yet. The candidate may not have completed the interview.
                </div>
              )}

              {c.detected_accent && (
                <div className="bg-white rounded-xl border border-slate-200/60 p-4 shadow-sm flex items-center gap-3">
                  <Mic size={18} className="text-indigo-400" />
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Detected Language / Accent</div>
                    <div className="text-sm font-bold text-slate-700">{c.detected_accent}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─ Timeline Tab ─ */}
          {activeTab === 'timeline' && (
            <div className="max-w-2xl mx-auto py-6">
              <div className="relative border-l-2 border-slate-200 ml-4 space-y-8">
                {timeline.map((step, i) => (
                  <div key={step.label} className="relative pl-8">
                    <span className={`absolute -left-[11px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-slate-50 shadow-sm ${step.done ? (step.bad ? "bg-rose-500 text-white" : "bg-indigo-600 text-white") : "bg-white border-2 border-slate-300"}`}>
                      {step.done && <Check size={12} strokeWidth={4} />}
                    </span>
                    <div className="flex items-center gap-3">
                      <h4 className={`text-sm font-black ${step.done ? (step.bad ? "text-rose-700" : "text-slate-800") : "text-slate-400"}`}>
                        {step.label}
                      </h4>
                      {i === timeline.findIndex(t => !t.done) && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-wider">Next up</span>
                      )}
                    </div>
                    {step.done && <p className="text-xs font-medium text-slate-500 mt-1">Completed.</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer Actions ── */}
        <div className="border-t border-slate-200/80 p-4 bg-white flex flex-wrap items-center justify-end gap-3 shrink-0">
          <button onClick={handleNotes} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <MessageSquare size={16} /> Add Notes
          </button>
          <button onClick={handleViewProfile} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <Eye size={16} /> View Profile
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          {!isQualified && (
            <>
              <button onClick={() => handleDecision('rejected')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors shadow-sm">
                <X size={16} strokeWidth={3} /> Reject
              </button>
              <button onClick={() => handleDecision('pending')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-amber-600 bg-amber-50 border border-amber-100 rounded-xl hover:bg-amber-100 transition-colors shadow-sm">
                <Clock size={16} strokeWidth={3} /> Pending
              </button>
              <button onClick={() => handleDecision('selected')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
                <Check size={16} strokeWidth={3} /> Select
              </button>
            </>
          )}
          <button onClick={handleSchedule} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl hover:bg-indigo-100 transition-colors shadow-sm">
            <Calendar size={16} /> Schedule
          </button>
          <button onClick={handleOffer} className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors shadow-sm">
            <Send size={16} /> Send Offer
          </button>
        </div>
      </div>

      <ScheduleModal 
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        candidate={c}
      />
    </div>

    {/* ── Resume Sub-Modal ── */}
    {showResumeModal && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setShowResumeModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><FileText size={18} /></div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Resume / Profile Text</h3>
                <p className="text-xs text-slate-400 font-medium">{name}</p>
              </div>
            </div>
            <button onClick={() => setShowResumeModal(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <pre className="text-sm text-slate-700 bg-slate-50 rounded-xl p-5 whitespace-pre-wrap font-sans border border-slate-200 leading-relaxed">{resumeText}</pre>
          </div>
        </div>
      </div>
    )}

    {/* ── Recording Sub-Modal ── */}
    {showRecordingModal && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setShowRecordingModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Video size={18} /></div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Recordings</h3>
                <p className="text-xs text-slate-400 font-medium">{name}</p>
              </div>
            </div>
            <button onClick={() => setShowRecordingModal(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid sm:grid-cols-2 gap-5">
              {/* Camera Recording */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><Video size={18} /></div>
                  <div>
                    <div className="text-sm font-black text-slate-800">Camera Recording</div>
                    <div className="text-xs text-slate-400 font-medium">Interview video feed</div>
                  </div>
                </div>
                {recordingUrl ? (
                  <video controls className="w-full rounded-lg border border-slate-200 bg-black" src={recordingUrl}>
                    Your browser does not support video.
                  </video>
                ) : (
                  <div className="h-32 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs font-medium text-slate-400">
                    No camera recording available
                  </div>
                )}
              </div>
              {/* Screen Recording */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><Monitor size={18} /></div>
                  <div>
                    <div className="text-sm font-black text-slate-800">Screen Recording</div>
                    <div className="text-xs text-slate-400 font-medium">Screen share capture</div>
                  </div>
                </div>
                {screenRecordingUrl ? (
                  <video controls className="w-full rounded-lg border border-slate-200 bg-black" src={screenRecordingUrl}>
                    Your browser does not support video.
                  </video>
                ) : (
                  <div className="h-32 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs font-medium text-slate-400">
                    No screen recording available
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Transcript Sub-Modal ── */}
    {showTranscriptModal && (
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setShowTranscriptModal(false)}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-violet-50 text-violet-600 rounded-lg"><MessageSquare size={18} /></div>
              <div>
                <h3 className="text-sm font-black text-slate-800">Interview Q&A — Transcript</h3>
                <p className="text-xs text-slate-400 font-medium">{c.answers?.length} questions · {name}</p>
              </div>
            </div>
            <button onClick={() => setShowTranscriptModal(false)} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <div className="space-y-5">
              {(c.answers || []).map((a, idx) => {
                const score = Number(a.ai_score ?? 0)
                const scoreBg = score >= 75 ? 'bg-emerald-100 text-emerald-700' : score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                const wpm = Number(a.wpm ?? 0)
                const tabSwitches = Number(a.tab_switches ?? 0)
                const faceAlerts = Number(a.face_alerts ?? 0)
                const noiseAlerts = Number(a.noise_alerts ?? 0)
                const hasAlerts = tabSwitches > 0 || faceAlerts > 0 || noiseAlerts > 0
                return (
                  <div key={idx} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {/* Question Header */}
                    <div className="flex items-start justify-between gap-3 p-4 bg-slate-50 border-b border-slate-100">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="mt-0.5 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black">Q{idx + 1}</span>
                        <p className="text-sm font-bold text-slate-800 leading-snug">{a.question_text || 'No question recorded'}</p>
                      </div>
                      {a.ai_score !== null && a.ai_score !== undefined && (
                        <span className={`shrink-0 text-xs font-black px-2.5 py-1 rounded-full ${scoreBg}`}>
                          AI Score: {score.toFixed(0)}%
                        </span>
                      )}
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Stats row: WPM + alerts */}
                      <div className="flex flex-wrap gap-2">
                        {wpm > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100">
                            <Mic size={11} /> {wpm.toFixed(0)} WPM
                          </span>
                        )}
                        {tabSwitches > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            <Monitor size={11} /> {tabSwitches} Tab Switch{tabSwitches > 1 ? 'es' : ''}
                          </span>
                        )}
                        {faceAlerts > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                            <ShieldAlert size={11} /> {faceAlerts} Face Alert{faceAlerts > 1 ? 's' : ''}
                          </span>
                        )}
                        {noiseAlerts > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                            <AlertCircle size={11} /> {noiseAlerts} Noise Alert{noiseAlerts > 1 ? 's' : ''}
                          </span>
                        )}
                        {!wpm && !hasAlerts && (
                          <span className="text-[11px] text-slate-400 font-medium">No integrity data recorded</span>
                        )}
                      </div>

                      {/* Candidate Answer */}
                      <div>
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <MessageSquare size={10} /> Candidate Answer
                        </div>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 leading-relaxed">
                          {a.answer_text || <span className="italic text-slate-400">No answer recorded</span>}
                        </div>
                      </div>

                      {/* Corrected Answer */}
                      {a.corrected_answer && a.corrected_answer !== 'N/A' && a.corrected_answer !== 'Scoring in progress...' && (
                        <div>
                          <div className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Check size={10} /> Corrected / Model Answer
                          </div>
                          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-800 leading-relaxed">
                            {a.corrected_answer}
                          </div>
                        </div>
                      )}

                      {/* AI Feedback */}
                      {a.ai_feedback && (
                        <div>
                          <div className="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Sparkles size={10} /> AI Feedback
                          </div>
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-sm text-indigo-800 italic leading-relaxed">
                            {a.ai_feedback}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {(!c.answers || c.answers.length === 0) && (
                <div className="text-center py-12 text-slate-400 text-sm font-medium">
                  No transcript available for this candidate.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )}

    {/* ── Notes Slide-out Panel ── */}
    {showNotesPanel && (
      <div className="fixed inset-y-0 right-0 z-[400] w-96 bg-white shadow-2xl flex flex-col border-l border-slate-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0 bg-slate-50">
          <h3 className="text-sm font-black text-slate-800">Candidate Notes</h3>
          <button onClick={() => setShowNotesPanel(false)} className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 p-5 bg-slate-50 flex flex-col overflow-y-auto space-y-4">
          {notesHistory.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-sm">
              <MessageSquare size={32} className="mb-2 opacity-50" />
              <p>No notes yet.</p>
              <p className="text-xs mt-1">Add a note below to start.</p>
            </div>
          ) : (
            notesHistory.map((n, i) => (
              <div key={i} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
                <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5 flex justify-between">
                  <span>{n.role || 'Admin'}</span>
                  <span>{new Date(n.timestamp).toLocaleDateString()} {new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.text}</p>
              </div>
            ))
          )}
        </div>
        <div className="p-5 border-t border-slate-100 bg-white">
           <textarea 
             value={notes}
             onChange={(e) => setNotes(e.target.value)}
             placeholder="Type a note..."
             rows={2}
             className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm text-slate-700 placeholder:text-slate-400 outline-none transition-all mb-3"
           />
          <button 
            onClick={handleSaveNotes}
            disabled={savingNotes || !notes.trim()}
            className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
          >
            {savingNotes ? 'Saving...' : 'Save Note'}
          </button>
        </div>
      </div>
    )}
  </>
  )
}
