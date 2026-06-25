import { configureStore, combineReducers } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import authReducer from './slices/authSlice'
import dashboardReducer from './slices/dashboardSlice'
import candidatesReducer from './slices/candidatesSlice'
import interviewReducer from './slices/interviewSlice'
import creditsReducer from './slices/creditsSlice'

const sessionStorageWrapper = {
  getItem: (key) => Promise.resolve(sessionStorage.getItem(key)),
  setItem: (key, value) => {
    sessionStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem: (key) => {
    sessionStorage.removeItem(key)
    return Promise.resolve()
  }
}

const authPersistConfig = {
  key: 'auth',
  storage: sessionStorageWrapper,
  whitelist: ['role', 'token', 'adminUser'] // only persist these fields
}

const appReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  dashboard: dashboardReducer,
  candidates: candidatesReducer,
  interview: interviewReducer,
  credits: creditsReducer
})

const rootReducer = (state, action) => {
  if (action.type === 'auth/logout') {
    // Clear session storage and reset entire Redux state
    sessionStorage.removeItem('auth')
    state = undefined
  }
  return appReducer(state, action)
}

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/FLUSH', 'persist/REHYDRATE', 'persist/PAUSE', 'persist/PERSIST', 'persist/PURGE', 'persist/REGISTER']
      }
    })
})

export const persistor = persistStore(store)
