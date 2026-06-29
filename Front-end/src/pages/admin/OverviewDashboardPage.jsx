import React from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, RefreshCw } from 'lucide-react'
import Card from '../../components/Card'
import DashboardStats from '../../components/admin/DashboardStats'
import { CandidateFilters, CandidateTable } from '../../components/admin/AdminSubComponents'
import { getComputedStatus } from '../../utils/adminFormatters'

import { loadDashboardData } from '../../store/slices/dashboardSlice'
import {
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setSelectedIds,
  setCurrentPage,
  handleExportExcel,
  handleBulkDelete
} from '../../store/slices/candidatesSlice'
import {
  setLiveResultsModalOpen,
  handleOpenScorecard,
  handleDeleteSession
} from '../../store/slices/interviewSlice'
import { handleUpdateCreditRequest } from '../../store/slices/creditsSlice'

const getFilteredCandidates = (candidatesState) => {
  const { candidates, searchTerm, statusFilter, startDate, endDate, sortBy } = candidatesState
  const filtered = candidates.filter(c => {
    const name = (c.candidate_name || '').toLowerCase()
    const email = (c.candidate_email || '').toLowerCase()
    const position = (c.interview_title || '').toLowerCase()
    const query = searchTerm.toLowerCase()

    const matchesSearch = name.includes(query) || email.includes(query) || position.includes(query)
    if (!matchesSearch) return false

    const computedStatus = getComputedStatus(c)
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        if (computedStatus !== 'pending' && computedStatus !== 'started') return false
      } else if (computedStatus !== statusFilter) {
        return false
      }
    }

    const createdDate = new Date(c.created_at)
    if (startDate && createdDate < new Date(startDate)) return false
    if (endDate) {
      const endDateTime = new Date(endDate)
      endDateTime.setHours(23, 59, 59, 999)
      if (createdDate > endDateTime) return false
    }

    return true
  })

  return [...filtered].sort((a, b) => {
    if (sortBy === 'score') {
      return Number(b.score || 0) - Number(a.score || 0)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export default function OverviewDashboardPage(props) {
  const navigate = useNavigate()
  const dispatch = useDispatch()

  // Redux Selectors
  const authRole = useSelector(state => state.auth.role)
  const role = props.role || authRole || 'admin'
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const dbStats = useSelector(state => state.dashboard.dbStats)
  const ongoingLiveCount = useSelector(state => state.dashboard.ongoingLiveCount)
  const ongoingAlertCount = useSelector(state => state.dashboard.ongoingAlertCount)
  const ongoingSpeakingCount = useSelector(state => state.dashboard.ongoingSpeakingCount)
  const ongoingCodingCount = useSelector(state => state.dashboard.ongoingCodingCount)
  const ongoingMonitoredCount = useSelector(state => state.dashboard.ongoingMonitoredCount)
  const dashboardStatus = useSelector(state => state.dashboard.status)
  const dashboardError = useSelector(state => state.dashboard.error)

  const candidates = useSelector(state => state.candidates.candidates)
  const paginatedCandidates = useSelector(state => state.candidates.paginatedCandidates)
  const selectedIds = useSelector(state => state.candidates.selectedIds)
  const searchTerm = useSelector(state => state.candidates.searchTerm)
  const startDate = useSelector(state => state.candidates.startDate)
  const endDate = useSelector(state => state.candidates.endDate)
  const statusFilter = useSelector(state => state.candidates.statusFilter)
  const sortBy = useSelector(state => state.candidates.sortBy)
  const totalPages = useSelector(state => state.candidates.totalPages)
  const startIndex = useSelector(state => state.candidates.startIndex)
  const endIndex = useSelector(state => state.candidates.endIndex)
  const totalItems = useSelector(state => state.candidates.totalItems)
  const currentPage = useSelector(state => state.candidates.currentPage)

  const creditRequests = useSelector(state => state.credits.creditRequests)

  // Loading spinner
  if (dashboardStatus === 'loading' && candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] gap-3">
        <RefreshCw size={36} className="animate-spin text-indigo-600" />
        <p className="text-slate-500 font-semibold text-sm">Loading dashboard workspace...</p>
      </div>
    )
  }

  // Error card
  if (dashboardStatus === 'failed') {
    return (
      <div className="bg-rose-50 border border-rose-200 text-rose-800 p-6 rounded-2xl flex flex-col gap-3 max-w-xl mx-auto my-12 shadow-sm">
        <h3 className="text-lg font-bold">Failed to load dashboard data</h3>
        <p className="text-sm text-rose-600">{dashboardError || 'An unknown error occurred while contacting the server.'}</p>
        <button
          onClick={() => dispatch(loadDashboardData())}
          className="mt-2 bg-rose-600 text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-xl hover:bg-rose-700 transition-colors w-fit border-none cursor-pointer"
        >
          Try Again
        </button>
      </div>
    )
  }

  const handleExportExcelAction = () => {
    const filtered = getFilteredCandidates({ candidates, searchTerm, statusFilter, startDate, endDate, sortBy })
    if (filtered.length === 0) {
      alert("No data available to export.")
      return
    }
    dispatch(handleExportExcel(filtered.map(c => ({
      ...c,
      status: getComputedStatus(c)
    }))))
  }

  const handleBulkDeleteAction = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected sessions? This cannot be undone.`)) return
    dispatch(handleBulkDelete(selectedIds))
  }

  return (
    <div className="flex flex-col gap-6">
      <DashboardStats
        dbStats={dbStats}
        ongoingLiveCount={ongoingLiveCount}
        ongoingAlertCount={ongoingAlertCount}
        ongoingSpeakingCount={ongoingSpeakingCount}
        ongoingCodingCount={ongoingCodingCount}
        ongoingMonitoredCount={ongoingMonitoredCount}
        onOpenLiveResults={() => dispatch(setLiveResultsModalOpen(true))}
        onStatusFilter={(status) => {
          dispatch(setStatusFilter(status))
        }}
        onOpenQualified={() => {
          if (role === 'superadmin' || role === 'super_admin') {
            navigate('/super-admin?tab=qualified')
          } else {
            navigate('/admin/qualified-candidates')
          }
        }}
      />
      <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] p-0 shadow-sm flex flex-col gap-5 text-slate-800">
        {/* Panel Header */}
        <div className="flex justify-between items-start flex-wrap gap-4 px-6 pt-6">
          <div className="flex gap-3 items-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/8 text-primary">
              <LayoutDashboard size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">Dashboard Overview</h3>
              <p className="text-xs text-slate-500">Track ongoing and completed interviews</p>
            </div>
          </div>

          {/* Filters Form Row */}
          <CandidateFilters
            searchTerm={searchTerm}
            setSearchTerm={(term) => dispatch(setSearchTerm(term))}
            startDate={startDate}
            setStartDate={(date) => dispatch(setStartDate(date))}
            endDate={endDate}
            setEndDate={(date) => dispatch(setEndDate(date))}
            statusFilter={statusFilter}
            setStatusFilter={(status) => dispatch(setStatusFilter(status))}
            sortBy={sortBy}
            setSortBy={(sort) => dispatch(setSortBy(sort))}
            handleExportExcel={handleExportExcelAction}
            selectedIds={selectedIds}
            handleBulkDelete={handleBulkDeleteAction}
          />
        </div>

        <CandidateTable
          paginatedCandidates={paginatedCandidates}
          selectedIds={selectedIds}
          setSelectedIds={(ids) => dispatch(setSelectedIds(ids))}
          getComputedStatus={getComputedStatus}
          handleOpenScorecard={(c) => dispatch(handleOpenScorecard(c))}
          handleDeleteSession={(id) => {
            if (!confirm("Are you sure you want to delete this candidate's interview session? This cannot be undone.")) return
            dispatch(handleDeleteSession(id))
          }}
          loadDashboardData={() => dispatch(loadDashboardData())}
          API_BASE_URL={API_BASE_URL}
          totalPages={totalPages}
          startIndex={startIndex}
          endIndex={endIndex}
          totalItems={totalItems}
          currentPage={currentPage}
          setCurrentPage={(page) => dispatch(setCurrentPage(page))}
        />

        {(role === 'superadmin' || role === 'super_admin') && creditRequests && creditRequests.length > 0 && (
          <div className="mt-8 border-t border-slate-100 pt-8 px-6 pb-6 bg-slate-50 rounded-b-xl">
            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i className="fas fa-layer-group text-[#6366f1]"></i> Pending Credit Requests
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse bg-white rounded-xl shadow-sm border border-slate-100">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="p-4 rounded-tl-xl">Admin ID</th>
                    <th className="p-4">Requested Credits</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right rounded-tr-xl">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditRequests.map(req => (
                    <tr key={req.id || req._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm font-semibold text-slate-700">{req.admin_id}</td>
                      <td className="p-4 text-sm text-[#6366f1] font-black">+{req.amount || req.requested_amount}</td>
                      <td className="p-4 text-sm text-slate-500">{new Date(req.created_at).toLocaleDateString()}</td>
                      <td className="p-4">
                        <span className="bg-amber-100/50 border border-amber-200 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full shadow-sm">Pending</span>
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => dispatch(handleUpdateCreditRequest({ requestId: req.id || req._id, status: 'approved' }))} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold mr-2 shadow-sm transition-colors cursor-pointer">Approve</button>
                        <button onClick={() => dispatch(handleUpdateCreditRequest({ requestId: req.id || req._id, status: 'rejected' }))} className="text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold shadow-sm transition-colors cursor-pointer">Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
