import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { ChevronRight, Download } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { getComputedStatus } from '../../utils/adminFormatters'
import { handleExportExcel, loadAdminRejectedCandidates } from '../../store/slices/candidatesSlice'
import { handleOpenScorecard } from '../../store/slices/interviewSlice'

export default function RejectedCandidatesPage() {
  const dispatch = useDispatch()
  const candidates = useSelector(state => state.candidates.candidates) || []
  const status = useSelector(state => state.candidates.status)
  const error = useSelector(state => state.candidates.error)

  const [pipelineFilter, setPipelineFilter] = useState('all')

  useEffect(() => {
    dispatch(loadAdminRejectedCandidates({ pipeline: pipelineFilter }))
  }, [dispatch, pipelineFilter])

  const rejectedCandidates = candidates.filter(c => c.decision === 'rejected')

  const handleExportAction = () => {
    if (rejectedCandidates.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleExportExcel(rejectedCandidates.map(c => ({
      ...c,
      status: getComputedStatus(c),
    }))))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Rejected Candidates</h3>
          <p className="text-xs text-slate-500">Unsuccessful applicant profiles</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      )}

      {status === 'failed' && (
        <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-4 mt-4">
          {error || 'Something went wrong. Please try again.'}
        </div>
      )}

      <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm text-slate-800">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e5edf7] bg-slate-50">
              <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Candidate Name</th>
              <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Interview Profile</th>
              <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Evaluation Score</th>
              <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider">Date Reviewed</th>
              <th className="py-3 px-4 font-semibold text-xs text-slate-500 uppercase tracking-wider text-right pr-6">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f7]">
            {rejectedCandidates.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-8 text-slate-400 text-sm">No rejected candidates yet.</td>
              </tr>
            ) : (
              rejectedCandidates.map(c => (
                <tr key={c.id || c.link_id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">{c.candidate_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.interview_title}</td>
                  <td className="px-4 py-3 text-sm"><strong className="text-rose-500">{Number(c.score || 0).toFixed(1)}/100</strong></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{new Date(c.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-sm text-right pr-6">
                    <button
                      onClick={() => dispatch(handleOpenScorecard(c))}
                      className="px-3 py-1.5 bg-rose-500 text-white text-xs font-bold rounded hover:bg-rose-600 cursor-pointer border-none flex items-center gap-1 ml-auto"
                    >
                      View Scorecard <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
