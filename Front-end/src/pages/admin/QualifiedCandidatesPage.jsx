import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { ChevronRight, Download } from 'lucide-react'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { getComputedStatus } from '../../utils/adminFormatters'
import { handleExportExcel } from '../../store/slices/candidatesSlice'
import { handleOpenScorecard } from '../../store/slices/interviewSlice'

export default function QualifiedCandidatesPage() {
  const dispatch = useDispatch()
  const candidates = useSelector(state => state.candidates.candidates) || []

  const qualifiedCandidates = candidates.filter(c => c.decision === 'selected')

  const handleExportAction = () => {
    if (qualifiedCandidates.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleExportExcel(qualifiedCandidates.map(c => ({
      ...c,
      status: getComputedStatus(c),
    }))))
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Qualified Candidates</h3>
          <p className="text-xs text-slate-500">Shortlisted for next hiring rounds</p>
        </div>
        <Button
          onClick={handleExportAction}
          variant="secondary"
          className="bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100/50"
          icon={<Download size={14} />}
        >
          Export Selected
        </Button>
      </div>

      <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm text-slate-800">
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
                  <td className="px-4 py-3 text-sm"><strong className="text-success">{Number(c.score || 0).toFixed(1)}/100</strong></td>
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
      </Card>
    </div>
  )
}
