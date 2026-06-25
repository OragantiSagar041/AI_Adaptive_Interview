import React from 'react'
import { Search, X, Download, Trash2, Video, Eye } from 'lucide-react'
import Button from '../Button'
import Badge from '../Badge'

export function CandidateFilters({
  searchTerm,
  setSearchTerm,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  handleExportExcel,
  selectedIds,
  handleBulkDelete
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end w-full sm:w-auto ml-auto">
      <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">Search Candidate</label>
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-slate-400" />
          <input
            type="text"
            className="bg-white border border-[#dbe4f0] text-[#0f172a] rounded-lg pr-3 py-1.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 w-full sm:w-[180px]"
            style={{ padding: '0.5rem 0.75rem 0.5rem 2.25rem' }}
            placeholder="Name or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">From</label>
        <input
          type="date"
          className="bg-white border border-[#dbe4f0] text-[#0f172a] rounded-lg px-3 py-1.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 w-full sm:w-[130px]"
          style={{ padding: '0.5rem 0.75rem' }}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">To</label>
        <input
          type="date"
          className="bg-white border border-[#dbe4f0] text-[#0f172a] rounded-lg px-3 py-1.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 w-full sm:w-[130px]"
          style={{ padding: '0.5rem 0.75rem' }}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">Status</label>
        <select
          className="bg-white border border-[#dbe4f0] text-[#0f172a] rounded-lg px-3 py-1.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 w-full sm:w-[130px] cursor-pointer"
          style={{ padding: '0.5rem 1.75rem 0.5rem 0.75rem' }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="started">In Progress</option>
          <option value="expired">Not Attended</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">Sort By</label>
        <select
          className="bg-white border border-[#dbe4f0] text-[#0f172a] rounded-lg px-3 py-1.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 w-full sm:w-[110px] cursor-pointer"
          style={{ padding: '0.5rem 1.75rem 0.5rem 0.75rem' }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="score">Top Score</option>
          <option value="date">Newest First</option>
        </select>
      </div>

      <div className="flex items-center gap-2 col-span-2 sm:col-span-1 w-full sm:w-auto mt-2 sm:mt-0">
        <Button
          onClick={() => {
            setSearchTerm('')
            setStartDate('')
            setEndDate('')
            setStatusFilter('all')
            setSortBy('score')
          }}
          variant="secondary"
          className="flex-1 sm:flex-initial px-3 py-1.5 h-[36px] bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100/50 justify-center"
          title="Clear Filters"
          icon={<X size={14} />}
        />

        <Button
          onClick={handleExportExcel}
          variant="secondary"
          className="flex-1 sm:flex-initial px-4 py-1.5 h-[36px] bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100/50 justify-center"
          title="Export to Excel"
          icon={<Download size={14} />}
        >
          Export
        </Button>

        {selectedIds.length > 0 && (
          <Button
            onClick={handleBulkDelete}
            variant="danger"
            className="flex-1 sm:flex-initial px-4 py-1.5 h-[36px] justify-center"
            icon={<Trash2 size={14} />}
          >
            Delete ({selectedIds.length})
          </Button>
        )}
      </div>
    </div>
  )
}

export function CandidateTable({
  paginatedCandidates,
  selectedIds,
  setSelectedIds,
  getComputedStatus,
  handleOpenScorecard,
  handleDeleteSession,
  loadDashboardData,
  API_BASE_URL,
  totalPages,
  startIndex,
  endIndex,
  totalItems,
  currentPage,
  setCurrentPage
}) {
  return (
    <>
      <div className="overflow-x-auto w-full">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-[#e5edf7]">
              <th className="w-10 pl-6 py-3.5 bg-slate-50 text-slate-500 font-semibold uppercase text-[0.72rem] tracking-wider">
                <input
                  type="checkbox"
                  checked={paginatedCandidates.length > 0 && paginatedCandidates.every(c => selectedIds.includes(c.link_id || c.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      const pageIds = paginatedCandidates.map(c => c.link_id || c.id)
                      setSelectedIds(Array.from(new Set([...selectedIds, ...pageIds])))
                    } else {
                      const pageIds = paginatedCandidates.map(c => c.link_id || c.id)
                      setSelectedIds(selectedIds.filter(id => !pageIds.includes(id)))
                    }
                  }}
                  className="cursor-pointer"
                />
              </th>
              <th className="py-3.5 bg-slate-50 text-slate-500 font-semibold uppercase text-[0.72rem] tracking-wider px-4">Candidate</th>
              <th className="py-3.5 bg-slate-50 text-slate-500 font-semibold uppercase text-[0.72rem] tracking-wider px-4">Date Created</th>
              <th className="py-3.5 bg-slate-50 text-slate-500 font-semibold uppercase text-[0.72rem] tracking-wider px-4">Status</th>
              <th className="py-3.5 bg-slate-50 text-slate-500 font-semibold uppercase text-[0.72rem] tracking-wider px-4">Score</th>
              <th className="py-3.5 bg-slate-50 text-slate-500 font-semibold uppercase text-[0.72rem] tracking-wider pr-6 text-right px-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef2f7]">
            {paginatedCandidates.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-10 text-slate-400 text-sm">No interview sessions found.</td>
              </tr>
            ) : (
              paginatedCandidates.map(c => {
                const computedStatus = getComputedStatus(c)
                const isSelected = selectedIds.includes(c.link_id || c.id)

                return (
                  <tr key={c.link_id || c.id} className="hover:bg-slate-50/50">
                    <td className="pl-6 py-3.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds([...selectedIds, c.link_id || c.id])
                          } else {
                            setSelectedIds(selectedIds.filter(id => id !== (c.link_id || c.id)))
                          }
                        }}
                        className="cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-slate-700">
                      <div className="flex items-center gap-1.5">
                        {c.candidate_name}
                        {c.recording_url && <Video size={14} className="text-primary" />}
                        {c.decision === 'selected' && (
                          <span className="text-[0.65rem] bg-success text-white px-1.5 py-0.5 rounded font-extrabold">SELECTED</span>
                        )}
                        {c.decision === 'rejected' && (
                          <span className="text-[0.65rem] bg-rose-500 text-white px-1.5 py-0.5 rounded font-extrabold">REJECTED</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-normal mt-0.5">
                        {c.candidate_email || 'No email'} &bull; {c.interview_title}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-slate-600">
                      {new Date(c.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      <Badge variant={computedStatus} text={computedStatus === 'expired' ? 'NOT ATTENDED' : computedStatus} />
                    </td>
                    <td className="px-4 py-3.5 text-sm">
                      {(() => {
                        const score = c.score ?? c.avg_score
                        return computedStatus === 'completed' && score != null ? (
                          <strong className={Number(score) >= 60 ? 'text-success' : 'text-rose-500'}>
                            {Number(score).toFixed(1)}/100
                          </strong>
                        ) : '-'
                      })()}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-right pr-6">
                      <div className="inline-flex items-center gap-2">
                        {computedStatus === 'completed' && (
                          <button
                            onClick={() => handleOpenScorecard(c)}
                            className="px-2.5 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded hover:bg-emerald-600 transition-colors flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Eye size={12} /> View Results
                          </button>
                        )}
                        {computedStatus === 'started' && (
                          <button
                            onClick={() => handleOpenScorecard(c)}
                            className="px-2.5 py-1.5 bg-primary text-white text-xs font-bold rounded hover:bg-primary-hover transition-colors flex items-center gap-1 cursor-pointer border-none"
                          >
                            <Video size={12} /> Live Monitor
                          </button>
                        )}
                        {computedStatus === 'expired' && (
                          <button
                            onClick={() => {
                              const extendDays = prompt("Reschedule: Enter extra number of days to extend this session:")
                              if (extendDays && !isNaN(extendDays)) {
                                fetch(`${API_BASE_URL}/admin/sessions/${c.link_id || c.id}/reschedule`, {
                                  method: 'POST',
                                  body: new URLSearchParams({ new_expiry: new Date(Date.now() + Number(extendDays) * 24 * 60 * 60 * 1000).toISOString() })
                                }).then(res => {
                                  if (res.ok) { alert("Session extended successfully!"); loadDashboardData(); }
                                  else { alert("Failed to extend session."); }
                                })
                              }
                            }}
                            className="px-2.5 py-1.5 bg-primary text-white text-xs font-bold rounded hover:bg-primary-hover transition-colors cursor-pointer border-none"
                          >
                            Reschedule
                          </button>
                        )}
                        {computedStatus === 'pending' && (
                          <button
                            onClick={(e) => {
                              navigator.clipboard.writeText(`${window.location.origin}/interview?session_id=${c.link_id || c.id}`)
                              const btn = e.currentTarget
                              btn.innerText = "Copied!"
                              setTimeout(() => { btn.innerHTML = "Copy Link" }, 1500)
                            }}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200/80 text-slate-600 border border-slate-200 text-xs font-bold rounded transition-colors cursor-pointer"
                          >
                            Copy Link
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSession(c.link_id || c.id)}
                          className="bg-transparent border-none text-rose-500 hover:text-rose-600 cursor-pointer p-1 transition-colors"
                          title="Delete Session"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center px-6 py-4 border-t border-[#e5edf7]">
          <span className="text-xs text-slate-500">Showing {startIndex + 1}-{endIndex} of {totalItems} candidates</span>
          <div className="flex gap-2">
            <Button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              variant="secondary"
              className="px-3 py-1.5 text-xs h-[32px]"
            >
              Prev
            </Button>
            <Button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              variant="secondary"
              className="px-3 py-1.5 text-xs h-[32px]"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
