import React, { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  X, Briefcase, MapPin, User, Calendar, Clock, Sparkles, CheckCircle2,
  XCircle, Ban, Hourglass, Search, ChevronRight, ChevronDown, ChevronUp, ArrowRight, ShieldCheck,
  Eye, FileText, ExternalLink, Award, Layers, Loader2, AlertCircle, RotateCcw
} from 'lucide-react'
import Swal from 'sweetalert2'

// ─── Job Title Extraction & Sanitization Helper ──────────────────────────────
export function extractJobTitle(raw) {
  if (!raw || typeof raw !== 'string') return 'Candidate'
  const trimmed = raw.trim()
  if (!trimmed) return 'Candidate'

  // Already a clean, short single-line title
  if (trimmed.length <= 60 && !trimmed.includes('\n') && !trimmed.startsWith('#')) {
    return trimmed
  }

  // Common markdown / label patterns: "**Job Title:** Data Science Engineer – Fresher"
  const titleMatch = trimmed.match(/(?:\*\*Job Title:\*\*|Job Title:|Role:|Position:)\s*([^\n*#]+)/i)
  if (titleMatch && titleMatch[1]?.trim()) {
    const t = titleMatch[1].replace(/[–—]/g, '-').replace(/\*+/g, '').trim()
    if (t) return t
  }

  // Heading pattern: "# Job Description: Data Science Engineer (Fresher)"
  const jdHeadingMatch = trimmed.match(/#+\s*(?:Job Description|Job Role|Role)?[:\s\-]*([^\n*#]+)/i)
  if (jdHeadingMatch && jdHeadingMatch[1]?.trim()) {
    const t = jdHeadingMatch[1].replace(/[–—]/g, '-').replace(/\*+/g, '').trim()
    if (t && t.length <= 60) return t
  }

  // First non-empty line without markdown syntax
  const firstLine = trimmed.split('\n')[0].replace(/^[#* \t-]+/, '').replace(/[*#]+$/, '').trim()
  if (firstLine && firstLine.length <= 60) {
    return firstLine
  }

  return firstLine ? `${firstLine.slice(0, 48)}...` : 'Candidate'
}

// ─── Status Badge Helper ─────────────────────────────────────────────────────
export function getInterviewStatusBadge(item) {
  if (!item) {
    return {
      label: 'Pending',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
      headerClassName: 'bg-amber-500 text-white'
    }
  }

  // 1. Ignored / No-show: explicit ignore flags or ignored status
  const isIgnored = Boolean(item.is_ignored) || Boolean(item.ignored) || Boolean(item.ignored_at) || ['ignored', 'no_show', 'no-show'].includes((item.status || '').toLowerCase()) || item.decision === 'ignored'
  if (isIgnored) {
    return {
      label: 'Ignored / No-show',
      className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      headerClassName: 'bg-rose-600 text-white'
    }
  }

  // Normalize AI score
  let numScore = null
  if (item.ai_score !== null && item.ai_score !== undefined && !Number.isNaN(Number(item.ai_score))) {
    const raw = Number(item.ai_score)
    numScore = (raw > 0 && raw <= 1) ? raw * 100 : raw
  }

  // 2. Selected: explicit decision is selected or hired by recruiter/admin
  const isExplicitSelected = item.decision === 'selected' || item.decision === 'hired' || Boolean(item.is_selected)
  if (isExplicitSelected) {
    return {
      label: 'Selected',
      className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800',
      headerClassName: 'bg-emerald-500 text-white'
    }
  }

  // 3. Rejected: explicit rejection made by recruiter/admin
  const isExplicitRejected = Boolean(item.is_rejected) || item.decision === 'rejected' || Boolean(item.rejected_by)
  if (isExplicitRejected) {
    return {
      label: 'Rejected',
      className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
      headerClassName: 'bg-rose-500 text-white'
    }
  }

  // 4. Pending: in progress, scheduled, completed awaiting decision, or pending recruiter action
  return {
    label: 'Pending',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
    headerClassName: 'bg-amber-500 text-white'
  }
}

// ─── Score Badge Helper ──────────────────────────────────────────────────────
function ScoreMatchBadge({ score }) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 whitespace-nowrap">
        No AI Score Available
      </span>
    )
  }

  const rawNum = Number(score)
  const num = (rawNum > 0 && rawNum <= 1) ? rawNum * 100 : rawNum
  const scoreText = `${num.toFixed(0)}%`

  let colorClass = 'text-rose-600 dark:text-rose-400'
  let badgeClass = 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800'

  if (num >= 85) {
    colorClass = 'text-emerald-600 dark:text-emerald-400'
    badgeClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
  } else if (num >= 60) {
    colorClass = 'text-blue-600 dark:text-blue-400'
    badgeClass = 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className={`text-sm font-black ${colorClass}`}>{scoreText}</span>
      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${badgeClass}`}>
        AI SCORE
      </span>
    </div>
  )
}

// ─── Clean Markdown Helper ───────────────────────────────────────────────────
export function cleanMarkdown(str) {
  if (!str) return ''
  return str
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[–—]/g, '-')
    .replace(/[ \t]+/g, ' ')
    .trim()
}

// ─── Structured Job Description Parser ──────────────────────────────────────
export function parseJobDescription(raw) {
  if (!raw || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  const lines = trimmed.split(/\r?\n/)
  let title = ''
  const meta = []
  const sections = []
  let currentSection = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim()
    if (!rawLine) continue

    // 1. Title Heading: "# Job Description: ..." or "# Role: ..."
    if (/^#\s+/.test(rawLine) && !title) {
      title = cleanMarkdown(rawLine.replace(/^#\s*(Job Description:?|Job Role:?|Position:?)?\s*/i, ''))
      continue
    }

    // 2. Section Heading: "## Heading" or "### Heading"
    if (/^#{2,4}\s+/.test(rawLine)) {
      const heading = cleanMarkdown(rawLine.replace(/^#{2,4}\s+/, ''))
      currentSection = { heading, blocks: [] }
      sections.push(currentSection)
      continue
    }

    // 3. Metadata Key-Value pairs: "**Job Title:** Value" or "Experience: Value"
    const kvBoldMatch = rawLine.match(/^\*\*([^*:]+):\*\*\s*(.+)$/)
    const kvPlainMatch = !currentSection && rawLine.match(/^([A-Za-z /&-]{2,30}):\s*(.+)$/)
    const kvMatch = kvBoldMatch || kvPlainMatch

    if (kvMatch && !currentSection) {
      const label = cleanMarkdown(kvMatch[1])
      const value = cleanMarkdown(kvMatch[2])
      if (label && value) {
        meta.push({ label, value })
        continue
      }
    }

    // Ensure a current section exists
    if (!currentSection) {
      currentSection = { heading: '', blocks: [] }
      sections.push(currentSection)
    }

    // 4. Bullet list items: "- Item", "* Item", "• Item", "1. Item"
    const bulletMatch = rawLine.match(/^([-*•]|\d+\.)\s+(.+)$/)
    if (bulletMatch) {
      const bulletText = cleanMarkdown(bulletMatch[2])
      if (bulletText) {
        const lastBlock = currentSection.blocks[currentSection.blocks.length - 1]
        if (lastBlock && lastBlock.type === 'list') {
          lastBlock.items.push(bulletText)
        } else {
          currentSection.blocks.push({ type: 'list', items: [bulletText] })
        }
      }
      continue
    }

    // 5. Plain paragraph text
    const cleanText = cleanMarkdown(rawLine)
    if (cleanText) {
      currentSection.blocks.push({ type: 'paragraph', text: cleanText })
    }
  }

  return { title, meta, sections }
}

// ─── Formatted Job Description Component ────────────────────────────────────
export function FormattedJobDescription({ content }) {
  const [isExpanded, setIsExpanded] = useState(false)

  const parsed = useMemo(() => {
    return parseJobDescription(content)
  }, [content])

  if (!content || !content.trim()) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 italic py-1">
        Job description not specified for this session.
      </p>
    )
  }

  if (!parsed || (parsed.sections.length === 0 && parsed.meta.length === 0)) {
    return (
      <div className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-line select-text">
        {cleanMarkdown(content)}
      </div>
    )
  }

  const isLong = (content.length > 450) || parsed.sections.length > 2 || parsed.meta.length > 3

  return (
    <div className="space-y-3 select-text">
      <div
        className={`transition-all duration-200 overflow-y-auto pr-1.5 custom-scrollbar ${
          isExpanded ? 'max-h-[520px]' : 'max-h-60'
        }`}
        style={{ scrollbarWidth: 'thin' }}
      >
        {/* Title if extracted */}
        {parsed.title && (
          <div className="pb-2 mb-2.5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
              {parsed.title}
            </h3>
          </div>
        )}

        {/* Key-Value Meta Grid (Job Title, Experience, Employment Type, Department, Qualification) */}
        {parsed.meta.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 mb-3 shadow-2xs">
            {parsed.meta.map((m, idx) => (
              <div key={idx} className="flex flex-col">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">
                  {m.label}
                </span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {m.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Structured Sections */}
        <div className="space-y-3">
          {parsed.sections.map((sec, secIdx) => (
            <div key={secIdx} className="space-y-1.5">
              {sec.heading && (
                <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 first:border-0 first:pt-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 inline-block"></span>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    {sec.heading}
                  </h4>
                </div>
              )}

              {sec.blocks.map((block, bIdx) => {
                if (block.type === 'list') {
                  return (
                    <ul key={bIdx} className="space-y-1 pl-1">
                      {block.items.map((item, itemIdx) => (
                        <li key={itemIdx} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          <span className="text-indigo-500 dark:text-indigo-400 font-bold select-none mt-0.5 leading-none">•</span>
                          <span className="flex-1">{item}</span>
                        </li>
                      ))}
                    </ul>
                  )
                }
                return (
                  <p key={bIdx} className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                    {block.text}
                  </p>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Expand / Collapse toggle button if content is long */}
      {isLong && (
        <div className="pt-2 flex items-center justify-between border-t border-slate-200 dark:border-slate-800/80">
          <span className="text-[10px] font-semibold text-slate-400">
            {isExpanded ? 'Showing full description' : 'Scroll or expand to view more'}
          </span>
          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            {isExpanded ? (
              <>
                <span>View Less</span>
                <ChevronUp size={13} />
              </>
            ) : (
              <>
                <span>View Full Description</span>
                <ChevronDown size={13} />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Modal 2: Interview Details Modal (Screenshot 3 Design) ─────────────────
export function InterviewDetailsModal({ interview, candidate, isOpen, onClose }) {
  if (!isOpen || !interview) return null

  const candDet = interview.candidate_details || candidate || {}
  const statusBadge = getInterviewStatusBadge(interview)
  const isRej = statusBadge.label === 'Rejected'
  const isSelected = statusBadge.label === 'Selected'
  const isIgnored = statusBadge.label === 'Ignored / No-show'

  const jobDescriptionText = (
    interview.job_description ||
    candidate?.job_description ||
    (typeof interview.job_role === 'string' && interview.job_role.length > 70 ? interview.job_role : '') ||
    (typeof candidate?.job_role === 'string' && candidate.job_role.length > 70 ? candidate.job_role : '') ||
    ''
  ).trim()

  let dateFormatted = 'N/A'
  if (interview.interview_date) {
    try {
      dateFormatted = new Date(interview.interview_date).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    } catch {
      dateFormatted = String(interview.interview_date)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/75 backdrop-blur-sm p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden my-auto transition-all">
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-black tracking-tight">{extractJobTitle(interview.job_role) || 'Job Role'}</h2>
              <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                {interview.job_code || (interview.link_id ? `REQ${interview.link_id.slice(0, 6).toUpperCase()}` : 'REQ001')}
              </span>
              <span className="text-sm font-semibold text-slate-300">{interview.company_name || 'HireIQ'}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider ${statusBadge.headerClassName}`}>
                {statusBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              Detailed historical session breakdown for {candDet.name || 'Candidate'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* 4 Structured Cards Grid */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[75vh] overflow-y-auto bg-slate-50/50 dark:bg-slate-950/40">
          {/* Card 1: Core Details */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Briefcase size={15} />
              Core Details
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Job / Interview Code</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 font-mono mt-0.5 block truncate">
                  {interview.job_code || (interview.link_id ? `REQ${interview.link_id.slice(0, 6).toUpperCase()}` : 'REQ001')}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Client / Company Name</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {interview.company_name || 'HireIQ'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Role / Position</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate" title={extractJobTitle(interview.job_role)}>
                  {extractJobTitle(interview.job_role) || 'Job Role Not Specified'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Job Type</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {interview.job_type || 'Full-Time'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Location</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {interview.location || candDet.location || 'Remote'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Interview Mode</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 mt-0.5 block truncate">
                  {interview.interview_mode || 'Standard'}
                </span>
              </div>
              {/* Job Description (Full Width) */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl col-span-2 border border-slate-100 dark:border-slate-800/80">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={12} className="text-indigo-500" />
                    Job Description
                  </span>
                </div>
                <FormattedJobDescription content={jobDescriptionText} />
              </div>
            </div>
          </div>

          {/* Card 2: Candidate Details */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-2">
              <User size={15} />
              Candidate Details
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Candidate Name</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {candDet.name || 'Candidate'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Experience</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {candDet.experience || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Relevant Experience</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {interview.relevant_experience || candDet.experience || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Qualification</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {interview.qualification || candDet.qualification || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg col-span-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Mandatory / Candidate Skills</span>
                <span className="font-medium text-slate-700 dark:text-slate-200 mt-0.5 block line-clamp-2">
                  {interview.mandatory_skills || interview.interviewed_skills || 'Technical'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Compensation & Recruiter Assignment */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Calendar size={15} />
              Recruiter & Timeline
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Assigned Recruiter</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {interview.recruiter_name || 'Admin'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Interview Date & Time</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {dateFormatted}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Current CTC / Budget</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {candDet.current_ctc || interview.salary_budget || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Expected CTC / Monthly</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {candDet.expected_ctc || interview.monthly_salary || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Notice Period</span>
                <span className="font-bold text-slate-800 dark:text-slate-100 mt-0.5 block truncate">
                  {candDet.notice_period || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Interview Session ID</span>
                <span className="font-mono text-[10px] text-slate-600 dark:text-slate-300 mt-0.5 block truncate" title={interview.link_id}>
                  {interview.link_id || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Card 4: Evaluation, Scores & Rejection Reason */}
          <div className="bg-white dark:bg-slate-900 rounded-xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400 border-b border-slate-100 dark:border-slate-800 pb-2">
              <Award size={15} />
              Evaluation & Decision
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Interview Status</span>
                </div>
                <div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Interview Score</span>
                </div>
                <div>
                  <ScoreMatchBadge score={interview.ai_score} />
                </div>
              </div>

              {isRej ? (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-3.5 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-rose-700 dark:text-rose-400 uppercase tracking-wider">
                    <AlertCircle size={14} />
                    Rejection Reason
                  </div>
                  <p className="text-xs font-semibold text-rose-800 dark:text-rose-200 leading-relaxed">
                    {interview.rejection_reason && interview.rejection_reason.trim()
                      ? interview.rejection_reason
                      : 'Candidate evaluation did not meet required passing criteria for this role.'}
                  </p>
                  {(interview.rejected_by || interview.rejected_at) && (
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 pt-1">
                      {interview.rejected_by ? `By: ${interview.rejected_by}` : ''}
                      {interview.rejected_by && interview.rejected_at ? ' • ' : ''}
                      {interview.rejected_at ? new Date(interview.rejected_at).toLocaleString() : ''}
                    </div>
                  )}
                </div>
              ) : isSelected ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  Candidate completed evaluation and was selected for this role.
                </div>
              ) : isIgnored ? (
                <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl p-3 text-xs font-semibold text-rose-800 dark:text-rose-200 flex items-center gap-2">
                  <Ban size={16} className="text-rose-600 shrink-0" />
                  Candidate was marked as Ignored / No-show.
                </div>
              ) : (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-xl p-3 text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <Hourglass size={16} className="text-amber-600 shrink-0" />
                  Interview evaluation or final selection decision is currently pending.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Modal 1: Matching Jobs / Previous Interview History (Screenshot 2 Design) ──
export default function PreviousInterviewsModal({
  isOpen,
  onClose,
  candidate,
  history = [],
  summary = null,
  loading = false,
  error = null,
  onProceedInterview = null,
  onIgnoreCandidate = null,
  onRestoreCandidate = null
}) {
  const navigate = useNavigate()
  const [localHistory, setLocalHistory] = useState(history)
  const [localSummary, setLocalSummary] = useState(summary)
  const [isIgnoring, setIsIgnoring] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [domainFilter, setDomainFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selectedInterviewForDetails, setSelectedInterviewForDetails] = useState(null)

  useEffect(() => {
    setLocalHistory(history)
  }, [history])

  useEffect(() => {
    setLocalSummary(summary)
  }, [summary])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, statusFilter, domainFilter, isOpen])

  const targetSession = localHistory.find(h => h.is_current) || localHistory[0]

  const candName = candidate?.candidate_name || candidate?.name || targetSession?.candidate_details?.name || 'Candidate'
  const candEmail = candidate?.candidate_email || candidate?.email || targetSession?.candidate_details?.email || ''
  const candPhone = candidate?.candidate_phone || candidate?.phone || targetSession?.candidate_details?.phone || ''
  const candId = candidate?.candidate_id || candidate?.id || candidate?.candidate_code || targetSession?.candidate_id || targetSession?.candidate_details?.candidate_id || (localHistory.find(h => h.candidate_id)?.candidate_id) || 'CAND-0001'

  // Extract raw candidate role / job description text
  const rawRoleCandidate = candidate?.interview_title || candidate?.job_applied || candidate?.job_role || targetSession?.job_role || ''
  const rawJobDesc = targetSession?.job_description || candidate?.job_description || (typeof rawRoleCandidate === 'string' && rawRoleCandidate.length > 70 ? rawRoleCandidate : '') || (localHistory.find(h => h.job_description && h.job_description.length > 20)?.job_description) || ''

  const cleanJobTitle = useMemo(() => {
    if (rawRoleCandidate && typeof rawRoleCandidate === 'string' && rawRoleCandidate.length <= 60 && !rawRoleCandidate.includes('\n') && !rawRoleCandidate.startsWith('#')) {
      return rawRoleCandidate.trim()
    }
    return extractJobTitle(rawRoleCandidate || rawJobDesc || 'Candidate')
  }, [rawRoleCandidate, rawJobDesc])

  const jobDescriptionText = useMemo(() => {
    if (!rawJobDesc || typeof rawJobDesc !== 'string') return ''
    return rawJobDesc.trim()
  }, [rawJobDesc])

  const hasJobDescription = Boolean(jobDescriptionText && jobDescriptionText.length > 15)

  // Resolve genuine candidate skills and reject placeholder strings like 'General', 'Technical', 'Normal'
  const isGenericSkill = (val) => {
    if (!val || typeof val !== 'string') return true
    const s = val.trim().toLowerCase()
    return ['general', 'technical', 'normal', 'non-technical', 'n/a', 'none', 'not specified'].includes(s)
  }

  let candSkills = ''
  if (!isGenericSkill(candidate?.skills)) {
    candSkills = candidate.skills
  } else if (!isGenericSkill(candidate?.mandatory_skills)) {
    candSkills = candidate.mandatory_skills
  } else if (!isGenericSkill(targetSession?.mandatory_skills)) {
    candSkills = targetSession.mandatory_skills
  } else if (!isGenericSkill(targetSession?.skills)) {
    candSkills = targetSession.skills
  } else {
    // Check if any historical session has genuine skills
    const sessionWithSkills = localHistory.find(h => !isGenericSkill(h.mandatory_skills) || !isGenericSkill(h.skills))
    if (sessionWithSkills) {
      candSkills = !isGenericSkill(sessionWithSkills.mandatory_skills) ? sessionWithSkills.mandatory_skills : sessionWithSkills.skills
    }
  }

  // Status counts across candidate history: Selected, Rejected, Pending, Ignored / No-show
  const statusCounts = useMemo(() => {
    let all = localHistory.length
    let selected = 0
    let rejected = 0
    let pending = 0
    let ignored = 0

    localHistory.forEach(item => {
      const badge = getInterviewStatusBadge(item)
      if (badge.label === 'Ignored / No-show') ignored++
      else if (badge.label === 'Selected') selected++
      else if (badge.label === 'Rejected') rejected++
      else pending++
    })

    return { all, selected, rejected, pending, ignored }
  }, [localHistory])

  const statusTabs = [
    { id: 'all', label: 'All', count: statusCounts.all },
    { id: 'selected', label: 'Selected', count: statusCounts.selected },
    { id: 'rejected', label: 'Rejected', count: statusCounts.rejected },
    { id: 'pending', label: 'Pending', count: statusCounts.pending },
    { id: 'ignored', label: 'Ignored / No-show', count: statusCounts.ignored },
  ]

  // Filter and search
  const filteredHistory = localHistory.filter(item => {
    if (statusFilter !== 'all') {
      const badge = getInterviewStatusBadge(item)
      if (statusFilter === 'selected' && badge.label !== 'Selected') return false
      if (statusFilter === 'rejected' && badge.label !== 'Rejected') return false
      if (statusFilter === 'pending' && badge.label !== 'Pending') return false
      if (statusFilter === 'ignored' && badge.label !== 'Ignored / No-show') return false
    }

    if (domainFilter !== 'all') {
      const dom = (item.interviewed_skills || 'Technical').trim().toLowerCase()
      if (dom !== domainFilter.trim().toLowerCase()) return false
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase()
      const role = (item.job_role || '').toLowerCase()
      const comp = (item.company_name || '').toLowerCase()
      const rec = (item.recruiter_name || '').toLowerCase()
      const linkId = (item.link_id || '').toLowerCase()
      const code = (item.job_code || '').toLowerCase()
      const rej = (item.rejection_reason || '').toLowerCase()

      if (!role.includes(q) && !comp.includes(q) && !rec.includes(q) && !linkId.includes(q) && !code.includes(q) && !rej.includes(q)) {
        return false
      }
    }

    return true
  })

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize))
  const paginatedHistory = filteredHistory.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  // Target candidate session for ignore action
  const isTargetAlreadyIgnored = Boolean(
    targetSession?.is_ignored ||
    (targetSession?.status || '').toLowerCase() === 'ignored' ||
    (targetSession?.decision || '').toLowerCase() === 'ignored'
  )

  const isIgnoringRef = useRef(false)
  const isRestoringRef = useRef(false)

  // Handlers
  const handleIgnore = async () => {
    if (isIgnoring || isIgnoringRef.current || isTargetAlreadyIgnored) return

    const cleanEmail = (candidate?.candidate_email || candidate?.email || candEmail || '').trim().toLowerCase()
    if (!cleanEmail) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: 'Candidate email not found.',
        showConfirmButton: false,
        timer: 3000
      })
      return
    }

    isIgnoringRef.current = true
    setIsIgnoring(true)
    try {
      const token = localStorage.getItem('superadminToken') || localStorage.getItem('adminToken')
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

      const response = await axios.post(
        `${API_BASE_URL}/admin/candidate/ignore`,
        {
          email: cleanEmail,
          reason: 'Candidate ignored from previous interview history'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )

      if (response.data && response.data.status === 'success') {
        const newRecord = response.data.record
        const newLinkId = response.data.link_id || newRecord?.link_id
        const isDuplicate = Boolean(response.data.is_duplicate)

        // 1. Immediately prepend the new ignore record to local history so it shows at the top
        if (newRecord) {
          setLocalHistory(prevList => {
            if (prevList.some(item => item.link_id === newLinkId)) {
              return prevList
            }
            return [newRecord, ...prevList]
          })
        }

        // 2. Immediately update local summary
        setLocalSummary(prev => {
          if (!prev) return prev
          return {
            ...prev,
            total: (prev.total || 0) + (isDuplicate ? 0 : 1),
            ignored_noshow: (prev.ignored_noshow || 0) + (isDuplicate ? 0 : 1)
          }
        })

        // 3. Notify parent component with new record
        if (onIgnoreCandidate) {
          onIgnoreCandidate({
            email: cleanEmail,
            link_id: newLinkId,
            newRecord: newRecord
          })
        }

        // 4. Show success toast notification
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Candidate marked as Ignored / No-show. Record created.`,
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        })

        // 5. Automatically close modal as requested
        onClose()
      } else {
        throw new Error(response.data?.message || 'Failed to update candidate status on server.')
      }
    } catch (err) {
      console.error('Error ignoring candidate:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to update candidate status. Please try again.'
      Swal.fire({
        icon: 'error',
        title: 'Ignore Candidate Failed',
        text: errorMsg,
        confirmButtonColor: '#6366f1'
      })
    } finally {
      setIsIgnoring(false)
      isIgnoringRef.current = false
    }
  }

  const handleRestore = async () => {
    if (isRestoring || isRestoringRef.current || !isTargetAlreadyIgnored) return

    const cleanEmail = (candidate?.candidate_email || candidate?.email || candEmail || '').trim().toLowerCase()
    if (!cleanEmail) {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'error',
        title: 'Candidate email not found.',
        showConfirmButton: false,
        timer: 3000
      })
      return
    }

    const targetLinkId = targetSession?.link_id

    isRestoringRef.current = true
    setIsRestoring(true)
    try {
      const token = localStorage.getItem('superadminToken') || localStorage.getItem('adminToken')
      const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

      const response = await axios.post(
        `${API_BASE_URL}/admin/candidate/restore`,
        {
          email: cleanEmail,
          link_id: targetLinkId
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      )

      if (response.data && response.data.status === 'success') {
        const isDeleted = Boolean(response.data.deleted_record)
        const updatedTargetId = response.data.link_id || targetLinkId
        const restoredStatus = response.data.restored_status || 'pending'
        const isAttendedRestored = restoredStatus === 'completed'
        const isExpiredRestored = restoredStatus === 'expired'
        const isPendingRestored = restoredStatus === 'pending'
        const isRejectedRestored = restoredStatus === 'rejected'

        if (isDeleted) {
          // Separate ignore record was deleted — remove it from local history
          setLocalHistory(prevList => prevList.filter(item => item.link_id !== updatedTargetId))
          setLocalSummary(prev => {
            if (!prev) return prev
            return {
              ...prev,
              total: Math.max(0, (prev.total || 1) - 1),
              ignored_noshow: Math.max(0, (prev.ignored_noshow || 1) - 1)
            }
          })
        } else {
          // Immediately update local history list for in-place restoration
          setLocalHistory(prevList =>
            prevList.map((item, idx) => {
              const isMatch = (updatedTargetId && item.link_id === updatedTargetId) ||
                              (targetLinkId && item.link_id === targetLinkId) ||
                              item === targetSession ||
                              (!updatedTargetId && !targetLinkId && idx === 0)
              if (isMatch) {
                return {
                  ...item,
                  status: restoredStatus,
                  is_ignored: false,
                  ignored: false,
                  is_attended: isAttendedRestored,
                  is_expired: isExpiredRestored,
                  is_pending: isPendingRestored,
                  is_rejected: isRejectedRestored,
                  decision: isRejectedRestored ? 'rejected' : (isAttendedRestored ? (item.decision === 'ignored' ? 'completed' : item.decision) : 'pending'),
                  ignored_at: null,
                  ignored_by: null,
                  ignored_reason: null
                }
              }
              return item
            })
          )

          setLocalSummary(prev => {
            if (!prev) return prev
            return {
              ...prev,
              ignored_noshow: Math.max(0, (prev.ignored_noshow || 1) - 1),
              attended: (prev.attended || 0) + (isAttendedRestored ? 1 : 0),
              expired: (prev.expired || 0) + (isExpiredRestored ? 1 : 0),
              pending_other: (prev.pending_other || 0) + (isPendingRestored ? 1 : 0),
              rejected: (prev.rejected || 0) + (isRejectedRestored ? 1 : 0)
            }
          })
        }

        if (onRestoreCandidate) {
          onRestoreCandidate({
            email: cleanEmail,
            link_id: updatedTargetId,
            deleted_record: isDeleted,
            restored_status: restoredStatus
          })
        }

        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: `Candidate restored successfully. History updated.`,
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true
        })
      } else {
        throw new Error(response.data?.message || 'Failed to restore candidate on server.')
      }
    } catch (err) {
      console.error('Error restoring candidate:', err)
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to restore candidate. Please try again.'
      Swal.fire({
        icon: 'error',
        title: 'Restore Candidate Failed',
        text: errorMsg,
        confirmButtonColor: '#6366f1'
      })
    } finally {
      setIsRestoring(false)
      isRestoringRef.current = false
    }
  }

  const handleProceed = () => {
    onClose()
    if (onProceedInterview) {
      onProceedInterview()
    } else {
      const isSuperAdmin = window.location.pathname.startsWith('/superadmin')
      navigate(isSuperAdmin ? '/superadmin/create-interview' : '/admin/create-interview', {
        state: {
          candidateData: {
            name: candName,
            email: candEmail,
            phone: candPhone,
            resumeText: candidate?.resume_text || ''
          }
        }
      })
    }
  }

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-3 sm:p-4 overflow-hidden animate-fadeIn">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] max-h-[90vh] overflow-hidden my-auto flex flex-col">
          {/* Header matching Screenshot 2 */}
          <div className="p-4 sm:p-5 bg-slate-950 text-white shrink-0 relative border-b border-slate-800 transition-all">
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Close modal"
            >
              <X size={18} />
            </button>
            <div className="pr-8">
              <h2 className="text-lg sm:text-xl font-black tracking-tight flex items-center gap-2">
                <span>Previous Interview History — {candName}</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-slate-300 font-medium">
                <span className="px-2 py-0.5 rounded font-mono font-bold bg-slate-800 text-indigo-300 border border-slate-700">
                  {candId}
                </span>
                {candPhone && (
                  <>
                    <span>•</span>
                    <span className="text-slate-400">{candPhone}</span>
                  </>
                )}
                {candEmail && (
                  <>
                    <span>•</span>
                    <span className="text-slate-400">{candEmail}</span>
                  </>
                )}
                {targetSession && (
                  <>
                    <span>•</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${getInterviewStatusBadge(targetSession).className}`}>
                      Status: {getInterviewStatusBadge(targetSession).label}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status Tabs Bar */}
          <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1 shrink-0">Filter Status:</span>
            {statusTabs.map(tab => {
              const isActive = statusFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id)
                    setCurrentPage(1)
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/20'
                      : 'bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${isActive ? 'bg-white/25 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Search, Filters & Counters */}
          <div className="p-4 bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search job code, role, company, recruiter..."
                className="w-full pl-9 pr-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value)
                  setCurrentPage(1)
                }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value="all">All Statuses ({statusCounts.all})</option>
                <option value="selected">Selected ({statusCounts.selected})</option>
                <option value="rejected">Rejected ({statusCounts.rejected})</option>
                <option value="pending">Pending ({statusCounts.pending})</option>
                <option value="ignored">Ignored / No-show ({statusCounts.ignored})</option>
              </select>

              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
              </select>
            </div>
          </div>

          {/* Cards List Body (Screenshot 2 exact structure) */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-3.5 bg-slate-100/60 dark:bg-slate-950/40">
            {loading ? (
              <div className="py-16 text-center">
                <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Loading candidate interview history...</p>
              </div>
            ) : error ? (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-800 dark:text-rose-200 text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
                {error}
              </div>
            ) : paginatedHistory.length === 0 ? (
              <div className="py-14 text-center">
                <RotateCcw size={28} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Matching Interview Records</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No interview records match the search or filter criteria.
                </p>
              </div>
            ) : (
              paginatedHistory.map((item, idx) => {
                const statusBadge = getInterviewStatusBadge(item)
                const isRej = statusBadge.label === 'Rejected'
                const code = item.job_code || (item.link_id ? `REQ${item.link_id.slice(0, 6).toUpperCase()}` : 'REQ001')
                const roleName = item.job_role || 'Job Role Not Specified'
                const compName = item.company_name || 'HireIQ'
                const recruiter = item.recruiter_name || 'Admin'

                let dateStr = 'Date: N/A'
                if (item.interview_date) {
                  try {
                    dateStr = new Date(item.interview_date).toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })
                  } catch {
                    dateStr = String(item.interview_date)
                  }
                }

                return (
                  <div
                    key={item.link_id || idx}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    {/* Left: Code, Role, Company, Recruiter, Date, Status */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {code}
                        </span>
                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-slate-100 truncate" title={extractJobTitle(roleName)}>
                          {extractJobTitle(roleName)}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 font-medium">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <Briefcase size={12} className="text-slate-400" />
                          {compName}
                        </span>
                        <span>•</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          Recruiter: <strong className="font-semibold text-slate-800 dark:text-slate-200">{recruiter}</strong>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          <Calendar size={12} className="text-slate-400" />
                          {dateStr}
                        </span>
                        <span>•</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBadge.className}`}>
                          {statusBadge.label}
                        </span>
                      </div>

                      {/* Rejection Alert Notice if rejected */}
                      {isRej && (
                        <div className="mt-1.5 p-2 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-800 dark:text-rose-200 text-[11px] flex items-center gap-1.5">
                          <AlertCircle size={13} className="text-rose-600 shrink-0" />
                          <span className="font-bold shrink-0">Rejected Reason:</span>
                          <span className="truncate" title={item.rejection_reason || 'Candidate evaluation did not meet required passing criteria.'}>
                            {item.rejection_reason || 'Candidate evaluation did not meet required passing criteria.'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Right: Score Pill & Action Buttons */}
                    <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
                      <ScoreMatchBadge score={item.ai_score} />

                      {/* Details button: WORKABLE */}
                      <button
                        type="button"
                        onClick={() => setSelectedInterviewForDetails(item)}
                        className="px-3.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
                      >
                        <Eye size={13} className="text-slate-500" />
                        Details
                      </button>

                      {/* Note: Submit button is explicitly removed / omitted in this historical view */}
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer & Actions */}
          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
            {/* Pagination */}
            <div className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-800 dark:text-slate-200">{filteredHistory.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
              <strong className="text-slate-800 dark:text-slate-200">{Math.min(currentPage * pageSize, filteredHistory.length)}</strong> of{' '}
              <strong className="text-slate-800 dark:text-slate-200">{filteredHistory.length}</strong> records
              {totalPages > 1 && ` (Page ${currentPage} of ${totalPages})`}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {totalPages > 1 && (
                <div className="flex items-center gap-1 mr-3">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              {isTargetAlreadyIgnored ? (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={isRestoring}
                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-bold rounded-xl border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-xs"
                  title="Restore candidate status in database and history"
                >
                  {isRestoring ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-emerald-600" />
                      Restoring...
                    </>
                  ) : (
                    <>
                      <RotateCcw size={13} className="text-emerald-600" />
                      Restore Candidate
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleIgnore}
                  disabled={isIgnoring}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900 transition-colors flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                  title="Save ignored status to database and update history"
                >
                  {isIgnoring ? (
                    <>
                      <Loader2 size={13} className="animate-spin text-rose-600" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Ban size={13} className="text-rose-600" />
                      Ignore Candidate
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={handleProceed}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Proceed to create or continue interview"
              >
                <ArrowRight size={13} />
                Proceed Interview
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Render Modal 2 if an interview is selected for Details */}
      {selectedInterviewForDetails && (
        <InterviewDetailsModal
          interview={selectedInterviewForDetails}
          candidate={candidate}
          isOpen={Boolean(selectedInterviewForDetails)}
          onClose={() => setSelectedInterviewForDetails(null)}
        />
      )}
    </>
  )
}
