import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'

export const loadDashboardData = createAsyncThunk(
  'dashboard/loadData',
  async (selectedAdminId, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, role, token } = getState().auth
      const url = `${API_BASE_URL}/dashboard${selectedAdminId ? `?admin_id=${selectedAdminId}` : ''}`
      const res = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Role': role
        }
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load dashboard'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

// ─── SuperAdmin Thunks ─────────────────────────────────
export const loadSuperAdminDashboard = createAsyncThunk(
  'dashboard/loadSuperAdminData',
  async (adminFilter = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const params = adminFilter ? { adminId: adminFilter } : {}
      const res = await axios.get(`${API_BASE_URL}/superadmin/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load superadmin dashboard'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState: {
    dbStats: {
      total: '--',
      pending: '--',
      completed: '--',
      started: '--',
      expired: '--',
      selected: '--',
      rejected: '--',
      avg_score: '--',
      today: '--'
    },
    superAdminStats: {
      total: '--',
      pending: '--',
      completed: '--',
      started: '--',
      expired: '--',
      selected: '--',
      rejected: '--',
      avg_score: '--',
      today: '--'
    },
    selectedAdminFilter: null,
    ongoingLiveCount: 0,
    ongoingAlertCount: 0,
    ongoingSpeakingCount: 0,
    ongoingCodingCount: 0,
    ongoingMonitoredCount: 0,
    liveSessions: [],
    status: 'idle',
    error: null
  },
  reducers: {
    setSelectedAdminFilter: (state, action) => {
      state.selectedAdminFilter = action.payload
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadDashboardData.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadDashboardData.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.dbStats = action.payload.dbStats
        state.ongoingLiveCount = action.payload.ongoingLiveCount
        state.ongoingAlertCount = action.payload.ongoingAlertCount
        state.ongoingSpeakingCount = action.payload.ongoingSpeakingCount
        state.ongoingCodingCount = action.payload.ongoingCodingCount
        state.ongoingMonitoredCount = action.payload.ongoingMonitoredCount
        state.liveSessions = action.payload.liveSessions || []
      })
      .addCase(loadDashboardData.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(loadSuperAdminDashboard.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadSuperAdminDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.superAdminStats = action.payload.dbStats
        state.dbStats = action.payload.dbStats
        state.ongoingLiveCount = action.payload.ongoingLiveCount
        state.ongoingAlertCount = action.payload.ongoingAlertCount
        state.ongoingSpeakingCount = action.payload.ongoingSpeakingCount
        state.ongoingCodingCount = action.payload.ongoingCodingCount
        state.ongoingMonitoredCount = action.payload.ongoingMonitoredCount
        state.liveSessions = action.payload.liveSessions || []
      })
      .addCase(loadSuperAdminDashboard.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
  }
})

export const { setSelectedAdminFilter } = dashboardSlice.actions
export default dashboardSlice.reducer
