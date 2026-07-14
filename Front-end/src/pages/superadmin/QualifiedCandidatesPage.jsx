import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { ChevronRight, Download } from 'lucide-react'
import axios from 'axios'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { getComputedStatus } from '../../utils/adminFormatters'
import { loadSuperAdminQualifiedCandidates, handleSuperAdminExportExcel } from '../../store/slices/candidatesSlice'
import { setSelectedAdminFilter } from '../../store/slices/dashboardSlice'
import { handleOpenScorecard } from '../../store/slices/interviewSlice'

export default function QualifiedCandidatesPage() {
  const dispatch = useDispatch()
  const token = useSelector(state => state.auth.token)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const candidates = useSelector(state => state.candidates.candidates) || []
  const selectedAdminFilter = useSelector(state => state.dashboard.selectedAdminFilter)
  const status = useSelector(state => state.candidates.status)
  const error = useSelector(state => state.candidates.error)

  const [subAdmins, setSubAdmins] = useState([])
  const [pipelineFilter, setPipelineFilter] = useState('all')

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Qualified Candidates</h3>
          <p className="text-xs text-slate-500">Shortlisted candidate records across admins</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
          {/* Tenant Admin filter */}
          <div className="flex items-center gap-2 bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tenant Admin:</span>
            <select
              value={selectedAdminFilter || ''}
              onChange={(e) => dispatch(setSelectedAdminFilter(e.target.value || null))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
              style={{ padding: '0.25rem 1.75rem 0.25rem 0.5rem', fontSize: '11px' }}
            >
              <option value="">All Admins</option>
              {subAdmins.map(adm => (
                <option key={adm.id || adm._id} value={adm.id || adm._id}>
                  {adm.name || adm.username}
                </option>
              ))}
            </select>
          </div>

          {/* Pipeline filter */}
          <div className="flex items-center gap-2 bg-white/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pipeline:</span>
            <select
              value={pipelineFilter}
              onChange={(e) => setPipelineFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-800 outline-none focus:border-indigo-500 font-semibold cursor-pointer"
              style={{ padding: '0.25rem 1.75rem 0.25rem 0.5rem', fontSize: '11px' }}
            >
              <option value="all">All</option>
              <option value="ai_calling">AI Calling Agent</option>
              <option value="hireiq">HireIQ Interview</option>
            </select>
          </div>

          <Button
            onClick={handleExportAction}
            variant="secondary"
            className="bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100/50 h-[36px]"
            icon={<Download size={14} />}
          >
            Export Selected
          </Button>
        </div>
      </div>

      {status === 'loading' && candidates.length === 0 && (
        <div className="flex items-center justify-center h-[200px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {status === 'failed' && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-4 mt-4">
          {error || 'Something went wrong. Please try again.'}
        </div>
      )}

      <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm text-slate-800">
        <div className="overflow-x-auto w-full">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#e5edf7] bg-slate-50">
                <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Candidate Name</th>
                <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Interview Profile</th>
                <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Evaluation Score</th>
                <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Date Shortlisted</th>
                <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider text-right pr-6">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f7]">
              {qualifiedCandidates.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400 text-sm">No qualified candidates yet.</td>
                </tr>
              ) : (
                qualifiedCandidates.map(c => (
                  <tr key={c.id || c.link_id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm font-semibold text-slate-700">{c.candidate_name}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{c.interview_title}</td>
                    <td className="px-4 py-3 text-sm"><strong className="text-emerald-600">{Number(c.score || 0).toFixed(1)}/100</strong></td>
                    <td className="px-4 py-3 text-sm text-slate-600">{new Date(c.created_at).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-right pr-6">
                      <button
                        onClick={() => dispatch(handleOpenScorecard(c))}
                        className="px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded hover:bg-emerald-600 cursor-pointer border-none flex items-center gap-1 ml-auto"
                      >
                        View Scorecard <ChevronRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
