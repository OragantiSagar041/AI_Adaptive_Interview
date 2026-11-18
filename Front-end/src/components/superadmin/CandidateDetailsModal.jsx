import React, { useMemo, useState } from 'react';
import {
  X, Briefcase, MapPin, Calendar, User, Mail, Phone, ExternalLink,
  CheckCircle2, AlertCircle, FileText, Check, Award, GraduationCap,
  Clock, Building2, Sparkles, ChevronDown, ChevronUp, ArrowRight
} from 'lucide-react';
import {
  evaluateCandidateMatch,
  getMatchCategory,
  formatCandidateId
} from '../../utils/candidateMatcher';

function displayValue(val) {
  if (!val || val === 'Not specified' || val === '—' || String(val).trim() === '') {
    return 'Not available';
  }
  return val;
}

export default function CandidateDetailsModal({
  isOpen,
  onClose,
  candidate,
  job,
  onScheduleInterview,
  onViewResume,
}) {
  const [showFullResumeText, setShowFullResumeText] = useState(false);

  // Evaluate candidate match details strictly from resume and job requirements
  const matchData = useMemo(() => {
    if (!candidate || !job) return null;
    return evaluateCandidateMatch(candidate, job);
  }, [candidate, job]);

  if (!isOpen || !candidate || !job || !matchData) return null;

  const jobTitle = job.title || 'Position';
  const jobCode = job.job_id || 'JOB-001';

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[120] flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal Header ──────────────────────────────────────────────── */}
        <div className="px-6 sm:px-8 py-5 border-b border-border flex items-center justify-between bg-card shrink-0 gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/25">
              {(matchData.name || '?')[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl font-black text-foreground tracking-tight truncate">
                  {matchData.name}
                </h2>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {matchData.candidateId}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-wider border ${matchData.matchCategory.badgeClass}`}>
                  {matchData.overallScore !== null ? `${matchData.overallScore}%` : 'Not available'} {matchData.matchCategory.label}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Resume-to-Job Match
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium flex-wrap">
                <span>Applied for <strong className="text-foreground">{jobTitle}</strong></span>
                <span>•</span>
                <span className="font-mono">{jobCode}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-teal-500" /> {job.location || 'Remote'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2.5 rounded-xl bg-secondary hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border cursor-pointer transition-colors"
            title="Close Details"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Modal Body (Scrollable Cards Grid) ─────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-7 space-y-6 bg-background custom-scrollbar">
          
          {/* Card 1: Resume Match Overview & Scoring Progress Bars */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
                  Resume-to-Job Match Breakdown
                </h3>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground font-bold">Resume Fit:</span>
                <span className={`text-lg font-black ${matchData.matchCategory.colorClass}`}>
                  {matchData.overallScore !== null ? `${matchData.overallScore}%` : 'Not available'}
                </span>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed mb-5 bg-secondary/40 p-3.5 rounded-xl border border-border">
              {matchData.summary} Resume match scores are evaluated directly from the candidate's resume text and declared profile against this specific job's requirements, independent of interview history.
            </p>

            {/* Horizontal Progress Bars */}
            <div className="grid sm:grid-cols-2 gap-4">
              {/* Mandatory Skills Alignment */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-foreground">Mandatory Skills Alignment</span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400">{matchData.breakdown.skillsScore}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-600 rounded-full transition-all duration-700"
                    style={{ width: `${matchData.breakdown.skillsScore}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {matchData.skillsAlignment.matchRatio} mandatory skills verified in resume
                </span>
              </div>

              {/* Experience Match */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-foreground">Experience Alignment</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{matchData.breakdown.experienceScore}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${matchData.breakdown.experienceScore}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  Candidate: {displayValue(matchData.experience)} vs Req: {job.experience || 'Not specified'}
                </span>
              </div>

              {/* Role Relevance */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-foreground">Role & Responsibility Relevance</span>
                  <span className="font-extrabold text-purple-600 dark:text-purple-400">{matchData.breakdown.roleScore}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-700"
                    style={{ width: `${matchData.breakdown.roleScore}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block truncate">
                  JD alignment with {jobTitle}
                </span>
              </div>

              {/* Location & Work Mode */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-bold text-foreground">Location & Work Mode</span>
                  <span className="font-extrabold text-teal-600 dark:text-teal-400">{matchData.breakdown.locationScore}%</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-700"
                    style={{ width: `${matchData.breakdown.locationScore}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground mt-1 block">
                  {job.workMode || 'Full-time'} ({job.location || 'Remote'})
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Mandatory & Preferred Skills Analysis */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
                Skills Analysis
              </h3>
              <span className="text-xs font-bold text-muted-foreground">
                {matchData.skillsAlignment.matchedSkills.length} of {matchData.skillsAlignment.mandatorySkills?.length || matchData.skillsAlignment.requiredSkills.length} Mandatory Matched
              </span>
            </div>

            {/* Mandatory Required Skills */}
            <div>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                Mandatory Job Requirements ({matchData.skillsAlignment.mandatorySkills?.length || matchData.skillsAlignment.requiredSkills.length})
              </span>
              <div className="flex flex-wrap gap-2">
                {(matchData.skillsAlignment.mandatorySkills || matchData.skillsAlignment.requiredSkills).length > 0 ? (
                  (matchData.skillsAlignment.mandatorySkills || matchData.skillsAlignment.requiredSkills).map(s => {
                    const isMatched = matchData.skillsAlignment.matchedSkills.includes(s);
                    return (
                      <span
                        key={s}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          isMatched
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                        }`}
                      >
                        {isMatched ? (
                          <Check size={12} strokeWidth={3} className="text-emerald-600" />
                        ) : (
                          <X size={12} strokeWidth={2.5} className="text-rose-500" />
                        )}
                        {s}
                      </span>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground italic">No mandatory skills specified on the job profile.</p>
                )}
              </div>
            </div>

            {/* Preferred Skills (if any) */}
            {matchData.skillsAlignment.preferredSkills && matchData.skillsAlignment.preferredSkills.length > 0 && (
              <div className="pt-3 border-t border-border">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Preferred / Bonus Skills ({matchData.skillsAlignment.preferredSkills.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {matchData.skillsAlignment.preferredSkills.map(s => {
                    const isMatched = matchData.skillsAlignment.matchedPreferredSkills?.includes(s);
                    return (
                      <span
                        key={s}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                          isMatched
                            ? 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                            : 'bg-secondary text-muted-foreground border-border'
                        }`}
                      >
                        {isMatched ? (
                          <Check size={12} strokeWidth={3} className="text-indigo-600" />
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-700" />
                        )}
                        {s}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Additional Candidate Skills */}
            {matchData.skillsAlignment.additionalSkills.length > 0 && (
              <div className="pt-3 border-t border-border">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                  Additional Resume Skills ({matchData.skillsAlignment.additionalSkills.length})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {matchData.skillsAlignment.additionalSkills.map(s => (
                    <span
                      key={s}
                      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-secondary text-foreground border border-border"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Candidate Background & Criteria */}
          <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-3">
              Candidate Background & Qualifications
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Relevant Experience
                </span>
                <span className="text-xs font-bold text-foreground mt-0.5 block">
                  {displayValue(matchData.experience)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Education / Degree
                </span>
                <span className="text-xs font-bold text-foreground mt-0.5 block truncate" title={matchData.education}>
                  {displayValue(matchData.education)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Location
                </span>
                <span className="text-xs font-bold text-foreground mt-0.5 block truncate" title={matchData.location}>
                  {displayValue(matchData.location)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Current Company
                </span>
                <span className="text-xs font-bold text-foreground mt-0.5 block truncate" title={matchData.currentCompany}>
                  {displayValue(matchData.currentCompany)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Notice Period
                </span>
                <span className="text-xs font-bold text-foreground mt-0.5 block truncate">
                  {displayValue(matchData.noticePeriod)}
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900/40 rounded-xl border border-border">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                  Application Date
                </span>
                <span className="text-xs font-bold text-foreground mt-0.5 block truncate">
                  {matchData.appliedAt
                    ? new Date(matchData.appliedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Not available'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Contact & Strengths */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Contact details */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Candidate Contact
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <Mail size={13} className="text-indigo-500 shrink-0" />
                  <a href={`mailto:${matchData.email}`} className="font-semibold text-foreground hover:underline truncate">
                    {displayValue(matchData.email)}
                  </a>
                </div>
                {matchData.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={13} className="text-teal-500 shrink-0" />
                    <a href={`tel:${matchData.phone}`} className="font-semibold text-foreground hover:underline">
                      {displayValue(matchData.phone)}
                    </a>
                  </div>
                )}
                {matchData.linkedinUrl && (
                  <div className="flex items-center gap-2 pt-1">
                    <ExternalLink size={13} className="text-indigo-500 shrink-0" />
                    <a href={matchData.linkedinUrl} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">
                      LinkedIn Profile
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Strengths & Missing Gaps */}
            <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground border-b border-border pb-2">
                Resume Evidence & Identified Gaps
              </h4>
              <div className="space-y-2 text-xs">
                {matchData.strengths.slice(0, 2).map((str, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-foreground leading-tight">{str}</span>
                  </div>
                ))}
                {matchData.missingRequirements.slice(0, 2).map((gap, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <AlertCircle size={13} className="text-rose-500 mt-0.5 shrink-0" />
                    <span className="text-rose-700 dark:text-rose-300 leading-tight">{gap}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card 5: Resume Extract preview (if resume_text exists) */}
          {matchData.resumeText && (
            <div className="bg-card border border-border rounded-2xl p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-indigo-500" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-foreground">
                    Extracted Resume Content
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFullResumeText(prev => !prev)}
                  className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 cursor-pointer bg-transparent border-none"
                >
                  {showFullResumeText ? <>Less <ChevronUp size={12} /></> : <>Expand <ChevronDown size={12} /></>}
                </button>
              </div>

              <pre className={`whitespace-pre-wrap font-sans text-xs text-muted-foreground bg-secondary/40 p-4 rounded-xl border border-border leading-relaxed overflow-y-auto ${
                showFullResumeText ? 'max-h-80' : 'max-h-32'
              }`}>
                {matchData.resumeText}
              </pre>
            </div>
          )}

        </div>

        {/* ── Modal Footer ──────────────────────────────────────────────── */}
        <div className="px-6 sm:px-8 py-4 border-t border-border flex items-center justify-between bg-card shrink-0 gap-3 flex-wrap">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-secondary hover:bg-muted text-foreground font-bold text-xs border border-border cursor-pointer transition-colors"
          >
            Close
          </button>

          <div className="flex items-center gap-3">
            {(matchData.resumeUrl || matchData.resumeText) && onViewResume && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewResume(candidate);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-secondary hover:bg-muted text-foreground text-xs font-bold rounded-xl border border-border transition-colors cursor-pointer"
              >
                <FileText size={13} /> View Resume Document
              </button>
            )}

            {onScheduleInterview && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onScheduleInterview(candidate);
                }}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-extrabold rounded-xl shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] active:scale-95 cursor-pointer border-none"
              >
                <Calendar size={14} /> Schedule Interview <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
