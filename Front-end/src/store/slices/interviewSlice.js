import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { loadDashboardData } from './dashboardSlice'

export const handleOpenScorecard = createAsyncThunk(
  'interview/openScorecard',
  async (candidate, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const linkId = candidate.link_id || candidate.session_id || candidate.id
      const res = await axios.get(`${API_BASE_URL}/admin/interview/${linkId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return { candidate, detail: res.data }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to open scorecard'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

export const handleDeleteSession = createAsyncThunk(
  'interview/deleteSession',
  async (linkId, { getState, dispatch, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      await axios.delete(`${API_BASE_URL}/api/interview/session/${linkId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      alert("Session deleted successfully.")
      dispatch(loadDashboardData())
      return linkId
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to delete session'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

export const handleUpdateDecision = createAsyncThunk(
  'interview/updateDecision',
  async ({ linkId, decision }, { getState, dispatch, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      await axios.post(`${API_BASE_URL}/admin/update-decision`, {
        link_id: linkId,
        decision
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      alert(`Candidate marked as ${decision.toUpperCase()} successfully.`)
      dispatch(loadDashboardData())
      return { linkId, decision }
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to update decision'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

// ─── SuperAdmin Thunks ─────────────────────────────────
export const createSuperAdminInterview = createAsyncThunk(
  'interview/createSuperAdminInterview',
  async (interviewData, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const res = await axios.post(`${API_BASE_URL}/superadmin/interview/create`, interviewData, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to create interview'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

const interviewSlice = createSlice({
  name: 'interview',
  initialState: {
    liveResultsModalOpen: false,
    selectedCandidate: null,
    candidateDetail: null,
    loadingDetail: false,
    status: 'idle',
    error: null
  },
  reducers: {
    setLiveResultsModalOpen: (state, action) => {
      state.liveResultsModalOpen = action.payload
    },
    setSelectedCandidate: (state, action) => {
      state.selectedCandidate = action.payload
      if (!action.payload) {
        state.candidateDetail = null
      }
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(handleOpenScorecard.pending, (state, action) => {
        state.loadingDetail = true
        state.selectedCandidate = action.meta.arg
      })
      .addCase(handleOpenScorecard.fulfilled, (state, action) => {
        state.loadingDetail = false
        state.selectedCandidate = action.payload.candidate
        state.candidateDetail = action.payload.detail
      })
      .addCase(handleOpenScorecard.rejected, (state, action) => {
        state.loadingDetail = false
        state.error = action.payload
      })
      .addCase(handleDeleteSession.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(handleDeleteSession.fulfilled, (state) => {
        state.status = 'succeeded'
      })
      .addCase(handleDeleteSession.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
      .addCase(handleUpdateDecision.fulfilled, (state, action) => {
        if (state.selectedCandidate && (state.selectedCandidate.link_id === action.payload.linkId || state.selectedCandidate.id === action.payload.linkId)) {
          state.selectedCandidate.decision = action.payload.decision
        }
      })
      .addCase(createSuperAdminInterview.pending, (state) => {
        state.status = 'loading'
      })
      .addCase(createSuperAdminInterview.fulfilled, (state) => {
        state.status = 'succeeded'
      })
      .addCase(createSuperAdminInterview.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload
      })
  }
})

export const { setLiveResultsModalOpen, setSelectedCandidate } = interviewSlice.actions
export default interviewSlice.reducer
