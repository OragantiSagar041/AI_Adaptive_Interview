import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import axios from 'axios'
import { handleUpdateDecision } from '../../store/slices/interviewSlice'
import ScheduleModal from './ScheduleModal'
import {
  Mail, Phone, MapPin, Building2, IndianRupee, Clock, Download,
  Play, FileText, Sparkles, Star, Check, X, Calendar, Send,
  MessageSquare, Video, Scale, Loader2, AlertCircle, Monitor,
  Mic, ShieldAlert, Eye
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
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-slate-100" />
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent"
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
        <div className="text-sm font-semibold text-slate-700 truncate">{value || 'N/A'}</div>
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
export default function CandidateDialog({ candidate, open, onOpenChange }) {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("overview")
  const [detail, setDetail] = useState(null)
  const [atsData, setAtsData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [atsLoading, setAtsLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showResumeModal, setShowResumeModal] = useState(false)
  const [showRecordingModal, setShowRecordingModal] = useState(false)
  const [showTranscriptModal, setShowTranscriptModal] = useState(false)

  // New States
  const [extractingInfo, setExtractingInfo] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [newNote, setNewNote] = useState("")
  const [notesSaving, setNotesSaving] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

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

  // Extract candidate info via frontend Regex if missing
  useEffect(() => {
    if (!open || !detail) return

    const hasResume = detail.resume_text || detail.profile_text || detail.resume_url;

    // Check if we need to extract info
    if (!detail.info_extracted && (!detail.experience || detail.experience === "N/A") && hasResume && !extractingInfo) {
      setExtractingInfo(true)

      const resume = detail.resume_text || detail.profile_text || "";
      let extExp = "";
      let extLocation = "";
      let extCTC = "";
      let extMobile = "";
      let extCompany = "";
      let extExpectedCTC = "";
      let extNotice = "";

      // Simple frontend regex extraction
      if (resume) {
        // Look for X years, X+ years, X yrs, or Fresher
        const expMatch = resume.match(/(?:experience[\s:\-]{1,4})?(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?|y)(?:\s*of)?\s*(?:experience)?\b/i);
        const fresherMatch = resume.match(/(?:fresher|entry[- ]level|0\s*years?)/i);
        if (expMatch) extExp = expMatch[1] + " Years";
        else if (fresherMatch) extExp = "0 Years";

        const locMatch = resume.match(/(?:location|city|address|residing\s*in|place|based\s*in)[\s:\-]{1,4}([A-Za-z]+(?:,\s*[A-Za-z]+)*)/i);
        if (locMatch) extLocation = locMatch[1];

        const ctcMatch = resume.match(/(?:current\s*ctc|ctc|package|salary|current\s*salary)[\s:\-]{1,4}([\d\.]+\s*(?:lpa|k|m|LPA))/i);
        if (ctcMatch) extCTC = ctcMatch[1].toUpperCase();

        const mobileMatch = resume.match(/(?:mobile|phone|ph|contact)[\s:\-]{1,4}(\+?[\d\-\s]{10,15})/i) || resume.match(/(?:\+91|91)?[-\s]?[6-9]\d{9}/);
        if (mobileMatch) extMobile = (mobileMatch[1] || mobileMatch[0]).trim();

        const compMatch = resume.match(/(?:company|employer|organization|currently\s*working\s*at|current\s*company|worked\s*at|role\s*at)[\s:\-]{1,4}([A-Za-z0-9\s\&\.\-]+?)(?=\n|$|\|)/i);
        if (compMatch) extCompany = compMatch[1].trim();

        const expCtcMatch = resume.match(/(?:expected\s*ctc|expected\s*salary|expected|expected\s*package)[\s:\-]{1,4}([\d\.]+\s*(?:lpa|k|m|LPA))/i);
        if (expCtcMatch) extExpectedCTC = expCtcMatch[1].toUpperCase();

        const noticeMatch = resume.match(/(?:notice\s*period|availability|can\s*join\s*in|joining\s*in)[\s:\-]{1,5}(\d+\s*(?:days?|months?|weeks?|day|month|week))/i);
        if (noticeMatch) extNotice = noticeMatch[1];

        // Strategy 2: Line-by-line key-value fallback
        // This is for when the user manually pastes vertical lists (e.g. "Experience\n2 Years")
        const lines = resume.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (let i = 0; i < lines.length - 1; i++) {
          const lower = lines[i].toLowerCase().replace(/[:\-]/g, '').trim();
          const next = lines[i + 1];

          if (!extExp && (lower === "experience" || lower === "total experience" || lower === "exp")) {
            extExp = next;
          }
          if (!extCTC && (lower === "current ctc" || lower === "ctc" || lower === "current salary")) {
            extCTC = next;
          }
          if (!extExpectedCTC && (lower === "expected ctc" || lower === "expected salary")) {
            extExpectedCTC = next;
          }
          if (!extNotice && (lower === "notice period" || lower === "availability")) {
            extNotice = next;
          }
          if (!extCompany && (lower === "current company" || lower === "company" || lower === "organization")) {
            extCompany = next;
          }
          if (!extLocation && (lower === "location" || lower === "city")) {
            extLocation = next;
          }
          if (!extMobile && (lower === "mobile" || lower === "phone" || lower === "contact")) {
            extMobile = next;
          }
        }
      }

      // Simulate a small delay for extraction feeling
      const timerId = setTimeout(() => {
        setDetail(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            experience: (!prev.experience || prev.experience === "N/A") ? extExp : prev.experience,
            location: (!prev.location || prev.location === "N/A") ? extLocation : prev.location,
            current_ctc: (!prev.current_ctc || prev.current_ctc === "N/A") ? extCTC : prev.current_ctc,
            candidate_phone: (!prev.candidate_phone || prev.candidate_phone === "N/A") && (!prev.phone || prev.phone === "N/A") ? extMobile : (prev.candidate_phone || prev.phone),
            current_company: (!prev.current_company || prev.current_company === "N/A") ? extCompany : prev.current_company,
            expected_ctc: (!prev.expected_ctc || prev.expected_ctc === "N/A") ? extExpectedCTC : prev.expected_ctc,
            notice_period: (!prev.notice_period || prev.notice_period === "N/A") ? extNotice : prev.notice_period,
            info_extracted: true
          };
        })
        setExtractingInfo(false)
      }, 800);

      return () => clearTimeout(timerId);
    }
  }, [open, detail, extractingInfo])

  // No AI Notes Extraction anymore, we use DB directly.

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

  const formatMediaUrl = (url) => {
    if (!url) return null
    if (url.startsWith('http')) return url
    return `${API_BASE_URL}/${url.replace(/^\/+/, '')}`
  }

  const recordingUrl = formatMediaUrl(c.recording_url)
  const screenRecordingUrl = formatMediaUrl(c.screen_recording_url)

  const handleDecision = async (newDecision) => {
    if (!candidate) return;
    const linkId = candidate.link_id || candidate.id || candidate._id;
    if (!linkId) return;

    try {
      await dispatch(handleUpdateDecision({ linkId, decision: newDecision })).unwrap()
      Swal.fire('Success', `Candidate marked as ${newDecision.toUpperCase()}`, 'success')
      onOpenChange(false)
      const basePath = window.location.pathname.startsWith('/superadmin') ? '/superadmin' : '/admin'
      navigate(`${basePath}/${newDecision === 'selected' ? 'qualified-candidates' : 'rejected-candidates'}`)
    } catch (err) {
      Swal.fire('Error', 'Failed to update decision', 'error')
    }
  }

  const handleNotes = () => {
    Swal.fire({
      title: 'Add Notes',
      input: 'textarea',
      inputLabel: 'Enter your notes for this candidate',
      inputPlaceholder: 'Type your notes here...',
      showCancelButton: true,
      confirmButtonText: 'Save Notes',
      confirmButtonColor: '#4f46e5'
    }).then((result) => {
      if (result.isConfirmed) {
        Swal.fire('Saved!', 'Your notes have been saved locally.', 'success')
      }
    })
  }

  const handleSchedule = () => {
    setShowScheduleModal(true)
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
    onOpenChange(false)
    const linkId = c.link_id || candidate.link_id || c.id || candidate.id || c._id || candidate._id
    const basePath = window.location.pathname.startsWith('/superadmin') ? '/superadmin' : '/admin'
    navigate(`${basePath}/candidate/profile/${linkId}`, { state: { candidate: c } })
  }


  const tabs = ["overview", "resume", "interview", "evaluation", "timeline"]

  // Action handlers
  const handleReject = async () => {
    if (!window.confirm("Are you sure you want to reject this candidate?")) return
    const appId = c.link_id || candidate.link_id || c.id || candidate.id || c._id || candidate._id
    try {
      await axios.post(`${API_BASE_URL}/admin/update-decision`, {
        link_id: appId,
        decision: "rejected"
      }, { headers: { Authorization: `Bearer ${token}` } })
      onOpenChange(false)

      // Reload so the candidate is instantly removed from the current list
      window.location.reload()
    } catch (e) {
      console.error("Failed to reject", e)
    }
  }

  const handleQualify = async () => {
    if (!window.confirm("Are you sure you want to qualify this candidate?")) return
    const appId = c.link_id || candidate.link_id || c.id || candidate.id || c._id || candidate._id
    try {
      await axios.post(`${API_BASE_URL}/admin/update-decision`, {
        link_id: appId,
        decision: "selected"
      }, { headers: { Authorization: `Bearer ${token}` } })
      onOpenChange(false)

      // Reload so the candidate is instantly added to the qualified list
      window.location.reload()
    } catch (e) {
      console.error("Failed to qualify", e)
    }
  }



  const handleAddNote = async () => {
    if (!newNote.trim()) return
    setNotesSaving(true)
    const linkId = c.link_id || candidate.link_id || c.interview_id || candidate.interview_id || c.id || candidate.id || c._id || candidate._id
    try {
      const noteObj = {
        text: newNote,
        added_by: "Admin",
        added_at: new Date().toISOString()
      };

      const updatedNotes = [...(c.notes || []), noteObj]

      // Save to backend database
      await axios.post(`${API_BASE_URL}/admin/interview/${linkId}/notes`, { notes: updatedNotes }, {
        headers: { Authorization: `Bearer ${token}` }
      })

      setDetail(prev => ({
        ...prev,
        notes: updatedNotes
      }));
      setNewNote("");
    } catch (e) {
      console.error("Error adding note", e)
      Swal.fire('Error', 'Failed to save note to database', 'error')
    } finally {
      setNotesSaving(false)
    }
  }

  return (
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
                  {c.started_at && (
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100/50 px-2.5 py-1 rounded-md border border-slate-200/50">
                      <Calendar size={13} className="text-slate-400" /> Attended: {new Date(c.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                    </span>
                  )}
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
                  
                  {/* Alerts Column */}
                  <div className="flex items-start gap-3 sm:col-span-2 lg:col-span-4 mt-2 pt-4 border-t border-slate-100">
                    <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Proctoring Alerts</div>
                      {c.alerts && c.alerts.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {c.alerts.map((a, i) => (
                            <div key={i} className="text-sm font-semibold text-slate-700 bg-amber-50/50 border border-amber-100/50 rounded-md p-2 flex gap-2">
                              <span className="text-amber-500">•</span>
                              <span className="leading-tight">{a.message}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm font-semibold text-slate-500">None</div>
                      )}
                    </div>
                  </div>
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
              {/* Profile Text */}
              {resumeText && (
                <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <h3 className="text-sm font-black text-slate-800 mb-3">Resume / Profile Text</h3>
                  <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-4 whitespace-pre-wrap font-sans max-h-48 overflow-y-auto border border-slate-200">
                    {resumeText}
                  </pre>
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

              {/* Recordings */}
              <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                <h3 className="text-sm font-black text-slate-800 mb-4">Recordings</h3>
                <div className="grid sm:grid-cols-2 gap-4">
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
                      <video controls className="w-full rounded-lg border border-slate-200 bg-black max-h-48" src={recordingUrl}>
                        Your browser does not support video.
                      </video>
                    ) : (
                      <div className="h-28 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs font-medium text-slate-400">
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
                      <video controls className="w-full rounded-lg border border-slate-200 bg-black max-h-48" src={screenRecordingUrl}>
                        Your browser does not support video.
                      </video>
                    ) : (
                      <div className="h-28 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-200 text-xs font-medium text-slate-400">
                        No screen recording available
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Q&A Answers */}
              {c.answers && c.answers.length > 0 && (
                <section className="bg-white rounded-xl border border-slate-200/60 p-5 shadow-sm">
                  <h3 className="text-sm font-black text-slate-800 mb-4">Interview Q&A ({c.answers.length} questions)</h3>
                  <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                    {c.answers.map((a, idx) => (
                      <div key={idx} className="rounded-lg border border-slate-100 p-4 bg-slate-50">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-bold text-slate-700">Q{idx + 1}. {a.question_text}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            {Number(a.time_spent_seconds || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                <Clock size={11} /> {Math.floor(Number(a.time_spent_seconds) / 60) > 0 ? `${Math.floor(Number(a.time_spent_seconds) / 60)}m ${Number(a.time_spent_seconds) % 60}s` : `${Number(a.time_spent_seconds)}s`}
                              </span>
                            )}
                            {a.ai_score !== null && a.ai_score !== undefined && (
                              <span className={`text-xs font-black px-2 py-0.5 rounded-full ${a.ai_score >= 75 ? 'bg-emerald-100 text-emerald-700' : a.ai_score >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>
                                {Number(a.ai_score).toFixed(0)}%
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-600">{a.answer_text}</p>
                        {a.ai_feedback && (
                          <p className="mt-2 text-xs text-slate-500 italic border-t border-slate-200 pt-2">{a.ai_feedback}</p>
                        )}
                      </div>
                    ))}
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

        {/* ─ Notes Side Panel ─ */}
        {showNotes && (
          <div className="absolute top-[88px] right-0 bottom-[73px] w-80 bg-white border-l border-slate-200 shadow-xl flex flex-col z-10 animate-in slide-in-from-right-8 duration-200">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Candidate Notes</h3>
              <button onClick={() => setShowNotes(false)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(c.notes || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No notes added yet.</p>
              ) : (
                (c.notes || []).map((n, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.text}</p>
                    <div className="flex justify-between items-center mt-2 text-[10px] text-slate-400 font-medium">
                      <span>{n.added_by}</span>
                      <span>{new Date(n.added_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50">
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Type a note..."
                className="w-full text-sm rounded-xl border-slate-200 resize-none focus:ring-indigo-500 focus:border-indigo-500 mb-2 p-3 text-slate-800"
                rows={3}
              />
              <button
                onClick={handleAddNote}
                disabled={notesSaving || !newNote.trim()}
                className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors"
              >
                {notesSaving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Save Note
              </button>
            </div>
          </div>
        )}

        {/* ── Footer Actions ── */}
        <div className="border-t border-slate-200/80 p-4 bg-white flex flex-wrap items-center justify-end gap-3 shrink-0">
          <button onClick={() => setShowNotes(!showNotes)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold border rounded-xl transition-colors shadow-sm ${showNotes ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}>
            <MessageSquare size={16} /> Notes {(c.notes?.length > 0) && <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px] leading-none ml-1">{c.notes.length}</span>}
          </button>
          <button onClick={handleViewProfile} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm">
            <Eye size={16} /> View Profile
          </button>
          <div className="w-px h-6 bg-slate-200 mx-1" />
          {c.decision !== 'rejected' && (
            <button onClick={() => handleDecision('rejected')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl hover:bg-rose-100 transition-colors shadow-sm">
              <X size={16} strokeWidth={3} /> Reject
            </button>
          )}
          {c.decision !== 'selected' && c.decision !== 'hired' && (
            <button onClick={() => handleDecision('selected')} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-xl hover:bg-emerald-100 transition-colors shadow-sm">
              <Check size={16} strokeWidth={3} /> Select
            </button>
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
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        candidate={c}
      />
    </div>
  )
}
