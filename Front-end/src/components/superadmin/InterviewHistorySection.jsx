import React, { useState, useMemo } from 'react'
import {
  Calendar, Clock, CheckCircle2, XCircle, AlertCircle, Ban, Hourglass,
  Search, Filter, RotateCcw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  TrendingUp, Award, Layers, Briefcase, Eye, EyeOff, Sparkles, X, ArrowRight
} from 'lucide-react'
import { InterviewDetailsModal } from './PreviousInterviewsModal'

export default function InterviewHistorySection({
  history = [],
  summary = null,
  loading = false,
  error = null,
  candidateEmail = '',
  candidateName = '',
  onProceedInterview = null,
  onIgnoreCandidate = null,
  hideActionButtons = false
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [domainFilter, setDomainFilter] = useState('all')
  const [activeSummaryTab, setActiveSummaryTab] = useState('domains') // 'domains' | 'roles'
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [expandedRowId, setExpandedRowId] = useState(null)
  const [detailsModalItem, setDetailsModalItem] = useState(null)

  // Compute fallback summaries client-side if not supplied directly by backend
  const stats = useMemo(() => {
    if (summary && summary.total !== undefined) {
      return summary
    }

    let attended = 0
    let rejected = 0
    let ignored = 0
    let pending = 0
    const validScores = []
    const domainMap = {}
    const roleMap = {}

    history.forEach(item => {
      const isAttended = item.is_attended !== undefined
        ? item.is_attended
        : (item.status === 'completed' || Boolean(item.interview_date && item.ai_score !== null))
      const isRejected = item.is_rejected !== undefined
        ? item.is_rejected
        : (item.decision === 'rejected' || Boolean(item.rejection_reason))
      const isIgnored = item.is_ignored !== undefined
        ? item.is_ignored
        : (['ignored', 'no_show', 'no-show'].includes((item.status || '').toLowerCase()) || Boolean(item.ignored) || Boolean(item.ignored_at) || item.decision === 'ignored')
      const isExpired = item.is_expired !== undefined
        ? item.is_expired
        : ((item.status || '').toLowerCase() === 'expired')
      const isPending = !isAttended && !isRejected && !isIgnored && !isExpired

      if (isAttended) attended++
      if (isRejected) rejected++
      if (isIgnored) ignored++
      if (isPending) pending++

      const scoreNum = Number(item.ai_score)
      if (!Number.isNaN(scoreNum) && item.ai_score !== null && isAttended) {
        validScores.push(scoreNum)
      }

      const dom = (item.interviewed_skills || 'Technical').trim()
      if (!domainMap[dom]) {
        domainMap[dom] = { domain: dom, count: 0, attended: 0, rejected: 0, ignored: 0, pending: 0, scores: [] }
      }
      domainMap[dom].count++
      if (isAttended) domainMap[dom].attended++
      if (isRejected) domainMap[dom].rejected++
      if (isIgnored) domainMap[dom].ignored++
      if (isPending) domainMap[dom].pending++
      if (!Number.isNaN(scoreNum) && item.ai_score !== null && isAttended) domainMap[dom].scores.push(scoreNum)

      const role = (item.job_role || 'Job Role Not Specified').trim()
      if (!roleMap[role]) {
        roleMap[role] = { role, count: 0, attended: 0, rejected: 0, ignored: 0, pending: 0, scores: [] }
      }
      roleMap[role].count++
      if (isAttended) roleMap[role].attended++
      if (isRejected) roleMap[role].rejected++
      if (isIgnored) roleMap[role].ignored++
      if (isPending) roleMap[role].pending++
      if (!Number.isNaN(scoreNum) && item.ai_score !== null && isAttended) roleMap[role].scores.push(scoreNum)
    })

    const domains = Object.values(domainMap).map(d => ({
      ...d,
      avg_score: d.scores.length ? Math.round((d.scores.reduce((a, b) => a + b, 0) / d.scores.length) * 10) / 10 : null
    })).sort((a, b) => b.count - a.count)

    const roles = Object.values(roleMap).map(r => ({
      ...r,
      avg_score: r.scores.length ? Math.round((r.scores.reduce((a, b) => a + b, 0) / r.scores.length) * 10) / 10 : null
    })).sort((a, b) => b.count - a.count)

    return {
      total: history.length,
      attended,
      rejected,
      ignored_noshow: ignored,
      pending_other: pending,
      avg_ai_score: validScores.length ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 10) / 10 : null,
      domains,
      roles
    }
  }, [history, summary])

  // Unique list of domains for the dropdown filter
  const availableDomains = useMemo(() => {
    if (stats.domains && stats.domains.length > 0) {
      return stats.domains.map(d => d.domain)
    }
    const set = new Set()
    history.forEach(i => {
      if (i.interviewed_skills) set.add(i.interviewed_skills.trim())
    })
    return Array.from(set).sort()
  }, [stats.domains, history])

  // Filter and search history items
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      // 1. Status Filter
      if (statusFilter !== 'all') {
        const isAttended = item.is_attended !== undefined
          ? item.is_attended
          : (item.status === 'completed' || Boolean(item.interview_date && item.ai_score !== null))
        const isRejected = item.is_rejected !== undefined
          ? item.is_rejected
          : (item.decision === 'rejected' || Boolean(item.rejection_reason))
        const isIgnored = item.is_ignored !== undefined
          ? item.is_ignored
          : (['ignored', 'no_show', 'no-show'].includes((item.status || '').toLowerCase()) || Boolean(item.ignored) || Boolean(item.ignored_at) || item.decision === 'ignored')
        const isExpired = item.is_expired !== undefined
          ? item.is_expired
          : ((item.status || '').toLowerCase() === 'expired')
        const isPending = !isAttended && !isRejected && !isIgnored && !isExpired

        if (statusFilter === 'attended' && !isAttended) return false
        if (statusFilter === 'rejected' && !isRejected) return false
        if (statusFilter === 'ignored' && !isIgnored) return false
        if (statusFilter === 'expired' && !isExpired) return false
        if (statusFilter === 'pending' && !isPending) return false
      }

      // 2. Domain Filter
      if (domainFilter !== 'all') {
        const dom = (item.interviewed_skills || 'Technical').trim().toLowerCase()
        if (dom !== domainFilter.trim().toLowerCase()) return false
      }

      // 3. Search Term
      if (searchTerm.trim()) {
        const query = searchTerm.trim().toLowerCase()
        const role = (item.job_role || '').toLowerCase()
        const domain = (item.interviewed_skills || '').toLowerCase()
        const rej = (item.rejection_reason || '').toLowerCase()
        const linkId = (item.link_id || '').toLowerCase()
        const status = (item.status || '').toLowerCase()
        const decision = (item.decision || '').toLowerCase()

        if (!role.includes(query) && !domain.includes(query) && !rej.includes(query) && !linkId.includes(query) && !status.includes(query) && !decision.includes(query)) {
          return false
        }
      }

      return true
    })
  }, [history, statusFilter, domainFilter, searchTerm])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize))
  const paginatedHistory = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize
    return filteredHistory.slice(startIndex, startIndex + pageSize)
  }, [filteredHistory, currentPage, pageSize])

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage)
    }
  }

  const handleResetFilters = () => {
    setSearchTerm('')
    setStatusFilter('all')
    setDomainFilter('all')
    setCurrentPage(1)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-xs">
        <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Loading candidate interview history...</p>
        <p className="text-xs text-slate-400 mt-1">Retrieving verified interview records from the database.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-center gap-3 text-rose-800 dark:text-rose-200">
        <AlertCircle size={20} className="text-rose-600 shrink-0" />
        <div>
          <div className="text-sm font-bold">Failed to load interview history</div>
          <div className="text-xs mt-0.5">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Section Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Interview History & Track Record
            </h3>
            <span className="px-2.5 py-0.5 text-xs font-black bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
              {stats.total} Records
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">
            Complete database session track record for {candidateName || 'Candidate'} {candidateEmail ? `(${candidateEmail})` : ''}
          </p>
        </div>

        {stats.avg_ai_score !== null && (
          <div className="flex items-center gap-3 px-3.5 py-1.5 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 shadow-xs shrink-0">
            <TrendingUp size={16} className="text-indigo-600 dark:text-indigo-400" />
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average AI Score</div>
              <div className={`text-sm font-black ${stats.avg_ai_score >= 75 ? 'text-emerald-600 dark:text-emerald-400' : stats.avg_ai_score >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>
                {stats.avg_ai_score}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Metric Cards (Actual Database Counts) ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total */}
        <button
          type="button"
          onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === 'all'
            ? 'bg-indigo-50/80 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/20'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total</span>
            <Layers size={14} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-slate-100 mt-1">{stats.total}</div>
          <div className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">All Interviews</div>
        </button>

        {/* Attended / Completed */}
        <button
          type="button"
          onClick={() => { setStatusFilter(statusFilter === 'attended' ? 'all' : 'attended'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === 'attended'
            ? 'bg-emerald-50/80 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-700 ring-2 ring-emerald-500/20'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Attended</span>
            <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{stats.attended}</div>
          <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5">Completed Sessions</div>
        </button>

        {/* Rejected */}
        <button
          type="button"
          onClick={() => { setStatusFilter(statusFilter === 'rejected' ? 'all' : 'rejected'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === 'rejected'
            ? 'bg-rose-50/80 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 ring-2 ring-rose-500/20'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Rejected</span>
            <XCircle size={14} className="text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-700 dark:text-rose-400 mt-1">{stats.rejected}</div>
          <div className="text-[10px] font-semibold text-rose-600 dark:text-rose-400 mt-0.5">Rejected Sessions</div>
        </button>

        {/* Ignored / No-show */}
        <button
          type="button"
          onClick={() => { setStatusFilter(statusFilter === 'ignored' ? 'all' : 'ignored'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === 'ignored'
            ? 'bg-amber-50/80 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 ring-2 ring-amber-500/20'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Ignored / No-show</span>
            <Ban size={14} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-700 dark:text-amber-400 mt-1">{stats.ignored_noshow}</div>
          <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">Expired / Unattended</div>
        </button>

        {/* Pending / Other */}
        <button
          type="button"
          onClick={() => { setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${statusFilter === 'pending'
            ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 ring-2 ring-slate-400/20'
            : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Pending / Other</span>
            <Hourglass size={14} className="text-slate-500" />
          </div>
          <div className="text-2xl font-black text-slate-800 dark:text-slate-200 mt-1">{stats.pending_other}</div>
          <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Awaiting Action</div>
        </button>
      </div>

      {/* ── Domain-wise and Job-Role-wise Summaries ── */}
      <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Award size={16} className="text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              {activeSummaryTab === 'domains' ? 'Technical Domain Summaries' : 'Job Role Summaries'}
            </h4>
          </div>
          
          <div className="flex items-center bg-slate-100 dark:bg-slate-900/60 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setActiveSummaryTab('domains')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSummaryTab === 'domains'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              By Domain ({stats.domains?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveSummaryTab('roles')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeSummaryTab === 'roles'
                ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              By Job Role ({stats.roles?.length || 0})
            </button>
          </div>
        </div>

        {activeSummaryTab === 'domains' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.domains && stats.domains.length > 0 ? (
              stats.domains.map(dom => (
                <div
                  key={dom.domain}
                  onClick={() => {
                    setDomainFilter(domainFilter === dom.domain ? 'all' : dom.domain)
                    setCurrentPage(1)
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${domainFilter === dom.domain
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/20'
                    : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 truncate" title={dom.domain}>
                      {dom.domain}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                      {dom.count} {dom.count === 1 ? 'interview' : 'interviews'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-semibold">{dom.attended} Attended</span>
                      <span>•</span>
                      <span className="text-rose-600 font-semibold">{dom.rejected} Rejected</span>
                    </div>
                    {dom.avg_score !== null && (
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Avg: <strong className={dom.avg_score >= 75 ? 'text-emerald-600' : dom.avg_score >= 50 ? 'text-amber-500' : 'text-rose-500'}>{dom.avg_score}%</strong>
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-4 text-center text-xs text-slate-400 font-medium">
                No domain breakdown data available.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.roles && stats.roles.length > 0 ? (
              stats.roles.map(r => (
                <div
                  key={r.role}
                  onClick={() => {
                    setSearchTerm(searchTerm === r.role ? '' : r.role.slice(0, 30))
                    setCurrentPage(1)
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer ${searchTerm && r.role.toLowerCase().includes(searchTerm.toLowerCase())
                    ? 'bg-indigo-50/60 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/20'
                    : 'bg-slate-50/70 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-100 line-clamp-1" title={r.role}>
                      {r.role}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-black rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shrink-0">
                      {r.count}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div className="flex items-center gap-2">
                      <span className="text-emerald-600 font-semibold">{r.attended} Attended</span>
                      <span>•</span>
                      <span className="text-rose-600 font-semibold">{r.rejected} Rejected</span>
                    </div>
                    {r.avg_score !== null && (
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Avg: <strong className={r.avg_score >= 75 ? 'text-emerald-600' : r.avg_score >= 50 ? 'text-amber-500' : 'text-rose-500'}>{r.avg_score}%</strong>
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-4 text-center text-xs text-slate-400 font-medium">
                No job role breakdown data available.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Filters & Search Controls ── */}
      <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              placeholder="Search by job role, domain, rejection reason, ID..."
              className="w-full pl-9 pr-9 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-slate-400"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Status Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase hidden lg:inline">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">All Statuses ({stats.total})</option>
                <option value="attended">Attended / Completed ({stats.attended})</option>
                <option value="rejected">Rejected ({stats.rejected})</option>
                <option value="ignored">Ignored / No-show ({stats.ignored_noshow})</option>
                <option value="pending">Pending / Other ({stats.pending_other})</option>
              </select>
            </div>

            {/* Domain Dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase hidden lg:inline">Domain:</span>
              <select
                value={domainFilter}
                onChange={(e) => { setDomainFilter(e.target.value); setCurrentPage(1); }}
                className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="all">All Domains</option>
                {availableDomains.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Page Size */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase hidden lg:inline">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="px-2.5 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>

            {/* Reset Filters */}
            {(searchTerm || statusFilter !== 'all' || domainFilter !== 'all') && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-2.5 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                title="Reset all filters"
              >
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Filter result feedback */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>
            Showing <strong className="text-slate-800 dark:text-slate-200">{filteredHistory.length}</strong> of <strong className="text-slate-800 dark:text-slate-200">{history.length}</strong> recorded interviews
            {(searchTerm || statusFilter !== 'all' || domainFilter !== 'all') && ' (filtered)'}
          </span>
          <span>
            Page <strong className="text-indigo-600 dark:text-indigo-400">{currentPage}</strong> of <strong className="text-slate-800 dark:text-slate-200">{totalPages}</strong>
          </span>
        </div>
      </div>

      {/* ── Interview History Table ── */}
      <div className="bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/80 shadow-xs overflow-hidden">
        {paginatedHistory.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <RotateCcw size={22} />
            </div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">No Matching Interview Records</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              No interview records matched the current filters. Try resetting the search or filter settings.
            </p>
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-3 px-4 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-3 w-12 text-center">#</th>
                  <th className="py-3 px-4 min-w-[150px]">Date & Time</th>
                  <th className="py-3 px-4 min-w-[130px]">Domain / Skills</th>
                  <th className="py-3 px-4 min-w-[180px]">Job Role</th>
                  <th className="py-3 px-4 min-w-[130px]">Status & Decision</th>
                  <th className="py-3 px-4 min-w-[90px] text-center">AI Score</th>
                  <th className="py-3 px-4 min-w-[200px]">Rejection Reason</th>
                  <th className="py-3 px-3 w-16 text-center">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedHistory.map((item, index) => {
                  const globalIndex = filteredHistory.length - ((currentPage - 1) * pageSize + index)
                  const candDet = item.candidate_details || {}
                  const isRej = item.decision === 'rejected' || Boolean(item.rejection_reason)
                  const isSelected = item.decision === 'selected' || item.decision === 'hired'
                  const isCompleted = item.status === 'completed'
                  const isIgnored = Boolean(item.is_ignored) || Boolean(item.ignored) || Boolean(item.ignored_at) || ['ignored', 'no_show', 'no-show'].includes((item.status || '').toLowerCase()) || item.decision === 'ignored'
                  const isExpired = Boolean(item.is_expired) || (item.status || '').toLowerCase() === 'expired'
                  const scoreVal = Number(item.ai_score)
                  const hasScore = !Number.isNaN(scoreVal) && item.ai_score !== null

                  const isExpanded = expandedRowId === (item.link_id || index)

                  let dateStr = 'N/A'
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
                    } catch (e) {
                      dateStr = String(item.interview_date)
                    }
                  }

                  return (
                    <React.Fragment key={item.link_id || index}>
                      <tr className={`hover:bg-slate-50/80 dark:hover:bg-slate-750/50 transition-colors ${item.is_current ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''}`}>
                        {/* Index */}
                        <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold">
                          #{globalIndex}
                        </td>

                        {/* Date & Time */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                            <Calendar size={13} className="text-slate-400 shrink-0" />
                            {dateStr}
                          </div>
                          {item.is_current && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 rounded">
                              Current Session
                            </span>
                          )}
                        </td>

                        {/* Domain / Skills */}
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            {item.interviewed_skills || 'Technical'}
                          </span>
                        </td>

                        {/* Job Role */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800 dark:text-slate-100 max-w-xs truncate" title={item.job_role}>
                            {item.job_role || 'Job Role Not Specified'}
                          </div>
                          {item.link_id && (
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5" title={`Session ID: ${item.link_id}`}>
                              ID: {item.link_id.slice(0, 8)}...
                            </div>
                          )}
                        </td>

                        {/* Status & Decision */}
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${
                            isSelected
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                              : isRej
                                ? 'bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                : isCompleted
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                                  : isIgnored
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                    : isExpired
                                      ? 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                                      : 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                          }`}>
                            {isSelected ? (
                              <><CheckCircle2 size={11} /> Selected</>
                            ) : isRej ? (
                              <><XCircle size={11} /> Rejected</>
                            ) : isCompleted ? (
                              <><CheckCircle2 size={11} /> Completed</>
                            ) : isIgnored ? (
                              <><Ban size={11} /> Ignored / No-show</>
                            ) : isExpired ? (
                              <><Clock size={11} /> Expired</>
                            ) : (
                              <><Hourglass size={11} /> {item.status ? item.status.toUpperCase() : 'Pending'}</>
                            )}
                          </span>
                        </td>

                        {/* AI Score */}
                        <td className="py-3 px-4 text-center">
                          {hasScore ? (
                            <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md font-black text-xs tabular-nums ${
                              scoreVal >= 75
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300'
                                : scoreVal >= 50
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950 dark:text-amber-300'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300'
                            }`}>
                              {scoreVal.toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>

                        {/* Rejection Reason */}
                        <td className="py-3 px-4">
                          {isRej ? (
                            <div className="bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900 rounded-lg p-2 text-rose-900 dark:text-rose-200 max-w-sm">
                              <div className="flex items-center gap-1 text-[10px] font-black uppercase text-rose-700 dark:text-rose-400 tracking-wider">
                                <AlertCircle size={11} /> Rejection Reason
                              </div>
                              <p className="mt-0.5 text-[11px] font-medium leading-relaxed line-clamp-2" title={item.rejection_reason || ''}>
                                {item.rejection_reason && item.rejection_reason.trim()
                                  ? item.rejection_reason
                                  : 'No specific rejection reason provided.'}
                              </p>
                              {(item.rejected_by || item.rejected_at) && (
                                <div className="text-[10px] text-rose-600/80 dark:text-rose-400 mt-0.5">
                                  {item.rejected_by ? `By: ${item.rejected_by}` : ''}
                                  {item.rejected_by && item.rejected_at ? ' • ' : ''}
                                  {item.rejected_at ? new Date(item.rejected_at).toLocaleDateString() : ''}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 font-medium">-</span>
                          )}
                        </td>

                        {/* Details Button */}
                        <td className="py-3 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => setDetailsModalItem(item)}
                            className="p-1.5 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 rounded hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="View Full Interview Details"
                          >
                            <Eye size={15} />
                          </button>
                        </td>
                      </tr>

                      {/* Expandable snapshot row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800">
                          <td colSpan={8} className="p-4 pl-12">
                            <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Briefcase size={12} className="text-indigo-500" />
                                Candidate Profile Snapshot At Interview #{globalIndex}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Name</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{candDet.name || 'N/A'}</div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Mobile</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{candDet.phone || 'N/A'}</div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Experience</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{candDet.experience || 'N/A'}</div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Company</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{candDet.current_company || 'N/A'}</div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Location</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{candDet.location || 'N/A'}</div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Notice Period</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">{candDet.notice_period || 'N/A'}</div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Current / Exp CTC</div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                                    {candDet.current_ctc || '-'} / {candDet.expected_ctc || '-'}
                                  </div>
                                </div>
                                <div className="p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                  <div className="text-[9px] font-bold text-slate-400 uppercase">Full Session ID</div>
                                  <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 truncate" title={item.link_id}>
                                    {item.link_id || 'N/A'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Table Footer & Pagination Controls ── */}
        {filteredHistory.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40">
            <div className="text-xs text-slate-500 font-medium">
              Showing <strong className="text-slate-800 dark:text-slate-200">{(currentPage - 1) * pageSize + 1}</strong> to{' '}
              <strong className="text-slate-800 dark:text-slate-200">{Math.min(currentPage * pageSize, filteredHistory.length)}</strong> of{' '}
              <strong className="text-slate-800 dark:text-slate-200">{filteredHistory.length}</strong> records
            </div>

            <div className="flex items-center gap-1.5 self-center sm:self-auto">
              <button
                type="button"
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title="First Page"
              >
                <ChevronsLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1 px-1">
                {(() => {
                  const pages = []
                  const maxButtons = 5
                  let start = Math.max(1, currentPage - 2)
                  let end = Math.min(totalPages, start + maxButtons - 1)
                  if (end - start + 1 < maxButtons) {
                    start = Math.max(1, end - maxButtons + 1)
                  }

                  for (let p = start; p <= end; p++) {
                    pages.push(
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePageChange(p)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${p === currentPage
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  }
                  return pages
                })()}
              </div>

              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title="Next Page"
              >
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title="Last Page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Action Buttons (Ignore Candidate & Proceed Interview) ── */}
      {!hideActionButtons && (onProceedInterview || onIgnoreCandidate) && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          {onIgnoreCandidate && (
            <button
              type="button"
              onClick={onIgnoreCandidate}
              className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/80 text-xs font-bold rounded-xl border border-rose-200 dark:border-rose-900 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Ban size={14} className="text-rose-600" />
              Ignore Candidate
            </button>
          )}
          {onProceedInterview && (
            <button
              type="button"
              onClick={onProceedInterview}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowRight size={14} />
              Proceed Interview
            </button>
          )}
        </div>
      )}

      {/* ── Interview Details Modal (Screenshot 3 Design) ── */}
      {detailsModalItem && (
        <InterviewDetailsModal
          interview={detailsModalItem}
          candidate={{ name: candidateName, email: candidateEmail }}
          isOpen={Boolean(detailsModalItem)}
          onClose={() => setDetailsModalItem(null)}
        />
      )}
    </div>
  )
}
