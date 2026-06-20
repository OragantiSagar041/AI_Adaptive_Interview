import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import axios from 'axios'
import { API_BASE_URL as fallbackBaseUrl } from '../../apiConfig'

// ─── SuperAdmin Thunks ─────────────────────────────────
export const loadSuperAdminProfile = createAsyncThunk(
  'auth/loadSuperAdminProfile',
  async (_, { getState, rejectWithValue }) => {
    try {
      const { API_BASE_URL, token } = getState().auth
      const res = await axios.get(`${API_BASE_URL}/superadmin/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      return res.data
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to load superadmin profile'
      return rejectWithValue(typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg)
    }
  }
)

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    role: null,
    token: null,
    adminUser: null,
    API_BASE_URL: import.meta.env.VITE_API_BASE_URL || fallbackBaseUrl || ''
  },
  reducers: {
    setCredentials: (state, action) => {
      let role = action.payload.role
      if (role === 'super_admin') role = 'superadmin'
      if (role === 'tenant') role = 'admin'
      state.role = role
      state.token = action.payload.token
      state.adminUser = action.payload.adminUser
    },
    logout: (state) => {
      state.role = null
      state.token = null
      state.adminUser = null
    }
  },
  extraReducers: (builder) => {
    builder.addCase(loadSuperAdminProfile.fulfilled, (state, action) => {
      state.adminUser = action.payload
    })
  }
})

export const { setCredentials, logout } = authSlice.actions
export default authSlice.reducer
