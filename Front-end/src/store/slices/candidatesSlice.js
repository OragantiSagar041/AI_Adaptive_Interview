import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { getComputedStatus } from '../../utils/adminFormatters'
import { loadDashboardData, loadSuperAdminDashboard } from './dashboardSlice'

export const handleExportExcel = createAsyncThunk(
  'candidates/exportExcel',
  async (candidatesToExport, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const res = await axios.post(`${API_BASE_URL}/api/export/excel`, { candidates: candidatesToExport }, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'Interview_Candidates_Report.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return true
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to export excel'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

export const handleBulkDelete = createAsyncThunk(
  'candidates/bulkDelete',
  async (ids, { getState, dispatch, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const res = await axios.delete(`${API_BASE_URL}/api/candidates/bulk`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ids }
      })
      alert(`Deleted ${ids.length} sessions successfully.`)
      dispatch(loadDashboardData())
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to bulk delete candidates'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

// ─── SuperAdmin Thunks ─────────────────────────────────
export const loadSuperAdminQualifiedCandidates = createAsyncThunk(
  'candidates/loadSuperAdminQualifiedCandidates',
  async (adminFilter = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const params = adminFilter ? { adminId: adminFilter } : {}
      const res = await axios.get(`${API_BASE_URL}/superadmin/candidates/qualified`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load qualified candidates'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

export const loadSuperAdminRejectedCandidates = createAsyncThunk(
  'candidates/loadSuperAdminRejectedCandidates',
  async (adminFilter = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const params = adminFilter ? { adminId: adminFilter } : {}
      const res = await axios.get(`${API_BASE_URL}/superadmin/candidates/rejected`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load rejected candidates'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

export const handleSuperAdminBulkDelete = createAsyncThunk(
  'candidates/superAdminBulkDelete',
  async (ids, { getState, dispatch, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const selectedAdminFilter = getState().dashboard.selectedAdminFilter
      const res = await axios.delete(`${API_BASE_URL}/superadmin/candidates/bulk`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { ids }
      })
      alert(`Deleted ${ids.length} sessions successfully.`)
      dispatch(loadSuperAdminDashboard(selectedAdminFilter))
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to bulk delete candidates'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

export const handleSuperAdminExportExcel = createAsyncThunk(
  'candidates/superAdminExportExcel',
  async (candidatesToExport, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const res = await axios.post(`${API_BASE_URL}/superadmin/export/excel`, { candidates: candidatesToExport }, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'Interview_Candidates_Report.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      return true
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to export excel'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

function recomputeFilteredCandidates(state) {
  const filtered = state.candidates.filter(c => {
    const name = (c.candidate_name || '').toLowerCase()
    const email = (c.candidate_email || '').toLowerCase()
    const position = (c.interview_title || '').toLowerCase()
    const query = state.searchTerm.toLowerCase()

    const matchesSearch = name.includes(query) || email.includes(query) || position.includes(query)
    if (!matchesSearch) return false

    const computedStatus = getComputedStatus(c)
    if (state.statusFilter !== 'all') {
      if (state.statusFilter === 'pending') {
        if (computedStatus !== 'pending' && computedStatus !== 'started') return false
      } else if (computedStatus !== state.statusFilter) {
        return false
      }
    }

    const createdDate = new Date(c.created_at)
    if (state.startDate && createdDate < new Date(state.startDate)) return false
    if (state.endDate) {
      const endDateTime = new Date(state.endDate)
      endDateTime.setHours(23, 59, 59, 999)
      if (createdDate > endDateTime) return false
    }

    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (state.sortBy === 'score') {
      return Number(b.score ?? b.avg_score ?? 0) - Number(a.score ?? a.avg_score ?? 0)
    }
    return new Date(b.created_at) - new Date(a.created_at)
  })

  const pageSize = 10
  state.totalItems = sorted.length
  state.totalPages = Math.ceil(state.totalItems / pageSize)
  if (state.currentPage > state.totalPages && state.totalPages > 0) {
    state.currentPage = state.totalPages
  }
  state.startIndex = (state.currentPage - 1) * pageSize
  state.endIndex = Math.min(state.startIndex + pageSize, state.totalItems)
  state.paginatedCandidates = sorted.slice(state.startIndex, state.endIndex)
}

const candidatesSlice = createSlice({
  name: 'candidates',
  initialState: {
    candidates: [],
    paginatedCandidates: [],
    selectedIds: [],
    searchTerm: '',
    startDate: '',
    endDate: '',
    statusFilter: 'all',
    sortBy: 'score',
    totalPages: 1,
    startIndex: 0,
    endIndex: 0,
    totalItems: 0,
    currentPage: 1,
    status: 'idle',
    error: null
  },
  reducers: {
    setSearchTerm: (state, action) => {
      state.searchTerm = action.payload
      state.currentPage = 1
      recomputeFilteredCandidates(state)
    },
    setStartDate: (state, action) => {
      state.startDate = action.payload
      state.currentPage = 1
      recomputeFilteredCandidates(state)
    },
    setEndDate: (state, action) => {
      state.endDate = action.payload
      state.currentPage = 1
      recomputeFilteredCandidates(state)
    },
    setStatusFilter: (state, action) => {
      state.statusFilter = action.payload
      state.currentPage = 1
      recomputeFilteredCandidates(state)
    },
    setSortBy: (state, action) => {
      state.sortBy = action.payload
      state.currentPage = 1
      recomputeFilteredCandidates(state)
    },
    setSelectedIds: (state, action) => {
      state.selectedIds = action.payload
    },
    setCurrentPage: (state, action) => {
      state.currentPage = action.payload
      recomputeFilteredCandidates(state)
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase('auth/logout', (state) => {
        state.selectedIds = []
        state.candidates = []
        state.paginatedCandidates = []
        state.searchTerm = ''
      })
      .addCase(loadDashboardData.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadDashboardData.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.candidates = action.payload.candidates || []
        recomputeFilteredCandidates(state)
      })
      .addCase(loadDashboardData.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(handleBulkDelete.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(handleBulkDelete.fulfilled, (state) => {
        state.status = 'succeeded'
        state.selectedIds = []
      })
      .addCase(handleBulkDelete.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(loadSuperAdminDashboard.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadSuperAdminDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.candidates = action.payload.candidates || []
        recomputeFilteredCandidates(state)
      })
      .addCase(loadSuperAdminDashboard.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(loadSuperAdminQualifiedCandidates.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadSuperAdminQualifiedCandidates.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.candidates = action.payload || []
        recomputeFilteredCandidates(state)
      })
      .addCase(loadSuperAdminQualifiedCandidates.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(loadSuperAdminRejectedCandidates.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadSuperAdminRejectedCandidates.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.candidates = action.payload || []
        recomputeFilteredCandidates(state)
      })
      .addCase(loadSuperAdminRejectedCandidates.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(handleSuperAdminBulkDelete.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(handleSuperAdminBulkDelete.fulfilled, (state) => {
        state.status = 'succeeded'
        state.selectedIds = []
      })
      .addCase(handleSuperAdminBulkDelete.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
  }
})

export const {
  setSearchTerm,
  setStartDate,
  setEndDate,
  setStatusFilter,
  setSortBy,
  setSelectedIds,
  setCurrentPage
} = candidatesSlice.actions

export default candidatesSlice.reducer
