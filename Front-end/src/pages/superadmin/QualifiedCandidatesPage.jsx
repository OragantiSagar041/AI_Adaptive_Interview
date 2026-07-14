import React, { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Users, Star, Phone, ClipboardCheck, Target, FileSignature, Search, Filter, Eye, Download, Sparkles } from 'lucide-react'
import axios from 'axios'
import { getComputedStatus } from '../../utils/adminFormatters'
import { loadSuperAdminQualifiedCandidates, handleSuperAdminExportExcel } from '../../store/slices/candidatesSlice'
import { setSelectedAdminFilter } from '../../store/slices/dashboardSlice'
import CandidateDialog from '../../components/superadmin/CandidateDialog'

// Utility for concatenating classes
const cn = (...classes) => classes.filter(Boolean).join(' ')

// Custom Badges to match the design
const RecommendationBadge = ({ score }) => {
  let text = "Not Recommended"
  let color = "bg-red-100 text-red-700"

  if (score >= 85) {
    text = "Highly Recommended"
    color = "bg-emerald-100 text-emerald-700"
  } else if (score >= 70) {
    text = "Recommended"
    color = "bg-blue-100 text-blue-700"
  } else if (score >= 50) {
    text = "Consider"
    color = "bg-amber-100 text-amber-700"
  }

  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase", color)}>
      {text}
    </span>
  )
}

const StatusBadge = ({ value }) => {
  const statusColor = value === 'Offer Released' ? 'bg-indigo-100 text-indigo-700'
    : value === 'Shortlisted' ? 'bg-emerald-100 text-emerald-700'
      : value === 'Review Pending' ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700'

  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase border border-white/50 shadow-sm", statusColor)}>
      {value || 'Review Pending'}
    </span>
  )
}

