import React, { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useDispatch } from 'react-redux'
import { Search, X, Download, Trash2, Video, Eye, Calendar, PhoneCall } from 'lucide-react'
import Button from '../Button'
import Badge from '../Badge'
import { initiateAICall } from '../../store/slices/candidatesSlice'

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
    <div className="flex flex-nowrap items-end gap-3 w-full overflow-x-auto pb-3">
      <div className="flex flex-col gap-1 flex-shrink-0">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">Search Candidate</label>
        <div className="relative flex items-center">
          <Search size={14} className="absolute left-3 text-slate-400" />
          <input
            type="text"
            className="bg-white border border-[#dbe4f0] text-[#0f172a] rounded-lg pr-3 py-1.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/15 w-full sm:w-[150px]"
            style={{ padding: '0.5rem 0.75rem 0.5rem 2.25rem' }}
            placeholder="Name or Email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0">
        <label className="text-[0.68rem] text-slate-500 font-bold uppercase">Date Range</label>
        <div className="flex items-center bg-white border border-[#dbe4f0] rounded-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-all overflow-hidden h-[36px]">
          <div className="relative flex items-center h-full">
            <input
              type="date"
              className="text-xs text-[#0f172a] outline-none bg-transparent h-full cursor-pointer w-[130px]"
              style={{ padding: '0 0.5rem' }}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="From Date"
            />
          </div>
          <div className="w-px h-4 bg-slate-200 mx-1"></div>
          <div className="relative flex items-center h-full">
            <input
              type="date"
              className="text-xs text-[#0f172a] outline-none bg-transparent h-full cursor-pointer w-[130px]"
              style={{ padding: '0 0.5rem' }}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="To Date"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0">
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

      <div className="flex flex-col gap-1 flex-shrink-0">
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

      <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
        <Button
          onClick={() => {
            setSearchTerm('')
            setStartDate('')
            setEndDate('')
            setStatusFilter('all')
            setSortBy('score')
          }}
          variant="secondary"
          className="flex-1 sm:flex-initial px-2.5 py-1.5 h-[36px] bg-rose-50 border-rose-200 text-rose-500 hover:bg-rose-100/50 justify-center"
          title="Clear Filters"
          icon={<X size={14} />}
        >
          Clear
        </Button>

        <Button
          onClick={handleExportExcel}
          variant="secondary"
          className="flex-1 sm:flex-initial px-2.5 py-1.5 h-[36px] bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100/50 justify-center"
          title="Export to Excel"
          icon={<Download size={14} />}
        >
          Export
        </Button>

        <Button
          onClick={(selectedIds || []).length > 0 ? handleBulkDelete : undefined}
          variant="danger"
          disabled={(selectedIds || []).length === 0}
          className={`flex-1 sm:flex-initial px-2.5 py-1.5 h-[36px] justify-center ${(selectedIds || []).length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          icon={<Trash2 size={14} />}
        >
          Delete {(selectedIds || []).length > 0 ? `(${(selectedIds || []).length})` : ''}
        </Button>
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
  const dispatch = useDispatch()
  const [rescheduleModal, setRescheduleModal] = useState({ isOpen: false, session: null, newStart: '', newEnd: '', isSubmitting: false })

  const handleCallClick = (session) => {
    const phoneNumber = prompt(`Enter phone number for ${session.candidate_name || 'Candidate'} (e.g. +1234567890):`, session.candidate_phone || '')
    if (phoneNumber) {
      dispatch(initiateAICall({ sessionId: session.link_id || session.id, phoneNumber }))
    }
  }

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
                              const toLocalISO = (dateStr) => {
                                const d = dateStr ? new Date(dateStr) : new Date();
                                d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
                                return d.toISOString().slice(0, 16);
                              };
                              const start = c.scheduled_start || c.created_at;
                              const end = c.expires_at || new Date(Date.now() + 86400000).toISOString();
                              
                              setRescheduleModal({ 
                                isOpen: true, 
                                session: c, 
                                newStart: toLocalISO(start), 
                                newEnd: toLocalISO(end), 
                                isSubmitting: false 
                              })
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
                        {(computedStatus === 'pending' || computedStatus === 'started') && (
                          <button
                            onClick={() => handleCallClick(c)}
                            className="flex items-center justify-center w-[28px] h-[28px] bg-indigo-50 text-indigo-500 hover:bg-indigo-500 hover:text-white rounded border border-indigo-100 transition-colors cursor-pointer shadow-sm"
                            title="Call Candidate (AI)"
                          >
                            <PhoneCall size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteSession(c.link_id || c.id)}
                          className="flex items-center justify-center w-[28px] h-[28px] bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded border border-rose-100 transition-colors cursor-pointer shadow-sm"
                          title="Delete Session"
                        >
                          <Trash2 size={14} />
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

      {rescheduleModal.isOpen && createPortal(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                Reschedule Session
              </h3>
              <button onClick={() => setRescheduleModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6">
              <div className="mb-4">
                <p className="text-sm text-slate-600 mb-1">Candidate:</p>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-800">{rescheduleModal.session?.candidate_name || 'Candidate'}</p>
                  {rescheduleModal.session && (
                    <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs border border-slate-200 font-mono">
                      ID: {rescheduleModal.session.candidate_id || rescheduleModal.session.id}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">START DATE & TIME</label>
                  <div className="relative">
                    <input 
                      type="datetime-local" 
                      value={rescheduleModal.newStart}
                      onChange={(e) => setRescheduleModal(prev => ({ ...prev, newStart: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">END DATE & TIME</label>
                  <div className="relative">
                    <input 
                      type="datetime-local" 
                      value={rescheduleModal.newEnd}
                      onChange={(e) => setRescheduleModal(prev => ({ ...prev, newEnd: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg p-2.5 text-sm text-slate-800 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 flex items-start gap-3">
                <div className="mt-0.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold flex-shrink-0">i</div>
                <div>Leave dates empty for immediate access (24h default expiry). If configured, candidates can only access the assessment within the specified window.</div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button 
                onClick={() => setRescheduleModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200 bg-slate-100 border-none cursor-pointer transition-colors"
                disabled={rescheduleModal.isSubmitting}
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  setRescheduleModal(prev => ({ ...prev, isSubmitting: true }))
                  const defaultStart = rescheduleModal.newStart ? new Date(rescheduleModal.newStart).getTime() : Date.now();
                  const body = new URLSearchParams({ 
                    new_expiry: rescheduleModal.newEnd ? new Date(rescheduleModal.newEnd).toISOString() : new Date(defaultStart + 86400000).toISOString()
                  });
                  if (rescheduleModal.newStart) {
                    body.append('new_start', new Date(rescheduleModal.newStart).toISOString());
                  }
                  
                  fetch(`${API_BASE_URL}/admin/sessions/${rescheduleModal.session?.link_id || rescheduleModal.session?.id}/reschedule`, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${sessionStorage.getItem("masterToken") || sessionStorage.getItem("adminToken") || sessionStorage.getItem("token")}`
                    },
                    body: body
                  }).then(res => {
                    if (res.ok) {
                      setRescheduleModal({ isOpen: false, session: null, newStart: '', newEnd: '', isSubmitting: false })
                      loadDashboardData();
                    } else {
                      res.json().then(data => {
                        alert(data.detail || "Failed to extend session.");
                        setRescheduleModal(prev => ({ ...prev, isSubmitting: false }))
                      }).catch(() => {
                        alert("Failed to extend session.");
                        setRescheduleModal(prev => ({ ...prev, isSubmitting: false }))
                      });
                    }
                  }).catch(err => {
                    alert("Network error: " + err.message);
                    setRescheduleModal(prev => ({ ...prev, isSubmitting: false }))
                  })
                }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-primary hover:bg-primary-hover border-none cursor-pointer transition-colors"
                disabled={rescheduleModal.isSubmitting}
              >
                {rescheduleModal.isSubmitting ? 'Rescheduling...' : 'Confirm Reschedule'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
