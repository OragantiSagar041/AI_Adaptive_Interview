import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { loadDashboardData, loadSuperAdminDashboard } from './dashboardSlice'

export const handleUpdateCreditRequest = createAsyncThunk(
  'credits/updateRequest',
  async ({ requestId, status }, { getState, dispatch, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const res = await axios.patch(`${API_BASE_URL}/api/credits/request/${requestId}`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      dispatch(loadDashboardData())
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to update credit request'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

// ─── SuperAdmin Thunks ─────────────────────────────────
export const handleSuperAdminUpdateCreditRequest = createAsyncThunk(
  'credits/superAdminUpdateRequest',
  async ({ requestId, status }, { getState, dispatch, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const selectedAdminFilter = getState().dashboard.selectedAdminFilter
      const res = await axios.patch(`${API_BASE_URL}/superadmin/credits/request/${requestId}`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      dispatch(loadSuperAdminDashboard(selectedAdminFilter))
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to update credit request'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

const creditsSlice = createSlice({
  name: 'credits',
  initialState: {
    creditRequests: [],
    status: 'idle',
    error: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(loadDashboardData.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(loadDashboardData.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.creditRequests = action.payload.creditRequests || []
      })
      .addCase(loadDashboardData.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(handleUpdateCreditRequest.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(handleUpdateCreditRequest.fulfilled, (state) => {
        state.status = 'succeeded'
      })
      .addCase(handleUpdateCreditRequest.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(handleSuperAdminUpdateCreditRequest.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(handleSuperAdminUpdateCreditRequest.fulfilled, (state) => {
        state.status = 'succeeded'
      })
      .addCase(handleSuperAdminUpdateCreditRequest.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
  }
})

export default creditsSlice.reducer
