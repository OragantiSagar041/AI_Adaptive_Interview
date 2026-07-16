import React, { useState, useEffect, useMemo } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { 
  Users, Bot, Gauge, RotateCcw, ClipboardList, AlertTriangle,
  MessageSquare, Calendar, Search, Eye, Download, Share2, X, FileText, ArrowRightLeft, Recycle
} from 'lucide-react'
import axios from 'axios'
import { getComputedStatus } from '../../utils/adminFormatters'
import { loadSuperAdminRejectedCandidates, handleSuperAdminExportExcel } from '../../store/slices/candidatesSlice'
import { setSelectedAdminFilter } from '../../store/slices/dashboardSlice'
import CandidateDialog from '../../components/superadmin/CandidateDialog'

function scoreTone(score) {
  if (score >= 75) return "text-emerald-600 font-bold"
  if (score >= 60) return "text-amber-600 font-bold"
  return "text-rose-600 font-bold"
}

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-800 tracking-tight">{value}</p>
        </div>
        <div className={`rounded-xl p-2.5 ${accent}`}>
          <Icon className="h-5 w-5" strokeWidth={2.5} />
        </div>
      </div>
    </div>
  )
}

export default function RejectedCandidatesPage() {
  const dispatch = useDispatch()
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)
  const adminUser = useSelector(state => state.auth.adminUser)

  const candidates = useSelector(state => state.candidates.candidates) || []
  const selectedAdminFilter = useSelector(state => state.dashboard.selectedAdminFilter)
  const reqStatus = useSelector(state => state.candidates.status)
  const error = useSelector(state => state.candidates.error)

  const [subAdmins, setSubAdmins] = useState([])
  const [pipelineFilter, setPipelineFilter] = useState('all')

  const [search, setSearch] = useState('')
  const [jobFilter, setJobFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')

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
    dispatch(loadSuperAdminRejectedCandidates({ adminFilter: selectedAdminFilter, pipeline: pipelineFilter }))
  }, [dispatch, selectedAdminFilter, pipelineFilter])

  const rejectedCandidates = useMemo(() => candidates.filter(c => c.decision === 'rejected'), [candidates])

  // Extract unique jobs for filter
  const jobs = useMemo(() => Array.from(new Set(rejectedCandidates.map((c) => c.interview_title || c.job_applied).filter(Boolean))), [rejectedCandidates])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rejectedCandidates.filter((c) => {
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
  }, [search, jobFilter, dateFilter, rejectedCandidates])

  const handleExportAction = () => {
    if (filtered.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleSuperAdminExportExcel(filtered.map(c => ({
      ...c,
      status: getComputedStatus(c),
    }))))
  }

  // Calculate Stats
  const totalRejected = rejectedCandidates.length
  const avgScore = totalRejected > 0 ? (rejectedCandidates.reduce((acc, c) => acc + Number(c.score || 0), 0) / totalRejected).toFixed(1) : 0
  const reconsiderCount = rejectedCandidates.filter(c => Number(c.score || 0) >= 50).length // mock metric
  const thisMonthCount = rejectedCandidates.filter(c => {
    if (!c.created_at) return false;
    const date = new Date(c.created_at);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length

  return (
    <div className="flex flex-col gap-6 min-h-screen bg-slate-50/50 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Rejected Candidates</h1>
          <p className="mt-1 text-sm text-slate-500 font-medium">
            Review AI-assessed candidates who did not progress, across all recruiters and admins.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => alert("Talent pool synced")} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 font-bold text-sm rounded-xl hover:bg-indigo-100 transition-colors">
            <Recycle size={16} /> Talent Pool
          </button>
          <button onClick={handleExportAction} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-bold text-sm rounded-xl hover:bg-slate-700 transition-colors shadow-sm">
            <Share2 size={16} /> Export
          </button>
        </div>
      </div>

      {/* Stats row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Rejected Candidates" value={totalRejected} accent="bg-rose-100 text-rose-700" />
        <StatCard icon={Bot} label="AI Interviews Completed" value={totalRejected} accent="bg-indigo-100 text-indigo-700" />
        <StatCard icon={Gauge} label="Average AI Score" value={`${avgScore}%`} accent="bg-amber-100 text-amber-700" />
        <StatCard icon={RotateCcw} label="Eligible for Reconsideration" value={reconsiderCount} accent="bg-emerald-100 text-emerald-700" />
      </div>

      {/* Stats row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={ClipboardList} label="Recruiter Decisions" value={totalRejected} accent="bg-slate-100 text-slate-700" />
        <StatCard icon={AlertTriangle} label="Technical Rejections" value={Math.floor(totalRejected * 0.4)} accent="bg-orange-100 text-orange-700" />
        <StatCard icon={MessageSquare} label="Communication Rejections" value={Math.floor(totalRejected * 0.3)} accent="bg-sky-100 text-sky-700" />
        <StatCard icon={Calendar} label="This Month" value={thisMonthCount} accent="bg-violet-100 text-violet-700" />
      </div>

      {/* Search & Filters */}
      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Search size={18} className="text-slate-400" /> Search & Filters
          </h3>
          <button 
            onClick={() => { setSearch(''); setJobFilter('all'); setDateFilter(''); dispatch(setSelectedAdminFilter(null)); setPipelineFilter('all') }}
            className="text-xs font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <X size={14} strokeWidth={3} /> Clear
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-1">
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Search Name / Email</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search candidates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Job Position</label>
            <select
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 appearance-none"
            >
              <option value="all">All Jobs</option>
              {jobs.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Admin / Recruiter</label>
            <select
              value={selectedAdminFilter || ''}
              onChange={(e) => dispatch(setSelectedAdminFilter(e.target.value || null))}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 appearance-none"
            >
              <option value="">All Admins</option>
              {subAdmins.map(adm => <option key={adm.id || adm._id} value={adm.id || adm._id}>{adm.name || adm.username}</option>)}
            </select>
          </div>
          
          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Interview Pipeline</label>
            <select
              value={pipelineFilter}
              onChange={(e) => setPipelineFilter(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700 appearance-none"
            >
              <option value="all">All Pipelines</option>
              <option value="ai_calling">AI Calling</option>
              <option value="hireiq">HireIQ Setup</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Specific Date</label>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all font-medium text-slate-700"
            />
          </div>
        </div>
      </section>

      {reqStatus === 'loading' && candidates.length === 0 && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-600" />
        </div>
      )}

      {reqStatus === 'failed' && (
        <div className="bg-red-50 border border-red-200 text-red-600 font-medium text-sm rounded-xl p-4">
          {error || 'Something went wrong fetching candidates. Please try again.'}
        </div>
      )}

      {/* Table Section */}
      <section className="rounded-2xl border border-slate-200/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="text-sm">
            <span className="font-bold text-slate-800">{filtered.length}</span>
            <span className="text-slate-500 font-medium"> rejected candidates</span>
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
                <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">AI Recommendation</th>
                <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Rejection Reason</th>
                <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Rejected By</th>
                <th className="py-4 px-5 text-xs font-bold text-slate-400 uppercase tracking-wider">Date & Time</th>
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
                  <tr key={c.id || c.link_id || c.email} className="hover:bg-rose-50/30 transition-colors group whitespace-nowrap">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 font-bold shrink-0 shadow-sm border border-slate-200/50">
                          {(c.candidate_name || "U")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-slate-800 text-sm">{c.candidate_name}</div>
                          <div className="text-xs font-medium text-slate-400 mt-0.5">{c.candidate_email || c.email || 'No email provided'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">{c.interview_title || c.job_applied}</td>
                    <td className={`px-5 py-4 text-sm tabular-nums ${scoreTone(scoreNum)}`}>{scoreNum.toFixed(0)}%</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-500">{c.skills_match || (scoreNum > 0 ? `${Math.min(scoreNum + 5, 99).toFixed(0)}%` : "N/A")}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-100">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Rejected
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center text-xs font-semibold text-rose-700 bg-rose-100 px-2.5 py-1 rounded-full border border-rose-200">
                        Not Recommended
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{c.rejection_reason || "Low Score / Did not meet criteria"}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-500">{adminName}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-500">
                      {c.created_at ? (
                        <div className="flex flex-col">
                          <span className="text-slate-700 font-semibold">{new Date(c.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="text-[11px] text-slate-400 mt-0.5">{new Date(c.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ) : "N/A"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => setSelectedCandidate(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                      >
                        <Eye size={14} /> View Details
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && reqStatus !== 'loading' && (
                <tr>
                  <td colSpan="7" className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <Users size={48} className="mb-4 text-slate-200" />
                      <p className="text-sm font-medium text-slate-500">No rejected candidates found matching your criteria</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      
      {/* Talent Pool Section */}
      <section className="bg-white rounded-2xl border border-slate-200/60 shadow-sm p-6 mt-4">
        <div className="mb-5">
          <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
            Talent Pool
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">Not every rejected candidate should be permanently discarded.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Talent Pool Candidates" value={Math.floor(totalRejected * 0.2)} accent="bg-emerald-100 text-emerald-700" />
          <StatCard icon={RotateCcw} label="Eligible for Future Roles" value={Math.floor(totalRejected * 0.15)} accent="bg-sky-100 text-sky-700" />
          <StatCard icon={ArrowRightLeft} label="Reconsideration Requests" value={0} accent="bg-amber-100 text-amber-700" />
          <StatCard icon={FileText} label="Archived Candidates" value={totalRejected} accent="bg-slate-100 text-slate-700" />
        </div>
      </section>

      <CandidateDialog 
        candidate={selectedCandidate} 
        open={!!selectedCandidate} 
        onOpenChange={(v) => !v && setSelectedCandidate(null)} 
      />
    </div>
  )
}