export default function QualifiedCandidatesPage() {
  const dispatch = useDispatch()
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminUser = useSelector(state => state.auth.adminUser)

  const candidates = useSelector(state => state.candidates.candidates) || []
  const selectedAdminFilter = useSelector(state => state.dashboard.selectedAdminFilter)
  const reqStatus = useSelector(state => state.candidates.status)
  const reqError = useSelector(state => state.candidates.error)

  const [subAdmins, setSubAdmins] = useState([])
  const [pipelineFilter, setPipelineFilter] = useState('all')

  const [search, setSearch] = useState("")
  const [jobFilter, setJobFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState("")

  useEffect(() => {
    if (!token) return
    const fetchSubAdmins = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/super-admin/admins`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        setSubAdmins(res.data.data || [])
      } catch (err) {
        console.error("Error fetching sub-admins:", err)
      }
    }
    fetchSubAdmins()
  }, [token, API_BASE_URL])

  useEffect(() => {
    dispatch(loadSuperAdminQualifiedCandidates({ adminFilter: selectedAdminFilter, pipeline: pipelineFilter }))
  }, [dispatch, selectedAdminFilter, pipelineFilter])

  const qualifiedCandidates = candidates.filter(c => c.decision === 'selected')

  const jobs = useMemo(() => Array.from(new Set(qualifiedCandidates.map((c) => c.interview_title || c.job_applied).filter(Boolean))), [qualifiedCandidates])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return qualifiedCandidates.filter((c) => {
      const jobApplied = c.interview_title || c.job_applied || ""
      if (jobFilter !== "all" && jobApplied !== jobFilter) return false

      if (dateFilter) {
        if (!c.created_at) return false
        const candidateDate = new Date(c.created_at).toISOString().split('T')[0]
        if (candidateDate !== dateFilter) return false
      }

      if (!q) return true
      return (
        (c.candidate_name || "").toLowerCase().includes(q) ||
        jobApplied.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q)
      )
    })
  }, [search, jobFilter, dateFilter, qualifiedCandidates])

  const handleExportAction = () => {
    if (qualifiedCandidates.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleSuperAdminExportExcel(qualifiedCandidates.map(c => ({
      ...c,
      status: getComputedStatus(c),
    }))))
  }

  // Calculate dynamic stats
  const avgScore = qualifiedCandidates.length > 0
    ? (qualifiedCandidates.reduce((acc, c) => acc + Number(c.score || 0), 0) / qualifiedCandidates.length).toFixed(1)
    : "0.0"

  const STATS = [
    { label: "Total Candidates", value: qualifiedCandidates.length.toString(), icon: Users, tone: "primary", colorClass: "bg-indigo-100 text-indigo-600" },
    { label: "Avg AI Score", value: `${avgScore}%`, icon: Star, tone: "info", colorClass: "bg-blue-100 text-blue-600" },
    { label: "AI Interviews", value: candidates.length.toString(), icon: Phone, tone: "chart-2", colorClass: "bg-emerald-100 text-emerald-600" },
    { label: "Pending Review", value: qualifiedCandidates.filter(c => !c.reviewed).length.toString(), icon: ClipboardCheck, tone: "warning", colorClass: "bg-amber-100 text-amber-600" },
    { label: "Ready to Hire", value: qualifiedCandidates.filter(c => Number(c.score || 0) >= 85).length.toString(), icon: Target, tone: "success", colorClass: "bg-teal-100 text-teal-600" },
    { label: "Offers Released", value: "0", icon: FileSignature, tone: "chart-5", colorClass: "bg-purple-100 text-purple-600" },
  ]

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50">
      <main className="mx-auto max-w-7xl px-4 sm:px-6 py-8 space-y-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">Qualified Candidates</h1>
            <p className="text-slate-500 font-medium mt-1 max-w-2xl">
              View, compare, and manage AI-qualified candidates shortlisted by recruiters across your organization.
            </p>
          </div>
          <button
            onClick={handleExportAction}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold shadow-sm hover:bg-slate-50 transition-all cursor-pointer"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>

        {/* Dynamic Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col items-start"
            >
              <div className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl mb-3", s.colorClass)}>
                <s.icon className="h-5 w-5" />
              </div>
              <div className="text-2xl font-black text-slate-900 tabular-nums">{s.value}</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">{s.label}</div>
            </div>
          ))}
        </section>

        {/* Search & Filters */}
        <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">Search & Filters</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                placeholder="Search candidate name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
              />
            </div>

            <div className="relative">
              <select
                value={jobFilter}
                onChange={(e) => setJobFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer appearance-none"
              >
                <option value="all">All Positions</option>
                {jobs.map((j) => <option key={j} value={j}>{j}</option>)}
              </select>
            </div>

            <div className="relative">
              <select
                value={selectedAdminFilter || ''}
                onChange={(e) => dispatch(setSelectedAdminFilter(e.target.value || null))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer appearance-none"
              >
                <option value="">All Admins</option>
                {subAdmins.map(adm => (
                  <option key={adm.id || adm._id} value={adm.id || adm._id}>
                    {adm.name || adm.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <select
                value={pipelineFilter}
                onChange={(e) => setPipelineFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer appearance-none text-slate-700"
              >
                <option value="all">All Pipelines</option>
                <option value="ai_calling">AI Calling Agent</option>
                <option value="hireiq">HireIQ Interview</option>
              </select>
            </div>

            <div className="relative">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer text-slate-700"
              />
            </div>
          </div>
        </section>

        {reqStatus === 'loading' && candidates.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        )}

        {reqStatus === 'failed' && (
          <div className="bg-red-50 border border-red-200 text-red-600 font-medium text-sm rounded-xl p-4">
            {reqError || 'Something went wrong fetching candidates. Please try again.'}
          </div>
        )}

        {/* Table Section */}
        <section className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
            <div className="text-sm">
              <span className="font-bold text-slate-800">{filtered.length}</span>
              <span className="text-slate-500 font-medium"> candidates</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-100 bg-white whitespace-nowrap">
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Job Applied</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">AI Score</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Skills Match</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Interview</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Assigned Recruiter</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Interview Date & Time</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100/80">
                {filtered.map((c) => {
                  const scoreNum = Number(c.score || 0)
                  const adminObj = subAdmins.find(adm => adm.id === c.created_by || adm._id === c.created_by)
                  let adminName = c.admin_name || (adminObj ? (adminObj.name || adminObj.username) : null)
                  if (!adminName && adminUser && (adminUser._id === c.created_by || adminUser.id === c.created_by)) {
                    adminName = adminUser.name || adminUser.username || "Super Admin"
                  }
                  if (!adminName) {
                    adminName = (typeof c.created_by === 'string' && c.created_by.length === 24) ? "System" : c.created_by || "System"
                  }
                  
                  return (
                    <tr key={c.id || c.link_id || c.email} className="hover:bg-slate-50/50 transition-colors group whitespace-nowrap">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 font-bold shrink-0 shadow-sm border border-indigo-100/50">
                            {(c.candidate_name || "U")[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{c.candidate_name}</div>
                            <div className="text-xs font-medium text-slate-400 mt-0.5">{c.email || 'No email provided'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-slate-600">{c.interview_title || c.job_applied}</td>
                      <td className="px-5 py-4 text-sm font-bold text-slate-700 tabular-nums">{scoreNum.toFixed(0)}%</td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-500">{c.skills_match || (scoreNum > 0 ? `${Math.min(scoreNum + 5, 99).toFixed(0)}%` : "N/A")}</td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <span className={cn("h-1.5 w-1.5 rounded-full", c.decision === 'selected' ? "bg-emerald-500" : "bg-amber-500")} />
                          {c.interview_status || "Completed"}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-500">{adminName}</td>
                      <td className="px-5 py-4 text-sm font-medium text-slate-500">
                        {c.created_at ? (
                          <div className="flex flex-col">
                            <span className="text-slate-700 font-semibold">{new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <span className="text-[11px] text-slate-400 mt-0.5">{new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ) : 'N/A'}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge value={getComputedStatus(c)} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => setSelectedCandidate(c)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 shadow-sm transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && reqStatus !== 'loading' && (
                  <tr>
                    <td colSpan={7} className="text-center text-sm font-medium text-slate-400 py-16">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                          <Search size={24} />
                        </div>
                        <p>No candidates match the current filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <CandidateDialog 
        candidate={selectedCandidate} 
        open={!!selectedCandidate} 
        onOpenChange={(v) => !v && setSelectedCandidate(null)} 
      />
    </div>
  )
}
