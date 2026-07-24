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
  async (arg = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const adminFilter = typeof arg === 'object' && arg !== null ? arg.adminFilter ?? null : arg
      const summaryOnly = typeof arg === 'object' && arg !== null ? !!arg.summaryOnly : false
      const params = { summary_only: summaryOnly }
      if (adminFilter) params.adminId = adminFilter
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

// ─── Recruitment Funnel Thunk ───────────────────────────────────────────────
export const loadRecruitmentFunnel = createAsyncThunk(
  'dashboard/loadRecruitmentFunnel',
  async (adminFilter = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const params = adminFilter ? { adminId: adminFilter } : {}
      const res = await axios.get(`${API_BASE_URL}/superadmin/recruitment-funnel`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      })
      return res.data.funnel ?? []
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to load funnel'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

// ─── Platform Analytics Thunk ───────────────────────────────────────────────
export const loadPlatformAnalytics = createAsyncThunk(
  'dashboard/loadPlatformAnalytics',
  async (adminFilter = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const params = adminFilter ? { adminId: adminFilter } : {}
      const res = await axios.get(`${API_BASE_URL}/superadmin/platform-analytics`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to load analytics'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

// ─── Live Sessions Thunk ────────────────────────────────────────────────────
export const loadLiveSessions = createAsyncThunk(
  'dashboard/loadLiveSessions',
  async (adminFilter = null, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const params = adminFilter ? { adminId: adminFilter } : {}
      const res = await axios.get(`${API_BASE_URL}/superadmin/live-sessions`, {
        headers: { Authorization: `Bearer ${token}` },
        params
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to load live sessions'
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
    funnelData: [],
    analyticsData: [],
    avgTimeToHire: null,
    selectedAdminFilter: null,
    ongoingLiveCount: 0,
    ongoingAlertCount: 0,
    ongoingSpeakingCount: 0,
    ongoingCodingCount: 0,
    ongoingMonitoredCount: 0,
    liveSessions: [],
    candidates: [],
    status: 'idle',
    error: null
  },
  reducers: {
    setSelectedAdminFilter: (state, action) => {
      state.selectedAdminFilter = action.payload
    },
    updateLiveSnapshot: (state, action) => {
      const { link_id, data } = action.payload;
      const sessionIndex = state.liveSessions.findIndex(s => s.link_id === link_id);
      if (sessionIndex !== -1) {
        const session = state.liveSessions[sessionIndex];
        state.liveSessions[sessionIndex] = {
          ...session,
          ...data,
          online: true,
          audio_level: data.audio_level ?? session.audio_level ?? 0,
          current_question: data.current_question ?? session.current_question
        };
        state.ongoingMonitoredCount = state.liveSessions.length
        state.ongoingLiveCount = state.liveSessions.filter(item => item.online).length
        state.ongoingAlertCount = state.liveSessions.filter(item => (item.proctoring_alerts || 0) > 0).length
        state.ongoingSpeakingCount = state.liveSessions.filter(item => (item.audio_level || 0) > 5).length
        state.ongoingCodingCount = state.liveSessions.filter(item => item.round_type === 'coding').length
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadDashboardData.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadDashboardData.fulfilled, (state, action) => {
        state.status = 'succeeded'
        const payload = typeof action.payload === 'object' && action.payload ? action.payload : {}
        state.dbStats = payload.dbStats || {
          total: '--', pending: '--', completed: '--', started: '--', expired: '--', selected: '--', rejected: '--', avg_score: '--', today: '--'
        }
        state.ongoingLiveCount = payload.ongoingLiveCount || 0
        state.ongoingAlertCount = payload.ongoingAlertCount || 0
        state.ongoingSpeakingCount = payload.ongoingSpeakingCount || 0
        state.ongoingCodingCount = payload.ongoingCodingCount || 0
        state.ongoingMonitoredCount = payload.ongoingMonitoredCount || 0
        state.liveSessions = payload.liveSessions || [];
        state.candidates = payload.candidates || [];
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
        const payload = typeof action.payload === 'object' && action.payload ? action.payload : {}
        const safeStats = payload.dbStats || {
          total: '--', pending: '--', completed: '--', started: '--', expired: '--', selected: '--', rejected: '--', avg_score: '--', today: '--'
        }
        state.superAdminStats = safeStats
        state.dbStats = safeStats
        state.ongoingLiveCount = payload.ongoingLiveCount || 0
        state.ongoingAlertCount = payload.ongoingAlertCount || 0
        state.ongoingSpeakingCount = payload.ongoingSpeakingCount || 0
        state.ongoingCodingCount = payload.ongoingCodingCount || 0
        state.ongoingMonitoredCount = payload.ongoingMonitoredCount || 0
        state.liveSessions = payload.liveSessions || [];
        state.candidates = payload.candidates || [];
      })
      .addCase(loadSuperAdminDashboard.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(loadRecruitmentFunnel.fulfilled, (state, action) => {
        state.funnelData = Array.isArray(action.payload) ? action.payload : []
      })
      .addCase(loadPlatformAnalytics.fulfilled, (state, action) => {
        const payload = action.payload || {}
        state.analyticsData = Array.isArray(payload.analytics) ? payload.analytics : []
        state.avgTimeToHire = payload.avg_time_to_hire_days ?? null
      })
      .addCase(loadLiveSessions.fulfilled, (state, action) => {
        const payload = action.payload || {}
        state.liveSessions = payload.liveSessions || []
        state.ongoingLiveCount = payload.ongoingLiveCount || 0
        state.ongoingMonitoredCount = payload.ongoingMonitoredCount || 0
        state.ongoingAlertCount = payload.ongoingAlertCount || 0
      })
  }
})

export const { setSelectedAdminFilter, updateLiveSnapshot } = dashboardSlice.actions
export default dashboardSlice.reducer
