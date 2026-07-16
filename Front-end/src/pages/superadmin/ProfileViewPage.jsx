import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useSelector } from 'react-redux'
import axios from 'axios'
import { 
  ArrowLeft, User, FileText, Loader2, Download, Phone, Mail, 
  MapPin, Award, CheckCircle2, XCircle, Clock, Calendar, 
  BarChart3, TrendingUp, Sparkles, Briefcase, Zap
} from 'lucide-react'

const ScoreBar = ({ label, score }) => {
  const numScore = Number(score) || 0
  const color = numScore >= 75 ? 'bg-emerald-500' : numScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-end mb-1.5">
        <span className="text-[13px] font-bold text-slate-600 tracking-wide">{label}</span>
        <span className="text-sm font-black text-slate-800">{numScore.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden relative">
        <div 
          className={`absolute top-0 left-0 h-full rounded-full ${color} transition-all duration-1000 ease-out shadow-sm`}
          style={{ width: `${numScore}%` }}
        />
      </div>
    </div>
  )
}

export default function ProfileViewPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [candidate, setCandidate] = useState(null)

  useEffect(() => {
    const passedCandidate = location.state?.candidate
    
    // If we have candidate data passed through route state, use it instantly!
    if (passedCandidate) {
      setCandidate(passedCandidate)
      setLoading(false)
      return
    }

    const fetchCandidate = async () => {
      if (!id || id.startsWith('ai_call_')) {
        setError("AI Call profiles must be accessed directly from the Dashboard. Please go back and select the candidate again.")
        setLoading(false)
        return
      }
      
      try {
        setLoading(true)
        const response = await axios.get(`${API_BASE_URL}/admin/interview/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setCandidate(response.data)
      } catch (err) {
        console.error("Error fetching candidate profile", err)
        setError("Failed to load candidate profile.")
      } finally {
        setLoading(false)
      }
    }
    fetchCandidate()
  }, [id, token, API_BASE_URL, location.state])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
          <p className="text-slate-500 font-medium animate-pulse">Loading amazing insights...</p>
        </div>
      </div>
    )
  }

  if (error || !candidate) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50 gap-5">
        <div className="text-rose-600 bg-rose-50/80 p-6 rounded-2xl border border-rose-100/50 shadow-sm font-medium flex items-center gap-3">
          <XCircle className="text-rose-500" />
          {error || "Candidate not found"}
        </div>
        <button onClick={() => navigate(-1)} className="px-6 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:shadow-sm flex items-center gap-2 font-semibold text-slate-700 transition-all">
          <ArrowLeft size={16} /> Go Back
        </button>
      </div>
    )
  }

  const cName = candidate.candidate_name || candidate.name || "Candidate"
  const cEmail = candidate.candidate_email || candidate.email || "No email provided"
  const cPhone = candidate.candidate_phone || candidate.phone || "No phone provided"
  const jobTitle = candidate.interview_title || candidate.job_applied || "Position"
  const resumeUrl = candidate.resume_url
  const resumeText = candidate.resume_text || candidate.profile_text || "No resume text available for this candidate."
  
  const score = Number(candidate.avg_score || candidate.score || 0)
  const isQualified = candidate.decision === 'selected' || candidate.decision === 'hired'
  const isRejected = candidate.decision === 'rejected'
  
  const scoreDetails = [
    { label: "Communication", val: candidate.communication_score },
    { label: "Technical Skills", val: candidate.skills_score },
    { label: "Competencies", val: candidate.competencies_score },
    { label: "Personality", val: candidate.personality_score },
    { label: "Culture Fit", val: candidate.culture_fit_score },
    { label: "Job Success", val: candidate.job_success_score },
  ].filter(s => s.val !== undefined && s.val !== null && s.val !== 0)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* ÔöÇÔöÇ Sticky Header ÔöÇÔöÇ */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 rounded-xl transition-all hover:shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-800 tracking-tight">{cName}</h1>
              {isQualified && <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />}
              {isRejected && <XCircle size={18} className="text-rose-500 shrink-0" />}
            </div>
            <p className="text-xs font-semibold text-slate-400 tracking-wider uppercase mt-0.5">ID: {id}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {resumeUrl && (
            <a 
              href={resumeUrl} 
              target="_blank" 
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 font-bold rounded-xl transition-all shadow-sm text-sm"
            >
              <Download size={16} /> Resume
            </a>
          )}
        </div>
      </header>

      {/* ÔöÇÔöÇ Main Content ÔöÇÔöÇ */}
      <main className="flex-1 p-6 md:p-8 max-w-6xl w-full mx-auto space-y-6">
        
        {/* Hero Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-8 text-white shadow-xl shadow-indigo-200/50">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">
            <Sparkles size={200} />
          </div>
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full backdrop-blur-md border border-white/20 mb-4">
                <Briefcase size={14} className="text-indigo-200" />
                <span className="text-xs font-bold text-indigo-50 tracking-wide">{jobTitle}</span>
              </div>
              <h2 className="text-4xl font-black tracking-tight mb-2">{cName}</h2>
              <div className="flex flex-wrap items-center gap-4 text-indigo-100 font-medium text-sm">
                <div className="flex items-center gap-1.5"><Mail size={16} className="text-indigo-300" /> {cEmail}</div>
                <div className="flex items-center gap-1.5"><Phone size={16} className="text-indigo-300" /> {cPhone}</div>
              </div>
            </div>
            
            <div className="shrink-0 flex items-center justify-center p-6 bg-white/10 rounded-3xl backdrop-blur-md border border-white/20">
              <div className="text-center">
                <div className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-1">AI Match Score</div>
                <div className="text-6xl font-black tracking-tighter flex items-start justify-center text-white">
                  {score.toFixed(0)}<span className="text-2xl mt-1 text-indigo-300">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ÔöÇÔöÇ Two Column Layout ÔöÇÔöÇ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column (Details) */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-slate-200/60">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-wider mb-5">
                <TrendingUp size={16} className="text-indigo-500" /> Score Breakdown
              </h3>
              {scoreDetails.length > 0 ? (
                <div className="space-y-4">
                  {scoreDetails.map((s, idx) => (
                    <ScoreBar key={idx} label={s.label} score={s.val} />
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-sm font-medium text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  Detailed scores not available
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-[var(--shadow-card)] border border-slate-200/60">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
                <BarChart3 size={16} className="text-indigo-500" /> Status
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-slate-100">
                  <span className="text-sm font-medium text-slate-500">Interview Status</span>
                  <span className="text-sm font-bold text-slate-800 capitalize">{candidate.status || 'Pending'}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-medium text-slate-500">Final Decision</span>
                  <span className={`text-sm font-bold capitalize ${isQualified ? 'text-emerald-600' : isRejected ? 'text-rose-600' : 'text-amber-600'}`}>
                    {candidate.decision || 'Awaiting Review'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Resume/Text) */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-[var(--shadow-card)] border border-slate-200/60 h-full flex flex-col">
              <div className="p-5 bg-slate-50/50 border-b border-slate-200/60 flex items-center gap-2 rounded-t-2xl">
                <FileText size={18} className="text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Profile Document</h3>
              </div>
              <div className="p-6 flex-1 bg-slate-50/20">
                <div className="bg-white border border-slate-200 rounded-xl p-6 h-[500px] overflow-y-auto shadow-inner">
                  <pre className="whitespace-pre-wrap font-sans text-slate-600 leading-relaxed text-sm">
                    {resumeText}
                  </pre>
                </div>
              </div>
            </div>
          </div>
          
        </div>
      </main>
    </div>
  )
}
