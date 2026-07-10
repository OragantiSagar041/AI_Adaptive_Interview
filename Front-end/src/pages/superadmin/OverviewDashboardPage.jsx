import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { LayoutDashboard, RefreshCw } from 'lucide-react'
import axios from 'axios'
import Card from '../../components/Card'
import DashboardStats from '../../components/admin/DashboardStats'
import { CandidateFilters, CandidateTable } from '../../components/admin/AdminSubComponents'
import { getComputedStatus } from '../../utils/adminFormatters'

import { loadSuperAdminDashboard, setSelectedAdminFilter } from '../../store/slices/dashboardSlice'
import {
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setSelectedIds,
  setCurrentPage,
  handleSuperAdminExportExcel,
  handleSuperAdminBulkDelete
} from '../../store/slices/candidatesSlice'
import {
  setLiveResultsModalOpen,
  handleOpenScorecard,
  handleDeleteSession
} from '../../store/slices/interviewSlice'
import { handleSuperAdminUpdateCreditRequest } from '../../store/slices/creditsSlice'

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
      return Number(b.score ?? b.avg_score ?? 0) - Number(a.score ?? a.avg_score ?? 0)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })
}

export default function OverviewDashboardPage() {
  const navigate = useNavigate()
  const dispatch = useDispatch()

  // Redux Selectors
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const dbStats = useSelector(state => state.dashboard.superAdminStats || state.dashboard.dbStats)
  const ongoingLiveCount = useSelector(state => state.dashboard.ongoingLiveCount)
  const ongoingAlertCount = useSelector(state => state.dashboard.ongoingAlertCount)
  const ongoingSpeakingCount = useSelector(state => state.dashboard.ongoingSpeakingCount)
  const ongoingCodingCount = useSelector(state => state.dashboard.ongoingCodingCount)
  const ongoingMonitoredCount = useSelector(state => state.dashboard.ongoingMonitoredCount)
  const status = useSelector(state => state.dashboard.status)
  const error = useSelector(state => state.dashboard.error)
  const selectedAdminFilter = useSelector(state => state.dashboard.selectedAdminFilter)

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

  // Sub-admins local state
  const [subAdmins, setSubAdmins] = useState([])

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
    dispatch(loadSuperAdminDashboard(selectedAdminFilter))
    return () => {
      dispatch(setSelectedIds([]))
    }
  }, [dispatch, selectedAdminFilter])

  // Loading and error states as specified by Tailwind rules (Task 4)
  if (status === 'loading' && candidates.length === 0) {
    return (
      <div className="flex items-center justify-center h-[350px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg p-4 mt-4 max-w-xl mx-auto flex flex-col gap-3">
        <p>{error || 'Something went wrong. Please try again.'}</p>
        <button
          onClick={() => dispatch(loadSuperAdminDashboard(selectedAdminFilter))}
          className="bg-red-600 text-white font-bold text-xs uppercase px-4 py-2 rounded-lg hover:bg-red-700 w-fit cursor-pointer border-none"
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
    dispatch(handleSuperAdminExportExcel(filtered.map(c => ({
      ...c,
      status: getComputedStatus(c)
    }))))
  }

  const handleBulkDeleteAction = () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Are you sure you want to delete the ${selectedIds.length} selected sessions? This cannot be undone.`)) return
    dispatch(handleSuperAdminBulkDelete(selectedIds))
  }

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex justify-end items-center -mb-2 mt-2 px-2 z-10 relative">
        <div className="flex items-center gap-3 bg-white px-4 py-1.5 rounded-xl border border-slate-200 shadow-sm hover:border-slate-300 transition-colors">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Filter by Tenant Admin:</span>
          <select
            value={selectedAdminFilter || ''}
            onChange={(e) => dispatch(setSelectedAdminFilter(e.target.value || null))}
            className="w-full sm:w-auto rounded bg-slate-50 hover:bg-slate-100 px-3 py-1 text-xs text-slate-800 outline-none border border-transparent focus:border-indigo-500 transition-all font-semibold cursor-pointer"
          >
            <option value="">All Admins (Aggregated)</option>
            {subAdmins.map(adm => (
              <option key={adm.id || adm._id} value={adm.id || adm._id}>
                {adm.name || adm.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DashboardStats
        dbStats={dbStats}
        ongoingLiveCount={ongoingLiveCount}
        ongoingAlertCount={ongoingAlertCount}
        ongoingSpeakingCount={ongoingSpeakingCount}
        ongoingCodingCount={ongoingCodingCount}
        ongoingMonitoredCount={ongoingMonitoredCount}
        onOpenLiveResults={() => dispatch(setLiveResultsModalOpen(true))}
        onStatusFilter={(statusVal) => dispatch(setStatusFilter(statusVal))}
        onOpenQualified={() => navigate('/superadmin/qualified-candidates')}
      />

      <Card className="bg-white/80 backdrop-blur-2xl border border-white/60 p-0 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl flex flex-col gap-5 text-slate-800 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none" />
        <div className="flex flex-col gap-4 px-4 pt-4 sm:flex-row sm:justify-between sm:items-start sm:px-6 sm:pt-6 relative z-10">
          <div className="flex gap-4 items-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20">
              <LayoutDashboard size={22} />
            </div>
            <div>
              <h3 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-indigo-800">Global Operations</h3>
              <p className="text-sm text-slate-500 font-medium">SuperAdmin Dashboard Review</p>
            </div>
          </div>

          <CandidateFilters
            searchTerm={searchTerm}
            setSearchTerm={(term) => dispatch(setSearchTerm(term))}
            startDate={startDate}
            setStartDate={(date) => dispatch(setStartDate(date))}
            endDate={endDate}
            setEndDate={(date) => dispatch(setEndDate(date))}
            statusFilter={statusFilter}
            setStatusFilter={(statusVal) => dispatch(setStatusFilter(statusVal))}
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
          loadDashboardData={() => dispatch(loadSuperAdminDashboard(selectedAdminFilter))}
          API_BASE_URL={API_BASE_URL}
          totalPages={totalPages}
          startIndex={startIndex}
          endIndex={endIndex}
          totalItems={totalItems}
          currentPage={currentPage}
          setCurrentPage={(page) => dispatch(setCurrentPage(page))}
        />

        {creditRequests && creditRequests.length > 0 && (
          <div className="mt-8 border-t border-slate-100 pt-8 px-6 pb-6 bg-slate-50 rounded-b-xl">
            <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
              <i className="fas fa-layer-group text-indigo-500"></i> Pending Tenant Credit Requests
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse bg-white rounded-xl shadow-sm border border-slate-100">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                    <th className="p-4 rounded-tl-xl">Admin Name</th>
                    <th className="p-4">Requested Credits</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right rounded-tr-xl">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditRequests.map(req => (
                    <tr key={req.id || req._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-sm font-semibold text-slate-700">
                        {req.admin_name || req.admin_id} ({req.admin_email || 'No email'})
                      </td>
                      <td className="p-4 text-sm text-indigo-500 font-black">+{req.amount}</td>
                      <td className="p-4 text-sm text-slate-500">{new Date(req.created_at).toLocaleDateString()}</td>
                      <td className="p-4">
                        <span className="bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold px-2.5 py-1 rounded-full">Pending</span>
                      </td>
                      <td className="p-4 text-right">
                        <button onClick={() => dispatch(handleSuperAdminUpdateCreditRequest({ requestId: req.id || req._id, status: 'approved' }))} className="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/50 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold mr-2 shadow-sm transition-colors cursor-pointer">Approve</button>
                        <button onClick={() => dispatch(handleSuperAdminUpdateCreditRequest({ requestId: req.id || req._id, status: 'rejected' }))} className="text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/50 px-4 py-1.5 rounded-lg text-xs uppercase tracking-wider font-bold shadow-sm transition-colors cursor-pointer">Reject</button>
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
